# NOVEX Backend

API NestJS de **NOVEX** (Cartas y Circo): situaciones, RBAC, overview/KPIs, Gemini.

**Documentación:** índice único en [`docs/proyecto/README.md`](docs/proyecto/README.md) · estado y cómo retomar en [`docs/proyecto/CONTINUIDAD.md`](docs/proyecto/CONTINUIDAD.md) · operación GCP en [`docs/INFRAESTRUCTURA-GCP.md`](docs/INFRAESTRUCTURA-GCP.md).

| Ref | Commit | Uso |
|---|---|---|
| `origin/main` / tag `novex-circo-prod-20261027` | `5ffc65f` | Producción |
| `refactor/novex-consolidacion` | tip de la rama | Desarrollo (sin desplegar) |
| `Alejo-Rama` | conservada | No modificar en consolidación |

**Node 20.** Push a `main` despliega Cloud Run **sin** aplicar migraciones.

```bash
npm ci
npm run docker:up   # Postgres local
npx eslint "{src,test}/**/*.ts"
npm test
npm run build
```

Compañero: [NOVEX_FRONTEND](https://github.com/DesarrolloFabrica/NOVEX_FRONTEND).
