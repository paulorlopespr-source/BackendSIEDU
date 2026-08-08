import { Router } from 'express';
import { pool } from '../database.js';

const router = Router();

router.get('/', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

export default router;
