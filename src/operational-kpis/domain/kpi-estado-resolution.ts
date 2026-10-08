import type {
  OperationalKpiResolutionBandKey,
  OperationalKpiStateResolutionDto,
} from '../dto/operational-kpi-state.dto';
import type { EstadoFlowSlot } from './kpi-estado-evolution-buckets';

/**
 * Rangos de TIEMPO HASTA SOLUCIÓN, semiabiertos [fromHours, toHours) sobre la
 * duración exacta. Las fronteras coinciden con los plazos de SLA por severidad
 * (24 h · 72 h · 7 d · 14 d) pero son DESCRIPTIVAS: no afirman cumplimiento,
 * porque el objetivo depende de la severidad de cada problema.
 * No copian los de Antigüedad (días enteros 0–7 … 31+): aquí la duración es
 * continua y los tramos cortos (horas, 1–3 días) importan.
 */
export const KPI_RESOLUTION_BANDS: ReadonlyArray<{
  key: OperationalKpiResolutionBandKey;
  fromHours: number;
  toHours: number | null;
}> = [
  { key: 'lt-1d', fromHours: 0, toHours: 24 },
  { key: '1-3d', fromHours: 24, toHours: 72 },
  { key: '3-7d', fromHours: 72, toHours: 168 },
  { key: '7-14d', fromHours: 168, toHours: 336 },
  { key: '14-30d', fromHours: 336, toHours: 720 },
  { key: '30d+', fromHours: 720, toHours: null },
];

/** Banda de una duración en horas (exactamente una). */
export function resolutionBandOf(
  hours: number,
): OperationalKpiResolutionBandKey {
  const band = KPI_RESOLUTION_BANDS.find(
    (b) => hours >= b.fromHours && (b.toHours === null || hours < b.toHours),
  );
  // Duraciones negativas no existen (el repositorio las acota a 0).
  return band?.key ?? 'lt-1d';
}

/** Estadística de un conjunto de cierres (bucket o periodo completo). */
export type KpiResolutionStats = {
  closedCount: number;
  medianDays: number | null;
  p75Days: number | null;
};

export type KpiResolutionSummaryRow = KpiResolutionStats & {
  /** Conteo por banda, en el orden de KPI_RESOLUTION_BANDS. */
  bandCounts: Record<OperationalKpiResolutionBandKey, number>;
};

/**
 * Sección `resolution` de ESTADO (FLOW OUTCOME · TIME SERIES · COORDINATION).
 *
 * - Agrupada por FECHA DE CIERRE: «lo que salió del sistema en el bucket,
 *   ¿cuánto tardó desde su registro?». Abiertos no entran (son Antigüedad).
 * - Buckets 1:1 con evolution.buckets (mismos flowSlots, misma clave dataEnd
 *   que «Solucionados»): futuro → null; pasado sin cierres → 0 / null / null.
 * - La mediana del periodo NO es la mediana de las medianas: viene de su
 *   propia agregación sobre todos los cierres del periodo.
 * - Atribución: coordination_id ACTUAL (reasignaciones posteriores al cierre
 *   mueven el problema; no hay historial fiable de ownership).
 */
export function buildEstadoResolution(input: {
  slots: readonly EstadoFlowSlot[];
  byBucket: ReadonlyMap<string, KpiResolutionStats>;
  summary: KpiResolutionSummaryRow;
}): OperationalKpiStateResolutionDto {
  const { slots, byBucket, summary } = input;
  return {
    semantics: 'closed-in-period-duration-since-created',
    closedCount: summary.closedCount,
    medianDays: summary.closedCount > 0 ? summary.medianDays : null,
    p75Days: summary.closedCount > 0 ? summary.p75Days : null,
    buckets: slots.map((slot) => {
      if (!slot.dataEnd) {
        return {
          start: slot.bucket.start,
          closedCount: null,
          medianDays: null,
          p75Days: null,
        };
      }
      const stats = byBucket.get(slot.dataEnd);
      const closedCount = stats?.closedCount ?? 0;
      return {
        start: slot.bucket.start,
        closedCount,
        medianDays: closedCount > 0 ? (stats?.medianDays ?? null) : null,
        p75Days: closedCount > 0 ? (stats?.p75Days ?? null) : null,
      };
    }),
    distribution: KPI_RESOLUTION_BANDS.map((band) => ({
      key: band.key,
      fromHours: band.fromHours,
      toHours: band.toHours,
      count: summary.bandCounts[band.key] ?? 0,
    })),
  };
}
