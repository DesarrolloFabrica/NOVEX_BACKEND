# NOVEX — Documentación

Plataforma interna de inteligencia operacional (CUN). Identidad de producto: **Cartas y Circo**.
Ciclo: reportar → seguir → resolver con aprendizaje.

Este es el **índice único** de la documentación de los dos repos (`NOVEX_BACKEND` y `NOVEX_FRONTEND`).
Empieza por **[CONTINUIDAD.md](./CONTINUIDAD.md)**: estado actual, pendientes, historial y cómo retomar.

## Producto y código — `docs/proyecto/`

| Documento | Contenido |
|---|---|
| [CONTINUIDAD.md](./CONTINUIDAD.md) | Estado actual, cambios recientes, pendientes, migraciones bloqueadas, historial, retomar en otro PC |
| [arquitectura.md](./arquitectura.md) | Stack, módulos activos/latentes, guards, contratos FE↔BE |
| [funcional-y-roles.md](./funcional-y-roles.md) | Flujos y capacidades de ADMIN, DIRECTOR, ANALISTA, COORDINADOR |
| [seguridad-y-permisos.md](./seguridad-y-permisos.md) | RBAC, alcance, 01A, 01B.1 (anulación/traslado), 01B.2 (IA/KPIs/evidencias), contratos HTTP |
| [seguridad-fase0-detalle.md](./seguridad-fase0-detalle.md) | Detalle reimplementable de A1/A2/M1/N/O |
| [despliegue-y-operacion.md](./despliegue-y-operacion.md) | Pipelines, migraciones y sus puertas, backups |
| [EMPALME-NOVEX.md](./EMPALME-NOVEX.md) | Referencia técnica profunda del dominio (empalme nov-2026) |
| [NOVEX-FASE-00-DIAGNOSTICO.md](./NOVEX-FASE-00-DIAGNOSTICO.md) | Histórico: diagnóstico y consolidación Fase 00 |
| [NOVEX-FASE-01-AUDITORIA-TECNICA.md](./NOVEX-FASE-01-AUDITORIA-TECNICA.md) | Histórico: auditoría Fase 01 e incidente de la snapshot |

## Operación en GCP — `docs/`

| Documento | Contenido |
|---|---|
| [INFRAESTRUCTURA-GCP.md](../INFRAESTRUCTURA-GCP.md) | Arquitectura de producción, CI/CD, rollback, monitoreo, runbook, costos, ambientes y dominio |
| [SECRETS-AND-VARS.md](../SECRETS-AND-VARS.md) | Nombres de secretos y variables |
| [SECURITY.md](../SECURITY.md) | Cuenta de servicio, WIF, Artifact Registry, SQL |
| [BACKUP-DR.md](../BACKUP-DR.md) · [RESTORE-TEST.md](../RESTORE-TEST.md) | Backups, DR y prueba de restauración |
| [RELEASE_CIRCO.md](../RELEASE_CIRCO.md) | Release Cartas y Circo y compatibilidad de versiones |
| [INCIDENTE-20261023-MIGRACIONES.md](../INCIDENTE-20261023-MIGRACIONES.md) | Incidente de deploy sin migraciones |
| [INTERNAL_VIVO.md](../INTERNAL_VIVO.md) | Afectaciones INTERNAL, severidad efectiva y barrido |
| [`DEPLOY_BACKEND.md`](../../DEPLOY_BACKEND.md) · `NOVEX_FRONTEND/DEPLOY_FRONTEND.md` | Guías paso a paso de Cloud Run |

## Repositorios

| Capa | Carpeta | Rama de trabajo | Producción |
|---|---|---|---|
| API | `NOVEX_BACKEND/` | `refactor/novex-consolidacion` | `main` / tag `novex-circo-prod-20261027` (`5ffc65f`) |
| SPA | `NOVEX_FRONTEND/` | `refactor/novex-consolidacion` | `main` / tag `novex-circo-prod-20261027` (`b726c47`) |

**Regla:** push a `main` = despliegue automático. No migrar ni tocar Cloud SQL sin autorización.

## Agentes

Instrucciones: `NOVEX_BACKEND/CLAUDE.md` y `NOVEX_FRONTEND/CLAUDE.md`. Ante docs vs código, manda el código.
En el monorepo local existe además `Proyecto-Novex/docs/` (copia de trabajo fuera de Git, con el archivo histórico).
