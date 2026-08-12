import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import {
  allowMunicipalAdmin,
  loadAccessContext,
} from '../middlewares/access.js';
import {
  cpfSchema,
  emailSchema,
  strongPasswordSchema,
} from '../utils/validation.js';

const router = Router();

const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  emailSchema.optional(),
);

const userSchema = z.object({
  nome: z.string().trim().min(3),
  cpf: cpfSchema,
  email: optionalEmailSchema,
  tipoUsuarioId: z.coerce.number().int().positive(),
  escolaId: z.coerce.number().int().positive().nullable().optional(),
  escolaIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
  usuario: z.string().trim().min(3).optional(),
  senhaTemporaria: strongPasswordSchema.optional(),
});

const schoolBindingsSchema = z.object({
  escolaIds: z.array(z.coerce.number().int().positive()).max(100),
});

const allowedEducationProfiles = new Set([
  'Secretário Municipal de Educação',
  'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal',
  'Técnico da Secretaria de Educação',
  'Diretor',
  'Vice-Diretor',
  'Coordenador Pedagógico',
  'Secretário Escolar',
  'Auxiliar/Assistente Administrativo',
  'Professor',
  'Auxiliar de Vida Escolar / Cuidador',
  'Auxiliar de Serviços Gerais',
  'Motorista',
  'Monitor de Transporte Escolar',
  'Merendeira/Cozinheira',
  'Porteiro/Vigia',
  'Psicólogo',
  'Assistente Social',
  'Nutricionista'
]);

const schoolRequiredProfiles = new Set([
  'Diretor',
  'Vice-Diretor',
  'Coordenador Pedagógico',
  'Secretário Escolar',
  'Auxiliar/Assistente Administrativo',
  'Professor',
  'Auxiliar de Vida Escolar / Cuidador',
  'Auxiliar de Serviços Gerais',
  'Merendeira/Cozinheira',
  'Porteiro/Vigia'
]);

const multiSchoolProfiles = new Set(['Coordenador Pedagógico']);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function uniqueSchoolIds(schoolIds) {
  return [...new Set(schoolIds.map(Number))];
}

export function validateSchoolBindings(
  profile,
  schoolIds,
  { required = false } = {},
) {
  if (!multiSchoolProfiles.has(profile) && schoolIds.length > 1) {
    throw httpError(
      400,
      `${profile} pode ser vinculado a somente uma unidade escolar.`,
    );
  }

  if (required && schoolRequiredProfiles.has(profile) && schoolIds.length === 0) {
    throw httpError(
      400,
      `Selecione ao menos uma unidade escolar para o perfil ${profile}.`,
    );
  }
}

async function assertSchoolsExist(client, schoolIds) {
  if (schoolIds.length === 0) return;

  const { rows } = await client.query(`
    SELECT ARRAY_AGG(id ORDER BY id) AS ids
    FROM escolas
    WHERE id = ANY($1::INTEGER[])
  `, [schoolIds]);

  const existingIds = rows[0].ids || [];
  if (existingIds.length !== schoolIds.length) {
    throw httpError(400, 'Uma ou mais unidades escolares não existem.');
  }
}

export async function syncUserSchools(client, userId, schoolIds) {
  await client.query(
    'DELETE FROM usuario_escolas WHERE usuario_id = $1',
    [userId],
  );

  for (const schoolId of schoolIds) {
    await client.query(`
      INSERT INTO usuario_escolas (usuario_id, escola_id)
      VALUES ($1, $2)
    `, [userId, schoolId]);
  }

  await client.query(`
    UPDATE usuarios
    SET escola_id = $1, atualizado_em = NOW()
    WHERE id = $2
  `, [schoolIds[0] || null, userId]);
}

async function findUserWithProfile(client, userId, { lock = false } = {}) {
  const { rows } = await client.query(`
    SELECT u.id, u.nome, t.nome AS perfil, t.nivel
    FROM usuarios u
    JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
    WHERE u.id = $1
    ${lock ? 'FOR UPDATE OF u' : ''}
  `, [userId]);

  if (!rows[0]) {
    throw httpError(404, 'Usuário não encontrado.');
  }

  return rows[0];
}

async function findProfileByTypeId(client, typeId) {
  const { rows } = await client.query(`
    SELECT id, nome, nivel, grupo, escopo_acesso, requer_escola, acesso_sistema
    FROM tipos_usuarios
    WHERE id = $1
  `, [typeId]);

  if (!rows[0]) {
    throw httpError(400, 'Perfil de usuário não encontrado.');
  }

  return rows[0];
}

async function listLinkedSchools(client, userId) {
  const { rows } = await client.query(`
    SELECT DISTINCT e.id, e.nome
    FROM escolas e
    JOIN usuario_escolas ue ON ue.escola_id = e.id
    WHERE ue.usuario_id = $1
    ORDER BY e.nome
  `, [userId]);

  return rows;
}

router.use(authenticate, loadAccessContext, allowMunicipalAdmin);

router.get('/', async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.nome,
        u.cpf,
        u.usuario,
        u.email,
        u.ativo,
        u.deve_alterar_senha,
        t.id AS "tipoUsuarioId",
        t.nome AS perfil,
        t.nivel,
        COALESCE((
          SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT('id', vinculadas.id, 'nome', vinculadas.nome)
            ORDER BY vinculadas.nome
          )
          FROM (
            SELECT DISTINCT e.id, e.nome
            FROM escolas e
            WHERE e.id = u.escola_id
              OR EXISTS (
                SELECT 1
                FROM usuario_escolas ue
                WHERE ue.usuario_id = u.id
                  AND ue.escola_id = e.id
              )
          ) vinculadas
        ), '[]'::JSONB) AS escolas
      FROM usuarios u
      JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      ORDER BY u.nome
    `);

    return response.json(rows);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const client = await pool.connect();

  try {
    const data = userSchema.parse(request.body);
    const profile = await findProfileByTypeId(client, data.tipoUsuarioId);
    if (!allowedEducationProfiles.has(profile.nome)) {
      throw httpError(400, 'Selecione um perfil válido de funcionário da educação.');
    }
    const requestedSchoolIds = data.escolaIds !== undefined
      ? data.escolaIds
      : data.escolaId
        ? [data.escolaId]
        : [];
    const schoolIds = uniqueSchoolIds(requestedSchoolIds);

    validateSchoolBindings(profile.nome, schoolIds, { required: profile.requer_escola });
    await assertSchoolsExist(client, schoolIds);

    const usuario = data.usuario || data.nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join('.');
    const senhaTemporaria = data.senhaTemporaria
      || `Siedu${Math.floor(100000 + Math.random() * 900000)}`;

    await client.query('BEGIN');

    const { rows } = await client.query(`
      INSERT INTO usuarios (
        nome, cpf, email, usuario, senha_hash, tipo_usuario_id,
        escola_id, deve_alterar_senha
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
      RETURNING id, nome, usuario, email, deve_alterar_senha
    `, [
      data.nome,
      data.cpf,
      data.email || null,
      usuario,
      await bcrypt.hash(senhaTemporaria, 12),
      data.tipoUsuarioId,
      schoolIds[0] || null,
    ]);

    await syncUserSchools(client, rows[0].id, schoolIds);
    await client.query('COMMIT');

    return response.status(201).json({
      user: {
        ...rows[0],
        perfil: profile.nome,
        escolas: await listLinkedSchools(client, rows[0].id),
      },
      senhaTemporaria,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.patch('/:id/schools', async (request, response, next) => {
  const client = await pool.connect();

  try {
    const data = schoolBindingsSchema.parse(request.body);
    const schoolIds = uniqueSchoolIds(data.escolaIds);

    await client.query('BEGIN');
    const user = await findUserWithProfile(client, request.params.id, {
      lock: true,
    });

    if (!allowedEducationProfiles.has(user.perfil)) {
      throw httpError(
        400,
        'A gestão de vínculos desta tela é permitida somente para os perfis de funcionários da educação.',
      );
    }

    validateSchoolBindings(user.perfil, schoolIds);
    await assertSchoolsExist(client, schoolIds);
    await syncUserSchools(client, user.id, schoolIds);
    await client.query('COMMIT');

    return response.json({
      id: user.id,
      nome: user.nome,
      perfil: user.perfil,
      escolas: await listLinkedSchools(client, user.id),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.patch('/:id', async (request, response, next) => {
  const client = await pool.connect();

  try {
    const schema = z.object({
      nome: z.string().trim().min(3).optional(),
      cpf: cpfSchema.optional(),
      email: emailSchema.optional(),
      ativo: z.boolean().optional(),
      escolaId: z.coerce.number().int().positive().nullable().optional(),
      tipoUsuarioId: z.coerce.number().int().positive().optional(),
    });
    const data = schema.parse(request.body);

    await client.query('BEGIN');
    const currentUser = await findUserWithProfile(client, request.params.id, {
      lock: true,
    });
    const nextProfile = data.tipoUsuarioId
      ? await findProfileByTypeId(client, data.tipoUsuarioId)
      : { nome: currentUser.perfil };

    if (data.tipoUsuarioId && !Object.hasOwn(data, 'escolaId')) {
      const currentSchools = await listLinkedSchools(client, currentUser.id);
      validateSchoolBindings(
        nextProfile.nome,
        currentSchools.map((school) => school.id),
      );
    }

    const { rows } = await client.query(`
      UPDATE usuarios
      SET
        nome = COALESCE($1, nome),
        cpf = COALESCE($2, cpf),
        email = COALESCE($3, email),
        ativo = COALESCE($4, ativo),
        tipo_usuario_id = COALESCE($5, tipo_usuario_id),
        atualizado_em = NOW()
      WHERE id = $6
      RETURNING id, nome, cpf, email, ativo
    `, [
      data.nome || null,
      data.cpf || null,
      data.email || null,
      data.ativo ?? null,
      data.tipoUsuarioId || null,
      request.params.id,
    ]);

    if (Object.hasOwn(data, 'escolaId')) {
      const schoolIds = data.escolaId ? [data.escolaId] : [];
      validateSchoolBindings(nextProfile.nome, schoolIds);
      await assertSchoolsExist(client, schoolIds);
      await syncUserSchools(client, currentUser.id, schoolIds);
    }

    await client.query('COMMIT');
    return response.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (request, response, next) => {
  try {
    if (Number(request.params.id) === request.user.sub) {
      return response.status(400).json({
        message: 'Você não pode excluir seu próprio usuário.',
      });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM usuarios WHERE id = $1',
      [request.params.id],
    );

    if (!rowCount) {
      return response.status(404).json({
        message: 'Usuário não encontrado.',
      });
    }

    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
