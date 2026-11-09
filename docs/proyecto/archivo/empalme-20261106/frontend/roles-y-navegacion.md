# Roles y navegación

> **Propósito:** describir qué ve y qué puede hacer cada rol (ADMIN, DIRECTOR, ANALISTA, COORDINADOR) en la interfaz, cómo se protegen las rutas y dónde termina la UI y empieza la autorización del servidor.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_FRONTEND `b726c47` (producción). Las diferencias con `7a49148` / working tree (tutorial) se señalan como «Working tree».
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

---

## 1. Principio: la UI muestra, el servidor autoriza

| Capa | Qué decide | Dónde |
|---|---|---|
| **Visibilidad de la UI** | Qué shell se monta, qué botones aparecen | Rol normalizado ([roleExperience.ts](../../src/modules/auth/utils/roleExperience.ts)), permisos del JWT ([permissions.ts](../../src/modules/auth/utils/permissions.ts)), `experienceAllowsOperation` ([resolveOperationalCenterExperience.ts](../../src/modules/operational-cards/experience/resolveOperationalCenterExperience.ts)) |
| **Flags por recurso devueltos por la API** | Si un problema concreto se puede avanzar, resolver o ampliar con afectaciones | `canAdvanceToInProgress`, `canResolve`, `canAddConsequence` en la respuesta de `GET /situations/:id` ([problem-detail.service.ts](../../src/modules/operational-cards/services/problem-detail.service.ts) líneas 53-72) |
| **Autorización real** | Si la petición se acepta (permiso + alcance) | Backend. NOVEX_BACKEND → `docs/empalme/autenticacion-y-permisos.md` |

Reglas que conviene recordar [V]:

- `normalizeRoleCode` convierte cualquier rol desconocido o vacío en **COORDINADOR** (`roleExperience.ts:12-17`). Un rol nuevo en el backend entraría a la UI como coordinador.
- Los `permissions` vienen del **JWT**; `roleCode` viene de `/auth/me` ([arquitectura.md §4](arquitectura.md#4-autenticación-y-sesión)).
- `canCreateSituations`: exige `SITUATIONS_CREATE` y ser ANALISTA, o COORDINADOR con `coordinationId` (`permissions.ts:19-29`).
- Avanzar y resolver: la UI usa los flags de la API. `canUpdateSituationStatus` solo replica la regla si el flag no llega (`permissions.ts:52-88`).
- DIRECTOR y ADMIN no tienen escrituras cableadas: `experienceAllowsOperation` devuelve `false` y `canCreate` y `allowLifecycleActions` quedan en `false` (`useOperationalShellModel.tsx:53-57`).

## 2. Rutas y guards

Fuente: [router.tsx](../../src/app/router.tsx).

| Ruta | Guard | Destino |
|---|---|---|
| `/login` | — | `LoginPage`. Con sesión válida navega a `getRoleLandingPath` = `/centro-operacional` (`LoginPage.tsx:59`) |
| `/monitoring` | Ninguno (alias fuera de `ProtectedRoute`) | Redirige a `/centro-operacional`; sin sesión, termina en `/login` |
| `/` | `ProtectedRoute` | `RoleLandingRoute` → `/centro-operacional` |
| `/admin` | `ProtectedRoute` + `RequireRoleRoute role="ADMIN"` | `AdminConsolePage` |
| `/centro-operacional` | `ProtectedRoute` + `RequireRoleRoute role={OPERATIONAL_SHELL_ROLES}` (los 4 roles) | `ExecutiveOperationsLayout` → `OperationalCenterHome` |
| `/centro-operacional/{panorama,inteligencia,reportes}` | Igual que arriba | Redirigen a `/centro-operacional` (legado) |
| `/dashboard`, `/red-impacto`, `/situaciones`, `/gestion`, `/intelligence`, `/operational-events`, `/situation-management`, `/legacy-monitoring` | `ProtectedRoute` | Redirigen a `/centro-operacional` |
| `/situaciones/nueva` | `ProtectedRoute` + `RequireSituationCreationRoute` | `RedirectToInternalReport`: abre el formulario INTERNAL del Centro y conserva `?coordination=` |
| `/operational-events/register` | `ProtectedRoute` (sin guard de creación) | `RedirectToInternalReport`. Si el usuario no puede crear, el Centro descarta la intención (`useOperationalShellModel.tsx:157-175`) |
| `*` | — | `/` |

Comportamiento de los guards (`src/shared/components/`) [V]:

| Guard | Mientras `loading` | Si no cumple |
|---|---|---|
| `ProtectedRoute` | "Validando sesión…" | `/login` |
| `RequireRoleRoute` | No espera: depende de que `ProtectedRoute` ya haya resuelto | Navega al landing. Si la ruta rechazada **es** el landing, muestra "Su rol no tiene acceso a esta experiencia." para evitar un bucle |
| `RequireSituationCreationRoute` | "Validando permisos…" | Landing |
| `RequirePermissionRoute` | "Validando permisos…" | `redirectTo` o landing. **No se usa en el router actual** |

## 3. Navegación dentro del Centro

- No hay carril lateral (`rail={false}`). La navegación vive en el menú inferior `OperationalCenterMenu`, que montan todos los layouts mediante `ShellBottom` ([OperationalCenterChrome.tsx](../../src/modules/operational-cards/experience/layouts/OperationalCenterChrome.tsx)) [V].
- Contenido del menú en `b726c47` [V]:
  - destinos de `resolvePlatformNavItems`: ADMIN → "Administración" (`/admin`) + "Centro operacional"; el resto → solo "Centro operacional" ([platformNavigation.ts](../../src/shared/constants/platformNavigation.ts));
  - "Registrar problema" (`RegisterSituationCta`, visible solo si `canCreateSituations`);
  - "Ayuda";
  - "Tutorial", solo si hay pasos. Con `ONBOARDING_TOUR_SUSPENDED = true` no hay, así que no aparece;
  - "Cerrar sesión".
- Desde `/admin`, la vuelta al Centro está en el menú de usuario de la cabecera (`NovexProductHeader` → `NovexUserMenu`) [V].
- **Working tree:** el menú añade la entrada del piloto del tutorial, solo con `import.meta.env.DEV` y rol COORDINADOR. Ver [tutorial-guiado.md](tutorial-guiado.md).

## 4. Roles

### 4.1 ADMIN

| Aspecto | Detalle |
|---|---|
| Pantalla inicial | `/centro-operacional` → `AdminOperationalShell` → `DeckOperationalLayout` [V] |
| Componentes | Personaje, "Mis reportes", problemas de la coordinación seleccionada, mesa de cartas completa, panel de acción en modo consulta |
| Acciones | Seleccionar cartas, abrir el detalle y el historial de cerrados (si tiene `SITUATIONS_VIEW`), ir a `/admin` |
| Restricciones | Sin crear, avanzar ni resolver en la UI (`experienceAllowsOperation('admin') === false`). Sin KPIs DIRECTOR. Sin tutorial (`ADMIN_FLOW = []`) |
| `/admin` | `AdminConsolePage`. Secciones: usuarios, roles, coordinaciones, permisos y sistema. Única escritura: activar o desactivar un usuario [V] (`AdminConsolePage.tsx:15, 91`) |
| Backend | `GET /users?includeInactive=true`, `GET /roles?includeInactive=true`, `GET /permissions`, `GET /coordinations?includeInactive=true&catalog=true`, `PATCH /users/:id` ([admin.api.ts](../../src/modules/api/admin.api.ts)) + los de LEVEL 0/1/2 |

**Vista previa de otros roles:** `getEffectiveDashboardRole(user, ?preview=)` existe (`roleExperience.ts:39-46`), pero solo la usan `OperationalIntelligencePage` y `OperationalIntelligenceDashboard`, que son legado y no están montados. **En producción el ADMIN no puede previsualizar otros roles** [V]: `OperationalCenterHome` usa el rol real.

Recorrido típico:
1. Inicia sesión y aterriza en el Centro, con Coordinación General preseleccionada (`useOperationalShellModel.tsx:197-215`).
2. Abre el menú y elige "Administración".
3. En "Usuarios", activa o desactiva una cuenta.
4. Vuelve al Centro desde el menú de usuario.

### 4.2 DIRECTOR

| Aspecto | Detalle |
|---|---|
| Pantalla inicial | `DirectorOperationalShell` → `DirectorOperationalLayout`, con Coordinación General preseleccionada [V] |
| Componentes | Personaje; `DirectorProblemPanel` (lista de problemas de solo lectura, o resumen de Dirección sin carta); mesa de cartas; `DirectorReadingPanel` con las pestañas **Estado, Internos, Dependencias y Aprendizajes** y el filtro de periodo (Ciclo/Mes/Semana) |
| Acciones | Seleccionar cartas, cambiar de pestaña y periodo, abrir el detalle de un problema en solo lectura (sin `OperationalActionPanel`) |
| Restricciones | Sin crear, avanzar, resolver ni añadir afectaciones. El botón "Registrar problema" no aparece: el catálogo RBAC ya no le da `SITUATIONS_CREATE` (comentario en `permissions.ts:11-18`) |
| Backend | LEVEL 0/1/2 + `/operational-kpis/*`. El backend exige `KPIS_VIEW`, que según la migración `GrantDirectorKpisView` solo tiene DIRECTOR [V en NOVEX_BACKEND]. El frontend **no** comprueba `KPIS_VIEW`: decide por shell. Un 403 se muestra como error del panel |

Recorrido típico:
1. Entra y ve la lectura de Dirección. Al llegar la carta General, ve la lectura de esa coordinación.
2. Selecciona otra carta: cambian el personaje, los problemas y la lectura.
3. Cambia a "Internos" o "Dependencias" y ajusta el periodo.
4. Pulsa un problema y lo lee en el panel central.

Detalle de indicadores, hooks y endpoints: [cartas-y-graficas.md §7](cartas-y-graficas.md#7-indicadores-del-director).

### 4.3 ANALISTA

| Aspecto | Detalle |
|---|---|
| Pantalla inicial | `AnalystOperationalShell` → `DeckOperationalLayout` (igual que ADMIN, con operación) [V] |
| Componentes | Personaje, "Mis reportes", problemas de la coordinación, mesa completa, `OperationalActionPanel` |
| Acciones | Reportar un problema INTERNAL en la carta seleccionada o una dependencia INTER (`canCreate`); pasar a "En atención" si `canAdvanceToInProgress`; resolver con aprendizaje obligatorio si `canResolve`; añadir afectaciones si `canAddConsequence`; ver el historial |
| Regla de servidor relevante | Resolver: solo si la coordinación **responsable** es Coordinación General (NOVEX_BACKEND `src/auth/services/operational-scope.service.ts`, `canResolveSituation`) [V]. Avanzar: misma idea (espejo en `permissions.ts:75-81`) |
| Backend | `POST /situations/register-with-analysis` (con `Idempotency-Key`), `PATCH /situations/:id`, `POST /situations/:id/resolution`, `POST /situations/:id/consequences`, `GET /situations?…`, `GET /situations/categories` |

Recorrido típico (reportar):
1. Selecciona una carta.
2. En el panel derecho ("Reportar o consultar"), pulsa "Problema interno" o "Dependencia de otra coordinación" (`OperationalActionPanel.tsx:227-270`).
3. Completa el formulario. El borrador se guarda por usuario en `localStorage` (`novex.cards.reportDrafts.v1`).
4. Confirma. Tras la respuesta del servidor, el personaje reacciona con `disapprove` y se recarga LEVEL 0.

Recorrido típico (resolver):
1. Abre un problema desde la lista o desde "Mis reportes".
2. Si `canResolve`, escribe el aprendizaje y confirma.
3. El personaje reacciona con `approve`.

### 4.4 COORDINADOR

| Aspecto | Detalle |
|---|---|
| Pantalla inicial | `CoordinatorOperationalShell` → `CoordinatorOperationalLayout`: **sin baraja**, solo su carta (`CoordinationCard`) [V] |
| Componentes | Personaje (siempre su coordinación asignada), su carta, "Mis reportes", `CoordinatorProblemPanel` con los grupos "Debo resolver" (es la responsable) y "Afectan mi área" (INTER que recibe) (`data/coordinatorProblemGroups.ts`), `OperationalActionPanel` |
| Asignación | La coordinación se busca por `user.coordinationId` (del JWT) dentro de LEVEL 0. Si no aparece, la pantalla muestra "Coordinación no asignada" y no enseña la mesa (`CoordinatorOperationalLayout.tsx:35-58`, `useOperationalShellModel.tsx:120-124`) |
| Acciones | INTERNAL siempre en su coordinación; INTER eligiendo la responsable; avanzar, resolver y añadir afectaciones según los flags de la API |
| Regla de servidor | Resolver y avanzar solo si coordina el área **responsable** (`canResolveSituation`) [V en NOVEX_BACKEND] |
| Backend | Igual que ANALISTA |
| Tutorial | En producción, suspendido. **Working tree:** piloto propio (solo DEV) → [tutorial-guiado.md](tutorial-guiado.md) |

Recorrido típico:
1. Entra y ve su carta, con el personaje y las vidas de su área.
2. Revisa los problemas agrupados de su coordinación.
3. Abre uno y pasa a "En atención" o lo resuelve con aprendizaje.
4. Desde "Mis reportes" puede abrir un reporte propio de otra área: el personaje sigue representando su coordinación (`characterLivesSource.ts:14-17`).

## 5. Resumen por rol

| | ADMIN | DIRECTOR | ANALISTA | COORDINADOR |
|---|---|---|---|---|
| Shell / layout | Admin / Deck | Director / Director | Analyst / Deck | Coordinator / Coordinator |
| Mesa completa | Sí | Sí | Sí | No (solo su carta) |
| Carta inicial | General | General | General | La asignada |
| Reportar | No | No | Sí | Sí (si tiene coordinación) |
| Avanzar / resolver | No | No | Según flags API | Según flags API |
| KPIs (`/operational-kpis`) | No | Sí | No | No |
| `/admin` | Sí | No | No | No |

## Límites de verificación

- La matriz de permisos del backend (qué rol tiene `SITUATIONS_CREATE`, `SITUATIONS_UPDATE`, `SITUATIONS_CLOSE`, `SITUATIONS_VIEW`) no se reprodujo aquí. Ver NOVEX_BACKEND → `docs/empalme/autenticacion-y-permisos.md`.
- Los recorridos se dedujeron del código. No se ejecutó la app ni los e2e.
- El comportamiento de un COORDINADOR sin coordinación frente a los cambios de seguridad A2 del backend no está probado de extremo a extremo [?].

## Documentos relacionados

- [README del empalme](README.md) · [Arquitectura](arquitectura.md) · [Cartas y gráficas](cartas-y-graficas.md) · [Contratos API](contratos-api.md) · [Tutorial guiado](tutorial-guiado.md) · [Pruebas y desarrollo](pruebas-y-desarrollo.md) · [CLAUDE.md](../../CLAUDE.md)
- NOVEX_BACKEND → `docs/empalme/autenticacion-y-permisos.md`, `docs/empalme/situaciones-y-reglas.md`, `docs/empalme/seguridad-y-correcciones.md`
