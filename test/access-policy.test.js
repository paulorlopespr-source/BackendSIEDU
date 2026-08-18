import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageAcademics } from '../src/utils/accessPolicy.js';

test('autoriza somente perfis pedagógicos e estratégicos na gestão acadêmica', () => {
  for (const perfil of [
    'Super Administrador',
    'Secretário Municipal de Educação',
    'Superintendente / Diretor de Ensino',
    'Coordenador Pedagógico Municipal',
    'Diretor',
    'Vice-Diretor',
    'Coordenador Pedagógico',
    'Secretário Escolar',
  ]) assert.equal(canManageAcademics({ perfil }), true, perfil);
});

test('bloqueia perfis administrativos e financeiros mesmo com escopo municipal', () => {
  for (const perfil of [
    'Secretaria Administrativa da Educação',
    'Técnico da Secretaria de Educação',
    'Setor Financeiro e Fiscal da Educação',
    'Professor',
    'Aluno',
  ]) assert.equal(canManageAcademics({ perfil, municipal: true }), false, perfil);
});
