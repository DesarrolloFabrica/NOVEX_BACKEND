import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardening de historial institucional.
 *
 * Requiere que infraestructura aprovisione:
 *   - NOVEX_HISTORY_OWNER_ROLE: rol NOLOGIN, separado del runtime;
 *   - NOVEX_APP_DB_ROLE: rol usado por la aplicación, no propietario ni
 *     miembro del rol propietario.
 * El migrador debe poder transferir la propiedad al primer rol. La migración
 * falla cerrada si faltan roles o si no hay separación efectiva.
 */
export class HardenSituationHistory1788700000000 implements MigrationInterface {
  name = 'HardenSituationHistory1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const owner = roleIdentifier('NOVEX_HISTORY_OWNER_ROLE');
    const app = roleIdentifier('NOVEX_APP_DB_ROLE');
    const ownerName = owner.slice(1, -1);
    const appName = app.slice(1, -1);

    await queryRunner.query(`
      DO $novex$
      DECLARE
        owner_role text := '${ownerName}';
        app_role text := '${appName}';
        owner_login boolean;
        app_superuser boolean;
        migration_can_transfer boolean;
      BEGIN
        SELECT rolcanlogin INTO owner_login FROM pg_roles WHERE rolname = owner_role;
        SELECT rolsuper INTO app_superuser FROM pg_roles WHERE rolname = app_role;
        IF owner_login IS NULL OR app_superuser IS NULL THEN
          RAISE EXCEPTION 'NOVEX_HISTORY_OWNER_ROLE y NOVEX_APP_DB_ROLE deben existir antes de migrar';
        END IF;
        IF owner_role = app_role OR owner_login OR app_superuser THEN
          RAISE EXCEPTION 'El rol propietario debe ser NOLOGIN y distinto del rol operativo no-superusuario';
        END IF;
        IF pg_has_role(app_role, owner_role, 'MEMBER') THEN
          RAISE EXCEPTION 'El rol operativo no puede ser miembro del rol propietario del historial';
        END IF;
        SELECT rolsuper OR pg_has_role(current_user, owner_role, 'MEMBER')
          INTO migration_can_transfer FROM pg_roles WHERE rolname = current_user;
        IF NOT coalesce(migration_can_transfer, false) THEN
          RAISE EXCEPTION 'El migrador debe poder transferir propiedad a %', owner_role;
        END IF;
      END
      $novex$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_reject_history_mutation"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% es historial institucional inmutable: no admite %.', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'check_violation';
      END;
      $$
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_audit_logs_immutable" ON "audit_logs"`,
    );
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_cancellations_append_only"
      ON "situation_cancellations"
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_coordination_transfers_append_only"
      ON "situation_coordination_transfers"
    `);

    for (const table of [
      'audit_logs',
      'situation_cancellations',
      'situation_coordination_transfers',
    ]) {
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trg_${table}_immutable_rows" ON "${table}"
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_immutable_rows"
        BEFORE UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION "novex_reject_history_mutation"()
      `);
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trg_${table}_immutable_truncate" ON "${table}"
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_immutable_truncate"
        BEFORE TRUNCATE ON "${table}"
        FOR EACH STATEMENT EXECUTE FUNCTION "novex_reject_history_mutation"()
      `);
      await queryRunner.query(
        `REVOKE ALL ON TABLE "${table}" FROM PUBLIC, ${app}`,
      );
      await queryRunner.query(
        `GRANT SELECT, INSERT ON TABLE "${table}" TO ${app}`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" OWNER TO ${owner}`);
    }

    await queryRunner.query(`
      DO $novex$
      DECLARE
        app_role text := '${appName}';
        table_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'audit_logs',
          'situation_cancellations',
          'situation_coordination_transfers'
        ] LOOP
          IF has_table_privilege(app_role, format('public.%I', table_name)::regclass, 'UPDATE')
             OR has_table_privilege(app_role, format('public.%I', table_name)::regclass, 'DELETE')
             OR has_table_privilege(app_role, format('public.%I', table_name)::regclass, 'TRUNCATE') THEN
            RAISE EXCEPTION 'El rol operativo % conserva privilegios de mutación sobre %', app_role, table_name;
          END IF;
        END LOOP;
      END
      $novex$;
    `);

    // La anulación y los traslados son historia de la situación: una baja
    // física del padre no debe propagar un borrado en cascada.
    await queryRunner.query(`
      ALTER TABLE "situation_cancellations"
      DROP CONSTRAINT "fk_situation_cancellations_situation",
      ADD CONSTRAINT "fk_situation_cancellations_situation"
        FOREIGN KEY ("situation_id") REFERENCES "situations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_coordination_transfers"
      DROP CONSTRAINT "fk_situation_coordination_transfers_situation",
      ADD CONSTRAINT "fk_situation_coordination_transfers_situation"
        FOREIGN KEY ("situation_id") REFERENCES "situations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_coordination_transfers"
        ADD COLUMN "previous_assigned_user_id" uuid NULL,
        ADD COLUMN "next_assigned_user_id" uuid NULL,
        ADD CONSTRAINT "fk_situation_coordination_transfers_previous_assignee"
          FOREIGN KEY ("previous_assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "fk_situation_coordination_transfers_next_assignee"
          FOREIGN KEY ("next_assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `ALTER FUNCTION "novex_reject_history_mutation"() OWNER TO ${owner}`,
    );
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION "novex_reject_history_mutation"() FROM PUBLIC`,
    );
  }

  public down(): Promise<void> {
    throw new Error(
      'HardenSituationHistory es irreversible automáticamente: revertirlo quitaría protecciones de auditoría e historial. Requiere un plan de seguridad aprobado.',
    );
  }
}

function roleIdentifier(variable: string): string {
  const value = process.env[variable]?.trim();
  if (!value || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value)) {
    throw new Error(
      `${variable} debe declarar un identificador PostgreSQL simple (máx. 63 caracteres).`,
    );
  }
  return `"${value}"`;
}
