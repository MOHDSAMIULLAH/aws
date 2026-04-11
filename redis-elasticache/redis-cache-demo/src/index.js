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
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List all cache keys ────────────────────────────────────────
app.get('/cache/keys', async (req, res) => {
  try {
    const keys = await redis.keys('*');
    res.json({ count: keys.length, keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Flush all cache (dev only) ─────────────────────────────────
app.delete('/cache', async (req, res) => {
  try {
    await redis.flushall();
    res.json({ message: 'Cache flushed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ───────────────────────────────────────────────
app.get('/health', async (req, res) => {
  let redisOk = false;
  try { await redis.ping(); redisOk = true; } catch (_) {}

  res.json({
    status:    'ok',
    redis:     redisOk ? 'connected' : 'disconnected',
    port:      process.env.PORT,
    redisHost: process.env.REDIS_HOST,
    dbHost:    process.env.DB_HOST,
  });
});

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nServer running on port ${PORT}`);
  console.log(`  Redis : ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log(`  DB    : ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);
});
