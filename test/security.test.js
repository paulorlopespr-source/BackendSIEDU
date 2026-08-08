import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSecureEnvironment,
  createRateLimiter,
  secureHeaders,
} from '../src/middlewares/security.js';

function createResponse() {
  return {
    headers: {},
    body: null,
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('adiciona cabeçalhos defensivos às respostas', () => {
  const response = createResponse();
  let nextCalled = false;

  secureHeaders({}, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.headers['X-Frame-Options'], 'DENY');
  assert.match(response.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('bloqueia requisições após exceder o limite', () => {
  const limiter = createRateLimiter({ max: 2, windowMs: 60_000, name: 'teste' });
  const request = { ip: '127.0.0.1' };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = createResponse();
    let nextCalled = false;
    limiter(request, response, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  }

  const blockedResponse = createResponse();
  limiter(request, blockedResponse, () => {});
  assert.equal(blockedResponse.statusCode, 429);
  assert.match(blockedResponse.body.message, /Muitas tentativas/);
});

test('rejeita uma chave JWT fraca no modo de produção', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;

  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'curta';
  assert.throws(assertSecureEnvironment, /pelo menos 32 caracteres/);

  process.env.JWT_SECRET = 'chave-segura-com-mais-de-32-caracteres-123';
  assert.doesNotThrow(assertSecureEnvironment);

  process.env.NODE_ENV = previousEnvironment;
  process.env.JWT_SECRET = previousSecret;
});
