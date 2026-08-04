# Despliegue del Backend OMEGA (Cloud Run)

Guía operativa para el backend NestJS **omega-backend** en Google Cloud.

> **Importante:** no copie secretos reales a este documento ni a archivos versionados. Rote `GEMINI_API_KEY` si estuvo expuesta en entornos locales.

## 1. Arquitectura del backend

```
Cliente (frontend) → Cloud Run (omega-backend)
                       ├── Secret Manager (DB_PASSWORD, JWT_SECRET, GEMINI_API_KEY)
                       ├── Cloud SQL PostgreSQL (socket /cloudsql/...)
                       └── Gemini API (salida)
```

- Runtime: NestJS 11 + Node 22 (imagen Docker)
- ORM: TypeORM + `pg`
- Auth: Google ID token + JWT Bearer
- Prefijo API: `/api/v1`
- Health (sin prefijo): `/health`, `/health/ready`

## 2. Requisitos locales

- Node.js 20+ (validado con 22)
- npm
- Docker Desktop
- Google Cloud SDK (`gcloud`)
- PostgreSQL local o `docker compose` del repo

```powershell
node -v
npm -v
docker version
gcloud version
```

## 3. Project ID

```
it-fab-contenido-edu-5
```

Nombre del proyecto GCP: **Operacion Producto y LMS**.

> Nota: el proyecto anterior `gen-lang-client-0049269139` (Operaciones / Acervo) **no** se usa para este backend.

## 4. Región

```
us-central1
```

## 5. Servicio Cloud Run

```
omega-backend
```

## 6. Artifact Registry

- Repositorio: `novex` (ya existe en el proyecto)
- Imagen: `omega-backend`
- Ruta:

```
us-central1-docker.pkg.dev/it-fab-contenido-edu-5/novex/omega-backend
```

## 7. Variables públicas (no secretos)

| Variable | Ejemplo / notas |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` (inyectado por Cloud Run) |
| `API_PREFIX` | `api/v1` |
| `CORS_ORIGINS` | `https://URL-FRONTEND,http://localhost:5173` |
| `DB_HOST` | `/cloudsql/PROJECT:REGION:INSTANCE` |
| `DB_PORT` | `5432` |
| `DB_USERNAME` | usuario Cloud SQL |
| `DB_DATABASE` | nombre de base |
| `DB_SSL` | `false` con socket Unix Cloud SQL |
| `DB_SYNCHRONIZE` | **`false`** en producción |
| `DB_LOGGING` | `false` |
| `INSTANCE_CONNECTION_NAME` | `PROJECT:REGION:INSTANCE` |
| `JWT_EXPIRES_IN` | `1h` |
| `GEMINI_MODEL` | `gemini-3-flash-preview` |
| `GOOGLE_CLIENT_ID` | Client ID OAuth (no es contraseña) |
| `CATALOG_SEED_ON_BOOT` | `false` en producción |
| `DEMO_SEED_ENABLED` | `false` |

Plantilla local: `.env.example`.

## 8. Secretos (Secret Manager)

| Secret Manager | Env var |
|----------------|---------|
| `omega-db-password` | `DB_PASSWORD` |
| `omega-jwt-secret` | `JWT_SECRET` |
| `omega-gemini-api-key` | `GEMINI_API_KEY` |

`GOOGLE_CLIENT_SECRET` **no aplica**: el backend valida ID tokens con `GOOGLE_CLIENT_ID` únicamente.

## 9. Creación de cuenta de servicio

**No ejecutar todavía desde automatizaciones no aprobadas.** Comandos de referencia:

```powershell
gcloud iam service-accounts create omega-backend-runner `
  --project=it-fab-contenido-edu-5 `
  --display-name="OMEGA Backend Cloud Run"

# Correo esperado:
# 550902908078-compute@developer.gserviceaccount.com
```

## 10. Roles mínimos

```powershell
$PROJECT_ID = "it-fab-contenido-edu-5"
$SA = "omega-backend-runner@$PROJECT_ID.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SA" `
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SA" `
  --role="roles/secretmanager.secretAccessor"

# Logging Writer solo si la identidad no lo cubre por defecto en Cloud Run
# gcloud projects add-iam-policy-binding $PROJECT_ID `
#   --member="serviceAccount:$SA" `
#   --role="roles/logging.logWriter"
```

**No asignar:** Owner, Editor, Project IAM Admin, Secret Manager Admin.

## 11. Configuración de Cloud SQL

1. Identifique el nombre exacto de la instancia (pendiente si aún no existe).
2. Connection name: `it-fab-contenido-edu-5:us-central1:NOMBRE_INSTANCIA`
3. En Cloud Run use `--add-cloudsql-instances=...`
4. En la app:

```text
DB_HOST=/cloudsql/it-fab-contenido-edu-5:us-central1:NOMBRE_INSTANCIA
INSTANCE_CONNECTION_NAME=it-fab-contenido-edu-5:us-central1:NOMBRE_INSTANCIA
DB_SYNCHRONIZE=false
```

## 12. Creación de secretos

**No sobrescriba secretos existentes. No use valores de ejemplo en producción.**

```powershell
$PROJECT_ID = "it-fab-contenido-edu-5"

# Crear (solo si no existen). Pegará el valor por stdin — no lo deje en historial de scripts versionados.
# DB
gcloud secrets create omega-db-password --project=$PROJECT_ID
# JWT (mín. 32 chars, no usar secretos locales de desarrollo)
gcloud secrets create omega-jwt-secret --project=$PROJECT_ID
# Gemini (rote la key si estuvo en .env local)
gcloud secrets create omega-gemini-api-key --project=$PROJECT_ID

# Añadir versión (ejemplo interactivo):
# Write-Output -NoNewline 'VALOR' | gcloud secrets versions add omega-jwt-secret --project=$PROJECT_ID --data-file=-
```

Otorgue acceso a la SA sobre cada secreto (`roles/secretmanager.secretAccessor`).

## 13. Build local

```powershell
Copy-Item .env.example .env
# Completar .env local (no versionar)
npm ci
npm run build
npm run lint
npm test
npm run start:prod
```

Arranque de desarrollo:

```powershell
npm run docker:up
npm run start:dev
# http://localhost:3001/api/v1
```

## 14. Docker local

```powershell
docker build -t omega-backend-local .
# No haga docker push hasta estar listo para Artifact Registry
```

La imagen escucha en `0.0.0.0:8080` y ejecuta `node dist/main.js`.

## 15. Despliegue manual

1. Complete variables al inicio de `scripts/deploy-backend.ps1`
2. Cree SA, secretos y Cloud SQL de antemano
3. Ejecute:

```powershell
.\scripts\deploy-backend.ps1
```

El script exige escribir `DEPLOY` para confirmar. Se detiene si faltan `$CLOUD_SQL_INSTANCE` o `$SERVICE_ACCOUNT`.

Equivalente Bash: `scripts/deploy-backend.sh`.

## 16. Despliegue con Cloud Build

```powershell
$PROJECT_ID = "it-fab-contenido-edu-5"

gcloud builds submit `
  --project=$PROJECT_ID `
  --config=cloudbuild.backend.yaml `
  --substitutions=_CLOUD_SQL_INSTANCE="PROJECT:REGION:INSTANCE",_SERVICE_ACCOUNT="omega-backend-runner@$PROJECT_ID.iam.gserviceaccount.com",_CORS_ORIGINS="https://URL-FRONTEND",_DB_HOST="/cloudsql/PROJECT:REGION:INSTANCE",_INSTANCE_CONNECTION_NAME="PROJECT:REGION:INSTANCE",_DB_USERNAME="USER",_DB_DATABASE="DB",_GOOGLE_CLIENT_ID="CLIENT_ID"
```

Revise y complete todas las sustituciones `_...` antes de lanzar.

## 17. Migraciones

Hoy **no hay** migraciones TypeORM versionadas en el repositorio.

- Desarrollo: `DB_SYNCHRONIZE=true` (solo local)
- Producción: `DB_SYNCHRONIZE=false`
- Hay un SQL manual puntual: `scripts/migrate-intelligence-contract-version.sql`
- Pendiente de producto: introducir DataSource + carpeta `migrations` y scripts `migration:run` / `migration:revert` compatibles con TypeORM 0.3

**No ejecute synchronize ni seeds automáticos contra producción.**

## 18. Health check

| Endpoint | Propósito |
|----------|-----------|
| `GET /health` | Proceso vivo (startup probe) |
| `GET /health/ready` | Listo (incluye `SELECT 1` a PostgreSQL) |
| `GET /api/v1/auth/health` | Health legacy del módulo auth |

No exponen secretos ni hosts sensibles.

```powershell
Invoke-RestMethod https://URL-SERVICIO/health
Invoke-RestMethod https://URL-SERVICIO/health/ready
```

## 19. Logs

```powershell
gcloud run services logs read omega-backend `
  --project=it-fab-contenido-edu-5 `
  --region=us-central1 `
  --limit=100
```

## 20. Revisiones

```powershell
gcloud run revisions list `
  --service=omega-backend `
  --project=it-fab-contenido-edu-5 `
  --region=us-central1
```

## 21. Rollback

```powershell
# Enrutar 100% del tráfico a una revisión previa conocida
gcloud run services update-traffic omega-backend `
  --project=it-fab-contenido-edu-5 `
  --region=us-central1 `
  --to-revisions=REVISION_ANTERIOR=100
```

## 22. Actualización del backend

1. Merge / commit en la rama de despliegue
2. `npm ci && npm run build && npm test`
3. `docker build` / Cloud Build
4. Desplegar nueva revisión
5. Verificar `/health` y `/health/ready`
6. Verificar login Google + un endpoint autenticado

## 23. Solución de errores comunes

| Síntoma | Acción |
|---------|--------|
| Contenedor no arranca | Revisar variables obligatorias; Cloud Run inyecta `PORT` |
| Error JWT en producción | `JWT_SECRET` débil o de desarrollo — generar secreto fuerte en SM |
| `ECONNREFUSED` DB | Revisar Cloud SQL instance attachment y `DB_HOST=/cloudsql/...` |
| CORS bloqueado | Completar `CORS_ORIGINS` con URL exacta del frontend |
| Gemini 503 | Timeout/cuota/key; el proceso no debe tumbar el proceso |
| Seeds inesperados | En prod `CATALOG_SEED_ON_BOOT=false` |

## 24. CORS

- Variable: `CORS_ORIGINS` (lista separada por comas)
- Producción: orígenes explícitos; no `*` con credenciales
- Desarrollo sin variable: `origin: true` (solo non-prod)

## 25. Google OAuth

- Flujo: frontend obtiene credential (ID token) → `POST /api/v1/auth/google`
- Backend verifica audience = `GOOGLE_CLIENT_ID`
- Configure en Google Cloud Console los **Authorized JavaScript origins** del frontend (local + Cloud Run)
- No hardcodear solo `localhost`
- Riesgo documentado: `POST /api/v1/auth/email` permite login por email sin contraseña (contrato actual; restringir en producto si aplica)

## 26. Rotación de secretos

1. Generar nuevo valor
2. `gcloud secrets versions add NOMBRE --data-file=-`
3. Redeploy / nueva revisión Cloud Run (usa `:latest`)
4. Invalidar/revocar valor anterior (Gemini API key, password DB, JWT)
5. Tras rotar `JWT_SECRET`, las sesiones JWT previas quedan inválidas

---

## Configuración Cloud Run recomendada

| Parámetro | Valor inicial |
|-----------|---------------|
| Región | us-central1 |
| Puerto | 8080 |
| CPU | 1 |
| Memoria | 1Gi |
| Min instances | 0 |
| Max instances | 5 |
| Concurrency | 40 |
| Timeout | 300s |
| Execution | gen2 |
| Startup probe | `/api/v1/auth/health` (configurado en Cloud Run) |
| Liveness probe | `/api/v1/auth/health` |
| Health auxiliar | `/health`, `/health/ready` |
| Ingress | all (API pública para frontend) |
| Auth | allow unauthenticated en el servicio (autorización vía JWT de aplicación) |

Ajuste memoria/CPU según métricas reales tras las primeras semanas.

## Comando principal posterior

```powershell
.\scripts\deploy-backend.ps1
```

O:

```powershell
npm run deploy:gcp
```
