import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';

/** Código de política versionado para trazabilidad en cada situación. */
export const SLA_POLICY_CODE = 'severity-v1';

export type SituationSlaHealth =
  | 'on_track'
  | 'at_risk'
  | 'overdue'
  | 'closed';

interface SlaWindow {
  /** Plazo objetivo de cierre desde el registro. */
  dueMs: number;
  /** Ventana previa al vencimiento para aviso. */
  warningMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Política inicial de plazos por severidad.
 * CRITICAL 24h (aviso 6h) · HIGH 72h (aviso 24h) · MEDIUM 7d (aviso 48h) · LOW 14d (aviso 72h).
 */
export const SLA_WINDOWS_BY_SEVERITY: Readonly<
  Record<SituationSeverity, SlaWindow>
> = {
  [SituationSeverity.CRITICAL]: {
    dueMs: 24 * HOUR_MS,
    warningMs: 6 * HOUR_MS,
  },
  [SituationSeverity.HIGH]: {
    dueMs: 72 * HOUR_MS,
    warningMs: 24 * HOUR_MS,
  },
  [SituationSeverity.MEDIUM]: {
    dueMs: 7 * DAY_MS,
    warningMs: 48 * HOUR_MS,
  },
  [SituationSeverity.LOW]: {
    dueMs: 14 * DAY_MS,
    warningMs: 72 * HOUR_MS,
  },
};

export function computeDueAt(
  severity: SituationSeverity,
  fromDate: Date,
): Date {
  const window = SLA_WINDOWS_BY_SEVERITY[severity];
  return new Date(fromDate.getTime() + window.dueMs);
}

export function getWarningLeadMs(severity: SituationSeverity): number {
  return SLA_WINDOWS_BY_SEVERITY[severity].warningMs;
}

export function computeSlaHealth(
  dueAt: Date | string | null | undefined,
  status: SituationStatus,
  now: Date = new Date(),
  severity: SituationSeverity = SituationSeverity.MEDIUM,
): SituationSlaHealth {
  if (status === SituationStatus.CLOSED) {
    return 'closed';
  }

  if (!dueAt) {
    return 'on_track';
  }

  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return 'on_track';
  }

  const nowMs = now.getTime();
  if (nowMs > dueMs) {
    return 'overdue';
  }

  const warningLead = getWarningLeadMs(severity);
  if (nowMs >= dueMs - warningLead) {
    return 'at_risk';
  }

  return 'on_track';
}

export function isActiveSituationStatus(status: SituationStatus): boolean {
  return (
    status === SituationStatus.OPEN ||
    status === SituationStatus.IN_PROGRESS ||
    status === SituationStatus.RESOLVED
  );
}

/**
 * Recalcula dueAt al cambiar severidad:
 * - Solo si la situación sigue activa.
 * - El nuevo plazo no puede ser más holgado que uno ya vencido
 *   (si ya está overdue con el due actual, se conserva).
 */
export function resolveDueAtOnSeverityChange(input: {
  previousSeverity: SituationSeverity;
  nextSeverity: SituationSeverity;
  status: SituationStatus;
  createdAt: Date;
  currentDueAt: Date | null;
  now?: Date;
}): Date | null {
  if (!isActiveSituationStatus(input.status)) {
    return input.currentDueAt;
  }

  const now = input.now ?? new Date();
  const nextDueAt = computeDueAt(input.nextSeverity, input.createdAt);

  if (!input.currentDueAt) {
    return nextDueAt;
  }

  const currentDueMs = input.currentDueAt.getTime();
  const alreadyOverdue = now.getTime() > currentDueMs;
  const nextIsMoreLenient = nextDueAt.getTime() > currentDueMs;

  if (alreadyOverdue && nextIsMoreLenient) {
    return input.currentDueAt;
  }

  return nextDueAt;
}

export function wasClosedOnTime(
  dueAt: Date | null | undefined,
  closedAt: Date | null | undefined,
): boolean | null {
  if (!dueAt || !closedAt) {
    return null;
  }
  return closedAt.getTime() <= dueAt.getTime();
}
