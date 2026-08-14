import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { pool } from './database.js';
import { auditMutations } from './middlewares/audit.js';
import {
  assertSecureEnvironment,
  secureHeaders,
} from './middlewares/security.js';
import auditRouter from './routes/audit.js';
import academicRouter from './routes/academic.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import financeRouter from './routes/finance.js';
import professorRouter from './routes/professor.js';
import studentRouter from './routes/student.js';
import healthRouter from './routes/health.js';
import referenceRouter from './routes/reference.js';
import schoolsRouter from './routes/schools.js';
import transportRouter from './routes/transport.js';
import usersRouter from './routes/users.js';

const app = express();
const port = process.env.PORT || 3001;

assertSecureEnvironment();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(secureHeaders);
app.use(cors({
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem não autorizada pelo CORS.'));
  },
}));
app.use(express.json({ limit: '8mb' }));
app.use(auditMutations);

app.get('/', (_request, response) => response.json({
  name: 'SIEDU-PINDOBAÇU API',
  status: 'online',
}));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/schools', schoolsRouter);
app.use('/api/reference', referenceRouter);
app.use('/api/transport', transportRouter);
app.use('/api/finance', financeRouter);
app.use('/api/professor', professorRouter);
app.use('/api/student', studentRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/audit', auditRouter);
app.use('/api/academic', academicRouter);

app.use((_request, response) => {
  return response.status(404).json({ message: 'Rota não encontrada.' });
});

app.use((error, _request, response, _next) => {
  if (error.statusCode) {
    return response.status(error.statusCode).json({ message: error.message });
  }

  if (error.name === 'ZodError') {
    return response.status(400).json({
      message: error.issues?.[0]?.message || 'Dados inválidos.',
      errors: error.issues,
    });
  }

  if (error.code === '23505') {
    return response.status(409).json({
      message: 'Já existe um cadastro com esses dados.',
    });
  }

  if (error.message === 'Origem não autorizada pelo CORS.') {
    return response.status(403).json({ message: error.message });
  }

  console.error(error);
  return response.status(500).json({ message: 'Erro interno do servidor.' });
});

const server = app.listen(port, () => {
  console.log(`SIEDU-PINDOBAÇU API disponível em http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando o servidor com segurança.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
