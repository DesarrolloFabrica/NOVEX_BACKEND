import { MigrationInterface, QueryRunner } from 'typeorm';

interface CoordinationIdRow {
  id: string;
}

const MERGE = 'servicios-into-homologaciones';

/**
 * Fusiona `coord-servicios` en `coord-homologaciones`: son la misma
 * coordinación (en la mesa de producto ya se presentaban juntas como
 * «Servicio»). Decisión de producto confirmada por el usuario.
 *
 * - Reasigna a Homologaciones las situaciones (responsable y afectada), las
 *   coordinaciones relacionadas, las afectaciones y los usuarios.
 * - Las dependencias de Servicios se eliminan (como en la fusión de Social Lab).
 * - `coord-servicios` NO se borra: queda inactiva. El historial inmutable
 *   (`situation_coordination_transfers`, `audit_logs`) puede referenciarla y
 *   no admite UPDATE ni DELETE; desactivarla conserva esas referencias.
 *
 * Reversible: cada valor cambiado o fila eliminada se guarda en
 * `coordination_merge_log` y `down()` lo restaura. Idempotente: sin alguna de
 * las dos filas, o ya fusionada, no hace nada.
 */
export class MergeServiciosIntoHomologaciones1789200000000 implements MigrationInterface {
  name = 'MergeServiciosIntoHomologaciones1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const fromId = await this.idOf(queryRunner, 'coord-servicios');
    const toId = await this.idOf(queryRunner, 'coord-homologaciones');
    if (!fromId || !toId || fromId === toId) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coordination_merge_log (
        id bigserial PRIMARY KEY,
        merge_name varchar(80) NOT NULL,
        table_name varchar(80) NOT NULL,
        action varchar(16) NOT NULL,
        row_data jsonb NOT NULL,
        logged_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Valores sueltos (UPDATE): se guarda la clave y la columna cambiada.
    for (const [table, column] of [
      ['users', 'coordination_id'],
      ['situations', 'coordination_id'],
      ['situations', 'affected_coordination_id'],
    ] as const) {
      await queryRunner.query(
        `
        INSERT INTO coordination_merge_log (merge_name, table_name, action, row_data)
        SELECT $1, '${table}', 'update', jsonb_build_object('id', id, 'column', '${column}')
        FROM "${table}" WHERE "${column}" = $2
        `,
        [MERGE, fromId],
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
        [toId, fromId],
      );
    }

    // Tablas de unión: primero se retiran (y registran) los duplicados que
    // quedarían al reasignar; luego se reasigna el resto.
    await this.mergeJoinTable(
      queryRunner,
      'situation_related_coordinations',
      'situation_id',
      fromId,
      toId,
    );
    await this.mergeJoinTable(
      queryRunner,
      'situation_affected_coordinations',
      'impact_assessment_id',
      fromId,
      toId,
    );

    // Dependencias del catálogo de Servicios: se eliminan y se registran.
    await queryRunner.query(
      `
      INSERT INTO coordination_merge_log (merge_name, table_name, action, row_data)
      SELECT $1, 'coordination_dependencies', 'delete', to_jsonb(d)
      FROM coordination_dependencies d
      WHERE d.source_coordination_id = $2 OR d.target_coordination_id = $2
      `,
      [MERGE, fromId],
    );
    await queryRunner.query(
      `DELETE FROM coordination_dependencies WHERE source_coordination_id = $1 OR target_coordination_id = $1`,
      [fromId],
    );

    await queryRunner.query(
      `UPDATE coordinations SET is_active = false WHERE id = $1`,
      [fromId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const fromId = await this.idOf(queryRunner, 'coord-servicios');
    if (!fromId) return;
    const logExists = (await queryRunner.query(
      `SELECT to_regclass('coordination_merge_log') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    if (!logExists[0]?.present) return;

    await queryRunner.query(
      `UPDATE coordinations SET is_active = true WHERE id = $1`,
      [fromId],
    );

    const entries = (await queryRunner.query(
      `SELECT table_name, action, row_data FROM coordination_merge_log WHERE merge_name = $1 ORDER BY id DESC`,
      [MERGE],
    )) as Array<{
      table_name: string;
      action: string;
      row_data: Record<string, unknown>;
    }>;

    for (const entry of entries) {
      const data = entry.row_data;
      if (entry.action === 'update') {
        // Valor suelto o fila de unión reasignada: vuelve a Servicios.
        if (typeof data.column === 'string') {
          await queryRunner.query(
            `UPDATE "${entry.table_name}" SET "${data.column}" = $1 WHERE id = $2`,
            [fromId, data.id],
          );
        } else {
          await queryRunner.query(
            `UPDATE "${entry.table_name}" SET coordination_id = $1 WHERE "${String(data.keyColumn)}" = $2 AND coordination_id = $3`,
            [fromId, data.key, data.toId],
          );
        }
      } else if (entry.action === 'delete') {
        // Fila eliminada: se reinserta tal cual estaba.
        await queryRunner.query(
          `INSERT INTO "${entry.table_name}" SELECT * FROM jsonb_populate_record(NULL::"${entry.table_name}", $1::jsonb) ON CONFLICT DO NOTHING`,
          [JSON.stringify(data)],
        );
      }
    }

    await queryRunner.query(
      `DELETE FROM coordination_merge_log WHERE merge_name = $1`,
      [MERGE],
    );
  }

  private async idOf(
    queryRunner: QueryRunner,
    code: string,
  ): Promise<string | undefined> {
    const rows = (await queryRunner.query(
      `SELECT id FROM coordinations WHERE code = $1 LIMIT 1`,
      [code],
    )) as CoordinationIdRow[];
    return rows[0]?.id;
  }

  private async mergeJoinTable(
    queryRunner: QueryRunner,
    table: string,
    keyColumn: string,
    fromId: string,
    toId: string,
  ): Promise<void> {
    // Duplicados: la misma clave ya tiene a Homologaciones.
    await queryRunner.query(
      `
      INSERT INTO coordination_merge_log (merge_name, table_name, action, row_data)
      SELECT $1, '${table}', 'delete', to_jsonb(old_row)
      FROM "${table}" AS old_row
      WHERE old_row.coordination_id = $2
        AND EXISTS (
          SELECT 1 FROM "${table}" AS keep_row
          WHERE keep_row."${keyColumn}" = old_row."${keyColumn}"
            AND keep_row.coordination_id = $3
        )
      `,
      [MERGE, fromId, toId],
    );
    await queryRunner.query(
      `
      DELETE FROM "${table}" AS old_row
      WHERE old_row.coordination_id = $1
        AND EXISTS (
          SELECT 1 FROM "${table}" AS keep_row
          WHERE keep_row."${keyColumn}" = old_row."${keyColumn}"
            AND keep_row.coordination_id = $2
        )
      `,
      [fromId, toId],
    );
    // Reasignación: se guarda la clave para poder devolverla a Servicios.
    await queryRunner.query(
      `
      INSERT INTO coordination_merge_log (merge_name, table_name, action, row_data)
      SELECT $1, '${table}', 'update',
             jsonb_build_object('keyColumn', '${keyColumn}', 'key', "${keyColumn}", 'toId', $3::uuid)
      FROM "${table}" WHERE coordination_id = $2
      `,
      [MERGE, fromId, toId],
    );
    await queryRunner.query(
      `UPDATE "${table}" SET coordination_id = $1 WHERE coordination_id = $2`,
      [toId, fromId],
    );
  }
}
