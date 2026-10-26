# Publicación de la versión de cartas y circo — procedimiento y recuperación

Versión que pasa a ser la oficial: experiencia de cartas y circo (frontend) con
su backend, integrada con la corrección de duplicados de producción del 23-oct.

| Repo | Respaldo de la versión anterior (`origin/main` antes de integrar) | Rama preparada |
|---|---|---|
| NOVEX_FRONTEND | `backup/main-pre-circo-20261026` → `b20ffd312336cf66278661f3cce5beadcf07f5e8` | `release/circo-20261026` |
| NOVEX_BACKEND | `backup/main-pre-circo-20261026` → `49a64838face6ae131ad3c30dba7276f73f84a6f` | `release/circo-20261026` |

Los dos respaldos están publicados en el remoto. Las ramas `release/*` todavía no.

---

## 1. Qué está comprobado y qué sigue pendiente

### Comprobado

| Qué | Cómo |
|---|---|
| CI de ambos repositorios en verde con los mismos pasos que los workflows | ejecución local (ver §8) |
| Idempotencia del alta sin análisis IA: concurrentes, reintento, clave reutilizada, clave nueva, evidencias | tests unitarios + API real + e2e real con navegador |
| La afectación inicial y la fila REPORTED no se duplican | e2e real (consulta a la base) |
| El frontend publicado (sin `reportKind`) registra contra el backend nuevo | API real y e2e real |
| Las claves de idempotencia creadas por el backend anterior siguen reconociéndose | API real (replay de una clave creada por `main` antes de migrar) |
| Orden efectivo de migraciones con timestamps repetidos | base desechable: las 9 de cartas se aplican tras las 5 de `main` |
| El backend anterior crea y lista situaciones con el esquema nuevo | base desechable, con `1788100000000` aplicada (sin ella: 500) |
| Panel Director (lectura continua) sobre datos reales sin errores de KPIs | e2e real |

### Pendiente (no verificado)

| Qué | Por qué | Cómo cerrarlo |
|---|---|---|
| Revisión y commit que sirve hoy Cloud Run | `gcloud` exige reautenticación interactiva | §2.1 |
| Migraciones aplicadas hoy en la base de producción | sin conexión autorizada de lectura | §2.2 |
| Si hubo despliegues manuales con Cloud Build desde la rama feat | ídem | §2.1 (imagen y etiqueta `novex.git.sha`) |
| Prueba de restauración de Cloud SQL | riesgo abierto previo | `docs/BACKUP-DR.md` |
| Flujos del frontend anterior distintos del alta (p. ej. cierres) contra el backend nuevo durante la ventana | solo se verificó el alta | ventana corta: FE se publica justo después del BE |

---

## 2. Verificaciones previas (solo lectura)

### 2.1 Cloud Run: qué se sirve hoy

```bash
gcloud auth login   # interactivo; la sesión actual no se puede refrescar sin él

# Revisión con tráfico e imagen de cada servicio (sin variables de entorno ni secretos)
for svc in novex-backend novex-frontend; do
  gcloud run services describe "$svc" \
    --project=it-fab-contenido-edu-5 --region=us-central1 \
    --format="value(status.traffic,spec.template.spec.containers[0].image)"
done

# Commit de la imagen servida: la etiqueta novex.git.sha la pone el workflow
gcloud artifacts docker images describe IMAGEN_CON_DIGEST --format="value(image_summary)"
```

Debe corresponder a `b20ffd3` (frontend) y `49a6483` (backend), que son los
últimos despliegues correctos de GitHub Actions (23-oct).

### 2.2 Estado de migraciones en producción

Con una conexión autorizada y de solo lectura (Cloud SQL Auth Proxy):

```bash
# Lista de migraciones aplicadas y pendientes; NO ejecuta nada
npm run migration:show
```

Esperado antes de publicar: aplicadas todas hasta
`CreateSituationEvidenceClientKeyIndex1787400000001` (las 5 de `main` del
23-oct) y pendientes exactamente estas 10:

```
AddSituationResolutions1787200000000
GrantReportingAndClosurePermissions1787300000000
AddSituationReportKindAndAffectedCoordination1787400000000
GrantAnalystSituationsClose1787500000000
GrantDirectorKpisView1787600000000
AddSituationSeverityHistory1787700000000
BackfillReportedSeverity1787800000000
AddSituationConsequences1787900000000
AddConsequenceAndEscalationTimelineEvents1788000000000
LegacySituationInsertCompatibility1788100000000
```

Si aparece otra combinación (p. ej. migraciones de cartas ya aplicadas por un
despliegue manual, o las 5 de `main` sin aplicar), **detenerse** y revisar.

Tres migraciones de cartas comparten timestamp con migraciones de `main`
(`1787200000000`, `1787300000000`, `1787400000000`) con nombres distintos.
TypeORM identifica por nombre y aplica las pendientes aunque sean
"anteriores": comprobado en base desechable. No se renombran.

---

## 3. Respaldos

**Código.** Las ramas `backup/main-pre-circo-20261026` apuntan al `origin/main`
exacto anterior a la integración (tabla inicial). Nunca se reescribe `main`.

**Base de datos.** Imprescindible: las migraciones de cartas no se pueden
deshacer sin perder datos (§7).

```bash
# Copia bajo demanda inmediatamente antes de migrar
gcloud sql backups create --instance=novex-db --project=it-fab-contenido-edu-5 \
  --description="pre-circo-$(date +%Y%m%d-%H%M)"

# Confirmar que terminó (estado SUCCESSFUL) y anotar su ID
gcloud sql backups list --instance=novex-db --project=it-fab-contenido-edu-5 --limit=3
```

---

## 4. Orden de publicación

El backend nuevo admite el frontend anterior (alta sin `reportKind`) y el
backend anterior admite el esquema nuevo (`1788100000000`). Eso permite
publicar **sin ventana de alta caída**, en este orden:

1. **Congelar `main`** en ambos repos (nadie fusiona durante la ventana).
2. **Verificaciones** §2.1 y §2.2. Si algo no coincide, detenerse.
3. **Backup de Cloud SQL** §3.
4. **Migraciones en producción**, con el backend anterior todavía sirviendo:
   ```bash
   npm run migration:show   # revisar que el lote es exactamente el de §2.2
   npm run migration:run    # aplica el lote completo
   npm run migration:show   # todas aplicadas
   ```
   Comprobar en seguida (backend anterior + esquema nuevo): alta de una
   situación de prueba y listado de situaciones. Si falla, §6.
5. **Backend**: PR `release/circo-20261026` → `main` con *merge commit* (sin
   squash ni rebase). El push a `main` dispara `Deploy Backend`; esperar
   *Validate* verde, revisión candidata sana y promoción.
6. **Comprobaciones del backend** (§5, bloque backend). Si fallan, §6.
7. **Frontend**: PR `release/circo-20261026` → `main` con *merge commit*.
   `Deploy Frontend` hace smoke y CORS contra el backend ya publicado.
8. **Comprobaciones completas** (§5).
9. Descongelar `main`.

Entre 5 y 7 el frontend anterior sigue registrando contra el backend nuevo. La
excepción es el **analista**, que en el contrato anterior registraba sin
coordinación: recibe 400 `LEGACY_REGISTRATION_REQUIRES_COORDINATION` y debe
recargar tras el paso 7.

---

## 5. Comprobaciones posteriores

Backend:

- `GET /health` 200 y `GET /health/ready` con `"database":"up"`; `GET /api/v1/auth/me` → 401.
- Logs: ningún `QueryFailedError`; las líneas `Alta con el contrato anterior` solo durante la ventana.
- Logs del primer barrido (`Barrido: N vencidas, N avisos, 0 escalamientos`): escalamientos debe ser 0.

Frontend (con usuarios reales de cada rol):

- Login con Google y escena de circo; abanico de cartas y personaje.
- Coordinador: registrar un problema interno y una dependencia INTER; reintentar el mismo envío no duplica.
- Resolver con aprendizaje.
- Director: KPIs y modo Estado en lectura continua.
- Analista: alta desde las cartas eligiendo coordinación.
- Rutas antiguas (`/panorama`, `/reportes`, `/red-impacto`, …) redirigen al centro operacional.

## 6. Condiciones para detener el despliegue

- §2.1 o §2.2 no coinciden con lo esperado.
- El backup de Cloud SQL no termina en `SUCCESSFUL`.
- `migration:run` falla o aplica algo distinto del lote revisado.
- Tras migrar, el backend anterior no puede crear o listar situaciones.
- El workflow falla en *Validate*, *smoke* o promoción (el workflow no promueve una revisión candidata fallida).
- Errores 5xx sostenidos, `QueryFailedError` o escalamientos > 0 en el barrido.

Detenerse = no fusionar el siguiente PR y aplicar §7.

## 7. Recuperación y limitaciones

| Situación | Acción | Limitación |
|---|---|---|
| Falla el backend nuevo y ya hay revisión anterior de cartas sana | `gcloud run services update-traffic novex-backend --to-revisions=REV=100` | ninguna (mismo esquema) |
| Hay que volver al backend **anterior a cartas** | `workflow_dispatch` de *Deploy Backend* sobre `backup/main-pre-circo-20261026`, o tráfico a su revisión | funciona porque `1788100000000` sigue aplicada; **el listado global (Director/Admin) da 500 en cuanto existe un problema INTER** (espera categoría) |
| Hay que volver al frontend anterior | `workflow_dispatch` de *Deploy Frontend* sobre el respaldo, o tráfico a su revisión | solo tiene sentido junto con el backend anterior |
| Devolver `main` al código anterior sin reescribirlo | `git revert -m 1 <merge>` en cada repo (PR) | crea commits nuevos y dispara despliegue |
| Deshacer el esquema | **no recomendado**: `migration:revert` borra afectaciones, historial de severidad, severidad reportada y permisos, y se bloquea en `1787400000000` si hay problemas INTER | la vía real es restaurar el backup de §3, perdiendo lo escrito después |

Preferencia: corregir hacia delante dentro de la versión de cartas. El respaldo
de código no basta para recuperar producción si las migraciones ya corrieron.

```bash
# Despliegue manual de la versión anterior SIN tocar main (desde GitHub → Actions
# → Deploy Backend → Run workflow → rama backup/main-pre-circo-20261026).
# Equivalente con la CLI de GitHub, si está instalada:
gh workflow run deploy-backend.yml --ref backup/main-pre-circo-20261026 -f reason="rollback pre-circo"
```

## 8. Barrido automático

Configuración inicial: **sin cambios de variables**. `SITUATION_SWEEP_CRON_ENABLED`
sigue activo por defecto porque el barrido hace hoy lo mismo que el `@Cron` que
ya corre en producción (vencimientos y avisos de SLA). El escalamiento de
severidad no actúa: la política activa es `NULL`. Cloud Scheduler no se
configura en esta publicación; sin `SCHEDULER_OIDC_*` el endpoint
`POST /internal/jobs/situation-sweep` rechaza todas las llamadas.

Activación posterior (pasos y comandos): `docs/INTERNAL_VIVO.md`, sección
*Barrido y Cloud Scheduler*. Apagar el cron en proceso solo cuando Cloud
Scheduler esté configurado, para no perder los eventos de SLA.

## 9. Elementos transitorios a retirar

Cuando ya no haga falta convivir con el frontend ni el backend anteriores:

- `SituationsService.createLegacyContract` y la opcionalidad de `reportKind` en `CreateSituationDto`.
- Los triggers de `1788100000000` (con una migración nueva que los elimine; no revertir la existente).

## 10. Resultados de validación (2026-10-26, local)

| Repo | Paso del workflow | Resultado |
|---|---|---|
| Backend (`release/circo-20261026`, exportación limpia + `npm ci`) | lint (con `--fix`, como el CI) | 0 errores, 54 avisos; el `--fix` no modifica ningún archivo |
| | tests unitarios | 764 passed, 37 skipped (las suites que exigen PostgreSQL) |
| | `test:security` | 44/44 |
| | build | correcto |
| | contrato del contenedor (imagen Docker) | CMD `node dist/main.js`, liveness 200, readiness 503 sin BD |
| Frontend (exportación limpia + `npm ci`) | lint, typecheck | correctos |
| | tests unitarios | 1397/1397 |
| | build | correcto |

Antes de la integración, la candidata no pasaba el CI del backend: el paso de
lint ejecuta `eslint --fix`, que quitaba aserciones de tipo sobre
`manager.query` (falso positivo de `no-unnecessary-type-assertion`) y dejaba
el build con TS7006, además de 249 errores de lint.

Pruebas reales (base desechable, backend y navegador reales):

- Migraciones: lote de §2.2 sobre el estado de `main`, orden verificado; el
  backend anterior crea y lista tras migrar (sin `1788100000000`: 500);
  reversión completa bloqueada en `1787400000000` con problemas INTER.
- API: concurrentes (5 → 1), reintento (`replayed`), clave reutilizada (422),
  clave nueva, evidencias simultáneas (3 → 1), contrato anterior (201 /
  analista 400), replay de clave creada por `main`, INTER, resolución con
  aprendizaje, overview.
- `e2e-real` (navegador): 9/9 en dos ejecuciones completas seguidas; en una
  primera ejecución en frío falló una vez «recarga tras respuesta perdida»
  porque el detalle no se abrió solo (sin duplicado: verificado en la base).
