import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';

const router = Router();
router.use(authenticate, loadAccessContext);
router.use((request, response, next) => {
  if (request.access?.perfil !== 'Professor') return response.status(403).json({ message: 'Acesso exclusivo do perfil Professor.' });
  return next();
});

router.get('/dashboard', async (request, response, next) => {
  try {
    const professor = await pool.query(`SELECT p.id, p.nome_completo AS nome, p.disciplinas_areas AS disciplinas FROM professores p WHERE p.usuario_id = $1 AND p.ativo = TRUE LIMIT 1`, [request.access.userId]);
    const teacher = professor.rows[0];
    if (!teacher) return response.json({ professor: null, turmas: [], resumo: { turmas: 0, alunos: 0, aulas: 0, atividades: 0, avaliacoes: 0, faltasHoje: 0 } });
    const classes = await pool.query(`SELECT t.id, t.nome, t.serie_ano AS "serieAno", t.turno, t.sala, tp.componente_curricular AS "componenteCurricular", COUNT(DISTINCT m.id)::INTEGER AS "alunosMatriculados" FROM turma_professores tp JOIN turmas t ON t.id = tp.turma_id AND t.status = 'Ativa' LEFT JOIN matriculas m ON m.turma_id = t.id AND m.status = 'Ativa' WHERE tp.professor_id = $1 GROUP BY t.id, t.nome, t.serie_ano, t.turno, t.sala, tp.componente_curricular ORDER BY t.nome`, [teacher.id]);
    const students = classes.rows.reduce((total, item) => total + Number(item.alunosMatriculados || 0), 0);
    return response.json({ professor: { id: teacher.id, nome: teacher.nome, disciplina: teacher.disciplinas?.[0] || null }, turmas: classes.rows, resumo: { turmas: classes.rowCount, alunos: students, aulas: 0, atividades: 0, avaliacoes: 0, faltasHoje: 0 } });
  } catch (error) { return next(error); }
});

export default router;
