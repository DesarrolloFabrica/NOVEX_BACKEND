# Seguridad — NOVEX

## Estado actual

| Área | Estado | Riesgo |
|---|---|---|
| Secrets | Prefijo `novex-*`, accessor en SA runtime | Bajo |
| Cloud Run invoker | `allUsers` (público) | Esperado para SPA + API pública; rate limits a evaluar |
| Runtime SA | Default Compute Engine SA | **Alto** — privilegios de proyecto compartidos |
| CI auth | JSON key `GCP_SERVICE_ACCOUNT_KEY` | Medio — clave larga duración |
| SQL | IP pública, SSL mode permisivo | Medio |
| Probes | HTTP health reales (backend + FE nginx) | Bajo |

## Principio de mínimo privilegio — checklist SA dedicada

**No aplicado en caliente en esta sprint** (evitar corte). Pasos:

1. Crear `novex-run@PROJECT.iam.gserviceaccount.com`
2. Roles mínimos:
   - `roles/cloudsql.client`
   - `roles/secretmanager.secretAccessor` (solo secretos `novex-*`)
   - (si aplica) `roles/logging.logWriter`
3. Actualizar Cloud Run:
   ```bash
   gcloud run services update novex-backend --service-account=novex-run@… --region=us-central1
   gcloud run services update novex-frontend --service-account=novex-run@… --region=us-central1
   ```
4. Smoke health + login.
5. No otorgar `Editor`/`Owner` a esta SA.

## CI — Workload Identity Federation (deuda)

Migrar de JSON key a WIF:

1. Pool + provider GitHub OIDC  
2. SA `novex-deploy@…` con Artifact Registry Writer + Cloud Run Admin + `iam.serviceAccountUser` sobre `novex-run`  
3. Actualizar workflows `google-github-actions/auth` con `workload_identity_provider`  
4. Rotar/eliminar `GCP_SERVICE_ACCOUNT_KEY`

## Artifact Registry

Repo `novex/` — restringir writers a SA de deploy. Readers: runtime no necesita pull si Cloud Run usa digest ya desplegado.

## Recomendaciones SQL

- Preferir Cloud SQL Auth Proxy / connector privado (quitar IP pública cuando haya VPC).
- `sslMode` más estricto cuando clientes lo soporten.
