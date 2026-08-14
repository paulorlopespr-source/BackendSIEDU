import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCreateSchoolDemand,
  canDecideSchoolDemand,
  canExecuteSchoolDemand,
  statusForAdministration,
  statusForSecretaryDecision,
  urgencyColor,
} from '../src/demand-workflow.js';

test('separa as responsabilidades das três etapas do fluxo', () => {
  assert.equal(canCreateSchoolDemand({ perfil: 'Diretor' }), true);
  assert.equal(canCreateSchoolDemand({ perfil: 'Vice-Diretor' }), false);
  assert.equal(canCreateSchoolDemand({ perfil: 'Professor' }), false);
  assert.equal(canDecideSchoolDemand({ perfil: 'Secretário Municipal de Educação' }), true);
  assert.equal(canExecuteSchoolDemand({ perfil: 'Técnico da Secretaria de Educação' }), true);
  assert.equal(canExecuteSchoolDemand({ perfil: 'Diretor' }), false);
});

test('impede saltos de etapa na decisão da Secretaria', () => {
  assert.equal(statusForSecretaryDecision('Enviada à Secretaria', 'autorizar'), 'Autorizada para execução');
  assert.equal(statusForSecretaryDecision('Demanda resolvida', 'autorizar'), null);
});

test('a Administração somente mantém pendente ou conclui tarefa autorizada', () => {
  assert.equal(statusForAdministration('Autorizada para execução', 'pendente'), 'Pendente na Administração');
  assert.equal(statusForAdministration('Pendente na Administração', 'concluir'), 'Demanda resolvida');
  assert.equal(statusForAdministration('Enviada à Secretaria', 'concluir'), null);
});

test('aplica as cores institucionais da urgência', () => {
  assert.equal(urgencyColor('Alta'), 'vermelho');
  assert.equal(urgencyColor('Normal'), 'verde');
  assert.equal(urgencyColor('Baixa'), 'cinza');
});
