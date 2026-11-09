# NOVEX Backend

API NestJS de **NOVEX** (Cartas y Circo): situaciones, RBAC, overview/KPIs, Gemini.

**Documentación vigente:** [`../docs/README.md`](../docs/README.md)  
**Empalme / seguridad / despliegue:** carpeta `../docs/` · operativos locales en `docs/` (RELEASE_CIRCO, INCIDENTE, BACKUP-DR, …).

| Ref | Commit | Uso |
|---|---|---|
| `origin/main` / tag `novex-circo-prod-20261027` | `5ffc65f` | Producción |
| `refactor/novex-consolidacion` | incluye A1 (`72e24fe`+) | Desarrollo |
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
