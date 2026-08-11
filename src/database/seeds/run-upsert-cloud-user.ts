import { upsertCloudUser } from './upsert-cloud-user';

async function main(): Promise<void> {
  const email = process.env.UPSERT_USER_EMAIL?.trim().toLowerCase();
  const fullName = process.env.UPSERT_USER_FULL_NAME?.trim();
  const roleCode = (process.env.UPSERT_USER_ROLE_CODE ?? 'ADMIN')
    .trim()
    .toUpperCase();

  if (!email || !fullName) {
    throw new Error(
      'Defina UPSERT_USER_EMAIL y UPSERT_USER_FULL_NAME antes de ejecutar.',
    );
  }

  if (!['ADMIN', 'DIRECTOR', 'ANALISTA', 'COORDINADOR'].includes(roleCode)) {
    throw new Error(`Rol inválido: ${roleCode}`);
  }

  const result = await upsertCloudUser({
    email,
    fullName,
    roleCode: roleCode as 'ADMIN' | 'DIRECTOR' | 'ANALISTA' | 'COORDINADOR',
  });

  console.log('--- Usuario Cloud upsert completado ---');
  console.log(`Acción: ${result.action}`);
  console.log(`Email: ${result.email}`);
  console.log(`Rol: ${result.roleCode}`);
}

main().catch((error: unknown) => {
  console.error('Error upsert usuario Cloud:', error);
  process.exit(1);
});
