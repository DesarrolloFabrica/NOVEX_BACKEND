import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SituationReportKind } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayEndInclusiveIso,
  bogotaDayStartIso,
  parseYmd,
} from './domain/kpi-history-buckets';
import {
  KPI_UNCATEGORIZED_CATEGORY_CODE,
  KPI_UNCATEGORIZED_CATEGORY_ID,
  KPI_UNCATEGORIZED_CATEGORY_NAME,
} from './domain/kpi-uncategorized-category';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';

export type KpiBreakdownCategoryRow = {
  categoryId: string;
  code: string;
  name: string;
  selectable: boolean;
  value: number;
};

/**
 * Breakdown INTERNAL por categoría (GROUP BY category_id).
 *
 * Índices futuros recomendados (sin migración ahora):
 *   (report_kind, coordination_id, category_id, created_at)
 *   (report_kind, coordination_id, category_id, closed_at)
 */
@Injectable()
export class OperationalKpiBreakdownRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async aggregateByCategory(
    coordinationId: string,
    metric: OperationalKpiHistoryMetric,
    fromYmd: string,
    toYmd: string,
  ): Promise<KpiBreakdownCategoryRow[]> {
    parseYmd(fromYmd);
    parseYmd(toYmd);

    if (metric === OperationalKpiHistoryMetric.BACKLOG) {
      return this.aggregateBacklog(coordinationId, toYmd);
    }

    const column =
      metric === OperationalKpiHistoryMetric.CREATED
        ? 's.created_at'
        : 's.closed_at';
    const startIso = bogotaDayStartIso(fromYmd);
    const endExclusive = bogotaDayEndExclusiveIso(toYmd);

    const sql = `
      SELECT
        s.category_id AS "categoryId",
        c.code AS code,
        c.name AS name,
        c.is_selectable AS selectable,
        COUNT(s.id)::int AS value
      FROM situations s
      LEFT JOIN incident_categories c ON c.id = s.category_id
      WHERE s.coordination_id = $1
        AND s.report_kind = $2
        AND ${column} IS NOT NULL
        AND ${column} >= $3
        AND ${column} < $4
      GROUP BY s.category_id, c.code, c.name, c.is_selectable
      ORDER BY value DESC, COALESCE(c.name, $5) ASC
    `;

    const rows = (await this.situationsRepository.manager.query(sql, [
      coordinationId,
      SituationReportKind.INTERNAL,
      startIso,
      endExclusive,
      KPI_UNCATEGORIZED_CATEGORY_NAME,
    ])) as Array<{
      categoryId: string | null;
      code: string | null;
      name: string | null;
      selectable: boolean | null;
      value: string | number;
    }>;

    return rows.map((row) => this.mapRow(row));
  }

  private async aggregateBacklog(
    coordinationId: string,
    atYmd: string,
  ): Promise<KpiBreakdownCategoryRow[]> {
    const endInclusive = bogotaDayEndInclusiveIso(atYmd);
    const sql = `
      SELECT
        s.category_id AS "categoryId",
        c.code AS code,
        c.name AS name,
        c.is_selectable AS selectable,
        COUNT(s.id)::int AS value
      FROM situations s
      LEFT JOIN incident_categories c ON c.id = s.category_id
      WHERE s.coordination_id = $1
        AND s.report_kind = $2
        AND s.created_at <= $3
        AND (s.closed_at IS NULL OR s.closed_at > $3)
      GROUP BY s.category_id, c.code, c.name, c.is_selectable
      ORDER BY value DESC, COALESCE(c.name, $4) ASC
    `;

    const rows = (await this.situationsRepository.manager.query(sql, [
      coordinationId,
      SituationReportKind.INTERNAL,
      endInclusive,
      KPI_UNCATEGORIZED_CATEGORY_NAME,
    ])) as Array<{
      categoryId: string | null;
      code: string | null;
      name: string | null;
      selectable: boolean | null;
      value: string | number;
    }>;

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: {
    categoryId: string | null;
    code: string | null;
    name: string | null;
    selectable: boolean | null;
    value: string | number;
  }): KpiBreakdownCategoryRow {
    if (!row.categoryId) {
      return {
        categoryId: KPI_UNCATEGORIZED_CATEGORY_ID,
        code: KPI_UNCATEGORIZED_CATEGORY_CODE,
        name: KPI_UNCATEGORIZED_CATEGORY_NAME,
        selectable: false,
        value: Number(row.value),
      };
    }
    return {
      categoryId: row.categoryId,
      code: row.code ?? KPI_UNCATEGORIZED_CATEGORY_CODE,
      name: row.name ?? KPI_UNCATEGORIZED_CATEGORY_NAME,
      selectable: Boolean(row.selectable),
      value: Number(row.value),
    };
  }
}
