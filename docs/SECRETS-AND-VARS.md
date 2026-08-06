# Secretos y variables — NOVEX

## Secret Manager (GCP)

| Secreto | Uso en Cloud Run |
|---|---|
| `novex-db-password` | `DB_PASSWORD` |
| `novex-jwt-secret` | `JWT_SECRET` |
| `novex-gemini-api-key` | `GEMINI_API_KEY` |

Accessor: SA de runtime Cloud Run (`roles/secretmanager.secretAccessor`).

### Rotación

1. Añadir nueva versión: `gcloud secrets versions add novex-… --data-file=…`
2. Reiniciar revisión Cloud Run (nuevo deploy o `gcloud run services update … --update-secrets=…:latest`)
3. Deshabilitar versión antigua tras validar

## Variables de entorno Cloud Run (backend)

Configuradas en el servicio (no en el workflow). Incluyen: `DB_*`, `CORS_ORIGINS`, `GOOGLE_CLIENT_ID`, `CATALOG_SEED_ON_BOOT`, etc.

**Login por correo:** `ENABLE_EMAIL_LOGIN` solo en local (`true`). En Cloud Run no definir o `false` — el acceso en deploy es únicamente con Google. En frontend local usar `VITE_ENABLE_EMAIL_LOGIN=true`; en el build de deploy no definir esa var.

**Deuda documentada:**

- `CORS_ORIGINS` incluye `http://localhost:5173` (útil para demos locales contra prod; retirar cuando exista dominio custom).
- `CATALOG_SEED_ON_BOOT=true` — confirmar si debe quedar en prod.

## GitHub Actions — Backend

| Tipo | Nombre |
|---|---|
| Var | `GCP_PROJECT_ID`, `GCP_REGION` |
| Var opc. | `ARTIFACT_REGISTRY_REPOSITORY`, `BACKEND_IMAGE_NAME`, `CLOUD_RUN_SERVICE_BACKEND` |
| Secret | `GCP_SERVICE_ACCOUNT_KEY` (JSON; migrar a WIF — ver SECURITY.md) |

## GitHub Actions — Frontend

| Tipo | Nombre |
|---|---|
| Var | `GCP_PROJECT_ID`, `GCP_REGION`, `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL` |
| Var opc. | `ARTIFACT_REGISTRY_REPOSITORY`, `FRONTEND_IMAGE_NAME`, `CLOUD_RUN_SERVICE_FRONTEND` |
| Secret | `GCP_SERVICE_ACCOUNT_KEY` |

`VITE_API_BASE_URL` debe contener `novex-backend` (validado en CI).
