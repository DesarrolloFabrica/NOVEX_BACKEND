# Despliegue y CI/CD — NOVEX

## Repos y workflows

| Repo | Workflow | Target Cloud Run |
|---|---|---|
| [NOVEX_BACKEND](https://github.com/DesarrolloFabrica/NOVEX_BACKEND) | `.github/workflows/deploy-backend.yml` | `novex-backend` |
| [NOVEX_FRONTEND](https://github.com/DesarrolloFabrica/NOVEX_FRONTEND) | `.github/workflows/deploy-frontend.yml` | `novex-frontend` |

La fuente de verdad del deploy son los workflows dentro de cada repo de componente (no este workspace).

## Pipeline

1. **Validate** — `npm ci` + lint (+ typecheck FE) + tests + build  
2. **Build image** — tag `{sha7}`, labels OCI  
3. **Push** Artifact Registry `novex/`  
4. **Deploy** — `gcloud run deploy --image=<digest>` **solo imagen**  
5. **Smoke** — health HTTP obligatorio  

## Regla crítica

El deploy **no** pasa `--set-env-vars` / `--set-secrets` / `--add-cloudsql-instances`.  
Así se preserva la configuración viva de Cloud Run (Cloud SQL, secretos, CORS, probes).

## Variables GitHub

Ver [SECRETS-AND-VARS.md](SECRETS-AND-VARS.md).

## Rollback

```bash
# Listar revisiones
gcloud run revisions list --service=novex-backend --region=us-central1

# Enrutar 100% a revisión previa
gcloud run services update-traffic novex-backend \
  --region=us-central1 \
  --to-revisions=REVISION_ANTERIOR=100
```

O redesplegar un digest anterior conocido:

```bash
gcloud run deploy novex-backend \
  --region=us-central1 \
  --image=REGION-docker.pkg.dev/PROJECT/novex/novex-backend@sha256:... \
  --quiet
```

## Deploy manual

Actions → workflow_dispatch → indicar `reason` para auditoría.
