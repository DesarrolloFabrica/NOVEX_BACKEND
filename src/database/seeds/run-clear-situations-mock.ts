import dataSource from '../data-source';
import { clearMockSituations } from './seed-situations-mock';

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const cleared = await clearMockSituations(dataSource);
    console.log(
      `--- Limpieza mock completada: ${cleared} situaciones eliminadas ---`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error limpiando seed mock de situaciones:', error);
  process.exit(1);
});
