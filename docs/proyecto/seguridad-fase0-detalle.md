# Seguridad y correcciones

> **Propósito:** estado de las correcciones de seguridad de la Fase 0 (A1, A2, M1) y de los hallazgos abiertos N1, N2, O1–O4 y de privacidad en IA: problema, impacto, código, Git, pruebas y decisiones pendientes. Incluye el manejo seguro de los worktrees, un orden de integración propuesto y los controles y riesgos residuales.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_BACKEND `5ffc65f` (producción); A1 en `72e24fe`; A2/M1 en worktrees sin commit
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

Las reglas de autorización de referencia están en [seguridad-y-permisos.md](seguridad-y-permisos.md). Nada de este documento autoriza commits, despliegues ni cambios en producción: cada paso requiere aprobación explícita ([CLAUDE.md](../../CLAUDE.md)).

> **Estado tras la Fase 01A (2026-11-09).** A2, M1, N1, N2, O1 y O2 están **corregidos y con pruebas** en `refactor/novex-consolidacion` del backend (commits `485476c` A2/M1, `8be4415` PATCH, `b28026f` alta INTER). Las correcciones se reimplementaron desde la especificación de §3–§6, **ajustadas a las decisiones de producto aprobadas** (no a la política provisional «P1»): el ANALISTA analiza cualquier caso activo, y el PATCH ya no reasigna la coordinación para ningún rol. Nada está desplegado. Las secciones §2–§6 describen el problema original y se conservan como historia. El contrato propuesto del traslado administrativo está en §8.1. Estado vivo: [seguridad-y-permisos.md](seguridad-y-permisos.md).

---

## 1. Resumen

| Id | Problema | Estado Git [V] | ¿En producción (`5ffc65f`)? | Bloqueo |
|---|---|---|---|---|
| **A1** | IDOR en `GET/PATCH /recommendations/:id` | Commit `ce8c5ad` (`origin/seguridad/a1-recomendaciones`), fusionado en `origin/integracion/cartas-circo` @ `72e24fe` (PR #2, 2026-11-05) | **No** | Autorización para llevarlo a `main` |
| **A2** | COORDINADOR sin coordinación lista todas las situaciones | **Sin commit**, worktree `NOVEX_BACKEND_sec` | No | Crear rama/PR propios |
| **M1** | `analyze` y crear recomendación usan el alcance de lectura | **Sin commit**, worktree `NOVEX_BACKEND_m1` | No | **Decisión de producto P1** |
| **N1** | ANALISTA se auto-concede la resolución reasignando a `coord-general` | Sin corrección | Presente | Evaluar y corregir |
| **N2** | PATCH puede igualar responsable y afectada en un INTER | Sin corrección | Presente | Evaluar y corregir |

A1, A2 y M1 no tocan esquema ni migraciones [V: diffs revisados].

### 1.1 Clasificación por nivel de evidencia (revisión Fase 2C, 2026-11-06)

Qué significa cada columna:

- **Revisión estática:** el problema se identificó leyendo el código.
- **Demostrado con pruebas:** hay una prueba automatizada que reproduce el problema o valida la corrección.
- **Corrección local, integrada o desplegada:** corresponde al estado Git, a `origin/integracion/cartas-circo` y a `origin/main`/producción, respectivamente.

Ninguna fila es una vulnerabilidad **explotada**: no se hizo ninguna prueba de explotación contra un entorno real.

| Id | Revisión estática | Demostrado con pruebas | Corrección local | Integrada | Desplegada | Decisión de producto pendiente |
|---|---|---|---|---|---|---|
| **A1** | Sí [V] | Hay pruebas escritas: `test/security/a1-recommendations-scope.spec.ts` (112 casos; 36 fallan con el código anterior, según el mensaje de `ce8c5ad`) [H]. **No reejecutadas** el 2026-11-06 | Sí (`ce8c5ad`) | **Sí** (`72e24fe`) | **No** | No. Falta autorización para llevarla a `main` |
| **A2** | Sí [V] | Hay pruebas escritas en `_sec` (`a2-*.spec.ts`; la `.pg` es opcional). Resultado [H] del 2026-11-05, no reejecutado | Sí, **sin commit** | No | No | No. Falta rama y PR |
| **M1** | Sí [V] | Hay pruebas escritas en `_m1` (`m1-situation-writes-scope.spec.ts`). Resultado [H], no reejecutado | Sí, **sin commit** | No | No | **Sí: política P1** |
| **N1** | Sí [V por lectura] | **No** | No | No | No | Sí: regla de reasignación de coordinación |
| **N2** | Sí [V por lectura] | **No** | No | No | No | No (consistencia de datos) |
| **O1** | Sí [V por lectura] | **No** | No | No | No | Se decide junto con N1 |
| **O2** | Sí [V por lectura] | **No** | No | No | No | Sí: ¿se pueden editar casos cerrados? |
| **O3** | Sí [V por lectura] | **No** | No | No | No | No (validación) |
| **O4** | Sí [V por lectura] | **No** | No | No | No | No (coherencia de la pista `canUpdate`) |
| **P1-IA** | Sí [V por lectura] | **No** | No | No | No | Sí: minimización y retención de datos enviados a Gemini (ver §6.2) |

---

## 2. A1 — IDOR en recomendaciones por id

**Problema [V en `5ffc65f`].** `SituationRecommendationsController` (`/recommendations`) solo exige el permiso: `GET /recommendations/:id` con `SITUATIONS_VIEW` y `PATCH /recommendations/:id` con `SITUATIONS_UPDATE`, sin comprobar el alcance de la situación a la que pertenece la recomendación ([situation-recommendations.controller.ts](../../src/situation-recommendations/situation-recommendations.controller.ts) L67-96). `updateRecommendation` tampoco valida propiedad ([situation-recommendations.service.ts](../../src/situation-recommendations/situation-recommendations.service.ts) L165-204).

**Impacto.** Conociendo el UUID de una recomendación, un COORDINADOR lee recomendaciones de cualquier coordinación, y un COORDINADOR o ANALISTA puede modificarlas (título, estado, `assignedUserId`, notas, fecha). El endpoint `PATCH` también sirve de oráculo de existencia de usuarios (`ensureUserExists`). Los endpoints están marcados `@deprecated` y la UI de `/gestion` no los usa según el propio código, pero siguen montados [V].

**Corrección existente (`ce8c5ad`).**
- `GET` carga la recomendación y aplica `requireAccessibleSituation` sobre su `situationId`; `PATCH` aplica `requireOperableSituation` **antes** de modificar o validar `assignedUserId`.
- Fuera de alcance responde lo mismo que un id inexistente: 404 «Recomendación no encontrada: <id>» (`recommendationNotFound()` en el servicio). Los 403 de propiedad se propagan sin cambios.

**Archivos:** `src/situation-recommendations/situation-recommendations.controller.ts`, `src/situation-recommendations/situation-recommendations.service.ts`, `test/security/a1-recommendations-scope.spec.ts` (629 líneas).

**Rama/worktree.** `NOVEX_BACKEND_a1` (rama `seguridad/a1-recomendaciones` @ `ce8c5ad`, limpio); validado en `NOVEX_BACKEND_int` (HEAD desacoplado @ `72e24fe`, limpio). Hay una **copia sin commit, idéntica byte a byte**, en `NOVEX_BACKEND_sec` [H: comparación del 2026-11-05/06].

**Pruebas.** El mensaje del commit declara 112 pruebas (matriz 4 roles × INTERNAL/INTER, 404 uniformes, orden de validaciones) y que 36 fallan con el código anterior [H]. **No reejecutadas el 2026-11-06.**

**Riesgos de integración.** Bajo. Cambia el código de respuesta para accesos fuera de alcance (200 → 404). Si algún cliente usaba esos endpoints de forma cruzada, dejará de funcionar [I]. Fusionado en integración, **no desplegado**: un push a `main` despliega automáticamente y sin migraciones (ver [despliegue-y-operacion.md](despliegue-y-operacion.md)).

---

## 3. A2 — Listado sin filtro para COORDINADOR sin coordinación

**Problema [V en `5ffc65f`].** `resolveSituationListCoordinationId` devuelve `undefined` cuando el actor es COORDINADOR y no tiene `coordinationId` ([operational-scope.service.ts](../../src/auth/services/operational-scope.service.ts) L67-79). En `SituationsService.list`, `undefined` significa «sin filtro de coordinación» (`src/situations/situations.service.ts` L620-635), así que `GET /situations` sin `coordinationId` ni `mine` devuelve **todas** las situaciones. `users.coordination_id` es anulable (migración `1786100000000-MakeUserCoordinationNullable`) [V].

**Impacto.** Un COORDINADOR mal configurado (sin coordinación) lee el listado institucional completo. El detalle sí falla cerrado (`assertSituationInScope` devuelve 404 sin coordinación), por lo que la fuga se limita a los campos del listado [V].

**Corrección existente (sin commit, `NOVEX_BACKEND_sec`).**
- `operational-scope.service.ts`: un actor acotado sin coordinación provoca `ForbiddenException` «El usuario no tiene una coordinación asignada» en lugar de `undefined` (falla cerrado para cualquier consumidor futuro).
- `situations.service.ts`: nuevo caso `sinCoordinacion` → el listado se limita a `createdByUserId = actor.sub` y se marca `scope: 'own-only'`. Con este cambio el `throw` anterior no es alcanzable desde `list` [V por lectura del diff].
- Hoy `SituationsService.list` es el único consumidor de `resolveSituationListCoordinationId` [V por búsqueda en `src/`].

**Archivos (worktree, sin commit):** `src/auth/services/operational-scope.service.ts`, `src/situations/situations.service.ts`, `test/security/a2-situations-list-scope.spec.ts` (265 líneas), `test/security/a2-situations-list-scope.pg.spec.ts` (476 líneas; opcional, solo corre con `NOVEX_SEC_PG_URL` apuntando a una base local desechable), `test/security/support/scope-fixtures.ts` (146 líneas).

**Estado Git.** Rama local `security/fase0-a1-a2` @ `5ffc65f`; **sin rama publicada ni PR**. El worktree mezcla A1 y A2: para un PR solo de A2 hay que excluir `src/situation-recommendations/*` y `test/security/a1-*`, que ya están en integración [V].

**Pruebas.** Según notas del 2026-11-05 pasaban [H]. **No reejecutadas el 2026-11-06.**

**Decisiones pendientes.** Ninguna de producto [H]. Confirmar con frontend que `scope: 'own-only'` se presenta bien para este caso [?].

**Riesgos de integración.** El trabajo existe **solo en disco**. `test/security/support/` es nuevo y puede ser reutilizado por otras suites: incluirlo siempre con A2.

---

## 4. M1 — Escrituras con alcance de lectura

**Problema [V en `5ffc65f`].**
- `POST /situations/:id/analyze` (`AI_ANALYZE`) usa `requireAccessibleSituation` ([ai-orchestration.controller.ts](../../src/ai-orchestration/ai-orchestration.controller.ts) L71-88) y no comprueba el estado.
- `POST /situations/:id/recommendations` (`SITUATIONS_UPDATE`) también usa la puerta de lectura ([situation-recommendations.controller.ts](../../src/situation-recommendations/situation-recommendations.controller.ts) L48-65).

**Impacto.** Analizar ejecuta Gemini (coste, envío del expediente) y **reemplaza** evaluación de impacto, recomendaciones IA y versión vigente del análisis, que alimentan la integridad de las cartas [V según comentario del diff; ver [EMPALME-NOVEX.md](EMPALME-NOVEX.md) (IA)]. Hoy pueden hacerlo: un ANALISTA sobre **cualquier** caso, incluso cerrado; un COORDINADOR sobre casos de los que solo es afectada o autor en otra área. Lo mismo para crear recomendaciones manuales.

**Corrección existente (sin commit, `NOVEX_BACKEND_m1`).**
- `analyze`: `requireOperableSituation`; si el caso está `CLOSED` → **409** `{ code: 'SITUATION_CLOSED' }`. Estado comprobado después del alcance (no revela si está cerrado a quien no puede leerlo). Todo antes de `orchestrator.execute`: no toma el reclamo ni llama a Gemini.
- `POST /situations/:id/recommendations`: `requireOperableSituation`, antes de validar `assignedUserId`.

**Política provisional «P1».** Con `requireOperableSituation`, el **ANALISTA solo puede analizar o crear recomendaciones en los casos que él reportó** (`ownsSituation`), y el COORDINADOR solo en los de su coordinación responsable. La matriz esperada está en `test/security/m1-situation-writes-scope.spec.ts` (`ANALYZE_EXPECTED`, ~L195-213 del worktree) [V]. **La alternativa a P1 no está documentada en el repo** [H]. **M1 no debe integrarse sin decisión de producto.**

**Archivos (worktree, sin commit):** `src/ai-orchestration/ai-orchestration.controller.ts`, `src/situation-recommendations/situation-recommendations.controller.ts`, `test/security/m1-situation-writes-scope.spec.ts` (711 líneas, autocontenida: no depende de A1 ni A2).

**Estado Git.** Rama local `security/fase0-m1` @ `5ffc65f`; **sin rama publicada ni PR**.

**Pruebas.** Según notas del 2026-11-05 pasaban [H]. **No reejecutadas el 2026-11-06.**

**Riesgos de integración.**
- Comparte con A1 solo `situation-recommendations.controller.ts`, en **clases distintas** (A1: `SituationRecommendationsController`; M1: `SituationRecommendationsBySituationController`). Una fusión simulada a tres bandas el 2026-11-06 no dio conflictos [V]; las notas del 2026-11-05 dicen que cada combinación compilaba y pasaba pruebas [H, no reejecutado].
- Cambio visible para usuarios: un ANALISTA que hoy analiza casos ajenos recibirá 403. No se verificó si el frontend oculta el botón según autoría [?] (ver NOVEX_FRONTEND → `docs/empalme/roles-y-navegacion.md`).

---

## 5. N1 — ANALISTA se concede la resolución reasignando a `coord-general`

> Hallazgo **por revisión de código** en `5ffc65f`. **No confirmado con explotación.** La corrección es solo una propuesta.

**Problema [V por lectura].**
1. `PATCH /situations/:id` (no avance) autoriza con `assertCanUpdateSituation`: para un ANALISTA, `assertSituationInScope` solo exige `SITUATIONS_VIEW` y `ownsSituation` es cierto por autoría (operational-scope.service.ts L494-501, L392-402).
2. El bloqueo de reasignación de `coordinationId` solo aplica a actores acotados por coordinación (`situations.service.ts` L753-767). Un ANALISTA puede poner `coordinationId` = UUID de `coord-general`.
3. Después, `canAdvanceSituationToInProgress` y `canResolveSituation` para ANALISTA solo comprueban responsable == `coord-general` (L425-452, L328-358). Puede avanzar y resolver.

Resultado: el autor ANALISTA de un problema de otra coordinación lo soluciona él mismo, eludiendo «solo el responsable soluciona».

**Variante (misma raíz, observación adicional) [V por lectura].** Cuando el PATCH lleva `status: IN_PROGRESS` desde OPEN, solo se evalúa `assertCanAdvanceSituationToInProgress` y no `assertCanUpdateSituation` (`situations.service.ts` L711-723); el resto de campos del mismo cuerpo (título, descripción, fecha, `coordinationId`) se aplica igual. Un ANALISTA **no autor** de un caso de `coord-general` podría así editarlo o reasignarlo. Tampoco confirmado.

**Archivos implicados:** `src/situations/situations.service.ts` (`update`), `src/auth/services/operational-scope.service.ts`.

**Corrección propuesta (no implementada).** Alternativas a decidir:
- Prohibir la reasignación de `coordinationId` por PATCH a todos los roles (si producto lo acepta), o restringirla y **prohibir explícitamente** que el resultado convierta al propio actor en quien resuelve (destino `coord-general` para ANALISTA).
- En la rama de avance, aplicar también `assertCanUpdateSituation` a cualquier campo distinto de `status`, o rechazar un PATCH que combine avance con otros cambios.
- Registrar la reasignación en timeline/auditoría si se mantiene.
- Pruebas: matriz por rol que cubra reasignar + avanzar + resolver en secuencia.

**Decisión pendiente:** ¿quién puede cambiar la coordinación responsable de un caso, y en qué estados?

---

## 6. N2 — PATCH puede igualar responsable y afectada en un INTER

> Hallazgo **por revisión de código**. **No confirmado con explotación.** Propuesta, no corrección.

**Problema [V por lectura].** En el alta INTER se exige responsable ≠ afectada (`situations.service.ts` L323-327). En el PATCH, al reasignar `coordinationId` solo se sincroniza la afectada si el caso es INTERNAL (L760-766); en INTER no se vuelve a comprobar que la nueva responsable sea distinta de la afectada.

**Impacto [I].** Un INTER inconsistente (la coordinación «espera algo de sí misma»), que afecta a los agregados de dependencias entrantes e integridad de las cartas (`src/operational-overview/`) y a quién puede resolverlo: el COORDINADOR de la afectada pasaría a ser también el responsable.

**Corrección propuesta.** En `update`, si `reportKind === INTER_COORDINATION` y `dto.coordinationId === situation.affectedCoordinationId` → 400 con el mismo mensaje del alta. Prueba unitaria junto a las de `situations.service.spec.ts`. Conviene resolverlo junto con N1 (mismo bloque).

---

## 6.1 Observaciones O1–O4 (Fase 2B)

> Todas son **revisión estática** de `5ffc65f`. Ninguna se ha reproducido con pruebas. Detalle de reglas en [funcional-y-roles.md](funcional-y-roles.md).

| Id | Comportamiento implementado [V por lectura] | Comportamiento esperado [I] | Evidencia |
|---|---|---|---|
| **O1** | En un `PATCH` que pasa de OPEN a IN_PROGRESS solo se evalúa `assertCanAdvanceSituationToInProgress`; `assertCanUpdateSituation` no se llama, pero el resto del cuerpo (título, descripción, `coordinationId`…) se aplica igual | El avance no debería servir de vía para editar otros campos sin el permiso de edición | `src/situations/situations.service.ts` ~L711-723 y el bloque de campos a continuación |
| **O2** | Un `PATCH` sin `status` sobre un caso CLOSED sigue editando título, descripción, fecha y coordinación; solo se bloquean los cambios de `status` | Un caso cerrado debería quedar congelado (pendiente de decisión) | Mismo método `update`, comprobación `situation.status === CLOSED && dto.status !== undefined` |
| **O3** | La longitud mínima del título se valida antes de recortar espacios, así que puede guardarse un título vacío; `description` no tiene longitud máxima en el DTO del `PATCH` | Validar después del recorte; fijar un máximo | `UpdateSituationDto` en `src/situations/dto/situation.dto.ts` L181-190 (`@MinLength(1)` sin `@Transform` de recorte; `description` sin `@MaxLength`); el recorte ocurre después, en `situations.service.ts` L775-779 |
| **O4** | La pista `canUpdate` del detalle no aplica el alcance de coordinación; un COORDINADOR autor de un INTER de otra área ve `canUpdate: true` y su `PATCH` recibe 404 | La pista debería coincidir con la autorización real | `canUpdateSituation` (`src/auth/services/operational-scope.service.ts` L404-412) solo exige permiso y `ownsSituation`, sin `assertSituationInScope`. Se usa como pista en `situations.service.ts` L1364 |

## 6.2 Privacidad: datos enviados a Gemini y `prompt_snapshot`

**Lo que está verificado (lectura de código en `5ffc65f`):**

- El contexto del análisis incluye el **nombre completo y el correo** del autor, más los nombres de los usuarios de la línea de tiempo, de quienes subieron evidencias y de los asignados en recomendaciones (`src/ai-prompt-engine/builders/situation-context.builder.ts` L69-73, L128, L146, L163).
- El contexto se serializa entero en el cuerpo del prompt (`src/ai-prompt-engine/builders/prompt.builder.ts` L41).
- El prompt se guarda completo en `situation_analysis_sessions.prompt_snapshot` (`src/ai-analysis-sessions/ai-analysis-sessions.service.ts` L40).
- Ese prompt se devuelve en `GET /situations/:id/analysis/history/:version` (L131) a quien tenga `AI_VIEW_REPORTS` y alcance de lectura.

**Lo que falta comprobar:**

- Que en producción se hayan ejecutado análisis, y por tanto existan filas con datos personales. Requiere una consulta de solo lectura autorizada.
- Las condiciones de tratamiento y retención de datos del proveedor del modelo.
- Si algún cliente actual muestra o descarga `promptSnapshot`: el frontend de producción no tiene interfaz de IA montada (NOVEX_FRONTEND → `docs/empalme/contratos-api.md`).
- Qué política de minimización o seudonimización aplica la institución.

**Clasificación:** observación de privacidad por revisión estática. **No es una fuga demostrada.** Detalle del flujo en [EMPALME-NOVEX.md](EMPALME-NOVEX.md) (IA).

---

## 7. Worktrees: manejo seguro

- Los cinco directorios (`NOVEX_BACKEND`, `_a1`, `_int`, `_sec`, `_m1`) comparten el mismo `.git` (el de `NOVEX_BACKEND`) [V].
- En `_a1`, `_int`, `_sec` y `_m1`, `node_modules` es una **junction de Windows** que apunta a `NOVEX_BACKEND\node_modules` [V: `Get-Item … LinkType=Junction`, 2026-11-06].
- **Nunca** borrar un worktree con su junction dentro (Explorer, `rm -rf`, `Remove-Item -Recurse`, `git worktree remove --force`): puede vaciar el `node_modules` real. Primero quitar **solo el enlace** (`rmdir <worktree>\node_modules`, sin `/s`), revisar `git status` y **contar con autorización**.
- `_sec` y `_m1` contienen trabajo **sin commit** (A2 y M1). Cualquier `checkout`, `reset`, `clean`, `stash` o eliminación ahí lo pierde. Antes de tocarlos, hacer una copia o un commit en una rama local, con autorización.
- El `main` local (`49a6483`) está 32 commits por detrás: no crear ramas desde él; partir de `origin/integracion/cartas-circo` o `origin/main` [V según README del empalme].
- El worktree principal tiene un cambio sin commit en `src/database/seeds/seed-operaciones.ts` con datos personales: no copiarlo a ramas de seguridad.

## 8. Orden de integración recomendado (propuesta, no autorizado)

1. **A1 → `main`.** Ya está en `origin/integracion/cartas-circo`. Reejecutar `test/security/` y la suite unitaria en `NOVEX_BACKEND_int`, y abrir PR integración → `main` con autorización. El push a `main` despliega solo.
2. **A2.** Rama nueva desde `origin/integracion/cartas-circo`; traer solo los archivos de A2 (excluir los de A1, ya presentes e idénticos). Reejecutar pruebas (y la `.pg.spec` si hay base local desechable). PR a integración.
3. **N1 + N2.** Decidir la regla de reasignación; implementar con pruebas en la misma rama o en una propia. Tocan `situations.service.ts`, igual que A2 (bloques distintos: `list` frente a `update`) [I: sin conflicto esperado, no simulado].
4. **M1**, solo tras la decisión P1. Rama desde integración; reejecutar la fusión con A1.
5. Integración → `main` → despliegue, con smoke de login, listado, detalle y análisis por rol.

## 8.1 Contrato propuesto: traslado administrativo de la coordinación responsable

> **Implementado y endurecido en la Fase 01B.1** (base `9bcd89d`; cierre Codex hasta `2bdf12f`). Contrato vigente en [seguridad-y-permisos.md](seguridad-y-permisos.md) §«Anulación, traslado y auditoría». Diferencias con esta propuesta: `expectedCurrentCoordinationId` es opcional; un caso `IN_PROGRESS` **reabre a `OPEN`** y retira la asignación (conservada en historial, `a718cd7`); la auditoría ya es transaccional para acciones críticas incluido el escalamiento (`2f38cdb`). El texto siguiente se conserva como diseño original.

**Endpoint.** `POST /api/v1/situations/:id/coordination-transfer`

```json
{ "toCoordinationId": "<uuid>", "reason": "texto 10..1000", "expectedCurrentCoordinationId": "<uuid>" }
```

**Autorización.**
- Permiso nuevo `SITUATIONS_TRANSFER`, asignado **solo a ADMIN** por migración (no por seed).
- ADMIN no tiene `SITUATIONS_UPDATE`: el traslado no le concede editar, avanzar ni resolver.

**Reglas.**
- Estado `OPEN` o `IN_PROGRESS`. Un caso `CLOSED` → 409 `SITUATION_CLOSED`.
- Destino activo en el catálogo y distinto del actual → 400.
- INTERNAL: la afectada se traslada con la responsable.
- INTER: el destino no puede ser la afectada → 400 (invariante N2).
- `expectedCurrentCoordinationId` distinto del vigente → 409 `COORDINATION_CHANGED` (control optimista: el ADMIN decidió sobre un estado viejo).
- Si el caso está `IN_PROGRESS`, `assignedUserId` vuelve a `null` y el estado a `OPEN`: la persona asignada pertenecía al área anterior. **Decisión de producto pendiente**, junto con qué pasa con su `due_at` (propuesta: no se reescribe).

**Ejecución y trazabilidad.**
- Una transacción con `pessimistic_write` sobre la fila, igual que el PATCH y la resolución.
- Evento de línea de tiempo `COORDINATION_TRANSFERRED` (nuevo valor de enum, por migración) con origen, destino y motivo.
- Auditoría `SITUATION_COORDINATION_TRANSFERRED` con origen, destino, motivo y estado previo, escrita **en la misma transacción** (adelanta AU-01 para esta acción).

**Pruebas mínimas.**
- Matriz por rol: solo ADMIN → 201; el resto → 403.
- Rechazos: CLOSED, destino igual, destino = afectada en INTER, destino inactivo, carrera con resolución en PostgreSQL.
- Los indicadores de la carta de origen y de destino cambian tras el traslado.

**Interfaz.** Acción en `/admin` o en el detalle para ADMIN, con motivo obligatorio. Se diseña en la fase de frontend.

## 9. Otros controles y riesgos residuales

| Control | Implementación [V] | Riesgo residual |
|---|---|---|
| Helmet | `helmet()` con `contentSecurityPolicy: false` y `crossOriginEmbedderPolicy: false`; `x-powered-by` desactivado ([main.ts](../../src/main.ts) L55-63) | Sin CSP en la API (aceptable para JSON) |
| Rate limit | `ThrottlerModule` global 600/60 s; auth 15/60 s; Gemini 10/60 s ([throttle.constants.ts](../../src/configuration/throttle.constants.ts)); `trust proxy 1` | Almacenamiento en memoria por instancia: con N instancias el límite real se multiplica [I]. El barrido lleva `@SkipThrottle` (protegido por OIDC) |
| CORS | `resolveCorsOrigins` exige `CORS_ORIGINS` en producción y valida orígenes ([cors.config.ts](../../src/configuration/cors.config.ts)); `credentials: true` | `cloudbuild.backend.yaml` L13 incluye `localhost:5173` y `127.0.0.1:5173` en producción. El workflow de Actions solo comprueba que el valor del servicio incluya `https://novex-frontend-` (`deploy-backend.yml` L233-235) [V]; el valor real no se consultó [?] |
| Validación | `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted`, `transform` (main.ts L99-106) | — |
| Auditoría | `AuditLogService.record` ([audit-log.service.ts](../../src/audit/audit-log.service.ts) L27-48) | **Traga los errores** (log y `null`): una acción puede ocurrir sin registro. `audit_logs` no tiene trigger de inmutabilidad ni `REVOKE` en su migración `1786800000000-CreateAuditLogs` [V] |
| Health | `/health/ready` sin autenticación ([probe-health.ts](../../src/health/probe-health.ts) L85-95) | Si el arranque falla, expone `failure.code` y `failure.message` (hasta 500 caracteres) del error de bootstrap |
| Login por correo | 403 salvo `ENABLE_EMAIL_LOGIN=true`; el deploy fuerza `false` | Si se activa por error, cualquiera con el correo de un usuario ACTIVE obtiene sesión |
| JWT | HS256 [I], 1 h, sin refresh ni revocación; autorización releída en cada petición | El frontend guarda el token en `localStorage` (NOVEX_FRONTEND `src/modules/auth/utils/accessTokenStorage.ts`) [V]: un XSS en la SPA permite robar sesiones de hasta 1 h. El token incluye email y permisos (no cifrado) |
| Permisos inline | `users`, `roles`, `permissions` usan comprobaciones en línea | Un controlador nuevo sin `PermissionsGuard` queda solo con autenticación |
| Código legado | Controladores `intelligence`, `operational-events`, `operational-areas`, `recommended-actions` sin montar | Sin `PermissionsGuard` ni alcance: no volver a registrarlos sin revisarlos |
| Infraestructura GCP | `docs/SECURITY.md`: SA por defecto de Compute, clave JSON en CI, SQL con IP pública [H] | No revisado en esta fase; ver [despliegue-y-operacion.md](despliegue-y-operacion.md) |

## Límites de verificación

- A1/A2/M1: diffs leídos el 2026-11-06 (`git show ce8c5ad`, `git -C <worktree> diff`). **Ninguna prueba se reejecutó**; los resultados de pruebas citados son [H].
- N1, N2 y la variante del avance: lectura de código en `5ffc65f`, **sin prueba ni explotación**.
- La identidad byte a byte de la copia de A1 en `_sec` (comparación con `git show ce8c5ad:<ruta>`) y las junctions de `node_modules` (`Get-Item`) se verificaron el 2026-11-06 durante la auditoría y la Fase 2A [V]. No se repitieron en la Fase 2C.
- O1–O4 y la observación de privacidad de §6.2 son revisión estática; no se ejecutaron pruebas.
- No se consultó producción: ni variables de Cloud Run, ni `role_permissions`, ni migraciones aplicadas.
- La alternativa a P1 para M1 no existe en el repositorio.

## Documentos relacionados

- [README.md](README.md): estado, ramas, worktrees y pendientes.
- [seguridad-y-permisos.md](seguridad-y-permisos.md): guards, RBAC y matriz de autorización.
- [funcional-y-roles.md](funcional-y-roles.md): ciclo y resolución (contexto de N1/N2).
- [EMPALME-NOVEX.md](EMPALME-NOVEX.md) (IA): qué reemplaza un análisis (contexto de M1).
- `NOVEX_BACKEND/CLAUDE.md` §«Validación segura»: cómo ejecutar `test/security/` (`npm run test:security`).
- [despliegue-y-operacion.md](despliegue-y-operacion.md), [arquitectura.md](arquitectura.md).
- [CLAUDE.md](../../CLAUDE.md).
- Frontend: NOVEX_FRONTEND → `docs/empalme/roles-y-navegacion.md`.
