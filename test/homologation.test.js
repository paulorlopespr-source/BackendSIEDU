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

test('permite reativar as contas oficiais dos portais de homologação', () => {
  const result = validateHomologationReset({
    ...validInput,
    users: 'teste.SEC, teste.FIN, ana.aluna.2026',
  });
  assert.deepEqual(result.users, ['teste.sec', 'teste.fin', 'ana.aluna.2026']);
});

test('recusa o identificador administrativo histórico', () => {
  assert.throws(
    () => validateHomologationReset({ ...validInput, users: 'teste.fluxo.administracao' }),
    /não autorizados/,
  );
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
