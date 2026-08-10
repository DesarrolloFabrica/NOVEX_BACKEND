import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1786800000000 implements MigrationInterface {
  name = 'CreateAuditLogs1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid NULL,
        actor_role varchar(64) NULL,
        action varchar(80) NOT NULL,
        resource_type varchar(80) NOT NULL,
        resource_id varchar(128) NULL,
        request_id varchar(64) NULL,
        metadata jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_action ON audit_logs(action)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE audit_logs`);
  }
}
