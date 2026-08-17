import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../database.js';
import { migrations } from '../migrations.js';

const migrationEnvironment = process.env.SIEDU_ENV
  || process.env.RAILWAY_ENVIRONMENT_NAME
  || (process.env.RAILWAY_GIT_BRANCH === 'homologacao' ? 'homologation' : 'unknown');
const railwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID || '';

const client = await pool.connect();
await client.query("SELECT set_config('siedu.environment', $1, false)", [migrationEnvironment]);
await client.query("SELECT set_config('siedu.railway_environment_id', $1, false)", [railwayEnvironmentId]);

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    arquivo VARCHAR(255) PRIMARY KEY,
    aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

for (const fileName of migrations) {
  const alreadyApplied = await client.query(
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

  await client.query(sql);

  await client.query(
    `
      INSERT INTO schema_migrations (arquivo)
      VALUES ($1)
    `,
    [fileName],
  );

  console.log(`Migration ${fileName} aplicada com sucesso.`);
}

client.release();
await pool.end();

console.log('Todas as migrations foram processadas.');
