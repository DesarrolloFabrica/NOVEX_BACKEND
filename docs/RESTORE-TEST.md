# Prueba de restauración de Cloud SQL en una instancia aislada

> Estado: **preparado, no ejecutado**. Crear la instancia de prueba es crear
> infraestructura y copiar datos de producción: requiere autorización expresa.
> Nada de este procedimiento escribe en la instancia de producción.

## Objetivo

Demostrar que una copia de producción se puede restaurar y leer, medir el
tiempo real (RTO) y, sobre esa copia aislada, ensayar las migraciones de la
versión de cartas con datos reales antes de aplicarlas en producción.

## Recursos que se crean

| Recurso | Detalle | Vida |
|---|---|---|
| Instancia Cloud SQL `novex-db-restore-test-AAAAMMDD` | clon de la instancia de producción (mismo motor y versión), zonal, **sin HA**, backups automáticos desactivados tras crearla | horas; se borra al terminar |
| Disco | mismo tamaño que el origen (lo fija el clon) | ídem |
| Conexión | Cloud SQL Auth Proxy local (contenedor), sin redes autorizadas | durante la prueba |

No se crean cuentas, secretos ni servicios de Cloud Run. No se cambia ninguna
red ni regla de firewall.

## Coste orientativo

Se factura por hora mientras la instancia existe: CPU/memoria según el tier
más almacenamiento SSD prorrateado. Con el tier que `release-circo-preflight.ps1`
informe (la documentación anterior indicaba `db-f1-micro`, zonal) y unos GB de
disco, una prueba de 2–4 horas cuesta del orden de **céntimos a pocos dólares**.
Antes de autorizar, confirmar con la calculadora oficial de Google Cloud usando
el tier, el tamaño de disco y la región reales que muestra el preflight. El
coste crece si la instancia se olvida encendida: el paso de borrado es
obligatorio.

## Procedimiento (PowerShell)

```powershell
$Project  = 'it-fab-contenido-edu-5'
$Source   = '<instancia real que informa el preflight>'   # nunca escribir aquí a mano otra cosa
$Target   = "novex-db-restore-test-$(Get-Date -Format yyyyMMdd)"

# 0) Salvaguarda: el destino NO puede ser la instancia de producción.
if ($Target -eq $Source) { throw 'Destino = origen: abortado.' }

# 1) Clonar (crea una instancia NUEVA a partir de las copias/logs del origen;
#    el origen no se modifica). Opcional: --point-in-time="AAAA-MM-DDTHH:MM:SSZ"
gcloud sql instances clone $Source $Target --project=$Project

# 2) Quitar costes innecesarios de la copia: sin backups automáticos.
gcloud sql instances patch $Target --no-backup --project=$Project

# 3) Validación de solo lectura: mismos recuentos que el preflight de producción.
#    (mismo script, apuntando al clon; ver release-circo-preflight.ps1)
#    Comparar con los recuentos de referencia de producción: deben coincidir
#    salvo lo escrito después del instante del clon.

# 4) (Opcional, con autorización) Ensayo de migraciones sobre la COPIA:
#    npm run migration:show / migration:run apuntando al proxy del clon,
#    y repetir el preflight para ver los datos ya migrados.

# 5) Borrar la instancia de prueba y comprobar que ya no existe.
gcloud sql instances delete $Target --project=$Project --quiet
gcloud sql instances list --project=$Project --format="value(name)"
```

## Qué se documenta al terminar

- Instante del clon, duración de cada paso (RTO real) y tamaño restaurado.
- Recuentos del clon frente a producción.
- Si se ensayaron migraciones: resultado y avisos (p. ej. severidades editadas).
- Confirmación del borrado de la instancia de prueba.

## Restaurar una copia concreta (en lugar de clonar)

`gcloud sql backups restore` **sobrescribe la instancia indicada en
`--restore-instance`**. Solo se usa con una instancia destino nueva y vacía,
nunca con la de producción:

```powershell
gcloud sql backups restore BACKUP_ID `
  --backup-instance=$Source `
  --restore-instance=$Target `
  --project=$Project
```
