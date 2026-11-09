import {
  CoordinationIntegritySnapshot,
  MVP_DIRECTION_CRITICAL_COORDINATIONS,
  OperationalIntegrityStatus,
  evaluateCoordinationIntegrity,
  evaluateDirectionIntegrity,
  type CoordinationIntegrityEvaluation,
} from './coordination-integrity';

/**
 * Política institucional que combina las coordinaciones con el Registro de
 * analista.
 *
 * El Registro de analista agrupa las situaciones registradas por un ANALISTA,
 * que no representa a ninguna coordinación y por tanto nacen sin área dueña.
 * Es una fuente operacional adicional, NO una coordinación: no es carta, no
 * suma en los totales de coordinaciones y no aumenta el denominador del
 * umbral de alertas.
 *
 * Este archivo no reimplementa la política de Fase 1: delega en
 * `evaluateCoordinationIntegrity` y `evaluateDirectionIntegrity`, y solo añade
 * la combinación de señales.
 */

/**
 * Wrapper de naming: el Registro de analista se evalúa con la MISMA política
 * operacional que una coordinación (severidad, acumulación, propagación), pero
 * no es una coordinación y conviene que el punto de llamada lo diga.
 */
export function evaluateAnalystRegistryIntegrity(
  snapshot: CoordinationIntegritySnapshot,
): CoordinationIntegrityEvaluation {
  return evaluateCoordinationIntegrity(snapshot);
}

export interface OperationalDirectionInput {
  /** Estados ya calculados de las coordinaciones visibles para el actor. */
  coordinationStatuses: readonly OperationalIntegrityStatus[];
  analystRegistryStatus: OperationalIntegrityStatus;
}

/**
 * Regla de la política de Dirección que DECIDIÓ el estado (Fase 01B.2, K-01).
 * Es la única fuente de la explicación que ve el DIRECTOR: el frontend no
 * reaplica reglas de coordinación sobre totales de la Dirección.
 */
export type DirectionIntegrityRule =
  | 'NO_COORDINATIONS'
  | 'MULTIPLE_CRITICAL_SIGNALS'
  | 'UNKNOWN_SIGNAL'
  | 'SINGLE_CRITICAL_SIGNAL'
  | 'ALERT_THRESHOLD_REACHED'
  | 'BELOW_ALERT_THRESHOLD';

export const DIRECTION_INTEGRITY_POLICY_CODE = 'direction-mvp-v1';

/** Explicación serializable de la evaluación de la Dirección. */
export interface DirectionIntegrityExplanation {
  policyCode: typeof DIRECTION_INTEGRITY_POLICY_CODE;
  rule: DirectionIntegrityRule;
  totalCoordinations: number;
  criticalSignals: number;
  alertSignals: number;
  alertThreshold: number;
  /** Umbral de señales críticas que vuelve CRÍTICA a la Dirección. */
  criticalSignalsThreshold: number;
  unknownCoordinations: number;
  analystRegistryStatus: OperationalIntegrityStatus;
}

export interface OperationalDirectionEvaluation {
  status: OperationalIntegrityStatus;
  rule: DirectionIntegrityRule;
  /** Solo coordinaciones: el Registro de analista nunca entra en el total. */
  totalCoordinations: number;
  /** ceil(totalCoordinations / 3), calculado sin el Registro de analista. */
  alertThreshold: number;
  criticalSignals: number;
  alertSignals: number;
  unknownCoordinations: number;
  /** Reparto de COORDINACIONES por estado. No incluye desconocidas. */
  totals: {
    critical: number;
    alert: number;
    stable: number;
  };
}

/**
 * Precedencia:
 * 1. criticalSignals >= 2                       -> CRITICO
 * 2. algún DESCONOCIDO (coordinación o registro) -> DESCONOCIDO
 * 3. criticalSignals === 1                       -> ALERTA
 * 4. alertSignals >= alertThreshold              -> ALERTA
 * 5. resto                                       -> ESTABLE
 *
 * La criticidad se afirma antes de rendirse por datos ausentes; por debajo de
 * ese umbral, un estado no calculable impide cualquier lectura, incluida la de
 * calma.
 *
 * Sin coordinaciones -> DESCONOCIDO.
 */
export function evaluateOperationalDirectionIntegrity(
  input: OperationalDirectionInput,
): OperationalDirectionEvaluation {
  const coordinations = evaluateDirectionIntegrity(input.coordinationStatuses);

  const criticalSignals =
    coordinations.criticalCoordinationsCount +
    (input.analystRegistryStatus === 'CRITICO' ? 1 : 0);
  const alertSignals =
    coordinations.alertCoordinationsCount +
    (input.analystRegistryStatus === 'ALERTA' ? 1 : 0);
  const hasUnknown =
    coordinations.unknownCoordinationsCount > 0 ||
    input.analystRegistryStatus === 'DESCONOCIDO';

  const base = {
    unknownCoordinations: coordinations.unknownCoordinationsCount,
    totalCoordinations: coordinations.totalCoordinations,
    alertThreshold: coordinations.alertThreshold,
    criticalSignals,
    alertSignals,
    totals: {
      critical: coordinations.criticalCoordinationsCount,
      alert: coordinations.alertCoordinationsCount,
      stable: coordinations.stableCoordinationsCount,
    },
  };

  if (coordinations.totalCoordinations === 0) {
    return { status: 'DESCONOCIDO', rule: 'NO_COORDINATIONS', ...base };
  }

  if (criticalSignals >= MVP_DIRECTION_CRITICAL_COORDINATIONS) {
    return { status: 'CRITICO', rule: 'MULTIPLE_CRITICAL_SIGNALS', ...base };
  }

  if (hasUnknown) {
    return { status: 'DESCONOCIDO', rule: 'UNKNOWN_SIGNAL', ...base };
  }

  if (criticalSignals === 1) {
    return { status: 'ALERTA', rule: 'SINGLE_CRITICAL_SIGNAL', ...base };
  }

  if (alertSignals >= coordinations.alertThreshold) {
    return { status: 'ALERTA', rule: 'ALERT_THRESHOLD_REACHED', ...base };
  }

  return { status: 'ESTABLE', rule: 'BELOW_ALERT_THRESHOLD', ...base };
}

/** Proyección de la evaluación para la API (sin recalcular nada). */
export function toDirectionIntegrityExplanation(
  evaluation: OperationalDirectionEvaluation,
  analystRegistryStatus: OperationalIntegrityStatus,
): DirectionIntegrityExplanation {
  return {
    policyCode: DIRECTION_INTEGRITY_POLICY_CODE,
    rule: evaluation.rule,
    totalCoordinations: evaluation.totalCoordinations,
    criticalSignals: evaluation.criticalSignals,
    alertSignals: evaluation.alertSignals,
    alertThreshold: evaluation.alertThreshold,
    criticalSignalsThreshold: MVP_DIRECTION_CRITICAL_COORDINATIONS,
    unknownCoordinations: evaluation.unknownCoordinations,
    analystRegistryStatus,
  };
}
