# Pruebas y desarrollo local

> **Propósito:** cómo levantar el frontend en local, qué variables necesita, qué pruebas existen, qué escribe cada comando en disco y qué valida (y qué no) la CI.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_FRONTEND `b726c47` (producción) / `7a49148` + cambios locales (tutorial)
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

> **Importante:** para escribir este documento **no se ejecutó** ningún comando de build, lint, typecheck, Vitest ni Playwright. Todo lo que sigue sale de leer configuración y scripts. `test-results/.last-run.json` (de una ejecución anterior de Playwright) indica `"status": "failed"` con `failedTests: []`; se desconoce qué falló [V del archivo, ? de la causa].

---

## 1. Requisitos locales

| Requisito | Valor | Fuente |
|---|---|---|
| Node.js | **22** (imagen `node:22-alpine`; CI `node-version: '22'`) | [Dockerfile](../../Dockerfile) línea 6, [deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml) paso *Setup Node.js* [V] |
| `.nvmrc` / `engines` | **No existen** | [V] (`package.json` sin `engines`) |
| Gestor | `npm` con `package-lock.json` (`npm ci` en CI y Docker) | [V] |
| Backend para `npm run dev` | `../NOVEX_BACKEND` con sus dependencias instaladas y PostgreSQL accesible según su propio `.env` | [scripts/dev.mjs](../../scripts/dev.mjs) [V] |
| Navegador de Playwright | Chromium (`browserName: 'chromium'` en ambas configuraciones). Se instala con `npx playwright install chromium` (descarga binarios a la caché de usuario) | [playwright.config.ts](../../playwright.config.ts) [V] |
| Docker | Solo para `e2e-real` | [e2e-real/run.mjs](../../e2e-real/run.mjs) [V] |

Observación [V]: la máquina donde se escribió esta guía tiene Node 24.x; la versión de referencia es 22. Usar 22 para reproducir la CI.

---

## 2. Variables de entorno (solo nombres)

Plantilla: [.env.example](../../.env.example). El `.env` local existe y está en `.gitignore`; **no copiar su contenido** a documentos ni commits.

| Variable | Uso | Dónde se lee |
|---|---|---|
| `VITE_API_BASE_URL` | URL base del API **con** `/api/v1`. En local se deja vacía para usar el proxy de Vite hacia `127.0.0.1:3001`. Obligatoria en build de producción (la CI exige `https://…/api/v1` y que contenga `novex-backend`) | `src/shared/api/http.ts:42` |
| `VITE_API_URL` | Alternativa heredada si la anterior está vacía | `http.ts:42`, `Dockerfile` (`VITE_API_BASE_URL=${VITE_API_BASE_URL:-$VITE_API_URL}`) |
| `VITE_GOOGLE_CLIENT_ID` | Client ID de Google OAuth. **Sin él la app lanza error al arrancar** | `src/main.tsx:12-15` |
| `VITE_ENABLE_EMAIL_LOGIN` | `'true'` muestra el login por correo (solo local; el backend también debe tener habilitado el login por email) | `src/pages/LoginPage.tsx:21` |
| `VITE_APP_NAME`, `VITE_APP_ENV` | Metadatos del pipeline: los pasa `cloudbuild.frontend.yaml` (líneas 82–84); el workflow de Actions no | **Ningún uso en `src`** [V: grep] |
| `PLAYWRIGHT_BASE_URL` | Apunta los e2e a un servidor ya levantado | `playwright.config.ts` |
| `PLAYWRIGHT_EXTERNAL_SERVER` | Si existe, Playwright no arranca Vite | `playwright.config.ts` |
| `CI` | Si existe, Playwright no reutiliza un servidor en :4173 | `playwright.config.ts` |

Las `VITE_*` se incrustan en el bundle en **tiempo de build** (Dockerfile `ARG`/`ENV`; CI `--build-arg`) [V]. No hay ninguna variable que active el tutorial guiado ([tutorial-guiado.md](tutorial-guiado.md) §7).

Variables de la CI (nombres): `vars.GCP_PROJECT_ID`, `vars.GCP_REGION`, `vars.VITE_GOOGLE_CLIENT_ID`, `vars.VITE_API_BASE_URL`, `vars.ARTIFACT_REGISTRY_REPOSITORY`, `vars.FRONTEND_IMAGE_NAME`, `vars.CLOUD_RUN_SERVICE_FRONTEND`; secreto `secrets.GCP_SERVICE_ACCOUNT_KEY` [V].

---

## 3. Scripts npm

De [package.json](../../package.json) [V]:

| Script | Comando real | Qué hace | Escribe en disco |
|---|---|---|---|
| `npm run dev` | `node scripts/dev.mjs` | Si `../NOVEX_BACKEND` existe y su `/health` no responde, lanza `nest start --watch` allí; espera `/health/ready` hasta 90 s; luego arranca Vite (pasa los argumentos extra). Si falta el backend, solo Vite | Caché `node_modules/.vite/` del FE; el backend compila en watch (su `dist/`) [I] |
| `npm run dev:frontend` | `vite` | Solo Vite (proxy `/api` → `127.0.0.1:3001`) | `node_modules/.vite/` |
| `npm run build` | `tsc -b && vite build` | Typecheck por referencias + bundle | **`dist/`** y `node_modules/.tmp/*.tsbuildinfo` |
| `npm run preview` | `vite preview` | Sirve `dist/` | No |
| `npm run typecheck` | `tsc -b --noEmit` | Tipos de `tsconfig.app/test/node.json` | `node_modules/.tmp/*.tsbuildinfo` [I: `tsBuildInfoFile` declarado y presente] |
| `npm test` | `vitest run src` | Unitarias | Caché `node_modules/.vite/vitest/` [I: directorio presente] |
| `npm run test:e2e` | `playwright test` | E2E con API mockeada | **`test-results/`** (ver §5) y `e2e/artifacts/` en algunas specs |
| `npm run lint` | `oxlint` | Lint (`.oxlintrc.json`: plugins react/typescript/oxc; `rules-of-hooks` = error) | No |

`dist/`, `test-results/`, `playwright-report/`, `.vite/` y `e2e/artifacts/` están en `.gitignore` [V].

### 3.1 Solo lectura frente a generadores de archivos

| Solo lectura (no crean ni modifican archivos del repo) | Generan archivos |
|---|---|
| `npm run lint` | `npm run build` → `dist/`, tsbuildinfo |
| `git status`, `git log`, `git diff`, `git show`, `git grep` | `npm run typecheck` → tsbuildinfo en `node_modules/.tmp/` [I] |
| `npm run preview` (solo sirve `dist/`) | `npm test` → caché en `node_modules/.vite/vitest/` [I] |
| `GET` a `/health` del frontend y `/health/ready` del backend | `npm run test:e2e` → `test-results/playwright/`, `test-results/.last-run.json`, `test-results/pilot-screens*/`, `test-results/<otros>.png`, `e2e/artifacts/` |
| | `node e2e-real/run.mjs` → contenedor Docker y su BD, **`../NOVEX_BACKEND/dist/`**, `test-results/playwright-e2e-real/` |
| | `npm run dev` / `dev:frontend` → caché Vite; arranca procesos del backend |
| | `npx playwright install` → binarios en la caché de usuario |

Según [CLAUDE.md](../../CLAUDE.md) §8, pedir autorización antes de ejecutar comandos que escriban archivos si la fase no la concede.

---

## 4. Pruebas unitarias (Vitest)

| Aspecto | Valor |
|---|---|
| Alcance | `vitest run src` → 146 archivos `*.test.ts(x)` en `src` [V: conteo] |
| Configuración | No hay `vitest.config.*`; Vitest usa [vite.config.ts](../../vite.config.ts) (alias `@` → `src`, plugins React y Tailwind). No hay bloque `test` [V] |
| Entorno | Por defecto `node` [I: valor por defecto de Vitest]; 14 archivos declaran `@vitest-environment` (jsdom, dependencia de desarrollo) [V] |
| Tipos | `tsconfig.test.json` incluye `src` con tipos `vite/client` y `node` [V] |
| Guardas notables | `src/app/production-data-sources.test.ts` impide que la app publicada importe mocks ([CLAUDE.md](../../CLAUDE.md) §9) [H]; `tours/coordinatorPilot.test.ts` (ver su limitación en [tutorial-guiado.md](tutorial-guiado.md) §8.3) |

Ejecutar un archivo: `npx vitest run src/modules/onboarding/engine/tourGeometry.test.ts`.

---

## 5. E2E con API mockeada (Playwright, `e2e/`)

[playwright.config.ts](../../playwright.config.ts) [V]:

| Aspecto | Valor |
|---|---|
| Specs | 54 `*.spec.ts` en `e2e/` (incluye 4 sin seguimiento del tutorial) [V: conteo] |
| Servidor | Vite **dev** (`vite --host 127.0.0.1 --port 4173`), listo cuando responde `/red-impacto`. Al ser dev, `import.meta.env.DEV` es verdadero: el piloto del tutorial está disponible |
| Reutilización | `reuseExistingServer: !CI`. Cuidado: reutiliza lo que haya en 4173 aunque sea un servidor viejo (comentario del config) |
| Navegador | Chromium, `colorScheme: 'dark'`, `contextOptions.reducedMotion: 'reduce'` |
| Tiempos | `timeout` 30 s; `expect` 8 s; `fullyParallel: false` |
| Salidas | `outputDir: test-results/playwright`; captura solo al fallar; traza retenida al fallar; sin vídeo; reporter `list` (no genera `playwright-report/`) |
| Mocks | Cada spec intercepta `**/api/v1/**` con `page.route` y siembra token/sesión en `localStorage` (p. ej. `e2e/coordinator-pilot.fixture.ts`, `operational-overview.fixture.ts`, `role-experience.fixture.ts`). No necesita backend |

Ejemplos: `npm run test:e2e -- e2e/coordinator-pilot-tour.spec.ts` · `npx playwright test e2e/coordinator-pilot` (todas las del piloto).

---

## 6. E2E contra backend real (`e2e-real/`)

Punto de entrada **recomendado**: `node e2e-real/run.mjs` desde `NOVEX_FRONTEND` [V, comentario de cabecera]. Hace, en orden:

1. Crea o arranca el contenedor Docker `novex-e2e-pg` (`postgres:17-alpine`, puerto local 55433) con una BD cuyo nombre debe contener `test` (aborta si no).
2. Fija todo el entorno en el propio script (BD `TEST_DB_*` → `DB_*`, JWT, Google ficticio, login por email habilitado, Gemini apuntando a un stub en `127.0.0.1:4010`, `VITE_API_BASE_URL`/`VITE_API_URL` vacías). «No se lee `.env`».
3. Siembra la BD de prueba (`test/e2e-support/seed-e2e-database.ts` del backend).
4. `npm run build` en `../NOVEX_BACKEND`.
5. `npx playwright test -c playwright.e2e-real.config.ts`, que levanta tres servidores **sin reutilizar** (`reuseExistingServer: false`): stub de Gemini (:4010), `node dist/main.js` del backend (:3001, listo en `/health/ready`) y Vite (:4173, `--strictPort`).

Requisitos: Docker, dependencias del backend instaladas (`ts-node`), puertos 3001, 4010, 4173 y 55433 libres (detener `npm run dev` antes). Timeout por test 120 s, 1 worker.

Cobertura actual (`e2e-real/registration-resilience.spec.ts`) [V]: doble clic en Registrar, reintento y recarga tras respuesta perdida, clave nueva para un problema nuevo, clave reutilizada con otro contenido, envíos y evidencias simultáneas con la misma clave, compatibilidad con un frontend sin `reportKind`, lectura del DIRECTOR en modo Estado.

> **Advertencias:**
> - No ejecutes `npx playwright test -c playwright.e2e-real.config.ts` directamente: así **no** se fijan las variables de `run.mjs`, y el backend arrancaría con su propio entorno o `.env`, que podría apuntar a una base no desechable [I]. Usa `run.mjs`. Corregido en [CLAUDE.md](../../CLAUDE.md) §8 el 2026-11-06 (Fase 2C).
> - En `playwright.e2e-real.config.ts`, `reducedMotion: 'reduce'` está en el nivel superior de `use`; el comentario de `playwright.config.ts` advierte que en esa posición Playwright lo ignora y que debe ir en `contextOptions` [V]. Efecto: estos e2e corren con animaciones.
> - Nunca apuntar `TEST_DB_*`/`DB_*` a una base compartida.

---

## 7. Qué ejecuta GitHub Actions

Único workflow: [.github/workflows/deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml) [V].

| Aspecto | Valor |
|---|---|
| Disparadores | `push` a `main` y `workflow_dispatch`. **No hay disparador en `pull_request`**: un PR no ejecuta ninguna validación automática |
| Job `validate` | `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build` (Node 22) |
| No ejecuta | `npm run test:e2e`, `e2e-real` |
| Job `build-push-deploy` | Build Docker con `VITE_*`, push a Artifact Registry, `gcloud run deploy --no-traffic` con etiqueta candidata, smoke (`/`, `/health`, `/health` del backend, preflight CORS de `register-with-analysis`), promoción al 100 % y retirada de la etiqueta |

Consecuencia: **un push a `main` despliega producción** si `validate` pasa ([CLAUDE.md](../../CLAUDE.md) §5).

---

## 8. Lista de comprobación antes de un PR

1. `git status` y `git log -1`: rama correcta (nunca `main` local, que está desactualizada) y sin cambios ajenos mezclados. Preservar los cambios del tutorial ([tutorial-guiado.md](tutorial-guiado.md) §9).
2. Si toca la API: contrastar controlador, DTO y permiso en NOVEX_BACKEND ([contratos-api.md](contratos-api.md)). Recordar `forbidNonWhitelisted`.
3. `npm run lint` (solo lectura).
4. `npm run typecheck` · `npm test` (con autorización si la fase lo exige).
5. `npm run build` (escribe `dist/`): reproduce el paso de CI; requiere `VITE_GOOGLE_CLIENT_ID` y `VITE_API_BASE_URL` definidas en el entorno del build, o fallará al arrancar/llamar.
6. `npm run test:e2e` de las specs afectadas (la CI no lo hará). Revisar que el puerto 4173 no tenga un servidor viejo.
7. Si toca el alta de situaciones o la idempotencia: `node e2e-real/run.mjs`.
8. En el PR: qué se ejecutó, resultado literal, qué no se ejecutó, riesgos. PR hacia `integracion/cartas-circo`, no hacia `main`.

---

## Límites de verificación

- No se ejecutó ningún comando de prueba, build ni app.
- Rutas de caché de Vitest y tsbuildinfo inferidas de la configuración y de directorios existentes; no se observó su escritura.
- Si el backend respeta las variables de `run.mjs` frente a su `.env` depende de su carga de configuración; no se leyó [?].
- Lo que hace `nest start --watch` en disco es del backend; ver NOVEX_BACKEND → `docs/empalme/pruebas-y-desarrollo.md` [I].
- Conteos de archivos de prueba hechos el 2026-11-06 sobre el working tree.

## Documentos relacionados

- [README de empalme](README.md) · [Arquitectura](arquitectura.md) · [Roles y navegación](roles-y-navegacion.md) · [Cartas y gráficas](cartas-y-graficas.md) · [Tutorial guiado](tutorial-guiado.md) · [Contratos API](contratos-api.md) · [CLAUDE.md](../../CLAUDE.md)
- Backend (sin enlace): NOVEX_BACKEND → `docs/empalme/pruebas-y-desarrollo.md`, NOVEX_BACKEND → `docs/empalme/despliegue-y-operacion.md`, NOVEX_BACKEND → `docs/empalme/base-de-datos-y-migraciones.md`
