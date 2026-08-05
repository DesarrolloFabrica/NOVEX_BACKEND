import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSituationRelatedCoordinations1786500000000 implements MigrationInterface {
  name = 'AddSituationRelatedCoordinations1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "situation_related_coordinations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "situation_id" uuid NOT NULL,
        "coordination_id" uuid NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "uq_situation_related_coordination" UNIQUE ("situation_id", "coordination_id"),
        CONSTRAINT "PK_situation_related_coordinations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_situation_related_situation_id"
      ON "situation_related_coordinations" ("situation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_situation_related_coordination_id"
      ON "situation_related_coordinations" ("coordination_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_related_coordinations"
      ADD CONSTRAINT "FK_situation_related_situation"
      FOREIGN KEY ("situation_id") REFERENCES "situations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_related_coordinations"
      ADD CONSTRAINT "FK_situation_related_coordination"
      FOREIGN KEY ("coordination_id") REFERENCES "coordinations"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situation_related_coordinations"
      DROP CONSTRAINT "FK_situation_related_coordination"
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_related_coordinations"
      DROP CONSTRAINT "FK_situation_related_situation"
    `);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_situation_related_coordination_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_situation_related_situation_id"`,
    );
    await queryRunner.query(`DROP TABLE "situation_related_coordinations"`);
  }
}
