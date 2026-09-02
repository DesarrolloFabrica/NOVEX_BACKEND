import { SituationStatus } from '../../common/enums/situation.enums';

/**
 * Política de integridad operacional del MVP de cartas (ADMIN).
 *
 * Dominio puro: sin entidades, sin repositorios, sin fechas, sin IA.
 * La integridad depende exclusivamente de severidad, acumulación y propagación
 * estructurada. El SLA queda deliberadamente fuera: se usará para ORDENAR
 * problemas, nunca para decidir el estado de una coordinación.
 */

/** Código de política versionado para trazabilidad de la lectura ejecutiva. */
export const COORDINATION_INTEGRITY_POLICY_CODE = 'integrity-mvp-v1';

/** Estado que puede tener una coordinación con datos operacionales válidos. */
export type CoordinationIntegrityStatus = 'ESTABLE' | 'ALERTA' | 'CRITICO';

/**
 * Estado que puede presentarse en pantalla. DESCONOCIDO no es un resultado
 * operacional: significa ausencia de dataset o imposibilidad de calcular, y
 * nunca debe degradarse a ESTABLE.
 */
export type OperationalIntegrityStatus =
  CoordinationIntegrityStatus | 'DESCONOCIDO';

/**
 * Estados que cuentan como problema activo en este MVP.
 * RESOLVED (legado) y CLOSED quedan fuera de la agregación.
 */
export const ACTIVE_SITUATION_STATUSES: readonly SituationStatus[] = [
  SituationStatus.OPEN,
  SituationStatus.IN_PROGRESS,
];

/** Único filtro de estado admitido al construir un snapshot de integridad. */
export function isActiveForIntegrity(status: SituationStatus): boolean {
  return ACTIVE_SITUATION_STATUSES.includes(status);
}

/**
 * Agregado por coordinación. Todos los conteos deben provenir únicamente de
 * situaciones OPEN e IN_PROGRESS.
 */
export interface CoordinationIntegritySnapshot {
  /** Total de problemas activos de la coordinación. */
  activeProblemsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** Coordinaciones distintas alcanzadas por la propagación de esos problemas. */
  affectedCoordinationCount: number;
}

/** Umbrales del MVP. Cualquier ajuste de política se hace aquí, no en el flujo. */
export const MVP_CRITICAL_CRITICAL_COUNT = 1;
export const MVP_CRITICAL_HIGH_COUNT = 3;
export const MVP_CRITICAL_ACTIVE_COUNT = 5;
export const MVP_CRITICAL_AFFECTED_COORDINATIONS = 3;

/** Umbrales del estado global de la Dirección de Operaciones. */
export const MVP_DIRECTION_CRITICAL_COORDINATIONS = 2;
export const MVP_DIRECTION_ALERT_DIVISOR = 3;

/** Regla concreta que llevó a una coordinación a CRITICO. */
export type CoordinationCriticalRule =
  | 'CRITICAL_SEVERITY'
  | 'HIGH_ACCUMULATION'
  | 'ACTIVE_ACCUMULATION'
  | 'IMPACT_PROPAGATION';

/**
 * Motivos por los que un snapshot no es interpretable.
 *
 * SEVERITY_SUM_MISMATCH exige igualdad, no desigualdad: situations.severity es
 * una columna NOT NULL sobre un enum de cuatro valores, así que toda situación
 * activa cae en exactamente uno de los cuatro conteos.
 *
 * IMPACT_WITHOUT_ACTIVE_PROBLEMS cubre el snapshot imposible: la propagación
 * se deriva de los problemas activos propios, luego no puede haber impacto
 * declarado sin ningún problema que lo origine.
 */
export type CoordinationSnapshotIssue =
  | 'NOT_INTEGER'
  | 'NEGATIVE'
  | 'SEVERITY_SUM_MISMATCH'
  | 'IMPACT_WITHOUT_ACTIVE_PROBLEMS';

export interface CoordinationSnapshotViolation {
  field: string;
  issue: CoordinationSnapshotIssue;
  value: number;
}

export interface CoordinationIntegrityEvaluation {
  status: OperationalIntegrityStatus;
  /** Reglas de CRITICO que se cumplieron. Vacío si el estado no es CRITICO. */
  triggeredCriticalRules: CoordinationCriticalRule[];
  /** Inconsistencias del snapshot. No vacío implica status DESCONOCIDO. */
  violations: CoordinationSnapshotViolation[];
}

const COUNT_FIELDS: readonly (keyof CoordinationIntegritySnapshot)[] = [
  'activeProblemsCount',
  'criticalCount',
  'highCount',
  'mediumCount',
  'lowCount',
  'affectedCoordinationCount',
];

/**
 * Detecta inconsistencias sin normalizarlas: NaN, Infinity, decimales,
 * negativos, desgloses de severidad que no cuadran con el total de activos y
 * propagación declarada sin problemas activos que la originen.
 * Number.isInteger cubre NaN e Infinity en una sola comprobación.
 */
export function validateCoordinationIntegritySnapshot(
  snapshot: CoordinationIntegritySnapshot,
): CoordinationSnapshotViolation[] {
  const violations: CoordinationSnapshotViolation[] = [];

  for (const field of COUNT_FIELDS) {
    const value = snapshot[field];
    if (!Number.isInteger(value)) {
      violations.push({ field, issue: 'NOT_INTEGER', value });
      continue;
    }
    if (value < 0) {
      violations.push({ field, issue: 'NEGATIVE', value });
    }
  }

  if (violations.length > 0) {
    return violations;
  }

  const severitySum =
    snapshot.criticalCount +
    snapshot.highCount +
    snapshot.mediumCount +
    snapshot.lowCount;
  if (severitySum !== snapshot.activeProblemsCount) {
    violations.push({
      field: 'activeProblemsCount',
      issue: 'SEVERITY_SUM_MISMATCH',
      value: snapshot.activeProblemsCount,
    });
  }

  if (
    snapshot.activeProblemsCount === 0 &&
    snapshot.affectedCoordinationCount > 0
  ) {
    violations.push({
      field: 'affectedCoordinationCount',
      issue: 'IMPACT_WITHOUT_ACTIVE_PROBLEMS',
      value: snapshot.affectedCoordinationCount,
    });
  }

  return violations;
}

/**
 * Sin problemas activos, la coordinación está estable. La existencia de
 * problemas la pone en alerta. Una situación crítica, una acumulación
 * importante, varios problemas HIGH o una propagación amplia la llevan a
 * estado crítico.
 */
export function evaluateCoordinationIntegrity(
  snapshot: CoordinationIntegritySnapshot,
): CoordinationIntegrityEvaluation {
  const violations = validateCoordinationIntegritySnapshot(snapshot);
  if (violations.length > 0) {
    return { status: 'DESCONOCIDO', triggeredCriticalRules: [], violations };
  }

  const triggeredCriticalRules: CoordinationCriticalRule[] = [];
  if (snapshot.criticalCount >= MVP_CRITICAL_CRITICAL_COUNT) {
    triggeredCriticalRules.push('CRITICAL_SEVERITY');
  }
  if (snapshot.highCount >= MVP_CRITICAL_HIGH_COUNT) {
    triggeredCriticalRules.push('HIGH_ACCUMULATION');
  }
  if (snapshot.activeProblemsCount >= MVP_CRITICAL_ACTIVE_COUNT) {
    triggeredCriticalRules.push('ACTIVE_ACCUMULATION');
  }
  if (
    snapshot.affectedCoordinationCount >= MVP_CRITICAL_AFFECTED_COORDINATIONS
  ) {
    triggeredCriticalRules.push('IMPACT_PROPAGATION');
  }

  if (triggeredCriticalRules.length > 0) {
    return { status: 'CRITICO', triggeredCriticalRules, violations: [] };
  }

  if (snapshot.activeProblemsCount === 0) {
    return { status: 'ESTABLE', triggeredCriticalRules: [], violations: [] };
  }

  return { status: 'ALERTA', triggeredCriticalRules: [], violations: [] };
}

/** Atajo para consumidores que solo necesitan el estado. */
export function getCoordinationIntegrityStatus(
  snapshot: CoordinationIntegritySnapshot,
): OperationalIntegrityStatus {
  return evaluateCoordinationIntegrity(snapshot).status;
}

export interface DirectionIntegrityEvaluation {
  status: OperationalIntegrityStatus;
  totalCoordinations: number;
  criticalCoordinationsCount: number;
  alertCoordinationsCount: number;
  stableCoordinationsCount: number;
  /** Coordinaciones cuyo estado no se pudo calcular. */
  unknownCoordinationsCount: number;
  /** Umbral de alertas aplicado: ceil(total / MVP_DIRECTION_ALERT_DIVISOR). */
  alertThreshold: number;
}

/**
 * Estado de la Dirección de Operaciones a partir de los estados ya calculados
 * de sus coordinaciones. El total sale del array recibido: no se asume 15.
 *
 * Precedencia:
 * 1. dataset vacío → DESCONOCIDO.
 * 2. 2 o más críticas → CRITICO, incluso con coordinaciones desconocidas: una
 *    criticidad ya demostrada no debe quedar escondida por un dato ausente.
 * 3. algún estado no calculable → DESCONOCIDO.
 * 4. exactamente 1 crítica → ALERTA.
 * 5. alertas >= ceil(total / 3) → ALERTA.
 * 6. resto → ESTABLE.
 *
 * El denominador del umbral es siempre el total recibido, desconocidas
 * incluidas: el umbral describe la institución completa, no la parte legible.
 */
export function evaluateDirectionIntegrity(
  coordinationStatuses: readonly OperationalIntegrityStatus[],
): DirectionIntegrityEvaluation {
  const totalCoordinations = coordinationStatuses.length;

  if (totalCoordinations === 0) {
    return {
      status: 'DESCONOCIDO',
      totalCoordinations: 0,
      criticalCoordinationsCount: 0,
      alertCoordinationsCount: 0,
      stableCoordinationsCount: 0,
      unknownCoordinationsCount: 0,
      alertThreshold: 0,
    };
  }

  const criticalCoordinationsCount = coordinationStatuses.filter(
    (status) => status === 'CRITICO',
  ).length;
  const alertCoordinationsCount = coordinationStatuses.filter(
    (status) => status === 'ALERTA',
  ).length;
  const stableCoordinationsCount = coordinationStatuses.filter(
    (status) => status === 'ESTABLE',
  ).length;
  const alertThreshold = Math.ceil(
    totalCoordinations / MVP_DIRECTION_ALERT_DIVISOR,
  );
  // Todo lo que no sea uno de los tres estados calculables cuenta como
  // desconocido, incluido un valor no reconocido.
  const unknownCoordinationsCount =
    totalCoordinations -
    criticalCoordinationsCount -
    alertCoordinationsCount -
    stableCoordinationsCount;

  const base = {
    totalCoordinations,
    criticalCoordinationsCount,
    alertCoordinationsCount,
    stableCoordinationsCount,
    unknownCoordinationsCount,
    alertThreshold,
  };

  // La criticidad institucional se afirma antes de rendirse por datos
  // ausentes: dos coordinaciones críticas ya son CRITICO aunque falte leer
  // otras. Por debajo de ese umbral, un solo estado no calculable impide
  // afirmar cualquier lectura, incluida la de calma.
  if (criticalCoordinationsCount >= MVP_DIRECTION_CRITICAL_COORDINATIONS) {
    return { status: 'CRITICO', ...base };
  }

  if (unknownCoordinationsCount > 0) {
    return { status: 'DESCONOCIDO', ...base };
  }

  if (criticalCoordinationsCount === 1) {
    return { status: 'ALERTA', ...base };
  }

  if (alertCoordinationsCount >= alertThreshold) {
    return { status: 'ALERTA', ...base };
  }

  return { status: 'ESTABLE', ...base };
}
