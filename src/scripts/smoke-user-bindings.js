import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { pool } from '../database.js';

const port = 3104;
const baseUrl = `http://localhost:${port}`;

const adminResult = await pool.query(`
  SELECT u.id, u.nome, t.nome AS perfil, t.nivel
  FROM usuarios u
  JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
  WHERE u.ativo = TRUE AND t.nivel <= 2
  ORDER BY t.nivel, u.id
  LIMIT 1
`);
const admin = adminResult.rows[0];

if (!admin) {
  await pool.end();
  throw new Error('Nenhum gestor municipal foi encontrado para o teste.');
}

const token = jwt.sign(
  {
    sub: admin.id,
    nome: admin.nome,
    perfil: admin.perfil,
    nivel: admin.nivel,
  },
  process.env.JWT_SECRET,
  {
    algorithm: 'HS256',
    audience: 'siepin-web',
    expiresIn: '5m',
    issuer: 'siepin-api',
  },
);

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverErrors = '';
server.stderr.on('data', (chunk) => {
  serverErrors += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // O servidor ainda está iniciando.
    }
  }

  throw new Error(`A API não iniciou para o teste. ${serverErrors}`);
}

try {
  await waitForServer();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const usersResponse = await fetch(`${baseUrl}/api/users`, { headers });
  const users = await usersResponse.json();

  if (!usersResponse.ok) {
    throw new Error(users.message || 'Falha ao consultar os usuários.');
  }
  if (!users.every((user) => Array.isArray(user.escolas))) {
    throw new Error('A listagem não retornou todas as escolas por usuário.');
  }

  const director = users.find((user) => user.perfil === 'Diretor');
  const schoolsResult = await pool.query(`
    SELECT id
    FROM escolas
    ORDER BY id
    LIMIT 2
  `);

  if (director && schoolsResult.rows.length === 2) {
    const invalidResponse = await fetch(
      `${baseUrl}/api/users/${director.id}/schools`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          escolaIds: schoolsResult.rows.map((school) => school.id),
        }),
      },
    );

    if (invalidResponse.status !== 400) {
      throw new Error(
        'A API deveria impedir que um Diretor recebesse duas escolas.',
      );
    }
  }

  console.log('API de vínculos autenticada: OK');
  console.log(`Usuários consultados: ${users.length}`);
  console.log('Listagem de todas as escolas por usuário: OK');
  console.log('Limite de uma escola para Diretor: OK');
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    server.once('exit', resolve);
    setTimeout(resolve, 3_000);
  });
  await pool.end();
}
