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
  isSelectable?: boolean;
  icon: string;
}

export const CATALOG_OPERATIONAL_AREAS: readonly OperationalAreaCatalogItem[] =
  [
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
      isSelectable: false,
      icon: 'apps',
    },
    {
      code: 'ACADEMIC_INCONSISTENCY',
      name: 'Inconsistencia academica',
      description:
        'Errores de programacion, cupos, horarios o configuracion curricular.',
      isSelectable: false,
      icon: 'diplomas',
    },
    {
      code: 'TECH_DEGRADATION',
      name: 'Degradacion tecnologica',
      description: 'Lentitud o intermitencia con impacto acotado.',
      isSelectable: false,
      icon: 'apps',
    },
    {
      code: 'RESOLVED_SERVICE_EVENT',
      name: 'Incidente operacional resuelto',
      description:
        'Situacion cerrada con evidencia de mitigacion y resultado final.',
      isSelectable: false,
      icon: 'tickets',
    },
    {
      code: 'INFRAESTRUCTURA',
      name: 'Infraestructura',
      description: 'Sedes, espacios, conectividad física y recursos de planta.',
      icon: 'infrastructure',
    },
    {
      code: 'EQUIPOS',
      name: 'Equipos',
      description:
        'Hardware, dispositivos y fallas de equipos institucionales.',
      icon: 'devices',
    },
    {
      code: 'INTERNET',
      name: 'Internet',
      description: 'Red, wifi, cortes o intermitencia de conectividad.',
      icon: 'internet',
    },
    {
      code: 'APLICATIVOS',
      name: 'Aplicativos',
      description:
        'Plataformas y sistemas institucionales distintos a Zoho, Iceberg o ACAS.',
      icon: 'apps',
    },
    {
      code: 'ZOHO',
      name: 'Zoho',
      description: 'Incidentes y bloqueos asociados a Zoho.',
      icon: 'zoho',
    },
    {
      code: 'ICEBERG',
      name: 'Iceberg',
      description: 'Incidentes y bloqueos asociados a Iceberg.',
      icon: 'iceberg',
    },
    {
      code: 'ACAS',
      name: 'ACAS',
      description: 'Incidentes y bloqueos asociados a ACAS.',
      icon: 'acas',
    },
    {
      code: 'DIPLOMADOS',
      name: 'Diplomados',
      description: 'Programación, cupos y operación de diplomados.',
      icon: 'diplomas',
    },
    {
      code: 'TICKETS',
      name: 'Tickets',
      description: 'Casos de mesa de ayuda y tickets de soporte.',
      icon: 'tickets',
    },
  ] as const;

/** Identificador histórico de datos demo eliminados en arranque. */
export const DEMO_SEED_SOURCE = 'seed';
