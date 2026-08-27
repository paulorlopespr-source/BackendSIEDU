import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../banco/75_integridade_matriculas_retencao.sql', import.meta.url), 'utf8');

test('impede matrícula em turma de outra escola', () => {
  assert.match(migration, /turma_escola_id\s*<>\s*NEW\.escola_id/);
});

test('impede matrícula em turma de outro ano letivo', () => {
  assert.match(migration, /turma_ano_letivo\s*<>\s*NEW\.ano_letivo/);
});

test('prepara índices para retenção sem apagar auditoria automaticamente', () => {
  assert.match(migration, /idx_recuperacoes_senha_retencao/);
  assert.match(migration, /idx_fila_emails_retencao/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+auditoria_sistema/i);
});

