import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import {
  evaluateCoordinationIntegrity,
  isActiveForIntegrity,
} from './coordination-integrity';
import {
  CoordinationLifeSnapshot,
  LIFE_DAMAGE_BY_SEVERITY,
  LIFE_HEARTS,
  LIFE_POINTS_PER_HEART,
  MAX_LIFE_POINTS,
  evaluateCoordinationLifePoints,
  getCoordinationLifePoints,
  validateCoordinationLifeSnapshot,
} from './coordination-life-points';

/**
 * Snapshot coherente a partir de lo que importa en cada caso: el total de
 * activos y el de entrantes se derivan de los desgloses, igual que en la
 * agregación real, para no fabricar snapshots imposibles por accidente.
 */
function life(
  counts: Partial<
    Pick<
      CoordinationLifeSnapshot,
      | 'lowCount'
      | 'mediumCount'
      | 'highCount'
      | 'criticalCount'
      | 'externalIncomingLowCount'
      | 'externalIncomingMediumCount'
      | 'externalIncomingHighCount'
      | 'externalIncomingCriticalCount'
      | 'affectedCoordinationCount'
    >
  > = {},
): CoordinationLifeSnapshot {
  const owned = {
    lowCount: counts.lowCount ?? 0,
    mediumCount: counts.mediumCount ?? 0,
    highCount: counts.highCount ?? 0,
    criticalCount: counts.criticalCount ?? 0,
  };
  const external = {
    externalIncomingLowCount: counts.externalIncomingLowCount ?? 0,
    externalIncomingMediumCount: counts.externalIncomingMediumCount ?? 0,
    externalIncomingHighCount: counts.externalIncomingHighCount ?? 0,
    externalIncomingCriticalCount: counts.externalIncomingCriticalCount ?? 0,
  };

  return {
    ...owned,
    ...external,
    activeProblemsCount:
      owned.lowCount + owned.mediumCount + owned.highCount + owned.criticalCount,
    affectedCoordinationCount: counts.affectedCoordinationCount ?? 0,
    incomingDependencyCount:
      external.externalIncomingLowCount +
      external.externalIncomingMediumCount +
      external.externalIncomingHighCount +
      external.externalIncomingCriticalCount,
    incomingCriticalCount: external.externalIncomingCriticalCount,
  };
}

describe('coordination-life-points · constantes', () => {
  it('5 corazones × 2 puntos = 10 puntos máximos', () => {
    expect(LIFE_HEARTS).toBe(5);
    expect(LIFE_POINTS_PER_HEART).toBe(2);
    expect(MAX_LIFE_POINTS).toBe(10);
  });

  it('pesos por severidad: LOW 1, MEDIUM 1, HIGH 2, CRITICAL 2', () => {
    expect(LIFE_DAMAGE_BY_SEVERITY).toEqual({
      [SituationSeverity.LOW]: 1,
      [SituationSeverity.MEDIUM]: 1,
      [SituationSeverity.HIGH]: 2,
      [SituationSeverity.CRITICAL]: 2,
    });
  });
});

describe('coordination-life-points · daño propio', () => {
  it.each([
    ['sin problemas', {}, 10],
    ['1 LOW', { lowCount: 1 }, 9],
    ['1 MEDIUM', { mediumCount: 1 }, 9],
    ['1 HIGH', { highCount: 1 }, 8],
    ['1 CRITICAL', { criticalCount: 1 }, 8],
    ['2 LOW', { lowCount: 2 }, 8],
    ['LOW + MEDIUM + HIGH', { lowCount: 1, mediumCount: 1, highCount: 1 }, 6],
    ['2 MEDIUM + 2 HIGH', { mediumCount: 2, highCount: 2 }, 4],
    ['10 LOW (daño exacto 10)', { lowCount: 10 }, 0],
    ['4 CRITICAL + 1 LOW', { criticalCount: 4, lowCount: 1 }, 1],
  ])('%s → %i', (_label, counts, expected) => {
    expect(getCoordinationLifePoints(life(counts))).toBe(expected);
  });
});

describe('coordination-life-points · dependencias entrantes', () => {
  it.each([
    ['incoming LOW', { externalIncomingLowCount: 1 }, 9],
    ['incoming MEDIUM', { externalIncomingMediumCount: 1 }, 9],
    ['incoming HIGH', { externalIncomingHighCount: 1 }, 8],
    ['incoming CRITICAL', { externalIncomingCriticalCount: 1 }, 8],
    [
      'owned CRITICAL + incoming CRITICAL',
      { criticalCount: 1, externalIncomingCriticalCount: 1 },
      6,
    ],
    [
      'owned LOW + incoming HIGH + incoming MEDIUM',
      {
        lowCount: 1,
        externalIncomingHighCount: 1,
        externalIncomingMediumCount: 1,
      },
      6,
    ],
  ])('%s → %i', (_label, counts, expected) => {
    expect(getCoordinationLifePoints(life(counts))).toBe(expected);
  });

  it('una dependencia entrante con responsable = afectada NO resta dos veces', () => {
    // Fila INTER reasignada: cuenta en los propios (criticalCount) y en el
    // total entrante de integridad, pero no en el desglose externo.
    const snapshot: CoordinationLifeSnapshot = {
      ...life({ criticalCount: 1 }),
      incomingDependencyCount: 1,
      incomingCriticalCount: 1,
    };

    expect(evaluateCoordinationLifePoints(snapshot)).toEqual({
      lifePoints: 8,
      damage: 2,
      violations: [],
    });
  });
});

describe('coordination-life-points · saturación', () => {
  it.each([
    ['5 CRITICAL', { criticalCount: 5 }, 0, 10],
    ['6 CRITICAL', { criticalCount: 6 }, 0, 12],
    ['20 HIGH', { highCount: 20 }, 0, 40],
    [
      '5 CRITICAL propios + 3 CRITICAL entrantes',
      { criticalCount: 5, externalIncomingCriticalCount: 3 },
      0,
      16,
    ],
  ])('%s → %i (daño sin saturar %i)', (_label, counts, points, damage) => {
    const evaluation = evaluateCoordinationLifePoints(life(counts));
    expect(evaluation.lifePoints).toBe(points);
    expect(evaluation.damage).toBe(damage);
  });

  it('nunca supera 10 ni baja de 0', () => {
    for (let low = 0; low <= 15; low += 1) {
      for (let critical = 0; critical <= 8; critical += 1) {
        const points = getCoordinationLifePoints(
          life({ lowCount: low, criticalCount: critical }),
        );
        expect(points).not.toBeNull();
        expect(Number.isInteger(points)).toBe(true);
        expect(points).toBeGreaterThanOrEqual(0);
        expect(points).toBeLessThanOrEqual(MAX_LIFE_POINTS);
      }
    }
  });
});

describe('coordination-life-points · recuperación derivada', () => {
  /** Como la agregación real: solo OPEN e IN_PROGRESS entran al snapshot. */
  function fromSituations(
    situations: readonly {
      status: SituationStatus;
      severity: SituationSeverity;
    }[],
  ): CoordinationLifeSnapshot {
    const active = situations.filter((item) =>
      isActiveForIntegrity(item.status),
    );
    const count = (severity: SituationSeverity) =>
      active.filter((item) => item.severity === severity).length;
    return life({
      lowCount: count(SituationSeverity.LOW),
      mediumCount: count(SituationSeverity.MEDIUM),
      highCount: count(SituationSeverity.HIGH),
      criticalCount: count(SituationSeverity.CRITICAL),
    });
  }

  it('CRITICAL activo resta 2; al cerrarlo los 2 vuelven sin ninguna suma manual', () => {
    const open = fromSituations([
      { status: SituationStatus.OPEN, severity: SituationSeverity.CRITICAL },
    ]);
    const closed = fromSituations([
      { status: SituationStatus.CLOSED, severity: SituationSeverity.CRITICAL },
    ]);

    expect(getCoordinationLifePoints(open)).toBe(8);
    expect(getCoordinationLifePoints(closed)).toBe(10);
  });

  it('IN_PROGRESS sigue restando; RESOLVED (legado) y CLOSED no', () => {
    const snapshot = fromSituations([
      { status: SituationStatus.IN_PROGRESS, severity: SituationSeverity.HIGH },
      { status: SituationStatus.RESOLVED, severity: SituationSeverity.HIGH },
      { status: SituationStatus.CLOSED, severity: SituationSeverity.LOW },
    ]);

    expect(getCoordinationLifePoints(snapshot)).toBe(8);
  });

  it('en saturación, resolver un problema solo devuelve lo que el resto deja', () => {
    // 6 CRITICAL → 0; cerrar uno deja 5 CRITICAL → sigue en 0. Sin deuda.
    const six = Array.from({ length: 6 }, () => ({
      status: SituationStatus.OPEN,
      severity: SituationSeverity.CRITICAL,
    }));
    const afterOne = [
      { status: SituationStatus.CLOSED, severity: SituationSeverity.CRITICAL },
      ...six.slice(1),
    ];
    const afterTwo = [
      { status: SituationStatus.CLOSED, severity: SituationSeverity.CRITICAL },
      { status: SituationStatus.CLOSED, severity: SituationSeverity.CRITICAL },
      ...six.slice(2),
    ];

    expect(getCoordinationLifePoints(fromSituations(six))).toBe(0);
    expect(getCoordinationLifePoints(fromSituations(afterOne))).toBe(0);
    expect(getCoordinationLifePoints(fromSituations(afterTwo))).toBe(2);
  });
});

describe('coordination-life-points · snapshot inválido → null', () => {
  it.each([
    [
      'NaN en un conteo propio',
      { ...life(), lowCount: Number.NaN },
      'lowCount',
      'NOT_INTEGER',
    ],
    [
      'negativo en un conteo propio',
      { ...life(), highCount: -1, activeProblemsCount: -1 },
      'highCount',
      'NEGATIVE',
    ],
    [
      'desglose propio que no suma el total',
      { ...life({ lowCount: 1 }), activeProblemsCount: 3 },
      'activeProblemsCount',
      'SEVERITY_SUM_MISMATCH',
    ],
    [
      'propagación sin problemas activos',
      { ...life(), affectedCoordinationCount: 2 },
      'affectedCoordinationCount',
      'IMPACT_WITHOUT_ACTIVE_PROBLEMS',
    ],
    [
      'decimal en el desglose entrante',
      { ...life(), externalIncomingHighCount: 0.5 },
      'externalIncomingHighCount',
      'NOT_INTEGER',
    ],
    [
      'Infinity en el desglose entrante',
      { ...life(), externalIncomingLowCount: Number.POSITIVE_INFINITY },
      'externalIncomingLowCount',
      'NOT_INTEGER',
    ],
    [
      'negativo en el desglose entrante',
      { ...life(), externalIncomingMediumCount: -2 },
      'externalIncomingMediumCount',
      'NEGATIVE',
    ],
    [
      'desglose entrante mayor que el total entrante',
      { ...life(), externalIncomingLowCount: 2, incomingDependencyCount: 1 },
      'externalIncoming*',
      'INCOMING_BREAKDOWN_EXCEEDS_TOTAL',
    ],
    [
      'CRITICAL externos mayor que CRITICAL entrantes',
      {
        ...life(),
        externalIncomingCriticalCount: 1,
        incomingDependencyCount: 1,
        incomingCriticalCount: 0,
      },
      'externalIncomingCriticalCount',
      'INCOMING_BREAKDOWN_EXCEEDS_TOTAL',
    ],
  ])('%s', (_label, snapshot, field, issue) => {
    const evaluation = evaluateCoordinationLifePoints(snapshot);

    // Nunca un valor sano ante datos inválidos: ni 10 ni ningún otro.
    expect(evaluation.lifePoints).toBeNull();
    expect(evaluation.damage).toBeNull();
    expect(evaluation.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ field, issue })]),
    );
  });

  it('un snapshot vacío pero válido da 10, no null', () => {
    expect(validateCoordinationLifeSnapshot(life())).toEqual([]);
    expect(getCoordinationLifePoints(life())).toBe(10);
  });
});

describe('coordination-life-points · independencia de la integridad', () => {
  it.each([
    // Mismo snapshot, dos lecturas que no se deducen la una de la otra.
    ['1 CRITICAL', life({ criticalCount: 1 }), 'CRITICO', 8],
    ['4 LOW', life({ lowCount: 4 }), 'ALERTA', 6],
    ['5 LOW', life({ lowCount: 5 }), 'CRITICO', 5],
    ['2 HIGH', life({ highCount: 2 }), 'ALERTA', 6],
    ['sin problemas', life(), 'ESTABLE', 10],
  ])('%s → integridad %s, vidas %i', (_label, snapshot, status, points) => {
    expect(evaluateCoordinationIntegrity(snapshot).status).toBe(status);
    expect(getCoordinationLifePoints(snapshot)).toBe(points);
  });

  it('el desglose externo no altera la integridad: solo lo leen las vidas', () => {
    const base = life({ lowCount: 1 });
    const withBreakdown: CoordinationLifeSnapshot = {
      ...base,
      incomingDependencyCount: 1,
      externalIncomingHighCount: 1,
    };
    const withoutBreakdown: CoordinationLifeSnapshot = {
      ...base,
      incomingDependencyCount: 1,
    };

    expect(evaluateCoordinationIntegrity(withBreakdown)).toEqual(
      evaluateCoordinationIntegrity(withoutBreakdown),
    );
    expect(getCoordinationLifePoints(withBreakdown)).toBe(7);
    expect(getCoordinationLifePoints(withoutBreakdown)).toBe(9);
  });
});
