import { PermissionModule } from '../../common/enums/permission.enums';

export interface PermissionCatalogItem {
  code: string;
  name: string;
  module: PermissionModule;
  description: string;
}

export const CATALOG_PERMISSIONS: readonly PermissionCatalogItem[] = [
  {
    code: 'AUTH_LOGIN',
    name: 'Iniciar sesión',
    module: 'AUTH',
    description: 'Permite autenticarse en el sistema.',
  },
  {
    code: 'AUTH_VIEW_PROFILE',
    name: 'Ver perfil',
    module: 'AUTH',
    description: 'Permite consultar el perfil del usuario autenticado.',
  },
  {
    code: 'USERS_VIEW',
    name: 'Consultar usuarios',
    module: 'USERS',
    description: 'Permite listar y consultar usuarios.',
  },
  {
    code: 'USERS_CREATE',
    name: 'Crear usuarios',
    module: 'USERS',
    description: 'Permite registrar nuevos usuarios.',
  },
  {
    code: 'USERS_UPDATE',
    name: 'Actualizar usuarios',
    module: 'USERS',
    description: 'Permite modificar datos de usuarios.',
  },
  {
    code: 'USERS_DELETE',
    name: 'Eliminar usuarios',
    module: 'USERS',
    description: 'Permite desactivar o eliminar usuarios.',
  },
  {
    code: 'COORDINATIONS_VIEW',
    name: 'Consultar coordinaciones',
    module: 'COORDINATIONS',
    description: 'Permite consultar el catálogo y grafo de coordinaciones.',
  },
  {
    code: 'COORDINATIONS_MANAGE',
    name: 'Administrar coordinaciones',
    module: 'COORDINATIONS',
    description: 'Permite gestionar coordinaciones y dependencias.',
  },
  {
    code: 'SITUATIONS_VIEW',
    name: 'Consultar situaciones',
    module: 'SITUATIONS',
    description: 'Permite listar y consultar situaciones operacionales.',
  },
  {
    code: 'SITUATIONS_CREATE',
    name: 'Registrar situaciones',
    module: 'SITUATIONS',
    description: 'Permite registrar nuevas situaciones.',
  },
  {
    code: 'SITUATIONS_UPDATE',
    name: 'Actualizar situaciones',
    module: 'SITUATIONS',
    description: 'Permite modificar situaciones existentes.',
  },
  {
    code: 'SITUATIONS_CLOSE',
    name: 'Cerrar situaciones',
    module: 'SITUATIONS',
    description: 'Permite cerrar o archivar situaciones.',
  },
  {
    code: 'AI_ANALYZE',
    name: 'Ejecutar análisis IA',
    module: 'AI',
    description:
      'Permite solicitar interpretaciones de inteligencia operacional.',
  },
  {
    code: 'AI_VIEW_REPORTS',
    name: 'Consultar reportes IA',
    module: 'AI',
    description: 'Permite consultar reportes ejecutivos generados por IA.',
  },
  {
    code: 'REPORTS_VIEW',
    name: 'Consultar reportes',
    module: 'REPORTS',
    description: 'Permite consultar reportes institucionales.',
  },
  {
    code: 'REPORTS_EXPORT',
    name: 'Exportar reportes',
    module: 'REPORTS',
    description: 'Permite exportar reportes en formatos institucionales.',
  },
  {
    code: 'KPIS_VIEW',
    name: 'Consultar KPIs operacionales',
    module: 'KPIS',
    description:
      'Permite consultar el snapshot analítico de la operación (GET /operational-kpis). No implica operar situaciones ni exportar reportes institucionales.',
  },
  {
    code: 'SYSTEM_CONFIGURATION',
    name: 'Configuración del sistema',
    module: 'SYSTEM',
    description: 'Permite administrar la configuración global de NOVEX.',
  },
] as const;

export const ALL_PERMISSION_CODES = CATALOG_PERMISSIONS.map(
  (permission) => permission.code,
);

/**
 * Operar el ciclo de una situación (crear, modificar, cerrar, relanzar IA)
 * pertenece a ANALISTA y COORDINADOR. ADMIN administra la plataforma; DIRECTOR
 * consulta. Ninguno de los dos interviene situaciones.
 */
const SITUATION_OPERATION_PERMISSION_CODES = [
  'SITUATIONS_CREATE',
  'SITUATIONS_UPDATE',
  'SITUATIONS_CLOSE',
  'AI_ANALYZE',
];

/**
 * KPIs analíticos: capability distinta de REPORTS_VIEW.
 * En esta fase solo DIRECTOR la recibe. ADMIN no la hereda del filtro ALL.
 */
const DIRECTOR_ONLY_PERMISSION_CODES = ['KPIS_VIEW'];

/**
 * REPARTO POR ROL.
 *
 *   REPORTAR    `SITUATIONS_CREATE`: ANALISTA y COORDINADOR. DIRECTOR y ADMIN
 *               consultan; el guard rechaza create sin ese permiso.
 *   SOLUCIONAR  `SITUATIONS_CLOSE`: COORDINADOR (área responsable) y ANALISTA
 *               (solo si Coordinación General es la responsable). El permiso
 *               delimita el rol; la política delimita el caso.
 *
 * ADMIN conserva USERS_*, COORDINATIONS_MANAGE y SYSTEM_CONFIGURATION.
 * NO recibe CREATE/UPDATE/CLOSE ni AI_ANALYZE.
 */
export const ROLE_PERMISSION_CODES: Readonly<
  Record<'ADMIN' | 'DIRECTOR' | 'ANALISTA' | 'COORDINADOR', readonly string[]>
> = {
  ADMIN: ALL_PERMISSION_CODES.filter(
    (code) =>
      !SITUATION_OPERATION_PERMISSION_CODES.includes(code) &&
      !DIRECTOR_ONLY_PERMISSION_CODES.includes(code),
  ),
  DIRECTOR: [
    'AUTH_VIEW_PROFILE',
    'COORDINATIONS_VIEW',
    'SITUATIONS_VIEW',
    'AI_VIEW_REPORTS',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'KPIS_VIEW',
  ],
  ANALISTA: [
    'AUTH_VIEW_PROFILE',
    'COORDINATIONS_VIEW',
    'SITUATIONS_VIEW',
    'SITUATIONS_CREATE',
    'SITUATIONS_UPDATE',
    'SITUATIONS_CLOSE',
    'AI_ANALYZE',
    'AI_VIEW_REPORTS',
    'REPORTS_VIEW',
  ],
  COORDINADOR: [
    'AUTH_VIEW_PROFILE',
    'COORDINATIONS_VIEW',
    'SITUATIONS_VIEW',
    'SITUATIONS_CREATE',
    'SITUATIONS_UPDATE',
    // Soluciona el área que coordina. La comprobación efectiva vive en
    // `SituationsController.resolve` y `OperationalScopeService`.
    'SITUATIONS_CLOSE',
    'AI_ANALYZE',
    'AI_VIEW_REPORTS',
  ],
};
