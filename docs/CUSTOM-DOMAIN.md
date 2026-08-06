# Dominio personalizado — procedimiento (no aplicado aún)

Objetivo futuro:

| Host | Servicio |
|---|---|
| `novex.cun.edu.co` | `novex-frontend` |
| `api.novex.cun.edu.co` | `novex-backend` |

**No modificar DNS ni Cloud Run domain mapping en esta sprint.**

## 1. DNS (zona `cun.edu.co`)

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME o A/AAAA | `novex` | según Domain mapping de Cloud Run (consola muestra registros exactos) |
| CNAME o A/AAAA | `api.novex` | idem para backend |

Al crear el domain mapping, GCP indica los registros a publicar. Esperar propagación + certificado gestionado (Let's Encrypt vía Cloud Run / Google-managed SSL).

## 2. Cloud Run — domain mapping

```bash
gcloud beta run domain-mappings create \
  --service=novex-frontend \
  --domain=novex.cun.edu.co \
  --region=us-central1 \
  --project=it-fab-contenido-edu-5

gcloud beta run domain-mappings create \
  --service=novex-backend \
  --domain=api.novex.cun.edu.co \
  --region=us-central1 \
  --project=it-fab-contenido-edu-5
```

SSL: gestionado automáticamente tras validar DNS.

## 3. OAuth (Google Cloud Console)

Client ID actual: `550902908078-biqvngn6c1eufs3occ54cnritqrfhvl5.apps.googleusercontent.com`  
(el string **no se puede renombrar**)

Añadir:

- Authorized JavaScript origins: `https://novex.cun.edu.co`
- Authorized redirect URIs: según flujo usado (p. ej. `https://novex.cun.edu.co` / callback)

Mantener temporalmente origins de `*.run.app` hasta el corte.

## 4. CORS (backend)

Actualizar `CORS_ORIGINS` en `novex-backend`:

```
https://novex.cun.edu.co,https://novex-frontend-….run.app
```

(retirar `localhost` cuando ya no se use contra prod)

```bash
gcloud run services update novex-backend --region=us-central1 \
  --update-env-vars="^|^CORS_ORIGINS=https://novex.cun.edu.co,…"
```

## 5. Frontend / GitHub

Actualizar var `VITE_API_BASE_URL`:

```
https://api.novex.cun.edu.co/api/v1
```

Redeploy frontend (bake de Vite).

## 6. Monitoring

Actualizar uptime checks a los hosts custom (o añadir checks nuevos y retirar los de `*.run.app`).

## 7. Checklist de corte

- [ ] DNS publicado y verde en domain mapping  
- [ ] Certificado activo  
- [ ] OAuth Origins/Redirects  
- [ ] CORS actualizado  
- [ ] `VITE_API_BASE_URL` + redeploy FE  
- [ ] Smoke `https://novex.cun.edu.co` y `https://api.novex.cun.edu.co/api/v1/auth/health`  
- [ ] Uptime checks actualizados  
- [ ] Comunicar URLs antiguas `*.run.app` (pueden seguir activas)
