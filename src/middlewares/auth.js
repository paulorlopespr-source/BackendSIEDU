import jwt from 'jsonwebtoken';

export function authenticate(request, response, next) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return response.status(401).json({ message: 'Token de acesso não informado.' });
  try {
    request.user = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'siepin-web',
      issuer: 'siepin-api',
    });
    return next();
  } catch {
    return response.status(401).json({ message: 'Token inválido ou expirado.' });
  }
}

export function allowMunicipalAdmin(request, response, next) {
  if (request.user.nivel > 2) return response.status(403).json({ message: 'Acesso exclusivo do Gestor/Secretário de Educação.' });
  return next();
}
