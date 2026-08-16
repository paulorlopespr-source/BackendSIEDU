import { Router } from 'express';
import { pool } from '../database.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { authenticate } from '../middlewares/auth.js';
import {
  allowAcademicManagement,
  canAccessSchool,
  loadAccessContext,
} from '../middlewares/access.js';
import {
  classSchema,
  classTeacherSchema,
  employeeSchema,
  enrollmentSchema,
  positiveIdSchema,
  studentEnrollmentSchema,
  teacherSchema,
} from '../utils/academicValidation.js';

const router = Router();

router.use(authenticate, loadAccessContext, allowAcademicManagement);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function schoolScope(request, requestedSchoolId) {
  if (requestedSchoolId) {
    const schoolId = positiveIdSchema.parse(requestedSchoolId);
    if (!canAccessSchool(request, schoolId)) {
      throw httpError(403, 'Você não possui acesso a esta unidade escolar.');
    }
    return { schoolId, schoolIds: null };
  }

  if (request.access.municipal) {
    return { schoolId: null, schoolIds: null };
  }

  return { schoolId: null, schoolIds: request.access.escolas };
}

function assertSchoolAccess(request, schoolId) {
  if (!canAccessSchool(request, schoolId)) {
    throw httpError(403, 'Você não possui acesso a esta unidade escolar.');
  }
}

router.get('/context', async (request, response, next) => {
  try {
    const [schoolsResult, coordinatorsResult] = await Promise.all([
      pool.query(`
        SELECT DISTINCT e.id, e.nome, e.inep
        FROM escolas e
        LEFT JOIN usuario_escolas ue
          ON ue.escola_id = e.id AND ue.usuario_id = $1
        LEFT JOIN usuarios u ON u.id = $1
        WHERE $2::BOOLEAN = TRUE
          OR ue.usuario_id IS NOT NULL
          OR u.escola_id = e.id
        ORDER BY e.nome
      `, [request.access.userId, request.access.municipal]),
      pool.query(`
        SELECT DISTINCT
          u.id,
          u.nome,
          COALESCE(ue.escola_id, u.escola_id) AS "escolaId"
        FROM usuarios u
        JOIN tipos_usuarios tipo ON tipo.id = u.tipo_usuario_id
        LEFT JOIN usuario_escolas ue ON ue.usuario_id = u.id
        WHERE u.ativo = TRUE
          AND tipo.nome = 'Coordenador'
          AND (
            $1::BOOLEAN = TRUE
            OR COALESCE(ue.escola_id, u.escola_id) = ANY($2::INTEGER[])
          )
        ORDER BY u.nome
      `, [
        request.access.municipal,
        request.access.escolas,
      ]),
    ]);

    return response.json({
      escolas: schoolsResult.rows,
      coordenadores: coordinatorsResult.rows,
      perfil: request.access.perfil,
      acessoMunicipal: request.access.municipal,
    });
  } catch (error) {
    return next(error);
  }
});

async function assertSchoolExists(client, schoolId) {
  const result = await client.query(
    'SELECT id FROM escolas WHERE id = $1',
    [schoolId],
  );
  if (!result.rows[0]) {
    throw httpError(404, 'Unidade escolar não encontrada.');
  }
}

async function lockClassForEnrollment(client, schoolId, classId, schoolYear) {
  const classResult = await client.query(`
    SELECT id, escola_id, ano_letivo, capacidade, status
    FROM turmas
    WHERE id = $1
    FOR UPDATE
  `, [classId]);
  const schoolClass = classResult.rows[0];

  if (!schoolClass) throw httpError(404, 'Turma não encontrada.');
  if (schoolClass.escola_id !== schoolId) {
    throw httpError(400, 'A turma não pertence à escola informada.');
  }
  if (schoolClass.ano_letivo !== schoolYear) {
    throw httpError(400, 'O ano letivo da turma é diferente do informado.');
  }
  if (schoolClass.status !== 'Ativa') {
    throw httpError(409, 'Somente turmas ativas podem receber matrículas.');
  }

  const occupancyResult = await client.query(`
    SELECT COUNT(*)::INTEGER AS total
    FROM matriculas
    WHERE turma_id = $1 AND status = 'Ativa'
  `, [classId]);

  if (occupancyResult.rows[0].total >= schoolClass.capacidade) {
    throw httpError(409, 'A turma selecionada não possui vagas disponíveis.');
  }
}

router.get('/summary', async (request, response, next) => {
  try {
    const scope = schoolScope(request, request.query.escolaId);
    const params = [scope.schoolId, scope.schoolIds];
    const schoolFilter = `
      ($1::INTEGER IS NOT NULL AND escola_id = $1)
      OR (
        $1::INTEGER IS NULL
        AND ($2::INTEGER[] IS NULL OR escola_id = ANY($2::INTEGER[]))
      )
    `;

    const [classes, enrollments, teachers, employees] = await Promise.all([
      pool.query(`SELECT COUNT(*)::INTEGER AS total FROM turmas WHERE (${schoolFilter}) AND status = 'Ativa'`, params),
      pool.query(`SELECT COUNT(*)::INTEGER AS total FROM matriculas WHERE (${schoolFilter}) AND status = 'Ativa'`, params),
      pool.query(`SELECT COUNT(DISTINCT professor_id)::INTEGER AS total FROM professor_escolas WHERE (${schoolFilter}) AND ativo = TRUE`, params),
      pool.query(`SELECT COUNT(*)::INTEGER AS total FROM funcionarios_educacao WHERE (${schoolFilter}) AND ativo = TRUE`, params),
    ]);

    return response.json({
      alunosMatriculados: enrollments.rows[0].total,
      funcionariosAtivos: employees.rows[0].total,
      professoresAtivos: teachers.rows[0].total,
      turmasAtivas: classes.rows[0].total,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/classes', async (request, response, next) => {
  try {
    const scope = schoolScope(request, request.query.escolaId);
    const search = String(request.query.busca || '').trim();
    const schoolYear = request.query.anoLetivo
      ? Number(request.query.anoLetivo)
      : null;
    const pagination = getPagination(request.query);

    const baseParams = [
      scope.schoolId,
      scope.schoolIds,
      schoolYear,
      search,
    ];

    let total = null;

    if (pagination) {
      const countResult = await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM vw_turmas_resumo v
        JOIN escolas e ON e.id = v.escola_id
        LEFT JOIN usuarios coordenador ON coordenador.id = v.coordenador_usuario_id
        WHERE (
          ($1::INTEGER IS NOT NULL AND v.escola_id = $1)
          OR (
            $1::INTEGER IS NULL
            AND ($2::INTEGER[] IS NULL OR v.escola_id = ANY($2::INTEGER[]))
          )
        )
          AND ($3::INTEGER IS NULL OR v.ano_letivo = $3)
          AND (
            $4 = ''
            OR v.nome ILIKE '%' || $4 || '%'
            OR v.serie_ano ILIKE '%' || $4 || '%'
            OR v.turno ILIKE '%' || $4 || '%'
            OR e.nome ILIKE '%' || $4 || '%'
            OR COALESCE(coordenador.nome, '') ILIKE '%' || $4 || '%'
          )
      `, baseParams);

      total = countResult.rows[0].total;
    }

    const paginationClause = pagination
      ? 'LIMIT $5 OFFSET $6'
      : '';

    const queryParams = pagination
      ? [...baseParams, pagination.limit, pagination.offset]
      : baseParams;

    const { rows } = await pool.query(`
      SELECT
        v.id,
        v.escola_id AS "escolaId",
        e.nome AS escola,
        v.ano_letivo AS "anoLetivo",
        v.nome,
        v.etapa_ensino AS "etapaEnsino",
        v.serie_ano AS "serieAno",
        v.turno,
        v.capacidade,
        v.sala,
        v.status,
        v.alunos_matriculados AS "alunosMatriculados",
        v.vagas_disponiveis AS "vagasDisponiveis",
        coordenador.nome AS coordenador,
        COALESCE(
          JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', p.id,
              'nome', p.nome_completo,
              'componenteCurricular', tp.componente_curricular,
              'titular', tp.titular
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::JSONB
        ) AS professores
      FROM vw_turmas_resumo v
      JOIN escolas e ON e.id = v.escola_id
      LEFT JOIN usuarios coordenador ON coordenador.id = v.coordenador_usuario_id
      LEFT JOIN turma_professores tp ON tp.turma_id = v.id
      LEFT JOIN professores p ON p.id = tp.professor_id AND p.ativo = TRUE
      WHERE (
        ($1::INTEGER IS NOT NULL AND v.escola_id = $1)
        OR (
          $1::INTEGER IS NULL
          AND ($2::INTEGER[] IS NULL OR v.escola_id = ANY($2::INTEGER[]))
        )
      )
        AND ($3::INTEGER IS NULL OR v.ano_letivo = $3)
        AND (
          $4 = ''
          OR v.nome ILIKE '%' || $4 || '%'
          OR v.serie_ano ILIKE '%' || $4 || '%'
          OR v.turno ILIKE '%' || $4 || '%'
          OR e.nome ILIKE '%' || $4 || '%'
          OR COALESCE(coordenador.nome, '') ILIKE '%' || $4 || '%'
        )
      GROUP BY
        v.id, v.escola_id, e.nome, v.ano_letivo, v.nome,
        v.etapa_ensino, v.serie_ano, v.turno, v.capacidade,
        v.sala, v.status, v.alunos_matriculados,
        v.vagas_disponiveis, coordenador.nome
      ORDER BY v.ano_letivo DESC, e.nome, v.nome
      ${paginationClause}
    `, queryParams);

    if (!pagination) {
      return response.json(rows);
    }

    return response.json(paginatedResponse(rows, total, pagination));
  } catch (error) {
    return next(error);
  }
});

router.get('/classes/:id', async (request, response, next) => {
  try {
    const classId = positiveIdSchema.parse(request.params.id);
    const classResult = await pool.query(`
      SELECT
        v.id,
        v.escola_id AS "escolaId",
        e.nome AS escola,
        v.ano_letivo AS "anoLetivo",
        v.nome,
        v.etapa_ensino AS "etapaEnsino",
        v.serie_ano AS "serieAno",
        v.turno,
        v.capacidade,
        v.sala,
        v.status,
        v.alunos_matriculados AS "alunosMatriculados",
        v.vagas_disponiveis AS "vagasDisponiveis",
        coordenador.nome AS coordenador
      FROM vw_turmas_resumo v
      JOIN escolas e ON e.id = v.escola_id
      LEFT JOIN usuarios coordenador ON coordenador.id = v.coordenador_usuario_id
      WHERE v.id = $1
    `, [classId]);
    const schoolClass = classResult.rows[0];
    if (!schoolClass) throw httpError(404, 'Turma não encontrada.');
    assertSchoolAccess(request, schoolClass.escolaId);

    const [students, teachers] = await Promise.all([
      pool.query(`
        SELECT
          a.id,
          a.nome_completo AS nome,
          a.data_nascimento AS "dataNascimento",
          m.id AS "matriculaId",
          m.numero AS matricula,
          m.status,
          responsavel.nome_completo AS responsavel,
          responsavel.telefone_principal AS "contatoResponsavel"
        FROM matriculas m
        JOIN alunos a ON a.id = m.aluno_id
        LEFT JOIN aluno_responsaveis ar
          ON ar.aluno_id = a.id AND ar.contato_principal = TRUE
        LEFT JOIN responsaveis responsavel ON responsavel.id = ar.responsavel_id
        WHERE m.turma_id = $1 AND m.status IN ('Pendente', 'Ativa')
        ORDER BY a.nome_completo
      `, [classId]),
      pool.query(`
        SELECT
          p.id,
          p.nome_completo AS nome,
          tp.componente_curricular AS "componenteCurricular",
          tp.carga_horaria_semanal AS "cargaHorariaSemanal",
          tp.titular
        FROM turma_professores tp
        JOIN professores p ON p.id = tp.professor_id
        WHERE tp.turma_id = $1 AND p.ativo = TRUE
        ORDER BY tp.componente_curricular, p.nome_completo
      `, [classId]),
    ]);

    return response.json({
      ...schoolClass,
      alunos: students.rows,
      professores: teachers.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/classes', async (request, response, next) => {
  try {
    const data = classSchema.parse(request.body);
    assertSchoolAccess(request, data.escolaId);
    await assertSchoolExists(pool, data.escolaId);

    if (data.coordenadorUsuarioId) {
      const coordinatorResult = await pool.query(`
        SELECT u.id
        FROM usuarios u
        LEFT JOIN usuario_escolas ue ON ue.usuario_id = u.id
        WHERE u.id = $1
          AND u.ativo = TRUE
          AND (u.escola_id = $2 OR ue.escola_id = $2)
        LIMIT 1
      `, [data.coordenadorUsuarioId, data.escolaId]);
      if (!coordinatorResult.rows[0]) {
        throw httpError(400, 'O coordenador informado não está vinculado à escola.');
      }
    }

    const { rows } = await pool.query(`
      INSERT INTO turmas (
        escola_id, ano_letivo, nome, etapa_ensino, serie_ano,
        turno, capacidade, sala, coordenador_usuario_id, status,
        observacoes, criado_por, atualizado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
      RETURNING
        id, escola_id AS "escolaId", ano_letivo AS "anoLetivo",
        nome, etapa_ensino AS "etapaEnsino", serie_ano AS "serieAno",
        turno, capacidade, sala, status
    `, [
      data.escolaId,
      data.anoLetivo,
      data.nome,
      data.etapaEnsino,
      data.serieAno,
      data.turno,
      data.capacidade,
      data.sala || null,
      data.coordenadorUsuarioId || null,
      data.status,
      data.observacoes || null,
      request.access.userId,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/classes/:id/teachers', async (request, response, next) => {
  try {
    const classId = positiveIdSchema.parse(request.params.id);
    const data = classTeacherSchema.parse(request.body);
    const classResult = await pool.query(
      'SELECT escola_id FROM turmas WHERE id = $1',
      [classId],
    );
    const schoolClass = classResult.rows[0];
    if (!schoolClass) throw httpError(404, 'Turma não encontrada.');
    assertSchoolAccess(request, schoolClass.escola_id);

    const teacherResult = await pool.query(`
      SELECT professor_id
      FROM professor_escolas
      WHERE professor_id = $1 AND escola_id = $2 AND ativo = TRUE
    `, [data.professorId, schoolClass.escola_id]);
    if (!teacherResult.rows[0]) {
      throw httpError(400, 'O professor não está vinculado à escola da turma.');
    }

    const { rows } = await pool.query(`
      INSERT INTO turma_professores (
        turma_id, professor_id, componente_curricular,
        carga_horaria_semanal, titular
      ) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (turma_id, professor_id, componente_curricular)
      DO UPDATE SET
        carga_horaria_semanal = EXCLUDED.carga_horaria_semanal,
        titular = EXCLUDED.titular
      RETURNING *
    `, [
      classId,
      data.professorId,
      data.componenteCurricular,
      data.cargaHorariaSemanal || null,
      data.titular,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.get('/students', async (request, response, next) => {
  try {
    const scope = schoolScope(request, request.query.escolaId);
    const search = String(request.query.busca || '').trim();
    const pagination = getPagination(request.query);

    const baseParams = [scope.schoolId, scope.schoolIds, search];

    const filters = `
      WHERE (
        ($1::INTEGER IS NOT NULL AND m.escola_id = $1)
        OR (
          $1::INTEGER IS NULL
          AND ($2::INTEGER[] IS NULL OR m.escola_id = ANY($2::INTEGER[]))
        )
      )
        AND (
          $3 = ''
          OR a.nome_completo ILIKE '%' || $3 || '%'
          OR COALESCE(a.nome_social, '') ILIKE '%' || $3 || '%'
          OR m.numero ILIKE '%' || $3 || '%'
          OR (
            REGEXP_REPLACE($3, '\\D', '', 'g') <> ''
            AND COALESCE(a.cpf, '') LIKE '%' || REGEXP_REPLACE($3, '\\D', '', 'g') || '%'
          )
        )
    `;

    if (!pagination) {
      const { rows } = await pool.query(`
        SELECT DISTINCT ON (a.id)
          a.id,
          a.nome_completo AS nome,
          a.nome_social AS "nomeSocial",
          a.data_nascimento AS "dataNascimento",
          a.cpf,
          a.ativo,
          m.numero AS matricula,
          m.status AS "statusMatricula",
          m.ano_letivo AS "anoLetivo",
          m.escola_id AS "escolaId",
          e.nome AS escola,
          m.turma_id AS "turmaId",
          t.nome AS turma,
          r.nome_completo AS responsavel,
          r.telefone_principal AS "contatoResponsavel"
        FROM alunos a
        JOIN matriculas m ON m.aluno_id = a.id
        JOIN escolas e ON e.id = m.escola_id
        JOIN turmas t ON t.id = m.turma_id
        LEFT JOIN aluno_responsaveis ar
          ON ar.aluno_id = a.id AND ar.contato_principal = TRUE
        LEFT JOIN responsaveis r ON r.id = ar.responsavel_id
        ${filters}
        ORDER BY a.id, m.ano_letivo DESC, m.criado_em DESC
      `, baseParams);

      return response.json(rows);
    }

    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT a.id)::INTEGER AS total
      FROM alunos a
      JOIN matriculas m ON m.aluno_id = a.id
      JOIN escolas e ON e.id = m.escola_id
      JOIN turmas t ON t.id = m.turma_id
      ${filters}
    `, baseParams);

    const total = countResult.rows[0].total;

    const { rows } = await pool.query(`
      WITH latest_students AS (
        SELECT DISTINCT ON (a.id)
          a.id,
          a.nome_completo AS nome,
          a.nome_social AS "nomeSocial",
          a.data_nascimento AS "dataNascimento",
          a.cpf,
          a.ativo,
          m.numero AS matricula,
          m.status AS "statusMatricula",
          m.ano_letivo AS "anoLetivo",
          m.escola_id AS "escolaId",
          e.nome AS escola,
          m.turma_id AS "turmaId",
          t.nome AS turma,
          r.nome_completo AS responsavel,
          r.telefone_principal AS "contatoResponsavel"
        FROM alunos a
        JOIN matriculas m ON m.aluno_id = a.id
        JOIN escolas e ON e.id = m.escola_id
        JOIN turmas t ON t.id = m.turma_id
        LEFT JOIN aluno_responsaveis ar
          ON ar.aluno_id = a.id AND ar.contato_principal = TRUE
        LEFT JOIN responsaveis r ON r.id = ar.responsavel_id
        ${filters}
        ORDER BY a.id, m.ano_letivo DESC, m.criado_em DESC
      )
      SELECT *
      FROM latest_students
      ORDER BY nome
      LIMIT $4 OFFSET $5
    `, [...baseParams, pagination.limit, pagination.offset]);

    return response.json(paginatedResponse(rows, total, pagination));
  } catch (error) {
    return next(error);
  }
});

router.get('/students/:id', async (request, response, next) => {
  try {
    const studentId = positiveIdSchema.parse(request.params.id);
    const studentResult = await pool.query(`
      SELECT
        a.id,
        a.nome_completo AS nome,
        a.nome_social AS "nomeSocial",
        a.data_nascimento AS "dataNascimento",
        a.cpf,
        a.rg,
        a.certidao_nascimento AS "certidaoNascimento",
        a.genero,
        a.nacionalidade,
        a.naturalidade,
        a.necessidade_educacional_especial AS "necessidadeEducacionalEspecial",
        a.descricao_necessidade AS "descricaoNecessidade",
        a.telefone,
        a.email,
        a.ativo,
        JSONB_BUILD_OBJECT(
          'cep', a.cep,
          'logradouro', a.logradouro,
          'numero', a.numero_endereco,
          'complemento', a.complemento,
          'bairro', a.bairro,
          'cidade', a.cidade,
          'uf', a.uf
        ) AS endereco,
        COALESCE(
          JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', r.id,
              'nome', r.nome_completo,
              'parentesco', ar.parentesco,
              'responsavelLegal', ar.responsavel_legal,
              'contatoPrincipal', ar.contato_principal,
              'telefonePrincipal', r.telefone_principal,
              'telefoneAlternativo', r.telefone_alternativo,
              'email', r.email
            )
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'::JSONB
        ) AS responsaveis
      FROM alunos a
      LEFT JOIN aluno_responsaveis ar ON ar.aluno_id = a.id
      LEFT JOIN responsaveis r ON r.id = ar.responsavel_id
      WHERE a.id = $1
      GROUP BY a.id
    `, [studentId]);
    const student = studentResult.rows[0];
    if (!student) throw httpError(404, 'Aluno não encontrado.');

    const enrollmentsResult = await pool.query(`
      SELECT
        m.id,
        m.numero,
        m.escola_id AS "escolaId",
        e.nome AS escola,
        m.turma_id AS "turmaId",
        t.nome AS turma,
        t.serie_ano AS "serieAno",
        m.ano_letivo AS "anoLetivo",
        m.data_matricula AS "dataMatricula",
        m.status
      FROM matriculas m
      JOIN escolas e ON e.id = m.escola_id
      JOIN turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = $1
      ORDER BY m.ano_letivo DESC, m.data_matricula DESC
    `, [studentId]);

    const authorizedEnrollments = enrollmentsResult.rows.filter(
      (enrollment) => canAccessSchool(request, enrollment.escolaId),
    );
    if (!authorizedEnrollments.length) {
      throw httpError(403, 'Você não possui acesso aos dados deste aluno.');
    }

    return response.json({
      ...student,
      matriculas: authorizedEnrollments,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/students/enroll', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = studentEnrollmentSchema.parse(request.body);
    assertSchoolAccess(request, data.escolaId);
    await client.query('BEGIN');
    await assertSchoolExists(client, data.escolaId);
    await lockClassForEnrollment(
      client,
      data.escolaId,
      data.turmaId,
      data.anoLetivo,
    );

    const address = data.aluno.endereco;
    const studentResult = await client.query(`
      INSERT INTO alunos (
        nome_completo, nome_social, data_nascimento, cpf, rg,
        certidao_nascimento, genero, nacionalidade, naturalidade,
        necessidade_educacional_especial, descricao_necessidade,
        telefone, email, cep, logradouro, numero_endereco,
        complemento, bairro, cidade, uf, criado_por, atualizado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$21
      )
      RETURNING id, nome_completo AS nome
    `, [
      data.aluno.nomeCompleto,
      data.aluno.nomeSocial || null,
      data.aluno.dataNascimento,
      data.aluno.cpf || null,
      data.aluno.rg || null,
      data.aluno.certidaoNascimento || null,
      data.aluno.genero || null,
      data.aluno.nacionalidade || 'Brasileira',
      data.aluno.naturalidade || null,
      data.aluno.necessidadeEducacionalEspecial,
      data.aluno.descricaoNecessidade || null,
      data.aluno.telefone || null,
      data.aluno.email || null,
      address.cep || null,
      address.logradouro || null,
      address.numero || null,
      address.complemento || null,
      address.bairro || null,
      address.cidade || null,
      address.uf || null,
      request.access.userId,
    ]);
    const student = studentResult.rows[0];

    let responsibleId = data.responsavel.id;
    if (responsibleId) {
      const existing = await client.query(
        'SELECT id FROM responsaveis WHERE id = $1 AND ativo = TRUE',
        [responsibleId],
      );
      if (!existing.rows[0]) throw httpError(404, 'Responsável não encontrado.');
    } else {
      if (data.responsavel.cpf) {
        const existing = await client.query(
          'SELECT id FROM responsaveis WHERE cpf = $1 AND ativo = TRUE',
          [data.responsavel.cpf],
        );
        responsibleId = existing.rows[0]?.id;
      }

      if (!responsibleId) {
        const responsibleAddress = data.responsavel.endereco;
        const responsibleResult = await client.query(`
          INSERT INTO responsaveis (
            nome_completo, cpf, rg, data_nascimento, email,
            telefone_principal, telefone_alternativo, profissao,
            cep, logradouro, numero_endereco, complemento, bairro,
            cidade, uf, criado_por, atualizado_por
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
          RETURNING id
        `, [
          data.responsavel.nomeCompleto,
          data.responsavel.cpf || null,
          data.responsavel.rg || null,
          data.responsavel.dataNascimento || null,
          data.responsavel.email || null,
          data.responsavel.telefonePrincipal,
          data.responsavel.telefoneAlternativo || null,
          data.responsavel.profissao || null,
          responsibleAddress.cep || null,
          responsibleAddress.logradouro || null,
          responsibleAddress.numero || null,
          responsibleAddress.complemento || null,
          responsibleAddress.bairro || null,
          responsibleAddress.cidade || null,
          responsibleAddress.uf || null,
          request.access.userId,
        ]);
        responsibleId = responsibleResult.rows[0].id;
      }
    }

    await client.query(`
      INSERT INTO aluno_responsaveis (
        aluno_id, responsavel_id, parentesco, responsavel_legal,
        contato_principal, autorizado_buscar, reside_com_aluno
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      student.id,
      responsibleId,
      data.parentesco,
      data.responsavelLegal,
      data.contatoPrincipal,
      data.autorizadoBuscar,
      data.resideComAluno,
    ]);

    const enrollmentResult = await client.query(`
      INSERT INTO matriculas (
        numero, aluno_id, escola_id, turma_id, ano_letivo,
        escola_origem, observacoes, criado_por, atualizado_por
      ) VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$7)
      RETURNING
        id, numero, aluno_id AS "alunoId", escola_id AS "escolaId",
        turma_id AS "turmaId", ano_letivo AS "anoLetivo", status
    `, [
      student.id,
      data.escolaId,
      data.turmaId,
      data.anoLetivo,
      data.escolaOrigem || null,
      data.observacoes || null,
      request.access.userId,
    ]);

    await client.query('COMMIT');
    return response.status(201).json({
      aluno: student,
      matricula: enrollmentResult.rows[0],
      responsavelId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/enrollments', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = enrollmentSchema.parse(request.body);
    assertSchoolAccess(request, data.escolaId);
    await client.query('BEGIN');
    await lockClassForEnrollment(
      client,
      data.escolaId,
      data.turmaId,
      data.anoLetivo,
    );

    const studentResult = await client.query(
      'SELECT id FROM alunos WHERE id = $1 AND ativo = TRUE',
      [data.alunoId],
    );
    if (!studentResult.rows[0]) throw httpError(404, 'Aluno não encontrado.');

    const { rows } = await client.query(`
      INSERT INTO matriculas (
        numero, aluno_id, escola_id, turma_id, ano_letivo,
        escola_origem, observacoes, criado_por, atualizado_por
      ) VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$7)
      RETURNING *
    `, [
      data.alunoId,
      data.escolaId,
      data.turmaId,
      data.anoLetivo,
      data.escolaOrigem || null,
      data.observacoes || null,
      request.access.userId,
    ]);

    await client.query('COMMIT');
    return response.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/teachers', async (request, response, next) => {
  try {
    const scope = schoolScope(request, request.query.escolaId);
    const search = String(request.query.busca || '').trim();
    const pagination = getPagination(request.query);

    const baseParams = [scope.schoolId, scope.schoolIds, search];

    const filters = `
      WHERE p.ativo = TRUE AND pe.ativo = TRUE
        AND (
          ($1::INTEGER IS NOT NULL AND pe.escola_id = $1)
          OR (
            $1::INTEGER IS NULL
            AND ($2::INTEGER[] IS NULL OR pe.escola_id = ANY($2::INTEGER[]))
          )
        )
        AND (
          $3 = ''
          OR p.nome_completo ILIKE '%' || $3 || '%'
          OR COALESCE(p.matricula_funcional, '') ILIKE '%' || $3 || '%'
          OR COALESCE(p.especialidade, '') ILIKE '%' || $3 || '%'
          OR COALESCE(p.formacao, '') ILIKE '%' || $3 || '%'
          OR e.nome ILIKE '%' || $3 || '%'
          OR (
            REGEXP_REPLACE($3, '\\D', '', 'g') <> ''
            AND COALESCE(p.cpf, '') LIKE '%' || REGEXP_REPLACE($3, '\\D', '', 'g') || '%'
          )
        )
    `;

    const selectQuery = `
      SELECT
        p.id,
        p.nome_completo AS nome,
        p.cpf,
        p.email,
        p.telefone,
        p.matricula_funcional AS "matriculaFuncional",
        p.formacao,
        p.especialidade,
        pe.escola_id AS "escolaId",
        e.nome AS escola,
        pe.tipo_vinculo AS "tipoVinculo",
        pe.carga_horaria_semanal AS "cargaHorariaSemanal"
      FROM professores p
      JOIN professor_escolas pe ON pe.professor_id = p.id
      JOIN escolas e ON e.id = pe.escola_id
      ${filters}
    `;

    if (!pagination) {
      const { rows } = await pool.query(
        `${selectQuery} ORDER BY e.nome, p.nome_completo`,
        baseParams,
      );

      return response.json(rows);
    }

    const countResult = await pool.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM professores p
      JOIN professor_escolas pe ON pe.professor_id = p.id
      JOIN escolas e ON e.id = pe.escola_id
      ${filters}
    `, baseParams);

    const total = countResult.rows[0].total;

    const { rows } = await pool.query(
      `${selectQuery}
       ORDER BY e.nome, p.nome_completo
       LIMIT $4 OFFSET $5`,
      [...baseParams, pagination.limit, pagination.offset],
    );

    return response.json(paginatedResponse(rows, total, pagination));
  } catch (error) {
    return next(error);
  }
});

router.post('/teachers', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = teacherSchema.parse(request.body);
    assertSchoolAccess(request, data.escolaId);
    await client.query('BEGIN');
    await assertSchoolExists(client, data.escolaId);

    const existingResult = await client.query(
      'SELECT id FROM professores WHERE cpf = $1 FOR UPDATE',
      [data.cpf],
    );
    let teacherId = existingResult.rows[0]?.id;

    if (teacherId) {
      await client.query(`
        UPDATE professores
        SET
          nome_completo = $1,
          email = COALESCE($2, email),
          telefone = COALESCE($3, telefone),
          formacao = COALESCE($4, formacao),
          especialidade = COALESCE($5, especialidade),
          ativo = TRUE,
          atualizado_por = $6
        WHERE id = $7
      `, [
        data.nomeCompleto,
        data.email || null,
        data.telefone || null,
        data.formacao || null,
        data.especialidade || null,
        request.access.userId,
        teacherId,
      ]);
    } else {
      const createdResult = await client.query(`
        INSERT INTO professores (
          usuario_id, nome_completo, cpf, rg, data_nascimento,
          email, telefone, matricula_funcional, formacao,
          especialidade, criado_por, atualizado_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
        RETURNING id
      `, [
        data.usuarioId || null,
        data.nomeCompleto,
        data.cpf,
        data.rg || null,
        data.dataNascimento || null,
        data.email || null,
        data.telefone || null,
        data.matriculaFuncional || null,
        data.formacao || null,
        data.especialidade || null,
        request.access.userId,
      ]);
      teacherId = createdResult.rows[0].id;
    }

    await client.query(`
      INSERT INTO professor_escolas (
        professor_id, escola_id, tipo_vinculo,
        carga_horaria_semanal, data_inicio, ativo
      ) VALUES ($1,$2,$3,$4,$5,TRUE)
      ON CONFLICT (professor_id, escola_id)
      DO UPDATE SET
        tipo_vinculo = EXCLUDED.tipo_vinculo,
        carga_horaria_semanal = EXCLUDED.carga_horaria_semanal,
        data_inicio = EXCLUDED.data_inicio,
        data_fim = NULL,
        ativo = TRUE
    `, [
      teacherId,
      data.escolaId,
      data.tipoVinculo,
      data.cargaHorariaSemanal || null,
      data.dataInicio,
    ]);

    await client.query('COMMIT');
    return response.status(201).json({
      id: teacherId,
      escolaId: data.escolaId,
      nome: data.nomeCompleto,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/employees', async (request, response, next) => {
  try {
    const scope = schoolScope(request, request.query.escolaId);
    const { rows } = await pool.query(`
      SELECT
        f.id,
        f.escola_id AS "escolaId",
        e.nome AS escola,
        f.nome_completo AS nome,
        f.cpf,
        f.email,
        f.telefone,
        f.cargo,
        f.matricula_funcional AS "matriculaFuncional",
        f.tipo_vinculo AS "tipoVinculo",
        f.data_admissao AS "dataAdmissao"
      FROM funcionarios_educacao f
      JOIN escolas e ON e.id = f.escola_id
      WHERE f.ativo = TRUE
        AND (
          ($1::INTEGER IS NOT NULL AND f.escola_id = $1)
          OR (
            $1::INTEGER IS NULL
            AND ($2::INTEGER[] IS NULL OR f.escola_id = ANY($2::INTEGER[]))
          )
        )
      ORDER BY e.nome, f.nome_completo
    `, [scope.schoolId, scope.schoolIds]);
    return response.json(rows);
  } catch (error) {
    return next(error);
  }
});

router.post('/employees', async (request, response, next) => {
  try {
    const data = employeeSchema.parse(request.body);
    assertSchoolAccess(request, data.escolaId);
    await assertSchoolExists(pool, data.escolaId);

    const { rows } = await pool.query(`
      INSERT INTO funcionarios_educacao (
        usuario_id, escola_id, nome_completo, cpf, rg, email,
        telefone, cargo, matricula_funcional, tipo_vinculo,
        data_admissao, criado_por, atualizado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
      RETURNING
        id, escola_id AS "escolaId", nome_completo AS nome,
        cargo, tipo_vinculo AS "tipoVinculo"
    `, [
      data.usuarioId || null,
      data.escolaId,
      data.nomeCompleto,
      data.cpf,
      data.rg || null,
      data.email || null,
      data.telefone || null,
      data.cargo,
      data.matriculaFuncional || null,
      data.tipoVinculo,
      data.dataAdmissao || null,
      request.access.userId,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;
