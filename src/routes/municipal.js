import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';

const router = Router();
router.use(authenticate, loadAccessContext);

const managementProfiles = new Set([
  'Super Administrador',
  'Secretário Municipal de Educação',
  'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal',
]);

function requireMunicipal(request, response, next) {
  if (!request.access?.municipal) return response.status(403).json({ message: 'Acesso exclusivo da gestão municipal.' });
  return next();
}

function requireMunicipalManagement(request, response, next) {
  if (!request.access?.municipal || !managementProfiles.has(request.access.perfil)) {
    return response.status(403).json({ message: 'Seu perfil não pode alterar registros da gestão municipal.' });
  }
  return next();
}

function schoolScope(request, alias = 'e') {
  if (request.access.municipal) return { sql: '', params: [] };
  return { sql: `WHERE ${alias}.id = ANY($1::int[])`, params: [request.access.escolas] };
}

async function consolidatedIndicators(request) {
  const scope = schoolScope(request);
  const { rows } = await pool.query(`
    SELECT e.id, e.nome, e.inep AS "codigoInep", e.localidade,
      (SELECT COUNT(*)::int FROM matriculas m WHERE m.escola_id=e.id AND m.status='Ativa') AS alunos,
      (SELECT COUNT(*)::int FROM turmas t WHERE t.escola_id=e.id AND t.status='Ativa') AS turmas,
      (SELECT COUNT(DISTINCT pe.professor_id)::int FROM professor_escolas pe WHERE pe.escola_id=e.id) AS professores,
      (SELECT COUNT(DISTINCT u.id)::int FROM usuarios u LEFT JOIN usuario_escolas ue ON ue.usuario_id=u.id
        WHERE u.ativo=TRUE AND (u.escola_id=e.id OR ue.escola_id=e.id)) AS funcionarios,
      COALESCE((SELECT ROUND(AVG(CASE WHEN df.presente THEN 100 ELSE 0 END)::numeric,2)
        FROM diario_frequencias df JOIN diarios_classe dc ON dc.id=df.diario_id JOIN turmas t ON t.id=dc.turma_id
        WHERE t.escola_id=e.id),0)::float8 AS frequencia,
      COALESCE((SELECT ROUND(AVG((na.pontos/NULLIF(ap.valor_maximo,0))*10)::numeric,2)
        FROM notas_avaliacoes na JOIN avaliacoes_professor ap ON ap.id=na.avaliacao_id JOIN turmas t ON t.id=ap.turma_id
        WHERE t.escola_id=e.id),0)::float8 AS media,
      ideb.ano AS "idebAno", ideb.valor::float8 AS ideb, ideb.meta::float8 AS "idebMeta", ideb.etapa AS "idebEtapa"
    FROM escolas e
    LEFT JOIN LATERAL (
      SELECT ano, valor, meta, etapa FROM resultados_ideb ri
      WHERE ri.escola_id=e.id ORDER BY ano DESC, importado_em DESC LIMIT 1
    ) ideb ON TRUE
    ${scope.sql}
    ORDER BY e.nome
  `, scope.params);
  return rows;
}

router.get('/overview', requireMunicipal, async (request, response, next) => {
  try {
    const [schools, demands, meetings, ideb] = await Promise.all([
      consolidatedIndicators(request),
      pool.query(`SELECT status, COUNT(*)::int AS total FROM demandas_municipais GROUP BY status`),
      pool.query(`SELECT COUNT(*)::int AS total FROM reunioes_municipais WHERE inicio>=NOW() AND status='Agendada'`),
      pool.query(`SELECT ano, ROUND(AVG(valor)::numeric,2)::float8 AS valor, ROUND(AVG(meta)::numeric,2)::float8 AS meta FROM resultados_ideb GROUP BY ano ORDER BY ano`),
    ]);
    const totals = schools.reduce((value, school) => ({
      schools: value.schools + 1,
      students: value.students + school.alunos,
      classes: value.classes + school.turmas,
      professors: value.professors + school.professores,
      employees: value.employees + school.funcionarios,
    }), { schools: 0, students: 0, classes: 0, professors: 0, employees: 0 });
    return response.json({
      totals,
      schools,
      ideb: ideb.rows,
      demands: demands.rows,
      upcomingMeetings: meetings.rows[0].total,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { return next(error); }
});

router.get('/ideb', async (request, response, next) => {
  try {
    const params = [];
    const clauses = [];
    if (!request.access.municipal) { params.push(request.access.escolas); clauses.push(`ri.escola_id=ANY($${params.length}::int[])`); }
    if (request.query.ano) { params.push(Number(request.query.ano)); clauses.push(`ri.ano=$${params.length}`); }
    const { rows } = await pool.query(`
      SELECT ri.id,ri.escola_id AS "escolaId",e.nome AS escola,ri.codigo_inep AS "codigoInep",ri.ano,ri.etapa,
        ri.valor::float8,ri.meta::float8,ri.taxa_aprovacao::float8 AS "taxaAprovacao",
        ri.aprendizado_portugues::float8 AS "aprendizadoPortugues",ri.aprendizado_matematica::float8 AS "aprendizadoMatematica",
        ri.fonte,ri.fonte_url AS "fonteUrl",ri.importado_em AS "importadoEm"
      FROM resultados_ideb ri LEFT JOIN escolas e ON e.id=ri.escola_id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY ri.ano DESC,e.nome,ri.etapa
    `, params);
    return response.json(rows);
  } catch (error) { return next(error); }
});

router.post('/ideb/import', requireMunicipalManagement, async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = z.object({ registros: z.array(z.object({
      escolaId: z.coerce.number().int().positive().nullable().optional(),
      codigoInep: z.string().trim().max(20).nullable().optional(),
      ano: z.coerce.number().int().min(2005).max(2200), etapa: z.string().trim().min(2).max(80),
      valor: z.coerce.number().min(0).max(10), meta: z.coerce.number().min(0).max(10).nullable().optional(),
      taxaAprovacao: z.coerce.number().min(0).max(100).nullable().optional(),
      aprendizadoPortugues: z.coerce.number().nonnegative().nullable().optional(),
      aprendizadoMatematica: z.coerce.number().nonnegative().nullable().optional(),
      fonte: z.string().trim().min(2).max(180).default('INEP/MEC'), fonteUrl: z.string().url().nullable().optional(),
    })).min(1).max(500) }).parse(request.body);
    await client.query('BEGIN');
    for (const item of data.registros) {
      await client.query(`
        INSERT INTO resultados_ideb(escola_id,codigo_inep,ano,etapa,valor,meta,taxa_aprovacao,aprendizado_portugues,aprendizado_matematica,fonte,fonte_url,importado_por)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT ((COALESCE(escola_id,0)),ano,etapa) DO UPDATE SET
          codigo_inep=EXCLUDED.codigo_inep,valor=EXCLUDED.valor,meta=EXCLUDED.meta,taxa_aprovacao=EXCLUDED.taxa_aprovacao,
          aprendizado_portugues=EXCLUDED.aprendizado_portugues,aprendizado_matematica=EXCLUDED.aprendizado_matematica,
          fonte=EXCLUDED.fonte,fonte_url=EXCLUDED.fonte_url,importado_por=EXCLUDED.importado_por,importado_em=NOW()
      `,[item.escolaId||null,item.codigoInep||null,item.ano,item.etapa,item.valor,item.meta??null,item.taxaAprovacao??null,item.aprendizadoPortugues??null,item.aprendizadoMatematica??null,item.fonte,item.fonteUrl||null,request.access.userId]);
    }
    await client.query('COMMIT');
    return response.status(201).json({ message: `${data.registros.length} registro(s) do IDEB importado(s).`, total: data.registros.length });
  } catch (error) { await client.query('ROLLBACK'); return next(error); } finally { client.release(); }
});

router.get('/meetings', async (request, response, next) => {
  try {
    const params = [];
    let where = '';
    if (!request.access.municipal) { params.push(request.access.escolas); where=`WHERE (r.escola_id IS NULL OR r.escola_id=ANY($1::int[]))`; }
    const { rows } = await pool.query(`SELECT r.id,r.titulo,r.tipo,r.escola_id AS "escolaId",e.nome AS escola,r.inicio,r.fim,r.local,r.link_virtual AS "linkVirtual",r.pauta,r.participantes,r.status,u.nome AS "criadoPor" FROM reunioes_municipais r LEFT JOIN escolas e ON e.id=r.escola_id LEFT JOIN usuarios u ON u.id=r.criado_por ${where} ORDER BY r.inicio DESC`,params);
    return response.json(rows);
  } catch (error) { return next(error); }
});

router.post('/meetings', requireMunicipalManagement, async (request, response, next) => {
  try {
    const data=z.object({titulo:z.string().trim().min(3),tipo:z.string().trim().min(2),escolaId:z.coerce.number().int().positive().nullable().optional(),inicio:z.string().datetime(),fim:z.string().datetime().nullable().optional(),local:z.string().trim().nullable().optional(),linkVirtual:z.string().url().nullable().optional(),pauta:z.string().trim().min(5),participantes:z.string().trim().nullable().optional()}).parse(request.body);
    const {rows}=await pool.query(`INSERT INTO reunioes_municipais(titulo,tipo,escola_id,inicio,fim,local,link_virtual,pauta,participantes,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[data.titulo,data.tipo,data.escolaId||null,data.inicio,data.fim||null,data.local||null,data.linkVirtual||null,data.pauta,data.participantes||null,request.access.userId]);
    return response.status(201).json({id:rows[0].id,message:'Reunião incluída na agenda municipal.'});
  } catch(error){return next(error);}
});

router.patch('/meetings/:id/status', requireMunicipalManagement, async (request,response,next)=>{
  try{const id=z.coerce.number().int().positive().parse(request.params.id);const {status}=z.object({status:z.enum(['Agendada','Realizada','Cancelada'])}).parse(request.body);const {rows}=await pool.query('UPDATE reunioes_municipais SET status=$1,atualizado_em=NOW() WHERE id=$2 RETURNING id,status',[status,id]);if(!rows[0])return response.status(404).json({message:'Reunião não encontrada.'});return response.json(rows[0]);}catch(error){return next(error);}
});

router.get('/demands', async (request,response,next)=>{
  try{const params=[];let where='';if(!request.access.municipal){params.push(request.access.escolas);where='WHERE d.escola_id=ANY($1::int[])';}const {rows}=await pool.query(`SELECT d.id,d.escola_id AS "escolaId",e.nome AS escola,d.titulo,d.categoria,d.descricao,d.prioridade,d.status,d.prazo,d.responsavel_id AS "responsavelId",ur.nome AS responsavel,uc.nome AS "criadoPor",d.criado_em AS "criadoEm",d.atualizado_em AS "atualizadoEm",COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('id',h.id,'mensagem',h.mensagem,'statusAnterior',h.status_anterior,'statusNovo',h.status_novo,'usuario',u.nome,'criadoEm',h.criado_em) ORDER BY h.criado_em) FROM historico_demandas_municipais h LEFT JOIN usuarios u ON u.id=h.usuario_id WHERE h.demanda_id=d.id),'[]'::json) AS historico FROM demandas_municipais d JOIN escolas e ON e.id=d.escola_id LEFT JOIN usuarios ur ON ur.id=d.responsavel_id LEFT JOIN usuarios uc ON uc.id=d.criado_por ${where} ORDER BY CASE d.prioridade WHEN 'Urgente' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Média' THEN 2 ELSE 3 END,d.prazo NULLS LAST,d.criado_em DESC`,params);return response.json(rows);}catch(error){return next(error);}
});

router.post('/demands', async (request,response,next)=>{
  const client=await pool.connect();try{const data=z.object({escolaId:z.coerce.number().int().positive(),titulo:z.string().trim().min(3),categoria:z.string().trim().min(2),descricao:z.string().trim().min(5),prioridade:z.enum(['Baixa','Média','Alta','Urgente']).default('Média'),prazo:z.string().date().nullable().optional(),responsavelId:z.coerce.number().int().positive().nullable().optional()}).parse(request.body);if(!request.access.municipal&&!request.access.escolas.includes(data.escolaId))return response.status(403).json({message:'Você não pode abrir demanda para esta escola.'});await client.query('BEGIN');const {rows}=await client.query(`INSERT INTO demandas_municipais(escola_id,titulo,categoria,descricao,prioridade,prazo,responsavel_id,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,[data.escolaId,data.titulo,data.categoria,data.descricao,data.prioridade,data.prazo||null,data.responsavelId||null,request.access.userId]);await client.query(`INSERT INTO historico_demandas_municipais(demanda_id,usuario_id,status_novo,mensagem) VALUES($1,$2,$3,$4)`,[rows[0].id,request.access.userId,rows[0].status,data.descricao]);await client.query('COMMIT');return response.status(201).json({id:rows[0].id,message:'Demanda registrada com sucesso.'});}catch(error){await client.query('ROLLBACK');return next(error);}finally{client.release();}
});

router.patch('/demands/:id', async (request,response,next)=>{
  const client=await pool.connect();try{const id=z.coerce.number().int().positive().parse(request.params.id);const data=z.object({status:z.enum(['Aberta','Em andamento','Aguardando escola','Aguardando Secretaria','Concluída','Cancelada']),mensagem:z.string().trim().min(3),responsavelId:z.coerce.number().int().positive().nullable().optional()}).parse(request.body);await client.query('BEGIN');const {rows}=await client.query('SELECT * FROM demandas_municipais WHERE id=$1 FOR UPDATE',[id]);const demand=rows[0];if(!demand){await client.query('ROLLBACK');return response.status(404).json({message:'Demanda não encontrada.'});}if(!request.access.municipal&&!request.access.escolas.includes(Number(demand.escola_id))){await client.query('ROLLBACK');return response.status(403).json({message:'Sem acesso a esta demanda.'});}await client.query(`UPDATE demandas_municipais SET status=$1,responsavel_id=COALESCE($2,responsavel_id),concluido_em=CASE WHEN $1='Concluída' THEN NOW() ELSE NULL END,atualizado_em=NOW() WHERE id=$3`,[data.status,data.responsavelId||null,id]);await client.query(`INSERT INTO historico_demandas_municipais(demanda_id,usuario_id,status_anterior,status_novo,mensagem) VALUES($1,$2,$3,$4,$5)`,[id,request.access.userId,demand.status,data.status,data.mensagem]);await client.query('COMMIT');return response.json({id,status:data.status,message:'Demanda atualizada.'});}catch(error){await client.query('ROLLBACK');return next(error);}finally{client.release();}
});

function csvValue(value){const text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);return `"${text.replaceAll('"','""')}"`;}
function toCsv(rows){if(!rows.length)return 'sem_registros\n';const headers=[...new Set(rows.flatMap((row)=>Object.keys(row)))];return `\uFEFF${headers.map(csvValue).join(';')}\n${rows.map((row)=>headers.map((key)=>csvValue(row[key])).join(';')).join('\n')}\n`;}

router.get('/reports/:type.csv', requireMunicipal, async (request,response,next)=>{
  try{const type=z.enum(['indicadores','ideb','funcionarios','transporte','financeiro','demandas','reunioes']).parse(request.params.type);let rows=[];
    if(type==='indicadores')rows=await consolidatedIndicators(request);
    if(type==='ideb')rows=(await pool.query(`SELECT e.nome AS escola,ri.codigo_inep,ri.ano,ri.etapa,ri.valor,ri.meta,ri.taxa_aprovacao,ri.aprendizado_portugues,ri.aprendizado_matematica,ri.fonte,ri.fonte_url FROM resultados_ideb ri LEFT JOIN escolas e ON e.id=ri.escola_id ORDER BY ri.ano DESC,e.nome`)).rows;
    if(type==='funcionarios')rows=(await pool.query(`SELECT u.nome,u.usuario,u.email,t.nome AS perfil,u.matricula_funcional,u.cargo,u.funcao_exercida,u.tipo_vinculo,u.situacao_funcional,u.situacao_acesso,COALESCE(es.escolas,'Rede Municipal') AS escolas FROM usuarios u JOIN tipos_usuarios t ON t.id=u.tipo_usuario_id LEFT JOIN LATERAL(SELECT STRING_AGG(DISTINCT e.nome,', ') AS escolas FROM escolas e LEFT JOIN usuario_escolas ue ON ue.escola_id=e.id WHERE e.id=u.escola_id OR ue.usuario_id=u.id)es ON TRUE ORDER BY u.nome`)).rows;
    if(type==='transporte')rows=(await pool.query(`SELECT r.nome AS rota,r.turno,r.origem,r.destino,r.distancia_km,v.prefixo AS veiculo,v.placa,m.nome AS motorista,m.cnh,COUNT(ar.id) FILTER(WHERE ar.ativo) AS alunos,r.ativo FROM rotas_transporte r JOIN veiculos_transporte v ON v.id=r.veiculo_id JOIN motoristas_transporte m ON m.id=r.motorista_id LEFT JOIN alunos_rotas_transporte ar ON ar.rota_id=r.id GROUP BY r.id,v.prefixo,v.placa,m.nome,m.cnh ORDER BY r.nome`)).rows;
    if(type==='financeiro')rows=(await pool.query(`SELECT e.nome AS escola,a.categoria,a.competencia,a.origem,a.finalidade,a.valor_alocado,COALESCE(SUM(l.valor),0) AS utilizado,a.valor_alocado-COALESCE(SUM(l.valor),0) AS saldo,a.status FROM alocacoes_recursos_escolares a JOIN escolas e ON e.id=a.escola_id LEFT JOIN lancamentos_financeiros_escolares l ON l.alocacao_id=a.id GROUP BY a.id,e.nome ORDER BY a.competencia DESC,e.nome`)).rows;
    if(type==='demandas')rows=(await pool.query(`SELECT e.nome AS escola,d.titulo,d.categoria,d.prioridade,d.status,d.prazo,d.descricao,u.nome AS responsavel,d.criado_em,d.concluido_em FROM demandas_municipais d JOIN escolas e ON e.id=d.escola_id LEFT JOIN usuarios u ON u.id=d.responsavel_id ORDER BY d.criado_em DESC`)).rows;
    if(type==='reunioes')rows=(await pool.query(`SELECT r.titulo,r.tipo,e.nome AS escola,r.inicio,r.fim,r.local,r.link_virtual,r.pauta,r.participantes,r.status FROM reunioes_municipais r LEFT JOIN escolas e ON e.id=r.escola_id ORDER BY r.inicio DESC`)).rows;
    await pool.query(`INSERT INTO relatorios_oficiais_emitidos(tipo,formato,filtros,emitido_por) VALUES($1,'CSV',$2::jsonb,$3)`,[type,JSON.stringify(request.query||{}),request.access.userId]);
    response.set('Content-Type','text/csv; charset=utf-8');response.set('Content-Disposition',`attachment; filename="relatorio-${type}-${new Date().toISOString().slice(0,10)}.csv"`);return response.send(toCsv(rows));
  }catch(error){return next(error);}
});

export default router;
