import dataSource from '../data-source';
import {
  applyQaDirectorH2,
  assertQaLocalDatabase,
  cleanQaDirectorH2,
  reportQaDirectorH2,
} from './seed-qa-director-h2';

/**
 * Escenario QA DIRECTOR H2 2026 (SOLO LOCAL). Ejecución deliberada:
 *   npm run seed:qa-director-h2          → siembra / re-siembra (idempotente)
 *   npm run seed:qa-director-h2:clean    → elimina SOLO este escenario
 *   npm run seed:qa-director-h2 -- --report → solo imprime la validación
 * Ver qa-director-h2.scenario.ts para el diseño del dataset.
 */
async function main(): Promise<void> {
  // Antes de abrir conexión alguna: si no es la base local, no se continúa.
  const target = assertQaLocalDatabase();
  const clean = process.argv.includes('--clean');
  const reportOnly = process.argv.includes('--report');
  await dataSource.initialize();
  try {
    console.log(`Base: ${target.host}/${target.database}`);
    if (clean) {
      const removed = await cleanQaDirectorH2(dataSource);
      console.log(
        `QA Director H2 · limpieza: ${removed} situaciones del escenario eliminadas.`,
      );
      return;
    }
    if (!reportOnly) {
      const result = await applyQaDirectorH2(dataSource);
      console.log(
        `QA Director H2 · ${result.inserted} situaciones (${result.replaced} reemplazadas), ${result.resolutions} resoluciones con aprendizaje, ${result.timeline} eventos de timeline.`,
      );
      console.log('');
    }
    console.log(await reportQaDirectorH2(dataSource));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Error en seed QA Director H2:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
