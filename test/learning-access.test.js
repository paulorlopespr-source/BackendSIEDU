import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDefineSaeb,
  canEditRevisionTrails,
  isLearningProfessor,
  schoolGradeNumber,
} from '../src/learning-access.js';

test('restringe Avaliações de Ciclo ao professor e a partir do 6º ano', () => {
  assert.equal(isLearningProfessor({ perfil: 'Professor' }), true);
  assert.equal(isLearningProfessor({ perfil: 'Aluno' }), false);
  assert.equal(schoolGradeNumber('5º Ano'), 5);
  assert.equal(schoolGradeNumber('6º Ano'), 6);
  assert.equal(schoolGradeNumber('9º ano do Ensino Fundamental'), 9);
});

test('permite edição de trilhas somente a professores e coordenadores pedagógicos', () => {
  assert.equal(canEditRevisionTrails({ perfil: 'Professor' }), true);
  assert.equal(canEditRevisionTrails({ perfil: 'Coordenador Pedagógico Municipal' }), true);
  assert.equal(canEditRevisionTrails({ perfil: 'Coordenador Pedagógico' }), true);
  assert.equal(canEditRevisionTrails({ perfil: 'Aluno' }), false);
});

test('restringe definição do SAEB à gestão municipal autorizada', () => {
  assert.equal(canDefineSaeb({ perfil: 'Secretário Municipal de Educação' }), true);
  assert.equal(canDefineSaeb({ perfil: 'Coordenador Pedagógico Municipal' }), true);
  assert.equal(canDefineSaeb({ perfil: 'Superintendente / Diretor de Ensino' }), true);
  assert.equal(canDefineSaeb({ perfil: 'Professor' }), false);
  assert.equal(canDefineSaeb({ perfil: 'Aluno' }), false);
});
