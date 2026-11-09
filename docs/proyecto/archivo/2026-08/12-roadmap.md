# 12 — Roadmap

[← Volver al índice](./README.md)

---

> Este documento recoge **ideas y direcciones futuras** identificadas en el código, comentarios del equipo y brechas documentadas. Nada de lo listado aquí está implementado ni comprometido. Sirve como visión para planificación.

## Estado actual (referencia)

NOVEX hoy es una plataforma funcional con:

- Autenticación Google OAuth + JWT con RBAC
- Registro, análisis IA, gestión y cierre de situaciones
- Red de Impacto interactiva
- Dashboard ejecutivo por rol
- Onboarding guiado
- Despliegue en Cloud Run con CI/CD

## Consolidación técnica

### Unificar dominios legado y actual

El backend mantiene dos dominios paralelos: **situaciones** (actual) y **eventos operacionales** (Sprint 6–7). La visión es consolidar todo en el dominio de situaciones y retirar los módulos legados (`operational-events`, `intelligence`, `operational-areas`, `demo-users`).

**Impacto:** simplificar la arquitectura, cerrar endpoints sin autenticación y eliminar duplicidad de pipelines de IA.

### Alinear nomenclatura OMEGA → NOVEX

Scripts manuales de deploy, Cloud Build y documentación del frontend aún usan nombres `omega-*`. La fuente de verdad (GitHub Actions) ya usa `novex-*`, pero la alineación completa está pendiente.

### Workflows en monorepo

Los workflows de GitHub Actions viven dentro de cada subproyecto. Si el repositorio remoto es el monorepo padre, no se ejecutan. Mover o duplicar workflows a la raíz del monorepo.

## Infraestructura y despliegue

| Idea | Origen | Prioridad sugerida |
|------|--------|-------------------|
| Migraciones automáticas en deploy | Brecha documentada en DEPLOY_BACKEND.md | Alta |
| Infrastructure as Code (Terraform) | No existe actualmente | Media |
| Workload Identity Federation para GitHub Actions | Documentado pero no implementado | Media |
| CORS restrictivo via `CORS_ORIGINS` | Variable configurada pero no aplicada en código | Media |
| Blue/green deploy para frontend | Solo backend lo tiene hoy | Baja |
| Service account dedicado para deploy | Se usa SA por defecto | Baja |
| Frontend `.env.example` | No existe | Baja |

## Almacenamiento y evidencias

El servicio de evidencias (`evidence-storage.service.ts`) indica:

> *"Hoy genera rutas locales; en el futuro delegará a Cloud Storage."*

La visión es migrar el almacenamiento de evidencias a **Google Cloud Storage**, permitiendo archivos más grandes, URLs firmadas y mejor escalabilidad.

## Inteligencia artificial

| Idea | Descripción |
|------|-------------|
| Análisis de contenido de evidencias | Hoy la IA solo recibe metadatos de archivos, no su contenido |
| Modelo fine-tuned institucional | Usar un modelo entrenado con datos de la organización |
| Análisis proactivo | Detectar patrones en el dashboard sin solicitud manual |
| Integración con otros proveedores | El `IntelligenceFacade` ya abstrae el proveedor; facilita cambiar de Gemini |

## Experiencia de usuario

| Idea | Descripción |
|------|-------------|
| Assets Blender en la escena | Módulo `room` tiene placeholder para modelos 3D futuros |
| Notificaciones en tiempo real | Alertas cuando una situación crítica se registra o escala |
| Roles dinámicos desde admin | Hoy los roles son fijos en catálogo de código |
| Coordinaciones dinámicas desde admin | Hoy se gestionan via seeds |
| Integración con sistemas externos | Actas, ticketing, comunicaciones (mencionado en MVP obsoleto) |

## Seguridad

| Idea | Descripción |
|------|-------------|
| Proteger endpoints legados | Los módulos `operational-events` e `intelligence` no tienen JWT |
| Rotación automática de secretos | Secret Manager soporta versiones; falta automatización |
| Auditoría de acciones de admin | Log detallado de cambios en usuarios y permisos |
| Rate limiting en análisis IA | Evitar abuso del endpoint `POST /situations/:id/analyze` |

## Calidad y testing

| Idea | Descripción |
|------|-------------|
| E2E en pipeline de deploy | Playwright existe localmente pero no en CI |
| Staging environment | No hay entorno de pre-producción |
| PR checks | No hay workflows para pull requests |
| Cobertura de tests del dominio de situaciones | Priorizar sobre módulos legados |

## Cómo contribuir al roadmap

Si identificas una necesidad nueva:

1. Verifica que no esté ya cubierta en este documento.
2. Abre una discusión con el equipo de producto.
3. Si se aprueba, agrégala aquí con contexto y prioridad sugerida.
4. Implementa siguiendo la [guía de desarrolladores](./10-guia-desarrolladores.md).

---

*Este roadmap se actualiza manualmente. No refleja compromisos de fecha ni de recursos.*
