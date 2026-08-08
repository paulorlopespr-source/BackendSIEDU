import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailSchema,
  isValidCpf,
  normalizeCpf,
  strongPasswordSchema,
} from '../src/utils/validation.js';

test('normaliza e valida um CPF com dígitos verificadores corretos', () => {
  assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
  assert.equal(isValidCpf('529.982.247-25'), true);
});

test('rejeita CPF repetido e CPF com dígito incorreto', () => {
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('529.982.247-24'), false);
});

test('normaliza e-mail e rejeita endereço inválido', () => {
  assert.equal(emailSchema.parse(' USUARIO@EXEMPLO.COM '), 'usuario@exemplo.com');
  assert.throws(() => emailSchema.parse('email-invalido'));
});

test('exige senha com tamanho, maiúscula, minúscula e número', () => {
  assert.equal(strongPasswordSchema.parse('SenhaForte9'), 'SenhaForte9');
  assert.throws(() => strongPasswordSchema.parse('fraca'));
  assert.throws(() => strongPasswordSchema.parse('SENHAFORTE9'));
  assert.throws(() => strongPasswordSchema.parse('SenhaSemNumero'));
});
