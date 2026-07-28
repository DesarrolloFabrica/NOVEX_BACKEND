import { BadRequestException } from '@nestjs/common';
import { RecommendedActionExecutionStatus } from '../common/enums/operational.enums';
import { RecommendedActionsService } from './recommended-actions.service';

describe('RecommendedActionsService status rules', () => {
  const createService = () => {
    const actionsRepository = {
      findByIdWithRelations: jest.fn(),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      findOne: jest.fn(),
      create: jest.fn((input: unknown) => input),
      search: jest.fn(),
      countByStatuses: jest.fn(),
    };
    const eventsRepository = {
      findWithRelations: jest.fn(),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const areasRepository = {
      findCatalog: jest.fn(() => Promise.resolve([])),
    };

    const service = new RecommendedActionsService(
      actionsRepository as never,
      eventsRepository as never,
      areasRepository as never,
    );

    return { service, actionsRepository, eventsRepository };
  };

  it('exige motivo y observacion cuando no fue posible ejecutar', async () => {
    const { service, actionsRepository, eventsRepository } = createService();
    actionsRepository.findByIdWithRelations.mockResolvedValue({
      id: 'action-1',
      actionText: 'Ejecutar diagnostico',
      executionStatus: RecommendedActionExecutionStatus.PENDING,
      eventId: 'event-1',
      startedAt: null,
      completedAt: null,
      interpretation: { executiveReport: null },
      event: {
        title: 'Evento',
        sourceAreaId: 'a1',
        sourceAreaName: 'Tec',
        timelineEntries: [],
      },
      suggestedArea: null,
      suggestedAreaId: null,
      suggestedAreaName: 'Tecnologia',
      priority: 'high',
      reason: 'Motivo',
      recommendedTime: '30 minutos',
      interpretationId: 'interp-1',
      createdAt: new Date('2026-07-22T08:00:00.000Z'),
      updatedAt: new Date('2026-07-22T08:00:00.000Z'),
      statusNote: null,
      observation: null,
      assignedToUserName: null,
      actionIndex: 0,
    });

    await expect(
      service.updateStatus('action-1', {
        status: RecommendedActionExecutionStatus.NOT_EXECUTABLE,
        note: 'No fue autorizado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(eventsRepository.save).not.toHaveBeenCalled();
  });

  it('persiste observacion opcional al marcar ejecutada y escribe timeline', async () => {
    const { service, actionsRepository, eventsRepository } = createService();
    const action = {
      id: 'action-1',
      actionText: 'Ejecutar diagnostico',
      executionStatus: RecommendedActionExecutionStatus.IN_PROGRESS,
      eventId: 'event-1',
      startedAt: new Date('2026-07-22T08:10:00.000Z'),
      completedAt: null,
      interpretation: { executiveReport: null },
      event: {
        title: 'Evento',
        sourceAreaId: 'a1',
        sourceAreaName: 'Tec',
        timelineEntries: [],
      },
      suggestedArea: null,
      suggestedAreaId: null,
      suggestedAreaName: 'Tecnologia',
      priority: 'high' as const,
      reason: 'Motivo',
      recommendedTime: '30 minutos',
      interpretationId: 'interp-1',
      createdAt: new Date('2026-07-22T08:00:00.000Z'),
      updatedAt: new Date('2026-07-22T08:00:00.000Z'),
      statusNote: null,
      observation: null,
      assignedToUserName: null,
      actionIndex: 0,
    };

    actionsRepository.findByIdWithRelations
      .mockResolvedValueOnce(action)
      .mockResolvedValueOnce({
        ...action,
        executionStatus: RecommendedActionExecutionStatus.EXECUTED,
        observation: 'Completado sin hallazgos criticos',
        completedAt: new Date('2026-07-22T09:00:00.000Z'),
      });
    eventsRepository.findWithRelations.mockResolvedValue({
      id: 'event-1',
      timelineEntries: [],
      lastUpdateAt: null,
    });

    const result = await service.updateStatus('action-1', {
      status: RecommendedActionExecutionStatus.EXECUTED,
      observation: 'Completado sin hallazgos criticos',
      byUserName: 'Supervisor',
      byUserId: 'user-1',
    });

    expect(actionsRepository.save).toHaveBeenCalled();
    expect(eventsRepository.save).toHaveBeenCalled();
    expect(result.executionStatus).toBe(
      RecommendedActionExecutionStatus.EXECUTED,
    );
    expect(result.observation).toBe('Completado sin hallazgos criticos');
  });

  it('materializa acciones de forma idempotente', async () => {
    const { service, actionsRepository } = createService();
    actionsRepository.findOne.mockResolvedValue({
      id: 'existing',
      actionIndex: 0,
    });

    const created = await service.materializeFromInterpretation({
      id: 'interp-1',
      eventId: 'event-1',
      executiveReport: {
        recommendedActions: [
          {
            priority: 'immediate',
            action: 'Accion 1',
            reason: 'Razon',
            suggestedArea: 'Tecnologia',
            recommendedTime: '15 minutos',
          },
        ],
      },
    } as never);

    expect(created).toHaveLength(1);
    expect(actionsRepository.create).not.toHaveBeenCalled();
  });
});
