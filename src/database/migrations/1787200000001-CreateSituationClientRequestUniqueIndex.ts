import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice único de idempotencia por creador y clave.
 *
 * CREATE INDEX CONCURRENTLY no bloquea escrituras en `situations`, pero no puede
 * ejecutarse dentro de una transacción; por eso `transaction = false`.
 *
 * Si la creación falla a mitad, PostgreSQL deja el índice en estado INVALID.
 * En ese caso: DROP INDEX CONCURRENTLY IF EXISTS uq_situations_creator_client_request;
 * y volver a ejecutar la migración.
 */
export class CreateSituationClientRequestUniqueIndex1787200000001 implements MigrationInterface {
  name = 'CreateSituationClientRequestUniqueIndex1787200000001';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "uq_situations_creator_client_request"
        ON "situations" ("created_by_user_id", "client_request_id")
        WHERE "client_request_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sin CONCURRENTLY: TypeORM revierte dentro de una transacción, donde no está permitido.
    // La reversión toma un bloqueo breve sobre situations; es una operación de rollback.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_situations_creator_client_request"`,
    );
  }
}
