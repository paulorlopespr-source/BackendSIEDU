import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import { isStudentProfile, studentContextSql } from '../student-access.js';

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
      gradesResult, attendanceResult, calendarResult, notificationsResult] = await Promise.all([
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
      calendario: [
        ...plannedActivities.rows.map((item) => ({ ...item, data: item.prazo, origem: 'Atividade' })),
        ...calendarResult.rows.map((item) => ({ ...item, origem: 'Evento' })),
      ].sort((left, right) => String(left.data).localeCompare(String(right.data))),
      notificacoes: notificationsResult.rows,
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
