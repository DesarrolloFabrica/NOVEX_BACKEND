# Costos — NOVEX

## Configuración actual (favorable)

| Recurso | Setting | Efecto |
|---|---|---|
| Cloud Run | maxScale 5, min implícito 0 | Scale-to-zero reduce costo idle |
| Cloud Run FE | 512Mi | Adecuado para nginx estático |
| Cloud Run BE | 1Gi / 1 CPU | Suficiente para Nest + SQL |
| SQL | `db-f1-micro` 10GB | Barato; límite de performance |
| AR | Solo tags SHA (sin spam `:latest` en CI nuevo) | Menos almacenamiento |

## Ahorros recomendados (sin tocar prod ahora)

1. **Lifecycle Artifact Registry**: borrar imágenes `novex-*` > N días no referenciadas por revisiones Cloud Run.
2. **Logging**: retention 30 días en sinks de Cloud Run; evitar `DB_LOGGING=true` en prod (ya `false`).
3. **Uptime**: periodo 1 min es sensible; si el costo de checks sube, pasar a 5 min.
4. **SQL**: mantener micro mientras QPS sea bajo; no habilitar HA hasta necesidad (×2 costo aprox.).
5. **CPU boost** (`startup-cpu-boost`): útil para cold start; revisar si min-instances=0 genera muchos boosts costosos.
6. **CATALOG_SEED_ON_BOOT**: si hace trabajo en cada cold start, desactivar en prod reduce CPU de arranque.

## Qué no bajar a ciegas

- Memoria backend < 1Gi sin prueba de carga (Node + TypeORM).
- maxScale demasiado bajo en picos institucionales.
