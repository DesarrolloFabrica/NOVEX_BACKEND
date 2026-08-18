import dataSource from '../data-source';
import { runSituationsMockSeed } from './seed-situations-mock';

function readCount(): number {
  const fromEnv = Number(process.env.MOCK_SITUATIONS_COUNT ?? '80');
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return 80;
}

function readClearFlag(): boolean {
  const arg = process.argv.includes('--keep-existing');
  if (arg) return false;
  const fromEnv = process.env.MOCK_SITUATIONS_CLEAR;
  if (fromEnv === '0' || fromEnv === 'false') return false;
  return true;
}

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const result = await runSituationsMockSeed(dataSource, {
      count: readCount(),
      clearExisting: readClearFlag(),
    });

    console.log('--- Seed mock de situaciones completado ---');
    console.log(`Eliminadas previas (mock): ${result.cleared}`);
    console.log(`Situaciones creadas: ${result.created}`);
    console.log(`Con análisis IA mock: ${result.withAnalysis}`);
    console.log(`Con evaluación de impacto: ${result.withImpact}`);
    console.log(`Recomendaciones: ${result.recommendations}`);
    console.log(`Notas de captura: ${result.evidences}`);
    console.log(`Eventos de timeline: ${result.timelineEntries}`);
    console.log('');
    console.log(
      'La Red de impacto debería mostrar islas mixtas (crítica, alta, atención y normal).',
    );
    console.log(
      'Para cambiar cantidad: MOCK_SITUATIONS_COUNT=120 npm run seed:situations:mock',
    );
    console.log(
      'Para acumular sin borrar mocks previos: npm run seed:situations:mock -- --keep-existing',
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error ejecutando seed mock de situaciones:', error);
  process.exit(1);
});
