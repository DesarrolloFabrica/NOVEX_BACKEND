-- Migración idempotente: rebrand Omega → Cunmark
-- Actualiza contractVersion en reportes ejecutivos persistidos (JSONB).
-- Ejecutar manualmente contra la base existente cuando se desee alinear datos históricos.

UPDATE ai_interpretations
SET executive_report = jsonb_set(
  executive_report,
  '{contractVersion}',
  '"cunmark.intelligence.v2"'
)
WHERE executive_report IS NOT NULL
  AND executive_report->>'contractVersion' = 'omega.intelligence.v2';
