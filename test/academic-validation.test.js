import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classSchema,
  employeeSchema,
  studentEnrollmentSchema,
  teacherSchema,
} from '../src/utils/academicValidation.js';

test('valida uma turma acadêmica completa', () => {
  const schoolClass = classSchema.parse({
    escolaId: 1,
    anoLetivo: 2026,
    nome: '7º Ano A',
    etapaEnsino: 'Ensino Fundamental II',
    serieAno: '7º Ano',
    turno: 'Matutino',
    capacidade: 30,
  });

  assert.equal(schoolClass.escolaId, 1);
  assert.equal(schoolClass.capacidade, 30);
  assert.equal(schoolClass.status, 'Ativa');
});

test('rejeita turma com capacidade ou turno inválido', () => {
  assert.throws(() => classSchema.parse({
    escolaId: 1,
    anoLetivo: 2026,
    nome: 'Turma inválida',
    etapaEnsino: 'Fundamental',
    serieAno: '7º Ano',
    turno: 'Madrugada',
    capacidade: 0,
  }));
});

test('valida aluno, responsável e matrícula em um único formulário', () => {
  const enrollment = studentEnrollmentSchema.parse({
    escolaId: 1,
    turmaId: 2,
    anoLetivo: 2026,
    aluno: {
      nomeCompleto: 'Aluno de Teste',
      dataNascimento: '2014-05-10',
      necessidadeEducacionalEspecial: false,
    },
    responsavel: {
      nomeCompleto: 'Responsável de Teste',
      telefonePrincipal: '(74) 99999-0000',
    },
    parentesco: 'Mãe',
  });

  assert.equal(enrollment.anoLetivo, 2026);
  assert.equal(enrollment.contatoPrincipal, true);
  assert.equal(enrollment.aluno.nomeCompleto, 'Aluno de Teste');
});

test('exige descrição quando há necessidade educacional especial', () => {
  assert.throws(() => studentEnrollmentSchema.parse({
    escolaId: 1,
    turmaId: 2,
    anoLetivo: 2026,
    aluno: {
      nomeCompleto: 'Aluno de Teste',
      dataNascimento: '2014-05-10',
      necessidadeEducacionalEspecial: true,
    },
    responsavel: {
      nomeCompleto: 'Responsável de Teste',
      telefonePrincipal: '(74) 99999-0000',
    },
    parentesco: 'Pai',
  }));
});

test('valida CPF de professor e cargos permitidos para funcionários', () => {
  const teacher = teacherSchema.parse({
    escolaId: 1,
    nomeCompleto: 'Professor de Teste',
    cpf: '529.982.247-25',
  });
  assert.equal(teacher.cpf, '52998224725');

  const employee = employeeSchema.parse({
    escolaId: 1,
    nomeCompleto: 'Funcionário de Teste',
    cpf: '529.982.247-25',
    cargo: 'Auxiliar de Limpeza',
  });
  assert.equal(employee.cargo, 'Auxiliar de Limpeza');
  assert.throws(() => employeeSchema.parse({
    escolaId: 1,
    nomeCompleto: 'Funcionário Inválido',
    cpf: '529.982.247-25',
    cargo: 'Cargo não autorizado',
  }));
});
