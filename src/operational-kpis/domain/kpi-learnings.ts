import {
  KPI_UNCATEGORIZED_CATEGORY_CODE,
  KPI_UNCATEGORIZED_CATEGORY_ID,
  KPI_UNCATEGORIZED_CATEGORY_NAME,
} from './kpi-uncategorized-category';

/**
 * APRENDIZAJES (Director · coordinación). Módulo puro: agregados y extracto.
 *
 * Universo = el de «Solucionados» de ESTADO: problemas cuya coordinación
 * RESPONSABLE (`situations.coordination_id`) es X y cuyo `closed_at` cae en el
 * intervalo semiabierto del periodo (Bogotá). Un INTER donde X solo es la
 * afectada NO entra: su aprendizaje lo escribió el área responsable.
 *
 * Aprendizaje = fila en `situation_resolutions` con texto no vacío. Un cierre
 * sin fila (histórico, previo a la tabla) cuenta en el denominador de la
 * cobertura, nunca en el numerador.
 */

/** Longitud máxima del extracto que viaja en las fichas (caracteres). */
export const KPI_LEARNING_EXCERPT_MAX = 360;

/** Página de fichas: por defecto y tope. */
export const KPI_LEARNINGS_PAGE_DEFAULT = 20;
export const KPI_LEARNINGS_PAGE_MAX = 50;

/** Fila agregada por categoría, tal como sale del SQL. */
export interface KpiLearningCategoryCountRow {
  categoryId: string | null;
  code: string | null;
  name: string | null;
  selectable: boolean | null;
  closed: number;
  learnings: number;
}

export interface KpiLearningCategory {
  /** Id real o `KPI_UNCATEGORIZED_CATEGORY_ID` para «Sin categoría». */
  id: string;
  code: string;
  name: string;
  /** false = categoría histórica, ya no seleccionable en altas nuevas. */
  selectable: boolean;
  count: number;
}

export interface KpiLearningsSummary {
  closedCount: number;
  learningCount: number;
  /** Porcentaje entero 0–100, o null si no hubo cierres en el periodo. */
  coverage: number | null;
  /** Solo categorías con ≥ 1 aprendizaje. Cantidad ↓ · nombre ↑. */
  categories: KpiLearningCategory[];
}

export function buildLearningsSummary(
  rows: readonly KpiLearningCategoryCountRow[],
): KpiLearningsSummary {
  let closedCount = 0;
  let learningCount = 0;
  const byId = new Map<string, KpiLearningCategory>();

  for (const row of rows) {
    closedCount += row.closed;
    learningCount += row.learnings;
    if (row.learnings <= 0) continue;

    const uncategorized = row.categoryId === null;
    const id = uncategorized ? KPI_UNCATEGORIZED_CATEGORY_ID : row.categoryId!;
    const current = byId.get(id);
    if (current) {
      current.count += row.learnings;
      continue;
    }
    byId.set(id, {
      id,
      code: uncategorized ? KPI_UNCATEGORIZED_CATEGORY_CODE : (row.code ?? ''),
      // Una categoría borrada del catálogo conserva su id: no se inventa nombre.
      name: uncategorized
        ? KPI_UNCATEGORIZED_CATEGORY_NAME
        : (row.name ?? KPI_UNCATEGORIZED_CATEGORY_NAME),
      selectable: uncategorized ? false : row.selectable !== false,
      count: row.learnings,
    });
  }

  const categories = [...byId.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'),
  );

  return {
    closedCount,
    learningCount,
    coverage: learningCoverage(learningCount, closedCount),
    categories,
  };
}

/** Completitud del registro (no calidad): aprendizajes / cierres × 100. */
export function learningCoverage(
  learningCount: number,
  closedCount: number,
): number | null {
  if (closedCount <= 0) return null;
  return Math.round((Math.min(learningCount, closedCount) / closedCount) * 100);
}

/**
 * Extracto para la ficha: espacios colapsados y corte en el último límite de
 * palabra antes del máximo. Nunca parte una palabra; el texto íntegro vive en
 * el expediente.
 */
export function learningExcerpt(
  learning: string,
  max: number = KPI_LEARNING_EXCERPT_MAX,
): { excerpt: string; truncated: boolean } {
  const normalized = learning.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return { excerpt: normalized, truncated: false };
  }
  const window = normalized.slice(0, max + 1);
  const cut = window.lastIndexOf(' ');
  // Una sola «palabra» más larga que el máximo (p. ej. una URL): se corta duro.
  const head = (
    cut > 0 ? window.slice(0, cut) : normalized.slice(0, max)
  ).replace(/[\s,;:.\-–—]+$/u, '');
  return { excerpt: `${head}…`, truncated: true };
}
