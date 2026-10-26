-- =============================================================================
-- NOVEX · Comprobaciones previas a publicar cartas y circo (SOLO LECTURA)
-- =============================================================================
-- Uso (ver docs/RELEASE_CIRCO.md §2): psql con PGOPTIONS que fuerza sesión de
-- solo lectura. Además todo va dentro de una transacción READ ONLY que termina
-- en ROLLBACK: cualquier escritura falla. No devuelve datos personales: solo
-- recuentos y nombres de migraciones.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

\echo '== 1. Migraciones aplicadas (las 12 más recientes)'
SELECT id, name FROM typeorm_migrations ORDER BY id DESC LIMIT 12;

\echo '== 2. Situaciones por estado'
SELECT status, count(*) AS total FROM situations GROUP BY status ORDER BY status;

\echo '== 3. Situaciones SIN coordinación (registradas por analistas), por estado'
\echo '   Las activas quedarán sin quien pueda avanzarlas o resolverlas (ver RELEASE_CIRCO §7.1)'
SELECT status, count(*) AS total FROM situations
WHERE coordination_id IS NULL GROUP BY status ORDER BY status;

\echo '== 4. Estados que las cartas y los KPIs cuentan distinto'
SELECT
  count(*) FILTER (WHERE status = 'RESOLVED' AND closed_at IS NULL) AS resolved_sin_cierre,
  count(*) FILTER (WHERE status = 'CLOSED' AND closed_at IS NULL)   AS closed_sin_fecha_cierre
FROM situations;

\echo '== 5. Situaciones activas en coordinaciones INACTIVAS (desaparecen de cartas y KPIs)'
SELECT c.code, c.is_active, count(*) AS activas
FROM situations s JOIN coordinations c ON c.id = s.coordination_id
WHERE c.is_active = false AND s.status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')
GROUP BY c.code, c.is_active ORDER BY c.code;

\echo '== 6. Categorías usadas que ya no son seleccionables (se siguen mostrando)'
SELECT count(*) AS situaciones_con_categoria_historica
FROM situations s JOIN incident_categories c ON c.id = s.category_id
WHERE c.is_selectable = false;

\echo '== 7. Severidad actual distinta de la registrada al crear (la migración solo lo registra en el log)'
SELECT count(*) AS severidad_editada
FROM situations s
WHERE EXISTS (
  SELECT 1 FROM situation_timeline_entries t
  WHERE t.situation_id = s.id AND t.event_type = 'SITUATION_CREATED'
    AND t.metadata->>'severity' IS NOT NULL
    AND t.metadata->>'severity' <> s.severity::text
);

\echo '== 8. Avisos de SLA generados en producción (confirma que el cron actual corre)'
SELECT date_trunc('week', created_at)::date AS semana, event_type, count(*) AS eventos
FROM situation_timeline_entries
WHERE event_type IN ('SLA_WARNING', 'SLA_BREACHED')
  AND created_at >= now() - interval '60 days'
GROUP BY 1, 2 ORDER BY 1 DESC, 2;

\echo '== 9. Permisos de alta, cierre y KPIs por rol'
SELECT r.code AS rol, string_agg(p.code, ', ' ORDER BY p.code) AS permisos
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code IN ('SITUATIONS_CREATE', 'SITUATIONS_CLOSE', 'KPIS_VIEW')
GROUP BY r.code ORDER BY r.code;

\echo '== 10. Usuarios activos por rol y coordinaciones activas'
SELECT r.code AS rol, count(*) AS usuarios_activos
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.status = 'ACTIVE' GROUP BY r.code ORDER BY r.code;
SELECT count(*) FILTER (WHERE is_active) AS coordinaciones_activas,
       count(*) FILTER (WHERE NOT is_active) AS coordinaciones_inactivas
FROM coordinations;

ROLLBACK;
