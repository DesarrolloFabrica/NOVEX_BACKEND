# INTERNAL vivo — afectaciones y severidad efectiva

Un problema INTERNAL deja de ser una fotografía: acumula **afectaciones** (consecuencias) mientras sigue abierto y su **severidad efectiva** puede subir con el tiempo, sin reescribir la evaluación original ni el plazo SLA.

Estado de esta fase: infraestructura completa, **sin política de escalamiento activa**. En uso normal, la severidad efectiva es igual a la reportada.

## Modelo

| Elemento | Dónde | Regla |
| --- | --- | --- |
| Severidad reportada | `situations.reported_severity` | Inmutable. Única entrada del SLA |
| Severidad efectiva | `situations.severity` | Caché de la última fila del historial. La leen listas, overview, integridad y KPI |
| Historial de severidad | `situation_severity_changes` | Append-only (trigger rechaza UPDATE). Una fila `REPORTED` por situación; `AUTO_TIME` idempotente por `(situation_id, policy_code, rule_key)`; siempre sube |
| Afectaciones | `situation_consequences` | Append-only. `occurred_at` (declarada) ≠ `created_at` (registro). Texto 1..2000 |
| Política congelada | `situations.severity_escalation_policy_code` | NULL = no escala. Hoy siempre NULL |
| Categoría | `situations.category_id` | Inmutable tras el alta; solo categorías seleccionables en altas nuevas |

`severityAtOccurrence` de una afectación se deriva del historial (último `effective_at <= occurred_at`); no se persiste.

## SLA (garantía)

```
due_at = created_at + ventana(reported_severity)
```

- `created_at` y `due_at` salen del mismo instante capturado en el alta.
- Ningún escalamiento escribe `due_at`. La ventana de aviso, `slaHealth` y `closedOnTime` usan `reported_severity`.
- `resolveDueAtOnSeverityChange` se eliminó junto con el PATCH de severidad.

## API

| Método y ruta | Permiso | Notas |
| --- | --- | --- |
| `POST /situations/register-with-analysis` | `SITUATIONS_CREATE` | `reportKind` y `coordinationId` obligatorios. INTERNAL de COORDINADOR solo en su coordinación (403). `initialConsequence?: { description }`. Transaccional |
| `GET /situations/:id` | `SITUATIONS_VIEW` | Añade `reportedSeverity`, `severityHistory[]`, `consequences[]`, `consequenceCount`, `canAddConsequence` |
| `POST /situations/:id/consequences` | `SITUATIONS_UPDATE` + `canAddConsequence` | `{ description, occurredAt? }`. INTER → 400; CLOSED → 409; futura o anterior al problema → 400. `FOR UPDATE` serializa contra la resolución |
| `PATCH /situations/:id` | `SITUATIONS_UPDATE` | Ya no acepta `severity` ni `categoryId` (400) |
| `POST /internal/jobs/situation-sweep` | OIDC de Cloud Scheduler | Avisos SLA, vencimientos SLA y escalamientos. No acepta JWT de usuario |

`canAddConsequence`: ANALISTA solo si es el autor; COORDINADOR solo si la coordinación responsable es la suya; DIRECTOR y ADMIN nunca. Siempre INTERNAL en OPEN o IN_PROGRESS.

## Barrido y Cloud Scheduler (preparado, no desplegado)

- Endpoint: `POST /api/v1/internal/jobs/situation-sweep`, protegido por `SchedulerOidcGuard`: firma Google, `iss`, `aud` exacto, `email` de la cuenta de servicio y `email_verified`. Sin configuración rechaza todo.
- Variables: `SCHEDULER_OIDC_AUDIENCE`, `SCHEDULER_OIDC_SERVICE_ACCOUNT_EMAIL`, `SITUATION_SWEEP_CRON_ENABLED` (respaldo `@Cron` cada 30 min; por defecto activo).
- Idempotencia y concurrencia: `pg_try_advisory_xact_lock` por página, `FOR UPDATE SKIP LOCKED`, `UPDATE` condicionales para vencimientos y avisos (enfriamiento 12 h), índice único para escalamientos.
- Frecuencia recomendada: cada 15 minutos.

```bash
gcloud scheduler jobs create http novex-situation-sweep \
  --schedule="*/15 * * * *" --http-method=POST \
  --uri="https://<backend>/api/v1/internal/jobs/situation-sweep" \
  --oidc-service-account-email="<cuenta>@<proyecto>.iam.gserviceaccount.com" \
  --oidc-token-audience="https://<backend>" \
  --attempt-deadline=120s --max-retry-attempts=1
```

## Migraciones

1. `1787700000000-AddSituationSeverityHistory`: columnas, enum de fuente, historial, índices, trigger append-only.
2. `1787800000000-BackfillReportedSeverity`: `reported_severity` desde `SITUATION_CREATED` → audit → severidad actual; una fila `REPORTED` por situación; reporta discrepancias sin corregirlas. NOT NULL.
3. `1787900000000-AddSituationConsequences`: tabla, CHECK de texto, índices, trigger append-only. Sin backfill.
4. `1788000000000-AddConsequenceAndEscalationTimelineEvents`: `CONSEQUENCE_ADDED` y `SEVERITY_ESCALATED`.

## Escenario QA local

```bash
npm run seed:qa-internal-vivo          # siembra / re-siembra (idempotente) y valida invariantes
npm run seed:qa-internal-vivo:clean    # elimina solo este escenario
```

Fechas relativas al momento de sembrar (re-sembrar el día de la demo). Los escalamientos son historia mock con `policy_code = 'qa-mock-history'`; la interfaz los rotula «escalamiento simulado (QA)» y el barrido no los continúa.

## Pendiente antes de producción

- [ ] Ejecutar la calibración read-only (`scripts/internal-calibration-readonly.sql`, transacción READ ONLY + ROLLBACK).
- [ ] Revisar el paso HIGH → CRITICAL.
- [ ] Escoger k y el tope.
- [ ] Definir `escalation-v1` y registrarla en `PRODUCTION_SEVERITY_ESCALATION_POLICIES`.
- [ ] Asignar `ACTIVE_SEVERITY_ESCALATION_POLICY_CODE` a los casos nuevos.
- [ ] Configurar Cloud Scheduler + OIDC (cuenta de servicio y variables).
- [ ] Medir en producción discrepancias reportada ≠ actual e INTERNAL sin coordinación antes de migrar.
- [ ] Comprobar métricas de escalamiento tras activar.
- [ ] Rollout gradual.
