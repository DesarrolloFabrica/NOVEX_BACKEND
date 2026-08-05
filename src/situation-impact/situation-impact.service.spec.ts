import { ImpactLevel } from '../common/enums/situation-impact.enums';
import { SituationImpactService } from './situation-impact.service';

describe('SituationImpactService simulation and context', () => {
  const originId = 'origin-coord-id';
  const originCode = 'coord-origin';

  const createService = () => {
    const impactRepository = {
      findBySituationId: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const situationsRepository = {
      exist: jest.fn(),
      findOne: jest.fn(),
    };
    const affectedCoordinationsRepository = {
      create: jest.fn(),
      delete: jest.fn(),
    };
    const coordinationsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const service = new SituationImpactService(
      impactRepository as never,
      situationsRepository as never,
      affectedCoordinationsRepository as never,
      coordinationsRepository as never,
    );

    return {
      service,
      impactRepository,
      situationsRepository,
      coordinationsRepository,
    };
  };

  const baseSituation = {
    id: 'sit-1',
    coordinationId: originId,
    coordination: {
      id: originId,
      code: originCode,
      name: 'Origen',
      shortName: 'Origen',
    },
    description: 'Incidente sin relacionadas',
    relatedCoordinations: [] as Array<{
      coordinationId: string;
      displayOrder: number;
      coordination: {
        id: string;
        code: string;
        name: string;
        shortName: string;
      };
    }>,
  };

  it('prioriza coordinaciones declaradas y desactiva simulación', async () => {
    const { service, situationsRepository, impactRepository } = createService();
    situationsRepository.findOne.mockResolvedValue({
      ...baseSituation,
      relatedCoordinations: [
        {
          coordinationId: 'rel-1',
          displayOrder: 1,
          coordination: {
            id: 'rel-1',
            code: 'coord-a',
            name: 'A',
            shortName: 'A',
          },
        },
        {
          coordinationId: originId,
          displayOrder: 0,
          coordination: {
            id: originId,
            code: originCode,
            name: 'Origen',
            shortName: 'Origen',
          },
        },
      ],
    });
    impactRepository.findBySituationId.mockResolvedValue(null);

    const context = await service.getImpactContext('sit-1');

    expect(context.hasDeclaredRelated).toBe(true);
    expect(context.canSimulate).toBe(false);
    expect(context.declaredRelated).toHaveLength(1);
    expect(context.declaredRelated[0]?.coordinationCode).toBe('coord-a');

    const simulation = await service.simulateImpact('sit-1');
    expect(simulation.canSimulate).toBe(false);
    expect(simulation.potentialCoordinations).toEqual([]);
  });

  it('limita la simulación a dos islas y excluye el origen', async () => {
    const { service, situationsRepository, impactRepository } = createService();
    situationsRepository.findOne.mockResolvedValue(baseSituation);
    impactRepository.findBySituationId.mockResolvedValue({
      id: 'assess-1',
      affectedCoordinations: [
        {
          coordinationId: originId,
          impactLevel: ImpactLevel.CRITICAL,
          description: 'origen',
          coordination: {
            id: originId,
            code: originCode,
            name: 'Origen',
            shortName: 'Origen',
          },
        },
        {
          coordinationId: 'c-low',
          impactLevel: ImpactLevel.LOW,
          description: 'bajo',
          coordination: {
            id: 'c-low',
            code: 'coord-low',
            name: 'Low',
            shortName: 'Low',
          },
        },
        {
          coordinationId: 'c-high',
          impactLevel: ImpactLevel.HIGH,
          description: 'alto',
          coordination: {
            id: 'c-high',
            code: 'coord-high',
            name: 'High',
            shortName: 'High',
          },
        },
        {
          coordinationId: 'c-crit',
          impactLevel: ImpactLevel.CRITICAL,
          description: 'critico',
          coordination: {
            id: 'c-crit',
            code: 'coord-crit',
            name: 'Crit',
            shortName: 'Crit',
          },
        },
      ],
    });

    const simulation = await service.simulateImpact('sit-1', 30);

    expect(simulation.canSimulate).toBe(true);
    expect(simulation.hasDeclaredRelated).toBe(false);
    expect(simulation.potentialCoordinations).toHaveLength(2);
    expect(
      simulation.potentialCoordinations.map((item) => item.coordinationCode),
    ).toEqual(['coord-crit', 'coord-high']);
  });

  it('recupera relacionadas legadas desde la descripción', async () => {
    const {
      service,
      situationsRepository,
      impactRepository,
      coordinationsRepository,
    } = createService();
    situationsRepository.findOne.mockResolvedValue({
      ...baseSituation,
      description:
        'Falla LMS\n\n---\nContexto reportado por el usuario:\nCoordinaciones relacionadas (percepción inicial): coord-legacy · Legacy',
    });
    impactRepository.findBySituationId.mockResolvedValue(null);
    coordinationsRepository.find.mockResolvedValue([
      {
        id: 'legacy-id',
        code: 'coord-legacy',
        name: 'Legacy',
        shortName: 'Legacy',
      },
    ]);

    const context = await service.getImpactContext('sit-1');

    expect(context.hasDeclaredRelated).toBe(true);
    expect(context.declaredRelated[0]?.coordinationCode).toBe('coord-legacy');
    expect(context.canSimulate).toBe(false);
  });

  it('informa cuando no hay análisis para simular', async () => {
    const { service, situationsRepository, impactRepository } = createService();
    situationsRepository.findOne.mockResolvedValue(baseSituation);
    impactRepository.findBySituationId.mockResolvedValue(null);

    const simulation = await service.simulateImpact('sit-1');

    expect(simulation.source).toBe('none');
    expect(simulation.potentialCoordinations).toEqual([]);
    expect(simulation.message).toMatch(/análisis/i);
  });
});
