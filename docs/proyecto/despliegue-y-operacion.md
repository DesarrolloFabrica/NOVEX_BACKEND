# Despliegue y operación

## Pipelines

| | Backend | Frontend |
|---|---|---|
| Workflow | `deploy-backend.yml` | `deploy-frontend.yml` |
| Trigger | push `main` / `workflow_dispatch` | igual |
| CI en PR | **No** | **No** |
| Migraciones | **Ninguna vía las corre** | N/A |
| Smoke | health, ready, 401 `/auth/me` | build + nginx |

**Push a `main` = producción.** Orden correcto de esquema: migrar primero (copia + `migration:show` + `run`), desplegar después. Incidente 23-oct: [NOVEX_BACKEND/docs/INCIDENTE-20261023-MIGRACIONES.md](../NOVEX_BACKEND/docs/INCIDENTE-20261023-MIGRACIONES.md).

## Secretos (solo nombres)

`DB_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY` (Secret Manager). Ver `NOVEX_BACKEND/docs/SECRETS-AND-VARS.md`.

## Migraciones

- Local: Postgres Docker; perfil `DB_CLOUD=false`.
- `migration:*` **sin guarda** anti-nube: confirmar destino antes de cualquier comando.
- Seeds on boot apagados en prod (`CATALOG_SEED_ON_BOOT=false`).
- Migración fantasma histórica en prod: `AllowAnalystUnassignedSituations1786500000000` (copia en backups Fase 00; **no** reintroducir sin decisión).
- Rollback a pre-cartas (`49a6483`) **no viable** si hay INTER.

### Puerta Fase 01B.1 (`1788300000000`…`1788700000000`) — **no desplegar aún**

Código cerrado en `refactor/novex-consolidacion` @ `2bdf12f` (pruebas: 1.158 unitarias + 61 PG). **No** aplicar estas migraciones en Cloud SQL ni en bases compartidas hasta:

1. Rol propietario del historial (`NOVEX_HISTORY_OWNER_ROLE`) **`NOLOGIN`**, separado del rol de aplicación.
2. Rol de aplicación (`NOVEX_APP_DB_ROLE`) no-superusuario, sin membresía del propietario.
3. Migrador autorizado para transferir la propiedad de las tablas al propietario.
4. Verificación **solo lectura** de privilegios (SQL en [seguridad-y-permisos.md](seguridad-y-permisos.md) §«Procedimiento de verificación») con criterio de paso cumplido.

**Advertencia:** ejecutar `migration:run` / `cloud:*` contra Cloud SQL con estas migraciones **sin** esos roles preparados es un bloqueante operativo. La migración de privilegios falla cerrada si faltan; no usar eso como “prueba” en prod.

### Puerta Fase 01B.2 (`1788800000000`, `1788900000000`) — **no desplegar aún**

Misma puerta que 01B.1 (van detrás de `1788700000000`). Además:

- **`1788800000000-NormalizeLegacyResolvedSituations`** convierte a `CLOSED` solo los `RESOLVED` con fecha real (`closed_at`, o `resolved_at`). Los que no tienen fecha, o la tienen anterior a la creación, **no** se convierten y quedan en `legacy_resolved_normalizations` como `PENDING_*`: requieren que alguien con autoridad aporte la fecha real o decida su tratamiento (no se inventa). Consulta previa, solo lectura:

  ```sql
  SELECT
    COUNT(*) FILTER (WHERE closed_at IS NOT NULL)                         AS con_cierre,
    COUNT(*) FILTER (WHERE closed_at IS NULL AND resolved_at IS NOT NULL) AS con_resolucion,
    COUNT(*) FILTER (WHERE closed_at IS NULL AND resolved_at IS NULL)     AS pendientes,
    COUNT(*) FILTER (WHERE COALESCE(closed_at, resolved_at) < created_at) AS incoherentes
  FROM situations WHERE status = 'RESOLVED';
  ```

  Tras migrar: `SELECT outcome, count(*) FROM legacy_resolved_normalizations GROUP BY 1;`. `down()` revierte exactamente lo convertido (se niega si un caso cambió después). `CLOSED` sin `closed_at` no se tocan: los KPIs ya no los cuentan como activos.
- **`1788900000000-AddSituationEvidenceRetirement`**: aditiva; `down()` se niega si hay evidencias retiradas.
- Variables nuevas opcionales: `AI_PROMPT_SNAPSHOT_RETENTION_DAYS`, `AI_SESSION_RETENTION_DAYS` (vacías; no ejecutan nada).

## Backups y recuperación

| Doc en BE | Uso | Nota |
|---|---|---|
| `docs/RELEASE_CIRCO.md` | Release Circo / compatibilidad | Vigente para recuperación de versión |
| `docs/RESTORE-TEST.md` | Pruebas de restore | Se contradice con BACKUP-DR — reconciliar |
| `docs/BACKUP-DR.md` | DR | Contrastar antes de usar |
| Tags | `novex-circo-prod-20261027`, `novex-pre-circo-20261023` | Conservar siempre |

Guías Cloud Run: `NOVEX_BACKEND/DEPLOY_BACKEND.md`, `NOVEX_FRONTEND/DEPLOY_FRONTEND.md` (FE parcialmente desactualizado).

## Respaldo Git local (Fase 00)

- `.backups/fase00b-20261109/` — WT, stashes, A2/M1, Alejo, tutorial patches  
- `.backups/fase00c-20261109/bundles/*.bundle` — mirror de todos los refs (recuperable)

## Scripts peligrosos (BE)

`migration:run/revert`, `seed:rbac`, `seed:qa-*`, `cloud:sql`, `cloud:user:upsert`, `cloud:proxy`, `start:dev:cloud*`.
