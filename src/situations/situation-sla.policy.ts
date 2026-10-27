import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';

/** Código de política versionado para trazabilidad en cada situación. */
export const SLA_POLICY_CODE = 'severity-v1';

export type SituationSlaHealth = 'on_track' | 'at_risk' | 'overdue' | 'closed';

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

/*
 * EL SLA ES LA PROMESA ORIGINAL.
 *
 * Todas las funciones de este archivo reciben la severidad REPORTADA
 * (`situations.reported_severity`), nunca la efectiva:
 *
 *   due_at = created_at + ventana(reported_severity)
 *
 * se calcula una sola vez, en el alta, y nada lo vuelve a escribir. Un
 * escalamiento AUTO_TIME cambia la urgencia actual (`severity`) pero no
 * reescribe el plazo, la ventana de aviso, `slaHealth` ni `closedOnTime`.
 * Usar la efectiva aquí reintroduciría el bucle severidad → due_at → severidad.
 */

export function computeDueAt(
  reportedSeverity: SituationSeverity,
  createdAt: Date,
): Date {
  const window = SLA_WINDOWS_BY_SEVERITY[reportedSeverity];
  return new Date(createdAt.getTime() + window.dueMs);
}

export function getWarningLeadMs(reportedSeverity: SituationSeverity): number {
  return SLA_WINDOWS_BY_SEVERITY[reportedSeverity].warningMs;
}

/**
 * `reportedSeverity` solo afecta a la ventana de aviso (`at_risk`); `overdue`
 * depende únicamente de `dueAt`.
 */
export function computeSlaHealth(
  dueAt: Date | string | null | undefined,
  status: SituationStatus,
  now: Date = new Date(),
  reportedSeverity: SituationSeverity = SituationSeverity.MEDIUM,
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

  const warningLead = getWarningLeadMs(reportedSeverity);
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

export function wasClosedOnTime(
  dueAt: Date | null | undefined,
  closedAt: Date | null | undefined,
): boolean | null {
  if (!dueAt || !closedAt) {
    return null;
  }
  return closedAt.getTime() <= dueAt.getTime();
}
