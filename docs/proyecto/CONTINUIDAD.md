# Continuidad NOVEX — retomar desde otro computador

**Fecha de sincronización:** 2026-11-09  
**Rama de trabajo:** `refactor/novex-consolidacion` (única autorizada para publicar).  
**Producción / `main`:** no tocar, no mergear, no desplegar.

Esta carpeta (`NOVEX_BACKEND/docs/proyecto/`) es la **copia versionada** de la documentación vigente del monorepo local `Proyecto-Novex/docs/`. Los originales en el disco local se conservan; esta ruta es la fuente al clonar solo el backend.

## Estado actual

| Capa | Repo | Rama | SHA de sincronización |
|---|---|---|---|
| API | `NOVEX_BACKEND` | `refactor/novex-consolidacion` | tip de la rama (código 01B.2 = `6408bc4`; luego solo docs de continuidad) |
| SPA | `NOVEX_FRONTEND` | `refactor/novex-consolidacion` | tip de la rama (código 01B.2 = `e38bca1`; luego solo docs de continuidad) |
| Prod | tags `novex-circo-prod-20261027` | `main` | BE `5ffc65f` · FE `b726c47` |

Fases **cerradas en código, sin desplegar a Cloud SQL / `main`:**

| Fase | Qué quedó |
|---|---|
| **00** | Diagnóstico, respaldos, ramas de consolidación, docs compactas, limpieza remota segura |
| **01A** | Alcance lectura/IA/escritura (A2/M1), PATCH seguro (N/O/F-01), alta INTER, guardas Cloud SQL, overview COORDINADOR |
| **01B.1** | Anulación, traslado, auditoría transaccional, historial `NOLOGIN`, KPIs históricos |
| **01B.2** | IA solo sugiere + prompt minimizado; K-01/K-02/K-03/K-06; D8 RESOLVED→CLOSED; recomendaciones congeladas; retiro de evidencias |

### Últimos commits relevantes

**Backend (01B.2, después de `2bdf12f`):**  
`1cdd00e` integridad · `f3ddeb6` prompt · `80ed87b` K-01 · `771bb96` K-02/K-06 · `9d8c49f` D8 · `d1946fc` recomendaciones · `47746ca` evidencias · `d12ca0b` fixes PG · `d0f2b67` tests PG · `6408bc4` reglas CLAUDE.

**Correcciones de la revisión Codex 01B.2 (locales, sin push):**  
`d3ddaf9` evidencia retirada por id · `33d65ed` campos dinámicos del prompt · `983711d` 422 `PROMPT_TOO_LARGE`.

**Frontend (01B.2):**  
`6e71c0b` Director / regla de estado (K-01) · `e38bca1` Coordinador / conteos oficiales (K-03).  
También en la rama (previo): `cbf4595` e2e con PostgreSQL efímero marcado.

## Qué debe revisar Codex de Fase 01B.2

Revisión de código ya escrito (sin redesplegar ni migrar Cloud SQL):

1. Integridad: solo hechos confirmados; `situation_affected_coordinations` no cuenta.
2. Prompt: lista blanca, expediente no confiable, límite duro, `promptSnapshot` solo ADMIN.
3. Población KPI compartida (`kpi-population.ts`): RESOLVED sin fecha no activo; INTER consigo misma = propia.
4. Contrato overview / panel: regla de Dirección (K-01) y conteos oficiales del coordinador (K-03).
5. Migración `1788800000000`: no inventa fechas; pendientes `PENDING_*` explícitos.
6. Retiro de evidencias (`1788900000000`): sin borrado físico; motivo obligatorio; `DELETE` compatible.
7. Suites PG reales y guarda de base desechable; contenedor con roles `NOLOGIN` + app antes de `1788700000000+`.
8. Correcciones de la revisión: evidencia retirada por id (404 sin permiso de historial), saneamiento de catálogos y códigos en el prompt, 422 `PROMPT_TOO_LARGE` conservado.

### Hallazgo pendiente para la integración de KPIs (no corregido aquí)

El parser del frontend (`NOVEX_FRONTEND` · `operational-kpi.service.ts`, `parseDirectionIntegrity`) **rechaza** con `OperationalKpiContractError` cualquier `direction.directionIntegrity.rule` fuera de su lista fija (`DIRECTION_INTEGRITY_RULES`). Hoy las 6 reglas coinciden con el backend (`operational-direction-integrity.ts`), por lo que no bloquea; pero una regla nueva rompería toda la respuesta de Dirección, aunque el contrato se declaró aditivo. Se deja sin tocar porque los KPIs están en trabajo de otro integrante; resolverlo en esa integración (p. ej. regla desconocida → explicación `null` en lugar de error) y sincronizar la lista con el backend.

## Pendientes de frontend y UX/UI

- **UI de anulación y traslado** (contratos HTTP y `canCancel` / `canTransfer` ya en backend).
- Resto FE-01…FE-04 de la auditoría.
- Tutorial: sigue suspendido en prod (`ONBOARDING_TOUR_SUSPENDED`); no activar sin autorización.
- Vitest puede fallar por `localStorage`/jsdom; typecheck/build son la puerta.

## Fase 02 — Plan de integración funcional FE (sin tocar KPIs ni diseño)

**Fecha del plan:** 2026-11-10  
**Alcance:** cablear en Cartas y Circo lo ya cerrado en BE (01B.1 / 01B.2).  
**Ramas de trabajo:** solo `refactor/novex-consolidacion`.  
**SHAs de referencia al planear:** BE `f11f44a` · FE tip docs `1cf7e55` (código 01B.2 aún `e38bca1`).  
**Fuera de alcance aquí:** KPIs/cálculos/contratos overview (otro integrante); rediseño visual; migraciones/Cloud SQL; `main` / `Alejo-Rama`; push/merge/deploy.

**Rutas locales en esta máquina (no mezclar):**

| Uso | Ruta | Rama | Nota |
|---|---|---|---|
| Activo prod-like | `Proyecto-Novex/NOVEX_{BACKEND,FRONTEND}` | `main` | **No modificar** |
| Consolidación | `NOVEX-review-01b2-{backend,frontend}` | `refactor/novex-consolidacion` | Aquí se integra |

Contratos HTTP detallados: [seguridad-y-permisos.md](./seguridad-y-permisos.md) §01B.1 / §01B.2.

### 1. Inventario de funcionalidades pendientes

| # | Funcionalidad | BE @ `f11f44a` | FE Cartas | Gap |
|---|---|---|---|---|
| A | Anulación ADMIN | Listo (`POST …/cancellation`, `SITUATIONS_CANCEL`, `canCancel`) | Ausente | Client + UI + tipo `CANCELLED` |
| B | Traslado administrativo | Listo (`POST …/coordination-transfer`, `SITUATIONS_TRANSFER`, `canTransfer`) | Ausente | Client + UI; no usar PATCH `coordinationId` |
| C | Retiro / historial evidencias | Listo (retirement, `includeRetired`, 404 sin permiso) | Solo lectura de activas | Client retiro/historial + UI |
| D | IA contextual | Listo (`analyze`, history, compare; alta **sin** Gemini inline) | API sí; panel Cartas no | Superficie Circo; no remontan modal legacy |
| E | Formularios INTERNAL ∪ INTER | Listo (`reportKind` + `register-with-analysis`) | Casi hecho (`ReportProblemForm`) | Limpieza drafts legacy + deep-link INTER |
| F | Sesión / borradores / rutas | Auth parcial (JWT ~1 h, sin refresh/logout API) | FE-01…FE-04 abiertos | Permisos desde `/auth/me`; no cerrar por red; drafts aprendizaje; bookmarks ya redirigen |

### 2. Contratos actuales comprobados (resumen)

- **Anular:** `POST /api/v1/situations/:id/cancellation` `{ reason }` → 201 detalle `CANCELLED` + `cancellation`. Orígenes OPEN/IN_PROGRESS/RESOLVED; no CLOSED. Listado excluye anuladas salvo `?status=CANCELLED`. Escrituras sobre anulada → 409 `SITUATION_CANCELLED`.
- **Trasladar:** `POST /api/v1/situations/:id/coordination-transfer` `{ toCoordinationId, reason, expectedCurrentCoordinationId? }`. INTERNAL mueve responsable+afectada; INTER solo responsable (destino ≠ afectada). `IN_PROGRESS` → `OPEN` y quita asignación. PATCH con `coordinationId` → 403.
- **Evidencias:** `POST …/retirement` (y `DELETE` compatible) con `reason`; GET activas por defecto; `?includeRetired=true` solo ADMIN u operador con alcance (sin eso, retirada por id → 404).
- **IA:** alta `register-with-analysis` devuelve `analysis: null`; análisis = `POST …/analyze` aparte (`AI_ANALYZE`). Lectura `AI_VIEW_REPORTS`. No usar `/intelligence` ni `/operational-events` para el flujo de cartas.
- **INTERNAL/INTER:** un alta; `reportKind` obligatorio en clientes nuevos.
- **Sesión:** `POST /auth/google|email`, `GET /auth/me`; sin refresh ni logout de servidor. Borradores **solo FE** (`novex.cards.reportDrafts.v1`).

### 3. Componentes frontend reutilizables

| Área | Reutilizar (no rediseñar) |
|---|---|
| Acciones admin A/B | `ProblemDetail`, `ProblemActions`, `OperationalActionPanel`, shells `AdminOperationalShell` |
| Selector traslado | `ResponsibleCoordinationPicker` + catálogo `coordinations.api` (adaptar copy; no es el form INTER) |
| Evidencias C | `ProblemDetail` / `ProblemDetailSection`, `problem-detail.service`, `evidences.api` (ampliar) |
| IA D | Clients `analysis.api` / `situationAnalysis.service`; **no** montar `SituationAnalysisPanel` legacy en el router |
| Alta E | `ReportProblemForm`, `report-submission.service`, `report-persistence` |
| Sesión F | `AuthContext`, `accessTokenStorage`, `http.ts` (401), `NovexUserMenu`, redirects en `app/router.tsx` |

### 4. Orden de implementación

1. **Cableado A+B (tipos/permisos/clients)** — `CANCELLED`, `canCancel`/`canTransfer`, `SITUATIONS_CANCEL`/`TRANSFER`, endpoints dedicados; sin UI todavía.
2. **UI anulación ADMIN** — modal motivo en panel derecho; refresco overview; manejo 403/409.
3. **UI traslado ADMIN** — mismo patrón + `expectedCurrentCoordinationId` + errores de destino INTER.
4. **Retiro/historial evidencias** — ampliar `evidences.api` y sección del detalle; motivo obligatorio.
5. **FE-01…FE-03 (sesión/borradores)** — permisos vigentes desde `/auth/me`; no cerrar sesión por fallo de red/5xx al bootstrap; aviso de caducidad + persistir borrador de aprendizaje. FE-04 ya mitigado por redirects.
6. **IA contextual en Cartas** — panel Circo que dispare `analyze` / muestre vigente; alta sigue diferida.
7. **Cierre E** — unificar o archivar `situationCaptureDraftStorage`; deep-link INTER equivalente a `?reportar=interno`.

**No paralelizar con el trabajo de KPIs** en los mismos archivos de overview/parsers.

### 5. Riesgos e incompatibilidades reales

- Tipar mal `CANCELLED` o pintarlo en el mazo activo rompe filtros/vidas; las anuladas van fuera del mazo (solo consulta explícita).
- Usar PATCH para “cambiar coordinación” choca con 403 del BE maduro.
- Traslado sin refrescar overview deja carta fantasma en origen/destino.
- Mostrar evidencias retiradas o `promptSnapshot` sin permiso → 404 / withheld; no inventar UI de error que filtre RETIRED en cliente.
- Remontar páginas legacy (`/intelligence`, `/operational-events`, rail) reintroduce FE-04 y doble identidad.
- Tocar `operational-kpi.service` / integridad de Dirección: **ajeno** a Fase 02 (hallazgo del parser de reglas queda para el integrante de KPIs).
- Migraciones `17883*`–`17889*` siguen bloqueadas en Cloud SQL; la UI puede cablearse contra API local consolidada, no contra prod.

### 6. Reparto Cursor ↔ Antigravity

| Quién | Qué |
|---|---|
| **Cursor** | Clients/tipos/permisos; cableado a shells existentes; FE-01…FE-03; retiro evidencias en API+sección actual; guards de no-regresión (no montar legacy; no PATCH de coordinación); docs/contratos; **no** KPIs |
| **Antigravity** | UX Cartas y Circo de anulación/traslado (modales, copy, estados vacíos); superficie IA contextual en el panel derecho; presentación de historial de evidencias retiradas; pulido visual sin cambiar el sistema de diseño |

Contratos HTTP canónicos para Antigravity: ya listados en [seguridad-y-permisos.md](./seguridad-y-permisos.md) §«Contratos para la interfaz (Antigravity)».

## Migraciones pendientes de producción

**No ejecutar en Cloud SQL** hasta roles y verificación:

| Serie | Contenido |
|---|---|
| `17883*`…`17887*` | 01B.1: CANCELLED, historial, permisos CANCEL/TRANSFER, privilegios |
| `17888*` | Normalización RESOLVED legado → CLOSED (D8) |
| `17889*` | Retiro de evidencias |

**Requisitos PostgreSQL (bloqueantes):**

1. `NOVEX_HISTORY_OWNER_ROLE` **`NOLOGIN`**, separado del rol de aplicación.
2. `NOVEX_APP_DB_ROLE` no-superusuario, sin membresía del propietario.
3. Migrador autorizado para transferir propiedad de tablas.
4. Verificación **solo lectura** de privilegios (ver `seguridad-y-permisos.md` y `despliegue-y-operacion.md`) **antes** de `migration:run`.

## Advertencia: snapshot local dañada

La base `novex_local_snapshot_20261028` (puerto 5442 / contenedor `novex-postgres`) fue **truncada** el 2026-11-09 por e2e sin override de `.env`. **No usarla** como verdad de datos ni como destino de pruebas. Detalle: `NOVEX-FASE-01-AUDITORIA-TECNICA.md` §1.2.

## Pruebas destructivas (resumen seguro)

1. Contenedor **nuevo** distinto de `novex-postgres`, tmpfs, loopback.
2. `COMMENT ON DATABASE … IS 'novex:disposable-test-db'`.
3. Variables solo en la **invocación** (`NOVEX_DESTRUCTIVE_TESTS=1`, host/puerto/nombre de prueba).
4. Desde `1788700000000`: crear roles `novex_history_owner NOLOGIN` y `novex_app`, y pasar `NOVEX_HISTORY_OWNER_ROLE` / `NOVEX_APP_DB_ROLE` al migrar.
5. Procedimiento completo: `NOVEX_BACKEND/CLAUDE.md` §«Pruebas destructivas».

**Nunca** contra `.env` de desarrollo, `novex`, snapshot dañada o Cloud SQL.

## Continuar mañana desde otro computador

### Opción A — ya tienes clones

```bash
cd NOVEX_BACKEND
git fetch origin
git checkout refactor/novex-consolidacion
git pull --ff-only origin refactor/novex-consolidacion
git log -1 --oneline   # debe incluir docs(proyecto); código 01B.2 en 6408bc4

cd ../NOVEX_FRONTEND
git fetch origin
git checkout refactor/novex-consolidacion
git pull --ff-only origin refactor/novex-consolidacion
git log -1 --oneline   # debe incluir docs de continuidad; código 01B.2 en e38bca1
```

### Opción B — clon fresco

```bash
git clone -b refactor/novex-consolidacion https://github.com/DesarrolloFabrica/NOVEX_BACKEND.git
git clone -b refactor/novex-consolidacion https://github.com/DesarrolloFabrica/NOVEX_FRONTEND.git
```

Documentación de continuidad y fases: `NOVEX_BACKEND/docs/proyecto/` (empezar por `README.md` y este archivo).

### Layout recomendado

```
Proyecto-Novex/
  NOVEX_BACKEND/     # docs/proyecto = docs vigentes versionados
  NOVEX_FRONTEND/
```

Secretos (`.env`, JWT, Gemini, DB): **no** están en Git; copiarlos por canal seguro aparte. No commitear `.env`.

### Qué no hacer al retomar

- Push/merge a `main`, force push, deploy, migraciones Cloud SQL.
- Tocar `Alejo-Rama` o la snapshot dañada.
- Publicar desde otra rama que no sea `refactor/novex-consolidacion`.

## Qué falta (productivo / siguientes fases)

- Revisión Codex 01B.2 y cierre formal documental si hace falta.
- **Fase 02** (plan arriba): UI anulación/traslado y demás integración FE; sin KPIs.
- Aprovisionar roles PG y solo entonces planificar migraciones (autorización explícita).
- AU-01 restante, OP-01/OP-03, K-04/K-05/K-07, P2, retención IA (D7) sin ejecución automática.
- Respaldos locales `.backups/` de Fase 00: **solo en el disco original**; no están en GitHub (intencional). Bundles recuperables allí si hace falta historia pre-limpieza.
