import { ConflictException } from '@nestjs/common';
import {
  RecommendationPriority,
  RecommendationSource,
  RecommendationStatus,
} from '../common/enums/situation-recommendation.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import { SituationRecommendationsService } from './situation-recommendations.service';

/**
 * FASE 01B.2 · Las recomendaciones de un caso CERRADO, ANULADO o RESOLVED
 * legado se conservan y se leen, pero no se modifican. La comprobación se hace
 * con la fila de la situación bloqueada, de modo que un cierre concurrente
 * (que ya ocurrió al leer) gana siempre.
 */
function buildService(situationStatus: SituationStatus) {
  const recommendation = {
    id: 'rec-1',
    situationId: 'situation-1',
    title: 'Revisar balanceador',
    description: 'Detalle',
    priority: RecommendationPriority.HIGH,
    status: RecommendationStatus.PENDING,
    generatedBy: RecommendationSource.AI,
    assignedUserId: null,
    assignedUser: null,
    dueAt: null,
    completedAt: null,
    executionNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const save = jest.fn((entity: unknown) => Promise.resolve(entity));
  const findOne = jest.fn().mockResolvedValue({
    id: 'situation-1',
    status: situationStatus,
  });
  const recommendationsRepository = {
    findByIdWithRelations: jest.fn().mockResolvedValue(recommendation),
    findBySituationId: jest.fn().mockResolvedValue([recommendation]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
  };
  const situationsRepository = {
    exist: jest.fn().mockResolvedValue(true),
    manager: {
      transaction: jest.fn(
        (
          work: (manager: {
            getRepository: (e: unknown) => unknown;
          }) => unknown,
        ) =>
          Promise.resolve(
            work({
              getRepository: (entity: unknown) =>
                entity === Situation ? { findOne } : { save },
            }),
          ),
      ),
    },
  };
  const service = new SituationRecommendationsService(
    recommendationsRepository as never,
    situationsRepository as never,
    { exist: jest.fn().mockResolvedValue(true) } as never,
    { createEntry: jest.fn() } as never,
  );
  return { service, save, findOne, recommendationsRepository };
}

describe('Fase 01B.2 · recomendaciones de casos congelados', () => {
  it.each([
    [SituationStatus.CLOSED, 'SITUATION_CLOSED'],
    [SituationStatus.RESOLVED, 'SITUATION_CLOSED'],
    [SituationStatus.CANCELLED, 'SITUATION_CANCELLED'],
  ])('%s: modificar → 409 %s y nada se guarda', async (status, code) => {
    const { service, save, findOne } = buildService(status);

    const error = await service
      .updateRecommendation(
        'rec-1',
        { status: RecommendationStatus.COMPLETED },
        'user-1',
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
    expect(save).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_read' } }),
    );
  });

  it.each([SituationStatus.CLOSED, SituationStatus.CANCELLED])(
    '%s: completar o crear también se bloquea',
    async (status) => {
      const { service, save } = buildService(status);

      await expect(
        service.completeRecommendation('rec-1', {}, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.createManualRecommendation(
          'situation-1',
          {
            title: 'Nueva',
            description: 'Detalle',
            priority: RecommendationPriority.LOW,
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('CLOSED: la lectura histórica sigue disponible', async () => {
    const { service } = buildService(SituationStatus.CLOSED);
    const list = await service.findBySituation('situation-1');
    expect(list.total).toBe(1);
    expect(list.items[0].title).toBe('Revisar balanceador');
  });

  it.each([SituationStatus.OPEN, SituationStatus.IN_PROGRESS])(
    '%s: la modificación se confirma',
    async (status) => {
      const { service, save } = buildService(status);
      await service.updateRecommendation(
        'rec-1',
        { priority: RecommendationPriority.CRITICAL },
        'user-1',
      );
      expect(save).toHaveBeenCalledTimes(1);
    },
  );
});
