# Arquitectura del frontend

> **Propósito:** explicar cómo está organizada la SPA de NOVEX, cómo arranca, cómo gestiona la sesión y consume la API, y cómo distinguir el código activo del histórico.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_FRONTEND `b726c47` (producción). Las diferencias con `7a49148` / working tree (tutorial) se señalan como «Working tree».
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

---

## 1. Visión general

- SPA en React 19 + React Router 7 (data router `createBrowserRouter`), empaquetada con Vite 8 [V] ([package.json](../../package.json)).
- Una sola experiencia de producto: el **Centro Operacional** (`/centro-operacional`), que elige un *shell* distinto según el rol [V].
- Sin librería de estado global: `useReducer` + Context (`AuthContext`, reducer de cartas `operationalCards.reducer.ts`) [V].
- Sin caché de datos tipo React Query: cada hook llama a un servicio que usa `apiRequest` y parsea la respuesta [V].

## 2. Estructura de carpetas y módulos

La columna «Estado» se obtuvo recorriendo el grafo de imports estáticos y dinámicos desde `src/main.tsx` en `b726c47` (mismo método que [production-data-sources.test.ts](../../src/app/production-data-sources.test.ts)). «Alcanzable» no significa «montado»: ver §8.

| Módulo / carpeta | Estado | Propósito | Archivos clave |
|---|---|---|---|
| `src/app/` | activo | Composición: providers y rutas | [App.tsx](../../src/app/App.tsx), [providers.tsx](../../src/app/providers.tsx), [router.tsx](../../src/app/router.tsx) |
| `src/modules/operational-cards/` | **activo (núcleo)** | Centro Operacional: cartas, personaje, paneles por rol, KPIs DIRECTOR | `experience/`, `hooks/`, `services/`, `state/`, `charts/`, `data/` |
| `src/modules/auth/` | activo | Sesión, JWT, permisos de interfaz | `context/AuthContext.tsx`, `services/*`, `utils/permissions.ts`, `utils/roleExperience.ts` |
| `src/modules/api/` | activo | Clientes REST genéricos (situaciones, admin, evidencias, timeline…) | `situations.api.ts`, `admin.api.ts` |
| `src/modules/situations/` | activo (parcial: 6/10 archivos) | Tipos y utilidades de situación | `types/situation.types.ts`, `data/resolutionCopy.ts` |
| `src/shared/` | activo | HTTP, guards, cabecera/menús, personaje del login, transición post-login | `api/http.ts`, `components/*`, `character/*` |
| `src/pages/` | activo: `LoginPage`, `AdminConsolePage` (+ piezas del login) · legado: `ImpactNetworkPage`, `MonitoringPage`, `OperationalEventsCenterPage`, `OperationalIntelligencePage` | Páginas de ruta | [LoginPage.tsx](../../src/pages/LoginPage.tsx), [AdminConsolePage.tsx](../../src/pages/AdminConsolePage.tsx) |
| `src/modules/executive-operations-center/` | activo solo el **layout** y las constantes de ruta; secciones Panorama/Inteligencia/Reportes **legado** | Marco visual del Centro | `components/layout/ExecutiveOperationsLayout.tsx`, `constants/routes.ts` |
| `src/modules/room/`, `src/modules/monitoring/` | legado, con piezas reutilizadas (`NovexRoom`, `NovexFrame`, `MainScreen`, `ScreenDeck`) | Marco "sala" que envuelve el Centro y `/admin` | `room/index.ts`, `monitoring/components/ScreenDeck.tsx` |
| `src/modules/impact-network/` | legado (2/75 alcanzables) | Antigua "Red de impacto". Solo se usan sus catálogos de color/icono por coordinación | `data/coordination-islands.config.ts`, `data/coordination-icons.config.ts` |
| `src/modules/operational-events/` | legado (provider global montado, sin carga en el Centro) | Antiguo registro/eventos | `context/OperationalEventsContext.tsx` |
| `src/modules/services/` | legado (2/5 alcanzables vía barrel) | Servicios de dashboards antiguos | — |
| `src/modules/dashboard/` | vacío (`.gitkeep`) | — | — |
| `src/modules/onboarding/` | **experimental** | Tutorial. En producción montado pero suspendido; en working tree, motor nuevo y piloto COORDINADOR. Ver [tutorial-guiado.md](tutorial-guiado.md) | `OnboardingContext.tsx`, `OnboardingTour.tsx` |
| `src/dev/` + `dev/character-lives.html` | experimental (solo dev) | Vitrina de vidas del personaje; no es entrada del build [I] (no hay `rollupOptions.input` en `vite.config.ts`) | `src/dev/CharacterLivesShowcase.tsx` |
| `src/styles/` | activo | CSS global y por superficie (cartas, personaje, shell, KPIs) | `operational-cards.css`, `operational-character.css`, `director-kpi-panel.css` |
| `public/` | activo | Arte: `CoordCards/` (15 caras), `rive/novex-character-v1.riv`, escenas | — |

## 3. Flujo de arranque

```
index.html → src/main.tsx
  └─ GoogleOAuthProvider(clientId = VITE_GOOGLE_CLIENT_ID)   // lanza Error si falta (main.tsx:12-16)
     └─ StrictMode → App
        └─ Providers: AuthProvider → OperationalEventsProvider
           └─ RouterProvider(router)
              └─ RootLayout: OnboardingProvider + PostLoginTransitionCueProvider + <Outlet/> + cortina + OnboardingTour
                 ├─ /login → LoginPage
                 └─ ProtectedRoute (sesión)
                    ├─ "/" → RoleLandingRoute → Navigate(/centro-operacional)
                    ├─ /admin → RequireRoleRoute("ADMIN") → AdminConsolePage
                    └─ /centro-operacional → RequireRoleRoute(OPERATIONAL_SHELL_ROLES) → ExecutiveOperationsLayout
                         └─ index → OperationalCenterHome → shell por rol
```

- [main.tsx](../../src/main.tsx) importa también los CSS globales (`index.css`, `novex-os.css`, `login*.css`, `platform-backgrounds.css`, `operational-experience.css`) [V].
- [OperationalCenterHome.tsx](../../src/modules/operational-cards/experience/OperationalCenterHome.tsx) normaliza el rol (`normalizeRoleCode`) y, con [resolveOperationalCenterExperience.ts](../../src/modules/operational-cards/experience/resolveOperationalCenterExperience.ts), monta `DirectorOperationalShell`, `AnalystOperationalShell`, `CoordinatorOperationalShell` o `AdminOperationalShell` [V].
- `ExecutiveOperationsLayout` monta `ExecutiveOperationsProvider enabled={!isHome}`; como las secciones hijas solo redirigen, en la práctica el agregado legacy **nunca se carga** [V] (`ExecutiveOperationsLayout.tsx:37`, `ExecutiveOperationsProvider.tsx:45-48`).
- Tabla de rutas y guards: [roles-y-navegacion.md](roles-y-navegacion.md).

## 4. Autenticación y sesión

| Aspecto | Comportamiento actual | Evidencia |
|---|---|---|
| Login Google | `GoogleLogin` entrega un ID token → `POST /auth/google { credential }` → `{ accessToken, expiresIn, user }` | `services/google-auth.service.ts`, `services/auth-session.service.ts:131-155` [V] |
| Login por correo | `POST /auth/email`, solo visible si `VITE_ENABLE_EMAIL_LOGIN === 'true'` | `LoginPage.tsx:21`, `google-auth.service.ts:10-24` [V] |
| Token | `localStorage["novex.auth.accessToken.v1"]`; migra la clave legada `cunmark.auth.accessToken.v1` | `utils/accessTokenStorage.ts:1-3` [V] |
| Usuario en caché | `localStorage["novex.auth.session.v1"]` (objeto `User`, validado con `isUser`); legada `cunmark.auth.session.v1` | `utils/authSessionStorage.ts:6-8` [V] |
| Claims | Se decodifica el payload del JWT **sin verificar firma** (`sub`, `email`, `roleId`, `roleCode`, `coordinationId`, `permissions`, `status`) | `utils/decodeAccessToken.ts:38-79` [V] |
| Arranque con token | `loading=true`; `GET /auth/me`; se fusiona con los claims | `AuthContext.tsx:51-72, 147-173` [V] |
| Fusión `/auth/me` + JWT | `roleCode` y nombre salen de `/auth/me` (prioridad); **`permissions` y `coordinationId` salen del JWT**; `id = claims.sub` | `auth-session.service.ts:80-110` [V] |
| Fallo del arranque | Cualquier error (también de red) borra token y sesión → `/login` | `AuthContext.tsx:160-165` [V] |
| 401 | `apiRequest` llama al `unauthorizedHandler` registrado por `AuthProvider` (salvo en `/auth/google` y `/auth/email`), que limpia la sesión | `http.ts:57-60, 125-127`; `AuthContext.tsx:137-145` [V] |
| Logout | Solo local: borra claves y espera 200 ms. **No llama al backend** | `auth.service.ts:63-68` [V] |
| Expiración | `expiresIn` se recibe pero no se usa; no se comprueba `exp`. Se confía en el 401 | `auth-session.service.ts:25-29` [V] |
| Onboarding | `PATCH /users/me/onboarding { step, completed }`, en cola serializada | `AuthContext.tsx:214-267`, `auth.service.ts:43-61` [V] |

**Deuda técnica** [V]: (1) JWT en `localStorage`, expuesto ante XSS; (2) si cambia el rol de un usuario, `/auth/me` actualiza `roleCode` pero los `permissions` siguen siendo los del JWT antiguo hasta un nuevo login; (3) un fallo de red al arrancar cierra la sesión; (4) `User.role` (`supervisor`/`ejecutor`) es un resto heredado: la experiencia usa `roleCode`.

## 5. Cliente HTTP y consumo de API

[http.ts](../../src/shared/api/http.ts) es el único punto de salida HTTP del código activo [V]:

- **Base URL:** `VITE_API_BASE_URL` (o `VITE_API_URL`), sin `/` final. En `DEV` sin variable usa `/api/v1`, que Vite redirige a `http://127.0.0.1:3001` ([vite.config.ts](../../vite.config.ts)). En build sin variable lanza `ApiError(status 0)` (`http.ts:40-55`).
- **Cabeceras:** `Accept` y `Content-Type: application/json` siempre; `Authorization: Bearer <token>` si existe; el llamador puede añadir otras (p. ej. `Idempotency-Key` en `situations.api.ts:100`).
- **`ApiError`:** `status`, `code` y `requestId`. Mensaje = `body.message` (string o array unido); en 5xx añade `(Ref: requestId)`. Red caída → `code: 'NETWORK_ERROR'`; `TimeoutError` → `code: 'TIMEOUT'` (`http.ts:16-28, 92-133`).
- **204** devuelve `undefined`.
- No hay reintentos ni timeouts por defecto: el llamador puede pasar `signal` en `init`.

Capas de consumo:

| Capa | Ejemplo | Regla |
|---|---|---|
| Cliente REST genérico | `src/modules/api/situations.api.ts` | Solo transporte tipado |
| Servicio de experiencia | `operational-cards/services/operational-overview.service.ts`, `operational-kpi.service.ts` | Transporte **y parseo defensivo**: el JSON no se confía; un contrato roto lanza error o degrada a `DESCONOCIDO`/`null` |
| Hook | `hooks/useOperationalOverview.ts`, `hooks/useDirector*.ts` | Estado de carga, cancelación, refetch |

Tabla completa de endpoints: [contratos-api.md](contratos-api.md).

## 6. Organización del Centro Operacional

```
OperationalCenterHome
 └─ <Rol>OperationalShell
     ├─ useOperationalShellModel(experience)      // modelo compartido (hooks/useOperationalShellModel.tsx)
     │    ├─ useOperationalOverview()             // controlador + reducer (state/operationalCards.reducer.ts)
     │    ├─ fetchIncidentCategories()
     │    ├─ DirectionCharacter (personaje)       // components/DirectionCharacter.tsx
     │    └─ OperationalActionPanel (reportar/avanzar/resolver)
     └─ Layout: DeckOperationalLayout (ADMIN, ANALISTA) | CoordinatorOperationalLayout | DirectorOperationalLayout (+ useDirectorKpi)
          ├─ CircusScene, ShellRegion, ShellBottom → OperationalCenterMenu   // layouts/OperationalCenterChrome.tsx
          └─ OperationalCardExperience (mesa de cartas)
```

- El rol elige **shell**, no ramas `role ===` dentro de paneles (`resolveOperationalCenterExperience.ts:3-10`). Las escrituras solo se cablean si `experienceAllowsOperation` (ANALISTA, COORDINADOR) (`useOperationalShellModel.tsx:53-57`) [V].
- Un solo controlador por pantalla: el shell crea el estado y lo pasa como dato a la mesa (`OperationalCardExperience.tsx`, comentario de `controller`) [V].
- Niveles de datos [V]: **LEVEL 0** `GET /operational-overview` (mesa y personaje); **LEVEL 1** problemas de la coordinación seleccionada; **LEVEL 2** detalle, evidencias y timeline de un problema. Tras cada escritura confirmada se incrementa `dataGeneration` y se vuelve a pedir LEVEL 0 (`useOperationalOverview.ts:745-763`). **No hay polling.**
- Detalle de cartas, personaje y gráficas: [cartas-y-graficas.md](cartas-y-graficas.md).

## 7. Dependencias principales (`package.json` en `b726c47`)

| Paquete | Versión | Uso |
|---|---|---|
| `react`, `react-dom` | ^19.2.7 | UI |
| `react-router-dom` | ^7.18.0 | Rutas y guards |
| `@react-oauth/google` | ^0.13.5 | Botón y proveedor Google |
| `@rive-app/react-webgl2` | ^4.34.2 | Personaje (`.riv`) |
| `echarts` | ^6.1.0 | Gráficas DIRECTOR (import modular `echarts/core`) |
| `motion` | ^12.42.2 | Animaciones |
| `jspdf` | ^4.2.1 | Exportar PDF (en módulos legados, carga dinámica) |
| `@xyflow/react` | ^12.11.2 | Grafo de la Red de impacto (legado) [I] |
| `vite` ^8.1.0, `typescript` ~6.0.2, `tailwindcss` / `@tailwindcss/vite` ^4.3.1 | — | Build y estilos |
| `vitest` ^4.1.9, `jsdom` ^30.1.2, `playwright` ^1.61.1, `oxlint` ^1.69.0 | — | Pruebas y lint ([pruebas-y-desarrollo.md](pruebas-y-desarrollo.md)) |

## 8. Código activo, legado y experimental: cómo distinguirlo

1. **Montado:** aparece en el árbol de [router.tsx](../../src/app/router.tsx) o lo renderiza un componente montado. Es lo único que ve el usuario.
2. **Alcanzable pero no montado:** se importa desde `main.tsx` sin renderizarse. Ejemplo: `PanoramaPage`, `InteligenciaPage` y `ReportesPage` entran por el *barrel* `executive-operations-center/index.ts`, que importa el router, pero sus rutas redirigen [V]. Otro ejemplo: `OperationalEventsProvider` está en `providers.tsx`, pero solo carga si alguien llama a `loadOperationalEvents()`, y el único consumidor (`operational-events/hooks/useOperationalEvents.ts`) no es alcanzable [V].
3. **No alcanzable:** ningún camino desde `main.tsx`. En `operational-cards` hay 23 archivos así, entre ellos `OperationalShellV2.tsx` (monolito sustituido), `DirectorKpiPanel.tsx`, `DirectorDirectionView.tsx`, `DirectorCoordinationHistory.tsx`, `DirectorEstadoEvolucion.tsx`, `charts/DirectorEstadoCharts.tsx` y los `*.fixture.ts` [V].
4. **Guardián:** `production-data-sources.test.ts` hace fallar la suite si un archivo `mock|fixture|stub|fake|demo|dummy` llega a ser alcanzable (no ejecutado en esta revisión).

**Regla práctica:** antes de editar un archivo, comprueba que esté en el caso 1. Para el caso 2 o 3, no lo "arregles": decide primero si se elimina o se reactiva (pendiente de decisión, [README](README.md)).

## 9. Working tree (`7a49148` + cambios sin commit)

Solo añade o modifica `src/modules/onboarding/**`, atributos `data-tour` en componentes de `operational-cards`, una entrada en `OperationalCenterMenu.tsx` (piloto del tutorial, solo `DEV` + COORDINADOR) y `src/styles/tour-engine.css` [V] (`git diff --stat b726c47 7a49148`). No cambia rutas, auth, servicios ni contratos.

## Límites de verificación

- Alcanzabilidad calculada con un script de imports propio sobre `git archive b726c47`. No se ejecutaron build, tests ni la app.
- No se verificó qué *bundle* sirve hoy Cloud Run, ni las variables de build reales.
- El comportamiento de `@xyflow/react` y `motion` no se rastreó en detalle.

## Documentos relacionados

- [README del empalme](README.md) · [Roles y navegación](roles-y-navegacion.md) · [Cartas y gráficas](cartas-y-graficas.md) · [Contratos API](contratos-api.md) · [Tutorial guiado](tutorial-guiado.md) · [Pruebas y desarrollo](pruebas-y-desarrollo.md) · [CLAUDE.md](../../CLAUDE.md)
- NOVEX_BACKEND → `docs/empalme/arquitectura.md`, `docs/empalme/autenticacion-y-permisos.md`
