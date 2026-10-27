import type { EstadoFlowSlot } from './kpi-estado-evolution-buckets';
import {
  KPI_UNCATEGORIZED_CATEGORY_CODE,
  KPI_UNCATEGORIZED_CATEGORY_ID,
  KPI_UNCATEGORIZED_CATEGORY_NAME,
} from './kpi-uncategorized-category';

/**
 * INTERNOS · RECURRENCIA DE CATEGORÍAS (FLUJO, no foto).
 *
 * Cada celda = INTERNAL de la coordinación RESPONSABLE creados (created_at,
 * Bogotá) dentro del bucket, con esa categoría. La unidad es la CATEGORÍA:
 * NOVEX no sabe si dos situaciones son «el mismo problema».
 *
 * Geometría temporal = la del Flujo de ESTADO (`buildEstadoFlowSlots`):
 * buckets futuros → null (sin dato, nunca 0); el bucket en curso cuenta hasta
 * dataTo y sí es «observado».
 */

/** Fila de la query: conteo por (bucket, categoría). */
export type KpiRecurrenceCountRow = {
  /** `dataEnd` del slot. */
  key: string;
  categoryId: string | null;
  code: string | null;
  name: string | null;
  selectable: boolean | null;
  count: number;
};

export type KpiRecurrenceCategory = {
  id: string;
  code: string;
  name: string;
  selectable: boolean;
  totalCreated: number;
  bucketsWithOccurrences: number;
  /** Alineado con los slots; null = futuro. */
  values: Array<number | null>;
};

export type KpiRecurrenceMatrix = {
  bucketTotals: Array<number | null>;
  eligibleBuckets: number;
  total: number;
  categories: KpiRecurrenceCategory[];
};

/**
 * Orden de «Más recurrentes»: constancia antes que volumen.
 *   1. buckets con al menos un registro ↓
 *   2. total ↓
 *   3. nombre (es)
 */
export function compareRecurrence(
  a: KpiRecurrenceCategory,
  b: KpiRecurrenceCategory,
): number {
  return (
    b.bucketsWithOccurrences - a.bucketsWithOccurrences ||
    b.totalCreated - a.totalCreated ||
    a.name.localeCompare(b.name, 'es') ||
    a.id.localeCompare(b.id)
  );
}

export function buildRecurrenceMatrix(
  slots: readonly EstadoFlowSlot[],
  rows: readonly KpiRecurrenceCountRow[],
): KpiRecurrenceMatrix {
  const index = new Map<string, number>();
  slots.forEach((slot, i) => {
    if (slot.dataEnd) index.set(slot.dataEnd, i);
  });
  const empty = () =>
    slots.map((slot): number | null => (slot.dataEnd ? 0 : null));

  const byCategory = new Map<string, KpiRecurrenceCategory>();
  const bucketTotals = empty();
  for (const row of rows) {
    const i = index.get(row.key);
    if (i === undefined || row.count <= 0) continue;
    const id = row.categoryId ?? KPI_UNCATEGORIZED_CATEGORY_ID;
    let category = byCategory.get(id);
    if (!category) {
      category = {
        id,
        code: row.categoryId
          ? (row.code ?? '')
          : KPI_UNCATEGORIZED_CATEGORY_CODE,
        name: row.categoryId
          ? (row.name ?? '')
          : KPI_UNCATEGORIZED_CATEGORY_NAME,
        selectable: row.categoryId ? row.selectable !== false : false,
        totalCreated: 0,
        bucketsWithOccurrences: 0,
        values: empty(),
      };
      byCategory.set(id, category);
    }
    category.values[i] = (category.values[i] ?? 0) + row.count;
    bucketTotals[i] = (bucketTotals[i] ?? 0) + row.count;
  }

  const categories = [...byCategory.values()].map(
    (category): KpiRecurrenceCategory => {
      const present = category.values.filter(
        (v): v is number => v !== null && v > 0,
      );
      return {
        ...category,
        totalCreated: present.reduce((sum, v) => sum + v, 0),
        bucketsWithOccurrences: present.length,
      };
    },
  );
  categories.sort(compareRecurrence);

  return {
    bucketTotals,
    eligibleBuckets: slots.filter((slot) => slot.dataEnd !== null).length,
    total: categories.reduce((sum, c) => sum + c.totalCreated, 0),
    categories,
  };
}
