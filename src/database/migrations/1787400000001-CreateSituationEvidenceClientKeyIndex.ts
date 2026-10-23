import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unicidad de la clave de evidencia por situación. Fuera de transacción
 * porque usa CREATE INDEX CONCURRENTLY. Si queda INVALID, eliminarlo con
 * DROP INDEX CONCURRENTLY IF EXISTS uq_situation_evidences_client_key y reintentar.
 */
export class CreateSituationEvidenceClientKeyIndex1787400000001 implements MigrationInterface {
  name = 'CreateSituationEvidenceClientKeyIndex1787400000001';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "uq_situation_evidences_client_key"
        ON "situation_evidences" ("situation_id", "client_key")
        WHERE "client_key" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sin CONCURRENTLY: TypeORM revierte dentro de una transacción, donde no está permitido.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_situation_evidences_client_key"`,
    );
  }
}
