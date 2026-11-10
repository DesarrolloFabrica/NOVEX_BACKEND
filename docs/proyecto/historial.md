# Historial de cambios relevantes

| Fecha | Evento |
|---|---|
| 2026-08 | Línea Alejo / docs monorepo 01–12; migración `178650` (fantasma en prod [H]) |
| 2026-10-23 | Incidente: deploy sin migraciones |
| 2026-10-27 | Release **Cartas y Circo** en prod · tags `novex-circo-prod-20261027` (BE `5ffc65f`, FE `b726c47`) |
| 2026-10-30…11-06 | Tutorial FE en `sync/casa-oficina-20261030` (4 commits) |
| 2026-11-05 | A1 mergeado a `integracion/cartas-circo` (PR #2, `72e24fe`); **no** en `main` |
| 2026-11-06 | Empalme documental BE/FE; worktrees A2/M1 documentados (luego ausentes en esta máquina) |
| 2026-11-09 | Fase 00 diagnóstico · 00b ramas `refactor/novex-consolidacion` · 00c docs compactas + tutorial integrado en consolidación FE (experimentales off) |
| 2026-11-09 | **Fase 01B.1 cerrada en código** (BE tip `2bdf12f`): anulación, traslado, auditoría transaccional, historial endurecido e indicadores históricos. Commits Codex `119ea7b`…`2bdf12f`. Pruebas 1.158 unit + 61 PG. **Sin desplegar**: exige propietario `NOLOGIN` + rol app + migrador; UI FE de anular/trasladar pendiente. |
| 2026-11-09 | **Fase 01B.2 cerrada en código** (BE `6408bc4`, FE `e38bca1`): IA solo sugiere + prompt minimizado; K-01/K-02/K-03/K-06; D8; recomendaciones congeladas; retiro de evidencias. Migraciones `17888*`/`17889*` sin aplicar. |
| 2026-11-09 | Sincronización GitHub: docs vigentes versionadas en `NOVEX_BACKEND/docs/proyecto/` + `CONTINUIDAD.md`; push solo a `refactor/novex-consolidacion` (sin tocar `main`/prod). |
| 2026-11-10 | **Fase 02 planificada (solo docs):** integración FE de anulación/traslado/evidencias/IA/sesión sobre contratos 01B; sin código ni despliegue. Detalle en `CONTINUIDAD.md` §Fase 02. |

## Ramas de trabajo (objetivo post-limpieza)

Conservar activas: `main`, `refactor/novex-consolidacion`, `Alejo-Rama`.
