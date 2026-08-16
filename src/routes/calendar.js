import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import {
  calendarEventSchema,
  calendarEventTypes,
  canManageSchoolCalendar,
} from '../calendar-management.js';

const router = Router();
router.use(authenticate, loadAccessContext);
router.use((request, response, next) => {
  if (!canManageSchoolCalendar(request.access)) {
    return response.status(403).json({ message: 'A gestão do calendário é exclusiva da Secretaria e da Coordenação Municipal.' });
  }
  return next();
});

async function assertDirectorSchool(request, schoolId) {
  if (request.access?.perfil !== 'Diretor') return;
  if (!schoolId) throw Object.assign(new Error('Diretor deve selecionar a escola vinculada.'), { statusCode: 403 });
  const result = await pool.query(`SELECT 1 FROM usuarios u WHERE u.id=$1 AND (u.escola_id=$2 OR EXISTS (SELECT 1 FROM usuario_escolas ue WHERE ue.usuario_id=u.id AND ue.escola_id=$2)) LIMIT 1`, [request.access.userId, schoolId]);
  if (!result.rows[0]) throw Object.assign(new Error('Diretor só pode alterar eventos da escola vinculada.'), { statusCode: 403 });
}

async function resolveDestination(data) {
  if (data.escopo === 'Rede') return { escolaId: null, turmaId: null };
  if (data.escopo === 'Escola') {
    const school = await pool.query('SELECT id FROM escolas WHERE id = $1', [data.escolaId]);
    if (!school.rows[0]) return null;
    return { escolaId: Number(data.escolaId), turmaId: null };
  }
  const schoolClass = await pool.query('SELECT id, escola_id FROM turmas WHERE id = $1 AND status = \'Ativa\'', [data.turmaId]);
  if (!schoolClass.rows[0]) return null;
  return { escolaId: Number(schoolClass.rows[0].escola_id), turmaId: Number(data.turmaId) };
}

const selectEvents = `
  SELECT e.id, e.escopo, e.escola_id AS "escolaId", es.nome AS escola,
    e.turma_id AS "turmaId", t.nome AS turma, e.titulo, e.tipo,
    e.disciplina, e.data_inicio AS "dataInicio", e.data_fim AS "dataFim",
    TO_CHAR(e.hora_inicio, 'HH24:MI') AS "horaInicio",
    TO_CHAR(e.hora_fim, 'HH24:MI') AS "horaFim",
    e.observacao, e.destaque, e.publicado,
    u.nome AS "criadoPor", e.atualizado_em AS "atualizadoEm"
  FROM eventos_calendario_escolar e
  LEFT JOIN escolas es ON es.id = e.escola_id
  LEFT JOIN turmas t ON t.id = e.turma_id
  LEFT JOIN usuarios u ON u.id = e.criado_por
`;

router.get('/management', async (request, response, next) => {
  try {
    const year = Number(request.query.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return response.status(400).json({ message: 'Ano letivo inválido.' });
    }
    const [events, schools, classes] = await Promise.all([
      pool.query(`${selectEvents}
        WHERE e.publicado = TRUE
          AND e.data_inicio <= MAKE_DATE($1, 12, 31)
          AND COALESCE(e.data_fim, e.data_inicio) >= MAKE_DATE($1, 1, 1)
        ORDER BY e.data_inicio, e.hora_inicio, e.id`, [year]),
      pool.query('SELECT id, nome FROM escolas ORDER BY nome'),
      pool.query(`SELECT t.id, t.nome, t.serie_ano AS "serieAno", t.escola_id AS "escolaId", e.nome AS escola
        FROM turmas t JOIN escolas e ON e.id = t.escola_id
        WHERE t.status = 'Ativa' ORDER BY e.nome, t.nome`),
    ]);
    return response.json({ ano: year, tipos: calendarEventTypes, eventos: events.rows, escolas: schools.rows, turmas: classes.rows });
  } catch (error) { return next(error); }
});

router.post('/events', async (request, response, next) => {
  try {
    const data = calendarEventSchema.parse(request.body);
    const destination = await resolveDestination(data);
    if (!destination) return response.status(400).json({ message: 'Escola ou turma não encontrada.' });
    await assertDirectorSchool(request, destination.escolaId);
    const { rows } = await pool.query(`
      INSERT INTO eventos_calendario_escolar (
        escopo, escola_id, turma_id, titulo, tipo, disciplina,
        data_inicio, data_fim, hora_inicio, hora_fim, observacao,
        destaque, publicado, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id
    `, [data.escopo, destination.escolaId, destination.turmaId, data.titulo,
      data.tipo, data.disciplina || null, data.dataInicio, data.dataFim,
      data.horaInicio, data.horaFim, data.observacao || null,
      data.destaque, data.publicado, request.access.userId]);
    return response.status(201).json({ id: rows[0].id, message: 'Evento publicado no calendário escolar.' });
  } catch (error) { return next(error); }
});

router.put('/events/:id', async (request, response, next) => {
  try {
    const data = calendarEventSchema.parse(request.body);
    const destination = await resolveDestination(data);
    if (!destination) return response.status(400).json({ message: 'Escola ou turma não encontrada.' });
    await assertDirectorSchool(request, destination.escolaId);
    const { rows } = await pool.query(`
      UPDATE eventos_calendario_escolar SET
        escopo=$1, escola_id=$2, turma_id=$3, titulo=$4, tipo=$5,
        disciplina=$6, data_inicio=$7, data_fim=$8, hora_inicio=$9,
        hora_fim=$10, observacao=$11, destaque=$12, publicado=$13,
        atualizado_em=NOW()
      WHERE id=$14 RETURNING id
    `, [data.escopo, destination.escolaId, destination.turmaId, data.titulo,
      data.tipo, data.disciplina || null, data.dataInicio, data.dataFim,
      data.horaInicio, data.horaFim, data.observacao || null,
      data.destaque, data.publicado, request.params.id]);
    if (!rows[0]) return response.status(404).json({ message: 'Evento não encontrado.' });
    return response.json({ id: rows[0].id, message: 'Evento do calendário atualizado.' });
  } catch (error) { return next(error); }
});

router.delete('/events/:id', async (request, response, next) => {
  try {
    if (request.access?.perfil === 'Diretor') {
      const allowed = await pool.query(`SELECT 1 FROM eventos_calendario_escolar e JOIN usuarios u ON u.id=$2 WHERE e.id=$1 AND (u.escola_id=e.escola_id OR EXISTS (SELECT 1 FROM usuario_escolas ue WHERE ue.usuario_id=u.id AND ue.escola_id=e.escola_id))`, [request.params.id, request.access.userId]);
      if (!allowed.rows[0]) return response.status(403).json({ message: 'Diretor só pode remover eventos da escola vinculada.' });
    }
    const { rows } = await pool.query(`
      UPDATE eventos_calendario_escolar
      SET publicado=FALSE, atualizado_em=NOW()
      WHERE id=$1 AND publicado=TRUE RETURNING id
    `, [request.params.id]);
    if (!rows[0]) return response.status(404).json({ message: 'Evento não encontrado.' });
    return response.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
