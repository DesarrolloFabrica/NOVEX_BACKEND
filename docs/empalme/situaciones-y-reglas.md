# Situaciones y reglas de negocio

> **Propósito:** describir con exhaustividad el comportamiento **implementado** del dominio de situaciones (tipos, alta, edición, estados, severidad, resolución, afectaciones, SLA, barrido, escalamiento, idempotencia, integridad y vidas), enlazando cada regla con su implementación y sus pruebas. Cuando el comportamiento implementado parece defectuoso se dice explícitamente, separado del comportamiento esperado.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_BACKEND `5ffc65f` (producción = origin/main)
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

Rutas con prefijo `/api/v1`. La matriz de permisos por rol (quién tiene `SITUATIONS_CREATE`, `SITUATIONS_UPDATE`, `SITUATIONS_CLOSE` y demás) está en [autenticacion-y-permisos.md](autenticacion-y-permisos.md) y aquí solo se cita. Las tablas, los triggers y las migraciones están en [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md).

**Abreviaturas de archivos** (todas las rutas son relativas al repo):

| Alias | Archivo |
|---|---|
| `SVC` | [src/situations/situations.service.ts](../../src/situations/situations.service.ts) |
| `SCOPE` | [src/auth/services/operational-scope.service.ts](../../src/auth/services/operational-scope.service.ts) |
| `DTO` | [src/situations/dto/situation.dto.ts](../../src/situations/dto/situation.dto.ts) |
| `CONS` | [src/situations/situation-consequences.service.ts](../../src/situations/situation-consequences.service.ts) |
| `SLA` | [src/situations/situation-sla.policy.ts](../../src/situations/situation-sla.policy.ts) |
| `SWEEP` | [src/situations/sweep/situation-sweep.service.ts](../../src/situations/sweep/situation-sweep.service.ts) |
| `ESC` | [src/situations/severity-escalation/](../../src/situations/severity-escalation/) |
| `ORCH` | [src/ai-orchestration/ai-orchestrator.service.ts](../../src/ai-orchestration/ai-orchestrator.service.ts) |
| `INTEG` | [src/operational-overview/domain/coordination-integrity.ts](../../src/operational-overview/domain/coordination-integrity.ts) |
| `LIFE` | [src/operational-overview/domain/coordination-life-points.ts](../../src/operational-overview/domain/coordination-life-points.ts) |

**Abreviaturas de pruebas:** `report-kind.spec` = [situations.report-kind.spec.ts](../../src/situations/situations.report-kind.spec.ts) · `resolution.spec` = [situations.resolution.spec.ts](../../src/situations/situations.resolution.spec.ts) · `service.spec` = [situations.service.spec.ts](../../src/situations/situations.service.spec.ts) · `legacy.spec` = [situations.legacy-contract.spec.ts](../../src/situations/situations.legacy-contract.spec.ts) · `vivo.pg.spec` = [internal-vivo.pg.spec.ts](../../src/situations/internal-vivo.pg.spec.ts) (PostgreSQL real) · `cons.spec` = [situation-consequences.service.spec.ts](../../src/situations/situation-consequences.service.spec.ts) · `scope-res.spec` = [operational-scope.resolution.spec.ts](../../src/auth/services/operational-scope.resolution.spec.ts) · `scope-cons.spec` = [operational-scope.consequences.spec.ts](../../src/auth/services/operational-scope.consequences.spec.ts) · `scope-own.spec` = [operational-scope.own-reports.spec.ts](../../src/auth/services/operational-scope.own-reports.spec.ts) · `dto.spec` = [situation.dto.spec.ts](../../src/situations/dto/situation.dto.spec.ts) · `http.e2e` = [phase2-http.e2e-spec.ts](../../test/phase2-http.e2e-spec.ts) · `concurrency.e2e` = [phase21-concurrency.e2e-spec.ts](../../test/phase21-concurrency.e2e-spec.ts).

> **Ninguna prueba se ejecutó al redactar este documento.** «Prueba» significa que existe un caso que cubre la regla, no que pase hoy.

---

## 1. Modelo: tipos de registro y papeles de cada coordinación [V]

Enums en [situation.enums.ts](../../src/common/enums/situation.enums.ts):

| Enum | Valores |
|---|---|
| `SituationReportKind` | `INTERNAL`, `INTER_COORDINATION` |
| `SituationStatus` | `OPEN`, `IN_PROGRESS`, `RESOLVED` (legado), `CLOSED` |
| `SituationSeverity` | `LOW` < `MEDIUM` < `HIGH` < `CRITICAL` (orden en `SITUATION_SEVERITY_ORDER`) |
| `SituationSeverityChangeSource` | `REPORTED`, `AUTO_TIME` (no existe `MANUAL`) |

| Concepto | Columna / campo | Significado |
|---|---|---|
| **Responsable** | `coordination_id` / `coordinationId` | Coordinación que **atiende y resuelve**. Es la que manda en el avance, la resolución y las afectaciones del coordinador |
| **Afectada** | `affected_coordination_id` / `affectedCoordinationId` | Coordinación que **sufre el impacto**. En INTERNAL coincide con la responsable. En INTER es otra. Concede **lectura** al coordinador de la afectada, no operación |
| **Relacionadas** | `situation_related_coordinations` | Coordinaciones que el usuario declara relacionadas. No conceden permisos (`scope-res.spec`: «coordinar un área RELACIONADA o AFECTADA no concede resolver») |
| **Autor** | `created_by_user_id` | Quien reportó. Concede lectura del caso propio y, para el ANALISTA, edición y afectaciones |
| **Asignado** | `assigned_user_id` | Se fija con el actor al pasar a `IN_PROGRESS` (SVC:1100-1114). La resolución no lo cambia |

- **INTERNAL:** el problema ocurre en la coordinación responsable (la «carta»). Exige categoría y admite afectaciones.
- **INTER_COORDINATION:** la coordinación afectada espera una entrega de otra, la responsable. Un solo caso con un solo cierre. No lleva categoría ni afectaciones; exige `affectedProcess` y `pendingDelivery`.
- Las filas históricas sin `report_kind` se presentan como `INTERNAL` (SVC:1301). La migración 1787400000000 rellenó `INTERNAL` y `affected = responsable`.

## 2. Alta de una situación

**Endpoint único:** `POST /situations/register-with-analysis` ([ai-orchestration.controller.ts:34-69](../../src/ai-orchestration/ai-orchestration.controller.ts)). Permiso: `SITUATIONS_CREATE` (solo ese) y throttle Gemini de 10/60 s. Cabecera opcional `Idempotency-Key` (UUID v4; ver §12). El controlador delega en `AIOrchestrator.registerAndExecute` → `SituationsService.create` (SVC:160-177), que despacha según `reportKind`:

| `reportKind` | Camino |
|---|---|
| `INTER_COORDINATION` | `createInterCoordination` (SVC:304-369) |
| `INTERNAL` | `createInternal` (SVC:250-298) |
| ausente | `createLegacyContract` (SVC:201-241): contrato anterior, ver §15 |

El alta **no** llama a Gemini: responde `{ situation, analysis: null, replayed: false }` (ORCH:108-178, 240-248). El análisis se pide aparte; ver [inteligencia-artificial.md](inteligencia-artificial.md).

### 2.1 DTO de alta (`CreateSituationDto`, DTO:63-162) [V]

| Campo | Validación DTO | INTERNAL | INTER |
|---|---|---|---|
| `title` | string 1..200 (antes de recortar) | obligatorio | obligatorio |
| `description` | string 1..4000 | obligatorio | obligatorio |
| `reportKind` | enum opcional | `INTERNAL` | `INTER_COORDINATION` |
| `coordinationId` | UUID; se valida si hay `reportKind` o si viene el campo | obligatorio (responsable) | obligatorio (responsable) |
| `affectedCoordinationId` | UUID obligatorio solo en INTER | opcional; si viene debe ser igual a la responsable | obligatorio y distinto de la responsable |
| `categoryId` | UUID obligatorio salvo en INTER | obligatorio, seleccionable | debe omitirse; si viene se ignora (`category: null`, SVC:362) [V]. Ver nota R2.9 |
| `severity` | enum obligatorio | severidad **reportada** | severidad reportada |
| `occurredAt` | ISO date obligatorio | no futura (fin del día local) | igual |
| `affectedProcess` | string 1..2000 obligatorio en INTER | se ignora (`null`) | obligatorio, no vacío tras recortar |
| `pendingDelivery` | string 1..2000 obligatorio en INTER | se ignora (`null`) | obligatorio, no vacío tras recortar |
| `relatedCoordinationIds` | array ≤ 64 de UUID v4 | opcional | opcional |
| `initialConsequence` | `{ description: 1..2000 recortado }` | opcional | prohibido (400) |

### 2.2 Reglas de alta

| # | Regla | Implementación | Pruebas | Notas |
|---|---|---|---|---|
| R2.1 | Sin `reportKind` solo se acepta la forma del contrato anterior; si no, 400 `Indique el tipo de registro (reportKind).` | SVC:173-176, 206-215 | `legacy.spec`, `report-kind.spec` («sin reportKind no hay alta») | §15 |
| R2.2 | INTERNAL exige categoría | SVC:255-259 | `report-kind.spec` | |
| R2.3 | INTERNAL exige `coordinationId` para **todos** los roles. Un COORDINADOR solo registra INTERNAL en **su** coordinación (403). Un COORDINADOR sin coordinación asignada tampoco puede | SCOPE:210-233 | `scope-cons.spec` (`resolveInternalCreateCoordinationId`), `report-kind.spec`, `http.e2e` («un COORDINADOR no registra un INTERNAL en un área ajena») | El ANALISTA registra INTERNAL en cualquier coordinación |
| R2.4 | INTERNAL: si se envía `affectedCoordinationId`, debe coincidir con la responsable (400). Si no se envía, se iguala a la responsable | SVC:267-274, 290 | — (sin caso específico localizado) | |
| R2.5 | Categoría: debe existir (404) y tener `is_selectable = true` (400). Las categorías legacy siguen legibles en casos antiguos | SVC:1206-1221 | `report-kind.spec` («rechaza una categoría legacy en el alta») | |
| R2.6 | INTER: prohibida `initialConsequence` (400). Exige responsable y afectada, responsable ≠ afectada (400), y `affectedProcess` y `pendingDelivery` no vacíos tras recortar (400) | SVC:309-341 | `report-kind.spec` (responsable = afectada, sin proceso, afectación inicial) | Esta igualdad **solo se valida en el alta**: no hay CHECK en la base ni validación en el PATCH (N2, §4) |
| R2.7 | INTER: cualquier rol con `SITUATIONS_CREATE` elige la responsable, incluida una ajena. La selección no se sustituye | SCOPE:180-197; SVC:344 | `scope-res.spec` («crear…»), `scope.service.spec` («permite registrar situaciones en otra coordinación») | Un COORDINADOR de A puede reportar a B como responsable |
| R2.8 | Coordinaciones (responsable, afectada y relacionadas) deben existir **y estar activas** (404) | SVC:1191-1199, 1237-1247 | `http.e2e` («rechaza una coordinación inexistente») | |
| R2.9 | Relacionadas: se deduplican, se recortan, se excluye la responsable y se conserva el orden (`displayOrder`) | SVC:1223-1251 | `service.spec` («persiste relacionadas válidas y excluye la coordinación origen») | En INTER el DTO no exige omitir `categoryId`, y el servicio lo descarta en silencio [V] |
| R2.10 | `occurredAt` válido y no posterior al **fin del día actual en la zona horaria del servidor** | SVC:403-411; [occurred-at.validation.ts](../../src/situations/occurred-at.validation.ts) | [occurred-at.validation.spec.ts](../../src/situations/occurred-at.validation.spec.ts) | El spec simula Colombia (UTC-5). En Cloud Run la zona del proceso es probablemente UTC [I], así que el límite real es 23:59:59 UTC |
| R2.11 | Alta **transaccional**: situación + `SITUATION_CREATED` (subscriber) + fila `REPORTED` del historial + afectación inicial con `CONSEQUENCE_ADDED`. Si algo falla, rollback completo. La auditoría (`SITUATION_CREATED` y, si aplica, `SITUATION_CONSEQUENCE_ADDED` con `initial: true`) se registra **después** del commit | SVC:390-550 | `report-kind.spec` («ATOMICIDAD…»), `vivo.pg.spec` («alta: mismo instante…», «ATOMICIDAD…») | |
| R2.12 | Un solo instante: `created_at`, `due_at = created_at + ventana(reported)` y `effective_at` de REPORTED comparten el mismo `new Date()` | SVC:413, 447-448, 470 | `report-kind.spec` («nace con reported = efectiva…»), `vivo.pg.spec` | |
| R2.13 | Estado inicial `OPEN`. `severity = reported_severity = dto.severity`. `severity_escalation_policy_code = ACTIVE_…` (hoy `NULL`). `sla_policy_code = 'severity-v1'` | SVC:432-450 | `report-kind.spec` | |
| R2.14 | La afectación inicial toma `occurredAt` del problema (no tiene fecha propia) | SVC:477-488; DTO:41-47 | `report-kind.spec` («con afectación inicial…»), `dto.spec` («no acepta fecha propia») | |

**Observación O3** [V por lectura, sin prueba]: `@MinLength(1)` se aplica **antes** de recortar en `title` y `description` (DTO:64-72, 181-190). Un título compuesto solo de espacios pasa la validación y se guarda vacío (`.trim()`, SVC:420, 776). Además, `description` del PATCH no tiene `@MaxLength` (la del alta sí, 4000).

## 3. Lectura (resumen)

El alcance por rol se detalla en [autenticacion-y-permisos.md](autenticacion-y-permisos.md). Lo específico del dominio [V]:

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R3.1 | Detalle legible si: es un reporte propio, **o** el actor es COORDINADOR de la **afectada**, **o** pasa el alcance de coordinación (un COORDINADOR solo ve su responsable; los demás roles con `SITUATIONS_VIEW`, todo) | SCOPE:126-155 | `scope-own.spec`, `http.e2e` (««mis reportes» y lectura de lo propio») · la rama de la afectada no tiene caso específico localizado [?] |
| R3.2 | El listado con `coordinationId` incluye responsable **o** afectada (`OR`, sin duplicar) | [situations.repository.ts:113-123](../../src/situations/repositories/situations.repository.ts) | — |
| R3.3 | `mine=true` lista los casos creados por `actor.sub` en cualquier coordinación. Un COORDINADOR que pide otra coordinación recibe solo sus reportes en ella, con `scope: 'own-only'` | SVC:594-647 | `http.e2e` («lista parcial…») |
| R3.4 | El detalle añade `severityHistory`, `consequences` (con `severityAtOccurrence` derivada) y `consequenceCount` | SVC:672-694; [situation-detail.mappers.ts](../../src/situations/situation-detail.mappers.ts) | `vivo.pg.spec` |

Un COORDINADOR **sin** coordinación asignada recibe el listado completo (A2, sin corregir en producción): ver [seguridad-y-correcciones.md](seguridad-y-correcciones.md).

## 4. Actualización (`PATCH /situations/:id`)

Permiso: `SITUATIONS_UPDATE` ([situations.controller.ts:57-65](../../src/situations/situations.controller.ts)). Servicio: `update` (SVC:696-872).

**Campos aceptados** (`UpdateSituationDto`, DTO:180-219): `title` (1..200), `description` (≥ 1, sin máximo), `coordinationId` (UUID), `status`, `statusComment` (1..4000), `evidenceIds` (UUID v4; solo se copian al metadata del timeline y no se validan), `occurredAt`.
**Campos inmutables o rechazados:** `categoryId`, `severity`, `reportKind`, `affectedCoordinationId`, `affectedProcess`, `pendingDelivery` y cualquier otro no declarado devuelven 400 por `forbidNonWhitelisted` ([main.ts:99-106](../../src/main.ts)).

| # | Regla | Implementación | Pruebas | Notas |
|---|---|---|---|---|
| R4.1 | Si la petición avanza `OPEN → IN_PROGRESS`, se autoriza **solo** con `assertCanAdvanceSituationToInProgress` (§6). En cualquier otro caso, con `assertCanUpdateSituation` (permiso + alcance de coordinación + `ownsSituation` = autor o COORDINADOR de la responsable) | SVC:711-723; SCOPE:392-412, 494-501 | `service.spec` («rechaza OPEN → IN_PROGRESS si assertCanAdvance lo deniega»), `scope.service.spec` («permite al analista actualizar solo las situaciones que registró», «impide al director…») | Ver O1 |
| R4.2 | `status: CLOSED` → 403: el cierre solo va por `POST /resolution` | SVC:738-742 | `service.spec` («el PATCH genérico NO puede cerrar…», «…aportando un motivo»), `http.e2e` («el PATCH genérico no permite cerrar…») | |
| R4.3 | Situación `CLOSED` con `status` en el cuerpo → 400 | SVC:744-751 | `service.spec` («bloquea cambios cuando la situación está CLOSED») | Ver O2 |
| R4.4 | `coordinationId`: un actor acotado por coordinación (COORDINADOR) → 403. Para el resto, la coordinación debe existir y estar activa. En INTERNAL se reasigna **también** la afectada | SVC:753-769 | `service.spec` («reasignar la coordinación de un INTERNAL reasigna también la afectada») | **N1** y **N2**, abajo |
| R4.5 | `occurredAt`: válida y no futura (misma regla que R2.10) | SVC:781-792 | — | No se comprueba contra las afectaciones ya registradas [V] |
| R4.6 | Transición de estado: solo el siguiente estado del ciclo (§5). Si no, 400 | SVC:799-808, 1069-1078 | `service.spec` («rechaza saltos de estado y retrocesos») | |
| R4.7 | `statusComment` sin cambio de estado sobrescribe `last_status_comment` | SVC:809-811 | — | |
| R4.8 | Auditoría: `SITUATION_STATUS_CHANGED` si hubo transición y `SITUATION_UPDATED` con `changedFields` si hubo campos (también en un PATCH mixto). Timeline: `STATUS_CHANGED` (SVC) y `UPDATED` (subscriber) | SVC:815-869; [situation-timeline.subscriber.ts](../../src/situation-timeline/subscribers/situation-timeline.subscriber.ts) | `service.spec` («PATCH MIXTO…»), [audit-trail.spec.ts](../../test/audit/audit-trail.spec.ts) | |

**Hallazgos conocidos (no corregidos; verificados por lectura, sin prueba de explotación).** Detalle y propuesta en [seguridad-y-correcciones.md](seguridad-y-correcciones.md):

- **N1:** el bloqueo de R4.4 solo aplica a actores acotados por coordinación (SVC:754). Un **ANALISTA autor** pasa `assertCanUpdateSituation` por autoría y puede cambiar `coordinationId` a `coord-general`. Después `canAdvance…` y `canResolve…` le autorizan, porque solo exigen que la responsable sea General (SCOPE:342-347, 436-441). Así elude la regla «resuelve solo el responsable».
- **N2:** en INTER, el PATCH reasigna la responsable sin comprobar que siga siendo distinta de la afectada (SVC:760-768 solo iguala la afectada en INTERNAL). No hay CHECK en la base. El código de vidas ya contempla esa fila (LIFE:47-58) y la integridad la cuenta en `incomingCriticalCount` (§13).

**Observaciones adicionales** (verificadas por lectura, sin prueba de explotación ni caso de test; **no** figuran en la auditoría previa):

- **O1:** cuando el PATCH avanza `OPEN → IN_PROGRESS`, `assertCanUpdateSituation` **no** se evalúa (SVC:715-723), pero el resto del cuerpo sí se aplica (título, descripción, `occurredAt` y `coordinationId` para actores no acotados). Un ANALISTA que avanza un caso de General **que no reportó** puede, en la misma petición, editar sus campos o reasignarlo.
- **O2:** R4.3 solo bloquea `status`. Un PATCH sobre un caso `CLOSED` **sin** `status` sigue editando `title`, `description`, `occurredAt` y `coordinationId` si el actor pasa `assertCanUpdateSituation` (SVC:744-792). Lo esperado según el comentario de SVC:725-737, «el cierre congela», no se cumple para estos campos.
- **O4:** la pista `canUpdate` (SCOPE:404-412) no aplica el alcance de coordinación, mientras que `assertCanUpdateSituation` (SCOPE:494-501) sí. Un COORDINADOR autor de un INTER cuya responsable es otra recibe `canUpdate: true`, pero su PATCH responde 404.

## 5. Estados y transiciones [V]

Fuente: [situation-status.transitions.ts](../../src/situations/situation-status.transitions.ts).

```
OPEN ──PATCH (avance)──► IN_PROGRESS ──POST /resolution──► CLOSED
  └────────────────────── POST /resolution ───────────────────┘
RESOLVED (legado) ──POST /resolution──► CLOSED
```

| Desde | Mapa de transiciones | Vía real |
|---|---|---|
| `OPEN` | `IN_PROGRESS` | PATCH (R4.1). Además `POST /resolution` cierra directamente desde OPEN (R7.3) |
| `IN_PROGRESS` | `CLOSED` | Solo `POST /resolution`, porque el PATCH rechaza el destino `CLOSED` (R4.2) |
| `RESOLVED` | `CLOSED` | Solo `POST /resolution` (`RESOLVABLE_STATUSES`, SVC:81-85). Ninguna transición conduce ya a `RESOLVED`. Su etiqueta es «En atención» |
| `CLOSED` | — | Terminal. No hay reapertura (`REOPENED` existe en el enum del timeline sin uso [I]) |

- `requiresStatusComment(CLOSED)` sigue en el código (SVC:1080-1089), pero es inalcanzable por PATCH desde R4.2 [V].
- Estados **activos** según el contexto: integridad, vidas, afectaciones y escalamiento usan `OPEN`, `IN_PROGRESS`. SLA (avisos y vencimientos) y `isActiveSituationStatus` incluyen además `RESOLVED` (SWEEP:23-31; SLA:108-114).
- Pruebas: `service.spec` («avanza OPEN → IN_PROGRESS…», «rechaza saltos…», «una fila RESOLVED legada tampoco se cierra por el PATCH»), `resolution.spec` («un problema RESOLVED legado todavía puede cerrarse»).

## 6. Avance `OPEN → IN_PROGRESS`

| # | Regla | Implementación | Pruebas | Notas |
|---|---|---|---|---|
| R6.1 | Requiere `SITUATIONS_UPDATE` | SCOPE:430-432, 459 | `scope-res.spec` | |
| R6.2 | COORDINADOR: solo si `actor.coordinationId === situation.coordinationId` (responsable) | SCOPE:443-451 | `scope-res.spec` («COORDINADOR responsable conserva el avance») | Ser afectada, relacionada o autora no basta |
| R6.3 | ANALISTA: solo si la responsable es `coord-general` (UUID resuelto en `onModuleInit` y refrescado bajo demanda, SVC:122-139). La autoría no basta | SCOPE:436-441 | `scope-res.spec` («avanzar OPEN → IN_PROGRESS: ANALISTA solo si General es responsable») | N1 |
| R6.4 | ADMIN, DIRECTOR y otros roles: nunca | SCOPE:443-445 | `scope-res.spec` («ADMIN/DIRECTOR no avanzan…») | |
| R6.5 | Efecto: `assigned_user_id = actor`, `last_status_comment = statusComment` (o `null`), evento `STATUS_CHANGED` con «Responsable: <nombre>» y auditoría | SVC:1091-1114, 1128-1189 | `service.spec` («avanza OPEN → IN_PROGRESS y asigna responsable automático») | |
| R6.6 | Pista `canAdvanceToInProgress` = `status === OPEN` y la misma política | SVC:1357-1363 | — | |

## 7. Resolución y aprendizaje (`POST /situations/:id/resolution`)

Permiso: `SITUATIONS_CLOSE` ([situations.controller.ts:67-86](../../src/situations/situations.controller.ts)). Cuerpo: `{ learning }` (recortado, 1..4000; DTO:234-240). Servicio: `resolve` (SVC:903-1057).

| # | Regla | Implementación | Pruebas | Notas |
|---|---|---|---|---|
| R7.1 | Aprendizaje obligatorio: vacío o solo espacios → 400 (DTO y segunda barrera en el servicio). La base añade `CHECK (length(btrim(learning)) > 0)` | SVC:910-913; DTO:234-240; migración 1787200000000-AddSituationResolutions | `resolution.spec` («aprendizaje obligatorio»), `http.e2e` («rechaza un aprendizaje vacío») | |
| R7.2 | Quién resuelve: COORDINADOR **de la responsable**; ANALISTA solo si la responsable es `coord-general`. Ser autor, afectada o relacionada **no** concede. ADMIN y DIRECTOR nunca. Se evalúa contra la fila **bloqueada y persistida** | SCOPE:328-385; SVC:941-945 | `resolution.spec` («autorización aplicada en backend»), `scope-res.spec` («solucionar…»), `scope-own.spec` («leer mi reporte en otra área no me deja RESOLVERLO») | N1 |
| R7.3 | Estados resolubles: `OPEN`, `IN_PROGRESS`, `RESOLVED`. Si no → 409. Desde OPEN se cierra en una sola petición, **sin** simular «En atención» ni asignar usuario | SVC:81-85, 947-951 | `resolution.spec` («cierra… desde OPEN», «también resuelve desde IN_PROGRESS», «NO simula «En atención»…», «un problema ya CERRADO no admite nueva resolución») | |
| R7.4 | Concurrencia: `pessimistic_write` sobre la fila (sin relaciones eager) + PK `situation_resolutions(situation_id)`. Una violación de la PK se traduce a 409 | SVC:931-935, 987-1001 | `resolution.spec` («atomicidad y concurrencia»), `concurrency.e2e` (2 y 5 resoluciones simultáneas; «resolver NO devuelve 500 por las relaciones eager») | |
| R7.5 | Antes de cerrar se materializan los escalamientos pendientes con horizonte = instante de cierre (hoy es un no-op) | SVC:963-968 | `resolution.spec` («materializa los escalamientos pendientes ANTES de cerrar…») | |
| R7.6 | Efecto en una transacción: `status = CLOSED`, `closed_at = now`, `resolved_at` se conserva si existía, `last_status_comment = null`, fila en `situation_resolutions(learning, resolved_by_user_id)` y timeline `CLOSED` con `commentKind: 'learning'` (sin el texto) | SVC:970-1034 | `resolution.spec` («el aprendizaje NO se copia a lastStatusComment») | |
| R7.7 | Auditoría `SITUATION_RESOLVED` tras el commit, con `learningLength` y **sin** el texto | SVC:1040-1054 | `resolution.spec` («registra auditoría sin volcar el texto…») | |
| R7.8 | Respuesta: `resolution: { learning, resolvedByUserId, resolvedByUserName, resolvedAt, recordedAt }` o `null` (casos activos o cerrados antes de esta fase) | SVC:1266-1281 | `resolution.spec` («una situación cerrada SIN aprendizaje sigue siendo legible»), `http.e2e` | |
| R7.9 | Pista `canResolve` = estado resoluble y la misma política | SVC:1346-1352 | `resolution.spec` («canResolve en la respuesta»), `http.e2e` | |
| R7.10 | El tipo de registro no influye: un INTER se resuelve igual (por su responsable) | SVC:903-1057 (no lee `reportKind`) | `resolution.spec` («ANALISTA cierra INTER cuando General es responsable…») | |

Los aprendizajes se consumen en `GET /operational-kpis/learnings` y `/learnings/items` (`OperationalKpiLearningsController`) [V en rutas; lógica no revisada].

## 8. Afectaciones (`POST /situations/:id/consequences`)

Permiso: `SITUATIONS_UPDATE`. Cuerpo: `{ description (1..2000 recortado), occurredAt? }` (DTO:50-61). Servicio: `CONS:53-166`. **Solo se añaden**: no hay PATCH ni DELETE, y la base tiene un trigger que rechaza UPDATE.

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R8.1 | `occurredAt` por defecto = ahora. No puede ser futura (instante real, no fin del día) → 400 | CONS:64-74 | `cons.spec` («occurredAt futuro → 400») |
| R8.2 | Fila bloqueada `FOR UPDATE`. Se exige lectura (`assertSituationReadable`) antes que el resto | CONS:81-92 | `cons.spec` («bloquea la fila…»), `vivo.pg.spec` («CONCURRENCIA: afectación y cierre simultáneos…») |
| R8.3 | Solo INTERNAL (INTER → 400) | CONS:94-98 | `cons.spec` («INTER → 400»), `scope-cons.spec` |
| R8.4 | Solo `OPEN`/`IN_PROGRESS` (`CLOSED` o `RESOLVED` → 409) | CONS:99-103; SCOPE:31-34 | `cons.spec` («CLOSED → 409») |
| R8.5 | Quién: ANALISTA **autor**; COORDINADOR de la **responsable**; nadie más (403 con mensaje por rol) | SCOPE:249-308; CONS:105 | `cons.spec` («ANALISTA autor agrega», «COORDINADOR responsable agrega»), `scope-cons.spec` («el COORDINADOR autor de un caso de otra área no agrega») |
| R8.6 | No anterior a `situation.occurredAt` → 400 | CONS:107-111 | `cons.spec` |
| R8.7 | Escalamientos materializados antes de insertar; timeline `CONSEQUENCE_ADDED` (sin texto) en la transacción; auditoría `SITUATION_CONSEQUENCE_ADDED` después | CONS:114-163 | `cons.spec` |
| R8.8 | Append-only en la base (UPDATE rechazado por trigger); CHECK `length(btrim(description)) BETWEEN 1 AND 2000` | migración 1787900000000-AddSituationConsequences | `vivo.pg.spec` («APPEND-ONLY en la base…»), `cons.spec` («la API solo expone POST…») |
| R8.9 | `severityAtOccurrence` de cada afectación: severidad vigente en el historial en su `occurredAt` (derivada, no persistida) | [situation-detail.mappers.ts:40-57](../../src/situations/situation-detail.mappers.ts); [severity-history.ts:34](../../src/situations/severity-escalation/severity-history.ts) | [severity-escalation.spec.ts](../../src/situations/severity-escalation/severity-escalation.spec.ts) («severityAt…») |

## 9. Severidad: reportada, efectiva e historial

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R9.1 | `reported_severity`: la evaluación de quien reporta. **Inmutable** y única entrada del SLA | SVC:433; SLA:47-58 (comentario) | `report-kind.spec`, [situation-sla.policy.spec.ts](../../src/situations/situation-sla.policy.spec.ts) |
| R9.2 | `severity` (**efectiva**): caché del último nivel del historial. La leen listados, integridad, vidas y KPI | SVC:1319; [operational-overview.repository.ts:86-110](../../src/operational-overview/repositories/operational-overview.repository.ts) | `vivo.pg.spec` |
| R9.3 | Ningún flujo de usuario cambia la severidad: el PATCH no acepta `severity` | DTO:173-180 | `dto.spec` (`UpdateSituationDto`) |
| R9.4 | `situation_severity_changes`: append-only (trigger `novex_reject_append_only_update`). Una sola `REPORTED` por situación (índice único parcial). `AUTO_TIME` único por `(situation_id, policy_code, rule_key)`. CHECK de forma: REPORTED sin `previous`, policy ni rule; AUTO_TIME con todo y `new > previous` | migración 1787700000000-AddSituationSeverityHistory (líneas 50-121) | `vivo.pg.spec`, `severity-escalation.spec` («severityAt / invariantes del historial») |
| R9.5 | La fila REPORTED se inserta en la transacción del alta con `effective_at = created_at` y `actor = autor` | SVC:465-474 | `report-kind.spec` |

## 10. SLA (`severity-v1`)

| Severidad reportada | Plazo (`due_at − created_at`) | Ventana de aviso (`at_risk`) |
|---|---|---|
| CRITICAL | 24 h | últimas 6 h |
| HIGH | 72 h | últimas 24 h |
| MEDIUM | 7 días | últimas 48 h |
| LOW | 14 días | últimas 72 h |

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R10.1 | `due_at = created_at + ventana(reported_severity)`, calculado **una sola vez** en el alta. Nada lo reescribe (ni el barrido ni el escalamiento) | SLA:25-66; SVC:448 | `situation-sla.policy.spec.ts` («calcula dueAt…», «due_at − created_at es exactamente…»), `severity-escalation.spec` («…NO toca due_at») |
| R10.2 | `slaHealth`: `closed` si CLOSED; `overdue` si `now > due_at`; `at_risk` si `now >= due_at − aviso(reported)`; si no, `on_track`. Sin `due_at` → `on_track` | SLA:76-106; SVC:1329-1334 | `situation-sla.policy.spec.ts` («marca at_risk…», «la ventana de aviso sale de la severidad REPORTADA…») |
| R10.3 | `closedOnTime = closed_at <= due_at` (solo en CLOSED; `null` si falta algún dato) | SLA:116-124; SVC:1335-1338 | `situation-sla.policy.spec.ts` («detecta cierre a tiempo») |
| R10.4 | El SLA **no** decide la integridad: solo ordena | INTEG:3-10 (comentario) | — |

## 11. Barrido (avisos, vencimientos y escalamiento)

| Disparador | Detalle | Implementación |
|---|---|---|
| `@Cron(EVERY_30_MINUTES)` en proceso | Corre si `SITUATION_SWEEP_CRON_ENABLED` ≠ `false` (default `true`). Evita solaparse dentro de la misma instancia (`running`). Escala solo si `SEVERITY_ESCALATION_ENABLED=true` | [situation-sla.scheduler.ts:30-62](../../src/situations/situation-sla.scheduler.ts) |
| `POST /internal/jobs/situation-sweep` | `@Public` + `@SkipThrottle` + `SchedulerOidcGuard`: ID token de Google con `aud` exacto, `iss` de Google, `email_verified` y `email` igual a la cuenta configurada. Sin configuración → 403 a todo. Responde 200 `{acquired, breached, warned, escalated}` | [situation-sweep.controller.ts](../../src/situations/sweep/situation-sweep.controller.ts); [scheduler-oidc.guard.ts](../../src/situations/sweep/scheduler-oidc.guard.ts) |

Cloud Scheduler **no está configurado** ([RELEASE_CIRCO](../RELEASE_CIRCO.md) §8) [H]. Con `min-instances=0`, el `@Cron` no tiene ejecución garantizada [H/I].

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R11.1 | Cada página es una transacción que toma `pg_try_advisory_xact_lock(726100417)`. Si otra instancia lo tiene, se sale (`acquired: false` si aún no se procesó nada) | SWEEP:18, 131-172 | `vivo.pg.spec` («lock advisory…») |
| R11.2 | Fases en orden: vencimientos → avisos → (escalamiento). Páginas de 100, hasta 50 por fase (≤ 5000 filas) | SWEEP:101-150 | — |
| R11.3 | **Vencimiento:** estados `OPEN`/`IN_PROGRESS`/`RESOLVED` con `due_at < now` y `sla_breached_at IS NULL` → `sla_breached_at = due_at` (no `now`). `FOR UPDATE SKIP LOCKED` y timeline `SLA_BREACHED` | SWEEP:174-227 | `vivo.pg.spec` («…vencimiento condicional e idempotencia») |
| R11.4 | **Aviso:** sin vencer, `due_at >= now >= due_at − aviso(reported)` y sin aviso en las últimas 12 h → `last_sla_reminder_at = now` y timeline `SLA_WARNING` | SWEEP:21, 229-291 | `vivo.pg.spec` («aviso con la ventana de la severidad REPORTADA…») |
| R11.5 | Las escrituras SQL directas no tocan `updated_at` ni disparan el subscriber | SWEEP:81-82 (comentario) | — |
| R11.6 | El escalamiento corre solo con `escalate: true` y solo sobre filas con `severity_escalation_policy_code IS NOT NULL` (hoy ninguna), con paginación por cursor `id >` | SWEEP:293-340 | [situation-sweep.escalation-flag.spec.ts](../../src/situations/sweep/situation-sweep.escalation-flag.spec.ts), `vivo.pg.spec` («sin el interruptor de escalamiento…») |
| R11.7 | OIDC: sin configuración rechaza todo, sin token → 401, token inválido → 401 | [scheduler-oidc.guard.ts:47-88](../../src/situations/sweep/scheduler-oidc.guard.ts) | [scheduler-oidc.guard.spec.ts](../../src/situations/sweep/scheduler-oidc.guard.spec.ts) |

## 12. Escalamiento de severidad (infraestructura sin política)

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R12.1 | `PRODUCTION_SEVERITY_ESCALATION_POLICIES = []` y `ACTIVE_SEVERITY_ESCALATION_POLICY_CODE = null`: **ningún caso escala** | [severity-escalation.policy.ts:44-52](../../src/situations/severity-escalation/severity-escalation.policy.ts); [situations.module.ts](../../src/situations/situations.module.ts) (binding) | `severity-escalation.spec` («no hay ninguna política productiva activa») |
| R12.2 | Una política es una función pura de `(reported_severity, created_at)` que devuelve el calendario completo. No depende de `due_at` ni de la efectiva | severity-escalation.policy.ts:30-37 | — |
| R12.3 | `planDueEscalations`: horizonte `min(now, closed_at)`. Cada paso debe subir de nivel y no adelantarse al anterior; si no, error. Omite los `rule_key` ya registrados | severity-escalation.policy.ts:71-116 | `severity-escalation.spec` («planDueEscalations») |
| R12.4 | `materializeDueEscalations`: no-op si `policy_code` es NULL o desconocido. Inserta `AUTO_TIME` con `ON CONFLICT DO NOTHING`, actualiza `severity` sin listeners, emite timeline `SEVERITY_ESCALATED` y audita después del commit | [severity-escalation.service.ts:65-197](../../src/situations/severity-escalation/severity-escalation.service.ts) | `severity-escalation.spec` («SeverityEscalationService.materializeDueEscalations») |
| R12.5 | Se invoca en: resolución (R7.5), afectaciones (R8.7) y barrido con `escalate` (R11.6) | SVC:963; CONS:114; SWEEP:326 | ídem |

Activarlo requiere **dos** decisiones: una política aprobada y `SEVERITY_ESCALATION_ENABLED=true` ([INTERNAL_VIVO](../INTERNAL_VIVO.md), «Pendiente antes de producción») [H]. Además, solo los casos **nuevos** reciben el código de política (SVC:434-435) [V].

## 13. Idempotencia del alta

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R13.1 | `Idempotency-Key` opcional. Si viene y no es UUID v4 → 400 | [ai-orchestration.controller.ts:63-68](../../src/ai-orchestration/ai-orchestration.controller.ts) | — |
| R13.2 | Sin clave: cada envío crea una fila | ORCH:136-139 | [ai-orchestrator.idempotency.spec.ts](../../src/ai-orchestration/ai-orchestrator.idempotency.spec.ts) («sin cabecera…») |
| R13.3 | Huella SHA-256 del contenido canónico (recortes, relacionadas ordenadas y deduplicadas; los campos de cartas solo si vienen) | [registration-fingerprint.ts](../../src/situations/registration-fingerprint.ts) | [registration-fingerprint.spec.ts](../../src/situations/registration-fingerprint.spec.ts) |
| R13.4 | Clave nueva → crea con `client_request_id` + `request_fingerprint` y responde `replayed: false` | ORCH:140-178; SVC:441-442 | `idempotency.spec` («clave nueva crea la fila…») |
| R13.5 | Clave ya usada por **el mismo autor** con la misma huella → replay de solo lectura: `replayed: true` y el análisis si existe | ORCH:142-151, 553-575 | `idempotency.spec` («repetición…») |
| R13.6 | Misma clave con otra huella → 422 `IDEMPOTENCY_KEY_REUSED` | ORCH:558-564 | `idempotency.spec`, [registration-idempotency.int-spec.ts](../../test/integration/registration-idempotency.int-spec.ts) |
| R13.7 | Carrera: el índice parcial único `uq_situations_creator_client_request (created_by_user_id, client_request_id) WHERE client_request_id IS NOT NULL` hace fallar la segunda inserción; la perdedora responde el replay del ganador, o 409 `REGISTRATION_IN_PROGRESS` si aún no lo ve | ORCH:159-176, 577-583; entidad [situation.entity.ts:30-34](../../src/situations/entities/situation.entity.ts); migración 1787200000001 | `idempotency.spec` («carrera por inserción…»), `registration-idempotency.int-spec.ts` |
| R13.8 | La clave es **por autor**: la misma clave usada por dos usuarios crea dos situaciones [V por el índice compuesto] | ídem | — |

## 14. Integridad por coordinación (`integrity-mvp-v1`)

Dominio puro en `INTEG`. Lo consume `GET /operational-overview` ([operational-overview.service.ts:48-109](../../src/operational-overview/operational-overview.service.ts)), que exige `SITUATIONS_VIEW` y `COORDINATIONS_VIEW`. Se recalcula en cada lectura y no se persiste.

**Snapshot por coordinación** (solo `OPEN` e `IN_PROGRESS`, INTEG:30-33; por severidad **efectiva**):
- `activeProblemsCount` y `critical/high/medium/lowCount`: casos cuya **responsable** es la coordinación.
- `affectedCoordinationCount`: coordinaciones distintas en `situation_affected_coordinations` (propagación del análisis IA) de esos casos, excluida la propia ([operational-overview.repository.ts:123-150](../../src/operational-overview/repositories/operational-overview.repository.ts)).
- `incomingDependencyCount` e `incomingCriticalCount`: INTER activas donde la coordinación es la **afectada**. Incluye la fila INTER con responsable = afectada (caso N2) [V, repositorio:165-215].

| # | Regla (umbral exacto) | Implementación | Pruebas |
|---|---|---|---|
| R14.1 | Snapshot inválido → `DESCONOCIDO` (nunca ESTABLE): no entero o NaN/Infinity, negativo, suma de severidades ≠ activos, propagación > 0 con 0 activos, `incomingCritical > incoming` | INTEG:133-186, 197-200 | [coordination-integrity.spec.ts](../../src/operational-overview/domain/coordination-integrity.spec.ts) («snapshots inválidos») |
| R14.2 | **CRITICO** si se cumple al menos una: `criticalCount >= 1` (CRITICAL_SEVERITY) · `highCount >= 3` (HIGH_ACCUMULATION) · `activeProblemsCount >= 5` (ACTIVE_ACCUMULATION) · `affectedCoordinationCount >= 3` (IMPACT_PROPAGATION) · `incomingCriticalCount >= 1` (INCOMING_DEPENDENCY_CRITICAL). Se devuelven todas las reglas cumplidas | INTEG:68-71, 202-227 | ídem («integridad por coordinación», «acumula todas las reglas…», «una dependencia INTER CRITICAL entrante eleva a CRITICO») |
| R14.3 | **ESTABLE** si `activeProblemsCount === 0` **y** `incomingDependencyCount === 0` | INTEG:229-234 | ídem («sin problemas activos…») |
| R14.4 | **ALERTA** en el resto (p. ej. 1 LOW, 1-2 HIGH, 1-4 activos, una INTER entrante no crítica) | INTEG:236 | ídem («un LOW pone la coordinación en ALERTA», «una dependencia INTER entrante eleva a ALERTA…») |
| R14.5 | Las INTER entrantes **no** se suman a `activeProblemsCount` de la afectada | INTEG:43-50 | ídem |

**Dirección de Operaciones** (`evaluateDirectionIntegrity`, INTEG:274-341; combinada con el «Registro de analista» en [operational-direction-integrity.ts:72-120](../../src/operational-overview/domain/operational-direction-integrity.ts)):

| Orden | Condición | Estado |
|---|---|---|
| 0 | Sin coordinaciones | DESCONOCIDO |
| 1 | Señales críticas ≥ 2 (coordinaciones CRITICO + registro de analista CRITICO) | CRITICO, aunque haya desconocidas |
| 2 | Alguna coordinación o el registro DESCONOCIDO | DESCONOCIDO |
| 3 | Exactamente 1 señal crítica | ALERTA |
| 4 | Señales de alerta ≥ `ceil(totalCoordinaciones / 3)` (el registro no entra en el denominador) | ALERTA |
| 5 | Resto | ESTABLE |

Pruebas: `coordination-integrity.spec` («estado de la Dirección de Operaciones»), [operational-direction-integrity.spec.ts](../../src/operational-overview/domain/operational-direction-integrity.spec.ts).

- El **Registro de analista** agrupa los casos con `coordination_id IS NULL` ([build-coordination-snapshots.ts:10, 29-31](../../src/operational-overview/domain/build-coordination-snapshots.ts)). Desde las reglas R2.3 y R2.6, ninguna alta nueva nace sin responsable, así que el registro solo refleja datos históricos [I].
- Un COORDINADOR recibe el registro vacío, que se evalúa como ESTABLE (operational-overview.service.ts:88-94) [V]. Por eso la lectura de la Dirección puede diferir entre roles [I].

## 15. Vidas por coordinación (`life-points-v1`)

Dominio puro en `LIFE`. Mismo snapshot que la integridad, ampliado con `externalIncoming{Low,Medium,High,Critical}Count`: INTER activas donde la coordinación es la afectada **y la responsable es otra** (`coordination_id IS DISTINCT FROM affected_coordination_id`). Derivadas en cada lectura; nada se persiste.

| # | Regla | Implementación | Pruebas |
|---|---|---|---|
| R15.1 | Máximo: 5 corazones × 2 = **10** puntos | LIFE:26-28 | [coordination-life-points.spec.ts](../../src/operational-overview/domain/coordination-life-points.spec.ts) («constantes») |
| R15.2 | Daño por caso activo: LOW 1 · MEDIUM 1 · HIGH 2 · CRITICAL 2 (severidad efectiva) | LIFE:31-38 | ídem |
| R15.3 | `damage = propios + entrantes externos` y `lifePoints = clamp(10 − damage, 0, 10)`. El exceso no se acumula | LIFE:163-190 | ídem («saturación», «nunca supera 10 ni baja de 0») |
| R15.4 | Una INTER con responsable = afectada cuenta solo como propia, no dos veces | LIFE:47-58; repositorio:165-172 | ídem («…responsable = afectada NO resta dos veces») |
| R15.5 | Recuperación automática: cerrar un caso lo saca del snapshot. `IN_PROGRESS` resta; `RESOLVED` y `CLOSED` no | LIFE:16-19 | ídem («recuperación derivada») |
| R15.6 | Snapshot inválido (incluido un desglose externo mayor que el total entrante) → `lifePoints: null`, nunca un valor sano | LIFE:104-152, 166-169 | ídem («snapshot inválido → null») |
| R15.7 | Vidas e integridad son independientes: el desglose externo no altera la integridad | LIFE:8-14 | ídem («independencia de la integridad») |

## 16. Compatibilidad con la versión anterior (transitoria)

| # | Shim | Implementación | Pruebas | Retirada |
|---|---|---|---|---|
| R16.1 | **Contrato anterior sin `reportKind`:** solo si no trae campos de cartas y trae `categoryId`. Solo para un COORDINADOR: usa la coordinación enviada o la de su sesión, y `createInternal` vuelve a exigir que sea la suya. Otros roles → 400 `LEGACY_REGISTRATION_REQUIRES_COORDINATION`. Crea un INTERNAL con la severidad enviada como reportada y registra un `warn` en el log | SVC:201-241 | `legacy.spec`, `dto.spec` («sin reportKind admite solo la forma del contrato anterior») | [RELEASE_CIRCO](../RELEASE_CIRCO.md) §9 |
| R16.2 | **Inserciones del backend anterior (`49a6483`):** trigger `BEFORE INSERT` que, si falta `reported_severity`, la iguala a `severity`, completa la afectada en INTERNAL y marca la fila. `CONSTRAINT TRIGGER` diferido que crea la fila REPORTED si no existe | migración [1788100000000-LegacySituationInsertCompatibility.ts](../../src/database/migrations/1788100000000-LegacySituationInsertCompatibility.ts) | `.pg.spec` específico no localizado [?]. RELEASE_CIRCO §10.1 registra la validación local [H] | Una migración nueva que retire los triggers (no revertir la existente) |
| R16.3 | La huella de idempotencia de una petición del contrato anterior es idéntica a la de `main` | registration-fingerprint.ts:9-16 | `registration-fingerprint.spec` («…conserva exactamente la huella de main») | Con R16.1 |
| R16.4 | `RESOLVED` legado sigue siendo resoluble y cuenta como activo para el SLA | SVC:81-85; SWEEP:23-27 | `resolution.spec` («un problema RESOLVED legado todavía puede cerrarse») | Sin plan documentado [?] |

El rollback a `49a6483` no es viable si ya existen INTER ([RELEASE_CIRCO](../RELEASE_CIRCO.md) §10.2) [H].

## 17. Ejemplos operativos

> Identificadores ficticios. `A`, `B` y `G` son UUID de coordinaciones (`G` = `coord-general`). Los tokens se omiten.

### 17.1 Ciclo de vida de un reporte INTER

1. **Alta** por el coordinador de A, que espera una entrega de B:
   ```http
   POST /api/v1/situations/register-with-analysis
   Idempotency-Key: 6f1c2a8e-4b7d-4e1a-9c3f-2d5e8a7b9c10
   { "reportKind": "INTER_COORDINATION", "coordinationId": "B", "affectedCoordinationId": "A",
     "title": "Insumo pendiente", "description": "…", "severity": "HIGH",
     "occurredAt": "2026-11-09T12:00:00-05:00",
     "affectedProcess": "Publicación del curso", "pendingDelivery": "Entrega de guías" }
   ```
   → 201 `{ situation: { status: "OPEN", reportKind: "INTER_COORDINATION", dueAt: createdAt+72h, canResolve: false, canAdvanceToInProgress: false, canUpdate: true }, analysis: null, replayed: false }` (R2.6, R2.7, R10.1). `canUpdate: true` es la pista engañosa de O4.
2. **Reintento** por un corte de red, con la misma clave y el mismo cuerpo → 201 `replayed: true` y la misma situación (R13.5). Con otro cuerpo → 422 `IDEMPOTENCY_KEY_REUSED` (R13.6).
3. **Coordinador de A** consulta: `GET /situations?coordinationId=A` incluye el caso (R3.2) y `GET /situations/:id` responde 200 por autoría o por afectada (R3.1). `PATCH /situations/:id { "title": "…" }` → 404, porque queda fuera de su alcance de escritura (R4.1, O4). `POST /situations/:id/consequences` → 400, porque es INTER (R8.3).
4. **Overview:** A queda en ALERTA por la INTER entrante, o en CRITICO si fuera CRITICAL, y pierde 2 vidas (HIGH). B suma 1 activo HIGH y 2 de daño (R14.2-R14.4, R15.2).
5. **Coordinador de B** avanza: `PATCH /situations/:id { "status": "IN_PROGRESS" }` → 200, con `assignedUserId` = coordinador de B (R6.2, R6.5).
6. **Coordinador de B** resuelve: `POST /situations/:id/resolution { "learning": "Acordar fechas de entrega al inicio del periodo." }` → 201 `status: CLOSED`, `resolution.learning` y `closedOnTime` (R7.2-R7.8). Un segundo intento → 409 (R7.3).
7. El coordinador de A intentando resolver recibe 403 (R7.2). Un `PATCH { "status": "CLOSED" }` de cualquiera recibe 403 (R4.2).

### 17.2 INTERNAL con afectaciones, reportado por un ANALISTA

1. ANALISTA: `POST …/register-with-analysis { "reportKind": "INTERNAL", "coordinationId": "A", "categoryId": "<seleccionable>", "severity": "MEDIUM", "occurredAt": "…", "initialConsequence": { "description": "Retraso en matrícula" }, … }` → 201, con la afectación inicial en la misma transacción (R2.3, R2.11, R2.14).
2. ANALISTA (autor): `POST /situations/:id/consequences { "description": "Quejas de estudiantes" }` → 201 (R8.5). Con `occurredAt` anterior al problema → 400 (R8.6).
3. ANALISTA: `PATCH { "status": "IN_PROGRESS" }` → 403, porque la responsable no es G (R6.3). `POST /resolution` → 403 (R7.2).
4. Coordinador de A: avanza (200) y resuelve (201). Desde ese momento, `POST /consequences` → 409 (R8.4).
5. **Riesgo N1:** si en el paso 3 el ANALISTA envía antes `PATCH { "coordinationId": "G" }`, el sistema lo acepta (R4.4). Después podría avanzar y resolver él mismo. Sin corregir; ver [seguridad-y-correcciones.md](seguridad-y-correcciones.md).

### 17.3 Línea de tiempo SLA de un CRITICAL

- Alta el día D a las 10:00 → `due_at` = D+1 10:00 (R10.1). `slaHealth` es `on_track` hasta D+1 04:00, `at_risk` hasta D+1 10:00 y `overdue` después (R10.2).
- Barrido en la ventana de aviso → `SLA_WARNING` y `last_sla_reminder_at`. Otro aviso solo pasadas 12 h (R11.4). Como el plazo vence antes, en la práctica hay un solo aviso [I].
- Primer barrido tras D+1 10:00 → `sla_breached_at = due_at` (no la hora del barrido) y `SLA_BREACHED` una sola vez (R11.3).
- Cierre posterior → `closedOnTime: false` (R10.3). La severidad sigue en CRITICAL: no hay escalamiento ni desescalamiento (R12.1).
- Si nadie dispara el barrido (sin Scheduler y sin instancia viva), `slaHealth` igual se calcula al leer, pero no se generan eventos de timeline [V/I].

## Límites de verificación

- Verificado **solo por lectura de código** en `5ffc65f`. No se ejecutó ninguna prueba, ni build, ni petición HTTP. Los nombres de pruebas se tomaron de los títulos `it(...)`; que cubran exactamente la regla citada es [I] cuando el título no lo dice.
- N1, N2, O1, O2, O3 y O4 están verificados por lectura de código, **sin prueba de explotación**.
- No se revisó la lógica interna de `operational-kpis`, `situation-impact` (propagación IA, origen de `affectedCoordinationCount`) ni `situation-evidence`.
- La zona horaria efectiva del proceso en Cloud Run (R2.10) y la ejecución real del `@Cron` en producción están [?].
- No se verificó qué migraciones están aplicadas en producción ([README](README.md) §2). Si faltara alguna, las reglas apoyadas en la base (R7.4, R8.8, R9.4, R13.7, R16.2) podrían no regir allí [?].
- La matriz de qué rol tiene cada permiso no se reverificó aquí; ver [autenticacion-y-permisos.md](autenticacion-y-permisos.md).

## Documentos relacionados

- [README.md](README.md): índice del empalme, pendientes y riesgos.
- [arquitectura.md](arquitectura.md): arranque, módulos, guards y flujo de petición.
- [autenticacion-y-permisos.md](autenticacion-y-permisos.md): permisos por rol y alcance.
- [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md): tablas, triggers, índices y migraciones.
- [seguridad-y-correcciones.md](seguridad-y-correcciones.md): A1, A2, M1, N1 y N2.
- [inteligencia-artificial.md](inteligencia-artificial.md): análisis Gemini diferido y reclamo de análisis.
- [despliegue-y-operacion.md](despliegue-y-operacion.md): Cloud Scheduler, variables del barrido.
- [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md): cómo ejecutar los specs citados (incluidos los `.pg.spec`).
- [INTERNAL_VIVO](../INTERNAL_VIVO.md) y [RELEASE_CIRCO](../RELEASE_CIRCO.md): diseño y publicación de cartas [H].
- [CLAUDE.md](../../CLAUDE.md).
- Frontend: NOVEX_FRONTEND → `docs/empalme/README.md`.
