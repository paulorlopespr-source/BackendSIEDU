import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import { canManageAcademics } from '../utils/accessPolicy.js';

const router = Router();
router.use(authenticate, loadAccessContext);
router.use((request, response, next) => canManageAcademics(request.access)
  ? next()
  : response.status(403).json({ message: 'Acesso exclusivo da gestão pedagógica.' }));

const id = z.coerce.number().int().positive();
const text = z.string().trim().min(2);
const base = z.object({ escolaId: id, anoLetivo: z.coerce.number().int().min(2020).max(2100), unidadeLetiva: z.coerce.number().int().min(1).max(4) });
const acSchema = base.extend({ semanaInicio: z.iso.date(), areaConhecimento: text, pauta: text, encaminhamentos: text, participantes: z.string().trim().optional().nullable() });
const interventionSchema = base.extend({ turmaId: id.optional().nullable(), diagnostico: text, objetivos: text, acoes: text, responsaveis: text, prazo: z.iso.date().optional().nullable(), indicadores: text, status: z.enum(['Em elaboração','Em execução','Concluído','Revisão necessária']).default('Em elaboração') });
const councilSchema = base.extend({ turmaId: id, etapa: z.enum(['Parcial','Final']), dataReuniao: z.iso.date(), diagnosticoTurma: text, estudantesDestaque: z.string().optional().nullable(), estudantesAtencao: z.string().optional().nullable(), decisoes: text, participantes: z.string().optional().nullable() });
const peiSchema = z.object({ escolaId: id, alunoId: id, anoLetivo: z.coerce.number().int().min(2020).max(2100), necessidadesEducacionais: text, potencialidades: text, barreiras: text, objetivos: text, estrategiasAdaptacoes: text, recursosAcessibilidade: z.string().optional().nullable(), avaliacaoAcompanhamento: text, profissionaisEnvolvidos: z.string().optional().nullable() });

function allowedSchool(request, escolaId) { return request.access.municipal || (request.access.escolas || []).includes(Number(escolaId)); }
function requireSchool(request, response, escolaId) { if (!allowedSchool(request, escolaId)) { response.status(403).json({ message: 'A escola informada não pertence ao seu escopo.' }); return false; } return true; }

router.get('/context', async (request, response, next) => {
  try {
    const params = request.access.municipal ? [] : [request.access.escolas || []];
    const schoolFilter = request.access.municipal ? 'TRUE' : 'e.id=ANY($1::int[])';
    const [schools, classes, students] = await Promise.all([
      pool.query(`SELECT e.id,e.nome FROM escolas e WHERE ${schoolFilter} ORDER BY e.nome`, params),
      pool.query(`SELECT t.id,t.escola_id AS "escolaId",t.nome FROM turmas t JOIN escolas e ON e.id=t.escola_id WHERE ${schoolFilter} AND t.status='Ativa' ORDER BY t.nome`, params),
      pool.query(`SELECT DISTINCT a.id,m.escola_id AS "escolaId",a.nome FROM alunos a JOIN matriculas m ON m.aluno_id=a.id AND m.status='Ativa' JOIN escolas e ON e.id=m.escola_id WHERE ${schoolFilter} ORDER BY a.nome`, params),
    ]);
    return response.json({ escolas: schools.rows, turmas: classes.rows, alunos: students.rows });
  } catch (error) { return next(error); }
});

router.get('/records', async (request, response, next) => {
  try {
    const escolaId = id.parse(request.query.escolaId); if (!requireSchool(request, response, escolaId)) return;
    const year = z.coerce.number().int().parse(request.query.anoLetivo || new Date().getFullYear());
    const [ac, interventions, councils, peis] = await Promise.all([
      pool.query(`SELECT ac.*,e.nome AS escola,u.nome AS responsavel FROM atividades_complementares ac JOIN escolas e ON e.id=ac.escola_id JOIN usuarios u ON u.id=ac.responsavel_id WHERE ac.escola_id=$1 AND ac.ano_letivo=$2 ORDER BY ac.semana_inicio DESC`,[escolaId,year]),
      pool.query(`SELECT p.*,t.nome AS turma FROM planos_intervencao_unidade p LEFT JOIN turmas t ON t.id=p.turma_id WHERE p.escola_id=$1 AND p.ano_letivo=$2 ORDER BY p.unidade_letiva DESC,p.criado_em DESC`,[escolaId,year]),
      pool.query(`SELECT c.*,t.nome AS turma,e.nome AS escola,u.nome AS responsavel FROM conselhos_classe c JOIN turmas t ON t.id=c.turma_id JOIN escolas e ON e.id=c.escola_id JOIN usuarios u ON u.id=c.responsavel_id WHERE c.escola_id=$1 AND c.ano_letivo=$2 ORDER BY c.unidade_letiva DESC,c.etapa`,[escolaId,year]),
      pool.query(`SELECT p.id,p.escola_id,p.aluno_id,p.ano_letivo,p.objetivos,p.estrategias_adaptacoes,p.avaliacao_acompanhamento,p.atualizado_em,a.nome AS aluno FROM planos_educacionais_individualizados p JOIN alunos a ON a.id=p.aluno_id WHERE p.escola_id=$1 AND p.ano_letivo=$2 ORDER BY a.nome`,[escolaId,year]),
    ]);
    return response.json({ atividadesComplementares: ac.rows, intervencoes: interventions.rows, conselhos: councils.rows, peis: peis.rows });
  } catch (error) { return next(error); }
});

router.post('/activities', async (request,response,next)=>{try{const d=acSchema.parse(request.body);if(!requireSchool(request,response,d.escolaId))return;const {rows}=await pool.query(`INSERT INTO atividades_complementares(escola_id,ano_letivo,unidade_letiva,semana_inicio,area_conhecimento,pauta,encaminhamentos,participantes,responsavel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[d.escolaId,d.anoLetivo,d.unidadeLetiva,d.semanaInicio,d.areaConhecimento,d.pauta,d.encaminhamentos,d.participantes||null,request.access.userId]);return response.status(201).json(rows[0]);}catch(error){return next(error);}});
router.post('/interventions', async (request,response,next)=>{try{const d=interventionSchema.parse(request.body);if(!requireSchool(request,response,d.escolaId))return;const {rows}=await pool.query(`INSERT INTO planos_intervencao_unidade(escola_id,turma_id,ano_letivo,unidade_letiva,diagnostico,objetivos,acoes,responsaveis,prazo,indicadores,status,responsavel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[d.escolaId,d.turmaId||null,d.anoLetivo,d.unidadeLetiva,d.diagnostico,d.objetivos,d.acoes,d.responsaveis,d.prazo||null,d.indicadores,d.status,request.access.userId]);return response.status(201).json(rows[0]);}catch(error){return next(error);}});
router.post('/councils', async (request,response,next)=>{try{const d=councilSchema.parse(request.body);if(!requireSchool(request,response,d.escolaId))return;const {rows}=await pool.query(`INSERT INTO conselhos_classe(escola_id,turma_id,ano_letivo,unidade_letiva,etapa,data_reuniao,diagnostico_turma,estudantes_destaque,estudantes_atencao,decisoes,participantes,responsavel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(turma_id,ano_letivo,unidade_letiva,etapa) DO UPDATE SET data_reuniao=EXCLUDED.data_reuniao,diagnostico_turma=EXCLUDED.diagnostico_turma,estudantes_destaque=EXCLUDED.estudantes_destaque,estudantes_atencao=EXCLUDED.estudantes_atencao,decisoes=EXCLUDED.decisoes,participantes=EXCLUDED.participantes,atualizado_em=NOW() RETURNING id`,[d.escolaId,d.turmaId,d.anoLetivo,d.unidadeLetiva,d.etapa,d.dataReuniao,d.diagnosticoTurma,d.estudantesDestaque||null,d.estudantesAtencao||null,d.decisoes,d.participantes||null,request.access.userId]);return response.status(201).json(rows[0]);}catch(error){return next(error);}});
router.post('/peis', async (request,response,next)=>{try{const d=peiSchema.parse(request.body);if(!requireSchool(request,response,d.escolaId))return;const enrollment=await pool.query(`SELECT 1 FROM matriculas WHERE aluno_id=$1 AND escola_id=$2 AND status='Ativa'`,[d.alunoId,d.escolaId]);if(!enrollment.rows[0])return response.status(400).json({message:'O estudante não possui matrícula ativa nesta escola.'});const {rows}=await pool.query(`INSERT INTO planos_educacionais_individualizados(escola_id,aluno_id,ano_letivo,necessidades_educacionais,potencialidades,barreiras,objetivos,estrategias_adaptacoes,recursos_acessibilidade,avaliacao_acompanhamento,profissionais_envolvidos,responsavel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(aluno_id,ano_letivo) DO UPDATE SET necessidades_educacionais=EXCLUDED.necessidades_educacionais,potencialidades=EXCLUDED.potencialidades,barreiras=EXCLUDED.barreiras,objetivos=EXCLUDED.objetivos,estrategias_adaptacoes=EXCLUDED.estrategias_adaptacoes,recursos_acessibilidade=EXCLUDED.recursos_acessibilidade,avaliacao_acompanhamento=EXCLUDED.avaliacao_acompanhamento,profissionais_envolvidos=EXCLUDED.profissionais_envolvidos,responsavel_id=EXCLUDED.responsavel_id,atualizado_em=NOW() RETURNING id`,[d.escolaId,d.alunoId,d.anoLetivo,d.necessidadesEducacionais,d.potencialidades,d.barreiras,d.objetivos,d.estrategiasAdaptacoes,d.recursosAcessibilidade||null,d.avaliacaoAcompanhamento,d.profissionaisEnvolvidos||null,request.access.userId]);return response.status(201).json(rows[0]);}catch(error){return next(error);}});

export default router;
