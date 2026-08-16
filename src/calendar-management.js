import { z } from 'zod';

export const calendarManagerProfiles = new Set([
  'Super Administrador',
  'Secretário Municipal de Educação',
  'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal',
  'Diretor',
]);

export const calendarEventTypes = [
  'Ano letivo', 'Período letivo', 'Feriado', 'Recesso', 'Férias',
  'Avaliação', 'Avaliação de Ciclo', 'Atividade', 'Prazo final',
  'Nota publicada', 'Simulado IDEB', 'Simulado SAEB', 'Recuperação',
  'Conselho de classe', 'Reunião', 'Evento escolar',
  'Entrega de boletim', 'Exame final', 'Aviso',
];

const optionalId = z.preprocess(
  (value) => value === '' || value == null ? null : Number(value),
  z.number().int().positive().nullable(),
);
const optionalDate = z.preprocess(
  (value) => value === '' || value == null ? null : String(value),
  z.string().date().nullable(),
);
const optionalTime = z.preprocess(
  (value) => value === '' || value == null ? null : String(value),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
);

export const calendarEventSchema = z.object({
  escopo: z.enum(['Rede', 'Escola', 'Turma']),
  escolaId: optionalId.optional().default(null),
  turmaId: optionalId.optional().default(null),
  titulo: z.string().trim().min(3).max(180),
  tipo: z.enum(calendarEventTypes),
  disciplina: z.string().trim().max(120).optional().default(''),
  dataInicio: z.string().date(),
  dataFim: optionalDate.optional().default(null),
  horaInicio: optionalTime.optional().default(null),
  horaFim: optionalTime.optional().default(null),
  observacao: z.string().trim().max(4000).optional().default(''),
  destaque: z.boolean().optional().default(false),
  publicado: z.boolean().optional().default(true),
}).superRefine((data, context) => {
  if (data.escopo === 'Escola' && !data.escolaId) {
    context.addIssue({ code: 'custom', path: ['escolaId'], message: 'Selecione a escola.' });
  }
  if (data.escopo === 'Turma' && !data.turmaId) {
    context.addIssue({ code: 'custom', path: ['turmaId'], message: 'Selecione a turma.' });
  }
  if (data.dataFim && data.dataFim < data.dataInicio) {
    context.addIssue({ code: 'custom', path: ['dataFim'], message: 'A data final não pode ser anterior à inicial.' });
  }
  if (data.horaInicio && data.horaFim && data.horaFim <= data.horaInicio) {
    context.addIssue({ code: 'custom', path: ['horaFim'], message: 'O horário final deve ser posterior ao inicial.' });
  }
});

export const canManageSchoolCalendar = (access) => calendarManagerProfiles.has(access?.perfil);
