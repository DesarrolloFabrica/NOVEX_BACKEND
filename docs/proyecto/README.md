# NOVEX — Documentación vigente (copia versionada)

Plataforma interna de inteligencia operacional (CUN). Identidad de producto: **Cartas y Circo**.  
Ciclo: reportar → seguir → resolver con aprendizaje.

> **Copia en Git (para otro PC):** este directorio (`NOVEX_BACKEND/docs/proyecto/`) en `refactor/novex-consolidacion`.  
> En el monorepo local también existe `Proyecto-Novex/docs/` (mismos contenidos; no eliminar).  
> **Continuar mañana:** [CONTINUIDAD.md](./CONTINUIDAD.md).

## Índice compacto

| Documento | Contenido |
|---|---|
| [CONTINUIDAD.md](./CONTINUIDAD.md) | Estado al cerrar jornada, SHAs, cómo retomar en otro PC |
| [arquitectura.md](./arquitectura.md) | Stack, módulos activos/latentes, contratos FE↔BE |
| [funcional-y-roles.md](./funcional-y-roles.md) | Flujos y capacidades de ADMIN, DIRECTOR, ANALISTA, COORDINADOR |
| [seguridad-y-permisos.md](./seguridad-y-permisos.md) | RBAC; 01A; **01B.1** anulación/traslado; **01B.2** IA/KPIs/evidencias |
| [seguridad-fase0-detalle.md](./seguridad-fase0-detalle.md) | Detalle reimplementable A1/A2/M1/N/O |
| [despliegue-y-operacion.md](./despliegue-y-operacion.md) | Cloud Run, puertas 01B.1/01B.2 (`NOLOGIN`/roles), backups |
| [historial.md](./historial.md) | Cambios e incidentes relevantes |
| [EMPALME-NOVEX.md](./EMPALME-NOVEX.md) | Continuidad técnica profunda (empalme nov-2026) |
| [NOVEX-FASE-00-DIAGNOSTICO.md](./NOVEX-FASE-00-DIAGNOSTICO.md) | Diagnóstico y consolidación Fase 00 |
| [NOVEX-FASE-01-AUDITORIA-TECNICA.md](./NOVEX-FASE-01-AUDITORIA-TECNICA.md) | Auditoría Fase 01 e incidente de snapshot |

## Repositorios

| Capa | Carpeta | Rama de trabajo |
|---|---|---|
| API | `NOVEX_BACKEND/` | `refactor/novex-consolidacion` @ `6408bc4` (01A + 01B.1 + **01B.2**; **no** es `main`/prod) |
| SPA | `NOVEX_FRONTEND/` | `refactor/novex-consolidacion` @ `e38bca1` (K-01/K-03; **sin** UI anular/trasladar) |
| Prod | tags `novex-circo-prod-20261027` | BE `5ffc65f` · FE `b726c47` |

**Regla:** push a `main` = despliegue automático. No migrar ni tocar Cloud SQL sin autorización.  
**01B.1/01B.2:** no aplicar `17883*`–`17889*` en Cloud SQL hasta roles propietario `NOLOGIN` + aplicación + migrador verificados.

## Archivo (no usar como verdad operativa)

- `archivo/2026-08/` — docs monorepo de agosto (pre-Circo / desactualizadas).
- `archivo/empalme-20261106/` — copia íntegra del empalme BE/FE antes de consolidar.
- Docs operativos del backend en `NOVEX_BACKEND/docs/*` (RELEASE_CIRCO, INCIDENTE, BACKUP-DR, …) se conservan junto a esta carpeta.

## Agentes

Instrucciones: `NOVEX_BACKEND/CLAUDE.md` y `NOVEX_FRONTEND/CLAUDE.md` → apuntan aquí cuando el monorepo local no está disponible.
