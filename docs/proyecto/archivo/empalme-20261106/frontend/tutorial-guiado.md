# Tutorial guiado (motor de recorridos y piloto del COORDINADOR)

> **Propósito:** explicar cómo está construido el tutorial guiado, qué hay en producción y qué solo en la rama de trabajo, cómo se prueba y cómo añadir un paso sin romper lo existente.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_FRONTEND `b726c47` (producción) / `7a49148` + cambios locales (tutorial)
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

---

## 0. Resumen en diez líneas

| Pregunta | Respuesta |
|---|---|
| ¿Está en producción? | **No.** El motor nuevo, el piloto y las anclas `data-tour` del Centro Operacional solo existen en `sync/casa-oficina-20261030` (`4b3cd80`, `cea1496`, `7a49148`) y en cambios locales sin commit [V: `git diff b726c47 7a49148 --stat`]. El bundle publicado (`/assets/index-DTLph4To.js`, descargado el 2026-11-06) no contiene los textos del piloto (p. ej. «en una carta», «Bienvenido a su coordinaci…»), mientras que el texto de control «Mis reportes» sí aparece [V: consulta GET de solo lectura; ver [README](README.md) §2] |
| ¿Qué hay en `b726c47`? | El módulo `src/modules/onboarding/` antiguo (`OnboardingContext.tsx`, `OnboardingTour.tsx`, `onboardingTourSteps.ts`…) con el tour general **ya suspendido** (`ONBOARDING_TOUR_SUSPENDED = true`, línea 52 en `b726c47`) [V: `git show b726c47:src/modules/onboarding/OnboardingContext.tsx`] |
| ¿Cómo se ve hoy? | Solo con `npm run dev` / `vite` (`import.meta.env.DEV`) y con un usuario de rol COORDINADOR: aparece una invitación y una opción «Piloto del tutorial» en el menú del Centro [V] |
| ¿Escribe en backend? | **No.** El piloto no llama a `PATCH /users/me/onboarding`; guarda progreso solo en `localStorage` y la invitación en `sessionStorage` [V] |
| Pasos del piloto | 11, todos en `/centro-operacional` [V] |

---

## 1. Mapa de archivos

### 1.1 Motor (`src/modules/onboarding/engine/`) — añadido por `4b3cd80` [V]

| Archivo | Rol | Puro / DOM |
|---|---|---|
| [tourPlan.ts](../../src/modules/onboarding/engine/tourPlan.ts) | Define `TourStepRequirements` (`requires`, `roles`, `optional`, `kind`, `advanceWhen`, `interaction`) y filtra pasos por permisos y rol (`planTourSteps`, `isStepAuthorized`). Exige **todos** los permisos de `requires` (`every`, línea 45) | Puro |
| [tourPredicates.ts](../../src/modules/onboarding/engine/tourPredicates.ts) | Predicados pasivos sobre el DOM: `present`, `attribute`, `all`, `any` (`evaluateTourPredicate`). `legacyAdvancePredicate` traduce `advanceOnTarget`/`advanceOnVisibleTarget` heredados | Lee DOM, nunca escribe |
| [tourGeometry.ts](../../src/modules/onboarding/engine/tourGeometry.ts) | Rectángulo resaltado (`toHighlightRect`), colocación del globo (`planCardPlacement`), modo hoja en móvil (`isSmallViewport`, `TOUR_SHEET_BREAKPOINT = 760`), y desplazamiento de contenedores con scroll (`revealInScrollContainers`). En local: `sheetFreeBand`, `nearestScrollFrame`, `pickSheetEdge`, `revealWithinBand` (§5) | Mayormente puro; `revealInScrollContainers`/`nearestScrollFrame` leen y mueven `scrollTop` |
| [tourProgress.ts](../../src/modules/onboarding/engine/tourProgress.ts) | Progreso por usuario: tour general (`novex.onboarding.v3.<userId>`, `TOUR_VERSION = 2`) y piloto (`novex.onboarding.pilot.coordinador-piloto.v1.<userId>`, `PILOT_VERSION = 1`). Lee sin tocar la clave antigua `novex.onboarding.v2.<userId>` | `localStorage` |
| [tourCopy.ts](../../src/modules/onboarding/engine/tourCopy.ts) | Texto compuesto del aviso «elemento ausente» (`composeMissingNotice`): añade «Si lo prefiere, continúe sin este paso.» si el paso es opcional y «El recorrido no avanzará hasta que usted lo decida.» | Puro |

### 1.2 Presentación y conexión

| Archivo | Rol |
|---|---|
| [TourOverlay.tsx](../../src/modules/onboarding/TourOverlay.tsx) | Componente genérico del recorrido: localiza el ancla (`MutationObserver`, plazo `LOCATE_TIMEOUT_MS = 6000`), evalúa `gate` y `advanceWhen`, dibuja el velo (4 bandas alrededor del rectángulo + `__spotlight`), gestiona teclado (Escape pausa, flechas navegan, Tab atrapado salvo `interaction: 'external'`) y devuelve el foco al cerrar. Lo usan tanto el tour general como el piloto. Se monta con `createPortal` en `document.body` [V] |
| [TourBubble.tsx](../../src/modules/onboarding/TourBubble.tsx) | Globo «tonto»: recibe textos, número de paso, aviso y pie ya resueltos, y la colocación calculada (`center`, lado con flecha o `sheet`) [V] |
| [src/styles/tour-engine.css](../../src/styles/tour-engine.css) | Estilos del velo, globo y hoja. La altura máxima de la hoja (`max-height: 50vh` en local) **debe coincidir** con `SHEET_MAX_HEIGHT_RATIO` en `tourGeometry.ts` (comentario en línea 42) [V] |
| [OnboardingContext.tsx](../../src/modules/onboarding/OnboardingContext.tsx) | Tour general por rol: arranque automático, sincronización con backend (`completeOnboarding`, `saveOnboardingProgress`) y `localStorage` v3. **Suspendido** (§7) [V] |
| [OnboardingTour.tsx](../../src/modules/onboarding/OnboardingTour.tsx) | Conecta el contexto con `TourOverlay`. Montado en [RootLayout.tsx](../../src/shared/components/RootLayout.tsx) líneas 12–17 [V] |
| [onboardingTourSteps.ts](../../src/modules/onboarding/onboardingTourSteps.ts) | Tipos `OnboardingTourStep` y `TourStepGate` (líneas 11–53) y pasos **antiguos** por rol. El del DIRECTOR apunta a `/dashboard` (ruta retirada) y el de ANALISTA/COORDINADOR a `data-tour="report-problem"`, que no existe en ningún componente [V] |
| [tours/coordinatorPilot.ts](../../src/modules/onboarding/tours/coordinatorPilot.ts) | Definición de los 11 pasos del piloto (`COORDINATOR_PILOT_STEPS`) [V] |
| [tours/CoordinatorPilotTour.tsx](../../src/modules/onboarding/tours/CoordinatorPilotTour.tsx) | Ejecuta el piloto con estado local; filtra con `planTourSteps(..., 'COORDINADOR')`; escribe progreso con `writePilotProgress` [V] |
| [tours/CoordinatorPilotInvitation.tsx](../../src/modules/onboarding/tours/CoordinatorPilotInvitation.tsx) | Invitación no bloqueante («Tutorial · solo desarrollo»), con «Ahora no» / «Iniciar recorrido» [V] |
| [OperationalCenterMenu.tsx](../../src/modules/operational-cards/experience/layouts/OperationalCenterMenu.tsx) | Único punto de montaje del piloto (líneas 36–37, 218–232, 253–264) [V] |

---

## 2. Formato de un paso

Forma TypeScript efectiva (unión de `OnboardingTourStep` en `onboardingTourSteps.ts:22-53` y `TourStepRequirements` en `tourPlan.ts:9-31`) [V]:

```ts
interface OnboardingTourStep extends TourStepRequirements {
  id: string                    // único; los tests del piloto fijan el orden de ids
  route: string                 // el piloto usa siempre '/centro-operacional'
  target: string                // selector CSS del ancla; admite alternativas con coma
  eyebrow: string; title: string; description: string; expectation: string
  advanceOnTarget?: string      // heredado (tour general); el piloto no lo usa
  advanceOnVisibleTarget?: string
  visibilityRoot?: string
  waitingLabel?: string
  missingNotice?: string        // texto si el ancla no aparece en 6 s
  missingTarget?: string        // zona donde el usuario hace aparecer el ancla
  placementTarget?: string      // contexto mayor del que el globo se aparta
  gate?: TourStepGate           // condición previa: pide volver a otra vista
  lockNavigation?: boolean
  placement?: 'auto' | 'center' | 'left'
  highlightTarget?: boolean     // false = sin resaltado (bienvenida)
}
interface TourStepRequirements {
  requires?: string[]           // TODOS los permisos
  roles?: NovexRoleCode[]
  optional?: boolean            // ofrece «Continuar sin este paso»
  kind?: 'info' | 'action' | 'wait'
  advanceWhen?: TourPredicate
  interaction?: 'none' | 'external'
}
interface TourStepGate {
  when: TourPredicate; target: string
  eyebrow: string; title: string; description: string; expectation: string; waitingLabel: string
}
```

Ejemplo real (paso `seguimiento` de `coordinatorPilot.ts`) [V]:

```ts
{
  id: 'seguimiento',
  route: ROUTE,
  target: '[data-tour="problem-actions"]',
  eyebrow: 'Seguimiento',
  title: 'Seguimiento y resolución',
  description: '…',
  expectation: '…',
  requires: ['SITUATIONS_UPDATE'],
  optional: true,
  missingNotice: 'Estas acciones aparecen al abrir un problema. Elija uno en la lista y pulse «Reintentar».',
  missingTarget: PROBLEM_LIST_WITH_ROWS,
}
```

Ayudantes del archivo [V]: `PROBLEM_LIST_WITH_ROWS` (`[data-tour="coordination-problems"]:has([data-testid="problem-row"])`), `PANEL_BACK_CONTROLS` (`detail-back`, `history-back`, `report-form-back`), `panelShowing(modes)` (predicado `any` sobre `[data-testid="action-panel"][data-mode="…"]`) y `returnToPanelGate(modes, purpose)`.

---

## 3. Piloto del COORDINADOR: los 11 pasos

Estado del **working tree** (incluye cambios locales; ver §9 para lo que difiere de `7a49148`) [V]:

| # | id | target | Propósito | requires / opciones |
|---|---|---|---|---|
| 1 | `bienvenida` | `[data-tour="operational-shell"]` (`highlightTarget: false`, `placement: 'center'`) | Bienvenida centrada | — |
| 2 | `carta-propia` | `[data-tour="own-coordination"] [data-testid="coordination-card"]` | Carta de su coordinación | — |
| 3 | `indicadores` | `… [data-testid="coordination-card-status"]`; `placementTarget` = la carta | Etiqueta de estado | — |
| 4 | `personaje` | `[data-tour="operational-shell"] [data-testid="direction-character"]` | Personaje y vidas | — |
| 5 | `mis-reportes` | `[data-tour="my-reports"] [data-testid="my-reports"]` | Problemas que reportó el usuario | — |
| 6 | `problemas` | `[data-tour="coordination-problems"]` | «Debo resolver» / «Afectan mi coordinación» | — |
| 7 | `detalle` | `[data-tour="problem-detail"]` | Expediente | `optional`, `missingTarget: PROBLEM_LIST_WITH_ROWS` |
| 8 | `seguimiento` | `[data-tour="problem-actions"]` | Avance a En atención / cierre con aprendizaje | `requires: ['SITUATIONS_UPDATE']`, `optional`, `missingTarget` |
| 9 | `reportar` | `[data-testid="action-panel-idle"]` (local; en `7a49148` era `[data-tour="action-panel"]`) | Botones de reporte | `requires: ['SITUATIONS_CREATE']`, `gate` si el panel está en `detail`, `history` o `report` |
| 10 | `historial` | `[data-tour="history-open"], [data-tour="problem-history"]` | Acceso al historial | `optional`, `gate` si el panel está en `detail` o `report` |
| 11 | `menu` | `[data-tour="center-menu"]` | Menú y fin | — |

Reglas que fijan los tests del piloto ([coordinatorPilot.test.ts](../../src/modules/onboarding/tours/coordinatorPilot.test.ts)) [V]: 11 pasos con ids únicos y **en ese orden exacto**; todos en `/centro-operacional`; ninguno declara `advanceOnTarget`, `advanceOnVisibleTarget`, `advanceWhen` ni `lockNavigation` (ningún paso avanza por una acción de negocio); `detalle` y `seguimiento` son opcionales y con `missingNotice`; descripciones ≤ 180 caracteres; sin vocabulario técnico (`componente`, `selector`, `DOM`, `API`, `data-`…).

> Nota de permisos [V]: el catálogo del backend da a COORDINADOR `SITUATIONS_CREATE` y `SITUATIONS_UPDATE` (NOVEX_BACKEND `src/permissions/seeds/permissions.catalog.seed.ts`, `ROLE_PERMISSION_CODES`), así que con datos de catálogo verá los 11 pasos. El permiso real de cada usuario depende de la base de datos [?].

---

## 4. Anclas `data-tour`

### 4.1 Anclas del Centro Operacional — **todas añadidas por la rama** (`cea1496`/`4b3cd80`), ausentes en `b726c47` [V: `git diff b726c47 7a49148 -- src/modules/operational-cards/`]

| `data-tour` | Componente (working tree) | Usada por el piloto |
|---|---|---|
| `operational-shell` | `experience/layouts/CoordinatorOperationalLayout.tsx:73`, `DeckOperationalLayout.tsx:43`, `DirectorOperationalLayout.tsx:34` | Pasos 1 y 4 |
| `own-coordination` | `CoordinatorOperationalLayout.tsx:99` | Pasos 2 y 3 |
| `my-reports` | prop `tourId` → `OperationalCenterChrome.tsx:40`; valor en `CoordinatorOperationalLayout.tsx:119`, `DeckOperationalLayout.tsx:70` | Paso 5 |
| `coordination-problems` | `tourId` en `CoordinatorOperationalLayout.tsx:144`, `DeckOperationalLayout.tsx:97`, `DirectorOperationalLayout.tsx:63` | Paso 6, `missingTarget` de 7 y 8 |
| `action-panel` | `tourId` en `CoordinatorOperationalLayout.tsx:168`, `DeckOperationalLayout.tsx:134` | Ya no (paso 9 cambió en local) |
| `director-reading` | `tourId` en `DirectorOperationalLayout.tsx:86` | No |
| `operational-deck` | `DeckOperationalLayout.tsx:121`, `DirectorOperationalLayout.tsx:73` | No |
| `center-menu` | `OperationalCenterMenu.tsx:104` (botón hamburguesa) | Paso 11 |
| `center-menu-panel` | `OperationalCenterMenu.tsx:123` (solo con el menú abierto) | No |
| `problem-filters` | `components/CoordinationProblemFilters.tsx:32` | No |
| `report-form` | `components/OperationalActionPanel.tsx:112` | No |
| `history-open` | `OperationalActionPanel.tsx:241` y `:284` | Paso 10 |
| `report-internal` / `report-dependency` | `OperationalActionPanel.tsx:258` / `:269` | No |
| `problem-actions` | `components/ProblemActions.tsx:94` | Paso 8 |
| `problem-detail` | `components/ProblemDetail.tsx:315` | Paso 7 |
| `problem-history` | `components/ProblemHistoryPanel.tsx:140` | Paso 10 |
| `director-mode-<id>` / `director-period` | `experience/director/DirectorReadingPanel.tsx:205` / `:232` | No |

(Rutas relativas a `src/modules/operational-cards/`.)

### 4.2 `data-testid` usados como ancla — existen ya en `b726c47` [V]

`coordination-card` y `coordination-card-status` (`components/CoordinationCard.tsx:97,158`), `direction-character` (`components/DirectionCharacter.tsx:283`), `my-reports` (`components/MyReportsPanel.tsx:114`), `action-panel-idle` (`OperationalActionPanel.tsx:226`), `action-panel` con `data-mode` = `report|history|detail|idle` (`OperationalActionPanel.tsx:110,129,152,214`), `detail-back` (`ProblemDetail.tsx:334`), `history-back` (`ProblemHistoryPanel.tsx:150`), `report-form-back` (`ReportProblemForm.tsx:139`), `problem-row` (prop `testId` en `ProblemRow.tsx:82`).

> Deuda [I]: mezclar `data-tour` y `data-testid` como anclas acopla el tutorial a los identificadores de prueba. Un renombre de un `data-testid` rompe el tutorial en silencio (ver §8.3).

### 4.3 Anclas heredadas (presentes en `b726c47` y en la rama)

Viven en módulos retirados de la navegación o en piezas no visibles en el Centro: `platform-brand`, `register-situation` (`src/shared/components/NovexSystemRail.tsx`; el Centro monta `NovexRoom` con `rail={false}`), `user-menu` (`NovexUserMenu.tsx`), `admin-console` (`src/pages/AdminConsolePage.tsx:133`), y en `impact-network`, `monitoring`, `operational-events`: `executive-operational-overview`, `impact-network`, `situation-management`, `management-dossier`, `ai-report`, `capture-form`, `capture-review`, `report-modal`, `report-scroll`, `report-end`, `download-report`, `dashboard-register`, `analyst-register`, `executive-kpis`, `priority-situations`, `impact-summary`, `operational-trend`, `role-dashboard`, `situations-registry` [V: `git grep data-tour b726c47 -- src`]. No hay ningún `data-tour="report-problem"` en componentes, aunque el tour general lo referencia [V].

---

## 5. Velo, globo, geometría y responsive

**Velo y resaltado** [V, `TourOverlay.tsx`]: con ancla, cuatro bandas `novex-tour__shade` alrededor del rectángulo y un `novex-tour__spotlight` encima; el área resaltada queda libre para clicar (así el usuario puede elegir un problema en el paso 6). Si el paso declara `interaction: 'external'` o si el ancla está ausente / el `gate` está activo, el velo pasa a `--passthrough` (no bloquea clics). Movimiento reducido: clase `novex-tour--reduced-motion` y `@media (prefers-reduced-motion)` en la CSS.

**Estados de un paso** [V]: `locating` → `ready` o, a los 6 s, `missing`. En `missing` se ofrece «Reintentar» y, si `optional`, «Continuar sin este paso». Nunca avanza solo. Con `gate.when` cierto el globo muestra el texto del `gate`, resalta su `target` (p. ej. «Volver») y espera; el motor **no pulsa** ese control.

**Colocación** (`planCardPlacement`) [V]: `center` si no hay rectángulo o `placement: 'center'`; en pantallas `< 760 px` de ancho, modo `sheet` (hoja arriba o abajo); en el resto prueba izquierda, derecha, debajo y encima, y si nada cabe centra sin flecha. `placementTarget` aparta el globo de un contexto mayor y la flecha apunta al elemento resaltado (`pointAt`).

**Cambios locales sin commit en la hoja** [V: `git diff`]:

| Cambio | Archivo |
|---|---|
| `SHEET_MAX_HEIGHT_RATIO` 0.46 → **0.5** y `max-height` 46vh → **50vh** | `tourGeometry.ts:43`, `tour-engine.css` |
| La hoja tiene `overflow-y: auto` y `overscroll-behavior: contain`: el pie con botones siempre alcanzable | `tour-engine.css` |
| `sheetFreeBand(viewport, sheetHeight, edge)`: franja vertical que la hoja deja libre | `tourGeometry.ts:204` |
| `nearestScrollFrame(element)`: contenedor con scroll más cercano | `tourGeometry.ts:225` |
| `pickSheetEdge(rect, viewport, cardHeight, frame)`: elige el borde cuya franja libre cae dentro del contenedor del ancla (mín. 48 px visibles); si ninguno es viable, el borde que menos tapa (`sheetEdgeByOverlap`) | `tourGeometry.ts:243` |
| `revealWithinBand`: lleva el **inicio** del objetivo a la franja libre (lo centra si cabe; si no, alinea su parte superior), escribiendo `scrollTop` de fuera hacia dentro | `tourGeometry.ts:271` |
| `planCardPlacement` acepta `sheetEdge` y `revealInScrollContainers` acepta `band` | `tourGeometry.ts:110`, `:311` |
| `TourOverlay` calcula borde y franja en la medición (`sheetEdgeRef`) y los pasa a la colocación | `TourOverlay.tsx` |

> Riesgo [I]: `sheetEdgeRef` es una `ref`; su cambio no provoca render. La colocación depende de que la medición posterior (`setRect`, `SETTLE_DELAY_MS = 320`) vuelva a renderizar. No verificado en dispositivos reales.

---

## 6. Persistencia del progreso

| Clave | Almacén | Escribe | Lee | Formato |
|---|---|---|---|---|
| `novex.onboarding.pilot.coordinador-piloto.v1.<userId>` | `localStorage` | `CoordinatorPilotTour` en cada Siguiente/Anterior/Pausa/Omitir/Finalizar | **Nadie** fuera de tests: `readPilotProgress` no se usa en código montado [V: grep] | `{version, status: 'in-progress'|'completed'|'skipped', stepIndex, updatedAt}` |
| `novex.pilot.invitation.v1.<userId>` | `sessionStorage` | Invitación al pulsar «Ahora no» o «Iniciar recorrido» | Invitación al montar | `'dismissed'` |
| `novex.onboarding.v3.<userId>` | `localStorage` | Tour general (suspendido: no escribe) | `decideTourStart` | Igual que el piloto, `version = TOUR_VERSION = 2` |
| `novex.onboarding.v2.<userId>` | `localStorage` | Nadie (histórico) | `readLegacyTourHistory` (sin uso en la decisión) | `'completed'` o número |
| Backend `users.onboarding_step/onboarding_completed` | `PATCH /users/me/onboarding` | Tour general; **suspendido**, no se llama | `/auth/me` | — |

`<userId>` va con `encodeURIComponent`, salvo la clave v2 [V, `tourProgress.ts:105`].

Consecuencias [V]: el piloto **siempre empieza en el paso 1** (`useState(0)` en `CoordinatorPilotTour.tsx:20`); el progreso guardado no se usa para reanudar. La invitación reaparece en cada sesión nueva del navegador.

**Implicación de versión**: cambiar `PILOT_VERSION` (o `TOUR_VERSION`) invalida los registros anteriores, porque `readPilotProgress` descarta versiones distintas (línea 162). Hoy no tiene efecto visible porque nadie lee el progreso del piloto [I].

---

## 7. Activación y suspensión

| Mecanismo | Dónde | Efecto |
|---|---|---|
| `pilotAvailable = import.meta.env.DEV && normalizeRoleCode(user?.roleCode) === 'COORDINADOR'` | `OperationalCenterMenu.tsx:36-37` | Solo en desarrollo (Vite lo fija en `false` en `vite build`) y solo COORDINADOR. Muestra la invitación (línea 253) y la opción «Piloto del tutorial» (`data-testid="shell-menu-pilot"`, línea 222) [V] |
| `ONBOARDING_TOUR_SUSPENDED = true` | `OnboardingContext.tsx:59` | Sin arranque automático ni overlay del tour general, `steps` vacío (el menú no ofrece «Continuar tutorial»), sin escrituras a backend ni `localStorage` [V] |
| Variable `VITE_*` | — | **No existe** ninguna que active el tutorial [V: grep `import.meta.env` en `src`] |

Advertencia del propio código (comentario en `OnboardingContext.tsx:56-57`) [V]: no basta con vaciar los pasos; un rol sin pasos se trata como ADMIN y se marca como completado en backend.

Atención [I]: `normalizeRoleCode` cae por defecto en COORDINADOR para roles desconocidos (ver [README](README.md) §6); en DEV un usuario con rol no reconocido vería el piloto.

---

## 8. Pruebas existentes

**No se ejecutaron para esta documentación.** Ver [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) para comandos.

### 8.1 Unitarias (Vitest)

| Archivo | Cubre |
|---|---|
| `engine/tourPlan.test.ts` | Filtrado por permisos (todos), rol, usuario nulo, orden |
| `engine/tourPredicates.test.ts` | `present`, `attribute`, `all`/`any`, compatibilidad heredada |
| `engine/tourGeometry.test.ts` | Relleno y límites del resaltado, centrado sin ancla, hoja en móvil; en local, además `sheetFreeBand`, `pickSheetEdge` y `revealInScrollContainers` con franja (+75 líneas sin commit) |
| `engine/tourProgress.test.ts` | Decisión de arranque por versión, registros dañados, clave v2 intacta, aislamiento por usuario |
| `engine/tourCopy.test.ts` | Puntuación y frases del aviso de ausencia |
| `tours/coordinatorPilot.test.ts` | Secuencia, rutas, ausencia de hitos de escritura, opcionales, anclas, gates, permisos, lenguaje |
| `OnboardingTour.test.tsx` | `TourOverlay` con pasos informativos, de estado y ausentes; Escape/flechas; `lockNavigation` |
| `onboardingTourSteps.test.ts` | Pasos antiguos por rol (existe en `b726c47`) |

### 8.2 E2E con mocks (Playwright, `e2e/`)

Todas usan [coordinator-pilot.fixture.ts](../../e2e/coordinator-pilot.fixture.ts): inyecta token y sesión en `localStorage`, intercepta `**/api/v1/**`, responde GET a `/auth/me`, `/operational-overview`, `/situations/categories`, `/situations`, `/situations/:id` y sus `evidences`/`timeline`, y **registra y rechaza con 403 toda escritura** para comprobar que el piloto no escribe. Escenarios: `CRITICO`, `ESTABLE`, `UN_REPORTE`… En local la fixture admite `permissions` para restringir permisos.

| Spec | Cubre | Estado |
|---|---|---|
| `coordinator-pilot-tour.spec.ts` | 11 pasos con resaltado alineado y sin escrituras; Anterior, Escape, Omitir, teclado; otros roles no ven el piloto | En `7a49148`, modificado en local |
| `coordinator-pilot-welcome.spec.ts` / `-invitation.spec.ts` | Invitación, «Ahora no», inicio, paso 1, móvil, otros roles | `7a49148` |
| `coordinator-pilot-card.spec.ts` / `-status.spec.ts` / `-character.spec.ts` / `-reports.spec.ts` | Pasos 2, 3, 4 y 5 por escenario y viewport; botones de 44 px | `7a49148` |
| `coordinator-pilot-problems.spec.ts` | Pasos 7 a 11 con problemas, reintento, historial | `7a49148`, modificado en local |
| `coordinator-pilot-problems-step6.spec.ts` … `step9.spec.ts` | Un spec por paso (6–9): estados vacíos, permisos (sin `SITUATIONS_CREATE` el paso 9 desaparece), navegación ida y vuelta | **Sin seguimiento** (untracked) |
| `tour-anchors.spec.ts` | Anclas por rol en el estado inicial, sin escrituras al aterrizar, ancla del menú solo abierto | `7a49148` |
| `coordinator-pilot.helpers.ts`, `role-experience.fixture.ts` | Ayudantes compartidos | `7a49148` |

Algunas specs guardan capturas en `test-results/pilot-screens*/` [V: `SCREENSHOT_DIR` en `coordinator-pilot-tour.spec.ts:59`].

### 8.3 Limitación de la prueba de anclas [V]

`coordinatorPilot.test.ts` («cada ancla que un paso señala existe en el código de producción») concatena **todo** `src` no-test, incluido el propio `tours/coordinatorPilot.ts`, que contiene literalmente cada selector. Por tanto la prueba **se satisface sola** y no detecta un ancla eliminada de un componente. La verificación real de anclas la hacen las e2e. Deuda técnica: excluir `src/modules/onboarding/` del texto buscado.

---

## 9. Cambios locales pendientes (no perder)

Estado del working tree frente a `7a49148` [V: `git status`, `git diff --stat`]:

| Archivo | +/− | Contenido |
|---|---|---|
| `src/modules/onboarding/engine/tourGeometry.ts` | +138/−12 | Hoja: franja libre, borde por contenedor de scroll, `revealWithinBand`, ratio 0.5 (§5) |
| `src/modules/onboarding/engine/tourGeometry.test.ts` | +75/−0 | Pruebas de lo anterior |
| `src/modules/onboarding/TourOverlay.tsx` | +26/−1 | Usa `pickSheetEdge`/`sheetFreeBand` al medir |
| `src/styles/tour-engine.css` | +11/−1 | `50vh`, scroll interno de la hoja |
| `src/modules/onboarding/tours/coordinatorPilot.ts` | +17/−13 | Textos nuevos de pasos 6–9; paso 9 apunta a `[data-testid="action-panel-idle"]` |
| `e2e/coordinator-pilot-tour.spec.ts`, `e2e/coordinator-pilot-problems.spec.ts` | +1/−1, +3/−3 | Paso 9: nuevo título y nueva ancla |
| `e2e/coordinator-pilot.fixture.ts` | +7/−5 | Parámetro `permissions` |
| `e2e/coordinator-pilot-problems-step{6,7,8,9}.spec.ts` | nuevos: 188, 231, 224, 229 líneas | Untracked |

Total: 8 archivos, +278/−36 [V]. `git` avisa de conversión LF→CRLF en tres de ellos.

> **Advertencia:** este trabajo solo existe en disco. Antes de `checkout`, `stash`, `rebase`, `reset`, `clean` o cambio de rama debe preservarse (commit en su rama o copia), **con autorización** ([CLAUDE.md](../../CLAUDE.md) §5 y §9). Las pruebas no se han ejecutado tras estos cambios [H: README §3].

---

## 10. Qué falta para producción (objetivo futuro)

| Pendiente | Detalle |
|---|---|
| Integración | Commit de los cambios locales, PR de `sync/casa-oficina-20261030` hacia `integracion/cartas-circo` (no hacia `main`, que despliega) |
| Ejecutar pruebas | Unitarias y e2e del piloto; hoy la CI no ejecuta e2e |
| Mecanismo de activación | Sustituir `import.meta.env.DEV` por una bandera decidida (variable de build, permiso o flag remota). No existe ninguna hoy |
| Validación funcional | Móvil, tablet y escritorio con datos reales; usuarios con y sin problemas; COORDINADOR sin coordinación (relacionado con el cambio A2 del backend [?]) |
| Reanudación | Decidir si el piloto reanuda desde `readPilotProgress` o si se elimina la escritura |
| Sincronización con backend | `onboardingCompleted` es booleano y no distingue completado/omitido (comentario en `tourProgress.ts:13-15`). Decidir si el piloto llama a `PATCH /users/me/onboarding` |
| Otros roles | No hay tours nuevos para DIRECTOR, ANALISTA ni ADMIN; los antiguos apuntan a anclas inexistentes |
| Retirar el tour general antiguo | O reescribirlo sobre las anclas nuevas antes de poner `ONBOARDING_TOUR_SUSPENDED = false` |
| Prueba de anclas | Corregir §8.3 |

---

## 11. Procedimiento: añadir un paso sin alterar los existentes

1. **Preservar primero** los cambios locales (§9), con autorización. No trabajar encima de cambios sin commit de otra persona sin acordarlo.
2. **Elegir el ancla.** Preferir un `data-tour` nuevo y estable en el componente real, no un `data-testid`. Añadirlo como atributo pasivo (no cambia estilos ni comportamiento). Si el elemento está en una región de `OperationalCenterChrome`, usar la prop `tourId`. Comprobar que el ancla existe en el layout del COORDINADOR (`CoordinatorOperationalLayout.tsx`), no solo en el de la baraja.
3. **Insertar el paso** en `COORDINATOR_PILOT_STEPS` (`tours/coordinatorPilot.ts`) en la posición deseada, sin tocar los objetos de los demás pasos. Campos mínimos: `id` único, `route: ROUTE`, `target`, `eyebrow`, `title`, `description` (≤ 180 caracteres, sin vocabulario técnico), `expectation`.
4. **Decidir dependencias:**
   - Si el ancla solo aparece tras una acción del usuario: `optional: true`, `missingNotice` (sin repetir «continúe sin este paso»; lo añade `composeMissingNotice`) y, si aplica, `missingTarget`.
   - Si la vista debe estar en otro estado: `gate` con `returnToPanelGate(...)` o un `TourStepGate` propio. Nunca pulsar controles desde el motor.
   - Si el contenido es una acción que el usuario solo ve con un permiso: `requires: ['<PERMISO>']`, con el código exacto del backend (contrastar en NOVEX_BACKEND → `docs/empalme/autenticacion-y-permisos.md`).
   - No usar `advanceWhen`, `advanceOnTarget` ni `lockNavigation`: los tests del piloto los prohíben.
5. **Actualizar tests unitarios** en `tours/coordinatorPilot.test.ts`: `COORDINATOR_PILOT_STEP_COUNT` (11 → 12), el array de ids en orden, la prueba de permisos («ve los once pasos») y, si es opcional o tiene gate, las pruebas de §«transición desde el expediente».
6. **Actualizar e2e**: `coordinator-pilot-tour.spec.ts` (lista de pasos con `n` y `target`, y «recorre los once pasos»); las specs que navegan por número de paso (`-problems*.spec.ts`, `-card`, `-status`…) si el paso se inserta antes de ellos, porque cambian los índices; y crear una spec del paso nuevo siguiendo el patrón de `coordinator-pilot-problems-step9.spec.ts` (viewports, sin escrituras, permisos, estado vacío). Si el ancla se usa en otros roles, revisar `tour-anchors.spec.ts`.
7. **Versión de progreso.** Insertar o reordenar pasos cambia el significado de `stepIndex` guardado. Hoy el piloto no reanuda, así que no hay efecto; si se implementa la reanudación, subir `PILOT_VERSION` en `engine/tourProgress.ts` al cambiar la secuencia (los registros antiguos se descartan) y ajustar `tourProgress.test.ts`.
8. **Responsive.** Probar `< 760 px` (hoja) y escritorio; si la hoja tapa el objetivo, revisar `pickSheetEdge`/`placementTarget` antes de tocar la CSS. Mantener `SHEET_MAX_HEIGHT_RATIO` y `max-height` sincronizados.
9. **Validar** (con autorización para comandos que escriben): `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e -- e2e/coordinator-pilot`. Informar qué se ejecutó y el resultado literal.
10. **Commit y PR** en la rama del tutorial hacia integración, nunca a `main`.

---

## Límites de verificación

- No se ejecutó ninguna prueba ni la app; el comportamiento visual (hoja, foco, scroll) se describe leyendo código.
- «No está en el bundle de producción» se comprobó el 2026-11-06 buscando textos del piloto en el bundle servido (GET de solo lectura). Es una comprobación por ausencia de cadenas, no una comparación byte a byte con un build de `b726c47`.
- Los permisos efectivos de cada usuario dependen de la base de datos; aquí solo se leyó el catálogo de semillas del backend [?].
- La lista de anclas se obtuvo con búsquedas de `data-tour="…"`, `data-tour={…}` y `tourId=`; un ancla construida de otra forma podría faltar [I].
- Línea exacta del montaje en `OperationalCenterMenu.tsx` calculada sobre el working tree a 2026-11-06.

## Documentos relacionados

- [README de empalme](README.md) · [Arquitectura](arquitectura.md) · [Roles y navegación](roles-y-navegacion.md) · [Cartas y gráficas](cartas-y-graficas.md) · [Contratos API](contratos-api.md) · [Pruebas y desarrollo](pruebas-y-desarrollo.md) · [CLAUDE.md](../../CLAUDE.md)
- Backend (sin enlace): NOVEX_BACKEND → `docs/empalme/autenticacion-y-permisos.md`, NOVEX_BACKEND → `docs/empalme/pruebas-y-desarrollo.md`
