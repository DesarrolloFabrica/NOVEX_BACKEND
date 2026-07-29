import { SituationStatus } from '../common/enums/situation.enums';

/** Flujo operativo secuencial: Registrada → En atención → Resuelta → Cerrada. */
export const SITUATION_STATUS_TRANSITIONS: Record<
  SituationStatus,
  SituationStatus[]
> = {
  [SituationStatus.OPEN]: [SituationStatus.IN_PROGRESS],
  [SituationStatus.IN_PROGRESS]: [SituationStatus.RESOLVED],
  [SituationStatus.RESOLVED]: [SituationStatus.CLOSED],
  [SituationStatus.CLOSED]: [],
};

export const SITUATION_STATUS_LABEL_ES: Record<SituationStatus, string> = {
  [SituationStatus.OPEN]: 'Registrada',
  [SituationStatus.IN_PROGRESS]: 'En atención',
  [SituationStatus.RESOLVED]: 'Resuelta',
  [SituationStatus.CLOSED]: 'Cerrada',
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
  return (
    status === SituationStatus.RESOLVED || status === SituationStatus.CLOSED
  );
}
