# Incidente 2026-10-23: migraciones de main no aplicadas en producción

Informe sin secretos ni datos personales. Fechas en UTC.

## Resumen

| | |
|---|---|
| Inicio | 2026-10-23 14:00, cinco minutos después de desplegar `49a6483` (revisión `novex-backend-00085-tug`) |
| Síntoma | `QueryFailedError: column Situation.client_request_id does not exist` en toda consulta de situaciones; el cron de SLA falló cada 30 min (último aviso SLA correcto: semana del 19-oct) |
| Causa | el workflow despliega el código pero no ejecuta migraciones; las 5 migraciones de la corrección de duplicados de `49a6483` nunca se aplicaron |
| Impacto observado | sin peticiones de usuarios en el periodo (solo el smoke del despliegue); avisos SLA no generados del 23 al 26-oct |
| Mitigación | 2026-10-26 16:29: tráfico a `novex-backend-00079-fig` (`6b58d27`) |
| Corrección | 2026-10-26 17:13: aplicadas las 5 migraciones; 17:14: tráfico de vuelta a `novex-backend-00085-tug` |

## Estado de la base antes de la corrección (consultado en solo lectura)

13 migraciones aplicadas: 10 base del repositorio, `AllowAnalystUnassignedSituations1786500000000`
(no existe en ningún commit del repositorio) y 2 de la rama de cartas
(`AddSituationResolutions1787200000000`, `GrantReportingAndClosurePermissions1787300000000`),
aplicadas con el despliegue manual por Cloud Build del 22-sep (`4a8d936`).

Pendientes según `49a6483` (verificadas por nombre antes de escribir):

```
AddSituationClientRequestId1787200000000
CreateSituationClientRequestUniqueIndex1787200000001
AddSituationAnalysisClaim1787300000000
AddSituationEvidenceClientKey1787400000000
CreateSituationEvidenceClientKeyIndex1787400000001
```

## Procedimiento ejecutado

Script: `scripts/hotfix-20261026-migraciones-main.sh` (fases A–D, más S para la
firma del esquema). Ejecutado en Cloud Shell porque el firewall de la oficina
re-firma el TLS hacia Cloud SQL. Configuración leída de la revisión que recibe
tráfico; contraseña leída en memoria desde Secret Manager.

| Fase | Resultado |
|---|---|
| A · solo lectura | 13 aplicadas; pendientes = exactamente las 5; 18 situaciones, 44 evidencias, 236 eventos |
| B · copia | `1793034669505`, ON_DEMAND, 17:11:09 → 17:12:40, **SUCCESSFUL** (descripción `pre-hotfix-49a6483-20261026171108`) |
| C · migraciones | las 5 ejecutadas; los dos índices `CONCURRENTLY` declaran `transaction = false` y se crearon fuera de transacción |
| D · solo lectura | 18 aplicadas, ninguna pendiente; 5 columnas NULL presentes; `uq_situations_creator_client_request` y `uq_situation_evidences_client_key` válidos y listos; 18/44/236 sin cambios y mismas fechas de última escritura |

Antes se ensayó en una base desechable PostgreSQL 16 con el estado de
producción: `49a6483` daba 500 en `/situations` (reproducía el incidente) y,
tras las 5 migraciones, tanto `49a6483` como `6b58d27` respondían 200.

La copia NO equivale a un restore probado: no hay ninguna restauración en el
historial de `novex-db` (procedimiento en `docs/RESTORE-TEST.md`).

## Verificación tras volver a `novex-backend-00085-tug`

Comprobado: `/health` 200; `/health/ready` 200 con `database: up`;
`/api/v1/auth/me` sin token 401; preflight CORS de registro con
`idempotency-key` 204 para el origen del frontend publicado; preflight de
evidencias 204; ningún error en los logs desde el cambio. El cron de SLA (cada
30 min) es la primera consulta interna de situaciones de esta revisión.

Pendiente (requiere un usuario real; no se crean registros de prueba ni tokens):
listado de situaciones en la interfaz, registro con notas de captura y
reintento sin duplicar. Pasos en §«Prueba manual».

## Migración no versionada `AllowAnalystUnassignedSituations1786500000000`

Firma del esquema `public` (columnas, tipos, nulabilidad, defaults, índices,
restricciones, enums, triggers y funciones; `scripts/schema-signature-readonly.sql`)
de producción frente a una base construida solo con las migraciones del
repositorio en el mismo estado: **459 líneas idénticas, ninguna diferencia**.
No deja huella estructural (su efecto probable, hacer `coordination_id`
nullable, lo hace también `MakeSituationCoordinationNullable1786700000000`).
Lo que la comparación no puede descartar es un cambio de datos. Su entrada en
`typeorm_migrations` se conserva; no se crea ninguna migración para ocultarla.

## Prueba manual pendiente (usuario real, en producción)

**Estado: comprobación previa al despliegue parcial, confirmada por el usuario el
27-oct sobre el frontend anterior `b20ffd3` (publicado):** login, listado y detalle
de situaciones existentes correctos. **No se ha hecho alta nueva.** Pendiente: alta
con una situación real (notas, una sola aparición) y revisión visual de cartas y
circo al publicar. No se aprueba por ausencia de errores en logs.

1. Login real con la cuenta del usuario.
2. Listado y detalle de situaciones existentes.
3. Si el usuario tiene una situación real que registrar: guardar las notas de
   captura y comprobar que aparece **una sola vez** en el listado y que no aparece
   el aviso «No se guardaron algunas notas».

No se provocan dobles clics ni se crean situaciones ficticias en producción.

## Lecciones

- El workflow de despliegue no ejecuta migraciones y su smoke no consulta
  tablas de dominio: un esquema atrasado pasa todas sus comprobaciones.
- Hubo un despliegue manual de una rama no publicada (22-sep) que dejó
  migraciones aplicadas fuera de `main`.
- La base solo es accesible desde la red de oficina con inspección TLS; la vía
  segura es Cloud Shell.
