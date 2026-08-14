import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../database.js';
import { migrations } from '../migrations.js';

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    arquivo VARCHAR(255) PRIMARY KEY,
    aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

for (const fileName of migrations) {
  const alreadyApplied = await pool.query(
    `
      SELECT 1
      FROM schema_migrations
      WHERE arquivo = $1
    `,
    [fileName],
  );

  if (alreadyApplied.rowCount > 0) {
    console.log(`Migration ${fileName} já aplicada. Ignorando.`);
    continue;
  }

  console.log(`Aplicando migration ${fileName}...`);

  const migrationPath = resolve(
    process.cwd(),
    'banco',
    fileName,
  );

  const sql = (
    await readFile(migrationPath, 'utf8')
  ).replace(/^\uFEFF/, '');

  await pool.query(sql);

  await pool.query(
    `
      INSERT INTO schema_migrations (arquivo)
      VALUES ($1)
    `,
    [fileName],
  );

  console.log(`Migration ${fileName} aplicada com sucesso.`);
}

await pool.end();

console.log('Todas as migrations foram processadas.');
