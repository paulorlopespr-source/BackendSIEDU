const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export function assertSecureEnvironment() {
  const secret = process.env.JWT_SECRET || '';

  if (!secret) {
    throw new Error('JWT_SECRET não foi configurada.');
  }

  if (
    process.env.NODE_ENV === 'production'
    && (secret.length < 32 || secret.includes('troque-por'))
  ) {
    throw new Error(
      'Em produção, JWT_SECRET deve ser uma chave aleatória com pelo menos 32 caracteres.',
    );
  }
}

export function secureHeaders(_request, response, next) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)',
  );
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );

  if (process.env.NODE_ENV === 'production') {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }

  return next();
}

export function createRateLimiter({
  max = 10,
  windowMs = DEFAULT_WINDOW_MS,
  name = 'geral',
} = {}) {
  const attempts = new Map();

  return function rateLimiter(request, response, next) {
    const now = Date.now();
    const identifier = request.ip || request.socket?.remoteAddress || 'desconhecido';
    const key = `${name}:${identifier}`;
    const current = attempts.get(key);

    if (!current || current.expiresAt <= now) {
      attempts.set(key, { count: 1, expiresAt: now + windowMs });
      response.setHeader('RateLimit-Limit', String(max));
      response.setHeader('RateLimit-Remaining', String(max - 1));
      return next();
    }

    current.count += 1;
    response.setHeader('RateLimit-Limit', String(max));
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, max - current.count)),
    );

    if (current.count > max) {
      response.setHeader(
        'Retry-After',
        String(Math.ceil((current.expiresAt - now) / 1000)),
      );
      return response.status(429).json({
        message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      });
    }

    return next();
  };
}
