const ALLOWED_TEST_USERS = new Set([
  'teste.secretaria.2026',
  'caio.superintendente.2026',
  'larissa.coordenacao.2026',
  'ricardo.diretor.2026',
  'carlos.professor.2026',
  'ana.aluna.2026',
  'teste.sec',
  'teste.fin',
]);

export function validateHomologationReset({ environment, confirmation, users, password }) {
  if (environment !== 'homologation') {
    throw new Error('Operação permitida somente com SIEDU_ENV=homologation.');
  }
  if (confirmation !== 'RESETAR_USUARIOS_HOMOLOGACAO') {
    throw new Error('Confirmação de segurança inválida.');
  }

  const normalizedUsers = [...new Set(
    String(users || '').split(',').map((user) => user.trim().toLowerCase()).filter(Boolean),
  )];
  if (!normalizedUsers.length) throw new Error('Informe HOMOLOG_USERS.');

  const invalidUsers = normalizedUsers.filter((user) => !ALLOWED_TEST_USERS.has(user));
  if (invalidUsers.length) {
    throw new Error(`Usuários não autorizados para homologação: ${invalidUsers.join(', ')}.`);
  }

  const value = String(password || '');
  if (value.length < 12 || !/[A-Z]/.test(value) || !/[a-z]/.test(value)
      || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('HOMOLOG_INITIAL_PASSWORD deve ter ao menos 12 caracteres, maiúscula, minúscula, número e símbolo.');
  }

  return { users: normalizedUsers, password: value };
}
