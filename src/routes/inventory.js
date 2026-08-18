import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { canAccessSchool, loadAccessContext } from '../middlewares/access.js';

const router = Router();
const adminProfiles = new Set(['Super Administrador', 'Secretário Municipal de Educação', 'Técnico da Secretaria de Educação', 'Secretaria Administrativa da Educação']);
const schoolProfiles = new Set(['Diretor', 'Vice-Diretor']);
const productSchema = z.object({ item: z.string().trim().min(2).max(180), categoria: z.string().trim().min(2).max(100), unidade: z.string().trim().min(1).max(40), quantidade: z.coerce.number().nonnegative(), estoqueMinimo: z.coerce.number().nonnegative(), localizacao: z.string().trim().min(2).max(180) });
const requestSchema = z.object({ escolaId: z.coerce.number().int().positive(), justificativa: z.string().trim().min(5).max(2000), itens: z.array(z.object({ produtoId: z.coerce.number().int().positive(), quantidade: z.coerce.number().positive() })).min(1) });
const actionSchema = z.object({ acao: z.enum(['analisar', 'autorizar', 'separar', 'entregar', 'rejeitar', 'confirmar']), observacao: z.string().trim().max(2000).nullable().optional(), itens: z.array(z.object({ produtoId: z.coerce.number().int().positive(), quantidadeAutorizada: z.coerce.number().nonnegative() })).optional() });

function fail(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; throw error; }
function isAdmin(request) { return adminProfiles.has(request.access?.perfil); }

router.use(authenticate, loadAccessContext, (request, response, next) => {
  if (isAdmin(request) || schoolProfiles.has(request.access?.perfil)) return next();
  return response.status(403).json({ message: 'Seu perfil não possui acesso ao Almoxarifado.' });
});

router.get('/', async (request, response, next) => {
  try {
    const admin = isAdmin(request);
    const schoolIds = request.access.escolas || [];
    const [products, requests, schools] = await Promise.all([
      pool.query(`SELECT id,item,categoria,unidade,quantidade,estoque_minimo AS "estoqueMinimo",localizacao,quantidade<=estoque_minimo AS "estoqueBaixo" FROM produtos_almoxarifado WHERE ativo=TRUE ORDER BY item`),
      pool.query(`SELECT s.id,s.protocolo,s.escola_id AS "escolaId",e.nome AS escola,u.nome AS solicitante,s.status,s.justificativa,s.observacao_administrativa AS "observacaoAdministrativa",s.criado_em AS "criadoEm",s.atualizado_em AS "atualizadoEm",COALESCE(JSON_AGG(JSON_BUILD_OBJECT('produtoId',i.produto_id,'item',p.item,'unidade',p.unidade,'quantidadeSolicitada',i.quantidade_solicitada,'quantidadeAutorizada',i.quantidade_autorizada) ORDER BY p.item) FILTER (WHERE i.id IS NOT NULL),'[]'::json) AS itens FROM solicitacoes_almoxarifado s JOIN escolas e ON e.id=s.escola_id LEFT JOIN usuarios u ON u.id=s.solicitante_id LEFT JOIN itens_solicitacao_almoxarifado i ON i.solicitacao_id=s.id LEFT JOIN produtos_almoxarifado p ON p.id=i.produto_id WHERE ($1::boolean OR s.escola_id=ANY($2::int[])) GROUP BY s.id,e.nome,u.nome ORDER BY s.criado_em DESC`, [admin, schoolIds]),
      pool.query(`SELECT id,nome FROM escolas WHERE status='Ativa' AND ($1::boolean OR id=ANY($2::int[])) ORDER BY nome`, [admin, schoolIds]),
    ]);
    const rows = requests.rows;
    return response.json({ produtos: products.rows, solicitacoes: rows, escolas: schools.rows, podeAdministrar: admin, resumo: { itensCadastrados: products.rowCount, estoqueBaixo: products.rows.filter((item) => item.estoqueBaixo).length, solicitacoesAbertas: rows.filter((item) => !['Confirmada', 'Rejeitada'].includes(item.status)).length, entregasPendentes: rows.filter((item) => ['Autorizada', 'Em separação', 'Entregue'].includes(item.status)).length } });
  } catch (error) { return next(error); }
});

router.post('/products', async (request, response, next) => {
  try {
    if (!isAdmin(request)) return response.status(403).json({ message: 'Somente a Secretaria Administrativa pode cadastrar produtos.' });
    const data = productSchema.parse(request.body);
    const { rows } = await pool.query(`INSERT INTO produtos_almoxarifado(item,categoria,unidade,quantidade,estoque_minimo,localizacao,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [data.item, data.categoria, data.unidade, data.quantidade, data.estoqueMinimo, data.localizacao, request.access.userId]);
    if (data.quantidade > 0) await pool.query(`INSERT INTO movimentacoes_almoxarifado(produto_id,tipo,quantidade,saldo_anterior,saldo_posterior,usuario_id,observacao) VALUES($1,'Entrada',$2,0,$2,$3,'Saldo inicial')`, [rows[0].id, data.quantidade, request.access.userId]);
    return response.status(201).json({ id: rows[0].id, message: 'Produto cadastrado no almoxarifado.' });
  } catch (error) { return next(error); }
});

router.post('/requests', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const data = requestSchema.parse(request.body);
    if (!isAdmin(request) && !canAccessSchool(request, data.escolaId)) fail(403, 'Você não possui acesso à escola selecionada.');
    if (new Set(data.itens.map((item) => item.produtoId)).size !== data.itens.length) fail(400, 'Não repita o mesmo produto na solicitação.');
    await client.query('BEGIN');
    const protocol = `ALM-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
    const { rows } = await client.query(`INSERT INTO solicitacoes_almoxarifado(protocolo,escola_id,solicitante_id,justificativa) VALUES($1,$2,$3,$4) RETURNING id`, [protocol, data.escolaId, request.access.userId, data.justificativa]);
    for (const item of data.itens) await client.query(`INSERT INTO itens_solicitacao_almoxarifado(solicitacao_id,produto_id,quantidade_solicitada) VALUES($1,$2,$3)`, [rows[0].id, item.produtoId, item.quantidade]);
    await client.query('COMMIT');
    return response.status(201).json({ id: rows[0].id, protocolo: protocol, message: 'Solicitação enviada ao Almoxarifado.' });
  } catch (error) { await client.query('ROLLBACK'); return next(error); } finally { client.release(); }
});

router.patch('/requests/:id', async (request, response, next) => {
  const client = await pool.connect();
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const data = actionSchema.parse(request.body);
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM solicitacoes_almoxarifado WHERE id=$1 FOR UPDATE', [id]);
    const current = result.rows[0];
    if (!current) fail(404, 'Solicitação não encontrada.');
    if (data.acao === 'confirmar') {
      if (isAdmin(request) || !canAccessSchool(request, current.escola_id) || current.status !== 'Entregue') fail(409, 'Esta entrega não está disponível para confirmação pela unidade escolar.');
      await client.query(`UPDATE solicitacoes_almoxarifado SET status='Confirmada',confirmado_em=NOW(),atualizado_em=NOW() WHERE id=$1`, [id]);
    } else {
      if (!isAdmin(request)) fail(403, 'Apenas a Secretaria Administrativa pode movimentar esta solicitação.');
      const allowed = { analisar: ['Solicitada', 'Em análise'], autorizar: ['Em análise'], separar: ['Autorizada'], entregar: ['Em separação'], rejeitar: ['Solicitada', 'Em análise'] };
      if (!allowed[data.acao]?.includes(current.status)) fail(409, `A ação não é permitida para uma solicitação em “${current.status}”.`);
      if (data.acao === 'autorizar') {
        if (!data.itens?.length) fail(400, 'Informe as quantidades autorizadas.');
        for (const item of data.itens) await client.query(`UPDATE itens_solicitacao_almoxarifado SET quantidade_autorizada=$1 WHERE solicitacao_id=$2 AND produto_id=$3`, [item.quantidadeAutorizada, id, item.produtoId]);
      }
      if (data.acao === 'entregar') {
        const items = await client.query(`SELECT i.produto_id,i.quantidade_autorizada,p.quantidade,p.item FROM itens_solicitacao_almoxarifado i JOIN produtos_almoxarifado p ON p.id=i.produto_id WHERE i.solicitacao_id=$1 FOR UPDATE OF p`, [id]);
        for (const item of items.rows) {
          const quantity = Number(item.quantidade_autorizada || 0), balance = Number(item.quantidade);
          if (quantity > balance) fail(409, `Estoque insuficiente para ${item.item}. Saldo atual: ${balance}.`);
          if (quantity > 0) {
            await client.query(`UPDATE produtos_almoxarifado SET quantidade=quantidade-$1,atualizado_em=NOW() WHERE id=$2`, [quantity, item.produto_id]);
            await client.query(`INSERT INTO movimentacoes_almoxarifado(produto_id,solicitacao_id,tipo,quantidade,saldo_anterior,saldo_posterior,usuario_id,observacao) VALUES($1,$2,'Saída',$3,$4,$5,$6,'Entrega para unidade escolar')`, [item.produto_id, id, quantity, balance, balance - quantity, request.access.userId]);
          }
        }
      }
      const nextStatus = { analisar: 'Em análise', autorizar: 'Autorizada', separar: 'Em separação', entregar: 'Entregue', rejeitar: 'Rejeitada' }[data.acao];
      await client.query(`UPDATE solicitacoes_almoxarifado SET status=$1,observacao_administrativa=COALESCE($2,observacao_administrativa),entregue_em=CASE WHEN $1='Entregue' THEN NOW() ELSE entregue_em END,atualizado_em=NOW() WHERE id=$3`, [nextStatus, data.observacao || null, id]);
    }
    await client.query('COMMIT');
    return response.json({ id, message: 'Solicitação atualizada com sucesso.' });
  } catch (error) { await client.query('ROLLBACK'); return next(error); } finally { client.release(); }
});

export default router;
