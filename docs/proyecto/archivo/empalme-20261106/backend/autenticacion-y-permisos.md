# Autenticación y permisos

> **Propósito:** explicar cómo NOVEX_BACKEND identifica al usuario (Google + JWT), cómo decide qué puede hacer (RBAC por permisos) y sobre qué casos (alcance operativo), tal como está **implementado**, señalando dónde difiere de lo esperado.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_BACKEND `5ffc65f` (producción); A1 en `72e24fe`; A2/M1 en worktrees sin commit
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

Salvo que se indique otra cosa, todo lo descrito corresponde a `5ffc65f`. Las rutas HTTP llevan el prefijo `api/v1` ([main.ts](../../src/main.ts) L91-98), excepto `/health` y `/health/ready`.

---

## 1. Inicio de sesión con Google

Flujo implementado en [auth.service.ts](../../src/auth/auth.service.ts) `loginWithGoogle` (L40-80) [V]:

1. El frontend obtiene un **ID token de Google** y lo envía a `POST /auth/google` (`{ credential }`), ruta `@Public` con límite de 15 peticiones/60 s ([auth.controller.ts](../../src/auth/auth.controller.ts) L17-27; [throttle.constants.ts](../../src/configuration/throttle.constants.ts) L12).
2. Si `GOOGLE_CLIENT_ID` no está configurado → 401. `GOOGLE_CLIENT_ID` es obligatorio en la validación de entorno ([env.validation.ts](../../src/configuration/env.validation.ts) L107-109).
3. `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })` (L51-54). Cualquier fallo → 401 «Credencial de Google inválida».
4. Exige `email` presente y `email_verified === true` (L60-62).
5. Busca el usuario por correo normalizado (`trim().toLowerCase()`). **No crea usuarios**: si no existe → 401 «Usuario no autorizado»; si existe pero no es `ACTIVE` → 403 «Usuario inactivo» (L182-194).
6. Actualiza `googleSub`, `photoUrl`, `fullName` (si Google lo envía) y `lastLoginAt`, y emite el JWT (L71-79, L196-207).

No hay restricción de dominio de correo (`hd`) en el backend [V]: el control es la lista de usuarios pre-registrados.

## 2. JWT

| Aspecto | Implementación | Ref. |
|---|---|---|
| Firma | Secreto simétrico `JWT_SECRET` (obligatorio; el arranque falla sin él). Algoritmo por defecto de `@nestjs/jwt`/`jsonwebtoken`, HS256 [I]; la verificación no fija `algorithms` [V] | [auth.module.ts](../../src/auth/auth.module.ts) L18-37, [jwt.strategy.ts](../../src/auth/strategies/jwt.strategy.ts) L15-25 |
| Transporte | Cabecera `Authorization: Bearer <token>` | jwt.strategy.ts L22 |
| Expiración | `JWT_EXPIRES_IN`, por defecto `1h`; `ignoreExpiration: false` | [configuration.ts](../../src/configuration/configuration.ts) L40-43; `cloudbuild.backend.yaml` fija `_JWT_EXPIRES_IN: 1h` |
| Refresh | **No existe.** Al expirar, el usuario vuelve a iniciar sesión [V] | — |
| Revocación | No hay lista de revocación. Desactivar al usuario o cambiar su rol tiene efecto en la **siguiente petición** gracias al enriquecimiento (§4) [V] | — |

**Claims** ([auth-payload.contract.ts](../../src/auth/contracts/auth-payload.contract.ts); `buildAuthPayload`, auth.service.ts L151-165): `sub` (id de usuario), `email`, `roleId`, `roleCode`, `coordinationId` (o `null`), `permissions[]` (códigos), `status`, más `iat`/`exp`.

`JwtStrategy.validate` exige `sub`, `email`, `roleId`, `roleCode`, `permissions[]` y `status === ACTIVE` **en el token** (L28-51). Los permisos del token son una foto del login; **no se usan para autorizar**: los sustituye el guard de enriquecimiento. El comentario del contrato («para autorizar sin consultas adicionales por request») está desactualizado [V].

## 3. Login por correo (solo desarrollo)

`POST /auth/email` (`{ email }`) es `@Public` con el mismo límite de 15/min (auth.controller.ts L29-39). `loginWithEmail` (auth.service.ts L82-102):

- Si `ENABLE_EMAIL_LOGIN` no es `true` → **403** «El acceso por correo solo está disponible en desarrollo local» [V]. Valor por defecto `false` (env.validation.ts L111-115; configuration.ts L70).
- Si está habilitado, **basta con conocer el correo de un usuario ACTIVE** para obtener un JWT, sin contraseña ni token de Google [V]. Por eso nunca debe activarse fuera de local.
- El workflow de despliegue fuerza `ENABLE_EMAIL_LOGIN=false` (`.github/workflows/deploy-backend.yml` L277) [V]. `cloudbuild.backend.yaml` no lo establece, así que queda el valor por defecto `false` [V]. El valor real de la revisión de Cloud Run en producción no se ha consultado [?].

## 4. Guards: orden y responsabilidades

Guards globales registrados como `APP_GUARD` en [app.module.ts](../../src/app.module.ts) L124-128, ejecutados en este orden [V]:

| # | Guard | Responsabilidad |
|---|---|---|
| 1 | [JwtAuthGuard](../../src/auth/guards/jwt-auth.guard.ts) | Si la ruta es `@Public`, deja pasar. Si no, valida el Bearer con `JwtStrategy`; sin token o inválido → 401 «Sesión no válida» |
| 2 | [AuthorizationEnrichmentGuard](../../src/auth/guards/authorization-enrichment.guard.ts) | En rutas no públicas, **reemplaza `request.user`** por `RbacService.resolveActiveAuthorization(sub)` ([rbac.service.ts](../../src/rbac/rbac.service.ts) L74-100): relee usuario, rol, `coordinationId` y permisos del rol desde la base. Usuario inexistente o no ACTIVE → 401 |
| 3 | `ThrottlerGuard` | Límite global 600 peticiones/60 s por cliente; algunas rutas lo sobrescriben con `@Throttle` (auth 15, Gemini 10) |
| 4 | [PermissionsGuard](../../src/auth/guards/permissions.guard.ts) (por controlador, `@UseGuards`) | Lee `@RequirePermissions(...)` y exige **todos** los códigos en `request.user.permissions` (ya enriquecidos). Falta alguno → 403 con los códigos que faltan |

Puntos que conviene saber:

- `PermissionsGuard` **no es global**. Solo protege los controladores que lo declaran (situaciones, IA, evidencias, impacto, timeline, recomendaciones, overview, KPIs, dashboard, coordinaciones) [V]. Los controladores `users`, `roles` y `permissions` **no lo usan**: comprueban el permiso con un `assertPermission`/`assertAdmin` en línea ([users.controller.ts](../../src/users/users.controller.ts) L78-84, [roles.controller.ts](../../src/roles/roles.controller.ts) L38-44, [permissions.controller.ts](../../src/permissions/permissions.controller.ts) L12). Un controlador nuevo sin `@UseGuards(PermissionsGuard)` queda protegido **solo por autenticación**.
- Como `ThrottlerGuard` va después de `JwtAuthGuard`, una petición sin token a una ruta protegida se rechaza con 401 antes de contar en el límite [I].
- `@Public` ([public.decorator.ts](../../src/auth/decorators/public.decorator.ts)) se usa solo en `POST /auth/google`, `POST /auth/email` y `POST /internal/jobs/situation-sweep` [V]. Este último lo protege `SchedulerOidcGuard` (token OIDC de Cloud Scheduler; sin `SCHEDULER_OIDC_*` rechaza todo) y además lleva `@SkipThrottle` (`src/situations/sweep/situation-sweep.controller.ts` L25-36).
- `/health`, `/health/ready` y `/api/v1/auth/health` son rutas de Express montadas **antes** de Nest ([probe-health.ts](../../src/health/probe-health.ts) L74-109): no pasan por ningún guard.
- Los controladores legados `intelligence`, `operational-events`, `operational-areas` y `recommended-actions` existen en el código pero **no están montados** (módulos sin `controllers` o con `controllers: []`) [V]. Si alguien los vuelve a registrar, no tienen `PermissionsGuard` ni alcance.

## 5. Roles

Catálogo en [roles.catalog.seed.ts](../../src/roles/seeds/roles.catalog.seed.ts) [V]. Cada usuario tiene **un** rol y, opcionalmente, **una** coordinación (`users.coordination_id`, anulable).

| Código | Nombre | Papel esperado |
|---|---|---|
| `ADMIN` | Administrador | Administra la plataforma (usuarios, catálogos). No opera situaciones |
| `DIRECTOR` | Director | Consulta ejecutiva y KPIs. No opera situaciones |
| `ANALISTA` | Analista | Reporta, sigue sus reportes y soluciona lo de Coordinación General (`coord-general`) |
| `COORDINADOR` | Coordinador | Opera los problemas cuya coordinación **responsable** es la suya |

El código de rol se compara normalizado (`trim().toUpperCase()`) en [operational-scope.service.ts](../../src/auth/services/operational-scope.service.ts) L529-531. Solo `COORDINADOR` está «acotado por coordinación» (`isCoordinationScoped`, L51-53).

## 6. Catálogo de permisos

Fuente: `CATALOG_PERMISSIONS` en [permissions.catalog.seed.ts](../../src/permissions/seeds/permissions.catalog.seed.ts) L10-121. La columna «Uso en código» indica dónde se comprueba fuera de seeds, migraciones y pruebas [V por búsqueda en `src/`].

| Código | Significado (catálogo) | Uso en código |
|---|---|---|
| `AUTH_LOGIN` | Iniciar sesión | **Ninguno**. El login no lo exige |
| `AUTH_VIEW_PROFILE` | Ver perfil propio | **Ninguno**. `GET /auth/me` solo exige sesión |
| `USERS_VIEW` | Listar/consultar usuarios | `users.controller.ts` |
| `USERS_CREATE` | Registrar usuarios | `users.controller.ts` |
| `USERS_UPDATE` | Modificar usuarios | `users.controller.ts` |
| `USERS_DELETE` | Desactivar/eliminar usuarios | **Ninguno** (no hay endpoint DELETE) |
| `COORDINATIONS_VIEW` | Catálogo y grafo de coordinaciones | coordinaciones, overview, `assertCoordinationInScope` |
| `COORDINATIONS_MANAGE` | Gestionar coordinaciones | **Ninguno** (no hay endpoints de escritura) |
| `SITUATIONS_VIEW` | Listar y consultar situaciones | Lecturas de situaciones y secciones; base de todo alcance |
| `SITUATIONS_CREATE` | Registrar situaciones | Alta (`register-with-analysis`), `POST evidences` |
| `SITUATIONS_UPDATE` | Modificar situaciones | `PATCH /situations/:id`, afectaciones, recomendaciones, `DELETE evidences` |
| `SITUATIONS_CLOSE` | Cerrar (solucionar) | `POST /situations/:id/resolution` + política `canResolveSituation` |
| `AI_ANALYZE` | Lanzar análisis IA | `POST /situations/:id/analyze` |
| `AI_VIEW_REPORTS` | Consultar análisis IA | `GET /situations/:id/analysis*` |
| `REPORTS_VIEW` | Reportes institucionales | `GET /dashboard/metrics` |
| `REPORTS_EXPORT` | Exportar reportes | **Ninguno** |
| `KPIS_VIEW` | Snapshot analítico (KPIs) | Todo `/operational-kpis/*` |
| `SYSTEM_CONFIGURATION` | Configuración global | `GET /roles`, `GET /roles/:id/permissions`, `GET /permissions` |

## 7. Matriz RBAC rol × permiso

### 7.1 Según el seed (`ROLE_PERMISSION_CODES`)

[permissions.catalog.seed.ts](../../src/permissions/seeds/permissions.catalog.seed.ts) L157-197 [V]. ADMIN = todo el catálogo **menos** `SITUATIONS_CREATE`, `SITUATIONS_UPDATE`, `SITUATIONS_CLOSE`, `AI_ANALYZE` y `KPIS_VIEW`.

| Permiso | ADMIN | DIRECTOR | ANALISTA | COORDINADOR |
|---|:-:|:-:|:-:|:-:|
| `AUTH_LOGIN` | ✔ | — | — | — |
| `AUTH_VIEW_PROFILE` | ✔ | ✔ | ✔ | ✔ |
| `USERS_VIEW` / `USERS_CREATE` / `USERS_UPDATE` / `USERS_DELETE` | ✔ | — | — | — |
| `COORDINATIONS_VIEW` | ✔ | ✔ | ✔ | ✔ |
| `COORDINATIONS_MANAGE` | ✔ | — | — | — |
| `SITUATIONS_VIEW` | ✔ | ✔ | ✔ | ✔ |
| `SITUATIONS_CREATE` | — | — | ✔ | ✔ |
| `SITUATIONS_UPDATE` | — | — | ✔ | ✔ |
| `SITUATIONS_CLOSE` | — | — | ✔ | ✔ |
| `AI_ANALYZE` | — | — | ✔ | ✔ |
| `AI_VIEW_REPORTS` | ✔ | ✔ | ✔ | ✔ |
| `REPORTS_VIEW` | ✔ | ✔ | ✔ | — |
| `REPORTS_EXPORT` | ✔ | ✔ | — | — |
| `KPIS_VIEW` | — | ✔ | — | — |
| `SYSTEM_CONFIGURATION` | ✔ | — | — | — |

### 7.2 Cómo llega a producción

- El seed de permisos y el sincronizador rol-permiso (`src/rbac/seeds/role-permission-catalog-seed.service.ts`) solo corren si `isCatalogSeedEnabled()` ([catalog-seed.guard.ts](../../src/configuration/catalog-seed.guard.ts)): por defecto **apagado con `NODE_ENV=production`**, y ambos scripts de despliegue fijan `CATALOG_SEED_ON_BOOT=false` [V]. Cuando corre, el sincronizador **reconcilia**: también revoca asignaciones que no estén en el seed (L66-80) [V].
- En producción, los cambios llegan por **migraciones** (idempotentes, `ON CONFLICT DO NOTHING`) [V]:

| Migración | Efecto |
|---|---|
| `1787300000000-GrantReportingAndClosurePermissions` | + ADMIN `SITUATIONS_CREATE`, + DIRECTOR `SITUATIONS_CREATE`, + COORDINADOR `SITUATIONS_CLOSE` |
| `1787500000000-GrantAnalystSituationsClose` | + ANALISTA `SITUATIONS_CLOSE` |
| `1787600000000-GrantDirectorKpisView` | + DIRECTOR `KPIS_VIEW` (crea el permiso si falta) |
| `1788200000000-RevokeAdminDirectorSituationsCreate` | − ADMIN y − DIRECTOR `SITUATIONS_CREATE` (deshace parte de la primera) |

Si las cuatro están aplicadas sobre una base que tenía el reparto anterior, el resultado coincide con la tabla 7.1 [I]. **El contenido real de `role_permissions` en producción NO está verificado** [?], ni qué migraciones se aplicaron (ver [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md)). En particular: si `1787300000000` está aplicada y `1788200000000` no, ADMIN y DIRECTOR **pueden registrar situaciones** por API. Comprobarlo requiere una consulta de solo lectura con autorización.

Como la autorización se relee en cada petición, un cambio en `role_permissions` aplica sin renovar sesiones [V].

## 8. Alcance operativo

El permiso dice **qué acción** puede intentar un rol; el alcance dice **sobre qué caso**. Todo vive en [operational-scope.service.ts](../../src/auth/services/operational-scope.service.ts) y [situation-access.service.ts](../../src/situations/situation-access.service.ts) [V].

Conceptos de la situación: `coordinationId` = coordinación **responsable**; `affectedCoordinationId` = coordinación **afectada** (en INTERNAL es igual a la responsable; en INTER es distinta); `createdByUserId` = autor. `coord-general` se resuelve a su UUID al arrancar (`ensureGeneralCoordinationId` en `src/situations/situations.service.ts` L126-139).

| Regla | Método (operational-scope.service.ts) | Qué comprueba |
|---|---|---|
| Alcance de coordinación | `assertSituationInScope` L81-94 | `SITUATIONS_VIEW`; si es COORDINADOR, responsable == su coordinación (sin coordinación → 404). Otros roles: sin restricción |
| Lectura de un caso | `assertSituationReadable` L126-155 | `SITUATIONS_VIEW` y: autor, **o** COORDINADOR de la afectada, **o** alcance de coordinación |
| Propiedad | `ownsSituation` L392-402 | Autor, **o** COORDINADOR cuya coordinación es la responsable |
| Edición (PATCH) | `assertCanUpdateSituation` L494-501 | `SITUATIONS_UPDATE` + alcance de coordinación + propiedad |
| Avance OPEN→IN_PROGRESS | `canAdvanceSituationToInProgress` L425-452 | `SITUATIONS_UPDATE`; ANALISTA: responsable == `coord-general`; COORDINADOR: responsable == la suya. La autoría no basta |
| Resolución | `canResolveSituation` L328-358 | `SITUATIONS_CLOSE`; ANALISTA: responsable == `coord-general`; COORDINADOR: responsable == la suya. Ser afectada o autor no concede |
| Afectaciones | `canAddConsequence` L249-308 | `SITUATIONS_UPDATE`, solo INTERNAL en OPEN/IN_PROGRESS; ANALISTA: autor; COORDINADOR: responsable |
| Alta INTERNAL | `resolveInternalCreateCoordinationId` L210-233 | Coordinación obligatoria; COORDINADOR solo la suya |
| Alta INTER | `resolveCreateCoordinationId` L180-197 + validaciones del servicio | Responsable y afectada obligatorias y distintas; **ningún rol tiene que pertenecer a ninguna de las dos** [V] |
| Filtro de listado | `resolveSituationListCoordinationId` L67-79 | COORDINADOR: su coordinación; **sin coordinación devuelve `undefined` = sin filtro** (A2) |

Puertas de [situation-access.service.ts](../../src/situations/situation-access.service.ts) que usan los controladores de secciones:

- `requireAccessibleSituation` (L14-31) = **lectura**: carga el caso y aplica `assertSituationReadable`.
- `requireOperableSituation` (L43-51) = **escritura**: lectura + `assertSituationInScope` + `assertCanOperateSituation` (propiedad).

Códigos: fuera de alcance de coordinación → **404** «Situación no encontrada» (no revela existencia); en alcance pero sin propiedad o sin política → **403**.

### 8.1 Leer no es poder modificar

La lectura se amplió deliberadamente (autor y coordinación afectada), pero las escrituras siguen exigiendo alcance de coordinación y propiedad. Ejemplos con código actual [V]:

- **COORDINADOR de la coordinación afectada por un INTER** (responsable A, afectada B, actor coordina B):
  - lo ve en su listado (el repositorio filtra `coordinationId = :c OR affectedCoordinationId = :c`, `src/situations/repositories/situations.repository.ts` L118-121) y abre el detalle;
  - `PATCH`, evidencias (`POST`/`DELETE`) → **404** (no está en alcance de escritura);
  - resolver → **403** (`canResolveSituation` falso);
  - afectaciones → rechazadas (solo INTERNAL);
  - **pero** hoy puede lanzar `POST /situations/:id/analyze` y crear recomendaciones manuales, porque esas rutas usan la puerta de lectura (**M1**).
- **COORDINADOR autor de un caso de otra coordinación:** lo lee completo (en el listado aparece con `mine=true` o con `coordinationId` de esa área y `scope: 'own-only'`), pero no puede editarlo, resolverlo ni subir evidencias. De nuevo, analizar y crear recomendaciones sí (M1).
- **ANALISTA no autor:** lee todo (no está acotado), pero solo edita sus propios reportes; avanza y resuelve cualquier caso cuya responsable sea `coord-general`, sea o no el autor.

## 9. Autorización por recurso y rol

`A` = ADMIN, `D` = DIRECTOR, `AN` = ANALISTA, `C` = COORDINADOR. «Lectura» = `requireAccessibleSituation`/`assertSituationReadable`; «Escritura» = `requireOperableSituation`. Las filas marcadas ⚠ tienen un comportamiento actual distinto del esperado.

| Acción (endpoint) | Permiso | A | D | AN | C |
|---|---|---|---|---|---|
| Listar `GET /situations` | `SITUATIONS_VIEW` | Todas | Todas | Todas | Responsable o afectada = la suya; `coordinationId` ajeno → solo propios (`own-only`); `mine=true` → propios |
| ⚠ Listar, COORDINADOR **sin** coordinación (A2) | `SITUATIONS_VIEW` | | | | **Actual:** todas las situaciones. **Esperado (A2):** solo sus reportes, `scope: 'own-only'` |
| Detalle `GET /situations/:id` | `SITUATIONS_VIEW` | Cualquiera | Cualquiera | Cualquiera | Responsable o afectada = la suya, o autor (sin coordinación: solo autor) |
| Alta INTERNAL `POST /situations/register-with-analysis` (`reportKind=INTERNAL`) | `SITUATIONS_CREATE` | 403 [*] | 403 [*] | Cualquier coordinación (obligatoria) | Solo la suya |
| Alta INTER (mismo endpoint, `INTER_COORDINATION`) | `SITUATIONS_CREATE` | 403 [*] | 403 [*] | Cualquier par responsable ≠ afectada | Cualquier par responsable ≠ afectada |
| Alta sin `reportKind` (contrato legado) | `SITUATIONS_CREATE` | 403 [*] | 403 [*] | 400 `LEGACY_REGISTRATION_REQUIRES_COORDINATION` | INTERNAL en la suya |
| Editar `PATCH /situations/:id` (título, descripción, fecha, estado ≠ avance) | `SITUATIONS_UPDATE` | 403 | 403 | Solo autor | Solo si responsable = la suya |
| ⚠ Reasignar `coordinationId` en el PATCH (N1, N2) | `SITUATIONS_UPDATE` | 403 | 403 | **Actual:** permitido al autor, a cualquier coordinación, incluida `coord-general`; en INTER sin comprobar ≠ afectada. **Esperado:** no debería permitir auto-concederse la resolución ni igualar responsable y afectada | 403 «No puede reasignar» |
| Avanzar OPEN→IN_PROGRESS (PATCH `status`) | `SITUATIONS_UPDATE` | 403 | 403 | Responsable = `coord-general` (cualquier autor) ⚠ N1 | Responsable = la suya |
| `CLOSED` por PATCH | — | 403 en todos: el cierre solo va por `resolution` (`situations.service.ts` L738-742) | | | |
| ⚠ Resolver `POST /situations/:id/resolution` | `SITUATIONS_CLOSE` | 403 | 403 | Responsable = `coord-general`. **Actual:** alcanzable para cualquier caso propio tras N1. **Esperado:** solo casos de Coordinación General de origen | Responsable = la suya |
| Afectaciones `POST /situations/:id/consequences` | `SITUATIONS_UPDATE` | 403 | 403 | Autor; INTERNAL en OPEN/IN_PROGRESS | Responsable; INTERNAL en OPEN/IN_PROGRESS |
| Evidencias `POST /situations/:id/evidences` | `SITUATIONS_CREATE` + Escritura | 403 | 403 | Autor | Responsable |
| Evidencias `DELETE /situations/:id/evidences/:evidenceId` | `SITUATIONS_UPDATE` + Escritura | 403 | 403 | Autor | Responsable |
| Evidencias, timeline, impacto (`GET`) y `POST /situations/:id/simulate-impact` | `SITUATIONS_VIEW` + Lectura | Lectura | Lectura | Lectura | Lectura |
| Recomendaciones `GET /situations/:id/recommendations` | `SITUATIONS_VIEW` + Lectura | Lectura | Lectura | Lectura | Lectura |
| ⚠ Crear recomendación `POST /situations/:id/recommendations` (M1) | `SITUATIONS_UPDATE` | 403 | 403 | **Actual:** cualquier caso (Lectura). **Esperado (M1/P1):** solo autor | **Actual:** responsable, afectada o autor. **Esperado:** responsable |
| ⚠ `GET /recommendations/:id` (A1) | `SITUATIONS_VIEW` | **Actual (`5ffc65f`):** cualquier recomendación, sin alcance (IDOR). **Esperado / `72e24fe`:** Lectura del caso; fuera de alcance → 404 idéntico a inexistente | | | |
| ⚠ `PATCH /recommendations/:id` (A1) | `SITUATIONS_UPDATE` | 403 | 403 | **Actual:** cualquier recomendación. **Esperado / `72e24fe`:** Escritura (autor) | **Actual:** cualquier recomendación. **Esperado / `72e24fe`:** Escritura (responsable) |
| ⚠ Analizar `POST /situations/:id/analyze` (M1) | `AI_ANALYZE` (10/min) | 403 | 403 | **Actual:** cualquier caso, también cerrado. **Esperado (M1/P1):** solo autor; cerrado → 409 `SITUATION_CLOSED` | **Actual:** responsable, afectada o autor. **Esperado:** responsable; cerrado → 409 |
| Ver análisis `GET /situations/:id/analysis`, `.../analysis/history*`, `.../analysis/compare` | `AI_VIEW_REPORTS` + Lectura | Lectura | Lectura | Lectura | Lectura |
| Estado de cartas `GET /operational-overview` | `SITUATIONS_VIEW` + `COORDINATIONS_VIEW` | Agregado de las 15 coordinaciones | Ídem | Ídem | Ídem, sin el registro de analistas (casos sin coordinación) |
| KPIs `GET /operational-kpis/*` | `KPIS_VIEW` | 403 | ✔ | 403 | 403 |
| Dashboard `GET /dashboard/metrics` | `REPORTS_VIEW` | ✔ sin alcance | ✔ | ✔ | 403 |
| Coordinaciones `GET /coordinations*` | `COORDINATIONS_VIEW` | ✔ | ✔ | ✔ | Filtrado por `filterCoordinationsByScope` (`src/coordinations/coordinations.service.ts`) [V parcial] |
| Usuarios `GET/POST/PATCH /users*` | `USERS_*` en línea | ✔ | 403 | 403 | 403 |
| Roles y permisos `GET /roles*`, `GET /permissions` | `SYSTEM_CONFIGURATION` en línea | ✔ | 403 | 403 | 403 |
| `GET /auth/me`, `PATCH /users/me/onboarding` | Solo sesión | ✔ | ✔ | ✔ | ✔ |

[*] 403 según el seed. En producción depende de si `1788200000000` está aplicada (§7.2) [?].

Hay además una observación de revisión de código, no confirmada, sobre el avance: cuando el PATCH lleva `status: IN_PROGRESS` desde OPEN, solo se evalúa `canAdvance…` y **no** `assertCanUpdateSituation`; el resto de campos del mismo PATCH (incluido `coordinationId`) se aplica igual (`situations.service.ts` L711-723 y L753-767). Ver N1 en [seguridad-y-correcciones.md](seguridad-y-correcciones.md).

## Límites de verificación

- Todo lo marcado [V] se comprobó leyendo código de `5ffc65f` y los diffs de los worktrees el 2026-11-06. **No se ejecutó** ninguna prueba, build ni consulta a base de datos.
- No verificado [?]: contenido de `role_permissions` y migraciones aplicadas en producción; variables de entorno reales de la revisión de Cloud Run (`ENABLE_EMAIL_LOGIN`, `JWT_EXPIRES_IN`, `CATALOG_SEED_ON_BOOT`).
- Inferido [I]: algoritmo HS256 (por defecto de la librería), orden de throttling frente a 401, resultado neto de las migraciones.
- La fila de coordinaciones se revisó solo en las llamadas a `filterCoordinationsByScope`; no se recorrió cada método de `coordinations.service.ts`.
- N1 y N2 son hallazgos de lectura de código, sin prueba de explotación.

## Documentos relacionados

- [README.md](README.md): índice del empalme, ramas y worktrees.
- [seguridad-y-correcciones.md](seguridad-y-correcciones.md): A1, A2, M1, N1, N2 y controles residuales.
- [situaciones-y-reglas.md](situaciones-y-reglas.md): ciclo de vida, INTERNAL/INTER, resolución.
- [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md): migraciones RBAC y su aplicación.
- [arquitectura.md](arquitectura.md), [despliegue-y-operacion.md](despliegue-y-operacion.md), [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md), [inteligencia-artificial.md](inteligencia-artificial.md).
- [CLAUDE.md](../../CLAUDE.md): reglas de trabajo del repositorio.
- Frontend: NOVEX_FRONTEND → `docs/empalme/roles-y-navegacion.md`.
