export interface RoleCatalogItem {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
}

export const CATALOG_ROLES: readonly RoleCatalogItem[] = [
  {
    code: 'ADMIN',
    name: 'Administrador',
    description: 'Administración completa del sistema CUNMARK.',
    isSystem: true,
    isActive: true,
  },
  {
    code: 'DIRECTOR',
    name: 'Director',
    description: 'Visión ejecutiva y priorización institucional.',
    isSystem: true,
    isActive: true,
  },
  {
    code: 'ANALISTA',
    name: 'Analista',
    description: 'Análisis operacional e interpretación de situaciones.',
    isSystem: true,
    isActive: true,
  },
  {
    code: 'COORDINADOR',
    name: 'Coordinador',
    description: 'Gestión operativa dentro de una coordinación.',
    isSystem: true,
    isActive: true,
  },
] as const;
