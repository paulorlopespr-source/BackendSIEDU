import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authRoute = await readFile(new URL('../src/routes/auth.js', import.meta.url), 'utf8');
const authMiddleware = await readFile(new URL('../src/middlewares/auth.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../banco/74_revogacao_sessoes.sql', import.meta.url), 'utf8');

test('a versão da sessão faz parte do token de acesso', () => {
  assert.match(authRoute, /versaoSessao:\s*user\.versao_sessao/);
});

test('trocar ou recuperar a senha revoga sessões anteriores', () => {
  const increments = authRoute.match(/versao_sessao\s*=\s*versao_sessao\s*\+\s*1/g) || [];
  assert.equal(increments.length, 2);
});

test('o middleware compara o token com a versão atual do banco', () => {
  assert.match(authMiddleware, /current\.versao_sessao/);
  assert.match(authMiddleware, /user\.versaoSessao/);
});

test('a migração cria a versão de sessão com valor inicial seguro', () => {
  assert.match(migration, /versao_sessao INTEGER NOT NULL DEFAULT 0/);
});

