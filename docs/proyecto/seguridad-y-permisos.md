# Seguridad y permisos

**Detalle reimplementable A1/A2/M1/N/O:** [seguridad-fase0-detalle.md](./seguridad-fase0-detalle.md) (copia del empalme 2026-11-06).  
**Estado Git Fase 00:** A1 en `refactor/novex-consolidacion` BE (`72e24fe`); **no** en `origin/main`/prod. A2/M1: solo especificación (worktrees perdidos).

## Modelo de autorización

1. JWT identifica al usuario.
2. `AuthorizationEnrichmentGuard` relee rol, permisos y coordinación desde BD.
3. `@RequirePermissions` / asserts + **alcance** (`operational-scope` + `situation-access`).
4. Fuera de alcance de lectura → **404** «Situación no encontrada». Sin propiedad de escritura → **403**.

Lectura ≠ escritura. Pistas `canUpdate` / `canResolve` / `canAdvanceToInProgress` **no autorizan**.

## Checklist Fase 0

| Id | Problema | En consolidación BE | En prod | Acción |
|---|---|---|---|---|
| **A1** | IDOR `/recommendations/:id` | Corregido (revalidado en 01A) | Vulnerable | Autorizar PR → `main` |
| **A2** | COORDINADOR sin coordinación lista todas | **Corregido 01A** (`485476c`): 403 `COORDINATION_REQUIRED` en listado, 404 en detalle | Sí | Desplegar |
| **M1** | `analyze` / POST recommendations con alcance lectura | **Corregido 01A** (`485476c`): análisis con regla propia, recomendaciones con operación, 409 en cerrados | Sí | Desplegar |
| **N1** | ANALISTA reasigna a `coord-general` y resuelve | **Corregido 01A** (`8be4415`); traslado ADMIN en **01B.1** (`9bcd89d`…`2bdf12f`, sin desplegar) | Sí | Desplegar tras puerta roles `NOLOGIN` |
| **N2** | PATCH INTER puede igualar responsable/afectada | **Corregido 01A** (`8be4415`), por la misma vía | Sí | Desplegar |
| **O1** | Avance + otros campos | **Corregido 01A** (`8be4415`): 400 `ADVANCE_WITH_FIELD_CHANGES` | Sí | Desplegar |
| **O2** | PATCH edita CLOSED | **Corregido 01A** (`8be4415`): 409 `SITUATION_CLOSED` | Sí | Desplegar |
| **O3–O4** | Validación de textos; pista `canUpdate` | Abiertos | Sí | Etapa 2 |
| **F-01** | PATCH sin bloqueo revierte cierres / marcas SLA / reclamo IA | **Corregido 01A** (`8be4415`), probado en PostgreSQL | Sí | Desplegar |
| **OP-02** | Seeds/migraciones contra Cloud SQL sin barrera | **Corregido 01A** (`3597622`) | n/a (local) | — |

## Matriz de autorización vigente en consolidación (Fases 01A y 01B.1)

| Acción | ADMIN | DIRECTOR | ANALISTA | COORDINADOR (con área) |
|---|---|---|---|---|
| Leer situaciones | Todas | Todas | Todas | Responsable o afectada = la suya; sus reportes |
| Reportar INTERNAL | No | No | Cualquier coordinación | Solo la suya |
| Reportar INTER | No | No | Responsable y afectada libres | Afectada = la suya; responsable, otra |
| Analizar con IA | No | No | Cualquier caso activo | Responsable = la suya, caso activo |
| Recomendación manual | No | No | Sus reportes activos | Responsable = la suya, caso activo |
| Editar (PATCH) | No | No | Sus reportes, sin cerrar | Responsable = la suya, sin cerrar |
| Cambiar coordinación responsable | Traslado administrativo (`SITUATIONS_TRANSFER`) | No | No | No |
| Anular una situación | Sí (`SITUATIONS_CANCEL`) | No | No | No |
| Avanzar / resolver | No | No | Responsable = `coord-general` | Responsable = la suya |

COORDINADOR **sin** coordinación: no lista (403 `COORDINATION_REQUIRED`), no lee (404) ni opera ninguna situación, y `GET /operational-overview` también responde 403 antes de cualquier consulta (`9d76a8e`).

## Anulación, traslado y auditoría (Fase 01B.1) — **cerrada en código**

**Estado:** implementada en `NOVEX_BACKEND` / `refactor/novex-consolidacion` (tip local `2bdf12f`, **sin desplegar** a `main`/Cloud SQL).  
**Cierre de endurecimiento (Codex):** `119ea7b` historial/rollback · `2f38cdb` auditoría transaccional de escalamiento · `a718cd7` reapertura en traslado · `0d18545` atribución histórica en KPIs · `2bdf12f` pruebas PG de invariantes.  
**Base funcional previa:** `5690971` modelo · `546fbe3` auditoría · `20d431d` anulación · `9bcd89d` traslado · `957cce3` indicadores · `811797c` integración PG.

**Pruebas aprobadas en el cierre:** 1.158 unitarias y 61 PostgreSQL (suites de historial, traslado e invariantes institucionales).

### Permisos y base de datos

- **Permisos nuevos, solo ADMIN** (migración `1788600000000` y catálogo): `SITUATIONS_CANCEL` y `SITUATIONS_TRANSFER`.
  - El servicio exige además el rol ADMIN (defensa en profundidad).
  - ADMIN **no** gana CREATE, UPDATE, CLOSE ni AI_ANALYZE.
  - Los demás roles no cambian.
- **Migraciones** (`1788300000000` a `1788700000000`):
  - estado `CANCELLED` y eventos de línea de tiempo `CANCELLED` y `COORDINATION_TRANSFERRED`;
  - historial administrativo sin UPDATE/DELETE/TRUNCATE, con FK `RESTRICT` y rollback de traslados que aborta si hay filas;
  - los escalamientos automáticos escriben severidad, historial, timeline y auditoría obligatoria en la misma transacción;
  - traslado de `IN_PROGRESS` reabre en `OPEN`, retira la asignación actual y conserva persona/estado anteriores en el historial;
  - KPIs temporales reconstruyen la responsable a la fecha del evento/corte vía `situation_coordination_transfers`;
  - los permisos nuevos.
- **Reversibilidad:** todas tienen `down()` y se probaron revirtiendo y reaplicando. Dos excepciones: los valores de enum no se retiran, y `down()` de la anulación se niega a ejecutarse si hay casos anulados.

### Contratos para la interfaz (Antigravity)

**`POST /api/v1/situations/:id/cancellation`** (permiso `SITUATIONS_CANCEL`)

- Cuerpo: `{ "reason": "10..1000 caracteres tras recortar" }`.
- Respuesta 201: el detalle de la situación, con `status: "CANCELLED"` y `cancellation: { reason, previousStatus, cancelledByUserId, cancelledByUserName, cancelledAt }`.

| Código | Cuándo |
|---|---|
| 400 | Motivo inválido |
| 403 | Rol distinto de ADMIN o sin el permiso |
| 404 | La situación no existe |
| 409 `SITUATION_ALREADY_CANCELLED` | Ya estaba anulada |
| 409 `SITUATION_CLOSED` | Está cerrada |

**`POST /api/v1/situations/:id/coordination-transfer`** (permiso `SITUATIONS_TRANSFER`)

- Cuerpo: `{ "toCoordinationId": "uuid", "reason": "10..1000", "expectedCurrentCoordinationId"?: "uuid" }`.
- Respuesta 201: el detalle actualizado.

| Código | Cuándo |
|---|---|
| 400 `TRANSFER_SAME_COORDINATION` | El destino es la responsable actual |
| 400 `TRANSFER_DESTINATION_INACTIVE` | El destino está inactivo |
| 400 `TRANSFER_DESTINATION_IS_AFFECTED` | En un INTER, el destino es la afectada |
| 403 | Rol distinto de ADMIN o sin el permiso |
| 404 | No existe la situación o el destino |
| 409 `COORDINATION_CHANGED` | La responsable cambió desde la consulta |
| 409 `SITUATION_CLOSED` / `SITUATION_CANCELLED` | El caso está cerrado o anulado |

**Campos aditivos en el detalle y el listado:**
- `cancellation` (o `null`).
- `canCancel` y `canTransfer`: pistas solo para ADMIN.
- `canUpdate` pasa a ser falso en casos cerrados o anulados.

**Listado:** `GET /situations` excluye las anuladas por defecto, también en «mis reportes». Se consultan con `status=CANCELLED`.

**Overview:** campos aditivos `coordinations[].cancelledCount` y `cancelledTotal`. Son solo informativos.

**Sobre un caso anulado,** cualquier escritura responde 409 `SITUATION_CANCELLED`: PATCH, avance, resolución, afectación, evidencia, recomendación y análisis IA.

### Reglas y efectos

- **Anulación:**
  - Desde OPEN, IN_PROGRESS o RESOLVED (legado).
  - No borra nada: autor, fechas, historial, afectaciones, recomendaciones y análisis se conservan y quedan congelados.
  - No fija `closed_at`.
  - Se excluye de cartas, vidas, integridad, vencimientos y de todos los KPIs (carga, antigüedad, movimiento, recurrencia, relaciones, resolución, aprendizajes), en todos los periodos.
- **Traslado:**
  - INTERNAL mueve responsable y afectada a la vez; sigue siendo INTERNAL, no se convierte en INTER. INTER mueve solo la responsable.
  - Se conservan autor, fechas, severidad, `due_at`, estado y persona asignada.
  - Efectos:
    - overview/cartas usan la responsable actual; los KPIs temporales atribuyen por la responsable **en la fecha** del evento o corte (historial de traslados);
    - las afectaciones viajan con el caso;
    - el coordinador anterior deja de verlo, salvo que sea su autor o el de la afectada;
    - el nuevo puede avanzarlo y resolverlo.
- **Concurrencia:** anulación, traslado, PATCH, resolución, afectaciones y evidencias bloquean la misma fila.
- **Auditoría obligatoria e inmutable:**
  - Cubre alta, avance, edición, resolución, anulación, traslado, afectaciones, evidencias (alta y borrado), usuarios (alta, rol, estado, coordinación, perfil) y análisis IA completado.
  - Se escribe en la misma transacción que la acción: si falla, la acción no se confirma.
  - Guarda valores anterior y nuevo, longitudes en vez de textos, y nunca prompts.

### Decisiones de producto pendientes (no se inventó política)

1. **¿Se puede anular un caso CLOSED?** Hoy no (409). Alternativas: permitirlo dejando su aprendizaje fuera de los KPIs, o anularlo solo antes de N días.
2. **Traslado de un caso IN_PROGRESS.** Vuelve a OPEN, retira la asignación anterior y conserva ambos valores en el historial administrativo.
3. **Recomendaciones de casos CLOSED.** Siguen siendo editables (solo se congelaron las de casos anulados).
4. **Borrado de evidencias.** Sigue siendo físico, aunque ahora queda auditado y solo en casos activos. Alternativa: borrado lógico.

### Protección del historial en producción

`1788700000000` no requiere roles adicionales (simplificada el 2026-11-13): los triggers rechazan UPDATE/DELETE/TRUNCATE sobre `audit_logs`, `situation_cancellations` y `situation_coordination_transfers` para cualquier usuario que no los deshabilite explícitamente. El usuario de la aplicación es dueño de esas tablas, así que podría deshabilitarlos de forma deliberada; la protección cubre errores de la aplicación y borrados accidentales, no credenciales comprometidas.

Endurecimiento posterior (opcional, infraestructura): propietario `NOLOGIN` separado y rol de aplicación sin propiedad, con SELECT/INSERT sobre el historial.

Verificación tras migrar (solo lectura):

```sql
SELECT tgrelid::regclass AS tabla, tgname, tgenabled
FROM pg_trigger
WHERE tgname LIKE 'trg_%_immutable_%'
ORDER BY 1, 2;
```

Criterio de paso: seis triggers (`_immutable_rows` y `_immutable_truncate` por tabla) con `tgenabled = 'O'`.

### Pendiente técnico

- **Auditoría fuera de alcance 01B.1:** login; recomendaciones manuales (obsoletas); fallos de IA (observacional).
- **Atribución histórica:** KPIs temporales usan traslados; no reconstruyen categoría ni tipo de reporte.
- **Endpoint de consulta de auditoría:** no existe (solo BD).
- **Frontend (pendiente de producto):** no hay UI de anulación ni traslado; contratos HTTP y pistas `canCancel` / `canTransfer` ya expuestos por el backend.

## IA, indicadores y consistencia de datos (Fase 01B.2) — **cerrada en código**

Backend `refactor/novex-consolidacion` (commits `1cdd00e`…), frontend `6e71c0b`, `e38bca1`. Sin desplegar; migraciones `1788800000000` y `1788900000000` **no** ejecutadas en ninguna base existente.

### IA: sugiere, no decide

- **Integridad (integrity-mvp-v1):** la regla `IMPACT_PROPAGATION` (≥3 coordinaciones) cuenta solo hechos confirmados: coordinaciones relacionadas declaradas por quien reporta (`situation_related_coordinations`) y la afectada de dependencias INTER activas, sin la dueña. Las coordinaciones que propone Gemini (`situation_affected_coordinations`) **no** alimentan integridad, vidas ni indicadores. Umbrales sin cambios.
- `GET /situations/:id/impact/affected-coordinations` marca la lista y cada ítem como `origin: 'AI_SUGGESTION'`, `isSuggestion: true`, `countsForIntegrity: false` (aditivo).
- El análisis IA no cambia coordinación, estado ni severidad del caso (verificado: ningún camino del orquestador escribe esas columnas). Un caso `CLOSED`, `CANCELLED` o `RESOLVED` no se analiza (409).

### Privacidad del prompt (política `context-min-v1`)

| Antes | Ahora |
|---|---|
| `createdBy` con id, nombre y correo | `reporter.coordinationCode` |
| Línea de tiempo con autor y `metadata` (incluía `claimToken`) | tipo, título, descripción y fecha |
| Evidencias con nombre de archivo y autor; incluía retiradas | tipo, título, descripción, mime, tamaño, fecha; solo activas |
| Recomendaciones con persona asignada | `hasAssignee` |
| `JSON.stringify(context)` completo, con ids internos | lista blanca `toPromptDossier`, catálogos por código |
| Expediente sin delimitar | entre `<<<EXPEDIENTE_NO_CONFIABLE>>>`; el sistema ordena no obedecer instrucciones internas |
| 120k caracteres: solo aviso | límite duro 120.000 caracteres / 256 KiB antes del proveedor: 422 `PROMPT_TOO_LARGE` |

- Textos libres redactados (`redactPersonalData`): correos, teléfonos y documentos (≥7 dígitos), JWT, `Bearer`, `token=`/`password:`. **Limitación:** un nombre propio escrito dentro del relato no se detecta.
- **Todo** valor dinámico (relatos, catálogos de categorías y coordinaciones, códigos, análisis previo) pasa por `sanitizePromptText` / `sanitizeCatalogText` (redacción, sin caracteres de control, marcadores `<<<`/`>>>` neutralizados; catálogos en una línea y ≤300 caracteres). Fuera del bloque no confiable solo se enumeran códigos con forma de código (`isSafeCatalogCode`); nombres y descripciones de catálogo van dentro del expediente.
- La interpretación de registro (`/intelligence`) aplica la misma redacción, delimitación y límite; área reportante y catálogos también van dentro del bloque.
- `POST /situations/:id/analyze`: el prompt fuera de límites responde **422** `PROMPT_TOO_LARGE` (no 503); la indisponibilidad del proveedor sigue en 503. El mensaje de errores internos no HTTP no llega al cliente ni a la línea de tiempo `AI_ANALYSIS_FAILED`.
- `GET /situations/:id/analysis/history/:version`: `promptSnapshot` solo para **ADMIN**; el resto recibe `null` y `promptSnapshotWithheld: true`. Auditoría del análisis con `contextPolicy`.
- Los `prompt_snapshot` **anteriores** a esta fase pueden contener datos personales: no se tocaron.

### Retención del historial IA (diseño, sin ejecución)

`AI_PROMPT_SNAPSHOT_RETENTION_DAYS` y `AI_SESSION_RETENTION_DAYS` (vacías = indefinida; mínimo 30). `ai-retention.policy.ts` solo calcula elegibilidad (`enforcementEnabled: false`): **ningún proceso borra ni vacía datos**. Aplicarla al historial existente exige una migración específica y autorizada; propuesta: vaciar `prompt_snapshot` (nunca la sesión ni su resultado) de snapshots previos a `context-min-v1` con más de N días, y conservar sesiones de casos activos.

### Recomendaciones y evidencias

- Toda escritura manual de recomendaciones (`PATCH /recommendations/:id`, completar, crear) se confirma con la situación `FOR SHARE` y solo si es `OPEN`/`IN_PROGRESS`: 409 `SITUATION_CLOSED` / `SITUATION_CANCELLED`. Lectura histórica intacta.
- **Retiro de evidencias** (sin borrado físico): `POST /situations/:id/evidences/:evidenceId/retirement` `{ reason }` (10–1000), permiso `SITUATIONS_UPDATE` + alcance de operación, caso activo; 409 `EVIDENCE_ALREADY_RETIRED`. `DELETE` se conserva por compatibilidad: **retira** y exige el mismo `reason`. Auditoría obligatoria `SITUATION_EVIDENCE_RETIRED` y evento `ATTACHMENT_RETIRED`, sin el texto del motivo.
- `GET /situations/:id/evidences` devuelve solo activas; `?includeRetired=true` devuelve el historial (con `retirement`) y exige poder operar el caso o ser ADMIN. Respuesta aditiva: `status: 'ACTIVE' | 'RETIRED'`, `retirement`.
- `GET /situations/:id/evidences/:evidenceId`: una activa exige leer el caso; una **retirada** exige el mismo permiso que `includeRetired` y, sin él, responde 404 igual que una inexistente (sin estado ni motivo). La regla vive en `SituationEvidenceService` (no solo en el controlador).
- En base: CHECK todo-o-nada con motivo no nulo; trigger que hace definitivo el retiro.

## Pruebas destructivas

Solo contra una base desechable **marcada** y declarada en la invocación. La guarda central del backend (`test/support/disposable-database.guard.ts`) aborta antes de cualquier SQL en cualquier otro caso. Procedimiento en `NOVEX_BACKEND/CLAUDE.md` §«Pruebas destructivas». Motivo: incidente del 2026-11-09 (ver `NOVEX-FASE-01-AUDITORIA-TECNICA.md` §1.2).

## Reglas operativas

- No remontar controllers latentes sin PermissionsGuard.
- No activar `ENABLE_EMAIL_LOGIN` fuera de local.
- No ejecutar `migration:*` / `cloud:*` / seeds contra Cloud SQL sin autorización.
- **Fase 01B.1:** no aplicar `17883*`–`17887*` en Cloud SQL hasta roles `NOLOGIN`/aplicación/migrador verificados (sección anterior).
- **Fase 01B.2:** `1788800000000` (normalización RESOLVED) y `1788900000000` (retiro de evidencias) siguen la misma puerta; ejecutar antes la consulta de solo lectura de `despliegue-y-operacion.md`.
- Spec A2/M1 también en `.backups/fase00b-20261109/NOVEX_BACKEND/a2-m1-spec/` y `docs/archivo/empalme-20261106/backend/`.
