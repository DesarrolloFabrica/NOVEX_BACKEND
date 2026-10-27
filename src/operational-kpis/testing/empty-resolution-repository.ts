import type { KpiHistoryBucket } from '../domain/kpi-history-buckets';
import type { KpiResolutionStats } from '../domain/kpi-estado-resolution';

/**
 * Repositorio de Resolución SIN cierres, para specs que construyen el servicio
 * a mano y no prueban Resolución (su SQL vive en operational-kpi-resolution.pg.spec).
 */
export function emptyResolutionRepository() {
  return {
    aggregateByBucket: (_id: string, buckets: readonly KpiHistoryBucket[]) =>
      Promise.resolve(
        new Map<string, KpiResolutionStats>(
          buckets.map((b) => [
            b.end,
            { closedCount: 0, medianDays: null, p75Days: null },
          ]),
        ),
      ),
    aggregateSummary: () =>
      Promise.resolve({
        closedCount: 0,
        medianDays: null,
        p75Days: null,
        bandCounts: {
          'lt-1d': 0,
          '1-3d': 0,
          '3-7d': 0,
          '7-14d': 0,
          '14-30d': 0,
          '30d+': 0,
        },
      }),
  };
}
