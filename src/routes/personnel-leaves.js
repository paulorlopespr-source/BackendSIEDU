import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';

const router = Router();
const adminProfiles = new Set(['Super Administrador','Secretário Municipal de Educação','Técnico da Secretaria de Educação','Secretaria Administrativa da Educação']);
const technicalProfiles = new Set(['Técnico da Secretaria de Educação','Secretaria Administrativa da Educação']);
const types = ['ferias','licenca','licenca_medica','licenca_parental','afastamento_administrativo','capacitacao','outros'];
const allowedMime = new Set(['application/pdf','image/jpeg','image/png','image/webp']);

function httpError(statusCode,message){const error=new Error(message);error.statusCode=statusCode;return error;}
function decodeDocument(document){
  if(!document)return null;
  const match=/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(document.dados||'');
  if(!match||!allowedMime.has(match[1]))throw httpError(400,'Envie um documento PDF, JPG, PNG ou WebP.');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>5*1024*1024)throw httpError(400,'O documento deve ter no máximo 5 MB.');
  return {nome:String(document.nome||'documento').replace(/[\r\n"]/g,'').slice(0,255),mime:match[1],bytes};
}

const leaveSchema=z.object({
  usuarioId:z.coerce.number().int().positive(),tipo:z.enum(types),dataInicio:z.iso.date(),dataFim:z.iso.date(),retornoPrevisto:z.iso.date(),
  motivo:z.string().trim().min(5).max(2000),documento:z.object({nome:z.string().min(1).max(255),dados:z.string().min(20).max(7500000)}).nullable().optional(),
}).refine((v)=>v.dataFim>=v.dataInicio,{message:'A data final não pode ser anterior ao início.'}).refine((v)=>v.retornoPrevisto>v.dataFim,{message:'O retorno previsto deve ser posterior ao fim do afastamento.'});

function calendarDays(start,end){return Math.floor((Date.parse(`${end}T12:00:00Z`)-Date.parse(`${start}T12:00:00Z`))/86400000)+1;}
function requireMedicalDocument(data,document,existingDocument=false){
  if(data.tipo==='licenca_medica'&&!document&&!existingDocument)throw httpError(400,'Anexe o atestado médico para confirmar este afastamento.');
}
async function ensureNoOverlap(client,usuarioId,dataInicio,dataFim,excludedId=null){
  const overlap=await client.query(`SELECT 1 FROM afastamentos_funcionais WHERE usuario_id=$1 AND status='confirmado' AND ($4::bigint IS NULL OR id<>$4) AND DATERANGE(data_inicio,data_fim,'[]')&&DATERANGE($2::date,$3::date,'[]') LIMIT 1`,[usuarioId,dataInicio,dataFim,excludedId]);
  if(overlap.rowCount)throw httpError(409,'Já existe férias ou afastamento confirmado nesse período.');
}

router.use(authenticate,loadAccessContext,(request,response,next)=>adminProfiles.has(request.access?.perfil)?next():response.status(403).json({message:'Acesso exclusivo da gestão administrativa de pessoas.'}));

async function targetUser(client,id,request){
  const {rows}=await client.query(`SELECT u.id,u.nome,u.situacao_funcional,t.nivel FROM usuarios u JOIN tipos_usuarios t ON t.id=u.tipo_usuario_id WHERE u.id=$1`,[id]);
  if(!rows[0])throw httpError(404,'Funcionário não encontrado.');
  if(technicalProfiles.has(request.access.perfil)&&Number(rows[0].nivel)<=3)throw httpError(403,'A Secretaria Administrativa não pode registrar afastamentos de perfis estratégicos.');
  return rows[0];
}

router.get('/',async(request,response,next)=>{try{
  const {rows}=await pool.query(`SELECT a.id,a.usuario_id AS "usuarioId",u.nome,u.matricula_funcional AS matricula,a.tipo,a.data_inicio AS "dataInicio",a.data_fim AS "dataFim",a.retorno_previsto AS "retornoPrevisto",a.motivo,a.status,a.documento_nome AS "documentoNome",(a.data_fim-a.data_inicio+1) AS "diasCorridos",CASE WHEN a.tipo='licenca_medica' AND (a.data_fim-a.data_inicio+1)>30 THEN TRUE ELSE FALSE END AS "alertaAtestadoLongo",COALESCE(es.escolas,'Rede municipal') AS escola,
    CASE WHEN a.status='cancelado' THEN 'Cancelado' WHEN a.status='concluido' THEN 'Concluído' WHEN CURRENT_DATE<a.data_inicio THEN 'Programado' WHEN CURRENT_DATE<=a.data_fim THEN 'Em andamento' ELSE 'Retorno pendente' END AS situacao
    FROM afastamentos_funcionais a JOIN usuarios u ON u.id=a.usuario_id LEFT JOIN LATERAL(SELECT STRING_AGG(e.nome,', ' ORDER BY e.nome) AS escolas FROM usuario_escolas ue JOIN escolas e ON e.id=ue.escola_id WHERE ue.usuario_id=u.id)es ON TRUE ORDER BY a.data_inicio DESC,a.id DESC`);
  const today=new Date();today.setHours(0,0,0,0);const in15=new Date(today);in15.setDate(in15.getDate()+15);
  const active=rows.filter(i=>i.status==='confirmado'&&new Date(i.dataInicio)<=today&&new Date(i.dataFim)>=today);
  const upcoming=rows.filter(i=>i.status==='confirmado'&&new Date(i.retornoPrevisto)>today&&new Date(i.retornoPrevisto)<=in15);
  const pending=rows.filter(i=>i.status==='confirmado'&&new Date(i.dataFim)<today);
  return response.json({dados:rows,resumo:{emFerias:active.filter(i=>i.tipo==='ferias').length,afastados:active.filter(i=>i.tipo!=='ferias').length,retornosProximos:upcoming.length,pendencias:pending.length},alertas:upcoming.slice(0,8),alertasAtestadosLongos:rows.filter(i=>i.status==='confirmado'&&i.alertaAtestadoLongo)});
}catch(error){return next(error);}});

router.post('/',async(request,response,next)=>{const client=await pool.connect();try{
  const data=leaveSchema.parse(request.body);const document=decodeDocument(data.documento);requireMedicalDocument(data,document);await client.query('BEGIN');const user=await targetUser(client,data.usuarioId,request);
  await ensureNoOverlap(client,data.usuarioId,data.dataInicio,data.dataFim);
  const {rows}=await client.query(`INSERT INTO afastamentos_funcionais(usuario_id,tipo,data_inicio,data_fim,retorno_previsto,motivo,documento_nome,documento_mime,documento_tamanho,documento_bytes,criado_por,atualizado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id,status`,[data.usuarioId,data.tipo,data.dataInicio,data.dataFim,data.retornoPrevisto,data.motivo,document?.nome||null,document?.mime||null,document?.bytes.length||null,document?.bytes||null,request.user.sub]);
  await client.query(`INSERT INTO historico_afastamentos_funcionais(afastamento_id,usuario_id,acao,status_novo,dados) VALUES($1,$2,'registrado','confirmado',$3::jsonb)`,[rows[0].id,request.user.sub,JSON.stringify({tipo:data.tipo,dataInicio:data.dataInicio,dataFim:data.dataFim,retornoPrevisto:data.retornoPrevisto,documento:document?.nome||null})]);
  if(data.dataInicio<=new Date().toISOString().slice(0,10)&&data.dataFim>=new Date().toISOString().slice(0,10))await client.query(`UPDATE usuarios SET situacao_funcional=$1,atualizado_em=NOW() WHERE id=$2`,[data.tipo==='ferias'?'afastado':'licenca',user.id]);
  await client.query('COMMIT');return response.status(201).json({id:rows[0].id,diasCorridos:calendarDays(data.dataInicio,data.dataFim),alertaAtestadoLongo:data.tipo==='licenca_medica'&&calendarDays(data.dataInicio,data.dataFim)>30,message:'Férias ou afastamento registrado com sucesso.'});
}catch(error){await client.query('ROLLBACK');return next(error);}finally{client.release();}});

router.patch('/:id',async(request,response,next)=>{const client=await pool.connect();try{
  const data=leaveSchema.parse(request.body);const document=decodeDocument(data.documento);await client.query('BEGIN');
  const found=await client.query(`SELECT a.*,t.nivel FROM afastamentos_funcionais a JOIN usuarios u ON u.id=a.usuario_id JOIN tipos_usuarios t ON t.id=u.tipo_usuario_id WHERE a.id=$1 FOR UPDATE OF a`,[request.params.id]);
  if(!found.rows[0])throw httpError(404,'Registro não encontrado.');if(found.rows[0].status!=='confirmado')throw httpError(409,'Somente registros confirmados podem ser editados.');if(technicalProfiles.has(request.access.perfil)&&Number(found.rows[0].nivel)<=3)throw httpError(403,'Operação não autorizada para perfil estratégico.');
  if(Number(data.usuarioId)!==Number(found.rows[0].usuario_id))throw httpError(400,'O funcionário do registro não pode ser alterado.');
  requireMedicalDocument(data,document,Boolean(found.rows[0].documento_bytes));await ensureNoOverlap(client,found.rows[0].usuario_id,data.dataInicio,data.dataFim,Number(request.params.id));
  await client.query(`UPDATE afastamentos_funcionais SET tipo=$1,data_inicio=$2,data_fim=$3,retorno_previsto=$4,motivo=$5,documento_nome=COALESCE($6,documento_nome),documento_mime=COALESCE($7,documento_mime),documento_tamanho=COALESCE($8,documento_tamanho),documento_bytes=COALESCE($9,documento_bytes),atualizado_por=$10,atualizado_em=NOW() WHERE id=$11`,[data.tipo,data.dataInicio,data.dataFim,data.retornoPrevisto,data.motivo,document?.nome||null,document?.mime||null,document?.bytes.length||null,document?.bytes||null,request.user.sub,request.params.id]);
  await client.query(`INSERT INTO historico_afastamentos_funcionais(afastamento_id,usuario_id,acao,status_anterior,status_novo,dados) VALUES($1,$2,'editado',$3,$3,$4::jsonb)`,[request.params.id,request.user.sub,found.rows[0].status,JSON.stringify({anterior:{tipo:found.rows[0].tipo,dataInicio:found.rows[0].data_inicio,dataFim:found.rows[0].data_fim,retornoPrevisto:found.rows[0].retorno_previsto},novo:{tipo:data.tipo,dataInicio:data.dataInicio,dataFim:data.dataFim,retornoPrevisto:data.retornoPrevisto},documentoAtualizado:Boolean(document)})]);
  const today=new Date().toISOString().slice(0,10);const active=data.dataInicio<=today&&data.dataFim>=today;await client.query(`UPDATE usuarios SET situacao_funcional=$1,atualizado_em=NOW() WHERE id=$2`,[active?(data.tipo==='ferias'?'afastado':'licenca'):'ativo',found.rows[0].usuario_id]);
  await client.query('COMMIT');const diasCorridos=calendarDays(data.dataInicio,data.dataFim);return response.json({id:Number(request.params.id),diasCorridos,alertaAtestadoLongo:data.tipo==='licenca_medica'&&diasCorridos>30,message:'Período atualizado com sucesso.'});
}catch(error){await client.query('ROLLBACK');return next(error);}finally{client.release();}});

router.patch('/:id/status',async(request,response,next)=>{const client=await pool.connect();try{
  const {status}=z.object({status:z.enum(['concluido','cancelado'])}).parse(request.body);await client.query('BEGIN');
  const found=await client.query(`SELECT a.*,t.nivel FROM afastamentos_funcionais a JOIN usuarios u ON u.id=a.usuario_id JOIN tipos_usuarios t ON t.id=u.tipo_usuario_id WHERE a.id=$1 FOR UPDATE OF a`,[request.params.id]);
  if(!found.rows[0])throw httpError(404,'Registro não encontrado.');if(technicalProfiles.has(request.access.perfil)&&Number(found.rows[0].nivel)<=3)throw httpError(403,'Operação não autorizada para perfil estratégico.');
  await client.query(`UPDATE afastamentos_funcionais SET status=$1,atualizado_por=$2,atualizado_em=NOW() WHERE id=$3`,[status,request.user.sub,request.params.id]);
  await client.query(`INSERT INTO historico_afastamentos_funcionais(afastamento_id,usuario_id,acao,status_anterior,status_novo) VALUES($1,$2,$3,$4,$3)`,[request.params.id,request.user.sub,status,found.rows[0].status]);
  const another=await client.query(`SELECT 1 FROM afastamentos_funcionais WHERE usuario_id=$1 AND id<>$2 AND status='confirmado' AND CURRENT_DATE BETWEEN data_inicio AND data_fim LIMIT 1`,[found.rows[0].usuario_id,request.params.id]);
  if(!another.rowCount)await client.query(`UPDATE usuarios SET situacao_funcional='ativo',atualizado_em=NOW() WHERE id=$1`,[found.rows[0].usuario_id]);
  await client.query('COMMIT');return response.json({id:Number(request.params.id),status,message:'Situação atualizada com sucesso.'});
}catch(error){await client.query('ROLLBACK');return next(error);}finally{client.release();}});

router.get('/:id/document',async(request,response,next)=>{try{const {rows}=await pool.query(`SELECT documento_nome,documento_mime,documento_bytes FROM afastamentos_funcionais WHERE id=$1`,[request.params.id]);if(!rows[0]?.documento_bytes)throw httpError(404,'Documento não encontrado.');response.set('Content-Type',rows[0].documento_mime);response.set('Content-Disposition',`attachment; filename="${rows[0].documento_nome}"`);response.set('Cache-Control','private, no-store');return response.send(rows[0].documento_bytes);}catch(error){return next(error);}});

export default router;
