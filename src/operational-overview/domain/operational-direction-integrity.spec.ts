import { OperationalIntegrityStatus } from './coordination-integrity';
import {
  evaluateAnalystRegistryIntegrity,
  evaluateOperationalDirectionIntegrity,
  toDirectionIntegrityExplanation,
} from './operational-direction-integrity';

function coordinations(
  total: number,
  criticals = 0,
  alerts = 0,
  unknowns = 0,
): OperationalIntegrityStatus[] {
  const declared: OperationalIntegrityStatus[] = [
    ...Array<OperationalIntegrityStatus>(criticals).fill('CRITICO'),
    ...Array<OperationalIntegrityStatus>(alerts).fill('ALERTA'),
    ...Array<OperationalIntegrityStatus>(unknowns).fill('DESCONOCIDO'),
  ];
  return [
    ...declared,
    ...Array<OperationalIntegrityStatus>(total - declared.length).fill(
      'ESTABLE',
    ),
  ];
}

function direction(
  coordinationStatuses: readonly OperationalIntegrityStatus[],
  analystRegistryStatus: OperationalIntegrityStatus,
) {
  return evaluateOperationalDirectionIntegrity({
    coordinationStatuses,
    analystRegistryStatus,
  });
}

describe('operational-direction-integrity · escenarios congelados', () => {
  it('15 ESTABLE + registro ESTABLE -> ESTABLE', () => {
    expect(direction(coordinations(15), 'ESTABLE').status).toBe('ESTABLE');
  });

  it('15 ESTABLE + registro ALERTA -> ESTABLE', () => {
    const evaluation = direction(coordinations(15), 'ALERTA');
    expect(evaluation.status).toBe('ESTABLE');
    expect(evaluation.alertSignals).toBe(1);
    expect(evaluation.alertThreshold).toBe(5);
  });

  it('4 coordinaciones ALERTA + registro ALERTA -> ALERTA', () => {
    const evaluation = direction(coordinations(15, 0, 4), 'ALERTA');
    expect(evaluation.alertSignals).toBe(5);
    expect(evaluation.status).toBe('ALERTA');
  });

  it('15 ESTABLE + registro CRITICO -> ALERTA', () => {
    const evaluation = direction(coordinations(15), 'CRITICO');
    expect(evaluation.criticalSignals).toBe(1);
    expect(evaluation.status).toBe('ALERTA');
  });

  it('1 coordinación CRITICO + registro CRITICO -> CRITICO', () => {
    const evaluation = direction(coordinations(15, 1), 'CRITICO');
    expect(evaluation.criticalSignals).toBe(2);
    expect(evaluation.status).toBe('CRITICO');
  });

  it('2 coordinaciones CRITICO + registro DESCONOCIDO -> CRITICO', () => {
    expect(direction(coordinations(15, 2), 'DESCONOCIDO').status).toBe(
      'CRITICO',
    );
  });

  it('1 coordinación CRITICO + registro DESCONOCIDO -> DESCONOCIDO', () => {
    expect(direction(coordinations(15, 1), 'DESCONOCIDO').status).toBe(
      'DESCONOCIDO',
    );
  });

  it('5 coordinaciones ALERTA + registro DESCONOCIDO -> DESCONOCIDO', () => {
    expect(direction(coordinations(15, 0, 5), 'DESCONOCIDO').status).toBe(
      'DESCONOCIDO',
    );
  });
});

describe('operational-direction-integrity · el registro no altera el denominador', () => {
  it('totalCoordinations y alertThreshold ignoran el Registro de analista', () => {
    for (const registry of [
      'ESTABLE',
      'ALERTA',
      'CRITICO',
      'DESCONOCIDO',
    ] as OperationalIntegrityStatus[]) {
      const evaluation = direction(coordinations(15), registry);
      expect(evaluation.totalCoordinations).toBe(15);
      expect(evaluation.alertThreshold).toBe(5);
    }
  });

  it('con 9 coordinaciones el umbral sigue siendo ceil(9/3) = 3', () => {
    const evaluation = direction(coordinations(9, 0, 2), 'ALERTA');
    expect(evaluation.totalCoordinations).toBe(9);
    expect(evaluation.alertThreshold).toBe(3);
    expect(evaluation.alertSignals).toBe(3);
    expect(evaluation.status).toBe('ALERTA');
  });

  it('los totals describen solo coordinaciones', () => {
    const evaluation = direction(coordinations(15, 1, 4), 'CRITICO');
    expect(evaluation.totals).toEqual({ critical: 1, alert: 4, stable: 10 });
    expect(evaluation.status).toBe('CRITICO');
  });

  it('una coordinación DESCONOCIDO no entra en totals', () => {
    const evaluation = direction(coordinations(15, 0, 0, 1), 'ESTABLE');
    expect(evaluation.totals).toEqual({ critical: 0, alert: 0, stable: 14 });
    expect(evaluation.status).toBe('DESCONOCIDO');
  });
});

describe('operational-direction-integrity · casos límite', () => {
  it('sin coordinaciones es DESCONOCIDO, incluso con registro ESTABLE', () => {
    const evaluation = direction([], 'ESTABLE');
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.totalCoordinations).toBe(0);
  });

  it('sin coordinaciones un registro CRITICO no puede afirmar CRITICO', () => {
    expect(direction([], 'CRITICO').status).toBe('DESCONOCIDO');
  });

  it('conserva las reglas de coordinaciones cuando el registro está ESTABLE', () => {
    expect(direction(coordinations(15, 0, 4), 'ESTABLE').status).toBe(
      'ESTABLE',
    );
    expect(direction(coordinations(15, 0, 5), 'ESTABLE').status).toBe('ALERTA');
    expect(direction(coordinations(15, 1), 'ESTABLE').status).toBe('ALERTA');
    expect(direction(coordinations(15, 2), 'ESTABLE').status).toBe('CRITICO');
  });
});

describe('evaluateAnalystRegistryIntegrity', () => {
  const snapshot = {
    activeProblemsCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    affectedCoordinationCount: 0,
    incomingDependencyCount: 0,
    incomingCriticalCount: 0,
  };

  it('sin situaciones el registro está ESTABLE', () => {
    expect(evaluateAnalystRegistryIntegrity(snapshot).status).toBe('ESTABLE');
  });

  it('aplica la misma política operacional que una coordinación', () => {
    expect(
      evaluateAnalystRegistryIntegrity({
        ...snapshot,
        activeProblemsCount: 1,
        lowCount: 1,
      }).status,
    ).toBe('ALERTA');
    expect(
      evaluateAnalystRegistryIntegrity({
        ...snapshot,
        activeProblemsCount: 1,
        criticalCount: 1,
      }).status,
    ).toBe('CRITICO');
    expect(
      evaluateAnalystRegistryIntegrity({
        ...snapshot,
        activeProblemsCount: 3,
        highCount: 3,
      }).status,
    ).toBe('CRITICO');
  });

  it('un snapshot incoherente da DESCONOCIDO con violaciones internas', () => {
    const evaluation = evaluateAnalystRegistryIntegrity({
      ...snapshot,
      activeProblemsCount: 2,
      lowCount: 1,
    });
    expect(evaluation.status).toBe('DESCONOCIDO');
    expect(evaluation.violations).toHaveLength(1);
  });
});

describe('Fase 01B.2 · K-01: la regla que decide la Dirección viaja al frontend', () => {
  it.each<
    [
      string,
      readonly OperationalIntegrityStatus[],
      OperationalIntegrityStatus,
      OperationalIntegrityStatus,
      string,
    ]
  >([
    ['sin coordinaciones', [], 'ESTABLE', 'DESCONOCIDO', 'NO_COORDINATIONS'],
    [
      '2 críticas',
      coordinations(15, 2),
      'ESTABLE',
      'CRITICO',
      'MULTIPLE_CRITICAL_SIGNALS',
    ],
    [
      '1 crítica + registro crítico',
      coordinations(15, 1),
      'CRITICO',
      'CRITICO',
      'MULTIPLE_CRITICAL_SIGNALS',
    ],
    [
      '1 desconocida',
      coordinations(15, 0, 0, 1),
      'ESTABLE',
      'DESCONOCIDO',
      'UNKNOWN_SIGNAL',
    ],
    [
      '1 crítica',
      coordinations(15, 1),
      'ESTABLE',
      'ALERTA',
      'SINGLE_CRITICAL_SIGNAL',
    ],
    [
      '5 alertas de 15',
      coordinations(15, 0, 5),
      'ESTABLE',
      'ALERTA',
      'ALERT_THRESHOLD_REACHED',
    ],
    [
      '4 alertas de 15',
      coordinations(15, 0, 4),
      'ESTABLE',
      'ESTABLE',
      'BELOW_ALERT_THRESHOLD',
    ],
  ])('%s -> %s', (_label, statuses, registry, status, rule) => {
    const evaluation = direction(statuses, registry);
    expect(evaluation.status).toBe(status);
    expect(evaluation.rule).toBe(rule);

    const explanation = toDirectionIntegrityExplanation(evaluation, registry);
    expect(explanation).toMatchObject({
      policyCode: 'direction-mvp-v1',
      rule,
      totalCoordinations: statuses.length,
      criticalSignalsThreshold: 2,
      analystRegistryStatus: registry,
    });
  });

  it('muchos problemas activos sin coordinaciones en alerta siguen siendo ESTABLE', () => {
    // La Dirección no aplica umbrales de coordinación (≥5 activos, ≥1 crítico)
    // a sus totales: solo cuenta estados de coordinación.
    const evaluation = direction(coordinations(15), 'ESTABLE');
    expect(evaluation).toMatchObject({
      status: 'ESTABLE',
      rule: 'BELOW_ALERT_THRESHOLD',
      criticalSignals: 0,
      alertSignals: 0,
      alertThreshold: 5,
    });
  });
});
