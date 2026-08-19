import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Categorías operativas seleccionables en captura.
 * Conserva las 4 técnicas históricas (is_selectable = false).
 */
export class AddIncidentCategorySelectableAndIcon1787000000000 implements MigrationInterface {
  name = 'AddIncidentCategorySelectableAndIcon1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "incident_categories"
      ADD COLUMN "is_selectable" boolean NOT NULL DEFAULT true,
      ADD COLUMN "icon" character varying(32) NOT NULL DEFAULT 'apps'
    `);

    await queryRunner.query(`
      UPDATE "incident_categories"
      SET
        "is_selectable" = false,
        "icon" = CASE "code"
          WHEN 'ACADEMIC_INCONSISTENCY' THEN 'diplomas'
          WHEN 'RESOLVED_SERVICE_EVENT' THEN 'tickets'
          ELSE 'apps'
        END
      WHERE "code" IN (
        'PLATFORM_OUTAGE',
        'ACADEMIC_INCONSISTENCY',
        'TECH_DEGRADATION',
        'RESOLVED_SERVICE_EVENT'
      )
    `);

    await queryRunner.query(`
      INSERT INTO "incident_categories" (
        "id", "created_at", "updated_at", "code", "name", "description",
        "is_selectable", "icon"
      )
      SELECT uuid_generate_v4(), NOW(), NOW(), v.code, v.name, v.description, true, v.icon
      FROM (
        VALUES
          ('INFRAESTRUCTURA', 'Infraestructura', 'Sedes, espacios, conectividad física y recursos de planta.', 'infrastructure'),
          ('EQUIPOS', 'Equipos', 'Hardware, dispositivos y fallas de equipos institucionales.', 'devices'),
          ('INTERNET', 'Internet', 'Red, wifi, cortes o intermitencia de conectividad.', 'internet'),
          ('APLICATIVOS', 'Aplicativos', 'Plataformas y sistemas institucionales distintos a Zoho, Iceberg o ACAS.', 'apps'),
          ('ZOHO', 'Zoho', 'Incidentes y bloqueos asociados a Zoho.', 'zoho'),
          ('ICEBERG', 'Iceberg', 'Incidentes y bloqueos asociados a Iceberg.', 'iceberg'),
          ('ACAS', 'ACAS', 'Incidentes y bloqueos asociados a ACAS.', 'acas'),
          ('DIPLOMADOS', 'Diplomados', 'Programación, cupos y operación de diplomados.', 'diplomas'),
          ('TICKETS', 'Tickets', 'Casos de mesa de ayuda y tickets de soporte.', 'tickets')
      ) AS v(code, name, description, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM "incident_categories" existing WHERE existing.code = v.code
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "incident_categories"
      DROP COLUMN IF EXISTS "icon",
      DROP COLUMN IF EXISTS "is_selectable"
    `);
  }
}
