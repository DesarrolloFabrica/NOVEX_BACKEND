import { SituationStatus } from '../common/enums/situation.enums';

/**
 * Flujo operativo de tres pasos: Abierto → En atención → Cerrado.
 * RESOLVED queda como legado (solo puede avanzar a CLOSED).
 */
export const SITUATION_STATUS_TRANSITIONS: Record<
  SituationStatus,
  SituationStatus[]
> = {
  [SituationStatus.OPEN]: [SituationStatus.IN_PROGRESS],
  [SituationStatus.IN_PROGRESS]: [SituationStatus.CLOSED],
  [SituationStatus.RESOLVED]: [SituationStatus.CLOSED],
  [SituationStatus.CLOSED]: [],
};

export const SITUATION_STATUS_LABEL_ES: Record<SituationStatus, string> = {
  [SituationStatus.OPEN]: 'Abierto',
  [SituationStatus.IN_PROGRESS]: 'En atención',
  /** Valor legado: se presenta como En atención en la UI operativa. */
  [SituationStatus.RESOLVED]: 'En atención',
  [SituationStatus.CLOSED]: 'Cerrado',
};

export function getNextSituationStatuses(
  current: SituationStatus,
): SituationStatus[] {
  return SITUATION_STATUS_TRANSITIONS[current] ?? [];
}

export function isForwardSituationTransition(
  from: SituationStatus,
  to: SituationStatus,
): boolean {
  return getNextSituationStatuses(from).includes(to);
}

export function requiresStatusComment(status: SituationStatus): boolean {
  return status === SituationStatus.CLOSED;
}
