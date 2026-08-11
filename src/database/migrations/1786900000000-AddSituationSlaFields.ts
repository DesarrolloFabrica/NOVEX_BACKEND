import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plazos operativos (SLA suave) por severidad.
 * Backfill: due_at = created_at + ventana según severity; casos ya cerrados
 * conservan el plazo histórico para métricas de cumplimiento.
 */
export class AddSituationSlaFields1786900000000 implements MigrationInterface {
  name = 'AddSituationSlaFields1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
      ADD COLUMN "due_at" TIMESTAMPTZ NULL,
      ADD COLUMN "sla_policy_code" VARCHAR(40) NULL,
      ADD COLUMN "sla_breached_at" TIMESTAMPTZ NULL,
      ADD COLUMN "last_sla_reminder_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      UPDATE "situations"
      SET
        "sla_policy_code" = 'severity-v1',
        "due_at" = "created_at" + CASE "severity"
          WHEN 'CRITICAL' THEN INTERVAL '24 hours'
          WHEN 'HIGH' THEN INTERVAL '72 hours'
          WHEN 'MEDIUM' THEN INTERVAL '7 days'
          WHEN 'LOW' THEN INTERVAL '14 days'
          ELSE INTERVAL '7 days'
        END
    `);

    await queryRunner.query(`
      UPDATE "situations"
      SET "sla_breached_at" = "due_at"
      WHERE "status" <> 'CLOSED'
        AND "due_at" IS NOT NULL
        AND "due_at" < NOW()
        AND "sla_breached_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_situations_due_at_status"
      ON "situations" ("due_at", "status")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."situation_timeline_entries_event_type_enum" ADD VALUE 'SLA_WARNING';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."situation_timeline_entries_event_type_enum" ADD VALUE 'SLA_BREACHED';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_situations_due_at_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "situations"
      DROP COLUMN IF EXISTS "last_sla_reminder_at",
      DROP COLUMN IF EXISTS "sla_breached_at",
      DROP COLUMN IF EXISTS "sla_policy_code",
      DROP COLUMN IF EXISTS "due_at"
    `);
  }
}
