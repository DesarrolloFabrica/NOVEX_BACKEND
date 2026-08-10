# NOVEX — Cierre Fase 3: Data Integrity & Authorization Reliability

**Fecha:** 2026-08-10  
**Rama:** `main`  
**Alcance:** `NOVEX_BACKEND` (sin cambios de UX/frontend)

---

## Resultado

| Métrica | Valor |
|---------|-------|
| **Estado** | **PASS** |
| **P0** | 0 |
| **P1 antes** | 5 (SEC-006, AI-002, DB-001, TEST-001, OPS-002) |
| **P1 después** | 1 (SEC-008 — requiere infra, no código) |

---

## SEC-006 — Autorización vigente

### Problema
JWT embebía permisos, rol y coordinación al login (`buildAuthPayload`). Cambios administrativos no aplicaban hasta re-login (hasta 1h).

### Solución elegida
**Opción A — JWT = identidad, servidor = autoridad actual**

- `AuthorizationEnrichmentGuard` global (después de `JwtAuthGuard`)
- `RbacService.resolveActiveAuthorization(userId)` carga estado vigente desde BD
- Reemplaza `request.user` con permisos/rol/coordinación/status actuales
- Una sola resolución por request (sin Redis, sin refresh tokens)

### Motivo
Menor complejidad que `permissionsVersion` o refresh tokens; garantiza revocación inmediata de permisos; compatible con Operational Scope existente.

### Comportamiento ante revocación
- JWT criptográficamente válido + permiso revocado → **403 Forbidden**
- Usuario desactivado → **401 Unauthorized**
- Distingue AUTHENTICATION VALID vs AUTHORIZATION REVOKED

### Impacto DB/performance
+2 queries por request autenticada (usuario+rol, permisos del rol). Sin cache distribuido en esta fase.

### Archivos clave
- `src/auth/guards/authorization-enrichment.guard.ts`
- `src/rbac/rbac.service.ts` → `resolveActiveAuthorization()`
- `test/security/phase3-authorization-stale-jwt.spec.ts`

---

## AI-002 — Persistencia atómica IA

### Unidad atómica (post-Gemini)
1. `persistAnalysis` (impacto, recomendaciones, timeline del mapper)
2. `createSession`
3. `updateCurrentAnalysisRecord`
4. Timeline `AI_ANALYSIS_VERSION_CREATED` (+ `AI_REANALYZED` si aplica)

### Momento de BEGIN
Después de validar respuesta Gemini (fuera de llamada externa).

### Momento de COMMIT
Al completar todas las escrituras de la unidad atómica.

### Rollback
Cualquier fallo dentro de `DataSource.transaction` revierte el conjunto.

### Transacción abierta durante Gemini
**NO** — Gemini ejecuta antes del `BEGIN`.

### Registro inicial (`register-with-analysis`)
Mantiene `discardFailedRegistration` si falla análisis (elimina situación + sesiones + records).

### Archivos clave
- `src/ai-orchestration/ai-orchestrator.service.ts`
- `src/ai-analysis/ai-analysis.service.ts` (+ `EntityManager` opcional)
- `src/ai-orchestration/ai-orchestrator.persistence.spec.ts`

---

## DB-001 — Paginación acotada

### Endpoints revisados

| Endpoint/DTO | Param | Default | Max | Estado |
|--------------|-------|--------:|----:|--------|
| `GET /situations` | `ListSituationsQueryDto.limit` | 50 | 100 | ✅ |
| Legacy `operational-events` DTO | `limit` | 50 | 100 | ✅ |
| Legacy `recommended-actions` DTO | `limit` | 100 | 100 | ✅ |

DTO compartido: `src/common/dto/pagination-query.dto.ts` (`PAGINATION_MAX_LIMIT = 100`).

Frontend usa máximo `limit=100` — compatible.

### Tests
`test/security/phase3-pagination.spec.ts` — limit 1/100 OK; 101/1000000/0/negativo/inválido → error validación.

---

## TEST-001 — E2E autorización en CI

### Critical E2E
Script: `npm run test:security` → `jest --testPathPattern=test/security`

### Roles / cobertura
- Anónimo → 401 (phase2)
- SEC-006 revocación → 403 (phase3)
- Matriz COORDINADOR / ANALISTA / DIRECTOR / ADMIN (phase3)
- Rate limit, Helmet, paginación (phase2/3)

### CI blocking
`.github/workflows/deploy-backend.yml`:
```
lint → unit tests → critical authorization E2E → build → deploy
```
Sin `continue-on-error`. Fallo E2E bloquea deploy.

---

## OPS-002 — Health vs Readiness

| Endpoint | Semántica | Dependencias |
|----------|-----------|--------------|
| `GET /health` | **Liveness** — proceso vivo | Ninguna |
| `GET /health/ready` | **Readiness** — listo para tráfico | Nest + `SELECT 1` DB |

### Deploy check
- **Startup probe Cloud Run:** `/health/ready` (alineado con scripts y Cloud Build)
- **Liveness probe:** `/health`
- **Promoción tráfico:** espera `/health/ready` 200 + `database: up`

Archivos actualizados: `deploy-backend.yml`, `deploy-backend.sh`, `deploy-backend.ps1`, `DEPLOY_BACKEND.md`

---

## SEC-008 — Verificación (sin cambio)

| Aspecto | Conclusión |
|---------|------------|
| Transporte producción | **UNIX SOCKET** `/cloudsql/...` (workflow valida `DB_HOST=/cloudsql/*`) |
| `rejectUnauthorized: false` | Aplica solo cuando SSL TCP está activo |
| En socket Cloud SQL | **NOT_APPLICABLE** — SSL client option no aplica al transporte Unix |
| Acción futura | **REQUIRES_INFRA_CHANGE** si se migra a TCP+SSL con verificación CA |

---

## Tests

| Suite | Resultado |
|-------|-----------|
| Backend lint | **PASS** |
| Backend tests | **105 PASS** (+16 vs Fase 2) |
| Backend build | **PASS** |
| Frontend lint | **PASS** |
| Frontend tests | **122 PASS** |
| Frontend build | **PASS** |

---

## Hallazgos restantes

| Severidad | Pendientes |
|-----------|------------|
| P0 | 0 |
| P1 | SEC-008 (infra) |
| P2 | Audit trail, logging estructurado, transacciones extendidas, bundle |
| P3 | Refactors frontend, optimizaciones SQL |
| P4 | Deuda cosmética |

---

## Recomendación Fase 4

**Observabilidad institucional y resiliencia operativa:**
1. Audit trail / structured logging
2. SEC-008 con CA Cloud SQL (si aplica TCP)
3. E2E full con DB en CI (opcional)
4. Circuit breaker Gemini / presupuestos GCP
5. Optimización bundle frontend

---

*Fase 2: [CLOSURE_PHASE_2_SECURITY_HARDENING.md](./CLOSURE_PHASE_2_SECURITY_HARDENING.md)*
