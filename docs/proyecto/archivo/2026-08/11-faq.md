# 11 — Preguntas Frecuentes (FAQ)

[← Volver al índice](./README.md)

---

## Uso del sistema

### ¿Cómo registro una situación?

1. Inicia sesión como **Coordinador** o **Analista**.
2. Haz clic en **Registrar situación** (barra lateral o dashboard).
3. Completa el formulario: título, descripción, coordinación, fecha y evidencias.
4. Revisa el resumen y confirma.
5. Espera el análisis IA (se ejecuta automáticamente).

Ruta directa: `/situaciones/nueva`

> Los **Directores** y **Administradores** no pueden registrar situaciones.

### ¿Cómo funciona la IA?

Al confirmar el registro, el sistema envía el contexto completo de la situación a Google Gemini. La IA devuelve un reporte ejecutivo estructurado con clasificación, impacto, recomendaciones y riesgos.

Detalle completo: [08-inteligencia-artificial](./08-inteligencia-artificial.md)

### ¿Puedo reanalizar una situación?

Sí. Desde Gestión, puedes solicitar un nuevo análisis. Cada ejecución crea una nueva versión que queda en el historial y se puede comparar con versiones anteriores.

### ¿Cómo cambio el estado de una situación?

1. Ve a **Gestión** (`/gestion`).
2. Selecciona la situación en la cola.
3. En el panel de estado, elige la transición: En atención → Resuelta → Cerrada.
4. Escribe un comentario obligatorio para Resuelta y Cerrada.

### ¿Cómo descargo un reporte?

En Gestión, abre el expediente de la situación y haz clic en **Ver análisis ejecutivo IA**. Dentro del modal, usa el botón de descarga PDF.

### ¿Cómo funciona la Red de Impacto?

Es un mapa interactivo de coordinaciones institucionales. Muestra cómo las situaciones se propagan entre áreas. Tiene tres niveles: institucional, coordinación y situación.

Detalle: [03-arquitectura-frontend](./03-arquitectura-frontend.md#impact-network--red-de-impacto)

---

## Roles y permisos

### ¿Cómo agrego un nuevo rol?

Actualmente NOVEX tiene **cuatro roles fijos** definidos en el catálogo: ADMIN, DIRECTOR, ANALISTA, COORDINADOR. Para agregar uno nuevo:

1. Agregar la definición en `NOVEX_BACKEND/src/roles/seeds/roles.catalog.seed.ts`
2. Asignar permisos en `NOVEX_BACKEND/src/permissions/seeds/permissions.catalog.seed.ts` (`ROLE_PERMISSION_CODES`)
3. Crear migración si es necesario
4. Actualizar el frontend: tipo `NovexRoleCode`, rutas, guards y experiencia de dashboard
5. Agregar pasos de onboarding para el nuevo rol

> No existe una UI para crear roles dinámicamente. Es un cambio de código.

### ¿Cómo creo un usuario?

1. Inicia sesión como **Administrador**.
2. Ve a `/admin` → sección **Usuarios**.
3. Crea el usuario con email, nombre, rol y coordinación.
4. El usuario podrá iniciar sesión con Google (debe usar el mismo email).

> NOVEX no auto-registra usuarios. El admin debe crear la cuenta primero.

### ¿Cómo creo una coordinación?

Las coordinaciones se gestionan via catálogo en el backend:

1. Agregar la entrada en `NOVEX_BACKEND/src/coordinations/seeds/coordinations.catalog.seed.ts`
2. Agregar dependencias en `CATALOG_COORDINATION_DEPENDENCIES` si aplica
3. Actualizar el mapeo en el frontend (`coordination-islands.config.ts`)
4. Reiniciar el backend con `CATALOG_SEED_ON_BOOT=true` (desarrollo) o ejecutar el seed manualmente

> No existe una UI de administración para crear coordinaciones dinámicamente.

### ¿Por qué un coordinador no ve situaciones de otra coordinación?

Es por diseño. `OperationalScopeService` filtra las situaciones por `coordinationId` del usuario. Solo los roles ANALISTA, DIRECTOR y ADMIN ven situaciones de todas las coordinaciones.

---

## Desarrollo

### ¿Cómo ejecuto el proyecto en local?

```bash
# Terminal 1: Base de datos
cd NOVEX_BACKEND && docker compose up -d

# Terminal 2: Backend
cd NOVEX_BACKEND && npm run migration:run && npm run start:dev

# Terminal 3: Frontend
cd NOVEX_FRONTEND && npm run dev
```

Detalle: [10-guia-desarrolladores](./10-guia-desarrolladores.md)

### ¿Cómo hago deploy?

El deploy es automático al hacer push a `main` en cada subproyecto (si los workflows de GitHub Actions están configurados). También puedes usar los scripts manuales.

Detalle: [09-despliegue](./09-despliegue.md)

### ¿Dónde están las variables de entorno?

- Backend: `NOVEX_BACKEND/.env.example` (copiar a `.env`)
- Frontend: crear `.env` manualmente (no existe `.env.example` actualmente)

### ¿Por qué el login con Google no funciona en local?

Verifica que:
1. `GOOGLE_CLIENT_ID` en el backend coincide con `VITE_GOOGLE_CLIENT_ID` en el frontend.
2. El OAuth client en Google Cloud Console tiene `http://localhost:5173` como origen autorizado.
3. Tu usuario existe en la base de datos y está activo.

Alternativa: activa `ENABLE_EMAIL_LOGIN=true` (backend) y `VITE_ENABLE_EMAIL_LOGIN=true` (frontend) para login por email.

### ¿Cómo agrego un nuevo permiso?

1. Agregar en `CATALOG_PERMISSIONS` en `permissions.catalog.seed.ts`
2. Asignar a roles en `ROLE_PERMISSION_CODES`
3. Usar `@RequirePermissions('NUEVO_PERMISO')` en el controller
4. Agregar guard en el frontend si aplica (`RequirePermissionRoute`)

---

## Reportes

### ¿Cómo agrego un nuevo tipo de reporte?

NOVEX no tiene un módulo de reportes independiente. Los reportes se generan de tres formas:

| Tipo | Cómo se produce | Dónde se consume |
|------|----------------|-----------------|
| **Reporte IA** | Automático al analizar una situación | Gestión, modal de detalle, PDF |
| **Dashboard metrics** | Agregación en `DashboardService` (endpoint backend; el frontend agrega en cliente) | Dashboard ejecutivo |
| **Historial de análisis** | Versionado en `SituationAnalysisSession` | Gestión → tarjeta de versión |

Para un nuevo reporte agregado, extender `DashboardService` o agregar un endpoint nuevo con su permiso correspondiente.

### ¿Puedo exportar el dashboard?

Solo el rol **Director** y **Admin** tienen el permiso `REPORTS_EXPORT`. La exportación a PDF está disponible para reportes individuales de situación (via jsPDF en el frontend).

---

## Infraestructura

### ¿Dónde está desplegado NOVEX?

Google Cloud Run en el proyecto `it-fab-contenido-edu-5`, región `us-central1`.

### ¿Cómo accedo a la base de datos de producción?

Via Cloud SQL Proxy:

```powershell
cd NOVEX_BACKEND
npm run cloud:proxy     # Puerto 15432
npm run cloud:psql      # Shell psql
```

### ¿Los workflows de GitHub Actions se ejecutan automáticamente?

Solo si el repositorio remoto es `NOVEX_BACKEND` o `NOVEX_FRONTEND` individualmente. Si el repo remoto es el monorepo padre (`Proyecto-Novex`), los workflows en subcarpetas **no se ejecutan**.

### ¿Qué pasa si Gemini falla?

El sistema registra `AI_ANALYSIS_FAILED` en el timeline de la situación y devuelve error 503. La situación queda registrada; solo el análisis falla. Se puede reintentar.

---

## Documentación

### ¿Cuál es la documentación oficial?

Esta carpeta `docs/` es la referencia oficial. Los archivos en `NOVEX_FRONTEND/DOCS/` son complementarios (arte visual) u obsoletos (MVP).

### ¿El README del backend está actualizado?

No completamente. El `NOVEX_BACKEND/README.md` aún menciona que el frontend usa mocks. La documentación en `docs/` refleja el estado actual del sistema.

---

## Siguiente paso

- [12 — Roadmap](./12-roadmap.md) para conocer la visión futura
- [10 — Guía para nuevos desarrolladores](./10-guia-desarrolladores.md) para empezar a contribuir
