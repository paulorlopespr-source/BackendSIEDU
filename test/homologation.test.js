import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHomologationReset } from '../src/utils/homologation.js';

const validInput = {
  environment: 'homologation',
  confirmation: 'RESETAR_USUARIOS_HOMOLOGACAO',
  users: 'teste.secretaria.2026, ricardo.diretor.2026',
  password: 'SenhaInicial#2026',
};

test('aceita somente usuários de teste conhecidos na homologação', () => {
  assert.deepEqual(validateHomologationReset(validInput).users, [
    'teste.secretaria.2026',
    'ricardo.diretor.2026',
  ]);
});

test('recusa execução fora da homologação', () => {
  assert.throws(
    () => validateHomologationReset({ ...validInput, environment: 'production' }),
    /somente com SIEDU_ENV=homologation/,
  );
});

test('recusa usuário não autorizado e senha fraca', () => {
  assert.throws(
    () => validateHomologationReset({ ...validInput, users: 'administrador' }),
    /não autorizados/,
  );
  assert.throws(
    () => validateHomologationReset({ ...validInput, password: 'senha-fraca' }),
    /ao menos 12 caracteres/,
  );
});
