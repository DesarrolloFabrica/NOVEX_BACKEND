/**
 * Prepara la base de pruebas E2E: esquema limpio desde las migraciones, RBAC y
 * coordinaciones desde los catálogos de datos del proyecto, y usuarios de prueba.
 *
 * Seguridad: no carga `.env`. Solo opera si TEST_DB_NAME contiene "test".
 * Variables: TEST_DB_HOST, TEST_DB_PORT, TEST_DB_USER, TEST_DB_PASSWORD, TEST_DB_NAME.
 *
 * Uso: npx ts-node -P tsconfig.typeorm.json test/e2e-support/seed-e2e-database.ts
 */
import { join } from 'node:path';
import { DataSource } from 'typeorm';
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

function requireTestDatabaseEnv() {
  const names = [
    'TEST_DB_HOST',
    'TEST_DB_PORT',
    'TEST_DB_USER',
    'TEST_DB_PASSWORD',
    'TEST_DB_NAME',
  ] as const;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables: ${missing.join(', ')}`);
  }
  const database = process.env.TEST_DB_NAME as string;
  if (!database.toLowerCase().includes('test')) {
    throw new Error(
      `Por seguridad, TEST_DB_NAME debe contener "test". Valor: ${database}`,
    );
  }
  return {
    host: process.env.TEST_DB_HOST as string,
    port: Number(process.env.TEST_DB_PORT),
    username: process.env.TEST_DB_USER as string,
    password: process.env.TEST_DB_PASSWORD as string,
    database,
  };
}

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

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    ...requireTestDatabaseEnv(),
    synchronize: false,
    entities: [join(ROOT, 'src/**/*.entity.ts')],
    migrations: [join(ROOT, 'src/database/migrations/*.ts')],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: false,
    migrationsTransactionMode: 'each',
  });
  await ds.initialize();

  try {
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

    console.log(
      `Base E2E preparada: ${permissionIds.size} permisos, ${roleIds.size} roles, ${coordinationIds.size} coordinaciones.`,
    );
  } finally {
    await ds.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
