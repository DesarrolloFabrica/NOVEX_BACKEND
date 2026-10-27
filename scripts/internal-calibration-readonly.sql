-- NOVEX · Calibración INTERNAL vivo · SOLO LECTURA
-- Ejecutar completo. La transacción es READ ONLY: cualquier escritura falla.
-- Ventanas SLA severity-v1 (días): LOW 14 · MEDIUM 7 · HIGH 3 · CRITICAL 1.
\pset pager off
\pset footer off
BEGIN TRANSACTION READ ONLY;

-- Universo base: INTERNAL con severidad original recuperada del SITUATION_CREATED.
-- Q0 · Volumen y origen de la severidad inicial
WITH created_evt AS (
  SELECT DISTINCT ON (t.situation_id) t.situation_id, t.metadata->>'severity' AS sev
  FROM situation_timeline_entries t
  WHERE t.event_type = 'SITUATION_CREATED'
  ORDER BY t.situation_id, t.created_at
), base AS (
  SELECT s.*, ce.sev AS created_sev,
         COALESCE(ce.sev, s.severity::text) AS initial_sev,
         EXTRACT(EPOCH FROM COALESCE(s.closed_at, now()) - s.created_at) / 86400.0 AS d
  FROM situations s LEFT JOIN created_evt ce ON ce.situation_id = s.id
  WHERE s.report_kind = 'INTERNAL'
)
SELECT 'Q0 volumen' AS q, count(*) AS total,
       count(*) FILTER (WHERE closed_at IS NULL) AS activos,
       count(*) FILTER (WHERE closed_at IS NOT NULL) AS cerrados,
       count(*) FILTER (WHERE created_sev IS NULL) AS sin_situation_created,
       count(*) FILTER (WHERE created_sev IS NOT NULL AND created_sev <> severity::text) AS editados,
       round(100.0 * count(*) FILTER (WHERE created_sev IS NOT NULL AND created_sev <> severity::text)
             / NULLIF(count(*) FILTER (WHERE created_sev IS NOT NULL), 0), 1) AS pct_editados,
       count(*) FILTER (WHERE coordination_id IS NULL) AS sin_coordinacion,
       min(created_at)::date AS desde, max(created_at)::date AS hasta
FROM base;

-- Q1 · Transiciones severidad inicial → actual (solo donde se recupera la inicial)
WITH created_evt AS (
  SELECT DISTINCT ON (t.situation_id) t.situation_id, t.metadata->>'severity' AS sev
  FROM situation_timeline_entries t WHERE t.event_type = 'SITUATION_CREATED'
  ORDER BY t.situation_id, t.created_at
)
SELECT 'Q1 inicial→actual' AS q, ce.sev AS inicial, s.severity AS actual, count(*)
FROM situations s JOIN created_evt ce ON ce.situation_id = s.id
WHERE s.report_kind = 'INTERNAL'
GROUP BY 2, 3 ORDER BY 2, 3;

-- Q2 · INTERNAL creados por COORDINADOR fuera de su coordinación
-- (fiabilidad: compara con users.coordination_id ACTUAL del creador; si lo reasignaron, puede dar falsos positivos)
SELECT 'Q2 coord fuera' AS q, count(*) AS internal_de_coordinador,
       count(*) FILTER (WHERE u.coordination_id IS NULL) AS creador_sin_coord,
       count(*) FILTER (WHERE u.coordination_id IS NOT NULL
                          AND s.coordination_id IS DISTINCT FROM u.coordination_id) AS fuera_de_su_coord
FROM situations s
JOIN users u ON u.id = s.created_by_user_id
JOIN roles r ON r.id = u.role_id
WHERE s.report_kind = 'INTERNAL' AND upper(r.code) = 'COORDINADOR';

-- Q3 · Distribución de duración por severidad inicial (cerrados: closed−created; activos: now−created)
WITH created_evt AS (
  SELECT DISTINCT ON (t.situation_id) t.situation_id, t.metadata->>'severity' AS sev
  FROM situation_timeline_entries t WHERE t.event_type = 'SITUATION_CREATED'
  ORDER BY t.situation_id, t.created_at
), base AS (
  SELECT COALESCE(ce.sev, s.severity::text) AS sev, (s.closed_at IS NULL) AS activo,
         EXTRACT(EPOCH FROM COALESCE(s.closed_at, now()) - s.created_at) / 86400.0 AS d
  FROM situations s LEFT JOIN created_evt ce ON ce.situation_id = s.id
  WHERE s.report_kind = 'INTERNAL'
)
SELECT 'Q3 duracion' AS q, COALESCE(sev, 'TOTAL') AS sev_inicial,
       CASE WHEN activo IS NULL THEN 'todos' WHEN activo THEN 'activos' ELSE 'cerrados' END AS grupo,
       count(*) AS n,
       count(*) FILTER (WHERE d < 1) AS "<1d",
       count(*) FILTER (WHERE d >= 1 AND d < 3) AS "1-3d",
       count(*) FILTER (WHERE d >= 3 AND d < 7) AS "3-7d",
       count(*) FILTER (WHERE d >= 7 AND d < 14) AS "7-14d",
       count(*) FILTER (WHERE d >= 14 AND d < 21) AS "14-21d",
       count(*) FILTER (WHERE d >= 21 AND d < 30) AS "21-30d",
       count(*) FILTER (WHERE d >= 30 AND d < 42) AS "30-42d",
       count(*) FILTER (WHERE d >= 42 AND d < 60) AS "42-60d",
       count(*) FILTER (WHERE d >= 60) AS "60+d",
       round((percentile_cont(0.25) WITHIN GROUP (ORDER BY d))::numeric, 1) AS p25,
       round((percentile_cont(0.50) WITHIN GROUP (ORDER BY d))::numeric, 1) AS p50,
       round((percentile_cont(0.75) WITHIN GROUP (ORDER BY d))::numeric, 1) AS p75,
       round((percentile_cont(0.90) WITHIN GROUP (ORDER BY d))::numeric, 1) AS p90,
       round(max(d)::numeric, 1) AS max
FROM base
GROUP BY GROUPING SETS ((sev, activo), (sev), (activo), ())
ORDER BY sev_inicial, grupo;

-- Q4 · Simulación de políticas. Umbrales (días desde created_at) para cada escalón:
--   A cadena SLA     : LOW 14,21,24 · MEDIUM 7,10 · HIGH 3
--   B híbrida k=1    : LOW 14,28,42 · MEDIUM 7,14 · HIGH 3
--   C conservadora   : LOW 14,42 (tope +2) · MEDIUM 7,21 · HIGH 3
-- Cerrados: escalan solo hasta closed_at. Activos: hasta now().
WITH created_evt AS (
  SELECT DISTINCT ON (t.situation_id) t.situation_id, t.metadata->>'severity' AS sev
  FROM situation_timeline_entries t WHERE t.event_type = 'SITUATION_CREATED'
  ORDER BY t.situation_id, t.created_at
), base AS (
  SELECT COALESCE(ce.sev, s.severity::text) AS sev, (s.closed_at IS NULL) AS activo,
         EXTRACT(EPOCH FROM COALESCE(s.closed_at, now()) - s.created_at) / 86400.0 AS d
  FROM situations s LEFT JOIN created_evt ce ON ce.situation_id = s.id
  WHERE s.report_kind = 'INTERNAL'
), thr(policy, sev, steps) AS (
  VALUES ('A','LOW',ARRAY[14,21,24]::numeric[]), ('A','MEDIUM',ARRAY[7,10]::numeric[]), ('A','HIGH',ARRAY[3]::numeric[]), ('A','CRITICAL',ARRAY[]::numeric[]),
         ('B','LOW',ARRAY[14,28,42]::numeric[]), ('B','MEDIUM',ARRAY[7,14]::numeric[]), ('B','HIGH',ARRAY[3]::numeric[]), ('B','CRITICAL',ARRAY[]::numeric[]),
         ('C','LOW',ARRAY[14,42]::numeric[]),    ('C','MEDIUM',ARRAY[7,21]::numeric[]), ('C','HIGH',ARRAY[3]::numeric[]), ('C','CRITICAL',ARRAY[]::numeric[])
), sim AS (
  SELECT t.policy, b.sev, b.activo,
         (SELECT count(*) FROM unnest(t.steps) x WHERE b.d > x) AS esc,
         array_position(ARRAY['LOW','MEDIUM','HIGH','CRITICAL'], b.sev) AS lvl0
  FROM base b JOIN thr t ON t.sev = b.sev
), fin AS (
  SELECT policy, sev, activo, esc,
         (ARRAY['LOW','MEDIUM','HIGH','CRITICAL'])[lvl0 + esc] AS efectiva
  FROM sim
)
SELECT 'Q4 simulacion' AS q, policy, COALESCE(sev, 'TOTAL') AS sev_inicial, count(*) AS n,
       round(100.0 * count(*) FILTER (WHERE esc = 0) / count(*), 1) AS "% 0 esc",
       round(100.0 * count(*) FILTER (WHERE esc = 1) / count(*), 1) AS "% 1 esc",
       round(100.0 * count(*) FILTER (WHERE esc = 2) / count(*), 1) AS "% 2 esc",
       round(100.0 * count(*) FILTER (WHERE esc = 3) / count(*), 1) AS "% 3 esc",
       round(100.0 * count(*) FILTER (WHERE efectiva = 'LOW') / count(*), 1) AS "% LOW",
       round(100.0 * count(*) FILTER (WHERE efectiva = 'MEDIUM') / count(*), 1) AS "% MEDIUM",
       round(100.0 * count(*) FILTER (WHERE efectiva = 'HIGH') / count(*), 1) AS "% HIGH",
       round(100.0 * count(*) FILTER (WHERE efectiva = 'CRITICAL') / count(*), 1) AS "% CRITICAL"
FROM fin
GROUP BY GROUPING SETS ((policy, sev), (policy))
ORDER BY policy, sev_inicial;

-- Q5 · Población ACTIVA hoy: severidad actual vs efectiva bajo A/B/C (conteos)
WITH created_evt AS (
  SELECT DISTINCT ON (t.situation_id) t.situation_id, t.metadata->>'severity' AS sev
  FROM situation_timeline_entries t WHERE t.event_type = 'SITUATION_CREATED'
  ORDER BY t.situation_id, t.created_at
), base AS (
  SELECT s.severity::text AS actual, COALESCE(ce.sev, s.severity::text) AS sev,
         EXTRACT(EPOCH FROM now() - s.created_at) / 86400.0 AS d
  FROM situations s LEFT JOIN created_evt ce ON ce.situation_id = s.id
  WHERE s.report_kind = 'INTERNAL' AND s.closed_at IS NULL
), thr(policy, sev, steps) AS (
  VALUES ('A','LOW',ARRAY[14,21,24]::numeric[]), ('A','MEDIUM',ARRAY[7,10]::numeric[]), ('A','HIGH',ARRAY[3]::numeric[]), ('A','CRITICAL',ARRAY[]::numeric[]),
         ('B','LOW',ARRAY[14,28,42]::numeric[]), ('B','MEDIUM',ARRAY[7,14]::numeric[]), ('B','HIGH',ARRAY[3]::numeric[]), ('B','CRITICAL',ARRAY[]::numeric[]),
         ('C','LOW',ARRAY[14,42]::numeric[]),    ('C','MEDIUM',ARRAY[7,21]::numeric[]), ('C','HIGH',ARRAY[3]::numeric[]), ('C','CRITICAL',ARRAY[]::numeric[])
), fin AS (
  SELECT t.policy, b.actual,
         (ARRAY['LOW','MEDIUM','HIGH','CRITICAL'])[array_position(ARRAY['LOW','MEDIUM','HIGH','CRITICAL'], b.sev)
           + (SELECT count(*) FROM unnest(t.steps) x WHERE b.d > x)::int] AS efectiva
  FROM base b JOIN thr t ON t.sev = b.sev
)
SELECT 'Q5 activos' AS q, 'ACTUAL' AS escenario,
       count(*) FILTER (WHERE actual = 'LOW') AS low, count(*) FILTER (WHERE actual = 'MEDIUM') AS medium,
       count(*) FILTER (WHERE actual = 'HIGH') AS high, count(*) FILTER (WHERE actual = 'CRITICAL') AS critical
FROM fin WHERE policy = 'A'
UNION ALL
SELECT 'Q5 activos', 'POLITICA ' || policy,
       count(*) FILTER (WHERE efectiva = 'LOW'), count(*) FILTER (WHERE efectiva = 'MEDIUM'),
       count(*) FILTER (WHERE efectiva = 'HIGH'), count(*) FILTER (WHERE efectiva = 'CRITICAL')
FROM fin GROUP BY policy
ORDER BY 2;

-- Q6 · Activos por coordinación: CRITICAL hoy vs CRITICAL bajo cada política (para personaje/vidas)
WITH created_evt AS (
  SELECT DISTINCT ON (t.situation_id) t.situation_id, t.metadata->>'severity' AS sev
  FROM situation_timeline_entries t WHERE t.event_type = 'SITUATION_CREATED'
  ORDER BY t.situation_id, t.created_at
), base AS (
  SELECT c.name AS coord, s.severity::text AS actual, COALESCE(ce.sev, s.severity::text) AS sev,
         EXTRACT(EPOCH FROM now() - s.created_at) / 86400.0 AS d
  FROM situations s LEFT JOIN created_evt ce ON ce.situation_id = s.id
  LEFT JOIN coordinations c ON c.id = s.coordination_id
  WHERE s.report_kind = 'INTERNAL' AND s.closed_at IS NULL
)
SELECT 'Q6 coord' AS q, COALESCE(coord, '(sin coordinación)') AS coordinacion, count(*) AS activos,
       count(*) FILTER (WHERE actual IN ('HIGH','CRITICAL')) AS high_crit_hoy,
       count(*) FILTER (WHERE actual = 'CRITICAL') AS crit_hoy,
       count(*) FILTER (WHERE (sev='LOW' AND d>24) OR (sev='MEDIUM' AND d>10) OR (sev='HIGH' AND d>3) OR sev='CRITICAL') AS crit_A,
       count(*) FILTER (WHERE (sev='LOW' AND d>42) OR (sev='MEDIUM' AND d>14) OR (sev='HIGH' AND d>3) OR sev='CRITICAL') AS crit_B,
       count(*) FILTER (WHERE (sev='MEDIUM' AND d>21) OR (sev='HIGH' AND d>3) OR sev='CRITICAL') AS crit_C
FROM base GROUP BY 2 ORDER BY 3 DESC;

ROLLBACK;
