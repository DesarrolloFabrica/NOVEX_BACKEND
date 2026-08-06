# Monitoreo — NOVEX

## Cloud Logging

Logs de Cloud Run automáticamente en Logging:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="novex-backend"' --limit=50 --project=it-fab-contenido-edu-5
```

## Error Reporting

API `clouderrorreporting.googleapis.com` habilitada. Errores no capturados de Cloud Run aparecen en Error Reporting (consola GCP).

## Uptime checks

| Nombre | Host | Path | Periodo |
|---|---|---|---|
| NOVEX backend health | `novex-backend-smazwcaz4a-uc.a.run.app` | `/api/v1/auth/health` | 60s |
| NOVEX frontend root | `novex-frontend-smazwcaz4a-uc.a.run.app` | `/` | 60s |

## Notification channel

- Display name: `NOVEX ops email`
- Destino: `desarrollofabrica@cun.edu.co`  
  (confirmar el email en la consola la primera vez)

## Alert policies

| Policy | Condición |
|---|---|
| NOVEX backend uptime down | Fallo uptime backend |
| NOVEX frontend uptime down | Fallo uptime frontend |
| NOVEX Cloud Run 5xx | Tasa 5xx elevada |
| NOVEX Cloud Run CPU high | CPU p99 > 80% 5m |
| NOVEX Cloud Run memory high | Memoria p99 > 85% 5m |
| NOVEX Cloud SQL CPU high | CPU SQL > 80% 5m |

## Métricas clave

- `run.googleapis.com/request_count` (por `response_code_class`)
- `run.googleapis.com/container/cpu/utilizations`
- `run.googleapis.com/container/memory/utilizations`
- `cloudsql.googleapis.com/database/cpu/utilization`
- `cloudsql.googleapis.com/database/network/connections`

## Consola

Monitoring → Uptime checks / Alerting · Logging → Logs Explorer · Error Reporting
