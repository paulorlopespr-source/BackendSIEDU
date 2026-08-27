import { pool } from '../database.js';
import { logError } from '../utils/safe-logger.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const secretFields = new Set([
  'authorization',
  'codigoDesenvolvimento',
  'codigo_hash',
  'senha_hash',
  'senha',
  'senhaAtual',
  'novaSenha',
  'senhaTemporaria',
  'codigo',
  'cpf',
  'rg',
  'email',
  'emailPessoal',
  'telefone',
  'telefoneInstitucional',
  'whatsapp',
  'endereco',
  'cidSid',
  'cid_sid',
  'comprovanteArquivo',
  'documento',
  'documentoDados',
  'token',
]);

export function sanitize(value, key = '') {
  if (secretFields.has(key)) return '[PROTEGIDO]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitize(childValue, childKey),
      ]),
    );
  }
  if (typeof value === 'string' && value.length > 500) {
    return `[CONTEÚDO PROTEGIDO — ${value.length} caracteres]`;
  }
  return value;
}

function actionFor(request) {
  if (request.originalUrl.includes('/login')) return 'LOGIN';
  if (request.originalUrl.includes('/recuperar-senha')) return 'RECUPERAR_SENHA';
  if (request.originalUrl.includes('/redefinir-senha')) return 'REDEFINIR_SENHA';
  if (request.method === 'POST') return 'CRIAR';
  if (request.method === 'PATCH' || request.method === 'PUT') return 'ALTERAR';
  if (request.method === 'DELETE') return 'EXCLUIR';
  return request.method;
}

function entityFor(request) {
  const path = request.originalUrl.split('?')[0].split('/').filter(Boolean);
  return path[1] || 'sistema';
}

export function auditMutations(request, response, next) {
  if (!mutationMethods.has(request.method)) return next();

  let responseBody;
  const originalJson = response.json.bind(response);
  response.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  response.on('finish', () => {
    const isSuccessful = response.statusCode >= 200 && response.statusCode < 300;
    const isAuthenticationAttempt = request.originalUrl.includes('/api/auth/');
    if (!isSuccessful && !isAuthenticationAttempt) return;

    const userId = request.user?.sub || responseBody?.user?.id || null;
    const recordId = responseBody?.id
      || responseBody?.user?.id
      || request.params?.id
      || null;
    const data = sanitize({
      valorAnterior: request.auditBefore ?? null,
      valorNovo: request.auditAfter ?? responseBody ?? request.body,
      entrada: request.body,
      resultado: responseBody,
      statusHttp: response.statusCode,
    });

    pool.query(`
      INSERT INTO auditoria_sistema (
        usuario_id, acao, entidade, registro_id, metodo,
        rota, dados, ip, user_agent
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
    `, [
      userId,
      `${actionFor(request)}${isSuccessful ? '' : '_FALHA'}`,
      entityFor(request),
      recordId ? String(recordId) : null,
      request.method,
      request.originalUrl.split('?')[0],
      JSON.stringify(data),
      request.ip,
      request.get('user-agent') || null,
    ]).catch((error) => logError('audit-write-failed', error));
  });

  return next();
}

