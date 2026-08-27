import jwt from 'jsonwebtoken';

import { pool } from '../database.js';

export async function authenticate(request, response, next) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return response.status(401).json({ message: 'Token de acesso não informado.' });
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Pragma', 'no-cache');
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'siepin-web',
      issuer: 'siepin-api',
    });
    const { rows } = await pool.query(
      'SELECT ativo, situacao_acesso, versao_sessao FROM usuarios WHERE id = $1 LIMIT 1',
      [user.sub],
    );
    const current = rows[0];
    if (!current || !current.ativo || current.situacao_acesso !== 'ativo'
      || Number(current.versao_sessao) !== Number(user.versaoSessao || 0)) {
      return response.status(401).json({ message: 'Sessão revogada. Entre novamente.' });
    }
    request.user = user;
    return next();
  } catch {
    return response.status(401).json({ message: 'Token inválido ou expirado.' });
  }
}

export function allowMunicipalAdmin(request, response, next) {
  if (request.user.nivel > 2) return response.status(403).json({ message: 'Acesso exclusivo do Gestor/Secretário de Educação.' });
  return next();
}

