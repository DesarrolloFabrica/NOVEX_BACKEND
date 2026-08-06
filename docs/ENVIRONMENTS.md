# Ambientes — diseño (aún no creados)

Objetivo futuro: **DEV → STAGING → PRODUCCIÓN**.  
**Esta sprint no crea** proyectos ni servicios adicionales.

## Matriz propuesta

| Aspecto | DEV | STAGING | PROD (hoy) |
|---|---|---|---|
| GCP project | `novex-dev` (nuevo) | `novex-staging` (nuevo) | `it-fab-contenido-edu-5` |
| Cloud Run | `novex-backend-dev`, `novex-frontend-dev` | `*-staging` | `novex-backend`, `novex-frontend` |
| Cloud SQL | instancia pequeña / shared | espejo prod reducido | `novex-db` |
| Secrets | `novex-dev-*` | `novex-staging-*` | `novex-*` |
| Artifact Registry | `novex-dev` o tags `dev-` | `staging-` | `novex/` + SHA |
| GitHub Environment | `development` | `staging` | `production` (protection rules) |
| Branch | `develop` / PR | `main` → staging auto | promote manual / tag |
| `VITE_API_BASE_URL` | URL API dev | URL API staging | URL API prod |
| CORS | orígenes dev | orígenes staging | orígenes prod (+ dominio) |
| Datos | seed / anonymized | subset | real |

## Pasos para implementar (checklist)

1. Crear proyectos GCP y habilitar APIs (Run, SQL, Secret Manager, AR, Monitoring).
2. Clonar servicios Cloud Run desde producción mediante un YAML exportado.
3. Crear secrets por ambiente (no reutilizar prod).
4. Configurar GitHub Environments + vars/secrets por entorno.
5. Adaptar workflows: `environment: staging|production` y `CLOUD_RUN_SERVICE_*` por env.
6. Promoción: imagen digest construida una vez → deploy a staging → smoke → approve → deploy prod.

## Reglas

- Nunca apuntar staging a `novex-db` de producción.
- Nunca usar secretos de prod en dev.
- OAuth clients separados o Origins por ambiente.
