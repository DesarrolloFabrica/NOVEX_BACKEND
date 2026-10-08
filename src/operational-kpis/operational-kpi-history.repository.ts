import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SituationReportKind } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import {
  bogotaDayStartIso,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
import {
  KPI_UNCATEGORIZED_CATEGORY_CODE,
  KPI_UNCATEGORIZED_CATEGORY_ID,
  KPI_UNCATEGORIZED_CATEGORY_NAME,
} from './domain/kpi-uncategorized-category';
import { activeAtCutCondition } from './domain/kpi-active-at-cut';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';

/**
 * Filtro opcional de serie histórica.
 * - reportKind INTERNAL + categoryId: modo INTERNOS.
 * - partner: INTER entre esta coordinación y un partner.
 * - sin filtro → histórico global (INTERNAL + INTER).
 */
export type KpiHistorySeriesFilter = {
  reportKind?: SituationReportKind.INTERNAL;
  categoryId?: string | null;
  partner?: {
    ownerCoordinationId: string;
    partnerCoordinationId: string;
    side: 'commitment' | 'dependency';
  };
};

export type KpiActiveCategoryRow = {
  key: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  selectable: boolean;
  count: number;
};

export type KpiActiveCoordinationRow = {
  key: string;
  coordinationId: string | null;
  coordinationCode: string | null;
  coordinationName: string;
  count: number;
};

@Injectable()
export class OperationalKpiHistoryRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async aggregateEventMetric(
    coordinationId: string,
    metric:
      OperationalKpiHistoryMetric.CREATED | OperationalKpiHistoryMetric.CLOSED,
    buckets: readonly KpiHistoryBucket[],
    filter: KpiHistorySeriesFilter = {},
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const bucket of buckets) {
      counts.set(bucket.end, 0);
    }
    if (buckets.length === 0) {
      return counts;
    }

    const column =
      metric === OperationalKpiHistoryMetric.CREATED
        ? 's.created_at'
        : 's.closed_at';

    const valueTuples: string[] = [];
    const params: unknown[] = [];
    let index = 1;
    for (const bucket of buckets) {
      valueTuples.push(
        `($${index}::timestamptz, $${index + 1}::timestamptz, $${index + 2}::text)`,
      );
      params.push(
        bogotaDayStartIso(bucket.start),
        bucket.endExclusiveIso,
        bucket.end,
      );
      index += 3;
    }

    const join = this.buildSituationJoin(filter, coordinationId, params, index);

    const sql = `
      SELECT b.key AS key, COUNT(s.id)::int AS total
      FROM (VALUES ${valueTuples.join(', ')}) AS b(start_at, end_exclusive, key)
      LEFT JOIN situations s
        ON ${join.clause}
        AND ${column} IS NOT NULL
        AND ${column} >= b.start_at
        AND ${column} < b.end_exclusive
      GROUP BY b.key, b.start_at
      ORDER BY b.start_at
    `;

    const rows = (await this.situationsRepository.manager.query(
      sql,
      params,
    )) as Array<{ key: string; total: string | number }>;

    for (const row of rows) {
      counts.set(row.key, Number(row.total));
    }
    return counts;
  }

  async aggregateBacklog(
    coordinationId: string,
    buckets: readonly KpiHistoryBucket[],
    filter: KpiHistorySeriesFilter = {},
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const bucket of buckets) {
      counts.set(bucket.end, 0);
    }
    if (buckets.length === 0) {
      return counts;
    }

    const valueTuples: string[] = [];
    const params: unknown[] = [];
    let index = 1;
    for (const bucket of buckets) {
      valueTuples.push(`($${index}::timestamptz, $${index + 1}::text)`);
      // Corte semiabierto: stock al instante 00:00 del día siguiente (Bogotá).
      // Evita el hueco de «23:59:59.999» frente a los microsegundos de Postgres.
      params.push(bucket.endExclusiveIso, bucket.end);
      index += 2;
    }

    const join = this.buildSituationJoin(filter, coordinationId, params, index);

    const sql = `
      SELECT b.key AS key, COUNT(s.id)::int AS total
      FROM (VALUES ${valueTuples.join(', ')}) AS b(end_exclusive, key)
      LEFT JOIN situations s
        ON ${join.clause}
        AND s.created_at < b.end_exclusive
        AND (s.closed_at IS NULL OR s.closed_at >= b.end_exclusive)
      GROUP BY b.key, b.end_exclusive
      ORDER BY b.end_exclusive
    `;

    const rows = (await this.situationsRepository.manager.query(
      sql,
      params,
    )) as Array<{ key: string; total: string | number }>;

    for (const row of rows) {
      counts.set(row.key, Number(row.total));
    }
    return counts;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * CARGA DE PROBLEMAS (ESTADO): stock ACTIVO al cierre de cada bucket para
   * la coordinación RESPONSABLE (coordination_id = X).
   * - Interno: report_kind = INTERNAL.
   * - Externo: report_kind = INTER_COORDINATION y affected ≠ X (otra área
   *   afectada cuya resolución corresponde a X). Lo que X sufre de otras
   *   áreas (affected = X, responsable ≠ X) es DEPENDENCIAS, no se cuenta.
   * Corte semiabierto: created_at < T AND (closed_at IS NULL OR closed_at >= T).
   * Una query por agregación para TODOS los buckets (no crece con N).
   * Limitación: coordination_id / report_kind / category_id son los ACTUALES
   * (no hay snapshot histórico de reasignaciones ni de recategorizaciones).
   * ───────────────────────────────────────────────────────────────────── */

  private activeCut(buckets: readonly KpiHistoryBucket[]) {
    const tuples: string[] = [];
    const params: unknown[] = [];
    buckets.forEach((bucket, i) => {
      tuples.push(`($${i * 2 + 1}::timestamptz, $${i * 2 + 2}::text)`);
      params.push(bucket.endExclusiveIso, bucket.end);
    });
    return { values: tuples.join(', '), params, next: buckets.length * 2 + 1 };
  }

  /** Internos y externos activos al cierre de cada bucket (total = suma). */
  async aggregateActiveByKind(
    coordinationId: string,
    buckets: readonly KpiHistoryBucket[],
  ): Promise<Map<string, { internal: number; external: number }>> {
    const counts = new Map<string, { internal: number; external: number }>();
    for (const bucket of buckets) {
      counts.set(bucket.end, { internal: 0, external: 0 });
    }
    if (buckets.length === 0) return counts;

    const cut = this.activeCut(buckets);
    const owner = cut.next;
    const internal = cut.next + 1;
    const external = cut.next + 2;
    const sql = `
      SELECT
        b.key AS key,
        COUNT(s.id) FILTER (WHERE s.report_kind = $${internal})::int AS internal,
        COUNT(s.id) FILTER (WHERE s.report_kind = $${external})::int AS external
      FROM (VALUES ${cut.values}) AS b(end_exclusive, key)
      LEFT JOIN situations s
        ON ${activeAtCutCondition({
          alias: 's',
          owner: `$${owner}`,
          cut: 'b.end_exclusive',
          internal: `$${internal}`,
          inter: `$${external}`,
        })}
      GROUP BY b.key, b.end_exclusive
      ORDER BY b.end_exclusive
    `;
    const rows = (await this.situationsRepository.manager.query(sql, [
      ...cut.params,
      coordinationId,
      SituationReportKind.INTERNAL,
      SituationReportKind.INTER_COORDINATION,
    ])) as Array<{
      key: string;
      internal: string | number;
      external: string | number;
    }>;
    for (const row of rows) {
      counts.set(row.key, {
        internal: Number(row.internal),
        external: Number(row.external),
      });
    }
    return counts;
  }

  /** Internos activos al cierre de cada bucket, por categoría (actual). */
  async aggregateActiveInternalByCategory(
    coordinationId: string,
    buckets: readonly KpiHistoryBucket[],
  ): Promise<KpiActiveCategoryRow[]> {
    if (buckets.length === 0) return [];
    const cut = this.activeCut(buckets);
    const sql = `
      SELECT
        b.key AS key,
        s.category_id AS "categoryId",
        c.code AS code,
        c.name AS name,
        c.is_selectable AS selectable,
        COUNT(s.id)::int AS count
      FROM (VALUES ${cut.values}) AS b(end_exclusive, key)
      INNER JOIN situations s
        ON s.coordination_id = $${cut.next}
        AND s.report_kind = $${cut.next + 1}
        AND s.created_at < b.end_exclusive
        AND (s.closed_at IS NULL OR s.closed_at >= b.end_exclusive)
      LEFT JOIN incident_categories c ON c.id = s.category_id
      GROUP BY b.key, s.category_id, c.code, c.name, c.is_selectable
    `;
    const rows = (await this.situationsRepository.manager.query(sql, [
      ...cut.params,
      coordinationId,
      SituationReportKind.INTERNAL,
    ])) as Array<{
      key: string;
      categoryId: string | null;
      code: string | null;
      name: string | null;
      selectable: boolean | null;
      count: string | number;
    }>;
    return rows.map((row) =>
      row.categoryId
        ? {
            key: row.key,
            categoryId: row.categoryId,
            categoryCode: row.code ?? KPI_UNCATEGORIZED_CATEGORY_CODE,
            categoryName: row.name ?? KPI_UNCATEGORIZED_CATEGORY_NAME,
            selectable: Boolean(row.selectable),
            count: Number(row.count),
          }
        : {
            key: row.key,
            categoryId: KPI_UNCATEGORIZED_CATEGORY_ID,
            categoryCode: KPI_UNCATEGORIZED_CATEGORY_CODE,
            categoryName: KPI_UNCATEGORIZED_CATEGORY_NAME,
            selectable: false,
            count: Number(row.count),
          },
    );
  }

  /** Externos activos al cierre de cada bucket, por coordinación afectada. */
  async aggregateActiveExternalByCoordination(
    coordinationId: string,
    buckets: readonly KpiHistoryBucket[],
  ): Promise<KpiActiveCoordinationRow[]> {
    if (buckets.length === 0) return [];
    const cut = this.activeCut(buckets);
    const owner = cut.next;
    const sql = `
      SELECT
        b.key AS key,
        s.affected_coordination_id AS "coordinationId",
        c.code AS code,
        c.name AS name,
        c.short_name AS "shortName",
        COUNT(s.id)::int AS count
      FROM (VALUES ${cut.values}) AS b(end_exclusive, key)
      INNER JOIN situations s
        ON s.coordination_id = $${owner}
        AND s.report_kind = $${owner + 1}
        AND s.affected_coordination_id IS DISTINCT FROM $${owner}
        AND s.created_at < b.end_exclusive
        AND (s.closed_at IS NULL OR s.closed_at >= b.end_exclusive)
      LEFT JOIN coordinations c ON c.id = s.affected_coordination_id
      GROUP BY b.key, s.affected_coordination_id, c.code, c.name, c.short_name
    `;
    const rows = (await this.situationsRepository.manager.query(sql, [
      ...cut.params,
      coordinationId,
      SituationReportKind.INTER_COORDINATION,
    ])) as Array<{
      key: string;
      coordinationId: string | null;
      code: string | null;
      name: string | null;
      shortName: string | null;
      count: string | number;
    }>;
    return rows.map((row) => ({
      key: row.key,
      coordinationId: row.coordinationId,
      coordinationCode: row.code,
      coordinationName:
        row.shortName ?? row.name ?? 'Sin coordinación afectada',
      count: Number(row.count),
    }));
  }

  private buildSituationJoin(
    filter: KpiHistorySeriesFilter,
    coordinationId: string,
    params: unknown[],
    startIndex: number,
  ): { clause: string } {
    let index = startIndex;

    if (filter.partner) {
      params.push(SituationReportKind.INTER_COORDINATION);
      const kindParam = index;
      index += 1;
      params.push(filter.partner.ownerCoordinationId);
      const ownerParam = index;
      index += 1;
      params.push(filter.partner.partnerCoordinationId);
      const partnerParam = index;

      if (filter.partner.side === 'commitment') {
        return {
          clause: `s.report_kind = $${kindParam}
            AND s.coordination_id = $${ownerParam}
            AND s.affected_coordination_id = $${partnerParam}`,
        };
      }
      return {
        clause: `s.report_kind = $${kindParam}
          AND s.coordination_id = $${partnerParam}
          AND s.affected_coordination_id = $${ownerParam}`,
      };
    }

    params.push(coordinationId);
    const ownerParam = index;
    index += 1;
    const parts = [`s.coordination_id = $${ownerParam}`];

    if (filter.reportKind) {
      parts.push(`AND s.report_kind = $${index}`);
      params.push(filter.reportKind);
      index += 1;
    }

    if (filter.categoryId === null) {
      parts.push('AND s.category_id IS NULL');
    } else if (typeof filter.categoryId === 'string') {
      parts.push(`AND s.category_id = $${index}`);
      params.push(filter.categoryId);
      index += 1;
    }

    return { clause: parts.join(' ') };
  }
}
