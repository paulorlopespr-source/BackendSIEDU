import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import { cpfSchema, emailSchema, strongPasswordSchema } from '../utils/validation.js';

const router = Router();
const optionalText = (max = 255) => z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(max).optional(),
);
const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  emailSchema.optional(),
);
const optionalDate = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.iso.date().optional(),
);
const optionalNumber = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.coerce.number().positive().max(80).optional(),
);

const userSchema = z.object({
  nome: z.string().trim().min(3).max(150),
  nomeSocial: optionalText(150),
  cpf: cpfSchema,
  dataNascimento: optionalDate,
  genero: optionalText(40),
  telefoneInstitucional: optionalText(30),
  email: optionalEmail,
  emailPessoal: optionalEmail,
  enderecoResidencial: optionalText(500),
  contatoEmergenciaNome: optionalText(150),
  contatoEmergenciaTelefone: optionalText(30),
  matriculaFuncional: optionalText(50),
  cargo: z.string().trim().min(2).max(120),
  funcaoExercida: z.string().trim().min(2).max(120),
  tipoVinculo: z.enum(['efetivo', 'contratado', 'comissionado', 'temporario', 'cedido', 'estagiario', 'terceirizado']),
  situacaoFuncional: z.enum(['ativo', 'afastado', 'licenca', 'cedido', 'desligado']),
  dataAdmissao: z.iso.date(),
  dataDesligamento: optionalDate,
  cargaHorariaSemanal: optionalNumber,
  turnosTrabalho: z.array(z.enum(['matutino', 'vespertino', 'noturno', 'integral'])).max(4).default([]),
  secretariaSetor: optionalText(150),
  disciplinas: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  turmasAtendidas: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  gestorImediato: optionalText(150),
  observacoesAdministrativas: optionalText(2000),
  tipoUsuarioId: z.coerce.number().int().positive(),
  escolaId: z.coerce.number().int().positive().nullable().optional(),
  escolaIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
  usuario: z.string().trim().min(3).max(80),
  situacaoAcesso: z.enum(['ativo', 'bloqueado', 'pendente', 'desligado']).default('pendente'),
  senhaTemporaria: strongPasswordSchema.optional(),
  fotoBase64: optionalText(3000000),
});

const schoolBindingsSchema = z.object({
  escolaIds: z.array(z.coerce.number().int().positive()).max(100),
});

const photoSchema = z.object({ fotoBase64: z.string().min(20).max(3000000) });
const allowedEducationProfiles = new Set([
  'Secretário Municipal de Educação', 'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal', 'Secretaria Administrativa da Educação', 'Técnico da Secretaria de Educação',
  'Diretor', 'Vice-Diretor', 'Coordenador Pedagógico', 'Secretário Escolar',
  'Auxiliar/Assistente Administrativo', 'Professor',
  'Auxiliar de Vida Escolar / Cuidador', 'Auxiliar de Serviços Gerais',
  'Motorista', 'Monitor de Transporte Escolar', 'Merendeira/Cozinheira',
  'Porteiro/Vigia', 'Psicólogo', 'Assistente Social', 'Nutricionista',
]);
const schoolRequiredProfiles = new Set([
  'Diretor', 'Vice-Diretor', 'Coordenador Pedagógico', 'Secretário Escolar',
  'Auxiliar/Assistente Administrativo', 'Professor',
  'Auxiliar de Vida Escolar / Cuidador', 'Auxiliar de Serviços Gerais',
  'Merendeira/Cozinheira', 'Porteiro/Vigia',
]);
const multiSchoolProfiles = new Set(['Coordenador Pedagógico']);
const teacherProfiles = new Set(['Professor']);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function allowUserAdministration(request, response, next) {
  const profiles = new Set(['Secretário Municipal de Educação', 'Super Administrador']);
  if (!profiles.has(request.access?.perfil)) {
    return response.status(403).json({ message: 'Este perfil pode consultar a rede, mas não pode criar, excluir ou alterar cadastros de usuários.' });
  }
  return next();
}

const administrativeProfiles = new Set([
  'Técnico da Secretaria de Educação',
  'Secretaria Administrativa da Educação',
]);

function allowPersonnelPortal(request, response, next) {
  if (request.access?.municipal || administrativeProfiles.has(request.access?.perfil)) return next();
  return response.status(403).json({ message: 'Acesso exclusivo da gestão de pessoas da Secretaria de Educação.' });
}

function allowPersonnelAdministration(request, response, next) {
  if (request.access?.municipal || administrativeProfiles.has(request.access?.perfil)) return next();
  return response.status(403).json({ message: 'Seu perfil pode consultar, mas não administrar cadastros funcionais.' });
}

function assertOperationalTarget(request, profile) {
  if (administrativeProfiles.has(request.access?.perfil) && Number(profile.nivel) <= 3) {
    throw httpError(403, 'A Secretaria Administrativa não pode criar ou alterar perfis estratégicos da gestão municipal.');
  }
}

function decodePhoto(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw httpError(400, 'A foto deve estar em JPG, PNG ou WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) {
    throw httpError(400, 'A foto deve ter no máximo 2 MB.');
  }
  return { bytes, mime: match[1], id: randomUUID() };
}

async function generateSecretariaRegistration(client) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = `SEdu${String(Math.floor(1000 + Math.random() * 9000))}`;
    const { rowCount } = await client.query('SELECT 1 FROM usuarios WHERE matricula_funcional = $1 LIMIT 1', [value]);
    if (!rowCount) return value;
  }
  throw httpError(503, 'Não foi possível gerar uma matrícula da Secretaria de Educação disponível.');
}

export function uniqueSchoolIds(ids) { return [...new Set(ids.map(Number))]; }

export function validateSchoolBindings(profile, ids, { required = false } = {}) {
  if (!multiSchoolProfiles.has(profile) && ids.length > 1) {
    throw httpError(400, `${profile} pode ser vinculado a somente uma unidade escolar.`);
  }
  if (required && schoolRequiredProfiles.has(profile) && ids.length === 0) {
    throw httpError(400, `Selecione ao menos uma unidade escolar para o perfil ${profile}.`);
  }
}

async function assertSchoolsExist(client, ids) {
  if (!ids.length) return;
  const { rows } = await client.query(
    'SELECT ARRAY_AGG(id ORDER BY id) AS ids FROM escolas WHERE id = ANY($1::INTEGER[])',
    [ids],
  );
  if ((rows[0].ids || []).length !== ids.length) {
    throw httpError(400, 'Uma ou mais unidades escolares não existem.');
  }
}

export async function syncUserSchools(client, userId, ids) {
  await client.query('DELETE FROM usuario_escolas WHERE usuario_id = $1', [userId]);
  for (const schoolId of ids) {
    await client.query(
      'INSERT INTO usuario_escolas (usuario_id, escola_id) VALUES ($1, $2)',
      [userId, schoolId],
    );
  }
  await client.query(
    'UPDATE usuarios SET escola_id = $1, atualizado_em = NOW() WHERE id = $2',
    [ids[0] || null, userId],
  );
}

async function findProfile(client, id) {
  const { rows } = await client.query(`
    SELECT id, nome, nivel, grupo, escopo_acesso, requer_escola, acesso_sistema
    FROM tipos_usuarios WHERE id = $1
  `, [id]);
  if (!rows[0]) throw httpError(400, 'Perfil de usuário não encontrado.');
  return rows[0];
}

async function findUser(client, id, lock = false) {
  const { rows } = await client.query(`
    SELECT u.id, u.nome, u.tipo_usuario_id, u.foto_id, t.nome AS perfil, t.nivel
    FROM usuarios u JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
    WHERE u.id = $1 ${lock ? 'FOR UPDATE OF u' : ''}
  `, [id]);
  if (!rows[0]) throw httpError(404, 'Usuário não encontrado.');
  return rows[0];
}

async function listSchools(client, userId) {
  const { rows } = await client.query(`
    SELECT DISTINCT e.id, e.nome FROM escolas e
    JOIN usuario_escolas ue ON ue.escola_id = e.id
    WHERE ue.usuario_id = $1 ORDER BY e.nome
  `, [userId]);
  return rows;
}

async function recordPermission(client, userId, typeId, ids, status, action, actorId) {
  await client.query(`
    INSERT INTO historico_permissoes
      (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [userId, typeId, ids, status, action, actorId]);
}

router.use(authenticate, loadAccessContext, allowPersonnelPortal);

router.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.busca || '').trim();
    const pagination = getPagination(request.query);

    const filters = `
      WHERE (
        $1 = ''
        OR u.nome ILIKE '%' || $1 || '%'
        OR COALESCE(u.nome_social, '') ILIKE '%' || $1 || '%'
        OR u.usuario ILIKE '%' || $1 || '%'
        OR COALESCE(u.email, '') ILIKE '%' || $1 || '%'
        OR COALESCE(u.matricula_funcional, '') ILIKE '%' || $1 || '%'
        OR COALESCE(u.cargo, '') ILIKE '%' || $1 || '%'
        OR COALESCE(u.funcao_exercida, '') ILIKE '%' || $1 || '%'
        OR t.nome ILIKE '%' || $1 || '%'
        OR (
          REGEXP_REPLACE($1, '\\D', '', 'g') <> ''
          AND COALESCE(u.cpf, '') LIKE '%' || REGEXP_REPLACE($1, '\\D', '', 'g') || '%'
        )
      )
    `;

    const selectQuery = `
      SELECT u.id, u.nome, u.nome_social AS "nomeSocial", u.cpf, u.usuario, u.email,
        u.matricula_funcional AS "matriculaFuncional", u.cargo,
        u.funcao_exercida AS "funcaoExercida", u.situacao_funcional AS "situacaoFuncional",
        u.situacao_acesso AS "situacaoAcesso", u.dois_fatores_obrigatorio AS "doisFatoresObrigatorio",
        u.dois_fatores_ativo AS "doisFatoresAtivo", u.ultimo_acesso_em AS "ultimoAcessoEm",
        u.ativo, u.deve_alterar_senha, (u.foto_id IS NOT NULL) AS "temFoto",
        t.id AS "tipoUsuarioId", t.nome AS perfil, t.nivel,
        COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', e.id, 'nome', e.nome) ORDER BY e.nome)
          FROM escolas e JOIN usuario_escolas ue ON ue.escola_id = e.id
          WHERE ue.usuario_id = u.id), '[]'::JSONB) AS escolas
      FROM usuarios u
      JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      ${filters}
    `;

    if (!pagination) {
      const { rows } = await pool.query(
        `${selectQuery} ORDER BY u.nome`,
        [search],
      );

      return response.json(rows.map((row) => ({
        ...row,
        fotoUrl: row.temFoto ? `/api/users/${row.id}/photo` : null,
      })));
    }

    const countResult = await pool.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM usuarios u
      JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      ${filters}
    `, [search]);

    const total = countResult.rows[0].total;

    const { rows } = await pool.query(
      `${selectQuery}
       ORDER BY u.nome
       LIMIT $2 OFFSET $3`,
      [search, pagination.limit, pagination.offset],
    );

    const data = rows.map((row) => ({
      ...row,
      fotoUrl: row.temFoto ? `/api/users/${row.id}/photo` : null,
    }));

    return response.json(paginatedResponse(data, total, pagination));
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/photo', async (request, response, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT foto_mime, foto_bytes, foto_id FROM usuarios WHERE id = $1',
      [request.params.id],
    );
    if (!rows[0]?.foto_bytes) throw httpError(404, 'Foto não encontrada.');
    response.set({
      'Content-Type': rows[0].foto_mime,
      'Cache-Control': 'private, max-age=300',
      ETag: `"${rows[0].foto_id}"`,
    });
    return response.send(rows[0].foto_bytes);
  } catch (error) { return next(error); }
});

router.post('/', allowPersonnelAdministration, async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = userSchema.parse(request.body);
    const profile = await findProfile(client, data.tipoUsuarioId);
    assertOperationalTarget(request, profile);
    if (!allowedEducationProfiles.has(profile.nome)) {
      throw httpError(400, 'Selecione um perfil válido de funcionário da educação.');
    }
    if (data.situacaoFuncional === 'desligado' && !data.dataDesligamento) {
      throw httpError(400, 'Informe a data de desligamento.');
    }
    if (data.dataDesligamento && data.dataDesligamento < data.dataAdmissao) {
      throw httpError(400, 'A data de desligamento não pode ser anterior à admissão.');
    }
    if (teacherProfiles.has(profile.nome) && !data.disciplinas.length) {
      throw httpError(400, 'Informe ao menos uma disciplina para o professor.');
    }
    const requestedIds = data.escolaIds ?? (data.escolaId ? [data.escolaId] : []);
    const schoolIds = uniqueSchoolIds(requestedIds);
    validateSchoolBindings(profile.nome, schoolIds, { required: profile.requer_escola });
    await assertSchoolsExist(client, schoolIds);
    const photo = decodePhoto(data.fotoBase64);
    const temporaryPassword = data.senhaTemporaria || `Siedu${Math.floor(100000 + Math.random() * 900000)}!`;
    const secretariaRegistration = data.matriculaFuncional || await generateSecretariaRegistration(client);
    const accessStatus = profile.acesso_sistema ? data.situacaoAcesso : 'bloqueado';

    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO usuarios (
        nome, nome_social, cpf, data_nascimento, genero, telefone_institucional,
        email, email_pessoal, endereco_residencial, contato_emergencia_nome,
        contato_emergencia_telefone, matricula_funcional, cargo, funcao_exercida,
        tipo_vinculo, situacao_funcional, data_admissao, data_desligamento,
        carga_horaria_semanal, turnos_trabalho, secretaria_setor, disciplinas,
        turmas_atendidas, gestor_imediato, observacoes_administrativas, usuario,
        senha_hash, tipo_usuario_id, escola_id, ativo, deve_alterar_senha,
        situacao_acesso, dois_fatores_obrigatorio, foto_id, foto_mime, foto_bytes,
        foto_atualizada_em
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
      ) RETURNING id, nome, usuario, email, deve_alterar_senha
    `, [
      data.nome, data.nomeSocial || null, data.cpf, data.dataNascimento || null,
      data.genero || null, data.telefoneInstitucional || null, data.email || null,
      data.emailPessoal || null, data.enderecoResidencial || null,
      data.contatoEmergenciaNome || null, data.contatoEmergenciaTelefone || null,
      secretariaRegistration, data.cargo, data.funcaoExercida, data.tipoVinculo,
      data.situacaoFuncional, data.dataAdmissao, data.dataDesligamento || null,
      data.cargaHorariaSemanal || null, data.turnosTrabalho, data.secretariaSetor || null,
      data.disciplinas, data.turmasAtendidas, data.gestorImediato || null,
      data.observacoesAdministrativas || null, data.usuario,
      await bcrypt.hash(temporaryPassword, 12), data.tipoUsuarioId, schoolIds[0] || null,
      accessStatus === 'ativo' || accessStatus === 'pendente', profile.acesso_sistema,
      accessStatus, profile.nivel <= 3, photo?.id || null, photo?.mime || null,
      photo?.bytes || null, photo ? new Date() : null,
    ]);
    await syncUserSchools(client, rows[0].id, schoolIds);
    await recordPermission(client, rows[0].id, data.tipoUsuarioId, schoolIds, accessStatus, 'cadastro', request.user.sub);
    if (photo) {
      await client.query(`
        INSERT INTO historico_fotos_perfil (usuario_id, foto_id, acao, realizado_por)
        VALUES ($1, $2, 'incluida', $3)
      `, [rows[0].id, photo.id, request.user.sub]);
    }
    await client.query('COMMIT');
    return response.status(201).json({
      user: { ...rows[0], perfil: profile.nome, matriculaSecretaria: secretariaRegistration, escolas: await listSchools(client, rows[0].id) },
      senhaTemporaria: profile.acesso_sistema ? temporaryPassword : null,
      primeiroAcesso: profile.acesso_sistema,
      doisFatoresObrigatorio: profile.nivel <= 3,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});

router.patch('/:id', allowPersonnelAdministration, async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = z.object({
      email: optionalEmail,
      telefoneInstitucional: optionalText(30),
      cargo: optionalText(120),
      funcaoExercida: optionalText(120),
      situacaoFuncional: z.enum(['ativo', 'afastado', 'licenca', 'cedido', 'desligado']).optional(),
      situacaoAcesso: z.enum(['ativo', 'bloqueado', 'pendente', 'desligado']).optional(),
      escolaIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
    }).refine((value) => Object.values(value).some((item) => item !== undefined), 'Informe ao menos uma alteração.').parse(request.body);
    await client.query('BEGIN');
    const user = await findUser(client, request.params.id, true);
    assertOperationalTarget(request, user);
    const ids = data.escolaIds ? uniqueSchoolIds(data.escolaIds) : null;
    if (ids) {
      validateSchoolBindings(user.perfil, ids);
      await assertSchoolsExist(client, ids);
      await syncUserSchools(client, user.id, ids);
    }
    await client.query(`
      UPDATE usuarios SET email=COALESCE($1,email),telefone_institucional=COALESCE($2,telefone_institucional),
        cargo=COALESCE($3,cargo),funcao_exercida=COALESCE($4,funcao_exercida),
        situacao_funcional=COALESCE($5,situacao_funcional),situacao_acesso=COALESCE($6,situacao_acesso),
        ativo=CASE WHEN $6 IN ('bloqueado','desligado') OR $5='desligado' THEN FALSE WHEN $6='ativo' THEN TRUE ELSE ativo END,
        atualizado_em=NOW() WHERE id=$7
    `,[data.email||null,data.telefoneInstitucional||null,data.cargo||null,data.funcaoExercida||null,data.situacaoFuncional||null,data.situacaoAcesso||null,user.id]);
    const currentSchools=ids||((await listSchools(client,user.id)).map((school)=>school.id));
    const currentStatus=data.situacaoAcesso||(await client.query('SELECT situacao_acesso FROM usuarios WHERE id=$1',[user.id])).rows[0].situacao_acesso;
    await recordPermission(client,user.id,user.tipo_usuario_id,currentSchools,currentStatus,'cadastro_atualizado',request.user.sub);
    await client.query('COMMIT');
    return response.json({id:user.id,message:'Cadastro funcional atualizado.',escolas:await listSchools(client,user.id)});
  } catch(error){await client.query('ROLLBACK');return next(error);} finally {client.release();}
});

router.patch('/:id/photo', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = photoSchema.parse(request.body);
    const photo = decodePhoto(data.fotoBase64);
    await client.query('BEGIN');
    const user = await findUser(client, request.params.id, true);
    await client.query(`
      UPDATE usuarios SET foto_id=$1, foto_mime=$2, foto_bytes=$3,
        foto_atualizada_em=NOW(), atualizado_em=NOW() WHERE id=$4
    `, [photo.id, photo.mime, photo.bytes, user.id]);
    await client.query(`
      INSERT INTO historico_fotos_perfil (usuario_id, foto_id, acao, realizado_por)
      VALUES ($1, $2, $3, $4)
    `, [user.id, photo.id, user.foto_id ? 'alterada' : 'incluida', request.user.sub]);
    await client.query('COMMIT');
    return response.json({ fotoUrl: `/api/users/${user.id}/photo` });
  } catch (error) { await client.query('ROLLBACK'); return next(error); }
  finally { client.release(); }
});

router.delete('/:id/photo', async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await findUser(client, request.params.id, true);
    await client.query(`
      UPDATE usuarios SET foto_id=NULL, foto_mime=NULL, foto_bytes=NULL,
        foto_atualizada_em=NOW(), atualizado_em=NOW() WHERE id=$1
    `, [user.id]);
    await client.query(`
      INSERT INTO historico_fotos_perfil (usuario_id, foto_id, acao, realizado_por)
      VALUES ($1, $2, 'removida', $3)
    `, [user.id, user.foto_id, request.user.sub]);
    await client.query('COMMIT');
    return response.status(204).send();
  } catch (error) { await client.query('ROLLBACK'); return next(error); }
  finally { client.release(); }
});

router.patch('/:id/schools', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const { escolaIds } = schoolBindingsSchema.parse(request.body);
    const ids = uniqueSchoolIds(escolaIds);
    await client.query('BEGIN');
    const user = await findUser(client, request.params.id, true);
    assertOperationalTarget(request, user);
    validateSchoolBindings(user.perfil, ids);
    await assertSchoolsExist(client, ids);
    await syncUserSchools(client, user.id, ids);
    const { rows } = await client.query('SELECT situacao_acesso FROM usuarios WHERE id=$1', [user.id]);
    await recordPermission(client, user.id, user.tipo_usuario_id, ids, rows[0].situacao_acesso, 'escolas_alteradas', request.user.sub);
    await client.query('COMMIT');
    return response.json({ id: user.id, nome: user.nome, perfil: user.perfil, escolas: await listSchools(client, user.id) });
  } catch (error) { await client.query('ROLLBACK'); return next(error); }
  finally { client.release(); }
});

router.delete('/:id', allowUserAdministration, async (request, response, next) => {
  try {
    if (Number(request.params.id) === request.user.sub) {
      return response.status(400).json({ message: 'Você não pode excluir seu próprio usuário.' });
    }
    const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [request.params.id]);
    if (!rowCount) return response.status(404).json({ message: 'Usuário não encontrado.' });
    return response.status(204).send();
  } catch (error) { return next(error); }
});

export default router;
