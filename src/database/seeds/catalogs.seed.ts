/**
 * Catálogos permanentes de producción.
 * Única fuente de datos insertados automáticamente al arrancar el backend.
 */

export interface OperationalAreaCatalogItem {
  code: string;
  name: string;
  description: string;
  isGlobal?: boolean;
}

export interface IncidentCategoryCatalogItem {
  code: string;
  name: string;
  description: string;
}

export const CATALOG_OPERATIONAL_AREAS: readonly OperationalAreaCatalogItem[] = [
  {
    code: 'TEC',
    name: 'Tecnologia',
    description:
      'Soporte de plataformas, infraestructura y servicios digitales.',
  },
  {
    code: 'REG',
    name: 'Registro y Control',
    description:
      'Gestion de matriculas, historia academica y registros institucionales.',
  },
  {
    code: 'ACA',
    name: 'Coordinacion Academica',
    description:
      'Programacion academica, carga docente y seguimiento curricular.',
  },
  {
    code: 'FIN',
    name: 'Financiera',
    description: 'Pagos, conciliaciones y habilitaciones administrativas.',
  },
  {
    code: 'BIEN',
    name: 'Bienestar Universitario',
    description: 'Atencion, acompanamiento y comunicaciones a estudiantes.',
  },
  {
    code: 'DIR',
    name: 'Direccion de Operaciones',
    description: 'Coordinacion ejecutiva y priorizacion transversal.',
    isGlobal: true,
  },
] as const;

export const CATALOG_INCIDENT_CATEGORIES: readonly IncidentCategoryCatalogItem[] =
  [
    {
      code: 'PLATFORM_OUTAGE',
      name: 'Caida de plataforma critica',
      description:
        'Indisponibilidad o falla severa de un sistema institucional.',
    },
    {
      code: 'ACADEMIC_INCONSISTENCY',
      name: 'Inconsistencia academica',
      description:
        'Errores de programacion, cupos, horarios o configuracion curricular.',
    },
    {
      code: 'TECH_DEGRADATION',
      name: 'Degradacion tecnologica',
      description: 'Lentitud o intermitencia con impacto acotado.',
    },
    {
      code: 'RESOLVED_SERVICE_EVENT',
      name: 'Incidente operacional resuelto',
      description:
        'Situacion cerrada con evidencia de mitigacion y resultado final.',
    },
  ] as const;

/** Identificador histórico de datos demo eliminados en arranque. */
export const DEMO_SEED_SOURCE = 'seed';
