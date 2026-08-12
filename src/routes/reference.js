import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';

const router = Router();

const educationEmployeeProfiles = [
  'Motorista',
  'Auxiliar de Serviços Gerais',
  'Auxiliar de Vida Escolar (AVE)',
  'Secretaria Administrativa',
  'Secretaria Escolar',
  'Diretor',
  'Coordenador',
  'Professor',
];
router.use(authenticate, loadAccessContext);

router.get('/user-types', async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, nome, nivel, descricao
      FROM tipos_usuarios
      WHERE nome = ANY($1::TEXT[])
      ORDER BY nivel, nome, id
    `, [educationEmployeeProfiles]);
    response.json(rows);
  } catch (error) {
    next(error);
  }
});


router.get('/secretariats', async (_request, response, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome FROM secretarias ORDER BY nome',
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/directors', async (_request, response, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nome, u.usuario
      FROM usuarios u
      JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      WHERE u.ativo = TRUE AND LOWER(t.nome) = 'diretor'
      ORDER BY u.nome
    `);
    response.json(rows);
  } catch (error) {
    next(error);
  }
});
export default router;
