import {
  SituationSeverity,
  SituationSeverityChangeSource,
} from '../../common/enums/situation.enums';

/** Forma mínima de una fila del historial para las reglas puras. */
export interface SeverityHistoryRow {
  id: string;
  previousSeverity: SituationSeverity | null;
  newSeverity: SituationSeverity;
  source: SituationSeverityChangeSource;
  effectiveAt: Date;
  createdAt: Date;
}

/** Orden canónico: `effectiveAt`, luego `createdAt`, luego `id`. */
export function sortSeverityHistory<T extends SeverityHistoryRow>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Severidad vigente en el instante `at`: la última fila con
 * `effectiveAt <= at`. Antes de la fila REPORTED (instante anterior al alta)
 * se toma la REPORTED: una afectación declarada antes del registro ocurrió con
 * la gravedad que luego se reportó.
 */
export function severityAt(
  rows: readonly SeverityHistoryRow[],
  at: Date,
): SituationSeverity | null {
  const sorted = sortSeverityHistory(rows);
  if (sorted.length === 0) return null;

  let current: SituationSeverity = sorted[0].newSeverity;
  for (const row of sorted) {
    if (row.effectiveAt.getTime() > at.getTime()) break;
    current = row.newSeverity;
  }
  return current;
}

export type SeverityHistoryViolation =
  | 'NO_REPORTED_ROW'
  | 'MULTIPLE_REPORTED_ROWS'
  | 'REPORTED_NOT_FIRST'
  | 'REPORTED_MISMATCH'
  | 'CURRENT_MISMATCH'
  | 'BROKEN_CHAIN'
  | 'ESCALATION_AFTER_CLOSE';

/**
 * Invariantes del historial de una situación:
 *
 *   - exactamente una fila REPORTED, que es la primera y coincide con
 *     `reported_severity`;
 *   - cada fila parte del nivel en que dejó la anterior (cadena continua) y
 *     `effectiveAt` nunca retrocede;
 *   - `severity` actual = `newSeverity` de la última fila;
 *   - ningún escalamiento rige después de `closed_at`.
 *
 * Devuelve las violaciones encontradas; vacío = historial coherente.
 */
export function checkSeverityHistoryInvariants(input: {
  reportedSeverity: SituationSeverity;
  severity: SituationSeverity;
  closedAt: Date | null;
  history: readonly SeverityHistoryRow[];
}): SeverityHistoryViolation[] {
  const violations = new Set<SeverityHistoryViolation>();
  const sorted = sortSeverityHistory(input.history);
  const reported = sorted.filter(
    (row) => row.source === SituationSeverityChangeSource.REPORTED,
  );

  if (reported.length === 0) violations.add('NO_REPORTED_ROW');
  if (reported.length > 1) violations.add('MULTIPLE_REPORTED_ROWS');

  if (sorted.length > 0) {
    const first = sorted[0];
    if (first.source !== SituationSeverityChangeSource.REPORTED) {
      violations.add('REPORTED_NOT_FIRST');
    } else if (first.newSeverity !== input.reportedSeverity) {
      violations.add('REPORTED_MISMATCH');
    }

    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].previousSeverity !== sorted[i - 1].newSeverity) {
        violations.add('BROKEN_CHAIN');
      }
    }

    if (sorted[sorted.length - 1].newSeverity !== input.severity) {
      violations.add('CURRENT_MISMATCH');
    }

    if (
      input.closedAt &&
      sorted.some(
        (row) =>
          row.source !== SituationSeverityChangeSource.REPORTED &&
          row.effectiveAt.getTime() > input.closedAt!.getTime(),
      )
    ) {
      violations.add('ESCALATION_AFTER_CLOSE');
    }
  }

  return [...violations];
}
