import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarCategory, calendarEvent, calendarVisual } from '../src/student-calendar.js';

test('classifica os filtros do calendário escolar', () => {
  assert.equal(calendarCategory('Avaliação de Ciclo'), 'Avaliações');
  assert.equal(calendarCategory('Nota publicada'), 'Avaliações');
  assert.equal(calendarCategory('Simulado IDEB'), 'Simulados');
  assert.equal(calendarCategory('Férias'), 'Feriados e recessos');
  assert.equal(calendarCategory('Conselho de classe'), 'Reuniões');
  assert.equal(calendarCategory('Aviso'), 'Avisos');
});

test('define a identidade visual conforme o tipo do evento', () => {
  assert.equal(calendarVisual('Avaliação de Ciclo'), 'cycle');
  assert.equal(calendarVisual('Entrega de boletim'), 'report');
  assert.equal(calendarVisual('Recuperação final'), 'recovery');
  assert.equal(calendarVisual('Feriado municipal'), 'holiday');
});

test('normaliza eventos sem aceitar identificador de aluno externo', () => {
  const event = calendarEvent('cycle', {
    id: 7,
    titulo: 'Ciclo 2',
    tipo: 'Avaliação de Ciclo',
    dataFim: '2026-09-15',
    disciplina: 'Matemática',
  });
  assert.deepEqual(event, {
    id: 'cycle-7',
    titulo: 'Ciclo 2',
    tipo: 'Avaliação de Ciclo',
    categoria: 'Avaliações',
    visual: 'cycle',
    dataInicio: '2026-09-15',
    dataFim: '2026-09-15',
    horaInicio: null,
    horaFim: null,
    disciplina: 'Matemática',
    observacao: null,
    origem: 'cycle',
    escopo: 'Turma',
    destaque: false,
  });
});
