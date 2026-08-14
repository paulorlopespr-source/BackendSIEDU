import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import {
  canDefineSaeb,
  canEditRevisionTrails,
  isLearningCoordinator,
  isLearningProfessor,
  schoolGradeNumber,
} from '../learning-access.js';

const router = Router();
router.use(authenticate, loadAccessContext);

const cycleSchema = z.object({
  turmaId: z.coerce.number().int().positive(),
  disciplina: z.string().trim().min(2).max(120),
  titulo: z.string().trim().min(3).max(180),
  descricao: z.string().trim().max(4000).optional().default(''),
  instrucoes: z.string().trim().max(4000).optional().default(''),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  valorMaximo: z.coerce.number().positive().max(1000),
  cicloNumero: z.coerce.number().int().positive().max(30),
  status: z.enum(['Rascunho', 'Publicada', 'Encerrada']).default('Publicada'),
});

const resultSchema = z.object({
  alunoId: z.coerce.number().int().positive(),
  pontos: z.coerce.number().min(0),
  feedback: z.string().trim().max(2000).optional().default(''),
});

const trailSchema = z.object({
  turmaId: z.coerce.number().int().positive(),
  disciplina: z.string().trim().min(2).max(120),
  titulo: z.string().trim().min(3).max(180),
  objetivo: z.string().trim().min(3).max(4000),
  conteudos: z.string().trim().min(3).max(8000),
  exercicios: z.string().trim().min(3).max(8000),
  criterioResultado: z.string().trim().max(1000).optional().default(''),
  status: z.enum(['Rascunho', 'Publicada', 'Arquivada']).default('Publicada'),
});

const saebSchema = z.object({
  titulo: z.string().trim().min(3).max(180),
  anoLetivo: z.coerce.number().int().min(2020).max(2100),
  areaConhecimento: z.string().trim().min(3).max(120),
  matrizReferencia: z.string().trim().min(3).max(8000),
  serieAno: z.string().trim().max(80).optional().default(''),
  turmaId: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
  dataAplicacao: z.coerce.date(),
  horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().default('08:00'),
  duracaoMinutos: z.coerce.number().int().min(15).max(360),
  quantidadeQuestoes: z.coerce.number().int().min(1).max(200),
  instrucoes: z.string().trim().max(4000).optional().default(''),
  status: z.enum(['Rascunho', 'Programado', 'Em aplicação', 'Encerrado']).default('Programado'),
});

const isProfessor = (request) => isLearningProfessor(request.access);
const isCoordinator = (request) => isLearningCoordinator(request.access);
const canManageTrails = (request) => canEditRevisionTrails(request.access);
const canManageSaeb = (request) => canDefineSaeb(request.access);

function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function classAccess(request, classId, discipline = null) {
  if (isProfessor(request)) {
    const { rows } = await pool.query(`
      SELECT t.id, t.nome, t.serie_ano AS "serieAno", t.escola_id AS "escolaId",
        tp.componente_curricular AS disciplina, p.id AS "professorId"
      FROM professores p
      JOIN turma_professores tp ON tp.professor_id = p.id
      JOIN turmas t ON t.id = tp.turma_id AND t.status = 'Ativa'
      WHERE p.usuario_id = $1 AND p.ativo = TRUE AND t.id = $2
        AND ($3::text IS NULL OR LOWER(tp.componente_curricular) = LOWER($3))
      LIMIT 1
    `, [request.access.userId, classId, discipline]);
    return rows[0] || null;
  }

  if (!request.access?.municipal) {
    const school = await pool.query('SELECT escola_id FROM turmas WHERE id = $1', [classId]);
    if (!school.rows[0] || !request.access?.escolas.includes(Number(school.rows[0].escola_id))) return null;
  }

  const { rows } = await pool.query(`
    SELECT id, nome, serie_ano AS "serieAno", escola_id AS "escolaId",
      NULL::text AS disciplina, NULL::bigint AS "professorId"
    FROM turmas WHERE id = $1 AND status = 'Ativa'
  `, [classId]);
  return rows[0] || null;
}

async function listClasses(request) {
  if (isProfessor(request)) {
    const { rows } = await pool.query(`
      SELECT t.id, t.nome, t.serie_ano AS "serieAno", t.turno,
        tp.componente_curricular AS disciplina
      FROM professores p
      JOIN turma_professores tp ON tp.professor_id = p.id
      JOIN turmas t ON t.id = tp.turma_id AND t.status = 'Ativa'
      WHERE p.usuario_id = $1 AND p.ativo = TRUE
      ORDER BY t.nome, tp.componente_curricular
    `, [request.access.userId]);
    return rows;
  }

  const params = request.access?.municipal ? [] : [request.access?.escolas || []];
  const filter = request.access?.municipal ? '' : 'AND t.escola_id = ANY($1::int[])';
  const { rows } = await pool.query(`
    SELECT t.id, t.nome, t.serie_ano AS "serieAno", t.turno,
      NULL::text AS disciplina
    FROM turmas t WHERE t.status = 'Ativa' ${filter}
    ORDER BY t.nome
  `, params);
  return rows;
}

router.get('/management', async (request, response, next) => {
  try {
    if (!isProfessor(request) && !isCoordinator(request) && !canManageSaeb(request)) {
      return response.status(403).json({ message: 'Perfil sem acesso à gestão da aprendizagem.' });
    }

    const classes = await listClasses(request);
    const classIds = classes.map((item) => Number(item.id));
    const professorFilter = isProfessor(request)
      ? 'AND p.usuario_id = $1'
      : classIds.length ? 'AND c.turma_id = ANY($1::bigint[])' : 'AND FALSE';
    const trailFilter = isProfessor(request)
      ? 'AND (tr.criado_por = $1 OR tr.turma_id = ANY($2::bigint[]))'
      : classIds.length ? 'AND tr.turma_id = ANY($1::bigint[])' : 'AND FALSE';
    const cycleParams = isProfessor(request) ? [request.access.userId] : [classIds];
    const trailParams = isProfessor(request) ? [request.access.userId, classIds] : [classIds];

    const [cycles, trails, simulations] = await Promise.all([
      pool.query(`
        SELECT c.id, c.turma_id AS "turmaId", t.nome AS turma,
          t.serie_ano AS "serieAno", c.componente_curricular AS disciplina,
          c.titulo, c.descricao, c.instrucoes, c.data_inicio AS "dataInicio",
          c.data_fim AS "dataFim", c.valor_maximo::float8 AS "valorMaximo",
          c.ciclo_numero AS "cicloNumero", c.status,
          COUNT(r.id)::integer AS "resultadosLancados"
        FROM avaliacoes_ciclo c
        JOIN professores p ON p.id = c.professor_id
        JOIN turmas t ON t.id = c.turma_id
        LEFT JOIN resultados_avaliacoes_ciclo r ON r.avaliacao_ciclo_id = c.id
        WHERE TRUE ${professorFilter}
        GROUP BY c.id, t.nome, t.serie_ano
        ORDER BY c.data_inicio DESC, c.id DESC
      `, cycleParams),
      pool.query(`
        SELECT tr.id, tr.turma_id AS "turmaId", t.nome AS turma,
          tr.componente_curricular AS disciplina, tr.titulo, tr.objetivo,
          tr.conteudos, tr.exercicios, tr.criterio_resultado AS "criterioResultado",
          tr.perfil_criador AS "perfilCriador", tr.status, tr.versao,
          tr.atualizado_em AS "atualizadoEm"
        FROM trilhas_revisao tr JOIN turmas t ON t.id = tr.turma_id
        WHERE TRUE ${trailFilter}
        ORDER BY tr.atualizado_em DESC, tr.id DESC
      `, trailParams),
      pool.query(`
        SELECT s.id, s.titulo, s.ano_letivo AS "anoLetivo",
          s.area_conhecimento AS "areaConhecimento", s.matriz_referencia AS "matrizReferencia",
          s.serie_ano AS "serieAno", s.turma_id AS "turmaId", t.nome AS turma,
          s.data_aplicacao AS "dataAplicacao", TO_CHAR(s.hora_inicio, 'HH24:MI') AS "horaInicio",
          s.duracao_minutos AS "duracaoMinutos", s.quantidade_questoes AS "quantidadeQuestoes",
          s.instrucoes, s.status
        FROM simulados_saeb s LEFT JOIN turmas t ON t.id = s.turma_id
        ORDER BY s.data_aplicacao DESC, s.id DESC
      `),
    ]);

    return response.json({
      permissoes: {
        criarCiclo: isProfessor(request),
        editarTrilha: canManageTrails(request),
        definirSaeb: canManageSaeb(request),
      },
      turmas: classes,
      ciclos: cycles.rows,
      trilhas: trails.rows,
      simuladosSaeb: simulations.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/cycles', async (request, response, next) => {
  try {
    if (!isProfessor(request)) return response.status(403).json({ message: 'Somente o professor pode criar Avaliações de Ciclo.' });
    const data = cycleSchema.parse(request.body);
    const classInfo = await classAccess(request, data.turmaId, data.disciplina);
    if (!classInfo) throw fail(403, 'A turma ou disciplina não está vinculada ao professor.');
    if (schoolGradeNumber(classInfo.serieAno) < 6) throw fail(400, 'A Avaliação de Ciclo está disponível a partir do 6º ano.');
    const difference = Math.round((data.dataFim - data.dataInicio) / 86400000);
    if (difference < 0 || difference > 15) throw fail(400, 'O período da atividade deve ter no máximo quinze dias.');

    const { rows } = await pool.query(`
      INSERT INTO avaliacoes_ciclo (
        professor_id, turma_id, componente_curricular, titulo, descricao,
        instrucoes, data_inicio, data_fim, valor_maximo, ciclo_numero, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `, [classInfo.professorId, data.turmaId, data.disciplina, data.titulo,
      data.descricao || null, data.instrucoes || null, data.dataInicio,
      data.dataFim, data.valorMaximo, data.cicloNumero, data.status]);
    return response.status(201).json(rows[0]);
  } catch (error) { return next(error); }
});

router.get('/cycles/:id/results', async (request, response, next) => {
  try {
    if (!isProfessor(request)) return response.status(403).json({ message: 'Somente o professor responsável pode consultar as notas do ciclo.' });
    const cycle = await pool.query(`
      SELECT c.id, c.turma_id, c.valor_maximo::float8 AS "valorMaximo", p.usuario_id
      FROM avaliacoes_ciclo c JOIN professores p ON p.id = c.professor_id
      WHERE c.id = $1
    `, [request.params.id]);
    const item = cycle.rows[0];
    if (!item || Number(item.usuario_id) !== Number(request.access.userId)) {
      throw fail(403, 'Avaliação não pertence ao professor autenticado.');
    }
    const { rows } = await pool.query(`
      SELECT a.id AS "alunoId", a.nome_completo AS aluno,
        r.pontos::float8, r.feedback
      FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN resultados_avaliacoes_ciclo r
        ON r.aluno_id = a.id AND r.avaliacao_ciclo_id = $2
      WHERE m.turma_id = $1 AND m.status = 'Ativa'
      ORDER BY a.nome_completo
    `, [item.turma_id, item.id]);
    return response.json({ valorMaximo: item.valorMaximo, alunos: rows });
  } catch (error) { return next(error); }
});

router.put('/cycles/:id/results', async (request, response, next) => {
  try {
    if (!isProfessor(request)) return response.status(403).json({ message: 'Somente o professor responsável pode lançar a nota.' });
    const data = resultSchema.parse(request.body);
    const cycle = await pool.query(`
      SELECT c.id, c.turma_id, c.valor_maximo::float8 AS "valorMaximo"
      FROM avaliacoes_ciclo c JOIN professores p ON p.id = c.professor_id
      WHERE c.id = $1 AND p.usuario_id = $2
    `, [request.params.id, request.access.userId]);
    const item = cycle.rows[0];
    if (!item) throw fail(403, 'Avaliação não pertence ao professor autenticado.');
    if (data.pontos > Number(item.valorMaximo)) throw fail(400, 'A nota não pode superar o valor máximo da avaliação.');
    const enrollment = await pool.query(`
      SELECT 1 FROM matriculas WHERE turma_id = $1 AND aluno_id = $2 AND status = 'Ativa'
    `, [item.turma_id, data.alunoId]);
    if (!enrollment.rows[0]) throw fail(400, 'O aluno não pertence à turma da avaliação.');
    await pool.query(`
      INSERT INTO resultados_avaliacoes_ciclo (
        avaliacao_ciclo_id, aluno_id, pontos, feedback
      ) VALUES ($1,$2,$3,$4)
      ON CONFLICT (avaliacao_ciclo_id, aluno_id) DO UPDATE SET
        pontos = EXCLUDED.pontos, feedback = EXCLUDED.feedback,
        atualizado_em = NOW()
    `, [item.id, data.alunoId, data.pontos, data.feedback || null]);
    return response.json({ message: 'Nota da Avaliação de Ciclo salva com sucesso.' });
  } catch (error) { return next(error); }
});

router.post('/trails', async (request, response, next) => {
  try {
    if (!canManageTrails(request)) return response.status(403).json({ message: 'Somente professores e coordenadores podem criar trilhas.' });
    const data = trailSchema.parse(request.body);
    const classInfo = await classAccess(request, data.turmaId, isProfessor(request) ? data.disciplina : null);
    if (!classInfo) throw fail(403, 'Você não possui acesso à turma informada.');
    const { rows } = await pool.query(`
      INSERT INTO trilhas_revisao (
        turma_id, componente_curricular, titulo, objetivo, conteudos,
        exercicios, criterio_resultado, criado_por, perfil_criador, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [data.turmaId, data.disciplina, data.titulo, data.objetivo, data.conteudos,
      data.exercicios, data.criterioResultado || null, request.access.userId,
      request.access.perfil, data.status]);
    return response.status(201).json(rows[0]);
  } catch (error) { return next(error); }
});

router.put('/trails/:id', async (request, response, next) => {
  try {
    if (!canManageTrails(request)) return response.status(403).json({ message: 'Somente professores e coordenadores podem editar trilhas.' });
    const data = trailSchema.parse(request.body);
    const classInfo = await classAccess(request, data.turmaId, isProfessor(request) ? data.disciplina : null);
    if (!classInfo) throw fail(403, 'Você não possui acesso à turma informada.');
    const existing = await pool.query('SELECT criado_por FROM trilhas_revisao WHERE id = $1', [request.params.id]);
    if (!existing.rows[0]) throw fail(404, 'Trilha não encontrada.');
    await pool.query(`
      UPDATE trilhas_revisao SET turma_id=$1, componente_curricular=$2,
        titulo=$3, objetivo=$4, conteudos=$5, exercicios=$6,
        criterio_resultado=$7, status=$8, versao=versao+1, atualizado_em=NOW()
      WHERE id=$9
    `, [data.turmaId, data.disciplina, data.titulo, data.objetivo,
      data.conteudos, data.exercicios, data.criterioResultado || null,
      data.status, request.params.id]);
    return response.json({ message: 'Trilha atualizada após a análise do resultado.' });
  } catch (error) { return next(error); }
});

router.post('/saeb', async (request, response, next) => {
  try {
    if (!canManageSaeb(request)) return response.status(403).json({ message: 'Somente a Secretaria e a Coordenação Municipal podem definir o Simulado SAEB.' });
    const data = saebSchema.parse(request.body);
    if (data.turmaId) {
      const allowed = await classAccess(request, Number(data.turmaId));
      if (!allowed) throw fail(403, 'Turma fora do escopo de acesso.');
    }
    const { rows } = await pool.query(`
      INSERT INTO simulados_saeb (
        titulo, ano_letivo, area_conhecimento, matriz_referencia, serie_ano,
        turma_id, data_aplicacao, hora_inicio, duracao_minutos,
        quantidade_questoes, instrucoes, status, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id
    `, [data.titulo, data.anoLetivo, data.areaConhecimento, data.matrizReferencia,
      data.serieAno || null, data.turmaId || null, data.dataAplicacao,
      data.horaInicio || null, data.duracaoMinutos, data.quantidadeQuestoes,
      data.instrucoes || null, data.status, request.access.userId]);
    return response.status(201).json(rows[0]);
  } catch (error) { return next(error); }
});

export default router;
