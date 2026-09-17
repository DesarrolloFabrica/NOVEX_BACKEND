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
 * INTERVENIR en el ciclo de una situación —modificarla, cerrarla o relanzar su
 * análisis— sigue perteneciendo a quien la vive. La administración de
 * plataforma no interviene, así que ADMIN queda fuera de estos permisos.
 *
 * `SITUATIONS_CREATE` YA NO ESTÁ EN ESTA LISTA. REPORTAR un problema dejó de
 * ser una intervención reservada: los cuatro roles pueden declarar un problema
 * en cualquier coordinación válida. Es una capacidad de ENTRADA de información,
 * no de gestión, y por eso no arrastra ninguna de las otras tres.
 */
const OPERATIONAL_ONLY_PERMISSION_CODES = [
  'SITUATIONS_UPDATE',
  'SITUATIONS_CLOSE',
  'AI_ANALYZE',
];

/**
 * REPARTO POR ROL tras habilitar el reporte entre coordinaciones y la
 * resolución con aprendizaje.
 *
 *   REPORTAR    `SITUATIONS_CREATE`: los CUATRO roles. La coordinación
 *               responsable la elige el usuario y la valida el catálogo.
 *   SOLUCIONAR  `SITUATIONS_CLOSE`: SOLO COORDINADOR, y aun así el servicio
 *               exige además que coordine el área responsable del problema.
 *               El permiso delimita el rol; la política delimita el caso.
 *
 * ADMIN y DIRECTOR ganan únicamente `SITUATIONS_CREATE`. NO reciben
 * `SITUATIONS_UPDATE`, `SITUATIONS_CLOSE` ni `AI_ANALYZE`: pueden declarar un
 * problema, no gestionarlo ni cerrarlo.
 *
 * ANALISTA conserva lo que tenía y NO recibe `SITUATIONS_CLOSE`: reporta y
 * actualiza sus propios casos, pero no soluciona.
 */
export const ROLE_PERMISSION_CODES: Readonly<
  Record<'ADMIN' | 'DIRECTOR' | 'ANALISTA' | 'COORDINADOR', readonly string[]>
> = {
  ADMIN: ALL_PERMISSION_CODES.filter(
    (code) => !OPERATIONAL_ONLY_PERMISSION_CODES.includes(code),
  ),
  DIRECTOR: [
    'AUTH_VIEW_PROFILE',
    'COORDINATIONS_VIEW',
    'SITUATIONS_VIEW',
    'SITUATIONS_CREATE',
    'AI_VIEW_REPORTS',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
  ],
  ANALISTA: [
    'AUTH_VIEW_PROFILE',
    'COORDINATIONS_VIEW',
    'SITUATIONS_VIEW',
    'SITUATIONS_CREATE',
    'SITUATIONS_UPDATE',
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
    // Único rol que soluciona. La comprobación efectiva vive en
    // `SituationsController.resolve` y `OperationalScopeService`.
    'SITUATIONS_CLOSE',
    'AI_ANALYZE',
    'AI_VIEW_REPORTS',
  ],
};
