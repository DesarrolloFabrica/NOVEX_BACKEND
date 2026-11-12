# Guía funcional y roles

NOVEX gestiona situaciones INTERNAL e INTER_COORDINATION sobre 14 coordinaciones activas (Servicios se fusionó en Homologaciones, migración `1789200000000`; mesa: 9 mazos).  
Estados: `OPEN` → `IN_PROGRESS` → `CLOSED` (cierre solo con aprendizaje vía `POST …/resolution`).  
Estado administrativo **`CANCELLED`** (Fase 01B.1, con UI ADMIN; **sin desplegar**): anulación con motivo; no es cierre; fuera de listados e indicadores por defecto.
Una situación puede marcar **coordinaciones relacionadas** (informativas) y una categoría **«Otra»** con texto libre.

## Capacidades por rol

| Capacidad | ADMIN | DIRECTOR | ANALISTA | COORDINADOR |
|---|---|---|---|---|
| Shell Centro | Deck consulta | Lectura + KPIs | Operación (deck) | Solo su carta |
| Reportar | No | No | Sí | Sí (con coordinación) |
| Avance OPEN→IN_PROGRESS | No | No | Solo si responsable = `coord-general` | Solo su coordinación responsable |
| Resolver + aprendizaje | No | No | Solo `coord-general` responsable | Solo su responsable |
| Afectaciones INTERNAL | No | No | Autor | Responsable |
| Anular / trasladar (01B.1) | Sí (`SITUATIONS_CANCEL` / `SITUATIONS_TRANSFER`), «Gestión administrativa» del detalle | No | No | No |
| KPIs | Sí (`KPIS_VIEW`, migración `1789000000000`) | Sí (`KPIS_VIEW`) | No | No |
| `/admin` usuarios | Sí | No | No | No |
| Recorrido guiado | — | — | — | Desarrollo o `VITE_ENABLE_COORDINATOR_TOUR=true` (no prod) |

Autoría o ser coordinación **afectada** permite lectura en INTER; **no** concede resolver.

## Permisos seed (referencia)

`SITUATIONS_VIEW` todos · `SITUATIONS_CREATE/UPDATE/CLOSE` + `AI_ANALYZE` ANALISTA/COORDINADOR · `SITUATIONS_CANCEL` / `SITUATIONS_TRANSFER` solo ADMIN (migración `1788600000000`, no aplicada en Cloud SQL) · `KPIS_VIEW` DIRECTOR/ADMIN · `USERS_*` / `SYSTEM_CONFIGURATION` ADMIN · `REPORTS_VIEW` ADMIN/DIRECTOR/ANALISTA.

**Producción:** cambios RBAC vía migraciones. Contenido real de `role_permissions` en Cloud SQL: no verificado en Fase 00. Migraciones 01B.1 (`17883*`–`17887*`) **bloqueadas** hasta roles `NOLOGIN`/aplicación/migrador (ver [seguridad-y-permisos.md](seguridad-y-permisos.md)).

## UX Cartas y Circo (no romper)

Integridad/vidas: solo desde `GET /operational-overview` (nunca inventar ESTABLE/10 en FE).  
Personaje Rive: mood + triggers; no State Machine Input.  
LEVEL 0 overview · 1 problemas · 2 detalle. Sin polling.

Detalle de dominio: [EMPALME-NOVEX.md](./EMPALME-NOVEX.md) §§4–5, §10.
