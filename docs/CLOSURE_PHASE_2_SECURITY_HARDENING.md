# NOVEX — Cierre Fase 2: Security Hardening

**Fecha:** 2026-08-10  
**Rama:** `main`  
**Alcance:** `NOVEX_BACKEND` (sin cambios funcionales en frontend)

---

## Resultado

| Métrica | Valor |
|---------|-------|
| **Estado** | **PASS** |
| **Score Security antes** | 42/100 (auditoría inicial) |
| **Score Security estimado después** | **58/100** |

P0 permanece en **0**. Cuatro hallazgos P1 de seguridad/IA cerrados en esta fase.

---

## Hallazgos cerrados

| ID | Título | Estado |
|----|--------|--------|
| SEC-007 | Sin autenticación global por defecto | **RESOLVED** |
| SEC-004 | Sin rate limiting | **RESOLVED** |
| SEC-005 | Sin security headers / Helmet | **RESOLVED** |
| AI-001 | Sin timeout explícito en Gemini | **RESOLVED** |

---

## Authentication model

**PRIVATE BY DEFAULT**

- `JwtAuthGuard` registrado como `APP_GUARD` global.
- Decorador `@Public()` (`IS_PUBLIC_KEY`) para excepciones explícitas.
- `PermissionsGuard` permanece **por controlador** (sin cambio al modelo de autorización).
- Operational Scope sin cambios.

### Guard global

```typescript
// app.module.ts
{ provide: APP_GUARD, useClass: JwtAuthGuard }
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

`JwtAuthGuard` consulta `Reflector` y omite JWT solo cuando `@Public()` está presente.

### Public decorator

Ubicación: `src/auth/decorators/public.decorator.ts`

---

## Public endpoint allowlist

Solo estos endpoints son intencionalmente públicos:

| Method | Endpoint | Motivo |
|--------|----------|--------|
| `POST` | `/api/v1/auth/google` | Inicio de sesión OAuth |
| `POST` | `/api/v1/auth/email` | Login dev local (`ENABLE_EMAIL_LOGIN=true`) |
| `GET` | `/health` | Liveness probe Cloud Run (Express pre-Nest) |
| `GET` | `/health/ready` | Readiness probe Cloud Run (Express pre-Nest) |
| `GET` | `/api/v1/auth/health` | Compatibilidad histórica uptime (Express pre-Nest) |

**No públicos (verificados):**

- `GET /api/v1/auth/me` → **401** sin JWT
- `GET /api/v1/situations`, `/situations/categories`, `/users`, `/dashboard/metrics` → **401** sin JWT

Todos los demás controladores Nest requieren JWT automáticamente.

---

## Rate limiting

Implementado con `@nestjs/throttler` v6.5.0.

| Endpoint/Scope | Limit | Window | Motivo |
|----------------|-------|--------|--------|
| **default** (global) | 200 req | 60 s | Tráfico legítimo de dashboards y listados |
| **auth** (`POST /auth/google`, `POST /auth/email`) | 15 req | 60 s | Anti fuerza bruta en login |
| **gemini** (`POST /situations/register-with-analysis`, `POST /situations/:id/analyze`) | 10 req | 60 s | Mitigar abuso de costo IA |

Exceso de límite → **HTTP 429 Too Many Requests**.

Health probes (`/health`, `/health/ready`) están **fuera** del pipeline Nest y no son throttled.

### Tests 429

- `test/security/phase2-rate-limit.spec.ts` — límites global, auth y gemini con overrides deterministas (`limit: 2`).

---

## HTTP Security (Helmet)

- `helmet` aplicado en `main.ts` sobre la instancia Express compartida.
- `expressApp.disable('x-powered-by')` — no expone `X-Powered-By: Express`.
- Headers verificados en tests:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: no-referrer`
- **CSP deshabilitada** (`contentSecurityPolicy: false`) — API JSON; evita conflictos con Swagger/diagnóstico. Documentado como excepción intencional.

---

## Gemini (AI-001)

| Aspecto | Valor |
|---------|-------|
| **Timeout** | `GEMINI_TIMEOUT_MS` (default **60000** ms) |
| **Mecanismo** | `AbortController` + `abortSignal` en `generateContent` del SDK `@google/genai` |
| **Error timeout** | **504 Gateway Timeout** (`GatewayTimeoutException`) |
| **Cancelación real** | Sí — señal abort propagada al SDK; cliente deja de esperar (uso en proveedor puede seguir facturándose según nota del SDK) |
| **Errores proveedor** | `503 Service Unavailable` genérico, sin stack trace |

### AI-002 (no implementado)

Persistencia IA sin transacción atómica — **documentado para fase posterior**. El orquestador ya revierte registro si el análisis falla; el timeout no introduce persistencia parcial adicional.

### Cost abuse (post-Fase 2)

| Vector | Estado |
|--------|--------|
| Anónimo → Gemini | **Imposible** (JWT global + sin endpoints legacy) |
| Autenticado → Gemini ilimitado | **Mitigado** (10 req/min por usuario/IP + timeout 60s) |

Rate limiting **no reemplaza** cuotas presupuestarias GCP/Gemini — recomendación de infra: configurar budgets/alerts en Google Cloud Console.

---

## Investigación adicional (sin implementar)

### SEC-006 — Permisos embebidos en JWT

| Aspecto | Hallazgo |
|---------|----------|
| Expiración JWT | Default `JWT_EXPIRES_IN=1h` |
| Construcción payload | `buildAuthPayload()` embebe `permissions[]` al login |
| Cambio de rol/permisos por ADMIN | **No se refleja** hasta nuevo login (ventana hasta 1h) |
| Refresh token | No existe |
| **Recomendación Fase 3** | Evaluar: (a) TTL más corto para roles sensibles, (b) `permissionsVersion` en JWT con invalidación al cambiar RBAC, o (c) lookup server-side solo en operaciones `SYSTEM_*` / `AI_ANALYZE` |

### SEC-008 — Database SSL `rejectUnauthorized: false`

| Contexto | Evidencia |
|----------|-----------|
| Ubicación | `database.config.ts` línea 56 |
| Cuándo aplica | `ssl: { rejectUnauthorized: false }` cuando `DB_SSL=true` **o** producción con host TCP (no `/cloudsql/`) |
| Local dev | `DB_SSL=false` → SSL desactivado — **NOT_APPLICABLE** |
| Cloud SQL socket | Host `/cloudsql/...` → SSL flag false en config actual — **NOT_APPLICABLE** |
| Producción TCP | **REQUIRES_GCP_VERIFICATION** antes de `rejectUnauthorized: true` |
| Riesgo | MITM teórico en canal TLS sin verificación de CA; cambio a ciegas puede romper conexión |
| **Veredicto** | **NEEDS_CHANGE** (largo plazo) — requiere certificado CA de Cloud SQL en runtime |

---

## Tests

| Suite | Resultado |
|-------|-----------|
| Backend lint | **PASS** |
| Backend tests | **89 PASS** (+22 vs Fase 1) |
| Backend build | **PASS** |
| Frontend lint | **PASS** (warnings preexistentes) |
| Frontend tests | **122 PASS** |
| Frontend build | **PASS** |

Nuevos tests:

- `test/security/phase2-global-auth.spec.ts`
- `test/security/phase2-rate-limit.spec.ts`
- `test/security/phase2-helmet.spec.ts`
- `src/ai-orchestration/providers/gemini.provider.spec.ts`

---

## Regresión funcional (verificación por diseño)

| Área | Estado |
|------|--------|
| Onboarding | Sin cambios de código |
| RBAC / PermissionsGuard | Sin cambios de matriz |
| Operational Scope | Sin cambios |
| Health `/health` | Express pre-Nest, sin JWT |
| Readiness `/health/ready` | Express pre-Nest, sin JWT |

---

## Dependencias añadidas

- `@nestjs/throttler@6.5.0`
- `helmet`
- `@types/helmet` (dev)

---

## Hallazgos restantes

| Severidad | Pendientes clave |
|-----------|------------------|
| **P0** | 0 |
| **P1** | SEC-006 (JWT stale permissions), DB-001, TEST-001, OPS-002 |
| **P2** | AI-002 (transacciones IA), audit trail, logging estructurado, bundle |
| **P3** | Refactors frontend, optimizaciones SQL |
| **P4** | Deuda cosmética, mejoras UX menores |

---

## Recomendación Fase 3

**Fase 3 — Resiliencia IA y gobernanza de permisos:**

1. Transacciones atómicas en persistencia IA (AI-002)
2. Estrategia para permisos JWT stale (SEC-006) — sin refresh tokens masivos
3. `@Max()` en paginación (DB-001)
4. E2E autorización en CI (TEST-001)
5. Verificación SSL Cloud SQL con CA oficial (SEC-008)

---

## Criterios de aceptación Fase 2

- [x] API privada por defecto
- [x] `@Public()` explícito
- [x] Solo endpoints intencionales públicos
- [x] `/auth/me` requiere JWT
- [x] `/health` y `/health/ready` sin JWT
- [x] Situations requiere JWT
- [x] PermissionsGuard operativo
- [x] Operational Scope operativo
- [x] Rate limiting global + auth + Gemini
- [x] 429 en exceso
- [x] Helmet activo
- [x] X-Powered-By no expuesto
- [x] Gemini timeout real con cancelación
- [x] Error timeout controlado (504)
- [x] CI quality gates PASS
- [x] Documentación actualizada

---

*Fase 1: [CLOSURE_PHASE_1_P0.md](./CLOSURE_PHASE_1_P0.md)*
