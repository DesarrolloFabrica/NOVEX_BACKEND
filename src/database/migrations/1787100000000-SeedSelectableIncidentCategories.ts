import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotente: cubre entornos donde 178700 ya corrió sin el INSERT del catálogo.
 */
export class SeedSelectableIncidentCategories1787100000000 implements MigrationInterface {
  name = 'SeedSelectableIncidentCategories1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      DELETE FROM "incident_categories"
      WHERE "code" IN (
        'INFRAESTRUCTURA', 'EQUIPOS', 'INTERNET', 'APLICATIVOS',
        'ZOHO', 'ICEBERG', 'ACAS', 'DIPLOMADOS', 'TICKETS'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "situations" s WHERE s.category_id = "incident_categories".id
      )
    `);
  }
}
