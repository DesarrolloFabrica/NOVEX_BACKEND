import { BadRequestException } from '@nestjs/common';
import { SituationStatus } from '../common/enums/situation.enums';
import { SituationsService } from './situations.service';

describe('SituationsService status transitions', () => {
  const createService = () => {
    const situationsRepository = {
      findByIdWithRelations: jest.fn(),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      create: jest.fn((input: unknown) => input),
      search: jest.fn(),
    };
    const coordinationsRepository = { findOne: jest.fn() };
    const categoriesRepository = { findOne: jest.fn() };
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        fullName: 'Juan Pérez',
      }),
    };
    const timelineService = {
      createEntry: jest.fn().mockResolvedValue({}),
    };

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      usersRepository as never,
      timelineService as never,
    );

    return {
      service,
      situationsRepository,
      usersRepository,
      timelineService,
    };
  };

  const baseSituation = {
    id: 'sit-1',
    title: 'Incidente',
    description: 'Desc',
    coordinationId: 'c1',
    coordination: { code: 'coord', name: 'Coord' },
    createdByUserId: 'creator',
    createdByUser: { fullName: 'Creador' },
    assignedUserId: null,
    assignedUser: null,
    categoryId: 'cat',
    category: { code: 'TECH', name: 'Tech' },
    severity: 'HIGH',
    status: SituationStatus.OPEN,
    lastStatusComment: null,
    resolvedAt: null,
    closedAt: null,
    occurredAt: new Date('2026-07-28T10:00:00.000Z'),
    createdAt: new Date('2026-07-28T10:00:00.000Z'),
    updatedAt: new Date('2026-07-28T10:00:00.000Z'),
  };

  it('avanza OPEN → IN_PROGRESS y asigna responsable automático', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations
      .mockResolvedValueOnce({ ...baseSituation })
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.IN_PROGRESS,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
      });

    const result = await service.update(
      'sit-1',
      { status: SituationStatus.IN_PROGRESS },
      'user-1',
    );

    expect(situationsRepository.save).toHaveBeenCalled();
    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        title: 'Estado actualizado',
        metadata: expect.objectContaining({
          previousValue: SituationStatus.OPEN,
          newValue: SituationStatus.IN_PROGRESS,
          assignedUserName: 'Juan Pérez',
          evidenceIds: [],
        }),
      }),
    );
    expect(result.status).toBe(SituationStatus.IN_PROGRESS);
    expect(result.assignedUserName).toBe('Juan Pérez');
  });

  it('exige motivo al pasar a RESOLVED', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.IN_PROGRESS,
      assignedUserId: 'user-1',
      assignedUser: { fullName: 'Juan Pérez' },
    });

    await expect(
      service.update(
        'sit-1',
        { status: SituationStatus.RESOLVED },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(timelineService.createEntry).not.toHaveBeenCalled();
  });

  it('rechaza saltos de estado y retrocesos', async () => {
    const { service, situationsRepository } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.OPEN,
    });

    await expect(
      service.update(
        'sit-1',
        { status: SituationStatus.RESOLVED, statusComment: 'Motivo' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloquea cambios cuando la situación está CLOSED', async () => {
    const { service, situationsRepository } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.CLOSED,
      closedAt: new Date(),
    });

    await expect(
      service.update(
        'sit-1',
        { status: SituationStatus.IN_PROGRESS },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persiste comentario de cierre en el historial', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.RESOLVED,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
        resolvedAt: new Date(),
      })
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.CLOSED,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
        lastStatusComment: 'Validación final realizada.',
        closedAt: new Date(),
      });

    await service.update(
      'sit-1',
      {
        status: SituationStatus.CLOSED,
        statusComment: 'Validación final realizada.',
        evidenceIds: [],
      },
      'user-1',
    );

    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Situación cerrada',
        metadata: expect.objectContaining({
          statusComment: 'Validación final realizada.',
          commentKind: 'closure',
          previousValue: SituationStatus.RESOLVED,
          newValue: SituationStatus.CLOSED,
        }),
      }),
    );
  });
});
