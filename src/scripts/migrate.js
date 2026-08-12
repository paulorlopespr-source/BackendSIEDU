import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../database.js';

const migrations = [
  '02_criar_tabelas.sql',
  '03_relacionamentos.sql',
  '04_dados_iniciais.sql',
  '06_autenticacao_usuarios.sql',
  '07_api_autenticacao.sql',
  '08_transporte_escolar.sql',
  '09_vinculo_diretor_escola.sql',
  '10_veiculos_propriedade.sql',
  '11_funcionario_educacao.sql',
  '12_perfis_colaboradores.sql',
  '13_auditoria_recursos_escolares.sql',
  '14_gestao_financeira_escolar.sql',
  '15_transporte_itinerarios_alunos_manutencoes.sql',
  '16_seguranca_recuperacao_auditoria.sql',
  '17_nucleo_academico.sql',
  '18_unidades_rede_municipal.sql',
  '19_detalhes_escolas.sql',
  '20_detalhes_profissionais_escolares.sql',
  '21_importacao_cm_antonio_joaquim.sql',
  '22_perfil_vice_diretor.sql',
  '23_email_usuario_opcional.sql',
  '24_perfis_funcionarios_educacao.sql',
];

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
