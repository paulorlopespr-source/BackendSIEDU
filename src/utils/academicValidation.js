import { z } from 'zod';
import {
  emailSchema,
  isValidCpf,
  normalizeCpf,
} from './validation.js';

const currentYear = new Date().getFullYear();

export const positiveIdSchema = z.coerce.number().int().positive();
export const schoolYearSchema = z.coerce.number().int().min(2000).max(2200);

const optionalText = (maximum = 180) => z.preprocess(
  (value) => {
    const text = String(value ?? '').trim();
    return text || undefined;
  },
  z.string().max(maximum).optional(),
);

const optionalCpf = z.preprocess(
  (value) => {
    const cpf = normalizeCpf(value);
    return cpf || undefined;
  },
  z.string()
    .length(11)
    .refine(isValidCpf, { message: 'CPF inválido.' })
    .optional(),
);

const requiredCpf = z.string()
  .transform(normalizeCpf)
  .refine(isValidCpf, { message: 'CPF inválido.' });

const optionalEmail = z.preprocess(
  (value) => {
    const text = String(value ?? '').trim();
    return text || undefined;
  },
  emailSchema.optional(),
);

const phoneSchema = z.string()
  .trim()
  .min(8, 'Informe um telefone válido.')
  .max(30);

const addressSchema = z.object({
  cep: optionalText(9),
  logradouro: optionalText(180),
  numero: optionalText(20),
  complemento: optionalText(120),
  bairro: optionalText(120),
  cidade: optionalText(120),
  uf: z.preprocess(
    (value) => {
      const text = String(value ?? '').trim().toUpperCase();
      return text || undefined;
    },
    z.string().regex(/^[A-Z]{2}$/, 'UF inválida.').optional(),
  ),
});

export const studentSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(180),
  nomeSocial: optionalText(180),
  dataNascimento: z.coerce.date(),
  cpf: optionalCpf,
  rg: optionalText(30),
  certidaoNascimento: optionalText(80),
  genero: optionalText(30),
  nacionalidade: optionalText(80).default('Brasileira'),
  naturalidade: optionalText(120),
  necessidadeEducacionalEspecial: z.coerce.boolean().default(false),
  descricaoNecessidade: optionalText(1000),
  telefone: optionalText(30),
  email: optionalEmail,
  endereco: addressSchema.default({}),
}).superRefine((data, context) => {
  if (data.dataNascimento > new Date()) {
    context.addIssue({
      code: 'custom',
      path: ['dataNascimento'],
      message: 'A data de nascimento não pode estar no futuro.',
    });
  }

  if (data.necessidadeEducacionalEspecial && !data.descricaoNecessidade) {
    context.addIssue({
      code: 'custom',
      path: ['descricaoNecessidade'],
      message: 'Descreva a necessidade educacional especial.',
    });
  }
});

export const responsibleSchema = z.object({
  id: positiveIdSchema.optional(),
  nomeCompleto: z.string().trim().min(3).max(180).optional(),
  cpf: optionalCpf,
  rg: optionalText(30),
  dataNascimento: z.coerce.date().optional(),
  email: optionalEmail,
  telefonePrincipal: phoneSchema.optional(),
  telefoneAlternativo: optionalText(30),
  profissao: optionalText(120),
  endereco: addressSchema.default({}),
}).superRefine((data, context) => {
  if (!data.id && !data.nomeCompleto) {
    context.addIssue({
      code: 'custom',
      path: ['nomeCompleto'],
      message: 'Informe o nome do responsável.',
    });
  }
  if (!data.id && !data.telefonePrincipal) {
    context.addIssue({
      code: 'custom',
      path: ['telefonePrincipal'],
      message: 'Informe o contato principal do responsável.',
    });
  }
});

export const classSchema = z.object({
  escolaId: positiveIdSchema,
  anoLetivo: schoolYearSchema.default(currentYear),
  nome: z.string().trim().min(2).max(100),
  etapaEnsino: z.string().trim().min(2).max(100),
  serieAno: z.string().trim().min(1).max(80),
  turno: z.enum(['Matutino', 'Vespertino', 'Noturno', 'Integral']),
  capacidade: z.coerce.number().int().min(1).max(200),
  sala: optionalText(40),
  coordenadorUsuarioId: positiveIdSchema.optional(),
  status: z.enum(['Planejada', 'Ativa']).default('Ativa'),
  observacoes: optionalText(2000),
});

export const teacherSchema = z.object({
  escolaId: positiveIdSchema,
  usuarioId: positiveIdSchema.optional(),
  nomeCompleto: z.string().trim().min(3).max(180),
  cpf: requiredCpf,
  rg: optionalText(30),
  dataNascimento: z.coerce.date().optional(),
  email: optionalEmail,
  telefone: optionalText(30),
  matriculaFuncional: optionalText(40),
  formacao: optionalText(180),
  especialidade: optionalText(180),
  tipoVinculo: z.string().trim().min(2).max(40).default('Efetivo'),
  cargaHorariaSemanal: z.coerce.number().positive().max(168).optional(),
  dataInicio: z.coerce.date().default(() => new Date()),
});

export const employeeSchema = z.object({
  escolaId: positiveIdSchema,
  usuarioId: positiveIdSchema.optional(),
  nomeCompleto: z.string().trim().min(3).max(180),
  cpf: requiredCpf,
  rg: optionalText(30),
  email: optionalEmail,
  telefone: optionalText(30),
  cargo: z.enum([
    'Secretário Escolar',
    'Colaborador',
    'Acompanhante',
    'Motorista',
    'Merendeira',
    'Auxiliar de Limpeza',
    'Servente Escolar',
    'Outro',
  ]),
  matriculaFuncional: optionalText(40),
  tipoVinculo: z.string().trim().min(2).max(40).default('Efetivo'),
  dataAdmissao: z.coerce.date().optional(),
});

export const studentEnrollmentSchema = z.object({
  escolaId: positiveIdSchema,
  turmaId: positiveIdSchema,
  anoLetivo: schoolYearSchema.default(currentYear),
  aluno: studentSchema,
  responsavel: responsibleSchema,
  parentesco: z.string().trim().min(2).max(40),
  responsavelLegal: z.coerce.boolean().default(true),
  contatoPrincipal: z.coerce.boolean().default(true),
  autorizadoBuscar: z.coerce.boolean().default(true),
  resideComAluno: z.coerce.boolean().default(true),
  escolaOrigem: optionalText(180),
  observacoes: optionalText(2000),
});

export const enrollmentSchema = z.object({
  escolaId: positiveIdSchema,
  turmaId: positiveIdSchema,
  alunoId: positiveIdSchema,
  anoLetivo: schoolYearSchema.default(currentYear),
  escolaOrigem: optionalText(180),
  observacoes: optionalText(2000),
});

export const classTeacherSchema = z.object({
  professorId: positiveIdSchema,
  componenteCurricular: z.string().trim().min(2).max(120),
  cargaHorariaSemanal: z.coerce.number().positive().max(168).optional(),
  titular: z.coerce.boolean().default(false),
});
