import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { allowMunicipalAdmin, loadAccessContext } from '../middlewares/access.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';

const router = Router();
router.use(authenticate, loadAccessContext);

const optionalText = z.string().trim().max(1000).nullable().optional();

function toNull(value) {
  return value?.trim() || null;
}

async function ensureUserProfile(client, userId, profileExpression) {
  if (!userId) return null;

  const { rows } = await client.query(`
    SELECT u.id, u.nome, tipo.nome AS perfil
    FROM usuarios u
    JOIN tipos_usuarios tipo ON tipo.id = u.tipo_usuario_id
    WHERE u.id = $1
      AND u.ativo = TRUE
      AND ${profileExpression}
    FOR UPDATE OF u
  `, [userId]);

  if (!rows[0]) {
    throw Object.assign(
      new Error('O usuário selecionado não possui o perfil permitido ou está inativo.'),
      { statusCode: 400 },
    );
  }

  return rows[0];
}

async function bindUserToSingleSchool(client, userId, schoolId) {
  await client.query('DELETE FROM usuario_escolas WHERE usuario_id = $1', [userId]);
  await client.query(`
    INSERT INTO usuario_escolas (usuario_id, escola_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `, [userId, schoolId]);
  await client.query(`
    UPDATE usuarios
    SET escola_id = $1, atualizado_em = NOW()
    WHERE id = $2
  `, [schoolId, userId]);
}

async function removeUserSchoolBinding(client, userId, schoolId) {
  if (!userId) return;

  await client.query(`
    DELETE FROM usuario_escolas
    WHERE usuario_id = $1 AND escola_id = $2
  `, [userId, schoolId]);
  await client.query(`
    UPDATE usuarios
    SET escola_id = NULL, atualizado_em = NOW()
    WHERE id = $1 AND escola_id = $2
  `, [userId, schoolId]);
}

router.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.busca || '').trim();
    const pagination = getPagination(request.query);

    const filters = `
      WHERE (
        $1 = ''
        OR e.codigo_rede ILIKE '%' || $1 || '%'
        OR e.nome ILIKE '%' || $1 || '%'
        OR COALESCE(e.categoria, '') ILIKE '%' || $1 || '%'
        OR COALESCE(e.localidade, '') ILIKE '%' || $1 || '%'
        OR COALESCE(u.nome, '') ILIKE '%' || $1 || '%'
      )
    `;

    const select = `
      SELECT
        e.id,
        e.codigo_rede,
        e.nome,
        e.categoria,
        e.localidade,
        e.inep,
        e.telefone,
        e.endereco,
        e.cep,
        e.foto_url AS "fotoUrl",
        e.ativo,
        e.secretaria_id,
        e.diretor_usuario_id,
        u.nome AS diretor
      FROM escolas e
      LEFT JOIN usuarios u ON u.id = e.diretor_usuario_id
      ${filters}
    `;

    if (!pagination) {
      const { rows } = await pool.query(
        `${select}
         ORDER BY e.codigo_rede NULLS LAST, e.nome`,
        [search],
      );

      response.json(rows);
      return;
    }

    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM escolas e
          LEFT JOIN usuarios u ON u.id = e.diretor_usuario_id
          ${filters}
        `,
        [search],
      ),
      pool.query(
        `${select}
         ORDER BY e.codigo_rede NULLS LAST, e.nome
         LIMIT $2 OFFSET $3`,
        [search, pagination.limit, pagination.offset],
      ),
    ]);

    response.json(
      paginatedResponse(
        dataResult.rows,
        countResult.rows[0].total,
        pagination,
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id/overview', allowMunicipalAdmin, async (request, response, next) => {
  try {
    const schoolId = z.coerce.number().int().positive().parse(request.params.id);

    const [
      schoolResult,
      directorResult,
      coordinatorResult,
      secretaryResult,
      summaryResult,
      classResult,
      professionalResult,
    ] = await Promise.all([
      pool.query(`
        SELECT
          e.id,
          e.codigo_rede AS "codigoRede",
          e.nome,
          e.categoria,
          e.localidade,
          e.inep,
          e.telefone,
          e.endereco,
          e.cep,
          e.foto_url AS "fotoUrl",
          e.diretor_usuario_id AS "diretorUsuarioId",
          e.diretor_nome AS "diretorNome",
          e.ativo
        FROM escolas e
        WHERE e.id = $1
      `, [schoolId]),
      pool.query(`
        SELECT
          u.id,
          u.nome,
          u.usuario,
          u.email,
          (u.id = e.diretor_usuario_id) AS principal
        FROM usuarios u
        JOIN tipos_usuarios tipo ON tipo.id = u.tipo_usuario_id
        JOIN escolas e ON e.id = $1
        WHERE u.ativo = TRUE
          AND LOWER(tipo.nome) = 'diretor'
          AND (
            u.id = e.diretor_usuario_id
            OR u.escola_id = e.id
            OR EXISTS (
              SELECT 1
              FROM usuario_escolas vinculo
              WHERE vinculo.usuario_id = u.id
                AND vinculo.escola_id = e.id
            )
          )
        ORDER BY principal DESC, u.nome
        LIMIT 1
      `, [schoolId]),
      pool.query(`
        SELECT DISTINCT
          u.id,
          u.nome,
          u.usuario,
          u.email
        FROM usuarios u
        JOIN tipos_usuarios tipo ON tipo.id = u.tipo_usuario_id
        WHERE u.ativo = TRUE
          AND LOWER(tipo.nome) LIKE '%coordenador%'
          AND (
            u.escola_id = $1
            OR EXISTS (
              SELECT 1
              FROM usuario_escolas vinculo
              WHERE vinculo.usuario_id = u.id
                AND vinculo.escola_id = $1
            )
          )
        ORDER BY u.nome
      `, [schoolId]),
      pool.query(`
        SELECT DISTINCT
          u.id,
          u.nome,
          u.usuario,
          u.email
        FROM usuarios u
        JOIN tipos_usuarios tipo ON tipo.id = u.tipo_usuario_id
        WHERE u.ativo = TRUE
          AND LOWER(tipo.nome) LIKE '%secret%escolar%'
          AND (
            u.escola_id = $1
            OR EXISTS (
              SELECT 1
              FROM usuario_escolas vinculo
              WHERE vinculo.usuario_id = u.id
                AND vinculo.escola_id = $1
            )
          )
        ORDER BY u.nome
      `, [schoolId]),
      pool.query(`
        SELECT
          (
            SELECT COUNT(*)::INTEGER
            FROM turmas
            WHERE escola_id = $1 AND status = 'Ativa'
          ) AS turmas,
          (
            SELECT COUNT(DISTINCT NULLIF(BTRIM(sala), ''))::INTEGER
            FROM turmas
            WHERE escola_id = $1 AND status = 'Ativa'
          ) AS salas,
          (
            SELECT COUNT(DISTINCT aluno_id)::INTEGER
            FROM matriculas
            WHERE escola_id = $1 AND status = 'Ativa'
          ) AS alunos,
          (
            SELECT (
              (SELECT COUNT(DISTINCT professor_id)::INTEGER
               FROM professor_escolas
               WHERE escola_id = $1 AND ativo = TRUE)
              +
              (SELECT COUNT(*)::INTEGER
               FROM funcionarios_educacao
               WHERE escola_id = $1
                 AND ativo = TRUE
                 AND LOWER(cargo) LIKE '%professor%')
            )::INTEGER
          ) AS professores,
          (
            SELECT COUNT(*)::INTEGER
            FROM funcionarios_educacao
            WHERE escola_id = $1 AND ativo = TRUE
          ) AS profissionais
      `, [schoolId]),
      pool.query(`
        SELECT
          turma.id,
          turma.nome,
          turma.ano_letivo AS "anoLetivo",
          turma.etapa_ensino AS "etapaEnsino",
          turma.serie_ano AS "serieAno",
          turma.turno,
          turma.sala,
          turma.capacidade,
          turma.status,
          turma.alunos_matriculados AS "alunosMatriculados",
          turma.vagas_disponiveis AS "vagasDisponiveis",
          coordenador.nome AS coordenador
        FROM vw_turmas_resumo turma
        LEFT JOIN usuarios coordenador
          ON coordenador.id = turma.coordenador_usuario_id
        WHERE turma.escola_id = $1
        ORDER BY turma.ano_letivo DESC, turma.nome
      `, [schoolId]),
      pool.query(`
        SELECT
          id,
          nome_completo AS nome,
          cargo,
          tipo_vinculo AS "tipoVinculo",
          carga_horaria AS "cargaHoraria",
          setor,
          formacao,
          telefone,
          observacoes
        FROM funcionarios_educacao
        WHERE escola_id = $1 AND ativo = TRUE
        ORDER BY cargo, nome_completo
      `, [schoolId]),
    ]);

    if (!schoolResult.rows[0]) {
      return response.status(404).json({ message: 'Escola não encontrada.' });
    }

    return response.json({
      escola: schoolResult.rows[0],
      diretor: directorResult.rows[0] || null,
      coordenadores: coordinatorResult.rows,
      secretarios: secretaryResult.rows,
      resumo: summaryResult.rows[0],
      turmas: classResult.rows,
      alunos: [],
      profissionais: professionalResult.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/students', allowMunicipalAdmin, async (request, response, next) => {
  try {
    const schoolId = z.coerce.number().int().positive().parse(request.params.id);
    const pagination = getPagination(request.query, { defaultLimit: 25, maxLimit: 100 }) || { page: 1, limit: 25, offset: 0 };
    const busca = typeof request.query.busca === 'string' ? request.query.busca.trim() : '';
    const searchPattern = `%${busca}%`;
    const filters = [schoolId, searchPattern];
    const searchClause = `
      AND ($2 = '%%' OR aluno.nome_completo ILIKE $2
        OR matricula.numero ILIKE $2
        OR turma.nome ILIKE $2
        OR COALESCE(responsavel.nome_completo, '') ILIKE $2)
    `;
    const [dataResult, countResult] = await Promise.all([
      pool.query(`
        SELECT DISTINCT ON (aluno.id)
          aluno.id,
          aluno.nome_completo AS nome,
          aluno.data_nascimento AS "dataNascimento",
          aluno.cpf,
          matricula.numero AS matricula,
          matricula.status,
          matricula.ano_letivo AS "anoLetivo",
          turma.id AS "turmaId",
          turma.nome AS turma,
          responsavel.nome_completo AS responsavel,
          responsavel.telefone_principal AS "contatoResponsavel"
        FROM matriculas matricula
        JOIN alunos aluno ON aluno.id = matricula.aluno_id
        JOIN turmas turma ON turma.id = matricula.turma_id
        LEFT JOIN aluno_responsaveis aluno_responsavel
          ON aluno_responsavel.aluno_id = aluno.id
          AND aluno_responsavel.contato_principal = TRUE
        LEFT JOIN responsaveis responsavel
          ON responsavel.id = aluno_responsavel.responsavel_id
        WHERE matricula.escola_id = $1
          AND matricula.status IN ('Ativa', 'Pendente')
          ${searchClause}
        ORDER BY aluno.id, matricula.ano_letivo DESC, matricula.criado_em DESC
        LIMIT $3 OFFSET $4
      `, [...filters, pagination.limit, pagination.offset]),
      pool.query(`
        SELECT COUNT(DISTINCT aluno.id)::INTEGER AS total
        FROM matriculas matricula
        JOIN alunos aluno ON aluno.id = matricula.aluno_id
        JOIN turmas turma ON turma.id = matricula.turma_id
        LEFT JOIN aluno_responsaveis aluno_responsavel
          ON aluno_responsavel.aluno_id = aluno.id
          AND aluno_responsavel.contato_principal = TRUE
        LEFT JOIN responsaveis responsavel
          ON responsavel.id = aluno_responsavel.responsavel_id
        WHERE matricula.escola_id = $1
          AND matricula.status IN ('Ativa', 'Pendente')
          ${searchClause}
      `, filters),
    ]);

    return response.json(paginatedResponse(
      dataResult.rows,
      countResult.rows[0].total,
      pagination,
    ));
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', allowMunicipalAdmin, async (request, response, next) => {
  const client = await pool.connect();

  try {
    const schoolId = z.coerce.number().int().positive().parse(request.params.id);
    const data = z.object({
      nome: z.string().trim().min(3).max(150),
      codigoRede: z.string().trim().max(10).nullable().optional(),
      categoria: z.string().trim().max(80).nullable().optional(),
      localidade: z.string().trim().max(120).nullable().optional(),
      inep: z.string().trim().max(20).nullable().optional(),
      telefone: z.string().trim().max(30).nullable().optional(),
      endereco: optionalText,
      cep: z.string().trim().max(9).nullable().optional(),
      fotoUrl: z.string().trim().max(2_800_000).nullable().optional(),
      diretorUsuarioId: z.coerce.number().int().positive().nullable().optional(),
      secretarioUsuarioId: z.coerce.number().int().positive().nullable().optional(),
    }).parse(request.body);

    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT id, diretor_usuario_id AS "diretorUsuarioId"
      FROM escolas
      WHERE id = $1
      FOR UPDATE
    `, [schoolId]);
    const currentSchool = currentResult.rows[0];

    if (!currentSchool) {
      throw Object.assign(new Error('Escola não encontrada.'), { statusCode: 404 });
    }

    const directorId = data.diretorUsuarioId || null;
    const secretaryId = data.secretarioUsuarioId || null;

    await ensureUserProfile(client, directorId, "LOWER(tipo.nome) = 'diretor'");
    await ensureUserProfile(client, secretaryId, "LOWER(tipo.nome) LIKE '%secret%escolar%'");

    const { rows } = await client.query(`
      UPDATE escolas
      SET
        nome = $1,
        codigo_rede = $2,
        categoria = $3,
        localidade = $4,
        inep = $5,
        telefone = $6,
        endereco = $7,
        cep = $8,
        foto_url = $9,
        diretor_usuario_id = $10
      WHERE id = $11
      RETURNING
        id,
        nome,
        codigo_rede AS "codigoRede",
        categoria,
        localidade,
        inep,
        telefone,
        endereco,
        cep,
        foto_url AS "fotoUrl",
        diretor_usuario_id AS "diretorUsuarioId"
    `, [
      data.nome,
      toNull(data.codigoRede),
      toNull(data.categoria),
      toNull(data.localidade),
      toNull(data.inep),
      toNull(data.telefone),
      toNull(data.endereco),
      toNull(data.cep),
      toNull(data.fotoUrl),
      directorId,
      schoolId,
    ]);

    if (currentSchool.diretorUsuarioId && currentSchool.diretorUsuarioId !== directorId) {
      await removeUserSchoolBinding(client, currentSchool.diretorUsuarioId, schoolId);
    }

    if (directorId) {
      await bindUserToSingleSchool(client, directorId, schoolId);
    }

    const currentSecretariesResult = await client.query(`
      SELECT u.id
      FROM usuarios u
      JOIN tipos_usuarios tipo ON tipo.id = u.tipo_usuario_id
      WHERE LOWER(tipo.nome) LIKE '%secret%escolar%'
        AND (
          u.escola_id = $1
          OR EXISTS (
            SELECT 1
            FROM usuario_escolas vinculo
            WHERE vinculo.usuario_id = u.id
              AND vinculo.escola_id = $1
          )
        )
    `, [schoolId]);

    for (const secretary of currentSecretariesResult.rows) {
      if (secretary.id !== secretaryId) {
        await removeUserSchoolBinding(client, secretary.id, schoolId);
      }
    }

    if (secretaryId) {
      await bindUserToSingleSchool(client, secretaryId, schoolId);
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

router.post('/', allowMunicipalAdmin, async (request, response, next) => {
  try {
    const data = z.object({
      nome: z.string().min(3),
      codigoRede: z.string().max(10).optional(),
      categoria: z.string().max(80).optional(),
      localidade: z.string().max(120).optional(),
      inep: z.string().optional(),
      telefone: z.string().optional(),
      endereco: z.string().optional(),
      diretorUsuarioId: z.coerce.number().int().positive().nullable().optional(),
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO escolas (
        nome,
        codigo_rede,
        categoria,
        localidade,
        inep,
        telefone,
        endereco,
        secretaria_id,
        diretor_usuario_id,
        ativo
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        (SELECT id FROM secretarias ORDER BY id LIMIT 1),
        $8,
        TRUE
      )
      RETURNING *
    `, [
      data.nome.trim(),
      data.codigoRede?.trim() || null,
      data.categoria?.trim() || null,
      data.localidade?.trim() || null,
      data.inep || null,
      data.telefone || null,
      data.endereco || null,
      data.diretorUsuarioId || null,
    ]);
    response.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;

