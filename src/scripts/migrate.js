import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../database.js';

const migrations = [
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
];

for (const fileName of migrations) {
 const migration = resolve(process.cwd(), 'banco', fileName);
  const sql = (await readFile(migration, 'utf8')).replace(/^\uFEFF/, '');
  await pool.query(sql);
  console.log(`Migration ${fileName} applied successfully.`);
}

await pool.end();
