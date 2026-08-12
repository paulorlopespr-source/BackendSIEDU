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
    const professor = await pool.query(`SELECT p.id, p.nome_completo AS nome, p.especialidade AS disciplina FROM professores p WHERE p.usuario_id = $1 AND p.ativo = TRUE LIMIT 1`, [request.access.userId]);
    const teacher = professor.rows[0];
    if (!teacher) return response.json({ professor: null, turmas: [], resumo: { turmas: 0, alunos: 0, aulas: 0, atividades: 0, avaliacoes: 0, faltasHoje: 0 } });
    const classes = await pool.query(`SELECT t.id, t.nome, t.serie_ano AS "serieAno", t.turno, t.sala, tp.componente_curricular AS "componenteCurricular", COUNT(DISTINCT m.id)::INTEGER AS "alunosMatriculados" FROM turma_professores tp JOIN turmas t ON t.id = tp.turma_id AND t.status = 'Ativa' LEFT JOIN matriculas m ON m.turma_id = t.id AND m.status = 'Ativa' WHERE tp.professor_id = $1 GROUP BY t.id, t.nome, t.serie_ano, t.turno, t.sala, tp.componente_curricular ORDER BY t.nome`, [teacher.id]);
    const students = classes.rows.reduce((total, item) => total + Number(item.alunosMatriculados || 0), 0);
    return response.json({ professor: { id: teacher.id, nome: teacher.nome, disciplina: teacher.disciplina || null }, turmas: classes.rows, resumo: { turmas: classes.rowCount, alunos: students, aulas: 0, atividades: 0, avaliacoes: 0, faltasHoje: 0 } });
  } catch (error) { return next(error); }
});

router.get('/classes/:id/students', async (request, response, next) => {
 try {
  const classId=Number(request.params.id);
  const allowed=await pool.query(`SELECT 1 FROM professores p JOIN turma_professores tp ON tp.professor_id=p.id WHERE p.usuario_id=$1 AND tp.turma_id=$2 AND p.ativo=TRUE`,[request.access.userId,classId]);
  if(!allowed.rows[0]) return response.status(403).json({message:'Esta turma não está atribuída ao professor.'});
  const {rows}=await pool.query(`SELECT a.id,a.nome_completo AS nome,a.nome_social AS "nomeSocial",m.id AS "matriculaId",m.status FROM matriculas m JOIN alunos a ON a.id=m.aluno_id WHERE m.turma_id=$1 AND m.status='Ativa' ORDER BY a.nome_completo`,[classId]);
  return response.json(rows);
 } catch(error){ return next(error); }
});

router.get('/students/:studentId/history', async (request,response,next)=>{
 try {
  const studentId=Number(request.params.studentId); const classId=Number(request.query.turmaId);
  const access=await pool.query(`SELECT p.id AS professor_id,tp.componente_curricular FROM professores p JOIN turma_professores tp ON tp.professor_id=p.id JOIN matriculas m ON m.turma_id=tp.turma_id WHERE p.usuario_id=$1 AND m.aluno_id=$2 AND tp.turma_id=$3 AND p.ativo=TRUE AND m.status='Ativa' LIMIT 1`,[request.access.userId,studentId,classId]);
  if(!access.rows[0]) return response.status(403).json({message:'Aluno não pertence a uma turma atribuída ao professor.'});
  const [student,notes,absences,activities]=await Promise.all([
   pool.query(`SELECT id,nome_completo AS nome,nome_social AS "nomeSocial",data_nascimento AS "dataNascimento" FROM alunos WHERE id=$1`,[studentId]),
   pool.query(`SELECT avaliacao,nota::float8,data_avaliacao AS data,componente_curricular AS disciplina FROM notas_alunos WHERE aluno_id=$1 AND turma_id=$2 AND professor_id=$3 ORDER BY data_avaliacao DESC`,[studentId,classId,access.rows[0].professor_id]),
   pool.query(`SELECT data_aula AS data,quantidade,justificada,componente_curricular AS disciplina FROM faltas_alunos WHERE aluno_id=$1 AND turma_id=$2 AND professor_id=$3 ORDER BY data_aula DESC`,[studentId,classId,access.rows[0].professor_id]),
   pool.query(`SELECT titulo,prazo,status FROM atividades_alunos WHERE aluno_id=$1 AND turma_id=$2 AND professor_id=$3 ORDER BY prazo`,[studentId,classId,access.rows[0].professor_id])
  ]);
  return response.json({aluno:student.rows[0],notas:notes.rows,faltas:absences.rows,atividades:activities.rows,resumo:{media:notes.rows.length?notes.rows.reduce((s,n)=>s+Number(n.nota),0)/notes.rows.length:null,totalFaltas:absences.rows.reduce((s,f)=>s+Number(f.quantidade),0),pendencias:activities.rows.filter(a=>a.status==='Pendente'||a.status==='Atrasada').length}});
 } catch(error){return next(error);}
});

export default router;
