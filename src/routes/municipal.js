import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import {
  canCreateSchoolDemand,
  canDecideSchoolDemand,
  canExecuteSchoolDemand,
  statusForAdministration,
  statusForSecretaryDecision,
  urgencyColor,
} from '../demand-workflow.js';
import {
  decodeDemandAttachment,
  demandAttachmentDisposition,
} from '../demand-attachments.js';

const router = Router();
router.use(authenticate, loadAccessContext);

const managementProfiles = new Set([
  'Super Administrador',
  'Secretário Municipal de Educação',
  'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal',
]);
const administrativeProfiles = new Set([
  'Técnico da Secretaria de Educação',
  'Secretaria Administrativa da Educação',
]);

function hasMunicipalScope(request) {
  return Boolean(request.access?.municipal || managementProfiles.has(request.access?.perfil));
}

function requireAdministrativeOverview(request, response, next) {
  if (!hasMunicipalScope(request) && !administrativeProfiles.has(request.access?.perfil)) {
    return response.status(403).json({ message: 'Acesso exclusivo da gestão administrativa municipal.' });
  }
  return next();
}

function requireMunicipal(request, response, next) {
  if (!hasMunicipalScope(request)) return response.status(403).json({ message: 'Acesso exclusivo da gestão municipal.' });
  return next();
}

function requireMunicipalManagement(request, response, next) {
  if (!managementProfiles.has(request.access?.perfil)) {
    return response.status(403).json({ message: 'Seu perfil não pode alterar registros da gestão municipal.' });
  }
  return next();
}

function schoolScope(request, alias = 'e') {
  if (hasMunicipalScope(request)) return { sql: '', params: [] };
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

router.get('/overview', requireAdministrativeOverview, async (request, response, next) => {
  try {
    const [schools, demands, meetings, ideb, employees] = await Promise.all([
      consolidatedIndicators(request),
      pool.query(`SELECT status, COUNT(*)::int AS total FROM demandas_municipais GROUP BY status`),
      pool.query(`SELECT COUNT(*)::int AS total FROM reunioes_municipais WHERE inicio>=NOW() AND status='Agendada'`),
      pool.query(`SELECT ano, ROUND(AVG(valor)::numeric,2)::float8 AS valor, ROUND(AVG(meta)::numeric,2)::float8 AS meta FROM resultados_ideb GROUP BY ano ORDER BY ano`),
      pool.query(`SELECT COUNT(*)::int AS total FROM usuarios WHERE ativo=TRUE AND COALESCE(situacao_funcional,'ativo')='ativo'`),
    ]);
    const totals = schools.reduce((value, school) => ({
      schools: value.schools + 1,
      students: value.students + school.alunos,
      classes: value.classes + school.turmas,
      professors: value.professors + school.professores,
      employees: value.employees + school.funcionarios,
    }), { schools: 0, students: 0, classes: 0, professors: 0, employees: 0 });
    totals.employees = employees.rows[0].total;
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

router.get('/ideb/analysis', requireMunicipal, async (request, response, next) => {
  try {
    const currentYear = new Date().getFullYear();
    const periodStart = currentYear - 11;
    const { rows } = await pool.query(`
      WITH network_results AS (
        SELECT ano, etapa,
          COALESCE(
            MAX(valor) FILTER (WHERE escola_id IS NULL),
            ROUND(AVG(valor) FILTER (WHERE escola_id IS NOT NULL)::numeric, 2)
          )::float8 AS valor,
          COALESCE(
            MAX(meta) FILTER (WHERE escola_id IS NULL),
            ROUND(AVG(meta) FILTER (WHERE escola_id IS NOT NULL)::numeric, 2)
          )::float8 AS meta,
          COALESCE(
            MAX(fonte) FILTER (WHERE escola_id IS NULL),
            'Média das escolas da rede'
          ) AS fonte,
          MAX(fonte_url) FILTER (WHERE escola_id IS NULL) AS "fonteUrl"
        FROM resultados_ideb
        WHERE ano BETWEEN $1 AND $2
        GROUP BY ano, etapa
      )
      SELECT ano, etapa, valor, meta, fonte, "fonteUrl"
      FROM network_results
      WHERE valor IS NOT NULL
      ORDER BY ano, etapa
    `, [periodStart, currentYear]);

    const stages = [...new Set(rows.map((item) => item.etapa))];
    const summaries = [];
    const series = stages.map((stage) => {
      const results = rows.filter((item) => item.etapa === stage);
      const first = results[0];
      const latest = results.at(-1);
      const previous = results.at(-2);
      summaries.push({
        stage,
        firstYear: first?.ano || null,
        firstValue: first?.valor ?? null,
        latestYear: latest?.ano || null,
        latestValue: latest?.valor ?? null,
        decennialVariation: first && latest ? Number((latest.valor - first.valor).toFixed(2)) : null,
        lastCycleVariation: previous && latest ? Number((latest.valor - previous.valor).toFixed(2)) : null,
        targetReached: latest?.meta == null ? null : latest.valor >= latest.meta,
      });
      return {
        stage,
        values: results.map((item) => ({
          year: item.ano,
          value: item.valor,
          target: item.meta,
          source: item.fonte,
          sourceUrl: item.fonteUrl,
        })),
      };
    });

    return response.json({
      currentSchoolYear: currentYear,
      periodStart,
      periodEnd: currentYear,
      latestOfficialYear: rows.length ? Math.max(...rows.map((item) => item.ano)) : null,
      periodicity: 'bienal',
      series,
      summaries,
      source: 'INEP/MEC e IBGE',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { return next(error); }
});

router.get('/ideb', async (request, response, next) => {
  try {
    const params = [];
    const clauses = [];
    if (!hasMunicipalScope(request)) { params.push(request.access.escolas); clauses.push(`ri.escola_id=ANY($${params.length}::int[])`); }
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
    if (!hasMunicipalScope(request)) { params.push(request.access.escolas); where=`WHERE (r.escola_id IS NULL OR r.escola_id=ANY($1::int[]))`; }
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

function demandVisibility(access) {
  if (canDecideSchoolDemand(access)) return { sql: '', params: [] };
  if (canExecuteSchoolDemand(access)) {
    return {
      sql: `WHERE d.status IN ('Autorizada para execução','Pendente na Administração','Demanda resolvida')`,
      params: [],
    };
  }
  if (canCreateSchoolDemand(access)) {
    return { sql: 'WHERE d.escola_id=ANY($1::int[])', params: [access.escolas || []] };
  }
  return null;
}

router.get('/demands', async (request, response, next) => {
  try {
    const visibility = demandVisibility(request.access);
    if (!visibility) return response.status(403).json({ message: 'Seu perfil não participa do fluxo de demandas escolares.' });
    const { rows } = await pool.query(`
      SELECT d.id,d.escola_id AS "escolaId",e.nome AS escola,d.titulo,d.categoria,d.descricao,
        d.prioridade,d.status,d.prazo,d.responsavel_id AS "responsavelId",ur.nome AS responsavel,
        uc.nome AS "criadoPor",ua.nome AS "autorizadoPor",ue.nome AS "executadoPor",
        d.autorizado_em AS "autorizadoEm",d.resolvido_em AS "resolvidoEm",
        d.criado_em AS "criadoEm",d.atualizado_em AS "atualizadoEm",
        COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT(
          'id',h.id,'mensagem',h.mensagem,'statusAnterior',h.status_anterior,
          'statusNovo',h.status_novo,'usuario',u.nome,'criadoEm',h.criado_em
        ) ORDER BY h.criado_em) FROM historico_demandas_municipais h
          LEFT JOIN usuarios u ON u.id=h.usuario_id WHERE h.demanda_id=d.id),'[]'::json) AS historico,
        COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT(
          'id',a.id,'nome',a.nome_arquivo,'mime',a.mime,'tamanho',a.tamanho,'criadoEm',a.criado_em
        ) ORDER BY a.criado_em) FROM anexos_demandas_municipais a
          WHERE a.demanda_id=d.id),'[]'::json) AS anexos
      FROM demandas_municipais d
      JOIN escolas e ON e.id=d.escola_id
      LEFT JOIN usuarios ur ON ur.id=d.responsavel_id
      LEFT JOIN usuarios uc ON uc.id=d.criado_por
      LEFT JOIN usuarios ua ON ua.id=d.autorizado_por
      LEFT JOIN usuarios ue ON ue.id=d.executado_por
      ${visibility.sql}
      ORDER BY CASE d.prioridade WHEN 'Alta' THEN 0 WHEN 'Normal' THEN 1 ELSE 2 END,
        CASE WHEN d.status='Demanda resolvida' THEN 1 ELSE 0 END,d.criado_em DESC
    `, visibility.params);
    return response.json(rows);
  } catch (error) { return next(error); }
});

router.post('/demands', async (request, response, next) => {
  if (!canCreateSchoolDemand(request.access)) {
    return response.status(403).json({ message: 'Somente a Direção Escolar pode enviar novas demandas.' });
  }
  const client = await pool.connect();
  try {
    const data = z.object({
      escolaId: z.coerce.number().int().positive(),
      titulo: z.string().trim().min(3).max(180),
      categoria: z.enum(['Patrimônio', 'Material ou insumo', 'Infraestrutura', 'Tecnologia', 'Material didático', 'Manutenção', 'Outro']),
      descricao: z.string().trim().min(10).max(5000),
      prioridade: z.enum(['Baixa', 'Normal', 'Alta']),
      prazo: z.string().date().nullable().optional(),
      anexo: z.object({
        nome: z.string().trim().min(1).max(255),
        dados: z.string().min(1).max(7_000_000),
      }).nullable().optional(),
    }).parse(request.body);
    if (!(request.access.escolas || []).includes(data.escolaId)) {
      return response.status(403).json({ message: 'Você não pode abrir demanda para esta escola.' });
    }
    let attachment;
    try {
      attachment = decodeDemandAttachment(data.anexo);
    } catch (attachmentError) {
      return response.status(400).json({ message: attachmentError.message });
    }
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO demandas_municipais(escola_id,titulo,categoria,descricao,prioridade,prazo,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status
    `, [data.escolaId, data.titulo, data.categoria, data.descricao, data.prioridade, data.prazo || null, request.access.userId]);
    if (attachment) {
      await client.query(`
        INSERT INTO anexos_demandas_municipais(demanda_id,nome_arquivo,mime,tamanho,conteudo,enviado_por)
        VALUES($1,$2,$3,$4,$5,$6)
      `, [rows[0].id, attachment.nome, attachment.mime, attachment.bytes.length, attachment.bytes, request.access.userId]);
    }
    await client.query(`INSERT INTO historico_demandas_municipais(demanda_id,usuario_id,status_novo,mensagem) VALUES($1,$2,$3,$4)`, [rows[0].id, request.access.userId, rows[0].status, `Demanda enviada pela Direção: ${data.descricao}`]);
    await client.query(`INSERT INTO notificacoes_demandas(demanda_id,destinatario_setor,titulo,mensagem,cor) VALUES($1,'Secretaria de Educação',$2,$3,$4)`, [rows[0].id, `Nova demanda: ${data.titulo}`, `${data.prioridade} · ${data.categoria}`, urgencyColor(data.prioridade)]);
    await client.query('COMMIT');
    return response.status(201).json({ id: rows[0].id, status: rows[0].status, message: 'Demanda enviada à Secretaria de Educação.' });
  } catch (error) { await client.query('ROLLBACK'); return next(error); } finally { client.release(); }
});

router.get('/demands/:demandId/attachments/:attachmentId', async (request, response, next) => {
  try {
    const demandId = z.coerce.number().int().positive().parse(request.params.demandId);
    const attachmentId = z.coerce.number().int().positive().parse(request.params.attachmentId);
    const { rows } = await pool.query(`
      SELECT a.nome_arquivo,a.mime,a.conteudo,d.escola_id,d.status
      FROM anexos_demandas_municipais a
      JOIN demandas_municipais d ON d.id=a.demanda_id
      WHERE a.id=$1 AND a.demanda_id=$2
    `, [attachmentId, demandId]);
    const item = rows[0];
    if (!item) return response.status(404).json({ message: 'Anexo não encontrado.' });

    const allowed = canDecideSchoolDemand(request.access)
      || (canExecuteSchoolDemand(request.access) && ['Autorizada para execução', 'Pendente na Administração', 'Demanda resolvida'].includes(item.status))
      || (canCreateSchoolDemand(request.access) && (request.access.escolas || []).includes(Number(item.escola_id)));
    if (!allowed) return response.status(403).json({ message: 'Sem permissão para baixar este anexo.' });

    response.set('Content-Type', item.mime || 'application/octet-stream');
    response.set('Content-Disposition', demandAttachmentDisposition(item.nome_arquivo));
    response.set('Cache-Control', 'private, no-store');
    return response.send(item.conteudo);
  } catch (error) { return next(error); }
});

router.post('/demands/:id/decision', async (request, response, next) => {
  if (!canDecideSchoolDemand(request.access)) {
    return response.status(403).json({ message: 'Somente a Secretaria de Educação pode autorizar demandas.' });
  }
  const client = await pool.connect();
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const data = z.object({ acao: z.enum(['autorizar', 'analisar', 'pendente']), mensagem: z.string().trim().min(3).max(3000) }).parse(request.body);
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM demandas_municipais WHERE id=$1 FOR UPDATE', [id]);
    const demand = rows[0];
    if (!demand) { await client.query('ROLLBACK'); return response.status(404).json({ message: 'Demanda não encontrada.' }); }
    const status = statusForSecretaryDecision(demand.status, data.acao);
    if (!status) { await client.query('ROLLBACK'); return response.status(409).json({ message: 'Esta demanda não está mais aguardando decisão da Secretaria.' }); }
    await client.query(`UPDATE demandas_municipais SET status=$1,autorizado_por=CASE WHEN $2='autorizar' THEN $3 ELSE autorizado_por END,autorizado_em=CASE WHEN $2='autorizar' THEN NOW() ELSE autorizado_em END,atualizado_em=NOW() WHERE id=$4`, [status, data.acao, request.access.userId, id]);
    await client.query(`INSERT INTO historico_demandas_municipais(demanda_id,usuario_id,status_anterior,status_novo,mensagem) VALUES($1,$2,$3,$4,$5)`, [id, request.access.userId, demand.status, status, data.mensagem]);
    if (data.acao === 'autorizar') {
      await client.query(`INSERT INTO notificacoes_demandas(demanda_id,destinatario_setor,titulo,mensagem,cor) VALUES($1,'Secretaria Administrativa',$2,$3,'verde')`, [id, `Execução autorizada: ${demand.titulo}`, data.mensagem]);
    }
    await client.query('COMMIT');
    return response.json({ id, status, message: data.acao === 'autorizar' ? 'Demanda autorizada e enviada à Secretaria Administrativa.' : 'Situação da demanda atualizada.' });
  } catch (error) { await client.query('ROLLBACK'); return next(error); } finally { client.release(); }
});

router.post('/demands/:id/execution', async (request, response, next) => {
  if (!canExecuteSchoolDemand(request.access)) {
    return response.status(403).json({ message: 'Somente a Secretaria Administrativa pode executar esta tarefa.' });
  }
  const client = await pool.connect();
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const data = z.object({ acao: z.enum(['pendente', 'concluir']), mensagem: z.string().trim().min(3).max(3000) }).parse(request.body);
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM demandas_municipais WHERE id=$1 FOR UPDATE', [id]);
    const demand = rows[0];
    if (!demand) { await client.query('ROLLBACK'); return response.status(404).json({ message: 'Demanda não encontrada.' }); }
    const status = statusForAdministration(demand.status, data.acao);
    if (!status) { await client.query('ROLLBACK'); return response.status(409).json({ message: 'Esta tarefa não está disponível para execução.' }); }
    await client.query(`UPDATE demandas_municipais SET status=$1,responsavel_id=$2,executado_por=$2,resolvido_em=CASE WHEN $3='concluir' THEN NOW() ELSE NULL END,concluido_em=CASE WHEN $3='concluir' THEN NOW() ELSE NULL END,atualizado_em=NOW() WHERE id=$4`, [status, request.access.userId, data.acao, id]);
    await client.query(`INSERT INTO historico_demandas_municipais(demanda_id,usuario_id,status_anterior,status_novo,mensagem) VALUES($1,$2,$3,$4,$5)`, [id, request.access.userId, demand.status, status, data.mensagem]);
    if (data.acao === 'concluir') {
      await client.query(`INSERT INTO notificacoes_demandas(demanda_id,destinatario_setor,titulo,mensagem,cor) VALUES($1,'Secretaria de Educação',$2,$3,'verde'),($1,'Direção Escolar',$2,$3,'verde')`, [id, `Demanda resolvida: ${demand.titulo}`, data.mensagem]);
      await client.query(`UPDATE notificacoes_demandas SET escola_id=$1 WHERE demanda_id=$2 AND destinatario_setor='Direção Escolar' AND escola_id IS NULL`, [demand.escola_id, id]);
    }
    await client.query('COMMIT');
    return response.json({ id, status, message: data.acao === 'concluir' ? 'Tarefa concluída e Secretaria de Educação notificada.' : 'Tarefa mantida como pendente.' });
  } catch (error) { await client.query('ROLLBACK'); return next(error); } finally { client.release(); }
});

function notificationVisibility(access) {
  if (canDecideSchoolDemand(access)) return { sql: `n.destinatario_setor='Secretaria de Educação'`, params: [] };
  if (canExecuteSchoolDemand(access)) return { sql: `n.destinatario_setor='Secretaria Administrativa'`, params: [] };
  if (canCreateSchoolDemand(access)) return { sql: `n.destinatario_setor='Direção Escolar' AND n.escola_id=ANY($1::int[])`, params: [access.escolas || []] };
  return null;
}

router.get('/demands/notifications', async (request, response, next) => {
  try {
    const visibility = notificationVisibility(request.access);
    if (!visibility) return response.status(403).json({ message: 'Seu perfil não recebe notificações deste fluxo.' });
    const { rows } = await pool.query(`SELECT n.id,n.demanda_id AS "demandaId",n.titulo,n.mensagem,n.cor,n.lida_em AS "lidaEm",n.criado_em AS "criadoEm" FROM notificacoes_demandas n WHERE ${visibility.sql} ORDER BY n.lida_em NULLS FIRST,n.criado_em DESC LIMIT 100`, visibility.params);
    return response.json(rows);
  } catch (error) { return next(error); }
});

router.patch('/demands/notifications/:id/read', async (request, response, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const visibility = notificationVisibility(request.access);
    if (!visibility) return response.status(403).json({ message: 'Seu perfil não recebe notificações deste fluxo.' });
    const params = [id, ...visibility.params];
    const shifted = visibility.sql.replaceAll('$1', '$2');
    const { rows } = await pool.query(`UPDATE notificacoes_demandas n SET lida_em=NOW() WHERE n.id=$1 AND ${shifted} RETURNING id,lida_em AS "lidaEm"`, params);
    if (!rows[0]) return response.status(404).json({ message: 'Notificação não encontrada.' });
    return response.json(rows[0]);
  } catch (error) { return next(error); }
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
