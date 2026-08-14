import { Router } from 'express';
import { pool } from '../database.js';
import { migrations } from '../migrations.js';

const router = Router();

router.get('/', async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT arquivo, aplicado_em
      FROM schema_migrations
      WHERE arquivo = ANY($1::TEXT[])
      ORDER BY aplicado_em DESC
    `, [migrations]);
    const applied = new Set(rows.map((row) => row.arquivo));
    const pending = migrations.filter((file) => !applied.has(file));
    const payload = {
      status: pending.length ? 'degraded' : 'ok',
      database: 'connected',
      migrations: {
        expected: migrations.length,
        applied: applied.size,
        pending,
        latest: rows[0]?.arquivo || null,
      },
    };
    response.status(pending.length ? 503 : 200).json(payload);
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected', migrations: { expected: migrations.length, applied: null, pending: null } });
  }
});

export default router;
