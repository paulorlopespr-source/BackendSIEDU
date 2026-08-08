import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../src/database.js';
import {
  syncUserSchools,
  uniqueSchoolIds,
  validateSchoolBindings,
} from '../src/routes/users.js';

test('remove escolas repetidas antes de salvar os vínculos', () => {
  assert.deepEqual(uniqueSchoolIds([2, 1, 2, 1]), [2, 1]);
});

test('Diretor e Secretário Escolar podem ter no máximo uma escola', () => {
  assert.throws(
    () => validateSchoolBindings('Diretor', [1, 2]),
    /somente uma unidade escolar/,
  );
  assert.throws(
    () => validateSchoolBindings('Secretário Escolar', [1, 2]),
    /somente uma unidade escolar/,
  );
  assert.doesNotThrow(
    () => validateSchoolBindings('Diretor', [1]),
  );
  assert.doesNotThrow(
    () => validateSchoolBindings('Secretaria Escolar', []),
  );
});

test('Coordenador pode ser vinculado a várias escolas', () => {
  assert.doesNotThrow(
    () => validateSchoolBindings('Coordenador', [1, 2, 3]),
  );
});

test('sincroniza usuario_escolas e a escola principal na mesma transação', async (context) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const schoolsResult = await client.query(`
      SELECT id
      FROM escolas
      ORDER BY id
      LIMIT 2
    `);

    if (schoolsResult.rows.length < 2) {
      context.skip('O teste requer ao menos duas escolas cadastradas.');
      return;
    }

    const typeResult = await client.query(`
      SELECT id
      FROM tipos_usuarios
      WHERE nome = 'Coordenador'
      ORDER BY id
      LIMIT 1
    `);
    assert.ok(typeResult.rows[0], 'Perfil Coordenador não encontrado.');

    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const userResult = await client.query(`
      INSERT INTO usuarios (
        nome, cpf, email, usuario, senha_hash, tipo_usuario_id
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
    `, [
      'Teste de Vínculo Escolar',
      suffix.slice(-11).padStart(11, '7'),
      `vinculo-${suffix}@teste.local`,
      `vinculo-${suffix}`,
      'hash-de-teste',
      typeResult.rows[0].id,
    ]);
    const userId = userResult.rows[0].id;
    const schoolIds = schoolsResult.rows.map((school) => school.id);

    await syncUserSchools(client, userId, schoolIds);

    const firstSync = await client.query(`
      SELECT
        u.escola_id AS "escolaPrincipalId",
        ARRAY_AGG(ue.escola_id ORDER BY ue.escola_id) AS escolas
      FROM usuarios u
      JOIN usuario_escolas ue ON ue.usuario_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    assert.equal(firstSync.rows[0].escolaPrincipalId, schoolIds[0]);
    assert.deepEqual(firstSync.rows[0].escolas, [...schoolIds].sort((a, b) => a - b));

    await syncUserSchools(client, userId, [schoolIds[1]]);

    const secondSync = await client.query(`
      SELECT
        u.escola_id AS "escolaPrincipalId",
        ARRAY_AGG(ue.escola_id) AS escolas
      FROM usuarios u
      JOIN usuario_escolas ue ON ue.usuario_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    assert.equal(secondSync.rows[0].escolaPrincipalId, schoolIds[1]);
    assert.deepEqual(secondSync.rows[0].escolas, [schoolIds[1]]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});
