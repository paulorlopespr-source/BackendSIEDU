import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import { isStudentProfile, studentContextSql } from '../student-access.js';
import { calendarEvent } from '../student-calendar.js';

const router = Router();
router.use(authenticate, loadAccessContext);

router.use((request, response, next) => {
  if (!isStudentProfile(request.access)) {
    return response.status(403).json({ message: 'Acesso exclusivo do perfil Aluno.' });
  }
  return next();
});

function normalizedGrade(points, maximum) {
  if (points == null || !Number(maximum)) return null;
  return Number(((Number(points) / Number(maximum)) * 10).toFixed(1));
}

function buildAverages(grades) {
  const groups = new Map();
  for (const grade of grades) {
    if (grade.nota == null) continue;
    const key = `${grade.disciplina}:${grade.bimestre}`;
    const current = groups.get(key) || {
      disciplina: grade.disciplina,
      bimestre: grade.bimestre,
      total: 0,
      quantidade: 0,
    };
    current.total += grade.nota;
    current.quantidade += 1;
    groups.set(key, current);
  }
  return [...groups.values()].map((item) => ({
    disciplina: item.disciplina,
    bimestre: item.bimestre,
    media: Number((item.total / item.quantidade).toFixed(1)),
  }));
}

async function loadStudent(userId) {
  const result = await pool.query(studentContextSql, [userId]);
  return result.rows[0] || null;
}

router.get('/portal', async (request, response, next) => {
  try {
    const student = await loadStudent(request.access.userId);
    if (!student) {
      return response.status(404).json({
        message: 'O usuário está autenticado, mas ainda não possui matrícula ativa vinculada.',
      });
    }

    const params = [student.turmaId, student.alunoId];
    const [subjects, schedule, materials, plannedActivities, personalActivities,
      gradesResult, attendanceResult, calendarResult, notificationsResult,
      cycleResults, trailsResult, saebResult, schoolCalendarResult] = await Promise.all([
      pool.query(`
        SELECT
          tp.componente_curricular AS disciplina,
          p.nome_completo AS professor,
          tp.carga_horaria_semanal::float8 AS "cargaHorariaSemanal",
          tp.titular
        FROM turma_professores tp
        JOIN professores p ON p.id = tp.professor_id AND p.ativo = TRUE
        WHERE tp.turma_id = $1
        ORDER BY tp.componente_curricular, p.nome_completo
      `, [student.turmaId]),
      pool.query(`
        SELECT
          h.id,
          h.dia_semana AS "diaSemana",
          TO_CHAR(h.hora_inicio, 'HH24:MI') AS "horaInicio",
          TO_CHAR(h.hora_fim, 'HH24:MI') AS "horaFim",
          h.componente_curricular AS disciplina,
          h.sala,
          p.nome_completo AS professor
        FROM horarios_professor h
        JOIN professores p ON p.id = h.professor_id
        WHERE h.turma_id = $1 AND h.ativo = TRUE
        ORDER BY h.dia_semana, h.hora_inicio
      `, [student.turmaId]),
      pool.query(`
        SELECT
          m.id,
          m.titulo,
          m.tipo,
          m.descricao,
          m.conteudo_texto AS "conteudoTexto",
          m.url_externa AS "urlExterna",
          m.arquivo_dados AS "arquivoDados",
          m.arquivo_nome AS "arquivoNome",
          m.arquivo_mime AS "arquivoMime",
          m.componente_curricular AS disciplina,
          m.criado_em AS "criadoEm",
          p.nome_completo AS professor
        FROM materiais_aula m
        JOIN professores p ON p.id = m.professor_id
        WHERE m.turma_id = $1 AND m.publicado = TRUE
        ORDER BY m.criado_em DESC, m.id DESC
      `, [student.turmaId]),
      pool.query(`
        SELECT
          a.id,
          a.titulo,
          a.tipo,
          a.descricao,
          a.data_evento AS prazo,
          TO_CHAR(a.hora_inicio, 'HH24:MI') AS "horaInicio",
          TO_CHAR(a.hora_fim, 'HH24:MI') AS "horaFim",
          a.valor::float8,
          a.instrucoes,
          a.materiais,
          a.componente_curricular AS disciplina,
          a.status
        FROM atividades_programadas a
        WHERE a.turma_id = $1 AND a.status <> 'Cancelada'
        ORDER BY a.data_evento, a.hora_inicio
      `, [student.turmaId]),
      pool.query(`
        SELECT
          aa.id,
          aa.titulo,
          'Atividade'::text AS tipo,
          aa.prazo,
          aa.status,
          tp.componente_curricular AS disciplina,
          p.nome_completo AS professor
        FROM atividades_alunos aa
        JOIN professores p ON p.id = aa.professor_id
        LEFT JOIN turma_professores tp
          ON tp.turma_id = aa.turma_id AND tp.professor_id = aa.professor_id
        WHERE aa.turma_id = $1 AND aa.aluno_id = $2
        ORDER BY aa.prazo, aa.id
      `, params),
      pool.query(`
        SELECT
          av.id,
          av.titulo,
          av.tipo,
          av.componente_curricular AS disciplina,
          av.bimestre,
          av.data_avaliacao AS data,
          av.valor_maximo::float8 AS "valorMaximo",
          na.pontos::float8 AS pontos,
          p.nome_completo AS professor
        FROM avaliacoes_professor av
        JOIN professores p ON p.id = av.professor_id
        LEFT JOIN notas_avaliacoes na
          ON na.avaliacao_id = av.id AND na.aluno_id = $2
        WHERE av.turma_id = $1
        ORDER BY av.bimestre, av.componente_curricular, av.data_avaliacao
      `, params),
      pool.query(`
        SELECT
          d.id,
          d.data_aula AS data,
          d.componente_curricular AS disciplina,
          d.quantidade_aulas AS "quantidadeAulas",
          df.presente,
          df.justificada,
          df.observacao,
          p.nome_completo AS professor
        FROM diario_frequencias df
        JOIN diarios_classe d ON d.id = df.diario_id
        JOIN professores p ON p.id = d.professor_id
        WHERE d.turma_id = $1 AND df.aluno_id = $2
        ORDER BY d.data_aula DESC, d.id DESC
      `, params),
      pool.query(`
        SELECT
          e.id,
          e.titulo,
          e.tipo,
          e.data_evento AS data,
          TO_CHAR(e.hora_inicio, 'HH24:MI') AS "horaInicio",
          TO_CHAR(e.hora_fim, 'HH24:MI') AS "horaFim",
          e.observacao,
          p.nome_completo AS professor
        FROM eventos_calendario_professor e
        JOIN professores p ON p.id = e.professor_id
        WHERE e.turma_id = $1
          AND (
            e.publico = 'Toda a turma'
            OR (
              e.publico = 'Alunos selecionados'
              AND EXISTS (
                SELECT 1 FROM evento_calendario_alunos ea
                WHERE ea.evento_id = e.id AND ea.aluno_id = $2
              )
            )
          )
        ORDER BY e.data_evento, e.hora_inicio
      `, params),
      pool.query(`
        SELECT id, titulo, mensagem, tipo, lida, criado_em AS "criadoEm"
        FROM notificacoes_alunos
        WHERE aluno_id = $1
        ORDER BY lida, criado_em DESC, id DESC
        LIMIT 30
      `, [student.alunoId]),
      pool.query(`
        SELECT c.id, c.titulo, c.descricao, c.instrucoes,
          c.componente_curricular AS disciplina, c.data_inicio AS "dataInicio",
          c.data_fim AS "dataFim", c.valor_maximo::float8 AS "valorMaximo",
          c.ciclo_numero AS "cicloNumero", c.status,
          r.pontos::float8, r.feedback,
          CASE WHEN r.pontos IS NULL THEN NULL
            ELSE ROUND((r.pontos / NULLIF(c.valor_maximo, 0) * 10)::numeric, 1)::float8
          END AS nota,
          p.nome_completo AS professor
        FROM avaliacoes_ciclo c
        JOIN professores p ON p.id = c.professor_id
        LEFT JOIN resultados_avaliacoes_ciclo r
          ON r.avaliacao_ciclo_id = c.id AND r.aluno_id = $2
        WHERE c.turma_id = $1 AND c.status <> 'Cancelada'
        ORDER BY c.data_inicio DESC, c.id DESC
      `, params),
      pool.query(`
        SELECT tr.id, tr.titulo, tr.componente_curricular AS disciplina,
          tr.objetivo, tr.conteudos, tr.exercicios,
          tr.criterio_resultado AS "criterioResultado",
          tr.perfil_criador AS "perfilCriador", tr.versao,
          COALESCE(tra.status, 'Disponível') AS status,
          COALESCE(tra.progresso, 0) AS progresso,
          tra.resultado_observado::float8 AS "resultadoObservado",
          tr.atualizado_em AS "atualizadoEm"
        FROM trilhas_revisao tr
        LEFT JOIN trilhas_revisao_alunos tra
          ON tra.trilha_id = tr.id AND tra.aluno_id = $2
        WHERE tr.turma_id = $1 AND tr.status = 'Publicada'
        ORDER BY tr.atualizado_em DESC, tr.id DESC
      `, params),
      pool.query(`
        SELECT s.id, s.titulo, s.area_conhecimento AS "areaConhecimento",
          s.matriz_referencia AS "matrizReferencia", s.serie_ano AS "serieAno",
          s.data_aplicacao AS "dataAplicacao",
          TO_CHAR(s.hora_inicio, 'HH24:MI') AS "horaInicio",
          s.duracao_minutos AS "duracaoMinutos",
          s.quantidade_questoes AS "quantidadeQuestoes", s.instrucoes, s.status,
          rs.acertos, rs.proficiencia::float8, rs.nivel_desempenho AS "nivelDesempenho"
        FROM simulados_saeb s
        LEFT JOIN resultados_simulados_saeb rs
          ON rs.simulado_id = s.id AND rs.aluno_id = $2
        WHERE s.status <> 'Cancelado'
          AND (s.turma_id = $1 OR (s.turma_id IS NULL AND (s.serie_ano IS NULL OR LOWER(s.serie_ano) = LOWER($3))))
        ORDER BY s.data_aplicacao, s.id
      `, [student.turmaId, student.alunoId, student.serieAno]),
      pool.query(`
        SELECT id, titulo, tipo, disciplina,
          data_inicio AS "dataInicio", data_fim AS "dataFim",
          TO_CHAR(hora_inicio, 'HH24:MI') AS "horaInicio",
          TO_CHAR(hora_fim, 'HH24:MI') AS "horaFim",
          observacao, destaque, escopo
        FROM eventos_calendario_escolar
        WHERE publicado = TRUE
          AND (
            escopo = 'Rede'
            OR (escopo = 'Escola' AND escola_id = $1)
            OR (escopo = 'Turma' AND turma_id = $2)
          )
        ORDER BY data_inicio, hora_inicio, id
      `, [student.escolaId, student.turmaId]),
    ]);

    const grades = gradesResult.rows.map((grade) => ({
      ...grade,
      nota: normalizedGrade(grade.pontos, grade.valorMaximo),
    }));
    const attendance = attendanceResult.rows;
    const classCount = attendance.reduce(
      (total, item) => total + Number(item.quantidadeAulas || 1),
      0,
    );
    const absenceCount = attendance.reduce(
      (total, item) => total + (item.presente ? 0 : Number(item.quantidadeAulas || 1)),
      0,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pending = [
      ...plannedActivities.rows.filter(
        (item) => item.status === 'Programada' && new Date(item.prazo) >= today,
      ),
      ...personalActivities.rows.filter((item) => ['Pendente', 'Atrasada'].includes(item.status)),
    ];
    const cycleGrades = cycleResults.rows
      .filter((item) => item.nota != null)
      .map((item) => ({
        id: `ciclo-${item.id}`,
        disciplina: item.disciplina,
        titulo: item.titulo,
        data: item.dataFim,
        nota: Number(item.nota),
        origem: 'Avaliação de Ciclo',
      }));
    const allLearningGrades = [
      ...grades.filter((item) => item.nota != null).map((item) => ({
        id: `regular-${item.id}`,
        disciplina: item.disciplina,
        titulo: item.titulo,
        data: item.data,
        nota: Number(item.nota),
        origem: item.tipo,
      })),
      ...cycleGrades,
    ].sort((left, right) => String(left.data).localeCompare(String(right.data)));
    const learningAverage = allLearningGrades.length
      ? Number((allLearningGrades.reduce((sum, item) => sum + item.nota, 0) / allLearningGrades.length).toFixed(1))
      : null;
    const learningPending = pending.length
      + cycleResults.rows.filter((item) => item.status === 'Publicada' && item.pontos == null).length
      + trailsResult.rows.filter((item) => item.status !== 'Concluída').length;
    const plannedKeys = new Set(plannedActivities.rows.map((item) => (
      `${String(item.titulo).toLowerCase()}|${String(item.disciplina || '').toLowerCase()}|${String(item.prazo).slice(0, 10)}`
    )));
    const standaloneAssessments = gradesResult.rows.filter((item) => !plannedKeys.has(
      `${String(item.titulo).toLowerCase()}|${String(item.disciplina || '').toLowerCase()}|${String(item.data).slice(0, 10)}`,
    ));
    const calendarItems = [
      ...schoolCalendarResult.rows.map((item) => calendarEvent('institucional', item, { origem: item.escopo })),
      ...plannedActivities.rows.map((item) => calendarEvent('atividade', item, {
        dataInicio: item.prazo,
        origem: 'Professor',
      })),
      ...personalActivities.rows.map((item) => calendarEvent('atividade-aluno', item, {
        dataInicio: item.prazo,
        origem: 'Aluno',
      })),
      ...standaloneAssessments.map((item) => calendarEvent('avaliacao', item, {
        dataInicio: item.data,
        tipo: item.tipo || 'Avaliação',
        origem: 'Professor',
      })),
      ...calendarResult.rows.map((item) => calendarEvent('evento-professor', item, {
        dataInicio: item.data,
        origem: 'Professor',
      })),
      ...cycleResults.rows.map((item) => calendarEvent('ciclo', item, {
        dataInicio: item.dataInicio,
        dataFim: item.dataFim,
        tipo: 'Avaliação de Ciclo',
        origem: 'Professor',
      })),
      ...saebResult.rows.map((item) => calendarEvent('saeb', item, {
        dataInicio: item.dataAplicacao,
        tipo: 'Simulado SAEB',
        origem: 'Secretaria Municipal',
        escopo: item.serieAno ? 'Série/Ano' : 'Rede',
      })),
    ].sort((left, right) => (
      String(left.dataInicio).localeCompare(String(right.dataInicio))
      || String(left.horaInicio || '').localeCompare(String(right.horaInicio || ''))
      || left.titulo.localeCompare(right.titulo)
    ));

    return response.json({
      aluno: student,
      disciplinas: subjects.rows,
      horarios: schedule.rows,
      materiais: materials.rows,
      atividades: [...plannedActivities.rows, ...personalActivities.rows],
      notas: grades,
      medias: buildAverages(grades),
      frequencia: {
        registros: attendance,
        aulas: classCount,
        faltas: absenceCount,
        percentual: classCount
          ? Number((((classCount - absenceCount) / classCount) * 100).toFixed(1))
          : 100,
      },
      calendario: calendarItems,
      notificacoes: notificationsResult.rows,
      avaliacoesCiclo: cycleResults.rows,
      trilhasRevisao: trailsResult.rows,
      simuladosSaeb: saebResult.rows,
      painelAprendizagem: {
        mediaGeral: learningAverage,
        evolucao: allLearningGrades,
        pendencias: learningPending,
        trilhasConcluidas: trailsResult.rows.filter((item) => item.status === 'Concluída').length,
        trilhasDisponiveis: trailsResult.rowCount,
        avaliacoesCiclo: cycleResults.rowCount,
      },
      resumo: {
        disciplinas: subjects.rowCount,
        materiais: materials.rowCount,
        pendencias: pending.length,
        notificacoesNaoLidas: notificationsResult.rows.filter((item) => !item.lida).length,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
