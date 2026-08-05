import { MigrationInterface, QueryRunner } from 'typeorm';

interface CoordinationIdRow {
  id: string;
}

/**
 * Unifica coord-social-lab en coord-proyeccion-social y crea coord-servicios.
 * Idempotente: entornos sin Social Lab o con Servicios ya creado son no-op parcial.
 */
export class MergeSocialLabAndAddServicios1786600000000 implements MigrationInterface {
  name = 'MergeSocialLabAndAddServicios1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const socialLab = (await queryRunner.query(
      `SELECT id FROM coordinations WHERE code = 'coord-social-lab' LIMIT 1`,
    )) as CoordinationIdRow[];
    const proyeccion = (await queryRunner.query(
      `SELECT id FROM coordinations WHERE code = 'coord-proyeccion-social' LIMIT 1`,
    )) as CoordinationIdRow[];

    const fromId: string | undefined = socialLab[0]?.id;
    const toId: string | undefined = proyeccion[0]?.id;

    if (fromId && toId && fromId !== toId) {
      await queryRunner.query(
        `UPDATE users SET coordination_id = $1 WHERE coordination_id = $2`,
        [toId, fromId],
      );

      await queryRunner.query(
        `UPDATE situations SET coordination_id = $1 WHERE coordination_id = $2`,
        [toId, fromId],
      );

      await queryRunner.query(
        `
        DELETE FROM situation_related_coordinations AS old_row
        WHERE old_row.coordination_id = $2
          AND EXISTS (
            SELECT 1 FROM situation_related_coordinations AS keep_row
            WHERE keep_row.situation_id = old_row.situation_id
              AND keep_row.coordination_id = $1
          )
        `,
        [toId, fromId],
      );
      await queryRunner.query(
        `UPDATE situation_related_coordinations SET coordination_id = $1 WHERE coordination_id = $2`,
        [toId, fromId],
      );

      await queryRunner.query(
        `
        DELETE FROM situation_affected_coordinations AS old_row
        WHERE old_row.coordination_id = $2
          AND EXISTS (
            SELECT 1 FROM situation_affected_coordinations AS keep_row
            WHERE keep_row.impact_assessment_id = old_row.impact_assessment_id
              AND keep_row.coordination_id = $1
          )
        `,
        [toId, fromId],
      );
      await queryRunner.query(
        `UPDATE situation_affected_coordinations SET coordination_id = $1 WHERE coordination_id = $2`,
        [toId, fromId],
      );

      await queryRunner.query(
        `
        DELETE FROM coordination_dependencies
        WHERE source_coordination_id = $1 OR target_coordination_id = $1
        `,
        [fromId],
      );

      await queryRunner.query(`DELETE FROM coordinations WHERE id = $1`, [
        fromId,
      ]);
    } else if (fromId && !toId) {
      await queryRunner.query(
        `
        UPDATE coordinations
        SET code = 'coord-proyeccion-social',
            name = 'Coordinador Proyección Social',
            short_name = 'Proyección Social',
            color = '#FFAB00',
            icon = 'coord-proyeccion-social',
            image_asset = 'CoordSociallab.png',
            display_order = 9,
            is_active = true
        WHERE id = $1
        `,
        [fromId],
      );
    }

    const servicios = (await queryRunner.query(
      `SELECT id FROM coordinations WHERE code = 'coord-servicios' LIMIT 1`,
    )) as CoordinationIdRow[];
    if (!servicios[0]?.id) {
      await queryRunner.query(
        `
        INSERT INTO coordinations (
          code, name, short_name, description, color, icon, image_asset,
          display_order, is_active
        ) VALUES (
          'coord-servicios',
          'Servicios',
          'Servicios',
          NULL,
          '#3DDC97',
          'coord-servicios',
          'CoordServicios.png',
          16,
          true
        )
        `,
      );
    }

    await queryRunner.query(`
      UPDATE coordinations SET display_order = CASE code
        WHEN 'coord-general' THEN 1
        WHEN 'coord-b2b' THEN 2
        WHEN 'coord-bellas-artes' THEN 3
        WHEN 'coord-desarrollo-profesional' THEN 4
        WHEN 'coord-empresarial' THEN 5
        WHEN 'coord-especializaciones' THEN 6
        WHEN 'coord-ingenierias' THEN 7
        WHEN 'coord-operaciones-academicas' THEN 8
        WHEN 'coord-proyeccion-social' THEN 9
        WHEN 'coord-saber-pro' THEN 10
        WHEN 'coord-transversales' THEN 11
        WHEN 'coord-negocios' THEN 12
        WHEN 'coord-homologaciones' THEN 14
        WHEN 'coord-fabrica-contenidos' THEN 15
        WHEN 'coord-servicios' THEN 16
        ELSE display_order
      END
      WHERE code IN (
        'coord-general', 'coord-b2b', 'coord-bellas-artes',
        'coord-desarrollo-profesional', 'coord-empresarial',
        'coord-especializaciones', 'coord-ingenierias',
        'coord-operaciones-academicas', 'coord-proyeccion-social',
        'coord-saber-pro', 'coord-transversales', 'coord-negocios',
        'coord-homologaciones', 'coord-fabrica-contenidos',
        'coord-servicios'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM coordinations WHERE code = 'coord-servicios'`,
    );

    const existing = (await queryRunner.query(
      `SELECT id FROM coordinations WHERE code = 'coord-social-lab' LIMIT 1`,
    )) as CoordinationIdRow[];
    if (!existing[0]?.id) {
      await queryRunner.query(
        `
        INSERT INTO coordinations (
          code, name, short_name, description, color, icon, image_asset,
          display_order, is_active
        ) VALUES (
          'coord-social-lab',
          'Coordinador de Social - Social Lab',
          'Social Lab',
          NULL,
          '#FF8A5B',
          'coord-social-lab',
          'CoordSociallab.png',
          5,
          true
        )
        `,
      );
    }
  }
}
