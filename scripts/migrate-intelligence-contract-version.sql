-- Migración idempotente: rebrand Omega → Cunmark → NOVEX
-- Actualiza contractVersion en reportes ejecutivos persistidos (JSONB).
-- Ejecutar manualmente contra la base existente cuando se desee alinear datos históricos.

UPDATE ai_interpretations
SET executive_report = jsonb_set(
  executive_report,
  '{contractVersion}',
  '"novex.intelligence.v2"'
)
WHERE executive_report IS NOT NULL
  AND executive_report->>'contractVersion' IN (
    'cunmark.intelligence.v2',
    'omega.intelligence.v2'
  );
