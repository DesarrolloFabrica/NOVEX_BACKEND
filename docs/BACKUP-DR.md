# Backups y Disaster Recovery — NOVEX

## Cloud SQL `novex-db`

| Setting | Valor |
|---|---|
| Backups automáticos | **Habilitados** |
| Hora inicio (UTC) | `14:00` |
| Retención | 7 backups |
| Point-in-time recovery (PITR) | **Habilitado** |
| Transaction log retention | 7 días |
| Tier | `db-f1-micro` (ZONAL) |

## RPO / RTO orientativos

| Escenario | RPO | RTO estimado |
|---|---|---|
| Restore desde backup diario | ≤ 24h (+ PITR más fino) | 30–90 min (manual) |
| Rollback Cloud Run | 0 datos | minutos (tráfico a revisión previa) |

## Restaurar backup

```bash
# Listar backups
gcloud sql backups list --instance=novex-db --project=it-fab-contenido-edu-5

# Restaurar a una instancia nueva (recomendado; no overwrite in-place sin plan)
gcloud sql backups restore BACKUP_ID \
  --backup-instance=novex-db \
  --backup-project=it-fab-contenido-edu-5 \
  --project=it-fab-contenido-edu-5
```

Para PITR usar la consola Cloud SQL → Backups → “Restore to point in time”, o la API equivalente.

## Recuperación de aplicación

1. Verificar health backend/frontend.
2. Si solo app: rollback de revisión Cloud Run ([DEPLOY.md](DEPLOY.md)).
3. Si corrupción de datos: restore SQL a instancia temporal → validar → cutover de `INSTANCE_CONNECTION_NAME` / DNS interno (planificar ventana).

## Recomendaciones futuras

- Subir a `db-custom` / HA regional cuando el tráfico lo justifique.
- Prueba de restore trimestral documentada.
