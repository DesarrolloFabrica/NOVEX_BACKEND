import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserCoordinationNullable1786100000000 implements MigrationInterface {
  name = 'MakeUserCoordinationNullable1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_1420898e915adb8a430f1990eaf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "coordination_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_1420898e915adb8a430f1990eaf" FOREIGN KEY ("coordination_id") REFERENCES "coordinations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_1420898e915adb8a430f1990eaf"`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "coordination_id" = (SELECT "id" FROM "coordinations" ORDER BY "display_order" LIMIT 1) WHERE "coordination_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "coordination_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_1420898e915adb8a430f1990eaf" FOREIGN KEY ("coordination_id") REFERENCES "coordinations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
