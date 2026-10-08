import {
  SITUATION_SEVERITY_ORDER,
  SituationSeverity,
} from '../../common/enums/situation.enums';
import { getWarningLeadMs } from '../../situations/situation-sla.policy';

/**
 * INTERNOS · AFECTACIONES DE PROBLEMAS ACTIVOS (FOTO AL CORTE, scope
 * COORDINATION). Reglas puras; el SQL vive en
 * `operational-kpi-internal-problems.repository.ts`.
 *
 *   Universo = ACTIVE_AT_CUT ∩ INTERNAL (mismo universo que Carga.internal).
 *   Cada fila se lee al corte T: severidad, afectaciones conocidas, plazo.
 */

export type InternalProblemSlaAtCut =
  'on_track' | 'at_risk' | 'overdue' | 'none';

/** Tope duro de filas: el universo por coordinación son decenas. */
export const KPI_INTERNAL_PROBLEMS_LIMIT = 500;

/** Caracteres del extracto de la última afectación. */
export const KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS = 140;

/**
 * Tolerancia entre el alta del caso y su fila REPORTED. Un alta escribe ambas
 * en la misma transacción (diferencia de milisegundos); el backfill de
 * INTERNAL vivo escribió la fila REPORTED en el instante de la migración.
 */
export const KPI_HISTORY_RELIABLE_TOLERANCE_SECONDS = 5;

/**
 * Plazo al corte. El SLA es la promesa ORIGINAL: ventana de aviso por la
 * severidad REPORTADA, nunca la efectiva. `asOf` = min(ahora, T).
 */
export function slaAtCut(input: {
  dueAt: string | null;
  reportedSeverity: SituationSeverity;
  asOf: Date;
}): InternalProblemSlaAtCut {
  if (!input.dueAt) return 'none';
  const dueMs = new Date(input.dueAt).getTime();
  if (!Number.isFinite(dueMs)) return 'none';
  const asOfMs = input.asOf.getTime();
  if (asOfMs > dueMs) return 'overdue';
  if (asOfMs >= dueMs - getWarningLeadMs(input.reportedSeverity)) {
    return 'at_risk';
  }
  return 'on_track';
}

export function severityRank(severity: SituationSeverity): number {
  return SITUATION_SEVERITY_ORDER.indexOf(severity);
}

/** Niveles subidos entre la severidad reportada y la del corte (≥ 0). */
export function severityDrift(row: {
  reportedSeverity: SituationSeverity;
  severityAtCut: SituationSeverity;
}): number {
  return Math.max(
    0,
    severityRank(row.severityAtCut) - severityRank(row.reportedSeverity),
  );
}

/** Folio visible: últimos 4 alfanuméricos del id (= formatDossierFolio). */
export function internalProblemFolio(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-4)
    .toUpperCase();
}

/**
 * Orden de «Problemas con más afectaciones» (y de la respuesta):
 *   afectaciones al corte ↓ · severidad al corte ↓ · días abierto ↓ · id.
 * Sin puntaje compuesto.
 */
export function compareInternalProblems(
  a: {
    id: string;
    severityAtCut: SituationSeverity;
    consequenceCountAtCut: number;
    ageDays: number;
  },
  b: {
    id: string;
    severityAtCut: SituationSeverity;
    consequenceCountAtCut: number;
    ageDays: number;
  },
): number {
  return (
    b.consequenceCountAtCut - a.consequenceCountAtCut ||
    severityRank(b.severityAtCut) - severityRank(a.severityAtCut) ||
    b.ageDays - a.ageDays ||
    a.id.localeCompare(b.id)
  );
}
