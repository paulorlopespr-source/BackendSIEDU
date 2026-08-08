import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database.js';

test('possui as 36 unidades oficiais da rede municipal', async () => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(DISTINCT codigo_rede)::INTEGER AS codigos
    FROM escolas
    WHERE codigo_rede ~ '^[0-9]{2}$'
      AND codigo_rede BETWEEN '01' AND '36'
  `);

  assert.equal(rows[0].total, 36);
  assert.equal(rows[0].codigos, 36);
});

test('usa os nomes institucionais nas unidades 28 e 30', async () => {
  const { rows } = await pool.query(`
    SELECT codigo_rede, nome
    FROM escolas
    WHERE codigo_rede IN ('28', '30')
    ORDER BY codigo_rede
  `);

  assert.deepEqual(rows, [
    {
      codigo_rede: '28',
      nome: 'Colégio Municipal Rômulo Galvão - Sede',
    },
    {
      codigo_rede: '30',
      nome: 'Colégio Municipal Professor Luiz Navarro de Brito - Sede',
    },
  ]);
});

test.after(async () => {
  await pool.end();
});
