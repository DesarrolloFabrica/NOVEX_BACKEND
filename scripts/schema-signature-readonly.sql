-- =============================================================================
-- Firma normalizada del esquema `public` (SOLO LECTURA, sin datos de filas).
-- Una línea por objeto, ordenada, para comparar dos bases con `diff`.
-- Uso: psql ... -At -X -f scripts/schema-signature-readonly.sql
-- =============================================================================
BEGIN TRANSACTION READ ONLY;

SELECT line FROM (
  SELECT 'COL ' || c.table_name || '.' || c.column_name || ' ' || c.data_type
         || coalesce('(' || c.character_maximum_length || ')', '')
         || ' udt=' || c.udt_name
         || ' null=' || c.is_nullable
         || ' default=' || coalesce(regexp_replace(c.column_default, '::[a-z_ ]+', '', 'g'), '-') AS line
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  UNION ALL
  SELECT 'IDX ' || tablename || ' ' || regexp_replace(indexdef, '^CREATE ', '')
  FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 'CON ' || cl.relname || ' ' || co.conname || ' ' || pg_get_constraintdef(co.oid)
  FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'ENUM ' || t.typname || ' = ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
  GROUP BY t.typname
  UNION ALL
  SELECT 'TRG ' || event_object_table || ' ' || trigger_name || ' ' || action_timing || ' ' || event_manipulation
  FROM information_schema.triggers WHERE trigger_schema = 'public'
  UNION ALL
  SELECT 'FN ' || p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
) s
ORDER BY line;

ROLLBACK;
