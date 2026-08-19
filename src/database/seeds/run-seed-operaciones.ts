import dataSource from '../data-source';
import { runOperacionesSeed } from './seed-operaciones';
import { assertLocalDatabaseProfile } from '../../configuration/resolve-database-env';

async function main(): Promise<void> {
  assertLocalDatabaseProfile('seed:operaciones');
  await dataSource.initialize();

  try {
    const result = await runOperacionesSeed(dataSource);

    console.log('--- Seed operaciones completado ---');
    console.log(
      `Coordinaciones: ${result.coordinationsCreated} creadas, ${result.coordinationsUpdated} actualizadas`,
    );
    console.log(
      `Usuarios: ${result.usersCreated} creados, ${result.usersUpdated} actualizados`,
    );
    console.log('--- Asignaciones ---');

    for (const assignment of result.assignments) {
      const coordinationLabel =
        assignment.coordinationName ??
        assignment.coordinationCode ??
        'sin coordinación';
      console.log(
        `${assignment.email} | ${assignment.roleCode} | ${coordinationLabel}`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error ejecutando seed operaciones:', error);
  process.exit(1);
});
