import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { pool } from '../database.js';
import { validateHomologationReset } from '../utils/homologation.js';

let exitCode = 0;
let client;

try {
  const { users, password } = validateHomologationReset({
    environment: process.env.SIEDU_ENV,
    confirmation: process.env.HOMOLOG_RESET_CONFIRMATION,
    users: process.env.HOMOLOG_USERS,
    password: process.env.HOMOLOG_INITIAL_PASSWORD,
  });
  const passwordHash = await bcrypt.hash(password, 12);
  client = await pool.connect();
  await client.query('BEGIN');

  const { rows } = await client.query(
    `UPDATE usuarios
       SET senha_hash = $1,
           ativo = TRUE,
           situacao_acesso = 'ativo',
           deve_alterar_senha = TRUE,
           atualizado_em = NOW()
     WHERE LOWER(usuario) = ANY($2::text[])
     RETURNING usuario`,
    [passwordHash, users],
  );

  const updated = rows.map(({ usuario }) => usuario.toLowerCase());
  const missing = users.filter((user) => !updated.includes(user));
  if (missing.length) throw new Error(`Usuários não encontrados: ${missing.join(', ')}.`);
  await client.query('COMMIT');

  console.log(`Usuários de homologação reativados: ${updated.join(', ')}.`);
  console.log('A senha inicial não foi exibida. Cada usuário deverá alterá-la no primeiro acesso.');
} catch (error) {
  exitCode = 1;
  if (client) await client.query('ROLLBACK');
  console.error(error.message);
} finally {
  client?.release();
  await pool.end();
  process.exitCode = exitCode;
}
