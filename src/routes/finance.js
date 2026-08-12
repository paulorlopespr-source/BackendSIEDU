import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import {
  allowMunicipalAdmin,
  allowSchoolStaff,
  loadAccessContext,
} from '../middlewares/access.js';

const router = Router();
router.use(authenticate, loadAccessContext);

const optionalText = z.string().trim().optional().transform((value) => value || null);

function accessibleSchoolClause(request, alias = 'a') {
  if (request.access.municipal) {
    return { sql: '', values: [] };
  }

  return {
    sql: `WHERE ${alias}.escola_id = ANY($1::int[])`,
    values: [request.access.escolas],
  };
}

function canManageSchoolFinance(request) {
  if (request.access.perfil === 'Superintendente / Diretor de Ensino') return false;
  if (request.access.municipal) return true;
  return /diretor|secretaria escolar/i.test(request.access.perfil);
}

function preventSuperintendentFinanceWrite(request, response, next) {
  if (request.access.perfil === 'Superintendente / Diretor de Ensino') {
    return response.status(403).json({
      message: 'O Superintendente possui acesso de consulta e parecer técnico, sem permissão para lançar, alocar ou aprovar recursos financeiros.',
    });
  }
  return next();
}

async function ensureSchoolAccess(request, response, schoolId) {
  const allowed = request.access.municipal
    || request.access.escolas.includes(Number(schoolId));

  if (!allowed) {
    response.status(403).json({
      message: 'Você não possui acesso financeiro a esta unidade escolar.',
    });
    return false;
  }

  return true;
}

router.get('/', allowSchoolStaff, async (request, response, next) => {
  try {
    if (!canManageSchoolFinance(request)) {
      return response.status(403).json({
        message: 'Acesso financeiro permitido somente ao Gestor, Diretor ou Secretário Escolar.',
      });
    }

    const access = accessibleSchoolClause(request);
    const schoolAccess = accessibleSchoolClause(request, 'l');
    const statementAccess = accessibleSchoolClause(request, 'p');

    const [schools, allocations, expenses, statements] = await Promise.all([
      pool.query(`
        SELECT id, nome
        FROM escolas
        ${request.access.municipal ? '' : 'WHERE id = ANY($1::int[])'}
        ORDER BY nome
      `, request.access.municipal ? [] : [request.access.escolas]),
      pool.query(`
        SELECT
          a.id,
          a.escola_id,
          e.nome AS escola,
          a.categoria,
          a.descricao,
          a.origem,
          a.finalidade,
          a.data_recebimento,
          a.competencia,
          a.valor_alocado::float8,
          COALESCE(SUM(l.valor), 0)::float8 AS valor_utilizado,
          (a.valor_alocado - COALESCE(SUM(l.valor), 0))::float8 AS saldo,
          COALESCE(aud.status, a.status) AS status,
          aud.justificativa,
          aud.data_reuniao,
          a.criado_em
        FROM alocacoes_recursos_escolares a
        JOIN escolas e ON e.id = a.escola_id
        LEFT JOIN lancamentos_financeiros_escolares l ON l.alocacao_id = a.id
        LEFT JOIN LATERAL (
          SELECT status, justificativa, data_reuniao
          FROM auditorias_recursos_escolares
          WHERE alocacao_id = a.id
          ORDER BY avaliado_em DESC
          LIMIT 1
        ) aud ON TRUE
        ${access.sql}
        GROUP BY a.id, e.nome, aud.status, aud.justificativa, aud.data_reuniao
        ORDER BY a.criado_em DESC
      `, access.values),
      pool.query(`
        SELECT
          l.id,
          l.alocacao_id,
          l.escola_id,
          e.nome AS escola,
          l.tipo,
          l.categoria,
          l.descricao,
          l.fornecedor,
          l.valor::float8,
          l.data_lancamento,
          l.numero_nota_fiscal,
          l.comprovante_arquivo,
          u.nome AS registrado_por,
          l.criado_em
        FROM lancamentos_financeiros_escolares l
        JOIN escolas e ON e.id = l.escola_id
        JOIN usuarios u ON u.id = l.criado_por
        ${schoolAccess.sql}
        ORDER BY l.data_lancamento DESC, l.id DESC
      `, schoolAccess.values),
      pool.query(`
        SELECT
          p.id,
          p.escola_id,
          e.nome AS escola,
          p.categoria,
          p.competencia,
          p.observacoes,
          p.status,
          u.nome AS enviada_por,
          p.enviada_em
        FROM prestacoes_contas_escolares p
        JOIN escolas e ON e.id = p.escola_id
        JOIN usuarios u ON u.id = p.enviada_por
        ${statementAccess.sql}
        ORDER BY p.competencia DESC, p.id DESC
      `, statementAccess.values),
    ]);

    return response.json({
      municipal: request.access.municipal,
      schools: schools.rows,
      allocations: allocations.rows,
      expenses: expenses.rows,
      statements: statements.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/allocations', allowMunicipalAdmin, preventSuperintendentFinanceWrite, async (request, response, next) => {
  try {
    const data = z.object({
      escolaId: z.coerce.number().int().positive(),
      categoria: z.enum(['Financeiro', 'Merenda Escolar']),
      descricao: z.string().trim().min(5),
      origem: z.string().trim().min(2),
      finalidade: z.string().trim().min(5),
      dataRecebimento: z.string().date(),
      competencia: z.string().regex(/^\d{4}-\d{2}$/),
      valor: z.coerce.number().positive(),
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO alocacoes_recursos_escolares (
        escola_id, categoria, descricao, origem, finalidade,
        data_recebimento, competencia, valor_alocado, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      data.escolaId,
      data.categoria,
      data.descricao,
      data.origem,
      data.finalidade,
      data.dataRecebimento,
      data.competencia,
      data.valor,
      request.access.userId,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/expenses', allowSchoolStaff, preventSuperintendentFinanceWrite, async (request, response, next) => {
  try {
    if (!canManageSchoolFinance(request)) {
      return response.status(403).json({
        message: 'Somente o Diretor, Secretário Escolar ou Gestor pode registrar despesas.',
      });
    }

    const data = z.object({
      alocacaoId: z.coerce.number().int().positive(),
      tipo: z.enum(['Despesa', 'Manutencao', 'Merenda Escolar']),
      categoria: z.string().trim().min(2),
      descricao: z.string().trim().min(5),
      fornecedor: z.string().trim().min(2),
      valor: z.coerce.number().positive(),
      dataLancamento: z.string().date(),
      numeroNotaFiscal: z.string().trim().min(2),
      comprovanteArquivo: z.string().min(10),
    }).parse(request.body);

    const allocation = await pool.query(`
      SELECT id, escola_id, categoria, valor_alocado,
        valor_alocado - COALESCE((
          SELECT SUM(valor)
          FROM lancamentos_financeiros_escolares
          WHERE alocacao_id = a.id
        ), 0) AS saldo
      FROM alocacoes_recursos_escolares a
      WHERE id = $1
    `, [data.alocacaoId]);

    const resource = allocation.rows[0];
    if (!resource) {
      return response.status(404).json({ message: 'Recurso não encontrado.' });
    }
    if (!(await ensureSchoolAccess(request, response, resource.escola_id))) return;
    if (Number(data.valor) > Number(resource.saldo)) {
      return response.status(400).json({ message: 'O valor ultrapassa o saldo disponível do recurso.' });
    }
    if (data.tipo === 'Merenda Escolar' && resource.categoria !== 'Merenda Escolar') {
      return response.status(400).json({ message: 'Selecione um recurso destinado à Merenda Escolar.' });
    }

    const { rows } = await pool.query(`
      INSERT INTO lancamentos_financeiros_escolares (
        alocacao_id, escola_id, tipo, categoria, descricao, fornecedor,
        valor, data_lancamento, numero_nota_fiscal, comprovante_arquivo, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      data.alocacaoId,
      resource.escola_id,
      data.tipo,
      data.categoria,
      data.descricao,
      data.fornecedor,
      data.valor,
      data.dataLancamento,
      data.numeroNotaFiscal,
      data.comprovanteArquivo,
      request.access.userId,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/statements', allowSchoolStaff, preventSuperintendentFinanceWrite, async (request, response, next) => {
  try {
    if (!canManageSchoolFinance(request)) {
      return response.status(403).json({
        message: 'Somente o Diretor, Secretário Escolar ou Gestor pode enviar a prestação.',
      });
    }

    const data = z.object({
      escolaId: z.coerce.number().int().positive(),
      categoria: z.enum(['Financeiro', 'Merenda Escolar']),
      competencia: z.string().regex(/^\d{4}-\d{2}$/),
      observacoes: z.string().trim().min(10),
    }).parse(request.body);

    if (!(await ensureSchoolAccess(request, response, data.escolaId))) return;

    const { rows } = await pool.query(`
      INSERT INTO prestacoes_contas_escolares (
        escola_id, categoria, competencia, observacoes, enviada_por
      ) VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [
      data.escolaId,
      data.categoria,
      data.competencia,
      data.observacoes,
      request.access.userId,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/allocations/:id/audit', allowMunicipalAdmin, preventSuperintendentFinanceWrite, async (request, response, next) => {
  try {
    const allocationId = z.coerce.number().int().positive().parse(request.params.id);
    const data = z.object({
      status: z.enum(['Aprovado', 'Com pendencia', 'Reuniao solicitada']),
      justificativa: z.string().trim().min(10),
      dataReuniao: optionalText,
    }).parse(request.body);

    if (data.status === 'Reuniao solicitada' && !data.dataReuniao) {
      return response.status(400).json({
        message: 'Informe a data da reunião solicitada.',
      });
    }

    const exists = await pool.query(
      'SELECT id FROM alocacoes_recursos_escolares WHERE id = $1',
      [allocationId],
    );
    if (!exists.rows[0]) {
      return response.status(404).json({ message: 'Recurso não encontrado.' });
    }

    const { rows } = await pool.query(`
      INSERT INTO auditorias_recursos_escolares (
        alocacao_id, status, justificativa, data_reuniao, avaliado_por
      ) VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [
      allocationId,
      data.status,
      data.justificativa,
      data.dataReuniao,
      request.access.userId,
    ]);

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;
