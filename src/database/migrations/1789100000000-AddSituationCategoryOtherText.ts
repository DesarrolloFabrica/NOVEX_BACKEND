import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CATEGORÍA «OTRA» CON TEXTO LIBRE.
 *
 * Un problema puede no encajar en ninguna categoría del catálogo. Se añade:
 *
 * - La categoría vigente `OTRA` («Otra», icono `other`) al catálogo. El
 *   arranque (`CatalogSeedService`) también la mantiene; este INSERT cubre los
 *   entornos que migran sin semilla de arranque.
 * - La columna `situations.category_other_text`: la categoría que escribe
 *   quien reporta al elegir «Otra». Nula en cualquier otro caso. El CHECK
 *   repite los límites del DTO (3 a 120 caracteres tras recortar espacios).
 *   La regla «obligatoria si y solo si la categoría es OTRA» depende del
 *   catálogo y la aplica el servicio.
 *
 * ADITIVA: no toca filas existentes (todas quedan con NULL).
 * REVERSIBILIDAD: `down()` se niega si algún problema ya usa la categoría
 * escrita, para no perder lo que la gente registró.
 */
export class AddSituationCategoryOtherText1789100000000 implements MigrationInterface {
  name = 'AddSituationCategoryOtherText1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
        ADD COLUMN IF NOT EXISTS "category_other_text" character varying(120)
    `);

    await queryRunner.query(`
      ALTER TABLE "situations"
        ADD CONSTRAINT "chk_situations_category_other_text_length" CHECK (
          "category_other_text" IS NULL
          OR char_length(btrim("category_other_text")) BETWEEN 3 AND 120
        )
    `);

    await queryRunner.query(`
      INSERT INTO "incident_categories" (
        "id", "created_at", "updated_at", "code", "name", "description",
        "is_selectable", "icon"
      )
      SELECT uuid_generate_v4(), NOW(), NOW(), 'OTRA', 'Otra',
        'El problema no encaja en las categorías anteriores; quien reporta escribe la suya.',
        true, 'other'
      WHERE NOT EXISTS (
        SELECT 1 FROM "incident_categories" existing WHERE existing.code = 'OTRA'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::text AS count FROM "situations"
      WHERE "category_other_text" IS NOT NULL
    `)) as Array<{ count: string }>;
    if (Number(rows[0]?.count ?? '0') > 0) {
      throw new Error(
        'Hay problemas con categoría escrita («Otra»); revertir borraría ese dato.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "situations"
        DROP CONSTRAINT IF EXISTS "chk_situations_category_other_text_length"
    `);
    await queryRunner.query(`
      ALTER TABLE "situations" DROP COLUMN IF EXISTS "category_other_text"
    `);
    await queryRunner.query(`
      DELETE FROM "incident_categories"
      WHERE "code" = 'OTRA'
      AND NOT EXISTS (
        SELECT 1 FROM "situations" s WHERE s.category_id = "incident_categories".id
      )
    `);
  }
}
