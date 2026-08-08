import { z } from 'zod';

export function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9])
    && calculateDigit(10) === Number(cpf[10]);
}

export const cpfSchema = z.string()
  .transform(normalizeCpf)
  .refine(isValidCpf, { message: 'CPF inválido.' });

export const emailSchema = z.string()
  .trim()
  .toLowerCase()
  .email('E-mail inválido.');

export const strongPasswordSchema = z.string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres.')
  .regex(/[a-z]/, 'A senha deve conter uma letra minúscula.')
  .regex(/[A-Z]/, 'A senha deve conter uma letra maiúscula.')
  .regex(/\d/, 'A senha deve conter um número.');
