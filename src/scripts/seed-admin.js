import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { pool } from '../database.js';

const required = ['ADMIN_NOME', 'ADMIN_CPF', 'ADMIN_EMAIL', 'ADMIN_USUARIO', 'ADMIN_SENHA'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Configure no .env: ${missing.join(', ')}`);

const { rows: types } = await pool.query('SELECT id FROM tipos_usuarios WHERE nivel = 1 ORDER BY id LIMIT 1');
if (!types[0]) throw new Error('Perfil Super Administrador não encontrado. Execute as migrações primeiro.');

const { rows: existing } = await pool.query('SELECT id FROM usuarios WHERE usuario = $1 OR email = $2', [process.env.ADMIN_USUARIO, process.env.ADMIN_EMAIL]);
if (existing[0]) throw new Error('Já existe um administrador com esse usuário ou e-mail.');

await pool.query(
  `INSERT INTO usuarios (nome, cpf, email, usuario, senha_hash, tipo_usuario_id, ativo, deve_alterar_senha)
   VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)`,
  [
    process.env.ADMIN_NOME,
    process.env.ADMIN_CPF.replace(/\D/g, ''),
    process.env.ADMIN_EMAIL.toLowerCase(),
    process.env.ADMIN_USUARIO,
    await bcrypt.hash(process.env.ADMIN_SENHA, 12),
    types[0].id,
  ],
);
console.log('Superadministrador criado com sucesso.');
await pool.end();
