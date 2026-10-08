import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { OperationalKpiResolutionBandKey } from './dto/operational-kpi-state.dto';
import { Situation } from '../situations/entities/situation.entity';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
import {
  KPI_RESOLUTION_BANDS,
  type KpiResolutionStats,
  type KpiResolutionSummaryRow,
} from './domain/kpi-estado-resolution';

/**
 * Duración EXACTA en segundos entre dos instantes absolutos: la zona horaria
 * no la altera (Bogotá solo define los cortes de periodo y buckets).
 * GREATEST(0, …) protege contra datos corruptos (closed_at < created_at, hoy 0
 * casos): excluirlos rompería la cuadratura con «Solucionados».
 */
const DURATION_SECONDS =
  'GREATEST(0, extract(epoch FROM (s.closed_at - s.created_at)))::float8';

/**
 * Universo = el de «Solucionados» de Movimiento (aggregateEventMetric CLOSED
 * sin filtro): coordination_id = X, cualquier report_kind, closed_at dentro
 * del intervalo semiabierto. INTER donde X solo es la afectada queda fuera
 * porque su coordination_id es otra. No se filtra por status: manda closed_at.
 */
const UNIVERSE = `s.coordination_id = $1 AND s.closed_at IS NOT NULL`;

/**
 * RESOLUCIÓN (ESTADO): dos consultas set-based, constantes en número de
 * buckets (ciclo → 6 meses, mes → semanas, semana → días).
 */
@Injectable()
export class OperationalKpiResolutionRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  /**
   * Query 1 · evolución: COUNT / mediana / P75 por bucket (VALUES + LEFT JOIN
   * + GROUP BY, mismo patrón que aggregateEventMetric). Clave = bucket.end
   * (= dataEnd del flow slot), igual que los «Solucionados».
   */
  async aggregateByBucket(
    coordinationId: string,
    buckets: readonly KpiHistoryBucket[],
  ): Promise<Map<string, KpiResolutionStats>> {
    const stats = new Map<string, KpiResolutionStats>();
    if (buckets.length === 0) {
      return stats;
    }
    const params: unknown[] = [coordinationId];
    const tuples = buckets.map((bucket, i) => {
      const base = 2 + i * 3;
      params.push(
        bogotaDayStartIso(bucket.start),
        bucket.endExclusiveIso,
        bucket.end,
      );
      return `($${base}::timestamptz, $${base + 1}::timestamptz, $${base + 2}::text)`;
    });
    const sql = `
      SELECT
        b.key AS key,
        COUNT(s.id)::int AS closed_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ${DURATION_SECONDS} / 86400.0) AS median_days,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY ${DURATION_SECONDS} / 86400.0) AS p75_days
      FROM (VALUES ${tuples.join(', ')}) AS b(start_at, end_exclusive, key)
      LEFT JOIN situations s
        ON ${UNIVERSE}
        AND s.closed_at >= b.start_at
        AND s.closed_at < b.end_exclusive
      GROUP BY b.key, b.start_at
      ORDER BY b.start_at
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<{
        key: string;
        closed_count: string | number;
        median_days: string | number | null;
        p75_days: string | number | null;
      }>
    >(sql, params);
    for (const row of rows) {
      const closedCount = Number(row.closed_count);
      stats.set(row.key, {
        closedCount,
        medianDays: closedCount > 0 ? toNumber(row.median_days) : null,
        p75Days: closedCount > 0 ? toNumber(row.p75_days) : null,
      });
    }
    return stats;
  }

  /**
   * Query 2 · periodo completo [from 00:00, dataTo + 1 00:00) Bogotá:
   * closedCount, mediana, P75 y conteo por rango en una sola pasada.
   */
  async aggregateSummary(
    coordinationId: string,
    fromYmd: string,
    dataToYmd: string,
  ): Promise<KpiResolutionSummaryRow> {
    const bandColumns = KPI_RESOLUTION_BANDS.map((band, i) => {
      const lower = `${DURATION_SECONDS} >= ${band.fromHours * 3600}`;
      const upper =
        band.toHours === null
          ? ''
          : ` AND ${DURATION_SECONDS} < ${band.toHours * 3600}`;
      return `COUNT(*) FILTER (WHERE ${lower}${upper})::int AS band_${i}`;
    });
    const sql = `
      SELECT
        COUNT(*)::int AS closed_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ${DURATION_SECONDS} / 86400.0) AS median_days,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY ${DURATION_SECONDS} / 86400.0) AS p75_days,
        ${bandColumns.join(',\n        ')}
      FROM situations s
      WHERE ${UNIVERSE}
        AND s.closed_at >= $2::timestamptz
        AND s.closed_at < $3::timestamptz
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<Record<string, string | number | null>>
    >(sql, [
      coordinationId,
      bogotaDayStartIso(fromYmd),
      bogotaDayEndExclusiveIso(dataToYmd),
    ]);
    const row = rows[0] ?? {};
    const closedCount = Number(row.closed_count ?? 0);
    const bandCounts = Object.fromEntries(
      KPI_RESOLUTION_BANDS.map((band, i) => [
        band.key,
        Number(row[`band_${i}`] ?? 0),
      ]),
    ) as Record<OperationalKpiResolutionBandKey, number>;
    return {
      closedCount,
      medianDays: closedCount > 0 ? toNumber(row.median_days ?? null) : null,
      p75Days: closedCount > 0 ? toNumber(row.p75_days ?? null) : null,
      bandCounts,
    };
  }
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
