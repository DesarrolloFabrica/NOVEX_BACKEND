# NOVEX — Fase 01: Auditoría técnica integral

**Fecha:** 2026-11-09
**Código auditado:** `NOVEX_BACKEND` @ `c63f3f8` y `NOVEX_FRONTEND` @ `21eb4a0`, ambos en `refactor/novex-consolidacion`.
**Producción de referencia:** BE `5ffc65f` / FE `b726c47` (tag `novex-circo-prod-20261027`).
**Alcance:** solo diagnóstico. No se modificó código, no hubo commits, migraciones, seeds, Cloud SQL ni llamadas a Gemini. Solo se ejecutaron pruebas unitarias locales sin base de datos.
**Documentos previos:** [NOVEX-FASE-00-DIAGNOSTICO.md](./NOVEX-FASE-00-DIAGNOSTICO.md), [seguridad-fase0-detalle.md](./seguridad-fase0-detalle.md), [EMPALME-NOVEX.md](./EMPALME-NOVEX.md). Este documento no los repite: los contrasta y añade lo nuevo.

**Nivel de evidencia de cada hallazgo**

| Marca | Significa |
|---|---|
| **[E]** | Confirmado **ejecutando** algo en esta sesión (prueba, compilación, comando de solo lectura). |
| **[L]** | Confirmado **leyendo el código** (con archivo y línea). El comportamiento se deduce sin ambigüedad, pero no se reprodujo. |
| **[R]** | **Riesgo potencial**: depende de datos, configuración o tiempos que no se pudieron observar. |
| **[D]** | **Decisión de producto pendiente**: el código hace algo coherente, pero no está claro que sea lo que la institución quiere. |

**Ningún hallazgo es una vulnerabilidad explotada.** No se hizo ninguna prueba de explotación contra un entorno real.

---

## 1. Resumen ejecutivo

**Valoración general: buena base, aún no lista para uso institucional sin una etapa de correcciones.**

NOVEX tiene un núcleo bien diseñado: autorización releída de la base en cada petición, resolución atómica con bloqueo, alta idempotente, historial de severidad inmutable, indicadores calculados al leer y políticas versionadas que fallan cerradas (`DESCONOCIDO`, nunca `ESTABLE` por defecto). Las 880 pruebas unitarias del backend pasan, y el frontend compila y pasa lint.

Los problemas no están en el diseño general, sino en **los bordes**: rutas de escritura que usan la puerta de lectura, un `PATCH` demasiado permisivo y sin protección frente a concurrencia, indicadores alimentados por fuentes distintas, una IA cuya salida puede mover el estado de una carta, y una cadena de despliegue sin pruebas en PR ni migraciones.

**Lo más importante:**

1. **Producción sigue expuesta a A1**, y el código de consolidación aún tiene **A2** y **M1** abiertos. M1 es más amplio de lo documentado: un ANALISTA puede relanzar el análisis IA de **cualquier** caso, incluido uno cerrado.
2. **El `PATCH /situations/:id` es el punto más frágil del sistema**: permite reasignar la coordinación responsable (N1), editar casos cerrados (O2), mezclar el avance con otras ediciones (O1) y, por no usar transacción ni bloqueo, **puede deshacer un cierre concurrente** (hallazgo nuevo F-01).
3. **La salida de Gemini puede poner una carta en CRÍTICO** (regla «≥3 coordinaciones afectadas»), y el prompt incluye el correo del autor, que queda guardado sin plazo y visible para todos los roles.
4. **Los indicadores no siempre cuentan lo mismo**: el estado legado `RESOLVED` es activo en unos cálculos y no en otros, la explicación que ve el DIRECTOR aplica reglas equivocadas y el panel del coordinador recalcula conteos que el backend ya da.
5. **Operación**: un push a `main` despliega sin pruebas en PR y sin migraciones; las semillas de arranque y el CLI de migraciones no se protegen frente a `DB_CLOUD=true`.

En el frontend, los contratos con el backend coinciden sin desajustes, pero la **sesión** es frágil: la interfaz decide con permisos del JWT aunque tenga los vigentes, cierra la sesión ante cualquier error de red al recargar, y la caducidad a la hora borra el aprendizaje que se estaba escribiendo.

**Los 21 tests fallidos del frontend no son un fallo del producto**: Node 26 define un `localStorage` global experimental que tapa el de jsdom. Con `--no-experimental-webstorage` pasan los 22 tests de esos dos archivos [E].

### 1.1 Estado tras la Fase 01A (2026-11-09, backend `refactor/novex-consolidacion`, sin desplegar)

| Id | Estado | Commit | Pruebas |
|---|---|---|---|
| S-A1 | Revalidado (sin cambios de código; matriz ajustada a A2) | — | `a1-recommendations-scope.spec.ts` |
| S-A2 | **Corregido**: 403 `COORDINATION_REQUIRED` en listado (todos los modos), 404 en detalle | `485476c` | unitarias + matriz HTTP |
| S-M1 | **Corregido** con las decisiones aprobadas: ANALISTA analiza cualquier caso activo; COORDINADOR solo su responsable; recomendaciones manuales exigen operar; 409 en cerrados, también ante cierre concurrente | `485476c` | matriz HTTP (98 casos), unitarias, PostgreSQL |
| F-01 | **Corregido**: PATCH en transacción con `pessimistic_write` | `8be4415` | unitarias + PostgreSQL (bloqueo real) |
| S-N1, S-N2 | **Corregidos**: el PATCH no reasigna la coordinación (403) | `8be4415` | unitarias + PostgreSQL |
| S-O1 | **Corregido**: avance + otros campos → 400 | `8be4415` | unitarias |
| S-O2 | **Corregido**: CLOSED inmutable → 409 | `8be4415` | unitarias + PostgreSQL |
| F-02 (parcial) | **Corregido en el alta**: un COORDINADOR solo registra INTER con afectada = la suya. La anulación sigue pendiente (D5) | `b28026f` | unitarias |
| OP-02 | **Corregido**: semillas de arranque, usuario de desarrollo, CLI de migraciones y `seed:rbac` protegidos (incluido el socket `/cloudsql/`) | `3597622` | unitarias |

Correcciones finales tras la revisión de Codex:

| Tema | Estado | Commit |
|---|---|---|
| A2 en `GET /operational-overview` | **Corregido**: 403 `COORDINATION_REQUIRED` antes de consultar; integridad y vidas sin cambios para los demás roles | `9d76a8e` |
| Guarda de pruebas destructivas | **Nueva**: autorización explícita, destino declarado y marca de base desechable antes de cualquier SQL | `0456f9c` |
| `phase2-http` (15 fallos) y 28 errores de TypeScript en pruebas | **Corregidos** sin dar permisos nuevos a ADMIN; integración del reclamo IA reescrita al contrato vigente | `dd88532` |

Pendientes de esta lista (post-01B.1): IA-01/IA-02, K-01…K-03 (parcialmente cubiertos por atribución histórica de traslados), AU-01 (login/recomendaciones/consulta), OP-01/OP-03, FE-01…FE-04 (incluye UI de anulación/traslado) y los P2. Anulación y traslado administrativo: **cerrados en código** (sin desplegar).

**Fase 01B.2 (cerrada en código, sin desplegar):** IA-01/IA-02 (la IA no alimenta la integridad; prompt minimizado, no confiable y con límite duro; `promptSnapshot` solo ADMIN), K-01 (regla de Dirección desde el backend), K-02 (población compartida: RESOLVED sin fecha no activo; barrido SLA sin RESOLVED), K-03 (panel del coordinador con conteos oficiales), K-06 (INTER consigo misma = propia), D8 (migración RESOLVED → CLOSED con pendientes explícitos), recomendaciones congeladas en casos cerrados y retiro de evidencias. Detalle en [seguridad-y-permisos.md](seguridad-y-permisos.md) §«Fase 01B.2». Siguen pendientes: AU-01, OP-01/OP-03, FE-01…FE-04, K-04/K-05/K-07, P2 y la aplicación de la retención (D7).

### 1.1b Estado tras la Fase 01B.1 (2026-11-09) — **cerrada en código, sin desplegar**

**Tip local BE:** `refactor/novex-consolidacion` @ `2bdf12f` (ahead de `origin`; **no** merge a `main` / Cloud SQL).  
**Cierre Codex:** `119ea7b` · `2f38cdb` · `a718cd7` · `0d18545` · `2bdf12f`.  
**Pruebas del cierre:** 1.158 unitarias + 61 PostgreSQL.

| Id | Estado | Commit |
|---|---|---|
| F-02 (anulación) | **Implementada**: ADMIN anula con motivo; anuladas fuera de indicadores; conteo aparte | `20d431d`, `957cce3` |
| N1 (traslado administrativo) | **Implementado**: ADMIN traslada con motivo, bloqueo y auditoría; `IN_PROGRESS` reabre a `OPEN` | `9bcd89d`, `a718cd7` |
| Historial / privilegios | **Endurecido**: tablas administrativas sin UPDATE/DELETE/TRUNCATE por triggers (la separación de propietario `NOLOGIN` se retiró el 2026-11-13) | `119ea7b`, `1788700000000` |
| Escalamiento | Auditoría de severidad **transaccional** con historial/timeline | `2f38cdb` |
| KPIs / atribución | Indicadores temporales atribuyen por responsable **histórica** vía traslados | `0d18545`, `957cce3` |
| AU-01 | **En gran parte corregido**. Auditoría obligatoria en la TX de acciones críticas; `audit_logs` sin UPDATE/DELETE. Pendiente: login, recomendaciones, endpoint de consulta | `546fbe3`, `5690971`, `2f38cdb` |
| S-O2 (evidencias) | Alta y borrado solo en casos activos | `546fbe3` |
| Invariantes PG | Suites de historial, traslado e institucionales | `811797c`, `2bdf12f` |

**Despliegue / Cloud SQL:** sin roles adicionales desde el 2026-11-13; backup, `migration:show` y autorización antes de `migration:run` de `17883*`–`17887*`. Detalle: [seguridad-y-permisos.md](seguridad-y-permisos.md) y [despliegue-y-operacion.md](despliegue-y-operacion.md).  
**Pendiente frontend:** UI de anulación y traslado (contratos HTTP ya listos).  
Contratos y decisiones de producto: [seguridad-y-permisos.md](seguridad-y-permisos.md) §«Anulación, traslado y auditoría».

### 1.2 Incidente 2026-11-09: truncado de la base local `novex_local_snapshot_20261028`

**Qué pasó.**
- Codex ejecutó `test/phase2-http.e2e-spec.ts` sin sobrescribir el `.env` de desarrollo. Ese `.env` apunta por defecto a `novex_local_snapshot_20261028` en `novex-postgres:5442` y tiene `CATALOG_SEED_ON_BOOT=true`.
- La prueba ejecuta `TRUNCATE situation_resolutions, situation_timeline_entries, situations, coordinations, incident_categories, audit_logs RESTART IDENTITY CASCADE` y `DELETE FROM users WHERE email LIKE '%@t.co'`.
- Ocurrió a las 18:48 UTC: es la hora de alta de las filas de fixture que quedaron.

**Investigación.** Solo lectura, en sesiones con `default_transaction_read_only=on`, mostrando únicamente conteos, códigos de catálogo y fechas.

**Daños confirmados.** Se vaciaron por el `CASCADE`. Hoy solo contienen fixtures de la prueba, creados a las 18:48 UTC.

| Tabla | Antes | Hoy |
|---|---|---|
| `coordinations` | 15 del catálogo | 2: `coord-a`, `coord-b` |
| `incident_categories` | Catálogo | 1: `TECH` |
| `users` | Todos los usuarios | 4 fixtures `@t.co` |
| `situations` | 202 insertadas según las estadísticas | 3 |
| `audit_logs` | — | 3 entradas `SITUATION_CREATED` |

También se vaciaron por cascada, sin filas propias de la prueba:
- `situation_timeline_entries`, `situation_resolutions`, `situation_severity_changes` y `situation_consequences`;
- `situation_evidences`, `situation_impact_assessments`, `situation_affected_coordinations` y `situation_recommendations`;
- `situation_related_coordinations` y `coordination_dependencies`.

**Intacto.**
- `roles`, `permissions`, `role_permissions`, `typeorm_migrations` (26) y `operational_areas`.
- `situation_analysis_sessions` y `situation_ai_analysis_records`, con 64 filas cada una. Sobreviven porque no tienen clave foránea a `situations` (hallazgo IA-02). Hoy están **huérfanas** y conservan prompts con datos personales.
- La otra base local, `novex` (datos de agosto), y Cloud SQL, que no se tocó.

**Daños posibles, no verificables.**
- Las semillas de arranque pudieron reescribir `role_permissions`. Hoy tiene 37 asignaciones, con 0 borrados registrados.
- Se desconoce si la snapshot tenía datos únicos que no existan ya en producción.

**Recuperación (no ejecutada).**
- **Local:** no es posible. `archive_mode=off`, así que no hay WAL para recuperar a un instante anterior, y el `TRUNCATE` libera los ficheros al confirmar. Tampoco existe un volcado de esta snapshot: solo hay dos de agosto (`.backups/novex-20260804-121941/`), anteriores a Cartas y Circo.
- **Opción A, recomendada:** volver a crearla desde su origen, Cloud SQL. Se haría con un `pg_dump` de solo lectura hacia una base local **nueva** (por ejemplo `novex_local_snapshot_20261109`), sin sobrescribir la dañada. Requiere autorización de acceso a producción y tratar los datos personales.
- **Opción B:** restaurar un backup automático de Cloud SQL del 28-oct en una instancia temporal, siguiendo `RESTORE-TEST.md`. Probablemente ya no exista por la retención y requiere autorización.
- **Opción C:** usar `novex` para desarrollo local mientras tanto. No es equivalente.
- Las 64 sesiones de IA huérfanas permiten reconstruir parcialmente el texto de esos casos, pero no son una fuente de restauración, y su contenido incluye datos personales.

**Pendiente de decisión.** Reconstruir o retirar la snapshot dañada, y apuntar el `.env` de desarrollo a una base que no contenga datos reales. El `.env` no se modificó.

**Medida tomada.** La guarda central impide que se repita (ver §1.1).

---

## 2. Estado técnico real

| Área | Estado | Comentario |
|---|---|---|
| Autenticación (Google + JWT) | **Bien, con endurecimientos pendientes** | Audiencia y `email_verified` comprobados; usuario releído en cada petición. Falta fijar algoritmo, exigir longitud del secreto, comprobar dominio `hd`, y un bloqueo fuerte de `ENABLE_EMAIL_LOGIN` en producción. |
| Autorización por rol y alcance | **Regular** | Modelo correcto (404 fuera de alcance, 403 sin propiedad), pero con 4 rutas de escritura mal protegidas (A2, M1 ×2, N1/O1). |
| Ciclo de situaciones | **Bien en alta y cierre; débil en edición** | Alta y resolución son transaccionales e idempotentes. El `PATCH` no lo es. No existe forma de anular un reporte erróneo. |
| IA (Gemini) | **Técnicamente sólida, funcionalmente sin dueño** | Reclamo con lease y escritura protegida. Pero no hay interfaz en el frontend, su salida mueve la integridad y su privacidad no está resuelta. |
| Indicadores | **Lógica de dominio buena; integración incoherente** | Las funciones puras están probadas. Las consultas SQL de overview y KPIs no tienen pruebas contra PostgreSQL, y es ahí donde están las divergencias. |
| Auditoría | **Insuficiente para uso institucional** | Se escribe fuera de la transacción, traga errores, no es inmutable y no cubre login, borrado de evidencias ni cambios de coordinación de usuarios. |
| Frontend | **Compila y pasa lint** | Ver §3 y §5.4 para los problemas de presentación de indicadores y sesión. |
| Pruebas | **Muchas, pero casi todas con mocks** | 880 unitarias BE y 1 479 FE. Sin pruebas de integración ejecutables por defecto; una de las existentes está desfasada y no compila. |
| Despliegue | **Riesgoso** | Sin CI en PR, sin migraciones en el despliegue, dos vías (Actions y Cloud Build) que se comportan distinto, Node 20 fuera de soporte. |

---

## 3. Hallazgos ordenados por impacto

### 3.1 Índice

| Id | Prioridad | Evidencia | Problema (en una línea) |
|---|---|---|---|
| **S-A1** | **P0** | [E] git | El IDOR de `/recommendations/:id` sigue en producción |
| **S-A2** | **P0** | [L] | COORDINADOR sin coordinación lista todas las situaciones |
| **S-M1** | **P0** | [L] | `analyze` y `POST …/recommendations` escriben con permiso de lectura, incluso en casos cerrados |
| **F-01** | **P1** | [L] + ORM | Un `PATCH` concurrente puede reabrir un caso recién cerrado o borrar marcas del barrido y del análisis |
| **S-N1** | **P1** | [L] | ANALISTA autor reasigna la coordinación a `coord-general` y luego resuelve |
| **S-O1** | **P1** | [L] | El avance a «En atención» permite editar otros campos sin permiso de edición |
| **S-N2** | **P1** | [L] | Un INTER puede quedar con responsable = afectada |
| **F-02** | **P1** | [L] [D] | Cualquiera con permiso de crear puede registrar un INTER CRÍTICO entre dos áreas ajenas, sin forma de anularlo |
| **IA-01** | **P1** | [L] | La salida de Gemini decide la regla «≥3 coordinaciones afectadas» y puede poner una carta en CRÍTICO |
| **IA-02** | **P1** | [L] | El prompt incluye correo, nombres y metadatos internos; se guarda sin plazo y lo leen los 4 roles |
| **K-01** | **P1** | [L] | La explicación de integridad del DIRECTOR usa las reglas de coordinación sobre sumas globales |
| **K-02** | **P1** | [L] | El estado legado `RESOLVED` es activo en el barrido y en KPIs, e inactivo en cartas, vidas e integridad |
| **K-03** | **P1** | [L] | El panel del coordinador recalcula sus conteos con otra población y los presenta como totales |
| **AU-01** | **P1** | [L] | La auditoría puede perderse en silencio, no es inmutable y tiene huecos |
| **OP-01** | **P1** | [L] [H] | Push a `main` despliega sin pruebas en PR y sin migraciones |
| **OP-02** | **P1** | [L] | Semillas de arranque y CLI de migraciones pueden actuar sobre Cloud SQL sin barrera |
| **OP-03** | **P1** | [L] | Cloud Build reemplaza todas las variables y deja `localhost` en CORS de producción |
| **FE-01** | **P1** | [L] | La interfaz usa permisos y coordinación del JWT (hasta 1 h desactualizados) aunque `/auth/me` da los vigentes |
| **FE-02** | **P1** | [L] | Cualquier error al recargar la página (red, 5xx, arranque en frío) cierra la sesión |
| **FE-03** | **P1** | [L] | La sesión caduca a la hora sin aviso y se pierde el aprendizaje que se estaba escribiendo |
| **FE-04** | **P1** | [L] | Un marcador antiguo a `/centro-operacional/panorama` (y similares) lanza una carga masiva de peticiones |
| *(P2)* | P2 | — | 34 hallazgos menores en §3.4 |

---

### 3.2 P0 — corregir primero

#### S-A1 · IDOR en recomendaciones, todavía en producción

- **Problema:** en producción, quien conozca el identificador de una recomendación puede leerla y modificarla aunque pertenezca a otra coordinación.
- **Dónde:** `NOVEX_BACKEND/src/situation-recommendations/situation-recommendations.controller.ts` en `origin/main`.
- **Evidencia [E]:** `git merge-base --is-ancestor ce8c5ad origin/main` → falso. La corrección está en `refactor/novex-consolidacion` (ancestro `72e24fe`) y su suite `test/security/a1-recommendations-scope.spec.ts` (14 casos) pasa en esta sesión.
- **Impacto:** lectura y alteración de recomendaciones entre coordinaciones. El frontend no usa este endpoint, así que corregirlo no rompe nada visible.
- **Corrección:** llevar A1 a `main` en la primera ventana de despliegue autorizada.
- **Pruebas:** reejecutar `test/security/` antes del merge; smoke de login, listado y detalle por rol tras desplegar.
- **Dependencias:** autorización de despliegue; verificar antes que las migraciones de producción están al día (OP-01).

#### S-A2 · Listado sin filtro para un COORDINADOR sin coordinación

- **Problema:** si a un coordinador le falta la coordinación asignada (el campo es anulable), el listado le devuelve todas las situaciones de la institución.
- **Dónde:** `NOVEX_BACKEND/src/auth/services/operational-scope.service.ts:67-79` → `src/situations/situations.service.ts:626-633` → `src/situations/repositories/situations.repository.ts:118-123` (solo filtra si hay `coordinationId`).
- **Evidencia [L]:** `resolveSituationListCoordinationId` devuelve `undefined` para un COORDINADOR sin coordinación; `undefined` significa «sin filtro». El detalle sí falla cerrado (`assertSituationInScope`, L87-93).
- **Impacto:** un error de configuración en `/admin` expone títulos, descripciones, autores y estados de todas las áreas.
- **Corrección:** fallar cerrado (spec en `seguridad-fase0-detalle.md` §3: `own-only` o 403). El código de la corrección se perdió con los worktrees; hay que reimplementarlo.
- **Pruebas:** unitaria del servicio + una prueba contra PostgreSQL con un coordinador sin coordinación.
- **Dependencias:** ninguna de producto; confirmar con el frontend cómo se presenta `scope: 'own-only'`.

#### S-M1 · Escrituras protegidas con la puerta de lectura

- **Problema:** dos acciones que **modifican** datos solo comprueban que el usuario pueda **leer** el caso.
- **Dónde:**
  - `POST /situations/:id/analyze` → `NOVEX_BACKEND/src/ai-orchestration/ai-orchestration.controller.ts:78-87`.
  - `POST /situations/:id/recommendations` → `src/situation-recommendations/situation-recommendations.controller.ts:52-67`.
- **Evidencia [L]:** ambas llaman a `requireAccessibleSituation`. La lectura admite al autor, al coordinador de la coordinación **afectada** y a cualquier rol sin alcance de coordinación (`operational-scope.service.ts:126-155`). `AIOrchestrator.execute` y `claimAnalysis` nunca consultan el estado (`ai-orchestrator.service.ts:186-198, 472-495`).
- **Alcance real, mayor que el documentado:**
  - un **ANALISTA puede analizar cualquier caso** de la institución, **incluidos los cerrados**;
  - un COORDINADOR puede analizar y añadir recomendaciones en casos donde su área solo es la **afectada**, o en reportes suyos alojados en otra área;
  - cada análisis **reemplaza** la evaluación de impacto, añade recomendaciones, escribe en la línea de tiempo y gasta cuota de Gemini;
  - por IA-01, un análisis puede cambiar el estado de integridad de la carta de **otra** coordinación.
- **Impacto:** modificación horizontal entre coordinaciones, alteración de indicadores y coste.
- **Corrección:** `requireOperableSituation` en ambas rutas; 409 `SITUATION_CLOSED` en casos cerrados, comprobado **antes** del reclamo y **dentro** de la escritura protegida (`assertClaimHeld`), porque hoy un análisis puede confirmarse después de un cierre.
- **Pruebas:** matriz por rol (4 roles × INTERNAL/INTER × autor/no autor × abierto/cerrado), y la carrera «cierre durante el análisis».
- **Dependencias:** **decisión D1** (¿un ANALISTA analiza solo sus casos, los de `coord-general` o todos?). La parte que no depende de la decisión (coordinador afectado, casos cerrados) puede corregirse ya.

---

### 3.3 P1 — corregir en la etapa siguiente

#### F-01 · `PATCH` sin transacción ni bloqueo: puede deshacer un cierre (nuevo)

- **Problema:** editar o avanzar un caso no bloquea la fila. Si otra operación (resolver, barrido SLA o análisis IA) la cambia en ese intervalo, el `PATCH` puede escribir encima los valores viejos.
- **Dónde:** `NOVEX_BACKEND/src/situations/situations.service.ts:696-872`. Lee en L701 (sin bloqueo), hace varias consultas y guarda en L813 con `repository.save(situation)`.
- **Evidencia [L]:** TypeORM 0.3.27, al guardar, **vuelve a leer la fila y escribe toda columna que difiera** de la copia en memoria (`node_modules/typeorm/persistence/SubjectDatabaseEntityLoader.js:80-94`). La copia en memoria trae `status`, `closedAt`, `slaBreachedAt`, `lastSlaReminderAt` y `analysisClaimToken` del momento de la lectura. Si `resolve()` confirma `CLOSED` entre ambos instantes, el `PATCH` devuelve `status` a `OPEN`/`IN_PROGRESS` y `closedAt` a nulo, dejando una fila en `situation_resolutions` para un caso «abierto». La línea de tiempo y la auditoría del `PATCH` tampoco comparten transacción con el cambio.
- **Contraste:** `resolve()` (L916-935) y `addConsequence` sí usan transacción + `pessimistic_write`. La prueba `test/phase21-concurrency.e2e-spec.ts` cubre resolver contra resolver, no `PATCH` contra resolver.
- **Impacto:** casos cerrados que reaparecen como activos (afecta vidas, integridad y KPIs), marcas SLA perdidas y, en el peor caso, un reclamo de análisis anulado. La ventana es de milisegundos, por lo que es raro, pero no imposible con dos personas actuando sobre el mismo caso. **No reproducido.**
- **Corrección:** ejecutar `update()` en una transacción con `pessimistic_write`, volver a comprobar estado y permisos dentro, y escribir solo las columnas tocadas (`manager.update` con un objeto parcial) en lugar de `save` de la entidad completa.
- **Pruebas:** e2e contra PostgreSQL: `PATCH` (avance y edición de título) en paralelo con `POST /resolution`; el caso debe terminar `CLOSED`.
- **Dependencias:** se corrige en el mismo bloque que N1, O1 y O2.

#### S-N1 · Un ANALISTA puede concederse la resolución

- **Problema:** el autor ANALISTA de un problema de otra coordinación puede cambiar la coordinación responsable a `coord-general` y, con eso, avanzarlo y resolverlo él mismo.
- **Dónde:** `situations.service.ts:722` (`assertCanUpdateSituation` admite al autor), `:753-769` (solo bloquea la reasignación a COORDINADOR), y `operational-scope.service.ts:328-358, 425-452`.
- **Evidencia [L]:** confirmado leyendo el código de consolidación; igual que en Fase 00. **No existe ninguna prueba** que lo cubra.
- **Impacto:** se elude la regla «solo el responsable soluciona». El cambio de coordinación también mueve el caso de una carta a otra (vidas, integridad, KPIs), y la auditoría solo guarda el **nombre** del campo cambiado, no el valor anterior ni el nuevo (`:858-869`); la línea de tiempo sí guarda ambos (subscriber, L140-145).
- **Corrección:** según **decisión D2**: prohibir la reasignación por `PATCH`, o limitarla y prohibir que el destino convierta al actor en quien resuelve. Registrar origen y destino en la auditoría.
- **Pruebas:** secuencia reasignar → avanzar → resolver para cada rol.

#### S-O1 · El avance sirve de vía para editar

- **Problema:** cuando un `PATCH` pasa de «Abierto» a «En atención», solo se comprueba el permiso de avance; el resto del cuerpo (título, descripción, fecha, coordinación) se aplica igual.
- **Dónde:** `situations.service.ts:711-723` y el bloque de campos L753-792.
- **Evidencia [L]:** un ANALISTA **no autor** de un caso OPEN de `coord-general` puede, en una sola petición, avanzarlo **y** reasignarlo a cualquier coordinación.
- **Impacto:** edición y reasignación sin el permiso de edición.
- **Corrección:** rechazar un `PATCH` que combine avance con otros campos, o aplicar también `assertCanUpdateSituation`.
- **Pruebas:** `PATCH {status, coordinationId}` y `PATCH {status, title}` por rol.

#### S-N2 · INTER con responsable igual a la afectada

- **Problema:** al reasignar la responsable de un INTER no se vuelve a comprobar que sea distinta de la afectada.
- **Dónde:** `situations.service.ts:753-769` (el alta sí lo valida en L324-328).
- **Evidencia [L].**
- **Impacto:** dependencias «de un área consigo misma». KPIs y overview tratan esas filas de forma distinta (ver K-06), así que el mismo caso cuenta distinto según la pantalla.
- **Corrección:** 400 con el mismo mensaje del alta.
- **Pruebas:** unitaria en `situations.service.spec.ts`.

#### F-02 · Registro INTER libre y sin vía de anulación (nuevo)

- **Problema:** cualquier usuario con permiso de crear puede declarar una dependencia INTER entre **dos coordinaciones que no son la suya**, con la severidad que elija. Un INTER CRÍTICO entrante pone la carta afectada en CRÍTICO de inmediato. No existe ningún estado de «anulado» ni de «duplicado», ni endpoint de borrado: un reporte equivocado solo desaparece si el coordinador responsable lo **soluciona escribiendo un aprendizaje**.
- **Dónde:** `operational-scope.service.ts:180-197` (`resolveCreateCoordinationId` acepta cualquier coordinación), `situations.service.ts:304-369`; estados en `situation-status.transitions.ts:7-15`.
- **Evidencia [L] [D]:** el propio código lo describe como deliberado; EMPALME §4.2 lo deja como decisión pendiente.
- **Impacto:** cualquier coordinador puede afectar la integridad y las vidas de dos áreas ajenas. Los reportes erróneos generan «aprendizajes» falsos que contaminan el KPI de aprendizajes.
- **Corrección:** decidir (**D4, D5**); como mínimo, exigir que la afectada sea la coordinación del actor cuando este es COORDINADOR, y añadir un estado `CANCELLED`/`DUPLICATE` fuera de los indicadores, con motivo y auditoría.
- **Pruebas:** matriz de alta INTER por rol; los indicadores excluyen los anulados.

#### IA-01 · La IA decide una de las reglas de CRÍTICO

- **Problema:** la regla de integridad «el caso afecta a 3 o más coordinaciones» se alimenta de las coordinaciones que **Gemini** propone en su análisis, no de datos declarados por personas.
- **Dónde:** `NOVEX_BACKEND/src/operational-overview/repositories/operational-overview.repository.ts:123-153` cuenta `situation_affected_coordinations`; esas filas las escribe el análisis (`src/ai-analysis/ai-analysis.service.ts:78-85`, `src/situation-impact/situation-impact.service.ts:243-295`); la regla `IMPACT_PROPAGATION` pone CRÍTICO (`src/operational-overview/domain/coordination-integrity.ts:71, 212-215`). El comentario de ese archivo dice «sin IA».
- **Evidencia [L].** El mapper solo filtra códigos que existan en el catálogo; no limita cuántos.
- **Impacto:** un modelo no determinista, y alimentado con texto de usuarios (riesgo de inyección en el prompt), puede cambiar el estado de una carta; un re-análisis puede cambiarlo otra vez. Como hoy no hay interfaz de IA, la regla depende sobre todo de análisis **históricos** de antes de Circo, lo que la hace aún menos explicable. El frontend, en cambio, muestra «impacto» con `relatedCoordinations` (otra fuente).
- **Corrección:** **decisión D6**. Opciones: excluir la propagación IA de las reglas de CRÍTICO, exigir confirmación humana, o basarla en INTER y coordinaciones relacionadas declaradas.
- **Pruebas:** un análisis con 5 coordinaciones no cambia la integridad (o lo hace con un tope documentado).

#### IA-02 · Datos personales en el prompt, guardados sin plazo

- **Problema:** el contexto enviado a Gemini incluye el **nombre completo, correo e id** del autor, nombres de quienes aparecen en la línea de tiempo, evidencias y recomendaciones, y los **metadatos crudos** de la línea de tiempo (incluido `claimToken`). Se guarda completo y se devuelve por API.
- **Dónde:** `NOVEX_BACKEND/src/ai-prompt-engine/builders/situation-context.builder.ts:69-74, 120-131`; `prompt.builder.ts:41` (`JSON.stringify` del contexto); `src/ai-analysis-sessions/ai-analysis-sessions.service.ts:40, 124-132` (guarda y devuelve `promptSnapshot`).
- **Evidencia [L]:**
  - `GET /situations/:id/analysis/history/:version` exige `AI_VIEW_REPORTS`, que tienen **los cuatro roles**, más alcance de lectura. Incluye al coordinador de la afectada, que no ve el correo del autor en ningún otro endpoint.
  - `situation_analysis_sessions` y `situation_ai_analysis_records` no tienen clave foránea a `situations` (`1785790534246-InitialSchema.ts:273-285`); `deleteBySituationId` existe pero nadie la llama. No hay retención.
- **Impacto:** tratamiento de datos personales por un tercero sin política declarada, y exposición interna innecesaria. **No se comprobó si hay filas en producción** (requiere consulta autorizada).
- **Corrección:** quitar correo e ids; enviar etiquetas de rol o coordinación en vez de nombres; no enviar metadatos; no devolver `promptSnapshot` (o solo a ADMIN); clave foránea con borrado en cascada y política de retención.
- **Pruebas:** el prompt no contiene `@` ni correos; autorización de `history/:version`.
- **Dependencias:** **decisión D7** (política de privacidad y retención).

#### K-01 · Explicación de integridad del DIRECTOR con reglas equivocadas

- **Problema:** la pantalla del DIRECTOR explica el estado de la Dirección aplicando las reglas **de una coordinación** a los totales de **todas**.
- **Dónde:** `NOVEX_FRONTEND/src/modules/operational-cards/experience/director/DirectorEstadoPanel.tsx:251-261` → `domain/integrity-policy.ts:119-190`. La regla real de la Dirección está en `NOVEX_BACKEND/src/operational-overview/domain/operational-direction-integrity.ts:72-120` (CRÍTICO con ≥2 coordinaciones críticas, etc.).
- **Evidencia [L]** (verificado en ambos archivos).
- **Impacto:** el DIRECTOR lee frases falsas, como «no hay problemas activos» con varias coordinaciones en alerta, o «hay 1 problema crítico» cuando el motivo real es otro. **Puede inducir decisiones equivocadas.**
- **Corrección:** que el backend devuelva las reglas que se activaron (`triggeredRules`) y el frontend solo las muestre.
- **Pruebas:** prueba de frontend por cada resultado de la Dirección; prueba de contrato del DTO.

#### K-02 · El estado legado `RESOLVED` cuenta distinto en cada sitio

- **Problema:** las filas antiguas en `RESOLVED`:
  - se **excluyen** de cartas, vidas e integridad (`coordination-integrity.ts:30-33`) y de la lista de la carta en el frontend (`coordination-problems.service.ts:26,38`);
  - **cuentan como activas** en el barrido SLA (`situations/sweep/situation-sweep.service.ts:23-27`) y en los KPIs de carga, antigüedad y composición, que filtran por `closed_at` y no por estado (`operational-kpis/domain/kpi-active-at-cut.ts:12-20`).
- **Evidencia [L]** (verificado).
- **Impacto:** para la misma coordinación, la carta muestra N activos y el panel ESTADO del DIRECTOR muestra N más los `RESOLVED`. Un caso `RESOLVED` puede marcarse vencido sin afectar nunca las vidas. Un `CLOSED` sin `closed_at` contaría como activo para siempre en KPIs.
- **Corrección:** **decisión D8**; lo ideal es migrar `RESOLVED` → `CLOSED` con `closed_at` (requiere autorización), y añadir una comprobación de datos para `CLOSED` sin `closed_at`.
- **Pruebas:** `.pg.spec` que siembre `RESOLVED` y `CLOSED` sin fecha, y compare overview con KPIs en el mismo instante.

#### K-03 · El panel del coordinador recalcula los totales

- **Problema:** el encabezado del panel del coordinador suma «por resolver + me afectan» y cuenta los críticos sobre la lista de nivel 1, que mezcla responsable y afectada, se corta en 100 filas y puede ser parcial (`own-only`). El backend ya da `activeProblemsCount`, que solo cuenta el lado responsable.
- **Dónde:** `NOVEX_FRONTEND/src/modules/operational-cards/components/CoordinatorProblemPanel.tsx:117-129`; `services/coordination-problems.service.ts:29`.
- **Evidencia [L].**
- **Impacto:** «5 problemas activos · 2 críticos» en el panel frente a 3/1 en la carta y en la base de la integridad. Contradice la regla del propio proyecto: «no calcular integridad/vidas en FE».
- **Corrección:** mostrar los conteos del backend; etiquetar aparte «afectan mi área».
- **Pruebas:** prueba de frontend con INTER entrantes y alcance `own-only`.

#### AU-01 · La auditoría no es confiable para uso institucional

- **Problema:**
  - `AuditLogService.record` **traga cualquier error** y devuelve `null` (`NOVEX_BACKEND/src/audit/audit-log.service.ts:27-48`).
  - Se escribe **después** del commit y fuera de la transacción (`situations.service.ts:517, 538, 1040`; `situation-consequences.service.ts`).
  - `audit_logs` no tiene trigger de solo-inserción ni `REVOKE` (`1786800000000-CreateAuditLogs.ts`), a diferencia de severidades y afectaciones, que sí lo tienen.
  - **No se auditan:** inicios de sesión (éxito o fallo), cambios de coordinación o nombre de usuarios (`users.service.ts:115-131`), alta y **borrado físico** de evidencias (`situation-evidence.service.ts:118`), recomendaciones, ni ejecuciones del barrido. La reasignación de coordinación de un caso solo registra el nombre del campo.
- **Evidencia [L].**
- **Impacto:** una acción puede quedar sin registro; los registros pueden alterarse con acceso a la base; no se puede reconstruir quién cambió qué en los casos sensibles.
- **Corrección:** trigger de solo-inserción y `REVOKE UPDATE, DELETE` para el rol de la aplicación; escritura dentro de la transacción en acciones críticas; alerta o métrica ante fallos; cubrir los huecos listados con valores anterior y nuevo.
- **Pruebas:** `UPDATE`/`DELETE` sobre `audit_logs` falla; cada acción crítica deja exactamente un registro.

#### OP-01 · Despliegue sin red de seguridad

- **Problema:** el workflow solo se dispara con push a `main` o manualmente; **no corre nada en los PR**; el despliegue **no aplica ni comprueba migraciones**, y la readiness solo hace `SELECT 1`. El lint de CI usa `--fix`. Imagen y CI en Node 20 (fuera de soporte desde abril de 2026).
- **Dónde:** `NOVEX_BACKEND/.github/workflows/deploy-backend.yml:16-20, 46`; `Dockerfile:6,21`; `src/health/probe-health.ts:62`; equivalente en el frontend.
- **Evidencia [L]**, y el incidente del 23-oct [H].
- **Impacto:** un merge puede llevar a producción código que necesita un esquema que todavía no existe.
- **Corrección:** workflow de PR (lint sin `--fix`, typecheck, pruebas, build); comprobar migraciones pendientes antes de promover la revisión; Node 22 LTS en BE.

#### OP-02 · Nada impide sembrar o migrar Cloud SQL por error

- **Problema:**
  - `isCatalogSeedEnabled()` se activa por defecto **siempre que `NODE_ENV` no sea `production`**, sin mirar `DB_CLOUD` (`NOVEX_BACKEND/src/configuration/catalog-seed.guard.ts`). Resincroniza permisos de rol (incluidas revocaciones) y borra eventos.
  - `DevelopmentUserSeedService` crea un usuario ADMIN con un correo institucional real escrito en el código cuando `nodeEnv === 'development'` (`src/users/seeds/development-user-seed.service.ts:15-17, 35`).
  - `scripts/start-cloud-direct.ps1:10` **recomienda** «en .env pon DB_CLOUD=true y npm run start:dev»; ese camino no fuerza `CATALOG_SEED_ON_BOOT=false` (los scripts `start:dev:cloud*` sí lo hacen).
  - `src/database/data-source.ts` no tiene guarda: `migration:run`/`revert` van a la nube si `DB_CLOUD=true`. `seed:rbac` borra `role_permissions` sin guarda.
- **Evidencia [L]** (guarda y comentario del script verificados).
- **Impacto:** un desarrollador siguiendo la propia indicación del repositorio podría cambiar los permisos de producción o crear un ADMIN.
- **Corrección:** las semillas de arranque se saltan con perfil nube; confirmación explícita en `data-source` para perfil nube; guarda en `seed:rbac`; el correo de desarrollo a una variable.
- **Pruebas:** unitarias de las guardas con `DB_CLOUD=true`.

#### OP-03 · Dos vías de despliegue que se comportan distinto

- **Problema:** `cloudbuild.backend.yaml:68` usa `--set-env-vars`, que **reemplaza todas** las variables (borra, por ejemplo, las de OIDC del barrido) y en L13 incluye `localhost:5173` en los CORS de producción. El workflow de Actions usa `--update-env-vars`.
- **Evidencia [L].**
- **Impacto:** un despliegue por Cloud Build deja el barrido SLA sin autenticación válida (403) y amplía CORS.
- **Corrección:** retirar una de las dos vías o alinearlas; quitar `localhost` de producción.

#### FE-01 · La interfaz decide con permisos desactualizados

- **Problema:** el backend relee rol, permisos y coordinación en cada petición, y `/auth/me` los devuelve vigentes. Pero el frontend toma los **permisos** de los claims del JWT y **prefiere la coordinación del JWT** a la de `/auth/me`; solo el rol se toma fresco.
- **Dónde:** `NOVEX_FRONTEND/src/modules/auth/services/auth-session.service.ts:86-102` (`permissions: [...claims.permissions]`, `claims.coordinationId ?? …summary`).
- **Evidencia [L]** (verificado).
- **Impacto:** durante hasta una hora tras cambiar el rol o la coordinación de alguien en `/admin`, la interfaz muestra u oculta botones de reportar según los permisos viejos, y la carta del coordinador sigue fijada a su coordinación anterior: sus reportes van allí y reciben 403.
- **Corrección:** tomar permisos y coordinación de `/auth/me` (`summary.coordinationId ?? claims.coordinationId`).
- **Pruebas:** unitaria de `mapAuthUserToUser` con claims distintos de `/auth/me`.

#### FE-02 · Un fallo de red al recargar cierra la sesión

- **Problema:** si la petición inicial de sesión falla por **cualquier** motivo (sin red, 5xx, arranque en frío de Cloud Run), el frontend borra el token.
- **Dónde:** `NOVEX_FRONTEND/src/modules/auth/context/AuthContext.tsx:160-165`.
- **Evidencia [L]** (verificado: el `catch` no distingue el tipo de error).
- **Impacto:** recargar sin conexión o durante un despliegue equivale a cerrar sesión.
- **Corrección:** borrar el token solo ante 401/403; ante errores de red o 5xx, conservarlo y ofrecer reintentar.
- **Pruebas:** arranque con `fetch` rechazado → el token se conserva.

#### FE-03 · Caducidad silenciosa con pérdida de trabajo

- **Problema:** el JWT dura una hora y no se renueva. Un 401 limpia la sesión y redirige a `/login` sin mensaje ni URL de retorno. Los borradores de **aprendizaje** y de **afectaciones** solo viven en memoria (los de reporte sí se guardan).
- **Dónde:** `NOVEX_FRONTEND/src/shared/api/http.ts:125-127`, `AuthContext.tsx:137-145`, `ProtectedRoute.tsx:19-21`, `operational-cards/state/operationalCards.reducer.ts:224, 919`.
- **Evidencia [L].**
- **Impacto:** un coordinador que escribe un aprendizaje largo tras una hora de inactividad lo pierde al enviarlo.
- **Corrección:** comprobar `exp` antes de escribir, aviso de sesión caducada con retorno, y persistir el borrador de aprendizaje como ya se hace con el reporte.
- **Pruebas:** 401 a mitad de una resolución → aviso y borrador conservado.

#### FE-04 · Rutas legadas que disparan una carga masiva

- **Problema:** `/centro-operacional/panorama`, `/inteligencia` y `/reportes` montan el proveedor del antiguo centro ejecutivo con la carga **activada** (`enabled={!isHome}`) antes de redirigir. Esa carga pide todas las páginas de `/situations` y seis peticiones por situación (análisis, historial, recomendaciones, línea de tiempo, afectadas, evidencias). Nada la cancela tras la redirección.
- **Dónde:** `NOVEX_FRONTEND/src/modules/executive-operations-center/components/layout/ExecutiveOperationsLayout.tsx:22-35`, `context/ExecutiveOperationsProvider.tsx:25-48`, `operational-center.service.ts:424-433`.
- **Evidencia [L]** (verificado el `enabled={!isHome}` y el efecto de carga; la ráfaga no se observó en ejecución).
- **Impacto:** un marcador antiguo provoca cientos de peticiones, posibles 429 y carga innecesaria en el backend; además reactiva lecturas de IA que el producto ya no muestra.
- **Corrección:** declarar esas redirecciones como rutas propias fuera del layout, o retirar el proveedor.
- **Pruebas:** visitar la ruta legada → cero peticiones a `/situations/:id/*`.

---

### 3.4 P2 — mejoras necesarias, sin urgencia

| Id | Evid. | Problema | Dónde | Impacto | Corrección | Pruebas |
|---|---|---|---|---|---|---|
| **S-O2** | [L] [D] | Un `PATCH` sin `status` edita título, descripción, fecha y **coordinación** de un caso cerrado | `situations.service.ts:744-751` | Con N1, reatribuye cierres históricos a otra coordinación en KPIs | Congelar casos cerrados (**D3**) | `PATCH` sobre CLOSED → 409 |
| **S-O3** | [L] | El título se valida antes de recortar espacios, **también en el alta** (no solo en `PATCH`); `description` del `PATCH` y de evidencias sin máximo | `dto/situation.dto.ts:64-72, 181-190`; `situation-evidence.dto.ts:35-37` | Títulos vacíos; textos enormes que van al prompt | `@Transform(trimString)` + `@MaxLength` | DTO con `"   "` → 400 |
| **S-O4** | [L] | La pista `canUpdate` no aplica el alcance de coordinación | `operational-scope.service.ts:404-412` | Botón visible que termina en 404 | Usar la misma regla que el assert | Pista = resultado real |
| **S-03** | [L] | `PATCH` acepta `evidenceIds` sin límite ni comprobación de pertenencia y los guarda en la línea de tiempo | `situation.dto.ts:209-215`; `situations.service.ts:823` | Datos falsos en el historial | `ArrayMaxSize` y validar pertenencia, o retirar el campo | — |
| **S-04** | [L] | ADMIN puede degradarse o desactivar al último ADMIN; sin comprobación de sí mismo | `users.service.ts:102-178` | Bloqueo total de administración | Guardas «yo mismo» y «último ADMIN» | Ambos casos → 409 |
| **S-05** | [L] | `role.isActive` no se comprueba al autorizar | `rbac.service.ts:74-99` | Desactivar un rol no tiene efecto | Comprobarlo | — |
| **S-06** | [L] | Filtros booleanos con `@Type(() => Boolean)`: `"false"` se convierte en `true` | `users/dto/user.dto.ts:17`, `coordinations/dto/coordination.dto.ts:6,15`, `roles/dto/role.dto.ts:6` | Filtros de admin y catálogo invertidos | Usar el `@Transform` de `situation.dto.ts:263` | `?x=false` |
| **S-07** | [L] | JWT sin algoritmo fijado ni `iss`/`aud`; secreto solo «no vacío»; sin comprobación de dominio `hd`; `googleSub` se sobrescribe en cada login | `auth/strategies/jwt.strategy.ts`, `env.validation.ts:99-101`, `auth.service.ts:51-71` | Endurecimiento (jsonwebtoken ya rechaza `none`) | `algorithms:['HS256']`, longitud mínima, `hd`, fijar `googleSub` | — |
| **S-08** | [L] | `ENABLE_EMAIL_LOGIN` no depende del entorno; Cloud Build no lo fija | `configuration.ts:70` | Si se activa en producción, cualquiera entra con un correo | Fallar al arrancar en producción con la bandera activa | Arranque con bandera → error |
| **S-09** | [L] | `/health/ready` (público) devuelve hasta 500 caracteres del error de arranque; los 403 enumeran códigos de permiso | `probe-health.ts:48,94` | Información interna | Mensajes genéricos | — |
| **S-10** | [L] | `resolve` responde 403 a un caso existente fuera de alcance y 404 a uno inexistente | `situations.service.ts:931-945` | Revela existencia (identificadores UUID: bajo) | Comprobar lectura antes | — |
| **F-03** | [L] | Afectaciones sin idempotencia, y el frontend hace el POST y luego un GET en la misma operación: si falla el GET, el usuario ve un error, reintenta y duplica | BE `situation-consequences.service.ts`; FE `operational-cards/services/problem-consequence.service.ts:55-62` | Afectación duplicada imborrable (tabla de solo-inserción) | Devolver el resultado del POST o recargar aparte; `Idempotency-Key` | POST OK + GET fallido |
| **FE-05** | [L] | Sin escucha de `storage` entre pestañas | FE `shared/api/http.ts:78` | Con otro usuario en otra pestaña, la interfaz de A envía el token de B | Escuchar `storage` y recargar | Dos pestañas |
| **FE-06** | [L] | Sin `ErrorBoundary` ni `errorElement`; `main.tsx:15` lanza sin `VITE_GOOGLE_CLIENT_ID` | FE `app/router.tsx`, `main.tsx` | Pantalla de error genérica o en blanco (p. ej. un chunk perdido tras desplegar) | `errorElement` raíz con «recargar» | — |
| **FE-07** | [L] | Los errores de avance y de afectación no recargan el detalle (solo el 409 de resolución) | FE `useOperationalOverview.ts:673-680`, reducer `:1313` | Botones obsoletos tras un 403/404/409 | Recargar el detalle ante 4xx | — |
| **FE-08** | [L] | Solo el alta tiene timeout; un único `sendingRef` serializa todas las escrituras | FE `situations.api.ts:102`, `useOperationalOverview.ts:583-723` | Una petición colgada bloquea todas las acciones | Timeout en todas las escrituras | — |
| **FE-09** | [L] | La lista de la carta pide 100 por estado y no pagina | FE `coordination-problems.service.ts:79-92` | Más de 100 activos se cortan sin aviso | Paginar o usar `total` | — |
| **FE-10** | [L] | `nginx.conf` sin CSP, `X-Content-Type-Options` ni `frame-ancestors`; caché inmutable de 1 año también para 85 archivos sin hash de `public/assets`; borradores sobreviven al cierre de sesión | FE `nginx.conf`; `clearSession` | Endurecimiento (no hay sumideros XSS: todo texto pasa por React) | Cabeceras; caché por hash; limpiar borradores al salir | — |
| **FE-11** | [L] | Código legado empaquetado: `OperationalEventsProvider` montado sin consumidores; un solo chunk de ~1,5 MB con rutas de IA y eventos; `normalizeRoleCode` convierte un rol desconocido en COORDINADOR | FE `providers.tsx:26`, `RequireRoleRoute.tsx:22` | Peso y superficie; sin escrituras indebidas (las acciones dependen de pistas del backend) | Retirar legados; pantalla «rol no soportado» | — |
| **IA-03** | [L] | Límite de Gemini por **IP** y en memoria por instancia; sin deduplicación; las recomendaciones IA se acumulan y vuelven al prompt | `throttle.constants.ts:20-29`, `app.module.ts:70`, `ai-analysis.service.ts:87-95` | Coste creciente | Límite por usuario con almacén compartido; omitir si el contexto no cambió; reemplazar recomendaciones pendientes | — |
| **IA-04** | [L] | El límite de 120 000 caracteres del prompt solo avisa | `prompt.validator.ts:25` | Coste y timeouts | Rechazar antes de llamar | — |
| **IA-05** | [L] | Lease de 150 s, timeout configurable hasta 300 s | `ai-orchestrator.service.ts:67`, `env.validation.ts:93-97` | Trabajo y coste duplicados (no corrupción: la escritura está protegida) | Validar timeout < lease | — |
| **IA-06** | [L] | Errores: 504 convertido en 503; mensaje interno de la causa en la respuesta y en la línea de tiempo; fallo posterior al commit se informa como fallo del análisis; `GEMINI_MODEL=""` no usa el modelo por defecto | `ai-orchestrator.service.ts:366-388, 427-464`; `gemini.provider.ts:302-307` | Diagnóstico confuso | Ver detalle en la columna «Dónde» | — |
| **IA-07** | [L] | Instrucciones del prompt sin delimitar el expediente como dato no confiable; listas y textos de la respuesta sin máximo | `prompt-template.registry.ts`; `ai-analysis/dto/ai-analysis.dto.ts` | Inyección en el prompt (agrava IA-01) | Delimitadores, `ArrayMaxSize`, `MaxLength` | — |
| **K-04** | [L] | «En revisión» frente a «En atención» para `IN_PROGRESS` en la misma pantalla | FE `ProblemDetail.tsx:67-71`, `coordinationProblemFilters.ts:53,63-64` | Confusión | Un solo mapa de etiquetas | Snapshot |
| **K-05** | [L] | `DESCONOCIDO` y `ALERTA` se ven igual en el personaje | FE `characterMood.ts:56-61` | Un fallo de datos parece una alerta normal | Estado propio | — |
| **K-06** | [L] | INTER con afectada = responsable: excluidos de «activos al corte», incluidos en backlog y overview | `kpi-active-at-cut.ts:35-41`, `operational-kpi-history.repository.ts:377-380` | Cifras distintas «de la misma población» en una respuesta | Un predicado compartido | `.pg.spec` |
| **K-07** | [L] | Coordinaciones inactivas desaparecen del overview sin aviso; un coordinador y el DIRECTOR pueden ver distinto `directionStatus` | `operational-overview.service.ts:70-99` | Casos invisibles | Informar huérfanos; estado de Dirección independiente de quién mira | — |
| **K-08** | [R] | Filas antiguas con `severity ≠ reported_severity` sin fila de historial | `1787800000000-BackfillReportedSeverity.ts:77-97` | La carta y la tabla «Internos» muestran severidades distintas | Contar en producción (solo lectura) y completar | — |
| **A-01** | [L] | `/dashboard/metrics` (montado, `REPORTS_VIEW`) carga **todos** los eventos legados sin límite ni alcance | `dashboard.service.ts:33-42` | Rendimiento; superficie innecesaria | Retirar o acotar | — |
| **A-02** | [L] | Sin índice en `situations(closed_at)` ni `created_at`; `getState` lanza 13 consultas en paralelo contra un pool por defecto de 10 | `operational-kpi.service.ts:497-557` | Lentitud al crecer | Índices concurrentes; tamaño de pool | — |
| **A-03** | [L] | Migraciones con marcas de tiempo repetidas (×3 pares) y una migración «fantasma» en producción con la misma marca que una del repositorio | `src/database/migrations/` | Orden frágil; `revert` puede fallar | No reutilizar marcas; inventario de `typeorm_migrations` (solo lectura) | — |
| **A-04** | [L] | Módulos latentes con proveedores y entidades cargados; dos SDK de Gemini; `users`/`roles`/`permissions` con comprobaciones en línea en vez de `PermissionsGuard` | `app.module.ts:78-122`, `package.json:53-54` | Superficie y deuda | Retirar latentes; guard declarativo; prueba de inventario de rutas | Inventario de rutas |
| **A-05** | [L] | 500 registrados sin mensaje ni traza; violaciones de restricción como 500 en vez de 409; `ssl.rejectUnauthorized:false` | `global-exception.filter.ts`, `database.config.ts:59` | Diagnóstico difícil | Log estructurado; mapear errores de PostgreSQL | — |

---

## 4. Problemas del flujo de situaciones

### 4.1 Recorrido real

| Etapa | Implementación real | Estado |
|---|---|---|
| **Registro** | `POST /situations/register-with-analysis`. Transacción única (situación + severidad REPORTED + afectación inicial + línea de tiempo); `Idempotency-Key` con huella SHA-256 e índice único parcial. **No llama a Gemini.** | **Sólido.** Problemas: F-02 (INTER libre) y S-O3 (título vacío). |
| **Asignación** | No hay asignación explícita. Al pasar a «En atención», `assignedUserId` = quien avanza (`situations.service.ts:1100-1114`). | Coherente, pero no permite designar a otra persona; «responsable» significa dos cosas (coordinación y persona). |
| **Seguimiento** | Línea de tiempo (subscriber + servicio), afectaciones (solo INTERNAL, transaccionales), evidencias. | Bien. F-03 (afectaciones duplicables). La subida de evidencias tiene cliente en el frontend, pero la UI montada solo las **lee**. |
| **Atención** | `PATCH {status: IN_PROGRESS}`. | **Débil:** O1, N1, F-01. |
| **Resolución / Cierre** | `POST …/resolution {learning}`. Una sola operación: cierre + aprendizaje + línea de tiempo, con bloqueo y doble defensa frente a carreras. Admite cerrar desde `OPEN`. | **Sólido.** Se puede cerrar sin pasar por «En atención» (decisión consciente, documentada en el código). |
| **Aprendizaje** | Tabla propia `situation_resolutions` (1..4000, no vacío tras recorte). | Bien. Sin vía para reportes erróneos (F-02): se fuerzan aprendizajes falsos. |

### 4.2 Estados y transiciones

```
OPEN ──PATCH (avance)──► IN_PROGRESS ──POST /resolution──► CLOSED
  └──────────────────── POST /resolution ─────────────────────┘
RESOLVED (legado, nada lo produce) ──POST /resolution──► CLOSED
```

- `PATCH` con `status: CLOSED` → 403 (correcto). Desde `CLOSED`, un `PATCH` con `status` → 400, **pero sin `status` sigue editando** (O2).
- No hay transición hacia atrás (reabrir) ni estado de anulación.
- `RESOLVED` aparece como «En atención» en la UI (`situation-status.transitions.ts:19-21`) pero no cuenta como activo en las cartas (K-02).

### 4.3 Reglas de coordinación responsable y afectada

| Acción | Regla real [L] | Observación |
|---|---|---|
| Leer detalle | Alcance de coordinación **o** autor **o** coordinador de la afectada | Coherente con la documentación. |
| Listar (COORDINADOR) | Responsable **o** afectada = la suya (`situations.repository.ts:118-123`) | Coherente con el detalle. A2 si no tiene coordinación. |
| Listar (ANALISTA, DIRECTOR, ADMIN) | Todo | Por diseño. |
| Editar (`PATCH`) | Autor o COORDINADOR de la responsable | El autor ANALISTA puede **reasignar** (N1). |
| Avanzar | COORDINADOR de la responsable; ANALISTA si la responsable es `coord-general` | Admite editar a la vez (O1). |
| Resolver | Igual que avanzar | Correcto, comprobado con bloqueo. |
| Afectaciones | ANALISTA autor; COORDINADOR responsable; solo INTERNAL activo | Correcto. |
| Evidencias (POST/DELETE) | `requireOperableSituation` | Correcto; el borrado es físico y no se audita (AU-01). |
| Analizar / recomendación manual | **Solo lectura** | M1. |

### 4.4 Comportamientos válidos técnicamente, pero confusos

1. **Un COORDINADOR puede reportar un INTER que luego no puede editar** (`canUpdate: true` en la respuesta, 404 al intentarlo: O4).
2. **La integridad puede cambiar sin que nadie toque el caso**, si se re-analiza (IA-01).
3. **El panel del coordinador y su carta muestran números distintos** (K-03).
4. **Un caso cerrado puede cambiar de coordinación** y llevarse su historial de KPIs (O2 + N1).
5. **Un reporte equivocado solo se retira «solucionándolo»** (F-02).
6. **El mismo estado tiene dos nombres** («En revisión» / «En atención», K-04).
7. **La reasignación queda en la línea de tiempo con valores, pero en la auditoría solo con el nombre del campo.**

### 4.5 Concurrencia e idempotencia

| Operación | Protección | Resultado |
|---|---|---|
| Alta | Idempotency-Key + índice único parcial + transacción | **Bien** |
| Resolución | Transacción + `pessimistic_write` + PK | **Bien** (probado en e2e, no ejecutado aquí) |
| Afectación | Transacción + `pessimistic_write` | Bien, pero sin idempotencia (F-03) |
| `PATCH` | **Ninguna** | **F-01** |
| Análisis IA | Reclamo con lease + token + escritura protegida | Bien, salvo que no comprueba el estado (M1) |
| Barrido SLA | Advisory lock + `SKIP LOCKED` + UPDATE condicional | **Bien**, pero un `PATCH` puede deshacer sus marcas (F-01) |

### 4.6 Datos históricos o incompletos

- `RESOLVED` legado: K-02.
- Situaciones sin coordinación (anulable desde `1786700000000`): no las resuelve nadie (las reglas exigen coordinación) y no aparecen en ninguna carta.
- Coordinaciones desactivadas: sus casos desaparecen del overview (K-07).
- Severidad efectiva ≠ reportada sin historial: K-08.
- Contrato de alta anterior a Circo (`createLegacyContract`) todavía activo; retirarlo cuando se confirme que ningún cliente lo usa.

---

## 5. Riesgos de seguridad, IA y datos

### 5.1 Estado de los hallazgos heredados

| Id | Fase 00 | Esta auditoría | Cambio |
|---|---|---|---|
| A1 | Corregido en rama, vulnerable en prod | **Igual** [E] | — |
| A2 | Abierto | **Igual** [L] | — |
| M1 | Abierto, P1 | **Abierto, P0** [L] | Alcance mayor: ANALISTA sobre **todos** los casos y casos cerrados; además altera la integridad (IA-01) |
| N1 | Abierto | **Igual** [L] | Sin pruebas |
| N2 | Abierto | **Igual** [L] | Afecta también los KPIs (K-06) |
| O1 | Abierto | **Igual**, P1 [L] | Permite **reasignar** a cualquier coordinación, no solo editar |
| O2 | Abierto | **Igual** [L] | Combinado con N1, altera KPIs históricos |
| O3 | Abierto (PATCH) | **Ampliado** [L] | También en el **alta** y en evidencias |
| O4 | Abierto | **Igual** [L] | — |
| — | — | **Nuevos:** F-01, F-02, IA-01, IA-02 (ampliado), AU-01 (ampliado), OP-02, OP-03, S-04 a S-10 | |

**Comprobación de IDOR en identificadores hijos [L]:** no se encontró ninguno nuevo. Evidencias se buscan por `(id, situationId)`, versiones de análisis por `(situationId, version)`, y no hay endpoints que reciban ids de línea de tiempo, impacto o afectación.

### 5.2 IA: capacidades reales frente a disponibles

| Capacidad | Backend | Frontend montado |
|---|---|---|
| Análisis de una situación (`POST …/analyze`) | Sí | **No** (solo en el módulo `monitoring`, cuyas rutas redirigen) |
| Historial y comparación de análisis | Sí | No |
| Simulación de impacto | Sí (sin Gemini) | No |
| Análisis en el alta | **No** (diferido) | — |
| Asistente conversacional | No existe | — |

**Conclusión:** la IA está **activa en la API pero sin uso en el producto**. Su único efecto visible es indirecto (IA-01). Esto convierte la IA en superficie de riesgo sin beneficio actual, y hace urgente la **decisión D10**.

**Lo que está bien hecho y debe conservarse:** reclamo con token y escritura protegida (un análisis viejo no puede sobrescribir uno nuevo), esquema JSON estricto más validación con lista blanca, coordinaciones filtradas al catálogo, `assignedUserId` nunca tomado de la IA, la IA nunca cambia severidad, estado ni categoría, timeout real con `AbortSignal`, y no hay URL base configurable en producción.

### 5.3 Datos y privacidad

- Prompt con correo y nombres, guardado sin plazo (IA-02).
- Token JWT en `localStorage` con caducidad de 1 h, sin refresco ni revocación; un XSS permitiría robar sesiones (ver §5.4).
- Un correo institucional real escrito en una semilla (OP-02). No se reproduce aquí.
- `audit_logs` alterable (AU-01).

### 5.4 Frontend: sesión y contratos

- **Contratos [L]:** se contrastaron todas las llamadas alcanzables desde la interfaz montada (auth, admin, situaciones, alta INTERNAL/INTER, resolución, afectaciones, evidencias, línea de tiempo, overview y los 11 endpoints de KPIs) con sus controladores y DTO. **No se encontró ningún desajuste** de ruta, método, parámetro ni campo; todos los parámetros de consulta están en lista blanca.
- **Acciones visibles:** dependen solo de las pistas del backend (`canAdvanceToInProgress`, `canResolve`, `canAddConsequence`). `canUpdate` solo se usa como atributo de datos, así que O4 hoy no se nota. ADMIN y DIRECTOR no tienen escrituras conectadas.
- **Sesión:** FE-01 a FE-03 y FE-05. Token en `localStorage` sin cabeceras CSP (FE-10): no se encontraron sumideros XSS (`dangerouslySetInnerHTML`, `innerHTML`, markdown), pero un XSS futuro permitiría robar la sesión.
- **Tutorial:** no puede activarse en producción (`ONBOARDING_TOUR_SUSPENDED = true` y piloto tras `import.meta.env.DEV`); no escribe en el backend.
- **Sin `console.*`** en el código de producción; sin polling.

---

## 6. Cobertura y resultados de pruebas

### 6.1 Ejecutado en esta sesión

| Verificación | Resultado | Notas |
|---|---|---|
| BE `jest` (unitarias + `test/security` + `test/audit`) | **69 suites OK, 5 omitidas · 880 OK, 38 omitidas** [E] | Con `GEMINI_API_KEY` vacía y `DB_CLOUD=false` forzados; `NOVEX_PG_IT` sin definir. |
| BE `test/security` (incluido arriba) | 8 suites OK [E] | A1: 14 casos de matriz. |
| BE `eslint` (sin `--fix`) | 0 errores, 54 avisos [E] | |
| BE `tsc --noEmit` **incluyendo pruebas** | **5 errores** [E] | `users.service.spec.ts` (×3, tipos `readonly`), `test/audit/audit-trail.spec.ts:345`, `test/integration/registration-idempotency.int-spec.ts:139`. Jest no los detecta porque `ts-jest` usa `isolatedModules`. El build de producción excluye las pruebas y no se ve afectado. |
| FE `vitest` | **144 archivos OK, 2 fallan · 1 458 OK, 21 fallan** [E] | Ver §6.2. |
| FE `vitest` de los 2 archivos con `--no-experimental-webstorage` | **22/22 OK** [E] | Confirma la causa. |
| FE `typecheck` | OK [E] | |
| FE `oxlint` | Sin errores; avisos de código legado y hooks [E] | |

**No ejecutado (y por qué):** builds (escriben `dist/`, ya verificados en Fase 00c), e2e de backend, `*.pg.spec`, `test/integration`, `e2e-real` del frontend. Todos necesitan una base PostgreSQL **migrada**, y esta fase prohíbe ejecutar migraciones, incluso sobre una base desechable.

### 6.2 Los 21 tests fallidos del frontend

- **Archivos:** `src/modules/operational-cards/services/report-persistence.test.ts` (12) y `src/modules/operational-cards/hooks/useOperationalOverview.idempotency.test.tsx` (9).
- **Síntoma:** `TypeError: Cannot read properties of undefined (reading 'clear')` en `window.localStorage`.
- **Causa raíz [E]:** ambos declaran `// @vitest-environment jsdom` y `jsdom` está instalado. Pero el entorno local usa **Node v26.5.1**, que expone un `localStorage` **global experimental** que vale `undefined` si no se pasa `--localstorage-file` (aviso `ExperimentalWarning` en la salida). Ese global tapa el de jsdom. El proyecto documenta Node 22 para el frontend.
- **Mecanismo [L]:** el entorno jsdom de Vitest no sobrescribe claves que ya existen en el objeto global salvo una lista fija que incluye `Storage` pero no `localStorage` (`node_modules/vitest/dist/chunks/index.DC7d2Pf8.js:242-248`).
- **No es un fallo del producto.** Las pruebas cubren lógica real (borradores e idempotencia del alta) y pasan cuando se corrige el entorno. El CI usa Node 22, donde el global no existe, así que allí pasan. El código de producción ya cae a memoria si no hay almacenamiento (`report-persistence.ts:52`).
- **Corrección mínima (no aplicada):** `test: { execArgv: ['--no-experimental-webstorage'] }` en `vite.config.ts`, o fijar Node 22 (`.nvmrc` / `engines`).

### 6.3 Qué está realmente probado

| Área | Tipo de prueba | Valor real |
|---|---|---|
| Reglas de alcance (`operational-scope`) | Unitarias de lógica pura | **Alto** |
| Integridad, vidas, Dirección, buckets, periodos | Dominio puro | **Alto** |
| A1 | Matriz de controlador con mocks | Alto para el controlador |
| `SituationsService` (alta, cierre, INTER, legado) | Repositorios simulados | Medio: no detecta F-01 ni consultas incorrectas |
| Overview y KPIs (servicios) | Repositorios simulados | **Bajo**: el SQL no se prueba |
| Orquestador IA | Todo simulado | Bajo: el reclamo solo se prueba como texto SQL |
| Concurrencia de resolución | e2e contra Nest + PG | Alto, **pero no se ejecuta por defecto** |
| KPIs de antigüedad, resolución, aprendizajes, internos | `.pg.spec` | Alto, **omitidas por defecto** |
| Prueba de integración del reclamo IA | `.int-spec` | **Desfasada**: espera que el alta analice y no compila (ver 6.1) |

### 6.4 Escenarios críticos sin prueba

**Integración contra PostgreSQL (base desechable migrada):**

1. `PATCH` concurrente con resolución, con el barrido y con un análisis (F-01).
2. Reasignar → avanzar → resolver por rol (N1, O1, N2).
3. COORDINADOR sin coordinación en el listado (A2).
4. `analyze` y `POST recommendations` por rol y estado, incluida «cierre durante el análisis» (M1).
5. Overview frente a KPIs con `RESOLVED`, `CLOSED` sin fecha e INTER responsable = afectada (K-02, K-06).
6. `audit_logs` no admite `UPDATE`/`DELETE` (AU-01).
7. Reescribir la prueba del reclamo IA contra `execute()`.

**End-to-end (frontend + backend reales):**

1. Ciclo completo por rol: reportar INTERNAL e INTER → avanzar → afectación → resolver → ver la carta actualizada.
2. Botones visibles = acciones permitidas, para los 4 roles (O4).
3. Doble clic en reportar, afectar y resolver.
4. Sesión caducada a mitad de una acción.
5. DIRECTOR: estado y explicación de la Dirección coherentes (K-01).

---

## 7. Plan de corrección en cuatro etapas

### Etapa 1 · Contención de seguridad (prioridad inmediata)

- A1 a `main`, tras verificar migraciones de producción en solo lectura.
- Reimplementar A2.
- M1: `requireOperableSituation` y bloqueo de casos cerrados; la parte del ANALISTA, según D1.
- Bloque `PATCH`: transacción + bloqueo + escritura parcial (F-01), N1, N2, O1 y O2 juntos (mismo método).
- Guardas de perfil nube en semillas, `data-source` y `seed:rbac` (OP-02).
- Workflow de PR mínimo (lint sin `--fix`, typecheck, pruebas).
- Frontend: permisos y coordinación desde `/auth/me` (FE-01) y retirar la carga de las rutas legadas (FE-04).
- **Salida:** pruebas de matriz por rol y concurrencia en verde contra PostgreSQL desechable.

### Etapa 2 · Datos, auditoría e IA

- Auditoría inmutable, transaccional y completa (AU-01).
- Minimización del prompt, restricción de `promptSnapshot`, FK y retención (IA-02).
- Sacar la IA de las reglas de CRÍTICO, o acotarla (IA-01, tras D6).
- Límite por usuario, tope de prompt, deduplicación (IA-03 a IA-07), solo si D10 mantiene la IA.
- Validaciones de texto (O3, S-03), guardas de ADMIN (S-04, S-05), booleanos (S-06).
- Anulación de reportes y reglas INTER (F-02, tras D4 y D5).
- Sesión en el frontend: no cerrar ante errores de red (FE-02), aviso de caducidad y borrador de aprendizaje persistente (FE-03), pestañas (FE-05), `errorElement` (FE-06), afectaciones sin duplicados (F-03).

### Etapa 3 · Indicadores coherentes

- Política única para `RESOLVED` y `CLOSED` sin fecha (K-02, tras D8).
- Explicación de la Dirección desde el backend (K-01).
- Panel del coordinador con conteos del backend (K-03).
- Predicado único de población (K-06), coordinaciones inactivas (K-07), etiquetas (K-04, K-05).
- Paginación de la carta (FE-09) y recarga del detalle tras errores (FE-07).
- Pruebas `.pg.spec` de overview y KPIs.

### Etapa 4 · Operación y deuda

- Una sola vía de despliegue (OP-03), comprobación de migraciones pendientes antes de promover (OP-01), Node 22, Cloud Scheduler para el barrido.
- Entorno de pruebas del frontend (Node 22 o bandera).
- Retirar módulos latentes, SDK duplicado, `/dashboard/metrics` y el contrato de alta anterior.
- Índices (A-02), errores y registros (A-05), migraciones (A-03).
- Pruebas end-to-end por rol en CI.

---

## 8. Funcionalidades que deben conservarse

- **Reautorización en cada petición** (`AuthorizationEnrichmentGuard` + `RbacService`): un usuario desactivado pierde el acceso al instante.
- **404 fuera de alcance, 403 sin propiedad, 409 por estado**, con mensajes uniformes.
- **Separación lectura / operación / resolución** en `OperationalScopeService` (el defecto está en algunos llamadores, no en el modelo).
- **Alta transaccional e idempotente** con huella e índice parcial; conservación de la clave en reintentos en el frontend.
- **Resolución atómica** con bloqueo y doble defensa; aprendizaje en tabla propia, no copiado en metadatos ni auditoría.
- **Historial de severidad y afectaciones de solo-inserción** por trigger.
- **SLA como promesa inmutable** sobre la severidad reportada; vencimiento calculado al leer (un barrido caído no congela los indicadores).
- **Barrido idempotente** (advisory lock, `SKIP LOCKED`, OIDC estricto y cerrado por defecto).
- **Políticas de integridad y vidas versionadas, puras y que fallan cerradas**; vidas sin doble daño entre propio y externo.
- **KPIs con consultas por conjuntos**, días de Bogotá semiabiertos, medianas en vez de medias, sin divisiones por cero.
- **Reclamo IA con token y escritura protegida**; esquema estricto; la IA no toca severidad, estado ni asignación.
- **`ValidationPipe` con lista blanca estricta**, Helmet, filtro de errores sin trazas, identificador de petición.
- **Identidad visual Cartas y Circo**: el frontend consume integridad y vidas del backend y muestra `DESCONOCIDO`/`—` en vez de inventar.
- **Tutorial suspendido** y piloto solo en desarrollo.

---

## 9. Decisiones de producto que requieren definición

| Id | Pregunta | Bloquea | Recomendación técnica |
|---|---|---|---|
| **D1** | ¿Sobre qué casos puede un ANALISTA pedir análisis IA o crear recomendaciones? | M1 | Los mismos en los que puede operar: sus reportes y los de `coord-general` |
| **D2** | ¿Quién puede cambiar la coordinación responsable de un caso, y en qué estados? | N1, O1 | Nadie por `PATCH`; un flujo explícito de «trasladar» con motivo y auditoría |
| **D3** | ¿Un caso cerrado queda congelado? | O2 | Sí |
| **D4** | ¿Puede un coordinador declarar una dependencia INTER entre dos áreas que no son la suya? ¿Con cualquier severidad? | F-02 | No: la afectada debe ser la suya |
| **D5** | ¿Cómo se retira un reporte erróneo o duplicado? | F-02 | Estado `ANULADO` con motivo, fuera de los indicadores |
| **D6** | ¿La propagación propuesta por la IA debe contar para poner una carta en CRÍTICO? | IA-01 | No |
| **D7** | ¿Qué datos personales pueden enviarse a Gemini, cuánto tiempo se guardan y quién los ve? | IA-02 | Ninguno identificable; retención limitada; solo ADMIN |
| **D8** | ¿Qué hacer con los casos `RESOLVED` heredados? | K-02 | Migrarlos a `CLOSED` con fecha de cierre |
| **D9** | Un COORDINADOR sin coordinación: ¿ve solo sus reportes o nada? | A2 | Solo sus reportes (`own-only`) |
| **D10** | ¿Se mantiene la IA en el producto? Si sí, ¿con qué interfaz y para quién? | Etapa 2 | Decidir antes de invertir en IA-03 a IA-07 |
| **D11** | ¿Una sola vía de despliegue (Actions o Cloud Build)? | OP-03 | GitHub Actions |

---

## 10. Criterios objetivos para considerar NOVEX listo

**Seguridad**

1. A1, A2, M1, N1, N2 y O1 corregidos y desplegados, cada uno con una prueba que falla con el código anterior.
2. Prueba de inventario de rutas en CI: toda ruta montada no pública tiene `PermissionsGuard` o está en una lista explícita.
3. Ninguna ruta de escritura usa `requireAccessibleSituation`.
4. `ENABLE_EMAIL_LOGIN=true` impide arrancar en producción.

**Flujo**

5. Matriz e2e de los 4 roles × INTERNAL/INTER × acciones (reportar, avanzar, afectar, resolver, editar) en verde, con botones visibles = acciones permitidas.
6. Prueba de concurrencia `PATCH` vs resolución en verde: ningún caso cerrado vuelve a estar activo.
7. Existe una vía para anular reportes erróneos, fuera de los indicadores.
8. Tras cambiar el rol o la coordinación de un usuario, su interfaz refleja el cambio en la siguiente recarga, sin cerrar sesión; una caducidad de sesión no pierde texto escrito.

**Datos e indicadores**

9. Para cada coordinación, el mismo instante produce el mismo conteo de activos en carta, panel del coordinador y ESTADO del DIRECTOR (prueba `.pg.spec`).
10. Cero filas `RESOLVED` y cero `CLOSED` sin `closed_at` en producción (consulta de solo lectura).
11. La explicación de integridad de la Dirección coincide con la regla del backend en todos los casos de prueba.

**Auditoría y privacidad**

12. `audit_logs` rechaza `UPDATE` y `DELETE`; login, cambios de usuario, borrado de evidencias y traslados quedan auditados con valor anterior y nuevo.
13. El prompt no contiene correos ni identificadores; `promptSnapshot` no se expone fuera de ADMIN; hay política de retención aplicada.

**Operación**

14. Todo PR ejecuta lint, typecheck y pruebas en ambos repos; `npm test` en verde en el frontend con la versión de Node documentada.
15. El despliegue se detiene si hay migraciones pendientes.
16. Una sola vía de despliegue; Node con soporte; barrido SLA invocado por Cloud Scheduler.
17. `tsc` sobre el proyecto completo (incluidas pruebas) sin errores, y las pruebas `.pg.spec`/e2e se ejecutan en CI contra una base desechable.

---

## Anexo A · Comandos ejecutados

| Comando | Repo | Efecto |
|---|---|---|
| `git branch --show-current`, `git status --short`, `git log`, `git rev-parse`, `git merge-base --is-ancestor`, `git show origin/main:<archivo>` | ambos | Solo lectura |
| `GEMINI_API_KEY="" DB_CLOUD=false npx jest --ci --silent` | BE | Pruebas unitarias sin base de datos |
| `npx eslint "{src,test}/**/*.ts"` | BE | Solo lectura |
| `npx tsc --noEmit -p tsconfig.json` | BE | Solo lectura |
| `npx vitest run src` | FE | Pruebas unitarias |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run <2 archivos>` | FE | Diagnóstico de los 21 fallos |
| `npm run typecheck`, `npm run lint` | FE | Solo lectura |

No se ejecutaron builds, migraciones, seeds, e2e, conexiones a Cloud SQL ni llamadas a Gemini. No se modificó ningún archivo fuera de este documento.

## Anexo B · Discrepancias con la documentación previa

| Documento | Afirmación | Realidad |
|---|---|---|
| Fase 00 §3.1 | M1 permite analizar a ANALISTA y COORDINADOR en casos ajenos | Más amplio: ANALISTA sobre **todos** y sobre **cerrados**; el análisis puede confirmarse después de un cierre |
| Fase 00 / detalle §6.1 | O3 solo en el `PATCH` | También en el alta y en evidencias |
| Fase 00 §7 | 21 fallos FE = «falta jsdom» (hipótesis) | jsdom está configurado; la causa es el `localStorage` experimental de Node 26 |
| EMPALME §4.5 | La integridad es «sin IA» | La regla `IMPACT_PROPAGATION` depende de la salida de Gemini |
| EMPALME §3.5 / §12 | Las pruebas unitarias pasan | Pasan, pero `tsc` sobre las pruebas falla y la prueba de integración del reclamo IA está desfasada |
| `start-cloud-direct.ps1` | Recomienda `DB_CLOUD=true` + `npm run start:dev` | Ese camino activa semillas de arranque contra la nube (OP-02) |
