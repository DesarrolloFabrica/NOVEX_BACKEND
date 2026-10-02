import { SituationSeverity } from '../../common/enums/situation.enums';
import {
  CoordinationIntegritySnapshot,
  CoordinationSnapshotIssue,
  validateCoordinationIntegritySnapshot,
} from './coordination-integrity';

/**
 * Política de VIDAS del personaje por coordinación.
 *
 * Dominio puro, hermano de `evaluateCoordinationIntegrity`: lee el MISMO
 * snapshot de problemas activos (OPEN, IN_PROGRESS) pero aplica una regla
 * distinta. Vidas e integridad son dos señales independientes: ninguna se
 * deriva de la otra.
 *
 * DERIVADAS, NUNCA PERSISTIDAS. Los puntos se recalculan en cada lectura a
 * partir de los problemas activos. No hay contador, ni deuda acumulada, ni
 * eventos de suma o resta: resolver un problema lo saca del snapshot y sus
 * puntos vuelven solos en el siguiente cálculo.
 */

/** Código de política versionado, igual que `integrity-mvp-v1`. */
export const COORDINATION_LIFE_POINTS_POLICY_CODE = 'life-points-v1';

/** 5 corazones × 2 puntos. */
export const LIFE_HEARTS = 5;
export const LIFE_POINTS_PER_HEART = 2;
export const MAX_LIFE_POINTS = LIFE_HEARTS * LIFE_POINTS_PER_HEART;

/** Daño que resta un problema activo según su severidad. */
export const LIFE_DAMAGE_BY_SEVERITY: Readonly<
  Record<SituationSeverity, number>
> = {
  [SituationSeverity.LOW]: 1,
  [SituationSeverity.MEDIUM]: 1,
  [SituationSeverity.HIGH]: 2,
  [SituationSeverity.CRITICAL]: 2,
};

/**
 * Snapshot de integridad ampliado con el desglose por severidad de las
 * dependencias INTER entrantes.
 *
 * Se EXTIENDE en lugar de modificar `CoordinationIntegritySnapshot`: la
 * integridad sigue recibiendo exactamente los campos de siempre.
 *
 * `externalIncoming*` cuenta las dependencias INTER activas donde esta
 * coordinación es la AFECTADA **y la responsable es otra**. No reutiliza
 * `incomingCriticalCount` porque ese campo alimenta la integridad e incluye
 * también una fila INTER cuya responsable coincide con la afectada (posible si
 * un PATCH reasigna la responsable). Esa fila ya cuenta en los conteos propios
 * (`lowCount`…`criticalCount`), así que sumarla otra vez como entrante sería
 * dañar dos veces a la misma coordinación por el mismo caso.
 *
 * Por construcción los dos conjuntos son disjuntos:
 *   propios    → coordination_id = X
 *   entrantes  → affected_coordination_id = X  Y  coordination_id ≠ X
 */
export interface CoordinationLifeSnapshot extends CoordinationIntegritySnapshot {
  externalIncomingLowCount: number;
  externalIncomingMediumCount: number;
  externalIncomingHighCount: number;
  externalIncomingCriticalCount: number;
}

/**
 * `INCOMING_BREAKDOWN_EXCEEDS_TOTAL`: el desglose externo es un subconjunto de
 * las dependencias entrantes, así que no puede superar su total (ni su parte
 * CRITICAL).
 */
export type CoordinationLifeSnapshotIssue =
  | CoordinationSnapshotIssue
  | 'INCOMING_BREAKDOWN_EXCEEDS_TOTAL';

export interface CoordinationLifeSnapshotViolation {
  field: string;
  issue: CoordinationLifeSnapshotIssue;
  value: number;
}

export interface CoordinationLifeEvaluation {
  /**
   * Puntos de vida en 0..MAX_LIFE_POINTS, o `null` si el snapshot no es
   * interpretable. Nunca se devuelve un valor sano ante datos inválidos.
   */
  lifePoints: number | null;
  /** Daño total SIN saturar (puede superar MAX_LIFE_POINTS). Null si inválido. */
  damage: number | null;
  /** Inconsistencias detectadas. No vacío implica `lifePoints` null. */
  violations: CoordinationLifeSnapshotViolation[];
}

const EXTERNAL_INCOMING_FIELDS: readonly (keyof CoordinationLifeSnapshot)[] = [
  'externalIncomingLowCount',
  'externalIncomingMediumCount',
  'externalIncomingHighCount',
  'externalIncomingCriticalCount',
];

/**
 * Reutiliza TODAS las garantías del snapshot de integridad y añade las del
 * desglose entrante. Un snapshot que la integridad declara DESCONOCIDO tampoco
 * tiene vidas calculables.
 */
export function validateCoordinationLifeSnapshot(
  snapshot: CoordinationLifeSnapshot,
): CoordinationLifeSnapshotViolation[] {
  const violations: CoordinationLifeSnapshotViolation[] = [
    ...validateCoordinationIntegritySnapshot(snapshot),
  ];

  let breakdownIsNumeric = true;
  for (const field of EXTERNAL_INCOMING_FIELDS) {
    const value = snapshot[field];
    if (!Number.isInteger(value)) {
      violations.push({ field, issue: 'NOT_INTEGER', value });
      breakdownIsNumeric = false;
      continue;
    }
    if (value < 0) {
      violations.push({ field, issue: 'NEGATIVE', value });
      breakdownIsNumeric = false;
    }
  }

  if (!breakdownIsNumeric) {
    return violations;
  }

  const externalTotal =
    snapshot.externalIncomingLowCount +
    snapshot.externalIncomingMediumCount +
    snapshot.externalIncomingHighCount +
    snapshot.externalIncomingCriticalCount;

  if (externalTotal > snapshot.incomingDependencyCount) {
    violations.push({
      field: 'externalIncoming*',
      issue: 'INCOMING_BREAKDOWN_EXCEEDS_TOTAL',
      value: externalTotal,
    });
  }

  if (snapshot.externalIncomingCriticalCount > snapshot.incomingCriticalCount) {
    violations.push({
      field: 'externalIncomingCriticalCount',
      issue: 'INCOMING_BREAKDOWN_EXCEEDS_TOTAL',
      value: snapshot.externalIncomingCriticalCount,
    });
  }

  return violations;
}

/**
 *   ownedDamage    = low·1 + medium·1 + high·2 + critical·2
 *   incomingDamage = extLow·1 + extMedium·1 + extHigh·2 + extCritical·2
 *   damage         = ownedDamage + incomingDamage
 *   lifePoints     = clamp(MAX_LIFE_POINTS − damage, 0, MAX_LIFE_POINTS)
 *
 * Saturación: con daño ≥ 10 el resultado es 0 y el exceso no se guarda en
 * ninguna parte.
 */
export function evaluateCoordinationLifePoints(
  snapshot: CoordinationLifeSnapshot,
): CoordinationLifeEvaluation {
  const violations = validateCoordinationLifeSnapshot(snapshot);
  if (violations.length > 0) {
    return { lifePoints: null, damage: null, violations };
  }

  const weight = LIFE_DAMAGE_BY_SEVERITY;
  const ownedDamage =
    snapshot.lowCount * weight.LOW +
    snapshot.mediumCount * weight.MEDIUM +
    snapshot.highCount * weight.HIGH +
    snapshot.criticalCount * weight.CRITICAL;
  const incomingDamage =
    snapshot.externalIncomingLowCount * weight.LOW +
    snapshot.externalIncomingMediumCount * weight.MEDIUM +
    snapshot.externalIncomingHighCount * weight.HIGH +
    snapshot.externalIncomingCriticalCount * weight.CRITICAL;
  const damage = ownedDamage + incomingDamage;

  const lifePoints = Math.min(
    MAX_LIFE_POINTS,
    Math.max(0, MAX_LIFE_POINTS - damage),
  );

  return { lifePoints, damage, violations: [] };
}

/** Atajo para consumidores que solo necesitan los puntos. */
export function getCoordinationLifePoints(
  snapshot: CoordinationLifeSnapshot,
): number | null {
  return evaluateCoordinationLifePoints(snapshot).lifePoints;
}
