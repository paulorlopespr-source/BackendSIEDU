import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { createRateLimiter } from '../middlewares/security.js';
import { strongPasswordSchema } from '../utils/validation.js';

const router = Router();

const loginLimiter = createRateLimiter({ max: 10, name: 'login' });
const recoveryLimiter = createRateLimiter({ max: 5, name: 'recuperacao' });
const resetLimiter = createRateLimiter({ max: 8, name: 'redefinicao' });

const loginSchema = z.object({
  usuario: z.string().trim().min(3),
  senha: z.string().min(6),
});

const passwordSchema = z.object({
  senhaAtual: z.string().min(6),
  novaSenha: strongPasswordSchema,
});

const recoveryRequestSchema = z.object({
  identificador: z.string().trim().min(3),
});

const recoveryResetSchema = z.object({
  identificador: z.string().trim().min(3),
  codigo: z.string().regex(/^\d{6}$/, 'Informe o código de seis números.'),
  novaSenha: strongPasswordSchema,
});

function recoveryHash(userId, code) {
  return createHash('sha256')
    .update(`${userId}:${code}:${process.env.JWT_SECRET}`)
    .digest('hex');
}

router.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const { usuario, senha } = loginSchema.parse(request.body);
    const { rows } = await pool.query(`
      SELECT
        u.id, u.nome, u.usuario, u.email, u.senha_hash,
        u.deve_alterar_senha, u.ativo, t.nome AS perfil, t.nivel
      FROM usuarios u
      JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      WHERE LOWER(u.usuario) = LOWER($1) OR LOWER(u.email) = LOWER($1)
      LIMIT 1
    `, [usuario]);

    const user = rows[0];
    if (!user || !user.ativo || !(await bcrypt.compare(senha, user.senha_hash))) {
      return response.status(401).json({ message: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign(
      { sub: user.id, nome: user.nome, perfil: user.perfil, nivel: user.nivel },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        audience: 'siepin-web',
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        issuer: 'siepin-api',
      },
    );

    return response.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        usuario: user.usuario,
        email: user.email,
        perfil: user.perfil,
        deveAlterarSenha: user.deve_alterar_senha,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/recuperar-senha', recoveryLimiter, async (request, response, next) => {
  try {
    const { identificador } = recoveryRequestSchema.parse(request.body);
    const { rows } = await pool.query(`
      SELECT id, nome, usuario, email
      FROM usuarios
      WHERE ativo = TRUE
        AND (LOWER(usuario) = LOWER($1) OR LOWER(email) = LOWER($1))
      LIMIT 1
    `, [identificador]);

    const user = rows[0];
    const genericMessage = 'Se o usuário estiver cadastrado, um código de recuperação será enviado ao e-mail informado.';
    if (!user) return response.json({ message: genericMessage });

    const code = String(randomInt(100000, 1000000));
    const codeHash = recoveryHash(user.id, code);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE recuperacoes_senha
        SET utilizado_em = NOW()
        WHERE usuario_id = $1 AND utilizado_em IS NULL
      `, [user.id]);
      await client.query(`
        INSERT INTO recuperacoes_senha (
          usuario_id, codigo_hash, expira_em, ip_solicitacao
        ) VALUES ($1,$2,NOW() + INTERVAL '15 minutes',$3)
      `, [user.id, codeHash, request.ip]);
      await client.query(`
        INSERT INTO fila_emails_sistema (destinatario, assunto, corpo)
        VALUES ($1,$2,$3)
      `, [
        user.email,
        'Código de recuperação de senha — SIEPIN',
        `Olá, ${user.nome}. Seu código de recuperação é ${code}. Ele expira em 15 minutos.`,
      ]);
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    return response.json({
      message: genericMessage,
      ...(process.env.NODE_ENV !== 'production'
        ? { codigoDesenvolvimento: code }
        : {}),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/redefinir-senha', resetLimiter, async (request, response, next) => {
  try {
    const data = recoveryResetSchema.parse(request.body);
    const userResult = await pool.query(`
      SELECT id
      FROM usuarios
      WHERE ativo = TRUE
        AND (LOWER(usuario) = LOWER($1) OR LOWER(email) = LOWER($1))
      LIMIT 1
    `, [data.identificador]);
    const user = userResult.rows[0];
    if (!user) return response.status(400).json({ message: 'Código inválido ou expirado.' });

    const recoveryResult = await pool.query(`
      SELECT id, codigo_hash, expira_em, tentativas
      FROM recuperacoes_senha
      WHERE usuario_id = $1 AND utilizado_em IS NULL
      ORDER BY solicitado_em DESC
      LIMIT 1
    `, [user.id]);
    const recovery = recoveryResult.rows[0];

    if (!recovery || new Date(recovery.expira_em) < new Date() || recovery.tentativas >= 5) {
      return response.status(400).json({ message: 'Código inválido ou expirado.' });
    }

    if (recovery.codigo_hash !== recoveryHash(user.id, data.codigo)) {
      await pool.query(
        'UPDATE recuperacoes_senha SET tentativas = tentativas + 1 WHERE id = $1',
        [recovery.id],
      );
      return response.status(400).json({ message: 'Código inválido ou expirado.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE usuarios
        SET senha_hash = $1, deve_alterar_senha = FALSE, atualizado_em = NOW()
        WHERE id = $2
      `, [await bcrypt.hash(data.novaSenha, 12), user.id]);
      await client.query(
        'UPDATE recuperacoes_senha SET utilizado_em = NOW() WHERE id = $1',
        [recovery.id],
      );
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    return response.json({ message: 'Senha redefinida com sucesso. Você já pode entrar no sistema.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/alterar-senha', authenticate, async (request, response, next) => {
  try {
    const { senhaAtual, novaSenha } = passwordSchema.parse(request.body);
    const { rows } = await pool.query(
      'SELECT senha_hash FROM usuarios WHERE id = $1',
      [request.user.sub],
    );
    if (!rows[0] || !(await bcrypt.compare(senhaAtual, rows[0].senha_hash))) {
      return response.status(400).json({ message: 'Senha atual inválida.' });
    }

    await pool.query(`
      UPDATE usuarios
      SET senha_hash = $1, deve_alterar_senha = FALSE, atualizado_em = NOW()
      WHERE id = $2
    `, [await bcrypt.hash(novaSenha, 12), request.user.sub]);
    return response.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
