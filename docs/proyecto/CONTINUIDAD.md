# Continuidad NOVEX — estado actual, historial y cómo retomar

**Actualizado:** 2026-11-12  
**Rama de trabajo:** `refactor/novex-consolidacion` en ambos repos (única autorizada para publicar).  
**Producción / `main`:** no tocar, no mergear, no desplegar sin autorización del responsable.

## 1. Estado actual

| Capa | Repo | Rama | Último commit de código |
|---|---|---|---|
| API | `NOVEX_BACKEND` | `refactor/novex-consolidacion` | `8bba579` (después solo limpieza documental) |
| SPA | `NOVEX_FRONTEND` | `refactor/novex-consolidacion` | `6bc9ae1` (después solo limpieza documental y de pruebas) |
| Prod | tag `novex-circo-prod-20261027` | `main` | BE `5ffc65f` · FE `b726c47` |

Todo lo listado abajo está **cerrado en código y sin desplegar** (ni en `main` ni en Cloud SQL).

| Fase | Qué quedó |
|---|---|
| **00** | Diagnóstico, respaldos, ramas de consolidación, docs compactas, limpieza remota segura |
| **01A** | Alcance lectura/IA/escritura (A2/M1), PATCH seguro, alta INTER, guardas Cloud SQL, overview COORDINADOR |
| **01B.1** | Anulación, traslado, auditoría transaccional, historial `NOLOGIN`, KPIs históricos |
| **01B.2** | IA solo sugiere + prompt minimizado; K-01/K-02/K-03/K-06; D8 RESOLVED→CLOSED; recomendaciones congeladas; retiro de evidencias |
| **02** (FE) | UI de anulación y traslado ADMIN (02A/02B), retiro e historial de evidencias (02C), sesión estable con `/auth/me` y borradores tras caducidad, análisis IA contextual en el detalle, registro único INTERNAL ∪ INTER |
| **03a** (FE) | UX/UI del centro por rol, login, paneles admin y KPIs, assets por coordinación |
| **Nov-12** | Ver §2 |

## 2. Cambios del 2026-11-12

**Backend**

- `8e6b9b0` Coordinaciones relacionadas en la situación y categoría **«Otra»** con texto libre (columna `category_other_text`, migración `1789100000000`; la tabla de relacionadas ya existía).
- `580de7b` **Servicios se fusiona en Homologaciones** (migración `1789200000000`): reasigna usuarios, situaciones y relaciones; `coord-servicios` queda inactiva (no se borra por las tablas de historial inmutables); todo queda en `coordination_merge_log` y `down()` lo revierte.
- `4e4b348` Los cierres simulados del seed mock llevan su aprendizaje.
- `3bbf72c` Límite de peticiones **por usuario** (`UserAwareThrottlerGuard`: rastrea `user:<sub>` si hay sesión, IP si no) y `204` cuando una situación no tiene análisis persistido.
- `8bba579` Pruebas: servidor HTTP tipado para supertest.

**Frontend**

- `ac17141` Recorrido guiado del **coordinador** rehecho (11 pasos, motor de geometría propio, teclado, móvil). Se ofrece en desarrollo o con `VITE_ENABLE_COORDINATOR_TOUR=true`; el tour general sigue suspendido (`ONBOARDING_TOUR_SUSPENDED`).
- `2b33279` Formulario de reporte con coordinaciones relacionadas, «Otra» con texto y validación en línea.
- `6bc9ae1` Auditoría de los cuatro roles: un solo «Historial», KPIs del Director pedidos una vez, cabeceras y textos coherentes, paginación admin, retiro de ~260 archivos inalcanzables y setup de Vitest compatible con Node 26.

**Validación al cerrar (local):** BE 1.411 pruebas Jest, ESLint y `tsc` limpios. FE 1.163 pruebas Vitest, oxlint sin avisos, typecheck y build limpios.
E2E Playwright (mocks): pasan las suites del recorrido y del shell; quedan fallos **anteriores** a estos cambios en suites de cartas, detalle, personaje y shell del coordinador (UI evolucionó y las pruebas no), pendientes de actualizar.

## 3. Pendientes

- **Migraciones en Cloud SQL** (§4): pendientes de autorización, backup y `migration:show`. Ya no requieren roles PostgreSQL adicionales (2026-11-13).
- **E2E desactualizadas** del frontend (ya fallaban antes del 12-nov; la UI evolucionó y las pruebas no). Las de más fallos: `operational-coordinator-shell`, `operational-character-lives`, `operational-cards-selection`, `operational-action-panel`, `operational-problem-detail`, `operational-card-language`, `operational-cards`; además casos sueltos en `operational-deck-*`, `operational-table-*`, `operational-history-panel`, `operational-center-menu` y otras. Ejecutar con `npx playwright test --workers=1` para no saturar el equipo.
- Parser de KPIs del FE: `parseDirectionIntegrity` (`operational-kpi.service.ts`) lanza `OperationalKpiContractError` ante una regla de Dirección desconocida; con las 6 reglas actuales no bloquea, pero una regla nueva rompería toda la respuesta. Resolver en la integración de KPIs (regla desconocida → `null`) y sincronizar con `operational-direction-integrity.ts`.
- AU-01 restante, OP-01/OP-03, K-04/K-05/K-07, retención IA (D7) sin ejecución automática.
- Activar el recorrido del coordinador en un despliegue solo con validación y autorización.

## 4. Migraciones pendientes de producción

**No ejecutar en Cloud SQL** sin autorización y sin los requisitos de abajo. Detalle por puerta: [despliegue-y-operacion.md](despliegue-y-operacion.md).

| Serie | Contenido |
|---|---|
| `1788300000000`…`1788700000000` | 01B.1: CANCELLED, traslados, auditoría protegida, permisos CANCEL/TRANSFER, historial endurecido |
| `1788800000000` | Normalización RESOLVED legado → CLOSED (D8) |
| `1788900000000` | Retiro de evidencias |
| `1789000000000` | `KPIS_VIEW` para ADMIN |
| `1789100000000` | Texto libre de la categoría «Otra» |
| `1789200000000` | Fusión Servicios → Homologaciones |

**Requisitos:** autorización del responsable, backup manual de Cloud SQL, `migration:show` y la consulta previa de `1788800000000`. Se ejecutan con el usuario de la aplicación; desde el 2026-11-13 `1788700000000` no exige roles `NOLOGIN` ni rol de aplicación separado ([seguridad-y-permisos.md](seguridad-y-permisos.md)).

## 5. Base local y pruebas destructivas

- Base de desarrollo: `novex_local_snapshot_20261028` (contenedor `novex-postgres`, puerto 5442). Fue truncada el 2026-11-09 y se repobló con seeds locales: sirve para desarrollar, **no** como verdad de datos ni como destino de pruebas destructivas.
- Pruebas que escriben: solo en contenedor desechable nuevo con marca `novex:disposable-test-db` y roles `NOLOGIN`/app. Procedimiento completo en `NOVEX_BACKEND/CLAUDE.md` §«Pruebas destructivas».

## 6. Retomar desde otro computador

```bash
git clone -b refactor/novex-consolidacion https://github.com/DesarrolloFabrica/NOVEX_BACKEND.git
git clone -b refactor/novex-consolidacion https://github.com/DesarrolloFabrica/NOVEX_FRONTEND.git
```

Clones ya existentes: `git fetch origin && git checkout refactor/novex-consolidacion && git pull --ff-only`.
Clonar ambos repos como carpetas hermanas (`Proyecto-Novex/NOVEX_BACKEND`, `Proyecto-Novex/NOVEX_FRONTEND`):
`npm run dev` del frontend arranca también el backend.

Secretos (`.env`, JWT, Gemini, DB) **no** están en Git: copiarlos por canal seguro.

**No hacer:** push/merge a `main`, force push, deploy, migraciones en Cloud SQL, tocar `Alejo-Rama`.

## 7. Historial

| Fecha | Evento |
|---|---|
| 2026-08 | Hardening fases 1–4 (auth global, RBAC server-side, auditoría, logging). Docs de cierre retirados del árbol; ver §8 |
| 2026-10-23 | Incidente: deploy sin migraciones ([INCIDENTE-20261023-MIGRACIONES.md](../INCIDENTE-20261023-MIGRACIONES.md)) |
| 2026-10-27 | Release **Cartas y Circo** en prod · tags `novex-circo-prod-20261027` (BE `5ffc65f`, FE `b726c47`) |
| 2026-11-05 | A1 mergeado a `integracion/cartas-circo` (`72e24fe`); no en `main` |
| 2026-11-06 | Empalme documental BE/FE ([EMPALME-NOVEX.md](EMPALME-NOVEX.md)) |
| 2026-11-09 | Fase 00 (diagnóstico, ramas `refactor/novex-consolidacion`, docs compactas) |
| 2026-11-09 | Fase 01B.1 cerrada en código (BE `2bdf12f`); 01B.2 cerrada (BE `6408bc4`, FE `e38bca1`) |
| 2026-11-10 | Fase 02 planificada y luego integrada en FE (anulación, traslado, evidencias, sesión, IA, registro único) |
| 2026-11-12 | Recorrido del coordinador, formulario ampliado, fusión Servicios→Homologaciones, límite por usuario, auditoría de roles |
| 2026-11-12 | Limpieza documental: un índice, un doc de infraestructura, este archivo como estado + historial |

Ramas a conservar: `main`, `refactor/novex-consolidacion`, `Alejo-Rama`.

## 8. Documentación retirada

Se retiraron del árbol (siguen en el historial de Git y, en el monorepo local, en `Proyecto-Novex/docs/archivo/`):

- `docs/proyecto/archivo/` (docs de agosto 01–12 y copia íntegra del empalme del 6-nov).
- `docs/AUDITORIA_INTEGRAL_NOVEX.md`, `CLOSURE_PHASE_{1,2,3}*.md`, `FINAL_TECHNICAL_CLOSURE.md` (cierres de agosto).
- `README_ESTADO_ACTUAL_NOVEX.md` de ambos repos (estado de octubre, desactualizado).
- `docs/{ARCHITECTURE,DEPLOY,MONITORING,RUNBOOK,COSTOS,ENVIRONMENTS,CUSTOM-DOMAIN}.md` → fusionados en [`docs/INFRAESTRUCTURA-GCP.md`](../INFRAESTRUCTURA-GCP.md).
- `docs/proyecto/historial.md` → §7 de este archivo.

Recuperar cualquiera: `git log --diff-filter=D --oneline -- <ruta>` y `git show <commit>^:<ruta>`.
