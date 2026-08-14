import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarEventSchema, canManageSchoolCalendar } from '../src/calendar-management.js';

test('restringe a gestão do calendário aos perfis municipais autorizados', () => {
  assert.equal(canManageSchoolCalendar({ perfil: 'Secretário Municipal de Educação' }), true);
  assert.equal(canManageSchoolCalendar({ perfil: 'Coordenador Pedagógico Municipal' }), true);
  assert.equal(canManageSchoolCalendar({ perfil: 'Professor' }), false);
  assert.equal(canManageSchoolCalendar({ perfil: 'Aluno' }), false);
});

test('exige o destino compatível com o escopo do evento', () => {
  const base = { escopo: 'Rede', titulo: 'Início do ano letivo', tipo: 'Ano letivo', dataInicio: '2026-02-02' };
  assert.equal(calendarEventSchema.parse(base).escolaId, null);
  assert.throws(() => calendarEventSchema.parse({ ...base, escopo: 'Escola' }));
  assert.throws(() => calendarEventSchema.parse({ ...base, escopo: 'Turma', escolaId: 1 }));
  assert.equal(calendarEventSchema.parse({ ...base, escopo: 'Turma', turmaId: 10 }).turmaId, 10);
});

test('rejeita período e horário invertidos', () => {
  const base = { escopo: 'Rede', titulo: 'Período letivo', tipo: 'Período letivo', dataInicio: '2026-08-10' };
  assert.throws(() => calendarEventSchema.parse({ ...base, dataFim: '2026-08-09' }));
  assert.throws(() => calendarEventSchema.parse({ ...base, horaInicio: '10:00', horaFim: '09:00' }));
});
