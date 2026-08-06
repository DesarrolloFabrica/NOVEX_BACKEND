# Runbook — incidentes comunes NOVEX

## Backend caído / 5xx

1. Comprobar alerta / uptime.
2. Health: `curl -fsS https://novex-backend-smazwcaz4a-uc.a.run.app/api/v1/auth/health`
3. Logs: Cloud Logging filtro `novex-backend`.
4. Revisar Cloud SQL `novex-db` (CPU, conexiones, estado RUNNABLE).
5. Rollback de revisión si el fallo coincide con un deploy ([DEPLOY.md](DEPLOY.md)).

## Frontend caído / pantalla blanca

1. `curl -fsS https://novex-frontend-smazwcaz4a-uc.a.run.app/`
2. `curl -fsS https://novex-frontend-smazwcaz4a-uc.a.run.app/health` → debe ser `ok` (no HTML).
3. Verificar en DevTools que `VITE_API_BASE_URL` apunte a `novex-backend`.
4. Rollback imagen frontend.

## Login Google falla

1. Origins OAuth incluyen la URL usada (run.app o dominio custom).
2. `GOOGLE_CLIENT_ID` backend = `VITE_GOOGLE_CLIENT_ID` frontend.
3. CORS permite el origen del frontend.

## DB / secretos

1. `gcloud secrets versions access latest --secret=novex-db-password` (solo desde cuenta autorizada).
2. Confirmar binding accessor de la SA runtime.
3. Restore SQL si corrupción ([BACKUP-DR.md](BACKUP-DR.md)).

## Deploy CI rojo

1. Mirar job **Validate** (lint/test/build) vs **Deploy** vs **Smoke**.
2. Si smoke falla tras deploy: la revisión puede estar up pero health no — no promover tráfico adicional; rollback.
3. Vars GitHub faltantes → fail-fast en meta step.

## Contacto

Canal alertas: `desarrollofabrica@cun.edu.co` (Notification Channel `NOVEX ops email`).
