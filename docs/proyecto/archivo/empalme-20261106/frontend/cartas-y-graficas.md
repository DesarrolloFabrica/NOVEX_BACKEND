# Cartas, personaje y gráficas

> **Propósito:** documentar la experiencia "Cartas y Circo" del Centro Operacional (catálogo de cartas, estados, personaje Rive, vidas), sus fuentes de datos y los indicadores del DIRECTOR, con las reglas que no deben romperse al modificarla.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_FRONTEND `b726c47` (producción). El working tree (`7a49148` + cambios sin commit) solo añade atributos `data-tour` a algunos de estos componentes, sin cambiar su comportamiento.
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

---

## 1. Identidad "Cartas y Circo"

- **Escena:** fondo de circo `public/assets/scenes/circus-stage-background.png`, montado por `CircusScene` ([OperationalCenterChrome.tsx](../../src/modules/operational-cards/experience/layouts/OperationalCenterChrome.tsx)) [V].
- **Cartas:** cada coordinación es una carta ilustrada (`public/CoordCards/*.png`). La **identidad** (cara, color) y la **integridad operacional** (aura, rótulo de estado, `data-status`) son lenguajes separados: "una coordinación azul en estado crítico sigue siendo azul" ([CoordinationCard.tsx](../../src/modules/operational-cards/components/CoordinationCard.tsx) líneas 8-33) [V].
- **Paneles "ticket":** con una coordinación seleccionada, los paneles toman un tema de papel, tinta y marca de agua por coordinación ([ticketThemes.ts](../../src/modules/operational-cards/experience/ticketThemes.ts), `TicketPanelFrame.tsx`). Los temas son presentación, no estado [V].
- **Personaje:** "reactor guardián, no mascota" (`DirectionCharacter.tsx:17-44`). Expresa el estado de la coordinación observada y muestra sus vidas [V].

## 2. Catálogo de cartas

Hay 15 filas técnicas en `coordinations` (backend) y 15 caras en `public/CoordCards`, pero la mesa pinta **9 mazos**. La estructura de producto está declarada a mano en [productHierarchy.ts](../../src/modules/operational-cards/data/productHierarchy.ts) (líneas 68-148), porque la BD no tiene jerarquía [V].

| # mesa | Code técnico | Nombre en la mesa | Cara (`/CoordCards/`) | Nota |
|---|---|---|---|---|
| 1 | `coord-general` | Coordinación General de Operaciones | `coordinacionGeneral.png` | Carta inicial de ADMIN, DIRECTOR y ANALISTA |
| 2 | `coord-b2b` | B2B | `b2b.png` | |
| 3 | `coord-desarrollo-profesional` | Desarrollo Profesional | `DesarrolloProfesional.png` | |
| 4 | `coord-especializaciones` | Especializaciones | `especializaciones.png` | |
| 5 | `coord-operaciones-academicas` | Operación Académica (mazo con 5 hijas) | `operacionAcademica.png` | |
| 5.a | `coord-bellas-artes` | `shortName` del DTO | `BellasArtes.png` | Hija |
| 5.b | `coord-empresarial` | Transformación Empresarial (renombrada en el front) | `transformacionEmpresarial.png` | Hija |
| 5.c | `coord-ingenierias` | `shortName` del DTO | `ingenierias.png` | Hija |
| 5.d | `coord-transversales` | `shortName` del DTO | `Transversales.png` | Hija |
| 5.e | `coord-negocios` | `shortName` del DTO | `negocios.png` | Hija |
| 6 | `coord-proyeccion-social` | Proyección Social | `ProyeccionSocial.png` | |
| 7 | `coord-saber-pro` | Saber Pro | `SaberPro.png` | |
| 8 | `coord-homologaciones` | **Servicio** | arte de `coord-servicios` (`withArtOf`) | El estado y los problemas son de `coord-homologaciones`; solo se toma prestado el arte |
| 9 | `coord-fabrica-contenidos` | Fábrica de Contenidos | `fabrica.png` | |
| — | `coord-servicios` | **no se pinta** (`LEGACY_UNMAPPED_CODES`) | `servicio.png` (solo como arte del nodo 8) | Sus situaciones siguen existiendo en BD |

- Mapa code → cara: [coordinationCardFace.ts](../../src/modules/operational-cards/data/coordinationCardFace.ts) (líneas 16-44). Si no hay cara, o la imagen falla, la carta cae a la presentación **legacy** (isla + icono + nombre) y nunca toma la cara de otra coordinación [V].
- Color e icono: `impact-network/data/coordination-islands.config.ts` y `coordination-icons.config.ts`, vía `coordinationVisualIdentity.ts`. El color del frontend tiene prioridad sobre el del backend [V].
- Nomenclatura: en los DTO HTTP `id` es el UUID y `code` es el legible; en el catálogo runtime legado es al revés (`operational-overview.contract.ts:20-26`) [V].

## 3. Estados operacionales y su lectura visual

Vocabulario: `ESTABLE | ALERTA | CRITICO | DESCONOCIDO` ([operational-status.types.ts](../../src/modules/operational-cards/types/operational-status.types.ts)). Cualquier valor no reconocido se parsea como `DESCONOCIDO`, **nunca** como `ESTABLE` [V].

| Estado | Rótulo (`OPERATIONAL_STATUS_LABEL`) | Carta | `mood` del personaje (`characterMood.ts:50-63`) |
|---|---|---|---|
| ESTABLE | Estable | `data-status="ESTABLE"` → aura y punto de estado por CSS | `happy_2` |
| ALERTA | Alerta | `data-status="ALERTA"` | `neutral` |
| CRITICO | Crítico | `data-status="CRITICO"` | `sad_2` |
| DESCONOCIDO | Desconocido | `data-status="DESCONOCIDO"` | `neutral`. El enum `unknown` del `.riv` existe pero no se usa: deuda de producto documentada en el código |

- Los estilos por estado están en `src/styles/operational-cards.css`, `operational-character.css` y `director-direction.css` (selectores `[data-status=…]`) [V].
- **Rótulo bajo el personaje:** estado de la carta seleccionada o, sin selección, `directionStatus` (`characterReaction.ts:55-71`). La **cara**, sin selección, queda en `neutral` (`characterMood.ts:74-79`) [V].
- **Fallo de LEVEL 0** (red, HTTP, contrato) → `DESCONOCIDO` y sin cartas inventadas (`OperationalCardExperience.tsx`, comentario sobre `directionStatus`) [V].
- **Cálculo:** todo en el backend (NOVEX_BACKEND `src/operational-overview/domain/coordination-integrity.ts`, política `integrity-mvp-v1`). Una coordinación pasa a CRITICO si se cumple alguna de estas condiciones: ≥1 problema crítico, ≥3 altos, ≥5 activos, ≥3 coordinaciones afectadas o ≥1 dependencia entrante crítica. Es ESTABLE si no tiene activos ni dependencias entrantes. En cualquier otro caso, ALERTA. La regla de Dirección (≥2 críticas → CRITICO; …; alertas ≥ `ceil(total/3)` → ALERTA) está copiada como comentario en [operational-overview.contract.ts](../../src/modules/operational-cards/types/operational-overview.contract.ts) (líneas 90-104) [V].
- [integrity-policy.ts](../../src/modules/operational-cards/domain/integrity-policy.ts) replica esos umbrales **solo para redactar la explicación** ("por qué está crítico") en `DirectorEstadoOperativo`. No recalcula el estado [V]. Si el backend cambia umbrales, este espejo queda desfasado: deuda técnica.

## 4. Personaje Rive

| Elemento | Valor | Fuente |
|---|---|---|
| Archivo | `/rive/novex-character-v1.riv` | `DirectionCharacter.tsx:51`, `shared/character/novexCharacterRive.ts:9` |
| Artboard / State Machine | `character_main` / `CharacterSM` | ídem |
| Binding | `autoBind: true` sobre el View Model `CharacterVM`. La máquina **no declara inputs**: no usar `useStateMachineInput` | `DirectionCharacter.tsx:55-67, 123-133` |
| Escrituras de React | `mood` (enum, solo si cambia respecto a lo que tiene el VM) · triggers `approve` / `disapprove` | `DirectionCharacter.tsx:143-205` |
| No usados en el Centro | `blink`, `lookX`, `lookY` (verificados en el `.riv`; los usa el personaje del login en `src/shared/character/`) | `DirectionCharacter.tsx:41-43` |

Reacciones [V]:

| Evento confirmado por el servidor | Trigger | Significado | Dónde se pide |
|---|---|---|---|
| Reporte creado (`SUBMIT_REPORT_SUCCESS`) | `disapprove` | Malestar: apareció un problema | `operationalCards.reducer.ts:1005-1020` |
| Problema resuelto (`SUBMIT_RESOLUTION_SUCCESS`) | `approve` | Alivio | `operationalCards.reducer.ts:1119-1122` |
| Avance de estado, conflicto o error | ninguna | — | `reducer.ts:1190, 1309` |

La reacción lleva un `id` (la `dataGeneration`). Se dispara una sola vez, solo si la coordinación representada coincide, y se consume con `CONSUME_CHARACTER_REACTION`. Así, un rerender o un remontaje no la repite (`useOperationalShellModel.tsx:241-250`).

**Qué coordinación representa** ([characterLivesSource.ts](../../src/modules/operational-cards/data/characterLivesSource.ts)): para el COORDINADOR, siempre la asignada; para el resto, la seleccionada o ninguna.

## 5. Sistema de vidas

| Capa | Comportamiento |
|---|---|
| **Backend (fuente)** | `lifePoints = clamp(10 − daño, 0, 10)`. Daño por problema activo (OPEN, IN_PROGRESS): LOW 1, MEDIUM 1, HIGH 2, CRITICAL 2. Suman los problemas propios y las dependencias INTER **externas** entrantes (afectada = X y responsable ≠ X). Se deriva en cada lectura y no se persiste. Un snapshot inconsistente da `null`. NOVEX_BACKEND `src/operational-overview/domain/coordination-life-points.ts` (política `life-points-v1`) [V] |
| **Contrato** | `CoordinationOverview.lifePoints: number \| null`, independiente de `status` |
| **Parseo** | `parseLifePoints`: solo acepta un entero en 0..10; todo lo demás es `null`, sin saturar ni redondear (`operational-overview.service.ts:94-118`) [V] |
| **Modelo** | 5 corazones × 2 puntos → `full` / `half` / `empty`; `null` → 5 `unknown`. Lectura textual `7 / 10` o `— / 10` ([characterLivesModel.ts](../../src/modules/operational-cards/data/characterLivesModel.ts)) [V] |
| **Visibilidad** | Sin coordinación representada, ocultas. Con coordinación y `null`, visibles en estado no disponible. La franja se reserva siempre para que la figura no salte (`DirectionCharacter.tsx:34-40`) [V] |
| **Animación** | `characterLifeTransition.ts` + `useCharacterLifeTransition`. Solo anima si el dueño es el mismo, los dos valores son válidos y el valor cambia. Cambiar de carta no es ganar ni perder vidas [V] |

Las vidas solo aparecen bajo el personaje. Las cartas no las muestran [V] (`CoordinationCard.tsx` no lee `lifePoints`).

## 6. Fuentes de datos de la mesa

| Nivel | Endpoint | Servicio / hook | Uso |
|---|---|---|---|
| LEVEL 0 | `GET /operational-overview` | [operational-overview.service.ts](../../src/modules/operational-cards/services/operational-overview.service.ts) → `useOperationalOverview` | Cartas, `directionStatus`, `totals`, vidas, `analystRegistry` |
| LEVEL 1 | `GET /situations?…` | `coordination-problems.service.ts` | Problemas de la carta seleccionada |
| LEVEL 2 | `GET /situations/:id` + evidencias + timeline | `problem-detail.service.ts` | Detalle y flags `canResolve` / `canAdvanceToInProgress` / `canAddConsequence` |
| Mis reportes / historial | `GET /situations?…` | `my-reports.service.ts`, `problem-history.service.ts` | Paneles laterales |

- Contrato y validación: [operational-overview.contract.ts](../../src/modules/operational-cards/types/operational-overview.contract.ts). Un campo estructural inválido lanza `OperationalOverviewContractError` y deja LEVEL 0 en error. `incomingDependencyCount` inválido se lee como 0; `lifePoints` inválido, como `null` [V].
- `analystRegistry` no es carta. Si tiene activos, se muestra un texto provisional "Registro de analista — N problemas activos (provisional)" (`OperationalCardExperience.tsx:289-300`) [V].
- Recarga de LEVEL 0: al montar y tras cada escritura confirmada. **No hay polling** (`useOperationalOverview.ts:745-763`) [V].
- Parámetros de query concretos: [contratos-api.md](contratos-api.md).

## 7. Indicadores del DIRECTOR

Contenedor: [DirectorReadingPanel.tsx](../../src/modules/operational-cards/experience/director/DirectorReadingPanel.tsx). Pestañas `state | internos | dependencias | aprendizajes` (líneas 23-37). **Un solo `AnalysisPeriod`** (Ciclo/Mes/Semana, por defecto el ciclo actual) compartido por todas las pestañas. Se revalida al volver el foco a la ventana. El filtro solo aparece con una carta seleccionada (líneas 81-84, 121-132, 227-239) [V]. Periodos: [analysis-period.ts](../../src/modules/operational-cards/domain/analysis-period.ts).

Todas las peticiones son `GET` y requieren `KPIS_VIEW` en el backend.

| Pestaña | Ámbito | Hook | Endpoint | Componentes / opción ECharts |
|---|---|---|---|---|
| Estado (sin carta) | Dirección | `useDirectorKpi` | `/operational-kpis?scope=direction` | `DirectorEstadoOperativo` (badge + explicación con `integrity-policy`), `DirectorEstadoComposicion` |
| Estado (con carta) | Coordinación | `useDirectorKpi` + `useDirectorEstadoState` | `/operational-kpis?scope=coordination&coordinationId=` y `/operational-kpis/state?scope=coordination&coordinationId&from&to&kind[&calendarEnd]` | Flujo (Carga, Movimiento): `DirectorFlujoProblemas` → `DirectorFlujoChart` + `flujo-option.ts`, `flujo-coverage.ts`, `flujo-tooltip.ts` · Corte (Severidad, Atención): `DirectorEstadoComposicion` / `DirectorEstadoCorte` → `DirectorEstadoCompositionCharts`, `DirectorEstadoCorteCharts` + `estado-corte-option.ts` · Antigüedad: `DirectorAntiguedad` → `antiguedad-option.ts` · Resolución: `DirectorResolucion` → `resolucion-option.ts` |
| Internos | Coordinación | `useDirectorInternalProblems`, `useDirectorInternalRecurrence` | `/operational-kpis/internal-problems`, `/operational-kpis/internal-recurrence` | Carrusel Recurrencia / Afectaciones (`DirectorInternosRecurrencia`, `DirectorInternosAfectaciones`, `DirectorInternosTimeline`). Sin ECharts |
| Dependencias | Coordinación | `useDirectorRelations`, `useDirectorPeriodHistory` | `/operational-kpis/relations`, `/operational-kpis/history` | `DirectorDependenciasPanel` + `DirectorHistorySeriesChart` (sin ECharts). Selección de pareja y lado INTER |
| Aprendizajes | Coordinación | `useDirectorLearningsSummary`, `useDirectorLearningItems` | `/operational-kpis/learnings`, `/operational-kpis/learnings/items` | `DirectorAprendizajesChart` + `aprendizajes-option.ts` |

- Sin carta, Internos, Dependencias y Aprendizajes quedan en `idle` y piden seleccionar una carta (p. ej. `DirectorAprendizajesPanel.tsx:212`) [V].
- Regla de arquitectura de Estado (`DirectorEstadoPanel.tsx:17-46`) [V]:
  - el periodo del panel es la **única** fuente temporal;
  - Carga y Movimiento solo lo cambian (drill-down ciclo → mes → semana) y el resto lo consume;
  - las gráficas no usan `new Date()` para su universo;
  - cada gráfica nueva declara su naturaleza (TIME SERIES, SNAPSHOT AT CUT, FLOW…) y su alcance.
- Motor de gráficas: [NovexChart.tsx](../../src/modules/operational-cards/charts/NovexChart.tsx), ECharts modular (`echarts/core`, Bar/Line/Pie, `SVGRenderer`). Tokens visuales en `novex-chart-theme.ts` ("papel + tinta + acento") [V].
- **Panel de problemas del DIRECTOR** (`DirectorProblemPanel.tsx`): lista de la carta con filtros de severidad (Todas/Crítica/Alta/Media/Baja) y estado (Activos/Todos/Abiertos/En revisión/Cerrados), definidos en `data/coordinationProblemFilters.ts` y aplicados con `hooks/useProblemListFilters.ts`, o un resumen de Dirección. `IN_PROGRESS` se rotula "En revisión" en el filtro y "En atención" en `ProblemActions.tsx`. El detalle se abre en el mismo panel, en solo lectura [V].
- **Sin uso en producción** [V] (no alcanzables): `DirectorKpiPanel`, `DirectorDirectionView`/`DirectorDirectionTable`/`DirectorCoordinationTable`, `DirectorCoordinationHistory` + `useDirectorCoordinationHistory`, `DirectorEstadoEvolucion` + `charts/DirectorEstadoCharts.tsx`, `useDirectorDirectionKpi`, `utils/kpi-*`, `*.fixture.ts`. Los fetchers `fetchOperationalKpiPeriod` (`/period`) y `fetchOperationalKpiBreakdown` (`/breakdown`) existen pero no tienen llamador alcanzable.

## 8. Componentes y servicios involucrados (mapa rápido)

| Pieza | Archivo |
|---|---|
| Mesa | `experience/OperationalCardExperience.tsx`, `components/CoordinationTable.tsx`, `CoordinationDeckFan.tsx`, `CoordinationDeckStack.tsx`, `data/tableLayout.ts`, `data/deckContext.ts` |
| Carta | `components/CoordinationCard.tsx`, `data/coordinationCardFace.ts`, `data/coordinationVisualIdentity.ts` |
| Personaje y vidas | `components/DirectionCharacter.tsx`, `components/CharacterLives.tsx`, `data/characterMood.ts`, `data/characterReaction.ts`, `data/characterLives*.ts`, `data/characterLifeTransition.ts` |
| Estado de la escena | `state/operationalCards.reducer.ts`, `hooks/useOperationalOverview.ts`, `hooks/useOperationalShellModel.tsx` |
| Paneles | `components/OperationalActionPanel.tsx`, `ProblemDetail.tsx`, `ProblemActions.tsx`, `ReportProblemForm.tsx`, `MyReportsPanel.tsx`, `CoordinationProblemList.tsx`, `CoordinatorProblemPanel.tsx` |
| KPIs | `experience/director/*`, `hooks/useDirector*.ts`, `services/operational-kpi.service.ts`, `internal-problems.service.ts`, `learnings.service.ts`, `charts/*` |

## 9. Restricciones para futuras modificaciones

1. **No calcular la integridad ni las vidas en el frontend.** Consumir `status` y `lifePoints` tal cual. Ante un dato inválido, degradar a `DESCONOCIDO` o `null`; nunca a `ESTABLE` ni a 10.
2. **No animar la cara desde React.** Boca, ojos y cabeza viven en la State Machine. React solo escribe propiedades del View Model (`mood`, triggers). No añadir `useStateMachineInput`.
3. **Mantener la lectura textual bajo el personaje** (`direction-character__readout`) y el nombre accesible. El estado nunca se comunica solo con color.
4. **No mezclar identidad y estado:** el color o la cara de la carta no deben cambiar con la integridad.
5. **Reacciones solo tras confirmación del servidor**, nunca al pulsar el botón.
6. **No reutilizar `happy_1` / `sad_1` como mood persistente:** están reservados para reacciones.
7. **Una sola fuente temporal** en la lectura del DIRECTOR (`AnalysisPeriod`).
8. Cambiar nombres de artboard, máquina o propiedades exige reexportar el `.riv`. Si no, el canvas queda en blanco.
9. La jerarquía de `productHierarchy.ts` es un espejo temporal. Su destino es un `parentCode` del backend (objetivo futuro, comentado en el archivo).

**Deuda técnica** [V]:
- `DirectionCharacter.tsx` redeclara las constantes Rive en vez de importar `shared/character/novexCharacterRive.ts`.
- `DESCONOCIDO` → `neutral` (pendiente de decisión de producto).
- Espejo de umbrales en `integrity-policy.ts`.
- Dependencia del Centro de catálogos de color e icono alojados en el módulo legado `impact-network`.

## Límites de verificación

- No se ejecutó la app: el aspecto visual (auras, corazones, temas) se describe desde el código y el CSS, no observado.
- No se abrió el `.riv`. Los nombres de propiedades se toman de los comentarios "verificados en runtime" del código.
- Los nombres de las hijas 5.a, 5.c, 5.d y 5.e salen del `shortName` del backend. No se consultó la BD; los nombres de la tabla vienen de los nombres de archivo de las caras [I].

## Documentos relacionados

- [README del empalme](README.md) · [Arquitectura](arquitectura.md) · [Roles y navegación](roles-y-navegacion.md) · [Contratos API](contratos-api.md) · [Tutorial guiado](tutorial-guiado.md) · [Pruebas y desarrollo](pruebas-y-desarrollo.md) · [CLAUDE.md](../../CLAUDE.md)
- NOVEX_BACKEND → `docs/empalme/situaciones-y-reglas.md`, `docs/empalme/arquitectura.md`
