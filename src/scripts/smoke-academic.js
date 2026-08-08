import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { pool } from '../database.js';

const port = 3103;
const baseUrl = `http://localhost:${port}`;

const userResult = await pool.query(`
  SELECT u.id, u.nome, t.nome AS perfil, t.nivel
  FROM usuarios u
  JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
  WHERE u.ativo = TRUE
    AND (
      t.nivel <= 2
      OR t.nome IN ('Diretor', 'Coordenador', 'Secretaria Escolar', 'Secretário Escolar')
    )
  ORDER BY
    CASE WHEN t.nome = 'Diretor' THEN 0 ELSE 1 END,
    t.nivel,
    u.id
  LIMIT 1
`);

const user = userResult.rows[0];
if (!user) {
  await pool.end();
  throw new Error('Nenhum usuário autorizado foi encontrado para o teste acadêmico.');
}

const token = jwt.sign(
  {
    sub: user.id,
    nome: user.nome,
    perfil: user.perfil,
    nivel: user.nivel,
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
  const headers = { Authorization: `Bearer ${token}` };

  const contextResponse = await fetch(`${baseUrl}/api/academic/context`, {
    headers,
  });
  const context = await contextResponse.json();
  if (!contextResponse.ok) {
    throw new Error(context.message || 'Falha ao consultar o contexto acadêmico.');
  }

  const summaryResponse = await fetch(`${baseUrl}/api/academic/summary`, { headers });
  const summary = await summaryResponse.json();
  if (!summaryResponse.ok) throw new Error(summary.message || 'Falha ao consultar o resumo acadêmico.');

  const classesResponse = await fetch(`${baseUrl}/api/academic/classes`, { headers });
  const classes = await classesResponse.json();
  if (!classesResponse.ok) throw new Error(classes.message || 'Falha ao consultar as turmas.');

  const studentsResponse = await fetch(`${baseUrl}/api/academic/students`, { headers });
  const students = await studentsResponse.json();
  if (!studentsResponse.ok) throw new Error(students.message || 'Falha ao consultar os alunos.');

  const teachersResponse = await fetch(`${baseUrl}/api/academic/teachers`, { headers });
  const teachers = await teachersResponse.json();
  if (!teachersResponse.ok) throw new Error(teachers.message || 'Falha ao consultar os professores.');

  const employeesResponse = await fetch(`${baseUrl}/api/academic/employees`, { headers });
  const employees = await employeesResponse.json();
  if (!employeesResponse.ok) throw new Error(employees.message || 'Falha ao consultar os funcionários.');

  console.log('API acadêmica autenticada: OK');
  console.log(`Perfil testado: ${user.perfil}`);
  console.log(`Unidades acessíveis: ${context.escolas.length}`);
  console.log(`Turmas ativas: ${summary.turmasAtivas}`);
  console.log(`Alunos matriculados: ${summary.alunosMatriculados}`);
  console.log(`Consulta de turmas: ${classes.length} registro(s)`);
  console.log(`Consulta de alunos: ${students.length} registro(s)`);
  console.log(`Consulta de professores: ${teachers.length} registro(s)`);
  console.log(`Consulta de funcionários: ${employees.length} registro(s)`);
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    server.once('exit', resolve);
    setTimeout(resolve, 3_000);
  });
  await pool.end();
}
