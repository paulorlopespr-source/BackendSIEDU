import test from 'node:test';
import assert from 'node:assert/strict';
import { isStudentProfile, studentContextSql } from '../src/student-access.js';
import { readFile } from 'node:fs/promises';

test('permite o portal somente ao perfil Aluno', () => {
  assert.equal(isStudentProfile({ perfil: 'Aluno' }), true);
  assert.equal(isStudentProfile({ perfil: 'Professor' }), false);
  assert.equal(isStudentProfile({ perfil: 'Diretor' }), false);
});

test('a rota legada de materiais também exige matrícula do próprio aluno', async () => {
  const source = await readFile(new URL('../src/routes/professor.js', import.meta.url), 'utf8');
  assert.match(source, /aluno\.usuario_id=\$1/);
  assert.match(source, /matricula\.turma_id=m\.turma_id/);
  assert.match(source, /matricula\.status='Ativa'/);
});

test('resolve o aluno pelo usuário autenticado, sem aceitar alunoId externo', () => {
  assert.match(studentContextSql, /a\.usuario_id = \$1/);
  assert.doesNotMatch(studentContextSql, /request\.(params|query|body)/);
  assert.match(studentContextSql, /m\.status = 'Ativa'/);
});
