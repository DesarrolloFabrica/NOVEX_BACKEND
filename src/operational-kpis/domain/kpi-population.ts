import {
  SituationReportKind,
  SituationStatus,
} from '../../common/enums/situation.enums';

/**
 * POBLACIÓN COMPARTIDA de indicadores (Fase 01B.2 · K-02 y K-06).
 *
 * K-02 · Estados legados. `RESOLVED` no es activo en cartas, vidas, integridad
 * ni barrido SLA; tampoco en los KPIs. Un caso congelado (RESOLVED o CLOSED)
 * deja de estar activo en su fecha REAL de fin: `closed_at`, o en su defecto
 * `resolved_at`. Si no tiene ninguna de las dos, no se inventa una: no cuenta
 * como activo en ningún corte (antes contaba como activo para siempre) y la
 * migración de normalización lo reporta para intervención manual.
 *
 * K-06 · Dependencia INTER con afectada = responsable (anomalía heredada,
 * S-N2). Cuenta UNA sola vez, como problema PROPIO de la responsable, igual
 * que un interno; nunca como dependencia entrante ni saliente. Así overview,
 * KPIs de estado y backlog ven la misma población.
 *
 * CANCELLED queda fuera por `kpiNotCancelledSql` (Fase 01B.1).
 */

const FROZEN_STATUSES = `('${SituationStatus.RESOLVED}', '${SituationStatus.CLOSED}')`;

/** Fin efectivo del caso: real, nunca inventado. */
export function kpiEffectiveEndSql(alias = 's'): string {
  return `(CASE WHEN ${alias}.status IN ${FROZEN_STATUSES}
      THEN COALESCE(${alias}.closed_at, ${alias}.resolved_at)
      ELSE ${alias}.closed_at END)`;
}

/** Caso congelado sin ninguna fecha real de fin. */
export function kpiUndatedFrozenSql(alias = 's'): string {
  return `(${alias}.status IN ${FROZEN_STATUSES}
      AND ${alias}.closed_at IS NULL AND ${alias}.resolved_at IS NULL)`;
}

/**
 * Ventana activa en un corte exclusivo T: creado antes de T y sin fin real
 * anterior a T. Sustituye a `created_at < T AND (closed_at IS NULL OR
 * closed_at >= T)` en toda lectura de stock.
 */
export function kpiActiveAtCutWindowSql(alias: string, cut: string): string {
  const end = kpiEffectiveEndSql(alias);
  return `${alias}.created_at < ${cut}
        AND NOT ${kpiUndatedFrozenSql(alias)}
        AND (${end} IS NULL OR ${end} >= ${cut})`;
}

/** INTER cuya afectada es la responsable `owner` (expresión SQL). */
export function kpiInterSelfDependencySql(
  alias: string,
  owner: string,
): string {
  return `(${alias}.report_kind = '${SituationReportKind.INTER_COORDINATION}'
      AND ${alias}.affected_coordination_id = ${owner})`;
}

/** «Propio» de la responsable: interno, o INTER consigo misma (K-06). */
export function kpiOwnKindSql(alias: string, owner: string): string {
  return `(${alias}.report_kind = '${SituationReportKind.INTERNAL}'
      OR ${kpiInterSelfDependencySql(alias, owner)})`;
}

/** Dependencia real hacia OTRA coordinación (K-06). */
export function kpiExternalKindSql(alias: string, owner: string): string {
  return `(${alias}.report_kind = '${SituationReportKind.INTER_COORDINATION}'
      AND ${alias}.affected_coordination_id IS DISTINCT FROM ${owner})`;
}
