const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy(times) {
    const delay = Math.min(times * 100, 2000);
    console.log(`[Redis] Reconnecting... attempt ${times} (delay: ${delay}ms)`);
    return delay;
  },
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('ready',   () => console.log('[Redis] Ready'));
redis.on('error',   (err) => console.error('[Redis] Error:', err.message));
redis.on('close',   () => console.log('[Redis] Connection closed'));

module.exports = redis;
