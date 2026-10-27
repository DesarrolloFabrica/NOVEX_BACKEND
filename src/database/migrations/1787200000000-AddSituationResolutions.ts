import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * APRENDIZAJE DE LA RESOLUCIÓN, en tabla propia.
 *
 * `situation_id` es a la vez CLAVE PRIMARIA y clave foránea, así que la base
 * garantiza por sí misma que una situación tenga como máximo una resolución.
 * Esa unicidad no es un detalle de modelado: es la última barrera contra dos
 * resoluciones concurrentes, por debajo del bloqueo pesimista que toma el
 * servicio. Una segunda inserción viola la PK y se traduce en 409.
 *
 * NO HAY BACKFILL, y es deliberado. Las situaciones cerradas antes de esta fase
 * no tienen aprendizaje y deben seguir siendo válidas y legibles: la fila
 * ausente expresa exactamente eso. Rellenarlas con el `last_status_comment`
 * histórico habría convertido un motivo de cierre en un aprendizaje que nadie
 * escribió, y atribuido a un usuario una explicación que no dio.
 *
 * Tampoco se añade columna alguna a `situations`: la FECHA de resolución ya
 * existe ahí (`resolved_at` / `closed_at`) con esa misma semántica, y solo
 * faltaba la identidad de QUIEN resolvió, que vive en `resolved_by_user_id`.
 */
export class AddSituationResolutions1787200000000 implements MigrationInterface {
  name = 'AddSituationResolutions1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "situation_resolutions" (
        "situation_id" uuid NOT NULL,
        "learning" text NOT NULL,
        "resolved_by_user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_situation_resolutions" PRIMARY KEY ("situation_id"),
        CONSTRAINT "chk_situation_resolutions_learning_not_blank"
          CHECK (length(btrim("learning")) > 0)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "situation_resolutions"
      ADD CONSTRAINT "fk_situation_resolutions_situation"
      FOREIGN KEY ("situation_id") REFERENCES "situations"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "situation_resolutions"
      ADD CONSTRAINT "fk_situation_resolutions_user"
      FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_resolutions_resolved_by"
      ON "situation_resolutions" ("resolved_by_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_situation_resolutions_resolved_by"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "situation_resolutions"`);
  }
}
