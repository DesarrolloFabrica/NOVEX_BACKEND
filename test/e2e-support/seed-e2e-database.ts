/**
 * Prepara la base de pruebas E2E: esquema limpio desde las migraciones, RBAC y
 * coordinaciones desde los catálogos de datos del proyecto, y usuarios de prueba.
 *
 * Seguridad: no carga `.env`. Solo opera si TEST_DB_NAME contiene "test".
 * Uso: npx ts-node -P tsconfig.typeorm.json test/e2e-support/seed-e2e-database.ts
 * Requiere NOVEX_DESTRUCTIVE_TESTS=1 y las variables NOVEX_TEST_DB_* / DB_*.
 */
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import {
  assertDisposableDatabaseConnection,
  verifyDisposableDatabase,
} from '../support/disposable-database.guard';
import { Coordination } from '../../src/coordinations/entities/coordination.entity';
import { OPERACIONES_COORDINATIONS } from '../../src/database/seeds/seed-operaciones';
import { Permission } from '../../src/permissions/entities/permission.entity';
import { RolePermission } from '../../src/permissions/entities/role-permission.entity';
import {
  CATALOG_PERMISSIONS,
  ROLE_PERMISSION_CODES,
} from '../../src/permissions/seeds/permissions.catalog.seed';
import { Role } from '../../src/roles/entities/role.entity';
import { CATALOG_ROLES } from '../../src/roles/seeds/roles.catalog.seed';
import { UserStatus } from '../../src/common/enums/identity.enums';
import { User } from '../../src/users/entities/user.entity';

const ROOT = join(__dirname, '../..');

export const E2E_COORDINATOR_EMAIL = 'coordinadora.e2e@cun.edu.co';
export const E2E_ANALYST_EMAIL = 'analista.e2e@cun.edu.co';
/** Lectura de Dirección (KPIs y panel Director); sin coordinación propia. */
export const E2E_DIRECTOR_EMAIL = 'director.e2e@cun.edu.co';

interface HasCode {
  id: string;
  code: string;
}

/** Crea la fila si no existe por código; si existe, actualiza sus campos del catálogo. */
async function upsertByCode<T extends HasCode>(
  repository: {
    findOne: (o: { where: { code: string } }) => Promise<T | null>;
    create: (v: Record<string, unknown>) => T;
    save: (v: T) => Promise<T>;
  },
  code: string,
  fields: Record<string, unknown>,
): Promise<T> {
  const existing = await repository.findOne({ where: { code } });
  if (existing) {
    return repository.save(Object.assign(existing, fields));
  }
  return repository.save(repository.create({ code, ...fields }));
}

export async function seedE2eDatabase(): Promise<void> {
  // Barrera 1 y probe de marca: aborta antes de crear el DataSource que hará
  // cambios si falta autorización, el destino no coincide o no es desechable.
  const target = await verifyDisposableDatabase('seed-e2e-database');
  const ds = new DataSource({
    type: 'postgres',
    host: target.host,
    port: target.port,
    username: target.username,
    password: target.password,
    database: target.database,
    synchronize: false,
    entities: [join(ROOT, 'src/**/*.entity.ts')],
    migrations: [join(ROOT, 'src/database/migrations/*.ts')],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: false,
    migrationsTransactionMode: 'each',
  });
  await ds.initialize();

  try {
    // Barrera 2 sobre la conexión exacta que ejecutará las migraciones y el
    // DROP, por si el destino efectivo no es el del probe previo.
    await assertDisposableDatabaseConnection('seed-e2e-database', ds, target);
    await ds.query('DROP SCHEMA IF EXISTS public CASCADE');
    await ds.query('CREATE SCHEMA public');
    await ds.runMigrations();

    // Las migraciones ya insertan parte del catálogo: upsert por código.
    const permissionRepo = ds.getRepository(Permission);
    const permissionIds = new Map<string, string>();
    for (const item of CATALOG_PERMISSIONS) {
      const saved = await upsertByCode(permissionRepo, item.code, {
        name: item.name,
        module: item.module,
        description: item.description,
      });
      permissionIds.set(item.code, saved.id);
    }

    const roleRepo = ds.getRepository(Role);
    const roleIds = new Map<string, string>();
    for (const item of CATALOG_ROLES) {
      const saved = await upsertByCode(roleRepo, item.code, {
        name: item.name,
        description: item.description,
        isSystem: item.isSystem,
        isActive: item.isActive,
      });
      roleIds.set(item.code, saved.id);
    }

    const rolePermissionRepo = ds.getRepository(RolePermission);
    for (const [roleCode, codes] of Object.entries(ROLE_PERMISSION_CODES)) {
      const roleId = roleIds.get(roleCode);
      if (!roleId) continue;
      for (const code of codes) {
        const permissionId = permissionIds.get(code);
        if (!permissionId) continue;
        await rolePermissionRepo.save(
          rolePermissionRepo.create({ roleId, permissionId }),
        );
      }
    }

    const coordinationRepo = ds.getRepository(Coordination);
    const coordinationIds = new Map<string, string>();
    for (const item of OPERACIONES_COORDINATIONS) {
      const saved = await upsertByCode(coordinationRepo, item.code, {
        name: item.name,
        shortName: item.shortName,
        description: item.description,
        color: item.color,
        icon: item.icon,
        imageAsset: item.imageAsset,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
      });
      coordinationIds.set(item.code, saved.id);
    }

    const firstCoordinationCode = OPERACIONES_COORDINATIONS.find(
      (item) => item.isActive,
    )?.code;
    const coordinationId = firstCoordinationCode
      ? coordinationIds.get(firstCoordinationCode)
      : undefined;
    if (!coordinationId) {
      throw new Error('El catálogo no tiene coordinaciones activas.');
    }

    const userRepo = ds.getRepository(User);
    await userRepo.save(
      userRepo.create({
        email: E2E_COORDINATOR_EMAIL,
        fullName: 'Coordinadora E2E',
        roleId: roleIds.get('COORDINADOR') as string,
        coordinationId,
        status: UserStatus.ACTIVE,
        onboardingCompleted: true,
        onboardingStep: 99,
      }),
    );
    await userRepo.save(
      userRepo.create({
        email: E2E_ANALYST_EMAIL,
        fullName: 'Analista E2E',
        roleId: roleIds.get('ANALISTA') as string,
        coordinationId,
        status: UserStatus.ACTIVE,
        onboardingCompleted: true,
        onboardingStep: 99,
      }),
    );

    await userRepo.save(
      userRepo.create({
        email: E2E_DIRECTOR_EMAIL,
        fullName: 'Director E2E',
        roleId: roleIds.get('DIRECTOR') as string,
        coordinationId: null,
        status: UserStatus.ACTIVE,
        onboardingCompleted: true,
        onboardingStep: 99,
      }),
    );

    console.log(
      `Base E2E preparada: ${permissionIds.size} permisos, ${roleIds.size} roles, ${coordinationIds.size} coordinaciones.`,
    );
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  void seedE2eDatabase().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
