import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source';

async function main(): Promise<void> {
  const sql = (process.env.CLOUD_SQL ?? process.argv.slice(2).join(' ')).trim();
  if (!sql) {
    throw new Error(
      'Defina CLOUD_SQL o pase la consulta como argumento. Ejemplo: $env:CLOUD_SQL="SELECT 1"; npm run cloud:sql',
    );
  }

  const dataSource = new DataSource(buildDataSourceOptions('cloud'));
  await dataSource.initialize();
  try {
    const rows: unknown = await dataSource.query(sql);
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error ejecutando SQL en Cloud:', error);
  process.exit(1);
});
