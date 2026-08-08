import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database.js';

test('possui todas as tabelas do núcleo acadêmico', async () => {
  const expectedTables = [
    'aluno_responsaveis',
    'alunos',
    'funcionarios_educacao',
    'matriculas',
    'professor_escolas',
    'professores',
    'responsaveis',
    'turma_professores',
    'turmas',
  ];

  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::TEXT[])
    ORDER BY table_name
  `, [expectedTables]);

  assert.deepEqual(
    rows.map((row) => row.table_name),
    expectedTables,
  );
});

test('gera matrícula anual sequencial no padrão definido', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM sequencias_matricula WHERE ano_letivo = $1',
      [2199],
    );
    const first = await client.query(
      'SELECT gerar_numero_matricula($1) AS numero',
      [2199],
    );
    const second = await client.query(
      'SELECT gerar_numero_matricula($1) AS numero',
      [2199],
    );

    assert.equal(first.rows[0].numero, '2199001');
    assert.equal(second.rows[0].numero, '2199002');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

test('grava o fluxo completo de escola, turma, aluno, responsável e matrícula', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM sequencias_matricula WHERE ano_letivo = $1',
      [2198],
    );

    const school = await client.query(`
      INSERT INTO escolas (nome, inep)
      VALUES ('Escola Temporária de Teste', 'TESTE-2198')
      RETURNING id
    `);
    const schoolId = school.rows[0].id;

    const schoolClass = await client.query(`
      INSERT INTO turmas (
        escola_id, ano_letivo, nome, etapa_ensino,
        serie_ano, turno, capacidade
      ) VALUES ($1,2198,'Turma Teste','Ensino Fundamental','1º Ano','Matutino',25)
      RETURNING id
    `, [schoolId]);

    const student = await client.query(`
      INSERT INTO alunos (nome_completo, data_nascimento)
      VALUES ('Aluno Temporário', '2015-01-10')
      RETURNING id
    `);

    const responsible = await client.query(`
      INSERT INTO responsaveis (nome_completo, telefone_principal)
      VALUES ('Responsável Temporário', '(74) 99999-0000')
      RETURNING id
    `);

    await client.query(`
      INSERT INTO aluno_responsaveis (
        aluno_id, responsavel_id, parentesco, contato_principal
      ) VALUES ($1,$2,'Responsável',TRUE)
    `, [student.rows[0].id, responsible.rows[0].id]);

    const enrollment = await client.query(`
      INSERT INTO matriculas (
        numero, aluno_id, escola_id, turma_id, ano_letivo
      ) VALUES (NULL,$1,$2,$3,2198)
      RETURNING numero
    `, [student.rows[0].id, schoolId, schoolClass.rows[0].id]);

    const summary = await client.query(`
      SELECT alunos_matriculados, vagas_disponiveis
      FROM vw_turmas_resumo
      WHERE id = $1
    `, [schoolClass.rows[0].id]);

    assert.equal(enrollment.rows[0].numero, '2198001');
    assert.equal(summary.rows[0].alunos_matriculados, 1);
    assert.equal(summary.rows[0].vagas_disponiveis, 24);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});
