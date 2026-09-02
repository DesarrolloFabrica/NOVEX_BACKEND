import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { SituationSeverity } from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { OperationalOverviewService } from './operational-overview.service';
import {
  ActiveSeverityRow,
  AffectedCoordinationRow,
} from './repositories/operational-overview.repository';

const CATALOG_FIXTURE = [
  ['coord-general', 'Coordinación General', 'General', 1],
  ['coord-b2b', 'Coordinación Supervisor B2B', 'B2B', 2],
  ['coord-bellas-artes', 'Coordinador Bellas Artes', 'Bellas Artes', 3],
  [
    'coord-desarrollo-profesional',
    'Coordinador Desarrollo Profesional',
    'Desarrollo Prof.',
    4,
  ],
  ['coord-empresarial', 'Coordinador Empresarial', 'Empresarial', 5],
  [
    'coord-especializaciones',
    'Coordinador Especializaciones',
    'Especializaciones',
    6,
  ],
  ['coord-ingenierias', 'Coordinador Ingenierías', 'Ingenierías', 7],
  [
    'coord-operaciones-academicas',
    'Coordinador Operaciones Académicas',
    'Op. Académicas',
    8,
  ],
  [
    'coord-proyeccion-social',
    'Coordinador Proyección Social',
    'Proyección Social',
    9,
  ],
  ['coord-saber-pro', 'Coordinador Saber Pro', 'Saber Pro', 10],
  ['coord-transversales', 'Coordinador Transversales', 'Transversales', 11],
  ['coord-homologaciones', 'Homologaciones', 'Homologaciones', 12],
  ['coord-negocios', 'Negocios', 'Negocios', 13],
  ['coord-fabrica-contenidos', 'Fabrica de contenidos', 'Fábrica', 14],
  ['coord-servicios', 'Servicios', 'Servicios', 15],
] as const;

/** Catálogo institucional: 15 activas, display_order 1-15 continuo. */
function buildCatalog(): Coordination[] {
  return CATALOG_FIXTURE.map(
    ([code, name, shortName, displayOrder]) =>
      ({
        id: uuidFor(displayOrder),
        code,
        name,
        shortName,
        color: '#28C8F4',
        icon: code,
        imageAsset: `${code}.png`,
        displayOrder,
        isActive: true,
      }) as unknown as Coordination,
  );
}

function uuidFor(order: number): string {
  return `00000000-0000-0000-0000-${String(order).padStart(12, '0')}`;
}

function uuidOf(code: string): string {
  const entry = CATALOG_FIXTURE.find(([itemCode]) => itemCode === code);
  if (!entry) throw new Error(`Código desconocido en el fixture: ${code}`);
  return uuidFor(entry[3]);
}

function severityRow(
  coordinationId: string | null,
  severity: SituationSeverity,
  total: number,
): ActiveSeverityRow {
  return { coordinationId, severity, total };
}

const ADMIN: AuthPayload = {
  sub: 'admin-user',
  roleCode: 'ADMIN',
  coordinationId: null,
  permissions: ['SITUATIONS_VIEW', 'COORDINATIONS_VIEW'],
} as unknown as AuthPayload;

const COORDINADOR: AuthPayload = {
  sub: 'coordinador-user',
  roleCode: 'COORDINADOR',
  coordinationId: uuidOf('coord-ingenierias'),
  permissions: ['SITUATIONS_VIEW', 'COORDINATIONS_VIEW'],
} as unknown as AuthPayload;

function createService(options: {
  severityRows?: ActiveSeverityRow[];
  affectedRows?: AffectedCoordinationRow[];
  catalog?: Coordination[];
}) {
  const coordinationsRepository = {
    findCatalog: jest.fn().mockResolvedValue(options.catalog ?? buildCatalog()),
  };
  const overviewRepository = {
    aggregateActiveSituationsBySeverity: jest
      .fn()
      .mockResolvedValue(options.severityRows ?? []),
    aggregateAffectedCoordinations: jest
      .fn()
      .mockResolvedValue(options.affectedRows ?? []),
  };
  const service = new OperationalOverviewService(
    coordinationsRepository as never,
    overviewRepository as never,
    new OperationalScopeService(),
  );

  return { service, coordinationsRepository, overviewRepository };
}

function findCoordination(
  overview: { coordinations: { code: string }[] },
  code: string,
) {
  const found = overview.coordinations.find((item) => item.code === code);
  if (!found) throw new Error(`Coordinación ausente en la respuesta: ${code}`);
  return found;
}

describe('OperationalOverviewService · catálogo e identificadores', () => {
  it('devuelve las 15 coordinaciones activas para ADMIN, incluida General', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);

    expect(overview.coordinations).toHaveLength(15);
    expect(
      overview.coordinations.some((item) => item.code === 'coord-general'),
    ).toBe(true);
  });

  it('respeta displayOrder y no genera posiciones visuales', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);

    expect(overview.coordinations.map((item) => item.displayOrder)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('emite id como UUID y code como código institucional, sin invertirlos', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);
    const general = findCoordination(overview, 'coord-general');

    expect(general.id).toBe(uuidOf('coord-general'));
    expect(general.code).toBe('coord-general');
    expect(general.id).not.toBe(general.code);
  });

  it('no expone arte, metadata interna ni desglose de severidades', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);

    expect(Object.keys(overview).sort()).toEqual([
      'analystRegistry',
      'coordinations',
      'directionStatus',
      'generatedAt',
      'totals',
    ]);
    expect(Object.keys(overview.coordinations[0]).sort()).toEqual([
      'activeProblemsCount',
      'affectedCoordinationCount',
      'code',
      'color',
      'criticalCount',
      'displayOrder',
      'id',
      'name',
      'shortName',
      'status',
    ]);
    expect(Object.keys(overview.analystRegistry).sort()).toEqual([
      'activeProblemsCount',
      'affectedCoordinationCount',
      'criticalCount',
      'status',
    ]);
  });

  it('genera un único generatedAt ISO por request', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);

    expect(overview.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(Number.isNaN(Date.parse(overview.generatedAt))).toBe(false);
  });
});

describe('OperationalOverviewService · integridad por coordinación', () => {
  it('una coordinación sin problemas activos queda ESTABLE en cero', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);
    const general = findCoordination(overview, 'coord-general');

    expect(general).toMatchObject({
      status: 'ESTABLE',
      activeProblemsCount: 0,
      criticalCount: 0,
      affectedCoordinationCount: 0,
    });
  });

  it('un problema LOW pone la coordinación en ALERTA', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-negocios'), SituationSeverity.LOW, 1),
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-negocios')).toMatchObject({
      status: 'ALERTA',
      activeProblemsCount: 1,
      criticalCount: 0,
    });
  });

  it('una situación CRITICAL lleva la coordinación a CRITICO', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-b2b'), SituationSeverity.CRITICAL, 1),
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-b2b')).toMatchObject({
      status: 'CRITICO',
      activeProblemsCount: 1,
      criticalCount: 1,
    });
  });

  it('tres HIGH llevan a CRITICO', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-saber-pro'), SituationSeverity.HIGH, 3),
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-saber-pro')).toMatchObject({
      status: 'CRITICO',
      activeProblemsCount: 3,
      criticalCount: 0,
    });
  });

  it('cinco activos leves llevan a CRITICO por acumulación', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-servicios'), SituationSeverity.LOW, 3),
        severityRow(uuidOf('coord-servicios'), SituationSeverity.MEDIUM, 2),
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-servicios')).toMatchObject({
      status: 'CRITICO',
      activeProblemsCount: 5,
    });
  });

  it('propagación hacia tres coordinaciones lleva a CRITICO', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-transversales'), SituationSeverity.LOW, 1),
      ],
      affectedRows: [
        { coordinationId: uuidOf('coord-transversales'), total: 3 },
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-transversales')).toMatchObject({
      status: 'CRITICO',
      activeProblemsCount: 1,
      affectedCoordinationCount: 3,
    });
  });

  it('propagación hacia dos coordinaciones no escala por sí sola', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-transversales'), SituationSeverity.LOW, 1),
      ],
      affectedRows: [
        { coordinationId: uuidOf('coord-transversales'), total: 2 },
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-transversales')).toMatchObject({
      status: 'ALERTA',
      affectedCoordinationCount: 2,
    });
  });

  it('ignora RESOLVED y CLOSED: la agregación solo recibe estados activos', async () => {
    const { service, overviewRepository } = createService({});
    await service.getOverview(ADMIN);

    // El filtro de estados vive en el repositorio (ACTIVE_SITUATION_STATUSES);
    // el service no puede reintroducir estados cerrados.
    expect(
      overviewRepository.aggregateActiveSituationsBySeverity,
    ).toHaveBeenCalledWith();
    expect(
      overviewRepository.aggregateAffectedCoordinations,
    ).toHaveBeenCalledWith();

    const overview = await service.getOverview(ADMIN);
    expect(
      overview.coordinations.every((item) => item.activeProblemsCount === 0),
    ).toBe(true);
    expect(overview.directionStatus).toBe('ESTABLE');
  });
});

describe('OperationalOverviewService · totals', () => {
  it('describe solo coordinaciones y no suma el Registro de analista', async () => {
    const { service } = createService({
      severityRows: [
        // 1 crítica
        severityRow(uuidOf('coord-b2b'), SituationSeverity.CRITICAL, 1),
        // 4 en alerta
        severityRow(uuidOf('coord-negocios'), SituationSeverity.LOW, 1),
        severityRow(uuidOf('coord-servicios'), SituationSeverity.MEDIUM, 1),
        severityRow(uuidOf('coord-saber-pro'), SituationSeverity.HIGH, 1),
        severityRow(uuidOf('coord-homologaciones'), SituationSeverity.LOW, 2),
        // registro de analista crítico
        severityRow(null, SituationSeverity.CRITICAL, 1),
      ],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.totals).toEqual({ critical: 1, alert: 4, stable: 10 });
    expect(overview.analystRegistry.status).toBe('CRITICO');
    expect(overview.directionStatus).toBe('CRITICO');
    expect(overview.coordinations).toHaveLength(15);
  });

  it('una coordinación DESCONOCIDO no entra en totals', async () => {
    const { service } = createService({
      // Propagación sin problemas activos: snapshot imposible.
      affectedRows: [{ coordinationId: uuidOf('coord-negocios'), total: 2 }],
    });
    const overview = await service.getOverview(ADMIN);
    const { critical, alert, stable } = overview.totals;

    expect(findCoordination(overview, 'coord-negocios').status).toBe(
      'DESCONOCIDO',
    );
    expect(critical + alert + stable).toBe(14);
    expect(overview.coordinations).toHaveLength(15);
  });
});

describe('OperationalOverviewService · Registro de analista', () => {
  it('sin situaciones sin dueña queda ESTABLE en cero', async () => {
    const { service } = createService({});
    const overview = await service.getOverview(ADMIN);

    expect(overview.analystRegistry).toEqual({
      status: 'ESTABLE',
      activeProblemsCount: 0,
      criticalCount: 0,
      affectedCoordinationCount: 0,
    });
  });

  it('nunca aparece dentro de coordinations[]', async () => {
    const { service } = createService({
      severityRows: [severityRow(null, SituationSeverity.CRITICAL, 2)],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.coordinations).toHaveLength(15);
    expect(
      overview.coordinations.every((item) => item.code.startsWith('coord-')),
    ).toBe(true);
    expect(
      overview.coordinations.reduce(
        (total, item) => total + item.activeProblemsCount,
        0,
      ),
    ).toBe(0);
    expect(overview.analystRegistry.activeProblemsCount).toBe(2);
  });

  it('no se asigna a Coordinación General', async () => {
    const { service } = createService({
      severityRows: [severityRow(null, SituationSeverity.CRITICAL, 1)],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-general')).toMatchObject({
      status: 'ESTABLE',
      activeProblemsCount: 0,
      criticalCount: 0,
    });
  });

  it('un LOW sin dueña pone el registro en ALERTA', async () => {
    const { service } = createService({
      severityRows: [severityRow(null, SituationSeverity.LOW, 1)],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.analystRegistry).toMatchObject({
      status: 'ALERTA',
      activeProblemsCount: 1,
      criticalCount: 0,
    });
    // 15 estables + registro ALERTA no alcanza el umbral de 5.
    expect(overview.directionStatus).toBe('ESTABLE');
  });

  it('cuenta su propagación sin excluir dueña, porque no tiene', async () => {
    const { service } = createService({
      severityRows: [severityRow(null, SituationSeverity.MEDIUM, 1)],
      affectedRows: [{ coordinationId: null, total: 3 }],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.analystRegistry).toMatchObject({
      status: 'CRITICO',
      affectedCoordinationCount: 3,
    });
  });
});

describe('OperationalOverviewService · estado global', () => {
  const scenario = async (
    criticals: number,
    alerts: number,
    registry: { severity: SituationSeverity; total: number } | null,
  ) => {
    const codes = CATALOG_FIXTURE.map(([code]) => code);
    const severityRows: ActiveSeverityRow[] = [];

    for (let index = 0; index < criticals; index += 1) {
      severityRows.push(
        severityRow(uuidOf(codes[index]), SituationSeverity.CRITICAL, 1),
      );
    }
    for (let index = 0; index < alerts; index += 1) {
      severityRows.push(
        severityRow(uuidOf(codes[criticals + index]), SituationSeverity.LOW, 1),
      );
    }
    if (registry) {
      severityRows.push(severityRow(null, registry.severity, registry.total));
    }

    const { service } = createService({ severityRows });
    return service.getOverview(ADMIN);
  };

  it('15 ESTABLE + registro ESTABLE -> ESTABLE', async () => {
    expect((await scenario(0, 0, null)).directionStatus).toBe('ESTABLE');
  });

  it('15 ESTABLE + registro ALERTA -> ESTABLE', async () => {
    const overview = await scenario(0, 0, {
      severity: SituationSeverity.LOW,
      total: 1,
    });
    expect(overview.analystRegistry.status).toBe('ALERTA');
    expect(overview.directionStatus).toBe('ESTABLE');
  });

  it('4 coordinaciones ALERTA + registro ALERTA -> ALERTA', async () => {
    const overview = await scenario(0, 4, {
      severity: SituationSeverity.LOW,
      total: 1,
    });
    expect(overview.totals).toMatchObject({ alert: 4 });
    expect(overview.directionStatus).toBe('ALERTA');
  });

  it('15 ESTABLE + registro CRITICO -> ALERTA', async () => {
    const overview = await scenario(0, 0, {
      severity: SituationSeverity.CRITICAL,
      total: 1,
    });
    expect(overview.analystRegistry.status).toBe('CRITICO');
    expect(overview.directionStatus).toBe('ALERTA');
  });

  it('1 coordinación CRITICO + registro CRITICO -> CRITICO', async () => {
    const overview = await scenario(1, 0, {
      severity: SituationSeverity.CRITICAL,
      total: 1,
    });
    expect(overview.directionStatus).toBe('CRITICO');
  });

  it('2 coordinaciones CRITICO + registro ESTABLE -> CRITICO', async () => {
    expect((await scenario(2, 0, null)).directionStatus).toBe('CRITICO');
  });

  it('5 coordinaciones ALERTA + registro ESTABLE -> ALERTA', async () => {
    expect((await scenario(0, 5, null)).directionStatus).toBe('ALERTA');
  });

  it('2 coordinaciones CRITICO + registro DESCONOCIDO -> CRITICO', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-general'), SituationSeverity.CRITICAL, 1),
        severityRow(uuidOf('coord-b2b'), SituationSeverity.CRITICAL, 1),
      ],
      // Propagación sin problemas activos sin dueña: registro incoherente.
      affectedRows: [{ coordinationId: null, total: 2 }],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.analystRegistry.status).toBe('DESCONOCIDO');
    expect(overview.directionStatus).toBe('CRITICO');
  });

  it('1 coordinación CRITICO + registro DESCONOCIDO -> DESCONOCIDO', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-general'), SituationSeverity.CRITICAL, 1),
      ],
      affectedRows: [{ coordinationId: null, total: 2 }],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.analystRegistry.status).toBe('DESCONOCIDO');
    expect(overview.directionStatus).toBe('DESCONOCIDO');
  });

  it('5 coordinaciones ALERTA + registro DESCONOCIDO -> DESCONOCIDO', async () => {
    const codes = CATALOG_FIXTURE.map(([code]) => code);
    const { service } = createService({
      severityRows: codes
        .slice(0, 5)
        .map((code) => severityRow(uuidOf(code), SituationSeverity.LOW, 1)),
      affectedRows: [{ coordinationId: null, total: 2 }],
    });
    const overview = await service.getOverview(ADMIN);

    expect(overview.directionStatus).toBe('DESCONOCIDO');
  });
});

describe('OperationalOverviewService · snapshots inválidos', () => {
  it('degrada solo la fuente incoherente y conserva las demás', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-b2b'), SituationSeverity.LOW, 1),
      ],
      // coord-negocios tiene propagación pero ningún problema activo.
      affectedRows: [{ coordinationId: uuidOf('coord-negocios'), total: 4 }],
    });
    const overview = await service.getOverview(ADMIN);

    expect(findCoordination(overview, 'coord-negocios').status).toBe(
      'DESCONOCIDO',
    );
    expect(findCoordination(overview, 'coord-b2b').status).toBe('ALERTA');
    expect(
      overview.coordinations.filter((item) => item.status === 'ESTABLE'),
    ).toHaveLength(13);
    expect(overview.coordinations).toHaveLength(15);
  });

  it('no lanza 500 ante una agregación incoherente', async () => {
    const { service } = createService({
      affectedRows: [{ coordinationId: uuidOf('coord-negocios'), total: 4 }],
    });
    await expect(service.getOverview(ADMIN)).resolves.toBeDefined();
  });
});

describe('OperationalOverviewService · alcance', () => {
  it('ADMIN no queda filtrado: recibe el catálogo completo', async () => {
    const { service, coordinationsRepository } = createService({});
    const overview = await service.getOverview(ADMIN);

    expect(coordinationsRepository.findCatalog).toHaveBeenCalledWith(false);
    expect(overview.coordinations).toHaveLength(15);
  });

  it('un actor coordination-scoped solo recibe su coordinación', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-ingenierias'), SituationSeverity.HIGH, 1),
        severityRow(uuidOf('coord-b2b'), SituationSeverity.CRITICAL, 3),
      ],
    });
    const overview = await service.getOverview(COORDINADOR);

    expect(overview.coordinations).toHaveLength(1);
    expect(overview.coordinations[0].code).toBe('coord-ingenierias');
    expect(overview.coordinations[0].status).toBe('ALERTA');
    expect(overview.totals).toEqual({ critical: 0, alert: 1, stable: 0 });
  });

  it('un actor coordination-scoped no recibe el Registro de analista institucional', async () => {
    const { service } = createService({
      severityRows: [
        severityRow(uuidOf('coord-ingenierias'), SituationSeverity.LOW, 1),
        severityRow(null, SituationSeverity.CRITICAL, 3),
      ],
      affectedRows: [{ coordinationId: null, total: 5 }],
    });
    const overview = await service.getOverview(COORDINADOR);

    expect(overview.analystRegistry).toEqual({
      status: 'ESTABLE',
      activeProblemsCount: 0,
      criticalCount: 0,
      affectedCoordinationCount: 0,
    });
  });

  it('rechaza a un actor sin SITUATIONS_VIEW', async () => {
    const { service } = createService({});
    const intruder = {
      ...ADMIN,
      permissions: ['COORDINATIONS_VIEW'],
    };

    await expect(service.getOverview(intruder)).rejects.toThrow(
      /SITUATIONS_VIEW/,
    );
  });
});

describe('OperationalOverviewService · performance', () => {
  it('ejecuta un número constante de consultas, sin N+1', async () => {
    const manySituations: ActiveSeverityRow[] = CATALOG_FIXTURE.flatMap(
      ([code]) => [
        severityRow(uuidOf(code), SituationSeverity.LOW, 40),
        severityRow(uuidOf(code), SituationSeverity.HIGH, 60),
      ],
    );

    const { service, coordinationsRepository, overviewRepository } =
      createService({ severityRows: manySituations });
    await service.getOverview(ADMIN);

    // 1 catálogo + 1 agregación de severidades + 1 agregación de afectaciones.
    expect(coordinationsRepository.findCatalog).toHaveBeenCalledTimes(1);
    expect(
      overviewRepository.aggregateActiveSituationsBySeverity,
    ).toHaveBeenCalledTimes(1);
    expect(
      overviewRepository.aggregateAffectedCoordinations,
    ).toHaveBeenCalledTimes(1);
  });
});
