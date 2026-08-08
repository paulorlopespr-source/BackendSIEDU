import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { allowMunicipalAdmin, loadAccessContext } from '../middlewares/access.js';

const router = Router();
router.use(authenticate, loadAccessContext, allowMunicipalAdmin);

router.get('/', async (request, response, next) => {
  try {
    const query = z.object({
      acao: z.string().trim().optional(),
      entidade: z.string().trim().optional(),
      limite: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    const { rows } = await pool.query(`
      SELECT
        a.id, a.acao, a.entidade, a.registro_id, a.metodo, a.rota,
        a.dados, a.ip, a.criado_em, u.nome AS usuario
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE ($1::text IS NULL OR a.acao = $1)
        AND ($2::text IS NULL OR a.entidade = $2)
      ORDER BY a.criado_em DESC
      LIMIT $3
    `, [query.acao || null, query.entidade || null, query.limite]);

    return response.json(rows);
  } catch (error) {
    return next(error);
  }
});

export default router;
