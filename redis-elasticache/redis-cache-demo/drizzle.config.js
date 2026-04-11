require('dotenv').config();

/** @type { import("drizzle-kit").Config } */
module.exports = {
  schema:  './src/db/schema.js',
  out:     './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'shopdb',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl:      false,
  },
};
