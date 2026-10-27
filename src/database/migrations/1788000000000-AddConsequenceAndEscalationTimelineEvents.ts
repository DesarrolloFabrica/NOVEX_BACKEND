import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevos tipos de evento del timeline:
 *
 *   CONSEQUENCE_ADDED   Afectación registrada (referencia `consequenceId`).
 *   SEVERITY_ESCALATED  Escalamiento automático. Disponible en el esquema;
 *                       nada lo emite mientras no haya política activa.
 *
 * Va en una migración PROPIA porque un valor añadido con `ALTER TYPE … ADD
 * VALUE` no puede usarse dentro de la misma transacción que lo crea.
 *
 * `down` no hace nada: PostgreSQL no permite retirar un valor de un enum sin
 * recrear el tipo, y dejar valores sin uso es inocuo.
 */
export class AddConsequenceAndEscalationTimelineEvents1788000000000 implements MigrationInterface {
  name = 'AddConsequenceAndEscalationTimelineEvents1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "situation_timeline_entries_event_type_enum"
      ADD VALUE IF NOT EXISTS 'CONSEQUENCE_ADDED'
    `);
    await queryRunner.query(`
      ALTER TYPE "situation_timeline_entries_event_type_enum"
      ADD VALUE IF NOT EXISTS 'SEVERITY_ESCALATED'
    `);
  }

  public async down(): Promise<void> {
    // Intencionalmente vacío (ver comentario de la clase).
  }
}
