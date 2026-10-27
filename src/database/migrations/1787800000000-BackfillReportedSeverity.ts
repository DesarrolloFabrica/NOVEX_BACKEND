import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BACKFILL DE LA SEVERIDAD REPORTADA y de la fila REPORTED del historial.
 *
 * Origen de `reported_severity`, en este orden de prioridad:
 *   1. metadata `severity` del PRIMER `SITUATION_CREATED` del timeline, que
 *      guardó el valor del momento del alta;
 *   2. metadata `severity` del audit `SITUATION_CREATED`;
 *   3. `severity` actual, como último recurso (documentado: si hubo una
 *      edición por PATCH y no queda rastro, se pierde el valor original).
 *
 * Cada situación recibe UNA fila REPORTED con `effective_at = created_at` y
 * `actor_user_id = created_by_user_id`. Su `created_at` es el instante de esta
 * migración: así se distingue una fila de backfill de una escrita en el alta.
 *
 * NO se inventa nada:
 *   - ninguna fila AUTO_TIME retroactiva;
 *   - ninguna afectación;
 *   - si la severidad actual difiere de la reportada (hubo un PATCH en el
 *     pasado), NO se crea un evento MANUAL ni se corrige el valor actual. Se
 *     reporta el conteo y una muestra para decidir aparte. En QA son 0.
 */
export class BackfillReportedSeverity1787800000000 implements MigrationInterface {
  name = 'BackfillReportedSeverity1787800000000';

  private readonly logger = new Logger(
    BackfillReportedSeverity1787800000000.name,
  );

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "situations" s
      SET "reported_severity" = COALESCE(
        (
          SELECT (t."metadata"->>'severity')::"situations_severity_enum"
          FROM "situation_timeline_entries" t
          WHERE t."situation_id" = s."id"
            AND t."event_type" = 'SITUATION_CREATED'
            AND t."metadata"->>'severity' IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
          ORDER BY t."created_at" ASC
          LIMIT 1
        ),
        (
          SELECT (a."metadata"->>'severity')::"situations_severity_enum"
          FROM "audit_logs" a
          WHERE a."action" = 'SITUATION_CREATED'
            AND a."resource_type" = 'situation'
            AND a."resource_id" = s."id"::text
            AND a."metadata"->>'severity' IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
          ORDER BY a."created_at" ASC
          LIMIT 1
        ),
        s."severity"
      )
      WHERE s."reported_severity" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "situations" ALTER COLUMN "reported_severity" SET NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "situation_severity_changes"
        ("situation_id", "previous_severity", "new_severity", "source",
         "effective_at", "actor_user_id")
      SELECT s."id", NULL, s."reported_severity", 'REPORTED',
             s."created_at", s."created_by_user_id"
      FROM "situations" s
      WHERE NOT EXISTS (
        SELECT 1 FROM "situation_severity_changes" c
        WHERE c."situation_id" = s."id" AND c."source" = 'REPORTED'
      )
    `);

    const discrepancies = (await queryRunner.query(`
      SELECT s."id", s."reported_severity", s."severity"
      FROM "situations" s
      WHERE s."reported_severity" <> s."severity"
      ORDER BY s."created_at"
      LIMIT 20
    `)) as Array<{ id: string; reported_severity: string; severity: string }>;
    const [{ total }] = (await queryRunner.query(`
      SELECT count(*)::int AS total FROM "situations"
      WHERE "reported_severity" <> "severity"
    `)) as Array<{ total: number }>;

    if (total > 0) {
      this.logger.warn(
        `Severidad reportada distinta de la actual en ${total} situaciones (sin resolver automáticamente). Muestra: ${JSON.stringify(discrepancies)}`,
      );
    } else {
      this.logger.log(
        'Severidad reportada coincide con la actual en todas las situaciones.',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "situation_severity_changes" WHERE "source" = 'REPORTED'
    `);
    await queryRunner.query(`
      ALTER TABLE "situations" ALTER COLUMN "reported_severity" DROP NOT NULL
    `);
    await queryRunner.query(
      `UPDATE "situations" SET "reported_severity" = NULL`,
    );
  }
}
