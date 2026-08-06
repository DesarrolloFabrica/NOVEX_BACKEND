import { syncUsersFromCloud } from './sync-users-from-cloud';

async function main(): Promise<void> {
  const result = await syncUsersFromCloud();

  console.log('--- Sincronización de usuarios (cloud → local) ---');
  console.log(`Usuarios en cloud: ${result.cloudUserCount}`);
  console.log(
    `Coordinaciones: ${result.coordinationsCreated} creadas, ${result.coordinationsUpdated} actualizadas`,
  );
  console.log(
    `Usuarios: ${result.usersCreated} creados, ${result.usersUpdated} actualizados, ${result.usersSkipped} omitidos`,
  );
}

main().catch((error: unknown) => {
  console.error('Error sincronizando usuarios desde cloud:', error);
  process.exit(1);
});
