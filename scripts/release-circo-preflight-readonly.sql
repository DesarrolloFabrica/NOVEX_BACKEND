-- =============================================================================
-- NOVEX · Comprobaciones previas a publicar cartas y circo (SOLO LECTURA)
-- =============================================================================
-- Lo ejecuta scripts/run-readonly-sql.mjs (o psql) con la sesión forzada a solo
-- lectura. Además todo va en una transacción READ ONLY que termina en ROLLBACK:
-- cualquier escritura falla. Solo devuelve recuentos y nombres de migraciones;
-- ninguna descripción, título ni dato personal. Usa únicamente tablas y
-- columnas que ya existen en el esquema anterior a cartas (49a6483).
-- Cada bloque empieza con una línea \echo (la usa el ejecutor como título).
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

\echo 01 Migraciones aplicadas (todas, en orden)
SELECT id, name FROM typeorm_migrations ORDER BY id;

\echo 02 Referencia - situaciones por estado
SELECT status, count(*) AS total FROM situations GROUP BY status ORDER BY status;

\echo 03 Referencia - situaciones por coordinacion y estado
SELECT coalesce(c.code, '(sin coordinacion)') AS coordinacion,
       count(*) FILTER (WHERE s.status = 'OPEN')        AS open,
       count(*) FILTER (WHERE s.status = 'IN_PROGRESS') AS in_progress,
       count(*) FILTER (WHERE s.status = 'RESOLVED')    AS resolved,
       count(*) FILTER (WHERE s.status = 'CLOSED')      AS closed,
       count(*)                                         AS total
FROM situations s LEFT JOIN coordinations c ON c.id = s.coordination_id
GROUP BY 1 ORDER BY 1;

\echo 04 Referencia - tablas relacionadas
SELECT (SELECT count(*) FROM situations)                     AS situaciones,
       (SELECT count(*) FROM situation_evidences)            AS evidencias,
       (SELECT count(*) FROM situation_timeline_entries)     AS eventos_timeline,
       (SELECT count(*) FROM situation_ai_analysis_records)  AS analisis_ia,
       (SELECT count(*) FROM situation_related_coordinations) AS coordinaciones_relacionadas,
       (SELECT count(*) FROM audit_logs)                     AS auditoria;

\echo 05 Situaciones SIN coordinacion (registros de analista) por estado
SELECT status, count(*) AS total FROM situations
WHERE coordination_id IS NULL GROUP BY status ORDER BY status;

\echo 06 RESOLVED y CLOSED sin fecha de cierre
SELECT count(*) FILTER (WHERE status = 'RESOLVED' AND closed_at IS NULL)   AS resolved_sin_closed_at,
       count(*) FILTER (WHERE status = 'RESOLVED' AND resolved_at IS NULL) AS resolved_sin_resolved_at,
       count(*) FILTER (WHERE status = 'CLOSED' AND closed_at IS NULL)     AS closed_sin_closed_at
FROM situations;

\echo 07 Coordinaciones INACTIVAS con situaciones (activas y cerradas)
SELECT c.code,
       count(*) FILTER (WHERE s.status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')) AS activas,
       count(*) FILTER (WHERE s.status = 'CLOSED')                              AS cerradas
FROM situations s JOIN coordinations c ON c.id = s.coordination_id
WHERE c.is_active = false
GROUP BY c.code ORDER BY c.code;

\echo 08 Categorias usadas que ya no son seleccionables
SELECT count(*) AS situaciones_con_categoria_historica
FROM situations s JOIN incident_categories c ON c.id = s.category_id
WHERE c.is_selectable = false;

\echo 09 Severidad actual distinta de la registrada al crear
SELECT count(*) AS severidad_editada
FROM situations s
WHERE EXISTS (
  SELECT 1 FROM situation_timeline_entries t
  WHERE t.situation_id = s.id AND t.event_type = 'SITUATION_CREATED'
    AND t.metadata->>'severity' IS NOT NULL
    AND t.metadata->>'severity' <> s.severity::text
);

\echo 10 Avisos de SLA de los ultimos 60 dias (confirma que el cron actual corre)
SELECT date_trunc('week', created_at)::date AS semana, event_type, count(*) AS eventos
FROM situation_timeline_entries
WHERE event_type IN ('SLA_WARNING', 'SLA_BREACHED')
  AND created_at >= now() - interval '60 days'
GROUP BY 1, 2 ORDER BY 1 DESC, 2;

\echo 11 Permisos de alta, actualizacion, cierre y KPIs por rol
SELECT r.code AS rol, string_agg(p.code, ', ' ORDER BY p.code) AS permisos
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code IN ('SITUATIONS_CREATE', 'SITUATIONS_UPDATE', 'SITUATIONS_CLOSE', 'KPIS_VIEW')
GROUP BY r.code ORDER BY r.code;

\echo 12 Usuarios activos por rol y coordinaciones
SELECT r.code AS rol, count(*) AS usuarios_activos
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.status = 'ACTIVE' GROUP BY r.code ORDER BY r.code;

\echo 13 Coordinaciones activas e inactivas
SELECT count(*) FILTER (WHERE is_active) AS activas,
       count(*) FILTER (WHERE NOT is_active) AS inactivas
FROM coordinations;

ROLLBACK;
