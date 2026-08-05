import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El analista registra situaciones a su propio nombre: no representa a ninguna
 * coordinación, así que el caso queda sin coordinación dueña y su trazabilidad
 * vive en `created_by_user_id`.
 */
export class MakeSituationCoordinationNullable1786700000000 implements MigrationInterface {
  name = 'MakeSituationCoordinationNullable1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "situations" DROP CONSTRAINT "FK_6c6bf9345455bf55ce6874be25b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "situations" ALTER COLUMN "coordination_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "situations" ADD CONSTRAINT "FK_6c6bf9345455bf55ce6874be25b" FOREIGN KEY ("coordination_id") REFERENCES "coordinations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "situations" DROP CONSTRAINT "FK_6c6bf9345455bf55ce6874be25b"`,
    );
    await queryRunner.query(
      `UPDATE "situations" SET "coordination_id" = (SELECT "id" FROM "coordinations" ORDER BY "display_order" LIMIT 1) WHERE "coordination_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "situations" ALTER COLUMN "coordination_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "situations" ADD CONSTRAINT "FK_6c6bf9345455bf55ce6874be25b" FOREIGN KEY ("coordination_id") REFERENCES "coordinations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
