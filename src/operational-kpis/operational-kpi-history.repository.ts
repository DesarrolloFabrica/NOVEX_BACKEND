import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SituationReportKind } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import {
  bogotaDayStartIso,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
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

@Injectable()
export class OperationalKpiHistoryRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async aggregateEventMetric(
    coordinationId: string,
    metric:
      | OperationalKpiHistoryMetric.CREATED
      | OperationalKpiHistoryMetric.CLOSED,
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

    const join = this.buildSituationJoin(
      filter,
      coordinationId,
      params,
      index,
    );

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
      params.push(bucket.endInclusiveIso, bucket.end);
      index += 2;
    }

    const join = this.buildSituationJoin(
      filter,
      coordinationId,
      params,
      index,
    );

    const sql = `
      SELECT b.key AS key, COUNT(s.id)::int AS total
      FROM (VALUES ${valueTuples.join(', ')}) AS b(end_at, key)
      LEFT JOIN situations s
        ON ${join.clause}
        AND s.created_at <= b.end_at
        AND (s.closed_at IS NULL OR s.closed_at > b.end_at)
      GROUP BY b.key, b.end_at
      ORDER BY b.end_at
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
