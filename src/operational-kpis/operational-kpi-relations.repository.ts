import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SituationReportKind } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
  parseYmd,
} from './domain/kpi-history-buckets';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';
import { kpiNotCancelledSql } from './domain/kpi-excluded-statuses';
import { kpiActiveAtCutWindowSql } from './domain/kpi-population';
import { responsibleCoordinationAtSql } from './domain/kpi-responsibility-at';

export type KpiRelationRow = {
  coordinationId: string;
  code: string;
  name: string;
  shortName: string;
  value: number;
};

/**
 * Agregación INTER por pareja de coordinaciones.
 * Índices futuros: (report_kind, coordination_id, affected_coordination_id, created_at)
 */
@Injectable()
export class OperationalKpiRelationsRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async aggregateCommitments(
    coordinationId: string,
    metric: OperationalKpiHistoryMetric,
    fromYmd: string,
    toYmd: string,
  ): Promise<KpiRelationRow[]> {
    // Yo responsable → otra afectada
    return this.aggregateSide({
      coordinationId,
      metric,
      fromYmd,
      toYmd,
      partnerColumn: 's.affected_coordination_id',
      ownerColumn: 's.coordination_id',
    });
  }

  async aggregateDependencies(
    coordinationId: string,
    metric: OperationalKpiHistoryMetric,
    fromYmd: string,
    toYmd: string,
  ): Promise<KpiRelationRow[]> {
    // Otra responsable → yo afectada
    return this.aggregateSide({
      coordinationId,
      metric,
      fromYmd,
      toYmd,
      partnerColumn: 's.coordination_id',
      ownerColumn: 's.affected_coordination_id',
    });
  }

  private async aggregateSide(args: {
    coordinationId: string;
    metric: OperationalKpiHistoryMetric;
    fromYmd: string;
    toYmd: string;
    partnerColumn: string;
    ownerColumn: string;
  }): Promise<KpiRelationRow[]> {
    parseYmd(args.fromYmd);
    parseYmd(args.toYmd);

    if (args.metric === OperationalKpiHistoryMetric.BACKLOG) {
      // Corte semiabierto: stock al instante 00:00 del día siguiente (Bogotá),
      // misma semántica que el backlog de /history y /state.
      const endExclusive = bogotaDayEndExclusiveIso(args.toYmd);
      const historicalOwner = (column: string) =>
        column === 's.coordination_id'
          ? responsibleCoordinationAtSql(
              's',
              '$3::timestamptz',
              'exclusive-cut',
            )
          : column;
      const partnerColumn = historicalOwner(args.partnerColumn);
      const ownerColumn = historicalOwner(args.ownerColumn);
      const sql = `
        SELECT
          ${partnerColumn} AS "coordinationId",
          c.code AS code,
          c.name AS name,
          c.short_name AS "shortName",
          COUNT(s.id)::int AS value
        FROM situations s
        INNER JOIN coordinations c ON c.id = ${partnerColumn}
        WHERE ${ownerColumn} = $1
          AND ${kpiNotCancelledSql()}
          AND s.report_kind = $2
          AND ${partnerColumn} IS NOT NULL
          AND ${partnerColumn} IS DISTINCT FROM $1
          AND ${kpiActiveAtCutWindowSql('s', '$3')}
        GROUP BY ${partnerColumn}, c.code, c.name, c.short_name
        ORDER BY value DESC, c.short_name ASC
      `;
      return this.mapRows(
        await this.situationsRepository.manager.query(sql, [
          args.coordinationId,
          SituationReportKind.INTER_COORDINATION,
          endExclusive,
        ]),
      );
    }

    const column =
      args.metric === OperationalKpiHistoryMetric.CREATED
        ? 's.created_at'
        : 's.closed_at';
    const historicalOwner = (candidate: string) =>
      candidate === 's.coordination_id'
        ? responsibleCoordinationAtSql('s', column)
        : candidate;
    const partnerColumn = historicalOwner(args.partnerColumn);
    const ownerColumn = historicalOwner(args.ownerColumn);
    const startIso = bogotaDayStartIso(args.fromYmd);
    const endExclusive = bogotaDayEndExclusiveIso(args.toYmd);
    const sql = `
      SELECT
        ${partnerColumn} AS "coordinationId",
        c.code AS code,
        c.name AS name,
        c.short_name AS "shortName",
        COUNT(s.id)::int AS value
      FROM situations s
      INNER JOIN coordinations c ON c.id = ${partnerColumn}
      WHERE ${ownerColumn} = $1
          AND ${kpiNotCancelledSql()}
        AND s.report_kind = $2
        AND ${partnerColumn} IS NOT NULL
        AND ${partnerColumn} IS DISTINCT FROM $1
        AND ${column} IS NOT NULL
        AND ${column} >= $3
        AND ${column} < $4
      GROUP BY ${args.partnerColumn}, c.code, c.name, c.short_name
      ORDER BY value DESC, c.short_name ASC
    `;
    return this.mapRows(
      await this.situationsRepository.manager.query(sql, [
        args.coordinationId,
        SituationReportKind.INTER_COORDINATION,
        startIso,
        endExclusive,
      ]),
    );
  }

  private mapRows(
    rows: Array<{
      coordinationId: string;
      code: string;
      name: string;
      shortName: string;
      value: string | number;
    }>,
  ): KpiRelationRow[] {
    return rows.map((row) => ({
      coordinationId: row.coordinationId,
      code: row.code,
      name: row.name,
      shortName: row.shortName,
      value: Number(row.value),
    }));
  }
}
