require('dotenv').config();
const express  = require('express');
const products = require('./routes/products');
const redis    = require('./redis');

const app = express();
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────
app.use('/products', products);

// ── Cache stats ────────────────────────────────────────────────
app.get('/cache/stats', async (req, res) => {
  const info  = await redis.info('stats');
  const lines = info.split('\r\n');

  const stat = (key) => {
    const line = lines.find(l => l.startsWith(key));
    return line ? line.split(':')[1] : '0';
  };

  const hits   = parseInt(stat('keyspace_hits'));
  const misses = parseInt(stat('keyspace_misses'));
  const total  = hits + misses;

  res.json({
    hits,
    misses,
    hitRate:   total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : 'N/A',
    evictions: parseInt(stat('evicted_keys')),
  });
});

// ── List all cache keys ────────────────────────────────────────
app.get('/cache/keys', async (req, res) => {
  const keys = await redis.keys('*');
  res.json({ count: keys.length, keys });
});

// ── Flush all cache (dev only) ─────────────────────────────────
app.delete('/cache', async (req, res) => {
  await redis.flushall();
  res.json({ message: 'Cache flushed' });
});

// ── Health check ───────────────────────────────────────────────
app.get('/health', async (req, res) => {
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch (_) {}

  res.json({
    status:  'ok',
    redis:   redisOk ? 'connected' : 'disconnected',
    port:    process.env.PORT,
    redisHost: process.env.REDIS_HOST,
    dbHost:    process.env.DB_HOST,
  });
});

// ── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nServer running on port ${PORT}`);
  console.log(`  Redis : ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log(`  DB    : ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);
});
