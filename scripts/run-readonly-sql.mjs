// Ejecuta un archivo SQL de SOLO LECTURA y compara migraciones por nombre.
//
//   node scripts/run-readonly-sql.mjs scripts/release-circo-preflight-readonly.sql
//
// Conexión: variables estándar de libpq que lee `pg` (PGHOST, PGPORT,
// PGDATABASE, PGUSER, PGPASSWORD). Este script no las imprime nunca; solo
// muestra host, puerto y base. La sesión se abre con
// default_transaction_read_only=on y se aborta si el servidor no lo confirma.
//
// Formato del SQL: cada bloque empieza con una línea `\echo <título>` y cada
// sentencia termina en `;`. Se respetan BEGIN/ROLLBACK del archivo.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(
  process.argv[2] ?? join(here, 'release-circo-preflight-readonly.sql'),
);
const migrationsDir = join(here, '..', 'src', 'database', 'migrations');

/** Nombre de clase de cada migración del repo: `1787200000000-Foo.ts` → `Foo1787200000000`. */
function repoMigrationNames() {
  return readdirSync(migrationsDir)
    .filter((file) => /^\d{13}-.+\.ts$/.test(file))
    .map((file) => {
      const [, ts, name] = file.match(/^(\d{13})-(.+)\.ts$/);
      return { order: ts, name: `${name}${ts}` };
    })
    .sort(
      (a, b) => a.order.localeCompare(b.order) || a.name.localeCompare(b.name),
    )
    .map((m) => m.name);
}

function parseBlocks(text) {
  const blocks = [];
  let title = null;
  let buffer = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('\\echo')) {
      title = line.replace(/^\\echo\s*/, '');
      continue;
    }
    if (!line.trim() || line.trim().startsWith('--')) continue;
    buffer.push(line);
    if (line.trim().endsWith(';')) {
      blocks.push({ title, sql: buffer.join('\n') });
      title = null;
      buffer = [];
    }
  }
  return blocks;
}

const client = new pg.Client({
  options: '-c default_transaction_read_only=on',
});
const host = process.env.PGHOST ?? '(PGHOST no definido)';
console.log(
  `Destino: ${host}:${process.env.PGPORT ?? '5432'} base=${process.env.PGDATABASE ?? '(sin PGDATABASE)'}`,
);

await client.connect();
try {
  const { rows } = await client.query('SHOW default_transaction_read_only');
  if (rows[0]?.default_transaction_read_only !== 'on') {
    throw new Error(
      'La sesión NO es de solo lectura: se aborta sin ejecutar nada.',
    );
  }
  console.log('Sesión de solo lectura confirmada por el servidor.\n');

  let applied = null;
  for (const block of parseBlocks(readFileSync(sqlPath, 'utf8'))) {
    const result = await client.query(block.sql);
    if (!block.title) continue;
    console.log(`== ${block.title}`);
    if (block.title.startsWith('01 ')) {
      applied = result.rows.map((r) => r.name);
      console.log(
        `   ${applied.length} aplicadas; última: ${applied.at(-1) ?? '(ninguna)'}`,
      );
    } else if (result.rows.length === 0) {
      console.log('   (sin filas)');
    } else {
      console.table(result.rows);
    }
  }

  if (applied) {
    const repo = repoMigrationNames();
    const appliedSet = new Set(applied);
    const repoSet = new Set(repo);
    console.log('== Migraciones: contraste por nombre con el repositorio');
    console.log('   Pendientes (en el repo, no aplicadas):');
    for (const name of repo.filter((n) => !appliedSet.has(n)))
      console.log(`     - ${name}`);
    const unknown = applied.filter((n) => !repoSet.has(n));
    console.log(
      `   Aplicadas que NO están en el repo: ${unknown.length ? '' : '(ninguna)'}`,
    );
    for (const name of unknown) console.log(`     - ${name}`);
  }
} finally {
  await client.end();
}
