import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

function buildCloudDataSource(): DataSource {
  const password = process.env.CLOUD_DB_PASSWORD;
  if (!password) {
    throw new Error('CLOUD_DB_PASSWORD no está definida.');
  }

  const sslEnabled =
    (process.env.CLOUD_DB_SSL ?? 'false').trim().toLowerCase() === 'true';

  return new DataSource({
    type: 'postgres',
    host: process.env.CLOUD_DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.CLOUD_DB_PORT ?? '15432', 10),
    username: process.env.CLOUD_DB_USERNAME ?? 'novex',
    password,
    database: process.env.CLOUD_DB_DATABASE ?? 'novex',
    synchronize: false,
    logging: false,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });
}

export interface UpsertCloudUserInput {
  email: string;
  fullName: string;
  roleCode: 'ADMIN' | 'DIRECTOR' | 'ANALISTA' | 'COORDINADOR';
}

export async function upsertCloudUser(
  input: UpsertCloudUserInput,
): Promise<{ action: 'created' | 'updated'; email: string; roleCode: string }> {
  const email = input.email.trim().toLowerCase();
  const dataSource = buildCloudDataSource();
  await dataSource.initialize();

  try {
    const roleRows = await dataSource.query<
      Array<{ id: string; code: string }>
    >(
      `SELECT id, code FROM roles WHERE code = $1 AND is_active = true LIMIT 1`,
      [input.roleCode],
    );
    const role = roleRows[0];
    if (!role) {
      throw new Error(`Rol no encontrado en Cloud: ${input.roleCode}`);
    }

    const existingRows = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email],
    );
    const existing = existingRows[0];

    if (existing) {
      await dataSource.query(
        `
          UPDATE users
          SET
            full_name = $2,
            role_id = $3,
            coordination_id = NULL,
            status = 'ACTIVE',
            updated_at = NOW()
          WHERE id = $1
        `,
        [existing.id, input.fullName, role.id],
      );
      return { action: 'updated', email, roleCode: role.code };
    }

    await dataSource.query(
      `
        INSERT INTO users (
          id,
          email,
          full_name,
          role_id,
          coordination_id,
          status,
          onboarding_step,
          onboarding_completed,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NULL, 'ACTIVE', 0, false, NOW(), NOW())
      `,
      [randomUUID(), email, input.fullName, role.id],
    );

    return { action: 'created', email, roleCode: role.code };
  } finally {
    await dataSource.destroy();
  }
}
