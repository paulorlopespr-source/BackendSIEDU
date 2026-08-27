import { Router } from 'express';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { loadAccessContext } from '../middlewares/access.js';
import { isStudentProfile, studentContextSql } from '../student-access.js';

const router = Router();
router.use(authenticate, loadAccessContext);

const blockedWords = ['porra','caralho','fdp','puta','merda','matar','morte','arma','estupro','sangue'];

function textModeration(text = '') {
  const normalized = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return blockedWords.find((word) => normalized.includes(word)) || null;
}

async function studentContext(userId) {
  const { rows } = await pool.query(studentContextSql, [userId]);
  return rows[0] || null;
}

function moderatorProfile(access) {
  return access?.municipal || ['Diretor','Vice-Diretor','Coordenador Pedagógico','Coordenador Pedagógico Municipal','Professor'].includes(access?.perfil);
}

router.get('/', async (request, response, next) => {
  try {
    if (isStudentProfile(request.access)) {
      const student = await studentContext(request.access.userId);
      if (!student) return response.status(404).json({ message: 'Aluno sem matrícula ativa.' });
      await pool.query("UPDATE mural_aluno_posts SET status='Expirado' WHERE status='Publicado' AND expira_em <= NOW()");
      const { rows } = await pool.query(`
        SELECT p.id, p.texto, p.imagem_dados AS "imagemDados", p.imagem_mime AS "imagemMime",
               p.criado_em AS "criadoEm", p.expira_em AS "expiraEm", a.nome_completo AS autor
        FROM mural_aluno_posts p
        JOIN alunos a ON a.id = p.aluno_id
        WHERE p.turma_id = $1 AND p.status = 'Publicado' AND p.expira_em > NOW()
        ORDER BY p.criado_em DESC
        LIMIT 100
      `, [student.turmaId]);
      return response.json(rows);
    }

    if (!moderatorProfile(request.access)) return response.status(403).json({ message: 'Sem permissão para moderar o mural.' });
    const { rows } = await pool.query(`
      SELECT p.id, p.texto, p.imagem_dados AS "imagemDados", p.imagem_mime AS "imagemMime",
             p.status, p.motivo_moderacao AS "motivoModeracao", p.criado_em AS "criadoEm",
             p.expira_em AS "expiraEm", a.nome_completo AS autor, t.nome AS turma, e.nome AS escola
      FROM mural_aluno_posts p
      JOIN alunos a ON a.id = p.aluno_id
      JOIN turmas t ON t.id = p.turma_id
      JOIN escolas e ON e.id = p.escola_id
      WHERE ($1::BOOLEAN = TRUE OR p.escola_id = ANY($2::INTEGER[]))
      ORDER BY p.criado_em DESC
      LIMIT 200
    `, [request.access.municipal, request.access.escolas]);
    return response.json(rows);
  } catch (error) { return next(error); }
});

router.post('/', async (request, response, next) => {
  try {
    if (!isStudentProfile(request.access)) return response.status(403).json({ message: 'Somente alunos podem publicar no mural.' });
    const student = await studentContext(request.access.userId);
    if (!student) return response.status(404).json({ message: 'Aluno sem matrícula ativa.' });

    const texto = String(request.body?.texto || '').trim();
    const imagemDados = request.body?.imagemDados || null;
    const imagemMime = request.body?.imagemMime || null;
    if (!texto && !imagemDados) return response.status(400).json({ message: 'Escreva um recado ou selecione uma foto.' });
    if (texto.length > 500) return response.status(400).json({ message: 'O recado pode ter no máximo 500 caracteres.' });

    const blocked = textModeration(texto);
    if (blocked) return response.status(400).json({ message: 'O recado contém linguagem ou conteúdo não permitido.' });

    if (imagemDados) {
      if (!['image/jpeg','image/png','image/webp'].includes(imagemMime)) return response.status(400).json({ message: 'Formato de imagem não permitido.' });
      if (String(imagemDados).length > 1500000) return response.status(400).json({ message: 'A imagem é muito grande. Use uma foto de até aproximadamente 1 MB.' });
    }

    const status = imagemDados ? 'Pendente' : 'Publicado';
    const { rows } = await pool.query(`
      INSERT INTO mural_aluno_posts (aluno_id, turma_id, escola_id, texto, imagem_dados, imagem_mime, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, status, criado_em AS "criadoEm", expira_em AS "expiraEm"
    `, [student.alunoId, student.turmaId, student.escolaId, texto || null, imagemDados, imagemMime, status]);
    return response.status(201).json({ ...rows[0], message: status === 'Pendente' ? 'Foto enviada para aprovação.' : 'Recado publicado por 72 horas.' });
  } catch (error) { return next(error); }
});

router.patch('/:id/moderate', async (request, response, next) => {
  try {
    if (!moderatorProfile(request.access)) return response.status(403).json({ message: 'Sem permissão para moderar o mural.' });
    const action = request.body?.acao;
    if (!['aprovar','remover'].includes(action)) return response.status(400).json({ message: 'Ação de moderação inválida.' });
    const status = action === 'aprovar' ? 'Publicado' : 'Removido';
    const motivo = String(request.body?.motivo || '').trim() || null;
    const { rows } = await pool.query(`
      UPDATE mural_aluno_posts
      SET status=$1, motivo_moderacao=$2, moderado_por=$3, moderado_em=NOW(),
          expira_em = CASE WHEN $1='Publicado' THEN NOW() + INTERVAL '72 hours' ELSE expira_em END
      WHERE id=$4 AND ($5::BOOLEAN = TRUE OR escola_id = ANY($6::INTEGER[]))
      RETURNING id, status
    `, [status, motivo, request.access.userId, Number(request.params.id), request.access.municipal, request.access.escolas]);
    if (!rows[0]) return response.status(404).json({ message: 'Publicação não encontrada ou fora do seu escopo.' });
    return response.json(rows[0]);
  } catch (error) { return next(error); }
});

export default router;
