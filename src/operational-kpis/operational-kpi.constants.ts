import { CATALOG_COORDINATIONS } from '../coordinations/seeds/coordinations.catalog.seed';

export const OPERATIONAL_KPI_COMPARE_MIN = 2;

/**
 * Tope del comparador = tamaño del catálogo institucional de coordinaciones.
 * No es un 15 mágico: si el catálogo crece, el máximo crece con él.
 */
export const OPERATIONAL_KPI_COMPARE_MAX = CATALOG_COORDINATIONS.length;

export const OPERATIONAL_KPI_QUERY_BUDGET = {
  direction: 6,
  coordination: 7,
  /** Catálogo + findActiveByIds + 5 agregaciones filtradas. Constante en 2 o 15. */
  compare: 7,
  /** Catálogo lookup + 1 agregación histórica (+1 si valida categoría). */
  history: 3,
  /** Lookup coordinación + 1 GROUP BY categoría. */
  breakdown: 2,
  /** Lookup + commitments + dependencies. */
  relations: 3,
} as const;
