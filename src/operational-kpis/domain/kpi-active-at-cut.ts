import { SituationReportKind } from '../../common/enums/situation.enums';
import { bogotaDayEndExclusiveIso } from './kpi-history-buckets';

/**
 * ACTIVE_AT_CUT · la población única de las lecturas de STOCK de ESTADO.
 *
 * Para una coordinación X y un corte exclusivo T:
 *   responsable X
 *   AND created_at < T AND (closed_at IS NULL OR closed_at >= T)
 *   AND (INTERNAL OR (INTER AND afectada ≠ X))
 *
 * Carga (último punto), Severidad, Atención y Antigüedad son vistas de esta
 * MISMA población de la coordinación seleccionada; por eso cuadran entre sí.
 * Movimiento NO: es flujo (created_at / closed_at dentro del bucket).
 *
 * No se filtra por `status`: es el valor ACTUAL y no reconstruye el pasado
 * (RESOLVED legado sin closed_at sigue activo).
 */
export function activeAtCutCondition(input: {
  /** Alias SQL de `situations`. */
  alias: string;
  /** Expresión SQL de la coordinación responsable ($n). */
  owner: string;
  /** Expresión SQL del corte exclusivo T (p. ej. `$2::timestamptz` o `b.end_exclusive`). */
  cut: string;
  /** Expresión SQL de 'INTERNAL'. */
  internal: string;
  /** Expresión SQL de 'INTER_COORDINATION'. */
  inter: string;
}): string {
  const { alias: s, owner, cut, internal, inter } = input;
  return `${s}.coordination_id = ${owner}
        AND ${s}.created_at < ${cut}
        AND (${s}.closed_at IS NULL OR ${s}.closed_at >= ${cut})
        AND (
          ${s}.report_kind = ${internal}
          OR (
            ${s}.report_kind = ${inter}
            AND ${s}.affected_coordination_id IS DISTINCT FROM ${owner}
          )
        )`;
}

/**
 * CTE `universe` = ACTIVE_AT_CUT para un refDate (Bogotá), con `age_days`.
 * Parámetros fijos (ver `activeAtCutParams`):
 *   $1 coordinación · $2 corte T exclusivo · $3 refDate · $4 INTERNAL · $5 INTER.
 */
export function activeAtCutCte(timezone: string): string {
  return `
      WITH universe AS (
        SELECT
          s.*,
          ($3::date - (s.created_at AT TIME ZONE '${timezone}')::date) AS age_days
        FROM situations s
        WHERE ${activeAtCutCondition({
          alias: 's',
          owner: '$1',
          cut: '$2::timestamptz',
          internal: '$4',
          inter: '$5',
        })}
      )
    `;
}

/** Parámetros de `activeAtCutCte`: T = fin exclusivo del día refDate (Bogotá). */
export function activeAtCutParams(
  coordinationId: string,
  refDate: string,
): unknown[] {
  return [
    coordinationId,
    bogotaDayEndExclusiveIso(refDate),
    refDate,
    SituationReportKind.INTERNAL,
    SituationReportKind.INTER_COORDINATION,
  ];
}
