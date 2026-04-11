require('dotenv').config();
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool }    = require('pg');
const schema      = require('./schema');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => console.log('[DB] PostgreSQL connected'));
pool.on('error',   (err) => console.error('[DB] Unexpected error:', err.message));

const db = drizzle(pool, { schema });

module.exports = { db, pool };
