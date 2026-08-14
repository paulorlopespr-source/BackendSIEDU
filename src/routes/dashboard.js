import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { allowMunicipalAdmin, loadAccessContext } from '../middlewares/access.js';

const router = Router();
router.use(authenticate, loadAccessContext, allowMunicipalAdmin);

async function countExistingTable(tableName) {
  const allowedTables = new Set(['alunos', 'turmas']);
  if (!allowedTables.has(tableName)) return 0;

  const exists = await pool.query(
    'SELECT to_regclass($1) AS table_name',
    [`public.${tableName}`],
  );
  if (!exists.rows[0]?.table_name) return 0;

  const result = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return result.rows[0].total;
}

router.get('/manager', async (_request, response, next) => {
  try {
    const [
      schools,
      professors,
      investment,
      financeDistribution,
      schoolRanking,
      pendingAudits,
      maintenanceAlerts,
      transport,
      users,
      students,
      classes,
      idebTrend,
      performance,
      academicTotals,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM escolas'),
      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios u
        JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
        WHERE u.ativo = TRUE AND LOWER(t.nome) LIKE '%professor%'
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(valor_alocado), 0)::float8 AS allocated,
          COALESCE((SELECT SUM(valor) FROM lancamentos_financeiros_escolares), 0)::float8 AS used
        FROM alocacoes_recursos_escolares
      `),
      pool.query(`
        SELECT categoria, COALESCE(SUM(valor_alocado), 0)::float8 AS value
        FROM alocacoes_recursos_escolares
        GROUP BY categoria
        ORDER BY value DESC
      `),
      pool.query(`
        SELECT e.id, e.nome, COALESCE(SUM(a.valor_alocado), 0)::float8 AS value
        FROM escolas e
        LEFT JOIN alocacoes_recursos_escolares a ON a.escola_id = e.id
        GROUP BY e.id, e.nome
        ORDER BY value DESC, e.nome
        LIMIT 5
      `),
      pool.query(`
        SELECT
          ar.id,
          ar.status,
          ar.justificativa,
          ar.data_reuniao,
          ar.avaliado_em,
          e.nome AS escola,
          a.categoria
        FROM auditorias_recursos_escolares ar
        JOIN alocacoes_recursos_escolares a ON a.id = ar.alocacao_id
        JOIN escolas e ON e.id = a.escola_id
        WHERE ar.id IN (
          SELECT MAX(id)
          FROM auditorias_recursos_escolares
          GROUP BY alocacao_id
        )
          AND ar.status IN ('Com pendencia', 'Reuniao solicitada')
        ORDER BY ar.avaliado_em DESC
        LIMIT 6
      `),
      pool.query(`
        SELECT
          mt.id,
          mt.status,
          mt.data_manutencao,
          mt.proxima_manutencao,
          v.prefixo AS veiculo
        FROM manutencoes_veiculos_transporte mt
        JOIN veiculos_transporte v ON v.id = mt.veiculo_id
        WHERE mt.status IN ('Agendada', 'Em andamento')
        ORDER BY mt.data_manutencao
        LIMIT 6
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM veiculos_transporte WHERE ativo) AS vehicles,
          (SELECT COUNT(*)::int FROM rotas_transporte WHERE ativo) AS routes,
          (SELECT COUNT(*)::int FROM alunos_rotas_transporte WHERE ativo) AS students,
          (SELECT COUNT(*)::int FROM manutencoes_veiculos_transporte WHERE status IN ('Agendada', 'Em andamento')) AS maintenance
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE u.ativo)::int AS active,
          COUNT(*) FILTER (WHERE u.deve_alterar_senha)::int AS first_access,
          COUNT(*) FILTER (WHERE LOWER(t.nome) LIKE '%diretor%')::int AS directors,
          COUNT(*) FILTER (WHERE LOWER(t.nome) LIKE '%coordenador%')::int AS coordinators
        FROM usuarios u
        JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      `),
      countExistingTable('alunos'),
      countExistingTable('turmas'),
      pool.query(`
        SELECT ano, ROUND(AVG(valor)::numeric,2)::float8 AS valor,
          ROUND(AVG(meta)::numeric,2)::float8 AS meta
        FROM resultados_ideb GROUP BY ano ORDER BY ano
      `),
      pool.query(`
        SELECT e.id,e.nome,
          COALESCE((SELECT ROUND(AVG(CASE WHEN df.presente THEN 100 ELSE 0 END)::numeric,2)
            FROM diario_frequencias df JOIN diarios_classe dc ON dc.id=df.diario_id
            JOIN turmas t ON t.id=dc.turma_id WHERE t.escola_id=e.id),0)::float8 AS frequencia,
          COALESCE((SELECT ROUND(AVG((na.pontos/NULLIF(ap.valor_maximo,0))*10)::numeric,2)
            FROM notas_avaliacoes na JOIN avaliacoes_professor ap ON ap.id=na.avaliacao_id
            JOIN turmas t ON t.id=ap.turma_id WHERE t.escola_id=e.id),0)::float8 AS media
        FROM escolas e ORDER BY e.nome
      `),
      pool.query(`
        SELECT
          COALESCE((SELECT ROUND(AVG(CASE WHEN df.presente THEN 100 ELSE 0 END)::numeric,2) FROM diario_frequencias df),0)::float8 AS frequencia,
          COALESCE((SELECT ROUND(AVG((na.pontos/NULLIF(ap.valor_maximo,0))*10)::numeric,2) FROM notas_avaliacoes na JOIN avaliacoes_professor ap ON ap.id=na.avaliacao_id),0)::float8 AS media,
          (SELECT COUNT(*)::int FROM planejamentos_aula WHERE status='Enviado para aprovação') AS planos_pendentes
      `),
    ]);

    const alerts = [
      ...pendingAudits.rows.map((item) => ({
        id: `audit-${item.id}`,
        type: item.status === 'Com pendencia' ? 'Pendência' : 'Reunião',
        title: item.escola,
        detail: item.justificativa,
        date: item.data_reuniao || item.avaliado_em,
        severity: item.status === 'Com pendencia' ? 'danger' : 'warning',
      })),
      ...maintenanceAlerts.rows.map((item) => ({
        id: `maintenance-${item.id}`,
        type: 'Manutenção',
        title: `Veículo ${item.veiculo}`,
        detail: item.status,
        date: item.proxima_manutencao || item.data_manutencao,
        severity: item.status === 'Em andamento' ? 'warning' : 'info',
      })),
    ].slice(0, 8);

    return response.json({
      summary: {
        schools: schools.rows[0].total,
        students,
        professors: professors.rows[0].total,
        classes,
        investment: investment.rows[0].allocated,
        spent: investment.rows[0].used,
        idebTarget: idebTrend.rows.at(-1)?.meta || 0,
        attendance: academicTotals.rows[0].frequencia,
        average: academicTotals.rows[0].media,
        pendingPlans: academicTotals.rows[0].planos_pendentes,
      },
      academic: {
        available: students > 0 || classes > 0 || idebTrend.rows.length > 0,
        ideb: idebTrend.rows,
        performance: performance.rows,
      },
      financeDistribution: financeDistribution.rows,
      schoolRanking: schoolRanking.rows,
      alerts,
      transport: transport.rows[0],
      users: users.rows[0],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
