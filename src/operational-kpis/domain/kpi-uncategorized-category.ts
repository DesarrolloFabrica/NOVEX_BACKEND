/**
 * Identidad estable para INTERNAL sin category_id.
 * No es una fila de incident_categories.
 */
export const KPI_UNCATEGORIZED_CATEGORY_ID =
  '00000000-0000-4000-8000-000000000099' as const;

export const KPI_UNCATEGORIZED_CATEGORY_CODE = 'UNCATEGORIZED' as const;

export const KPI_UNCATEGORIZED_CATEGORY_NAME = 'Sin categoría' as const;

export function isUncategorizedCategoryId(categoryId: string): boolean {
  return categoryId === KPI_UNCATEGORIZED_CATEGORY_ID;
}
