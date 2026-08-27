import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../src/middlewares/audit.js';

test('remove senhas, códigos e tokens dos dados de auditoria', () => {
  const result = sanitize({
    senha: 'segredo',
    token: 'jwt-secreto',
    codigoDesenvolvimento: '123456',
    user: {
      nome: 'Usuário de teste',
      senha_hash: 'hash',
    },
  });

  assert.equal(result.senha, '[PROTEGIDO]');
  assert.equal(result.token, '[PROTEGIDO]');
  assert.equal(result.codigoDesenvolvimento, '[PROTEGIDO]');
  assert.equal(result.user.senha_hash, '[PROTEGIDO]');
  assert.equal(result.user.nome, 'Usuário de teste');
});

test('remove dados pessoais e médicos dos dados de auditoria', () => {
  const result = sanitize({
    cpf: '00000000000',
    email: 'pessoa@example.com',
    telefone: '000000000',
    cidSid: 'A00',
  });

  assert.deepEqual(result, {
    cpf: '[PROTEGIDO]',
    email: '[PROTEGIDO]',
    telefone: '[PROTEGIDO]',
    cidSid: '[PROTEGIDO]',
  });
});

test('protege conteúdo muito grande', () => {
  const result = sanitize({ arquivo: 'a'.repeat(501) });
  assert.match(result.arquivo, /CONTEÚDO PROTEGIDO/);
});

