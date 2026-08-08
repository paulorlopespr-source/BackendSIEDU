import pg from 'pg';
import 'dotenv/config';

if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
  throw new Error(
    'Configure DATABASE_URL ou as variáveis DATABASE_HOST, DATABASE_NAME, DATABASE_USER e DATABASE_PASSWORD.',
  );
}

const databaseSslEnabled = process.env.DATABASE_SSL
  ? process.env.DATABASE_SSL === 'true'
  : process.env.NODE_ENV === 'production';

export const pool = new pg.Pool({
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        database: process.env.DATABASE_NAME || 'siepin',
        host: process.env.DATABASE_HOST,
        password: process.env.DATABASE_PASSWORD,
        port: Number(process.env.DATABASE_PORT || 5432),
        user: process.env.DATABASE_USER || 'siepin',
      }),
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: databaseSslEnabled
    ? {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
      }
    : false,
});
