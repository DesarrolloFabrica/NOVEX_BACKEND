import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * COMPATIBILIDAD DEL ESQUEMA DE CARTAS CON EL CÓDIGO ANTERIOR (transitoria).
 *
 * Tras las migraciones de cartas, `situations.reported_severity` es NOT NULL
 * sin default (1787800000000) y cada situación debe tener su fila REPORTED en
 * `situation_severity_changes`. El backend anterior (main 49a6483) no conoce
 * esas columnas: al insertar una situación fallaría por NOT NULL. Eso impide
 * dos cosas que el despliegue necesita:
 *
 *   - aplicar las migraciones ANTES de cambiar el código (la revisión anterior
 *     sigue sirviendo mientras la nueva arranca), y
 *   - devolver el tráfico a la revisión anterior sin borrar datos.
 *
 * Esta migración no inventa valores: rellena SOLO lo que el código anterior
 * omite y con las mismas reglas que ya aplicaron los backfills de cartas:
 *
 *   reported_severity        := severity                 (1787800000000:
 *                               último recurso del COALESCE = la severidad
 *                               de la fila, que en el alta es la reportada)
 *   affected_coordination_id := coordination_id, solo en INTERNAL
 *                               (1787400000000: misma asignación)
 *   fila REPORTED            := (NULL → reported_severity, created_at,
 *                               created_by_user_id)      (1787800000000)
 *
 * SOLO INSERCIONES CON FORMA ANTERIOR. Lo que distingue al código anterior es
 * que no envía `reported_severity`. Cualquier otra inserción (el código de
 * cartas, seeds o pruebas que ya traen el valor) queda exactamente como llega:
 * ni se completa ni recibe fila REPORTED automática.
 *
 * La fila REPORTED la crea un CONSTRAINT TRIGGER DIFERIDO al final de la
 * transacción, solo para las filas que el trigger previo marcó (marca local a
 * la transacción con `set_config`) y solo si no existe. Así no choca con
 * `uq_situation_severity_changes_reported` cuando otro código inserta la suya,
 * ni siquiera en una transacción posterior.
 *
 * `down` solo retira triggers y funciones: no borra ni modifica datos.
 * Retirar (con una migración nueva) cuando ya no haga falta volver a la
 * versión anterior a cartas.
 */
export class LegacySituationInsertCompatibility1788100000000 implements MigrationInterface {
  name = 'LegacySituationInsertCompatibility1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_situations_legacy_insert_defaults"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        -- Solo una inserción con forma ANTERIOR (sin reported_severity) se
        -- completa; cualquier otra queda exactamente como llegó.
        IF NEW."reported_severity" IS NOT NULL THEN
          RETURN NEW;
        END IF;
        NEW."reported_severity" := NEW."severity";
        IF NEW."report_kind" = 'INTERNAL'
           AND NEW."affected_coordination_id" IS NULL
           AND NEW."coordination_id" IS NOT NULL THEN
          NEW."affected_coordination_id" := NEW."coordination_id";
        END IF;
        -- Marca de transacción para el trigger diferido: esta fila, y solo
        -- esta, necesita su fila REPORTED.
        PERFORM set_config(
          'novex.legacy_' || replace(NEW."id"::text, '-', '_'), 'on', true);
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situations_legacy_insert_defaults"
      ON "situations"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_situations_legacy_insert_defaults"
      BEFORE INSERT ON "situations"
      FOR EACH ROW EXECUTE FUNCTION "novex_situations_legacy_insert_defaults"()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_situations_ensure_reported_severity_change"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF coalesce(current_setting(
             'novex.legacy_' || replace(NEW."id"::text, '-', '_'), true), '')
           <> 'on' THEN
          RETURN NULL;
        END IF;
        INSERT INTO "situation_severity_changes"
          ("situation_id", "previous_severity", "new_severity", "source",
           "effective_at", "actor_user_id")
        SELECT s."id", NULL, s."reported_severity", 'REPORTED',
               s."created_at", s."created_by_user_id"
        FROM "situations" s
        WHERE s."id" = NEW."id"
          AND NOT EXISTS (
            SELECT 1 FROM "situation_severity_changes" c
            WHERE c."situation_id" = s."id" AND c."source" = 'REPORTED'
          )
        ON CONFLICT DO NOTHING;
        RETURN NULL;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situations_ensure_reported_severity_change"
      ON "situations"
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_situations_ensure_reported_severity_change"
      AFTER INSERT ON "situations"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "novex_situations_ensure_reported_severity_change"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situations_ensure_reported_severity_change"
      ON "situations"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS "novex_situations_ensure_reported_severity_change"()
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situations_legacy_insert_defaults"
      ON "situations"
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS "novex_situations_legacy_insert_defaults"()
    `);
  }
}
