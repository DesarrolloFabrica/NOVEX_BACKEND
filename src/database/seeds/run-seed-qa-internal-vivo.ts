import dataSource from '../data-source';
import {
  applyQaInternalVivo,
  assertQaLocalDatabase,
  cleanQaInternalVivo,
  reportQaInternalVivo,
} from './seed-qa-internal-vivo';

/**
 * Escenario QA «INTERNAL vivo» (SOLO LOCAL). Ejecución deliberada:
 *   npm run seed:qa-internal-vivo          → siembra / re-siembra (idempotente)
 *   npm run seed:qa-internal-vivo:clean    → elimina SOLO este escenario
 *   npm run seed:qa-internal-vivo -- --report → solo valida e imprime
 * Diseño en qa-internal-vivo.scenario.ts. Los escalamientos son historia mock
 * QA (`qa-mock-history`), no una política.
 */
async function main(): Promise<void> {
  const target = assertQaLocalDatabase();
  const clean = process.argv.includes('--clean');
  const reportOnly = process.argv.includes('--report');
  await dataSource.initialize();
  try {
    console.log(`Base: ${target.host}/${target.database}`);
    if (clean) {
      const removed = await cleanQaInternalVivo(dataSource);
      console.log(
        `QA INTERNAL vivo · limpieza: ${removed} situaciones eliminadas.`,
      );
      return;
    }
    if (!reportOnly) {
      const result = await applyQaInternalVivo(dataSource);
      console.log(
        `QA INTERNAL vivo · ancla ${result.anchor.toISOString()} · ${result.inserted} situaciones (${result.replaced} reemplazadas), ${result.consequences} afectaciones, ${result.escalations} escalamientos mock.`,
      );
      console.log('');
    }
    const report = await reportQaInternalVivo(dataSource);
    console.log(report.text);
    if (report.violations.length > 0) process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Error en seed QA INTERNAL vivo:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
