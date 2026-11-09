import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 01B.2 · NORMALIZACIÓN DEL ESTADO LEGADO `RESOLVED` → `CLOSED` (D8, K-02).
 *
 * El flujo vigente es Abierto → En atención → Cerrado; `RESOLVED` es legado y
 * hoy se interpreta distinto según la pantalla. Esta migración lleva a
 * `CLOSED` SOLO los casos cuya fecha real de cierre consta en la base, y deja
 * constancia de cada decisión en `legacy_resolved_normalizations`.
 *
 * REGLAS (sin inventar fechas):
 *   1. RESOLVED con `closed_at` → CLOSED; `closed_at` no cambia.
 *   2. RESOLVED sin `closed_at` y con `resolved_at` → CLOSED con
 *      `closed_at = resolved_at` (la fecha real en que se resolvió).
 *   3. RESOLVED sin ninguna de las dos → NO se convierte. Queda RESOLVED y se
 *      registra `PENDING_MISSING_CLOSE_DATE` para intervención manual: alguien
 *      con autoridad debe aportar la fecha real o decidir su tratamiento.
 *   4. Fecha de cierre anterior a `created_at` → NO se convierte; se registra
 *      `PENDING_CLOSE_BEFORE_CREATE` (dato incoherente que requiere revisión).
 *
 * QUÉ NO TOCA: aprendizajes (`situation_resolutions`), línea de tiempo,
 * auditoría, `resolved_at`, `updated_at`, severidades, responsables ni
 * traslados. No borra nada. `has_learning` se anota solo como dato
 * informativo: los cierres antiguos sin aprendizaje siguen siendo válidos
 * (criterio de 1787200000000).
 *
 * PRECONDICIONES (se validan antes de escribir; si fallan, aborta sin cambios):
 *   - existe el valor `CLOSED` en `situations_status_enum`;
 *   - no hay una ejecución previa con filas aplicadas (idempotencia explícita);
 *   - las filas a convertir se bloquean `FOR UPDATE` en la misma transacción.
 *
 * REVERSIBILIDAD: `down()` devuelve a RESOLVED exactamente las filas que esta
 * migración convirtió, con su `closed_at` original (NULL en la regla 2), solo
 * si siguen en CLOSED y con el `closed_at` que se les fijó; si alguna cambió
 * después, se niega a revertir. Después elimina la tabla de trazabilidad.
 *
 * NO EJECUTAR contra producción ni contra bases existentes sin autorización
 * expresa (CLAUDE.md, regla 2). Consulta previa de solo lectura recomendada:
 *   SELECT
 *     COUNT(*) FILTER (WHERE closed_at IS NOT NULL)                         AS regla_1,
 *     COUNT(*) FILTER (WHERE closed_at IS NULL AND resolved_at IS NOT NULL) AS regla_2,
 *     COUNT(*) FILTER (WHERE closed_at IS NULL AND resolved_at IS NULL)     AS pendientes
 *   FROM situations WHERE status = 'RESOLVED';
 */
export class NormalizeLegacyResolvedSituations1788800000000 implements MigrationInterface {
  name = 'NormalizeLegacyResolvedSituations1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $novex$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'situations_status_enum' AND e.enumlabel = 'CLOSED'
        ) THEN
          RAISE EXCEPTION 'Precondición: situations_status_enum no tiene CLOSED';
        END IF;
        IF to_regclass('public.legacy_resolved_normalizations') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM legacy_resolved_normalizations WHERE outcome = 'NORMALIZED'
           ) THEN
          RAISE EXCEPTION 'Precondición: la normalización ya se aplicó; revise legacy_resolved_normalizations';
        END IF;
      END
      $novex$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legacy_resolved_normalizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "situation_id" uuid NOT NULL,
        "outcome" varchar(40) NOT NULL,
        "close_date_source" varchar(20),
        "original_status" varchar(20) NOT NULL,
        "original_closed_at" TIMESTAMP WITH TIME ZONE,
        "original_resolved_at" TIMESTAMP WITH TIME ZONE,
        "applied_closed_at" TIMESTAMP WITH TIME ZONE,
        "has_learning" boolean NOT NULL,
        "migration" varchar(80) NOT NULL,
        "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_legacy_resolved_normalizations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_legacy_resolved_normalizations_situation" UNIQUE ("situation_id"),
        CONSTRAINT "fk_legacy_resolved_normalizations_situation"
          FOREIGN KEY ("situation_id") REFERENCES "situations"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_legacy_resolved_normalizations_outcome" CHECK ("outcome" IN (
          'NORMALIZED', 'PENDING_MISSING_CLOSE_DATE', 'PENDING_CLOSE_BEFORE_CREATE'
        )),
        CONSTRAINT "chk_legacy_resolved_normalizations_applied" CHECK (
          ("outcome" = 'NORMALIZED') = ("applied_closed_at" IS NOT NULL)
        )
      )
    `);

    // Bloqueo de las filas candidatas antes de clasificar y escribir.
    await queryRunner.query(
      `SELECT id FROM situations WHERE status = 'RESOLVED' FOR UPDATE`,
    );

    await queryRunner.query(
      `
      INSERT INTO legacy_resolved_normalizations (
        situation_id, outcome, close_date_source, original_status,
        original_closed_at, original_resolved_at, applied_closed_at,
        has_learning, migration
      )
      SELECT
        s.id,
        CASE
          WHEN COALESCE(s.closed_at, s.resolved_at) IS NULL
            THEN 'PENDING_MISSING_CLOSE_DATE'
          WHEN COALESCE(s.closed_at, s.resolved_at) < s.created_at
            THEN 'PENDING_CLOSE_BEFORE_CREATE'
          ELSE 'NORMALIZED'
        END,
        CASE
          WHEN s.closed_at IS NOT NULL THEN 'closed_at'
          WHEN s.resolved_at IS NOT NULL THEN 'resolved_at'
          ELSE NULL
        END,
        s.status::text,
        s.closed_at,
        s.resolved_at,
        CASE
          WHEN COALESCE(s.closed_at, s.resolved_at) IS NOT NULL
           AND COALESCE(s.closed_at, s.resolved_at) >= s.created_at
            THEN COALESCE(s.closed_at, s.resolved_at)
          ELSE NULL
        END,
        EXISTS (SELECT 1 FROM situation_resolutions r WHERE r.situation_id = s.id),
        $1
      FROM situations s
      WHERE s.status = 'RESOLVED'
      `,
      [this.name],
    );

    // Solo las filas clasificadas NORMALIZED; partial UPDATE (status y
    // closed_at), sin tocar updated_at ni ninguna otra columna.
    await queryRunner.query(`
      UPDATE situations s
         SET status = 'CLOSED',
             closed_at = n.applied_closed_at
        FROM legacy_resolved_normalizations n
       WHERE n.situation_id = s.id
         AND n.outcome = 'NORMALIZED'
         AND s.status = 'RESOLVED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('legacy_resolved_normalizations'))) {
      return;
    }

    await queryRunner.query(`
      DO $novex$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM legacy_resolved_normalizations n
            JOIN situations s ON s.id = n.situation_id
           WHERE n.outcome = 'NORMALIZED'
             AND (s.status <> 'CLOSED' OR s.closed_at IS DISTINCT FROM n.applied_closed_at)
        ) THEN
          RAISE EXCEPTION 'No se revierte: hay casos normalizados que cambiaron después de la migración';
        END IF;
      END
      $novex$;
    `);

    await queryRunner.query(`
      UPDATE situations s
         SET status = 'RESOLVED',
             closed_at = n.original_closed_at
        FROM legacy_resolved_normalizations n
       WHERE n.situation_id = s.id
         AND n.outcome = 'NORMALIZED'
    `);

    await queryRunner.query(`DROP TABLE "legacy_resolved_normalizations"`);
  }
}
