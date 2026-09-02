import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import {
  ACTIVE_SITUATION_STATUSES,
  CoordinationIntegritySnapshot,
  MVP_CRITICAL_ACTIVE_COUNT,
  MVP_CRITICAL_AFFECTED_COORDINATIONS,
  MVP_CRITICAL_HIGH_COUNT,
  OperationalIntegrityStatus,
  evaluateCoordinationIntegrity,
  evaluateDirectionIntegrity,
  getCoordinationIntegrityStatus,
  isActiveForIntegrity,
  validateCoordinationIntegritySnapshot,
} from './coordination-integrity';

/** Snapshot vacío como base: cada caso solo declara lo que le importa. */
function snapshot(
  overrides: Partial<CoordinationIntegritySnapshot> = {},
): CoordinationIntegritySnapshot {
  return {
    activeProblemsCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    affectedCoordinationCount: 0,
    ...overrides,
  };
}

/**
 * Construye el snapshot como lo hará la agregación de la fase 3: filtrando por
 * los estados activos antes de contar. Sirve para probar que RESOLVED y CLOSED
 * quedan fuera de la integridad.
 */
function snapshotFromSituations(
  situations: readonly {
    status: SituationStatus;
    severity: SituationSeverity;
  }[],
  affectedCoordinationCount = 0,
): CoordinationIntegritySnapshot {
  const active = situations.filter((situation) =>
    isActiveForIntegrity(situation.status),
  );
  const countBySeverity = (severity: SituationSeverity) =>
    active.filter((situation) => situation.severity === severity).length;

  return {
    activeProblemsCount: active.length,
    criticalCount: countBySeverity(SituationSeverity.CRITICAL),
    highCount: countBySeverity(SituationSeverity.HIGH),
    mediumCount: countBySeverity(SituationSeverity.MEDIUM),
    lowCount: countBySeverity(SituationSeverity.LOW),
    affectedCoordinationCount,
  };
}

/** Dataset institucional de N coordinaciones con la mezcla indicada. */
function directionDataset(
  total: number,
  criticals: number,
  alerts: number,
  unknowns = 0,
): OperationalIntegrityStatus[] {
  const statuses: OperationalIntegrityStatus[] = [
    ...Array<OperationalIntegrityStatus>(criticals).fill('CRITICO'),
    ...Array<OperationalIntegrityStatus>(alerts).fill('ALERTA'),
    ...Array<OperationalIntegrityStatus>(unknowns).fill('DESCONOCIDO'),
  ];
  const stable = total - statuses.length;
  return [
    ...statuses,
    ...Array<OperationalIntegrityStatus>(stable).fill('ESTABLE'),
  ];
}

describe('coordination-integrity · estados activos', () => {
  it('cuenta únicamente OPEN e IN_PROGRESS como problema activo', () => {
    expect(ACTIVE_SITUATION_STATUSES).toEqual([
      SituationStatus.OPEN,
      SituationStatus.IN_PROGRESS,
    ]);
    expect(isActiveForIntegrity(SituationStatus.OPEN)).toBe(true);
    expect(isActiveForIntegrity(SituationStatus.IN_PROGRESS)).toBe(true);
  });

  it('excluye RESOLVED y CLOSED de la integridad', () => {
    expect(isActiveForIntegrity(SituationStatus.RESOLVED)).toBe(false);
    expect(isActiveForIntegrity(SituationStatus.CLOSED)).toBe(false);
  });

  it('una coordinación con solo RESOLVED y CLOSED queda ESTABLE', () => {
    const built = snapshotFromSituations([
      {
        status: SituationStatus.RESOLVED,
        severity: SituationSeverity.CRITICAL,
      },
      { status: SituationStatus.CLOSED, severity: SituationSeverity.CRITICAL },
    ]);
    expect(built.activeProblemsCount).toBe(0);
    expect(built.criticalCount).toBe(0);
    expect(getCoordinationIntegrityStatus(built)).toBe('ESTABLE');
  });

  it('una CRITICAL cerrada no arrastra a la coordinación a CRITICO', () => {
    const built = snapshotFromSituations([
      { status: SituationStatus.OPEN, severity: SituationSeverity.LOW },
      { status: SituationStatus.CLOSED, severity: SituationSeverity.CRITICAL },
      { status: SituationStatus.RESOLVED, severity: SituationSeverity.HIGH },
    ]);
    expect(built.activeProblemsCount).toBe(1);
    expect(getCoordinationIntegrityStatus(built)).toBe('ALERTA');
  });

  it('mezcla OPEN e IN_PROGRESS en el mismo conteo activo', () => {
    const built = snapshotFromSituations([
      { status: SituationStatus.OPEN, severity: SituationSeverity.MEDIUM },
      { status: SituationStatus.IN_PROGRESS, severity: SituationSeverity.LOW },
      { status: SituationStatus.CLOSED, severity: SituationSeverity.LOW },
    ]);
    expect(built.activeProblemsCount).toBe(2);
    expect(getCoordinationIntegrityStatus(built)).toBe('ALERTA');
  });
});

describe('coordination-integrity · integridad por coordinación', () => {
  it('sin problemas activos la coordinación está ESTABLE', () => {
    const evaluation = evaluateCoordinationIntegrity(snapshot());
    expect(evaluation.status).toBe('ESTABLE');
    expect(evaluation.triggeredCriticalRules).toEqual([]);
    expect(evaluation.violations).toEqual([]);
  });

  it('un problema LOW pone la coordinación en ALERTA', () => {
    expect(
      getCoordinationIntegrityStatus(
        snapshot({ activeProblemsCount: 1, lowCount: 1 }),
      ),
    ).toBe('ALERTA');
  });

  it('un problema MEDIUM pone la coordinación en ALERTA', () => {
    expect(
      getCoordinationIntegrityStatus(
        snapshot({ activeProblemsCount: 1, mediumCount: 1 }),
      ),
    ).toBe('ALERTA');
  });

  it('un problema HIGH aislado pone la coordinación en ALERTA, no en CRITICO', () => {
    expect(
      getCoordinationIntegrityStatus(
        snapshot({ activeProblemsCount: 1, highCount: 1 }),
      ),
    ).toBe('ALERTA');
  });

  it('dos problemas HIGH siguen en ALERTA (bajo el umbral)', () => {
    expect(
      getCoordinationIntegrityStatus(
        snapshot({ activeProblemsCount: 2, highCount: 2 }),
      ),
    ).toBe('ALERTA');
  });

  it('una situación CRITICAL lleva a CRITICO', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: 1, criticalCount: 1 }),
    );
    expect(evaluation.status).toBe('CRITICO');
    expect(evaluation.triggeredCriticalRules).toEqual(['CRITICAL_SEVERITY']);
  });

  it('tres problemas HIGH llevan a CRITICO por acumulación de severidad', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({
        activeProblemsCount: MVP_CRITICAL_HIGH_COUNT,
        highCount: MVP_CRITICAL_HIGH_COUNT,
      }),
    );
    expect(evaluation.status).toBe('CRITICO');
    expect(evaluation.triggeredCriticalRules).toEqual(['HIGH_ACCUMULATION']);
  });

  it('cinco problemas activos llevan a CRITICO aunque sean leves', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({
        activeProblemsCount: MVP_CRITICAL_ACTIVE_COUNT,
        lowCount: 3,
        mediumCount: 2,
      }),
    );
    expect(evaluation.status).toBe('CRITICO');
    expect(evaluation.triggeredCriticalRules).toEqual(['ACTIVE_ACCUMULATION']);
  });

  it('cuatro problemas activos leves siguen en ALERTA', () => {
    expect(
      getCoordinationIntegrityStatus(
        snapshot({ activeProblemsCount: 4, lowCount: 2, mediumCount: 2 }),
      ),
    ).toBe('ALERTA');
  });

  it('propagación hacia tres coordinaciones lleva a CRITICO', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({
        activeProblemsCount: 1,
        lowCount: 1,
        affectedCoordinationCount: MVP_CRITICAL_AFFECTED_COORDINATIONS,
      }),
    );
    expect(evaluation.status).toBe('CRITICO');
    expect(evaluation.triggeredCriticalRules).toEqual(['IMPACT_PROPAGATION']);
  });

  it('propagación hacia dos coordinaciones no escala por sí sola a CRITICO', () => {
    expect(
      getCoordinationIntegrityStatus(
        snapshot({
          activeProblemsCount: 1,
          lowCount: 1,
          affectedCoordinationCount: 2,
        }),
      ),
    ).toBe('ALERTA');
  });

  it('acumula todas las reglas de CRITICO que se cumplen', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({
        activeProblemsCount: 6,
        criticalCount: 2,
        highCount: 3,
        lowCount: 1,
        affectedCoordinationCount: 4,
      }),
    );
    expect(evaluation.status).toBe('CRITICO');
    expect(evaluation.triggeredCriticalRules).toEqual([
      'CRITICAL_SEVERITY',
      'HIGH_ACCUMULATION',
      'ACTIVE_ACCUMULATION',
      'IMPACT_PROPAGATION',
    ]);
  });

  it('la propagación no escala una coordinación sin problemas activos', () => {
    // La propagación se deriva de los problemas activos propios: cero activos
    // con impacto declarado es un snapshot imposible, no un CRITICO.
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({
        activeProblemsCount: 0,
        affectedCoordinationCount: MVP_CRITICAL_AFFECTED_COORDINATIONS,
      }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.status).not.toBe('CRITICO');
  });
});

describe('coordination-integrity · snapshots inválidos', () => {
  it('rechaza conteos negativos', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: -1 }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toEqual([
      { field: 'activeProblemsCount', issue: 'NEGATIVE', value: -1 },
    ]);
  });

  it('rechaza NaN', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: Number.NaN }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations[0].issue).toBe('NOT_INTEGER');
  });

  it('rechaza Infinity', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: Number.POSITIVE_INFINITY }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations[0].issue).toBe('NOT_INTEGER');
  });

  it('rechaza conteos decimales', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: 2.5, lowCount: 1 }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toEqual([
      { field: 'activeProblemsCount', issue: 'NOT_INTEGER', value: 2.5 },
    ]);
  });

  it('rechaza una propagación negativa', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ affectedCoordinationCount: -3 }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toEqual([
      { field: 'affectedCoordinationCount', issue: 'NEGATIVE', value: -3 },
    ]);
  });

  it('rechaza un desglose de severidades mayor que el total de activos', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: 2, criticalCount: 1, highCount: 2 }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toEqual([
      {
        field: 'activeProblemsCount',
        issue: 'SEVERITY_SUM_MISMATCH',
        value: 2,
      },
    ]);
  });

  it('rechaza un desglose menor que el total: severity es NOT NULL', () => {
    // situations.severity es una columna NOT NULL sobre un enum de cuatro
    // valores, así que toda situación activa cae en exactamente un conteo.
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: 3, lowCount: 1 }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toEqual([
      {
        field: 'activeProblemsCount',
        issue: 'SEVERITY_SUM_MISMATCH',
        value: 3,
      },
    ]);
  });

  it('acepta el desglose exacto de severidades', () => {
    expect(
      validateCoordinationIntegritySnapshot(
        snapshot({
          activeProblemsCount: 4,
          criticalCount: 1,
          highCount: 1,
          mediumCount: 1,
          lowCount: 1,
        }),
      ),
    ).toEqual([]);
  });

  it('rechaza propagación declarada sin problemas activos', () => {
    const evaluation = evaluateCoordinationIntegrity(
      snapshot({ activeProblemsCount: 0, affectedCoordinationCount: 1 }),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toEqual([
      {
        field: 'affectedCoordinationCount',
        issue: 'IMPACT_WITHOUT_ACTIVE_PROBLEMS',
        value: 1,
      },
    ]);
  });

  it('acepta cero activos con cero propagación', () => {
    expect(validateCoordinationIntegritySnapshot(snapshot())).toEqual([]);
  });

  it('no normaliza silenciosamente: un snapshot inválido nunca queda ESTABLE', () => {
    expect(
      getCoordinationIntegrityStatus(snapshot({ criticalCount: -1 })),
    ).not.toBe('ESTABLE');
  });

  it('reporta todas las violaciones de tipo encontradas', () => {
    const violations = validateCoordinationIntegritySnapshot(
      snapshot({ activeProblemsCount: Number.NaN, criticalCount: -2 }),
    );
    expect(violations).toEqual([
      { field: 'activeProblemsCount', issue: 'NOT_INTEGER', value: Number.NaN },
      { field: 'criticalCount', issue: 'NEGATIVE', value: -2 },
    ]);
  });
});

describe('coordination-integrity · estado de la Dirección de Operaciones', () => {
  it('15 coordinaciones ESTABLE dan ESTABLE', () => {
    const evaluation = evaluateDirectionIntegrity(directionDataset(15, 0, 0));
    expect(evaluation.status).toBe('ESTABLE');
    expect(evaluation.totalCoordinations).toBe(15);
    expect(evaluation.alertThreshold).toBe(5);
  });

  it('14 ESTABLE + 1 ALERTA dan ESTABLE', () => {
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 1)).status).toBe(
      'ESTABLE',
    );
  });

  it('11 ESTABLE + 4 ALERTA dan ESTABLE (justo bajo el umbral)', () => {
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 4)).status).toBe(
      'ESTABLE',
    );
  });

  it('10 ESTABLE + 5 ALERTA dan ALERTA (umbral ceil(15/3))', () => {
    const evaluation = evaluateDirectionIntegrity(directionDataset(15, 0, 5));
    expect(evaluation.status).toBe('ALERTA');
    expect(evaluation.alertCoordinationsCount).toBe(5);
    expect(evaluation.alertThreshold).toBe(5);
  });

  it('14 ESTABLE + 1 CRÍTICA dan ALERTA', () => {
    const evaluation = evaluateDirectionIntegrity(directionDataset(15, 1, 0));
    expect(evaluation.status).toBe('ALERTA');
    expect(evaluation.criticalCoordinationsCount).toBe(1);
  });

  it('13 ESTABLE + 2 CRÍTICAS dan CRITICO', () => {
    expect(evaluateDirectionIntegrity(directionDataset(15, 2, 0)).status).toBe(
      'CRITICO',
    );
  });

  it('1 CRÍTICA + 8 ALERTA siguen dando ALERTA en el MVP', () => {
    // El refinamiento "CRITICO si >= 2/3 en alerta" queda fuera del MVP.
    expect(evaluateDirectionIntegrity(directionDataset(15, 1, 8)).status).toBe(
      'ALERTA',
    );
  });

  it('15 ALERTA sin ninguna crítica siguen dando ALERTA en el MVP', () => {
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 15)).status).toBe(
      'ALERTA',
    );
  });

  it('todas críticas dan CRITICO', () => {
    expect(evaluateDirectionIntegrity(directionDataset(15, 15, 0)).status).toBe(
      'CRITICO',
    );
  });

  it('no asume 15: con 9 coordinaciones el umbral es ceil(9/3) = 3', () => {
    const evaluation = evaluateDirectionIntegrity(directionDataset(9, 0, 3));
    expect(evaluation.totalCoordinations).toBe(9);
    expect(evaluation.alertThreshold).toBe(3);
    expect(evaluation.status).toBe('ALERTA');
  });

  it('con 9 coordinaciones, 2 ALERTA quedan bajo el umbral', () => {
    expect(evaluateDirectionIntegrity(directionDataset(9, 0, 2)).status).toBe(
      'ESTABLE',
    );
  });

  it('con 4 coordinaciones el umbral es ceil(4/3) = 2', () => {
    expect(evaluateDirectionIntegrity(directionDataset(4, 0, 1)).status).toBe(
      'ESTABLE',
    );
    expect(evaluateDirectionIntegrity(directionDataset(4, 0, 2)).status).toBe(
      'ALERTA',
    );
  });

  it('una sola coordinación en ALERTA da ALERTA (umbral 1)', () => {
    const evaluation = evaluateDirectionIntegrity(['ALERTA']);
    expect(evaluation.alertThreshold).toBe(1);
    expect(evaluation.status).toBe('ALERTA');
  });

  it('un dataset vacío da DESCONOCIDO, nunca ESTABLE', () => {
    const evaluation = evaluateDirectionIntegrity([]);
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.totalCoordinations).toBe(0);
    expect(evaluation.alertThreshold).toBe(0);
  });

  it('una coordinación DESCONOCIDO impide afirmar el estado institucional', () => {
    const evaluation = evaluateDirectionIntegrity(
      directionDataset(15, 0, 0, 1),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.stableCoordinationsCount).toBe(14);
    expect(evaluation.unknownCoordinationsCount).toBe(1);
  });

  it('2 CRÍTICAS + 1 DESCONOCIDA dan CRITICO: la criticidad ya está demostrada', () => {
    const evaluation = evaluateDirectionIntegrity(
      directionDataset(15, 2, 0, 1),
    );
    expect(evaluation.status).toBe('CRITICO');
    expect(evaluation.criticalCoordinationsCount).toBe(2);
    expect(evaluation.unknownCoordinationsCount).toBe(1);
    expect(evaluation.totalCoordinations).toBe(15);
  });

  it('1 CRÍTICA + 1 DESCONOCIDA dan DESCONOCIDO', () => {
    const evaluation = evaluateDirectionIntegrity(
      directionDataset(15, 1, 0, 1),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.status).not.toBe('ALERTA');
  });

  it('5 ALERTAS + 1 DESCONOCIDA dan DESCONOCIDO', () => {
    const evaluation = evaluateDirectionIntegrity(
      directionDataset(15, 0, 5, 1),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.alertCoordinationsCount).toBe(5);
    expect(evaluation.alertThreshold).toBe(5);
  });

  it('el umbral usa el total recibido, desconocidas incluidas', () => {
    const evaluation = evaluateDirectionIntegrity(
      directionDataset(15, 0, 0, 3),
    );
    expect(evaluation.totalCoordinations).toBe(15);
    expect(evaluation.alertThreshold).toBe(5);
    expect(evaluation.unknownCoordinationsCount).toBe(3);
  });

  it('un dataset completamente conocido conserva las reglas anteriores', () => {
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 0)).status).toBe(
      'ESTABLE',
    );
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 4)).status).toBe(
      'ESTABLE',
    );
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 5)).status).toBe(
      'ALERTA',
    );
    expect(evaluateDirectionIntegrity(directionDataset(15, 1, 0)).status).toBe(
      'ALERTA',
    );
    expect(evaluateDirectionIntegrity(directionDataset(15, 2, 0)).status).toBe(
      'CRITICO',
    );
    expect(evaluateDirectionIntegrity(directionDataset(15, 0, 15)).status).toBe(
      'ALERTA',
    );
    expect(evaluateDirectionIntegrity(directionDataset(9, 0, 3)).status).toBe(
      'ALERTA',
    );
  });

  it('todas las coordinaciones DESCONOCIDAS dan DESCONOCIDO', () => {
    const evaluation = evaluateDirectionIntegrity(
      directionDataset(15, 0, 0, 15),
    );
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.unknownCoordinationsCount).toBe(15);
  });

  it('un estado no reconocido también da DESCONOCIDO', () => {
    const evaluation = evaluateDirectionIntegrity([
      'ESTABLE',
      'ESTABLE',
      'INVALIDO' as OperationalIntegrityStatus,
    ]);
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.unknownCoordinationsCount).toBe(1);
  });

  it('un estado no reconocido no tapa dos críticas confirmadas', () => {
    const evaluation = evaluateDirectionIntegrity([
      'CRITICO',
      'CRITICO',
      'INVALIDO' as OperationalIntegrityStatus,
    ]);
    expect(evaluation.status).toBe('CRITICO');
  });

  it('expone los conteos que alimentarán la frase ejecutiva', () => {
    const evaluation = evaluateDirectionIntegrity(directionDataset(15, 2, 3));
    expect(evaluation).toMatchObject({
      status: 'CRITICO',
      totalCoordinations: 15,
      criticalCoordinationsCount: 2,
      alertCoordinationsCount: 3,
      stableCoordinationsCount: 10,
      alertThreshold: 5,
    });
  });
});
