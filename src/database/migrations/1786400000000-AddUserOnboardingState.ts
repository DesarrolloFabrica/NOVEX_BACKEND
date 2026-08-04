import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserOnboardingState1786400000000 implements MigrationInterface {
  name = 'AddUserOnboardingState1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD onboarding_step integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD onboarding_completed boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD onboarding_seen_at TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN onboarding_seen_at`);
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN onboarding_completed`,
    );
    await queryRunner.query(`ALTER TABLE users DROP COLUMN onboarding_step`);
  }
}
