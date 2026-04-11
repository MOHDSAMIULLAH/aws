const redis = require('../redis');

const TTL = parseInt(process.env.CACHE_TTL || '60');

/**
 * Reusable cache middleware — wraps any GET route.
 *
 * Usage:
 *   router.get('/some-route', cache('my-cache-key'), handler)
 *   router.get('/user/:id',   cache((req) => `user:${req.params.id}`), handler)
 *
 * If a cached value exists, responds immediately with:
 *   { source: 'cache', latencyMs, data }
 *
 * If not cached, the next handler must call res.sendCached(data)
 * to write the DB result to cache and send the response.
 */
function cache(keyOrFn) {
  return async (req, res, next) => {
    const key = typeof keyOrFn === 'function' ? keyOrFn(req) : keyOrFn;
    const start = Date.now();

    try {
      const cached = await redis.get(key);
      if (cached) {
        return res.json({
          source:    'cache',
          latencyMs: Date.now() - start,
          data:      JSON.parse(cached),
        });
      }

      // Attach helper so route handlers can cache and respond in one call
      res.sendCached = async (data) => {
        await redis.set(key, JSON.stringify(data), 'EX', TTL);
        res.json({
          source:    'db',
          latencyMs: Date.now() - start,
          data,
        });
      };

      next();
    } catch (err) {
      console.error('[cache middleware] Redis error:', err.message);
      next(); // degrade gracefully — still serve from DB
    }
  };
}

module.exports = cache;
