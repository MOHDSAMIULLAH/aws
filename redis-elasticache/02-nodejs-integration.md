# Node.js + Redis Integration

---

## Install

```bash
npm install ioredis
```

Use `ioredis` — it's the industry standard. Not `redis` (the official one is fine too, but ioredis has better cluster + sentinel support).

---

## Basic Connection

```js
// redis.js
const Redis = require('ioredis');

// Local development
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

// ElastiCache (production)
const redis = new Redis({
  host: process.env.REDIS_HOST, // e.g., my-cluster.abc123.use1.cache.amazonaws.com
  port: 6379,
  tls: {},                      // required for ElastiCache TLS
  password: process.env.REDIS_AUTH_TOKEN, // if AUTH token set
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 2000); // retry with backoff
  },
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error', err));

module.exports = redis;
```

---

## Core Operations in Node.js

```js
const redis = require('./redis');

// SET with TTL
await redis.set('user:1', JSON.stringify({ name: 'Sam', age: 25 }), 'EX', 60);
//                                                                    ↑     ↑
//                                                                  mode  seconds

// GET
const data = await redis.get('user:1');
const user = data ? JSON.parse(data) : null;

// DELETE
await redis.del('user:1');

// CHECK existence
const exists = await redis.exists('user:1'); // 1 = yes, 0 = no

// SET only if NOT exists (prevent race condition)
await redis.set('lock:job:42', '1', 'NX', 'EX', 10);
//                                   ↑
//                                 NX = only set if Not eXists

// Increment counter (atomic!)
await redis.incr('api:hits:today');
await redis.incrby('api:hits:today', 5);

// Hash
await redis.hset('user:1', 'name', 'Sam', 'age', '25');
const name = await redis.hget('user:1', 'name');
const all  = await redis.hgetall('user:1');

// TTL
const ttl = await redis.ttl('user:1'); // -2 = expired/gone, -1 = no TTL, N = seconds left
```

---

## Cache-Aside Pattern (Most Common)

This is the pattern you'll use 90% of the time.

```js
// services/productService.js
const redis = require('../redis');
const db    = require('../db');

const CACHE_TTL = 300; // 5 minutes

async function getProduct(id) {
  const cacheKey = `product:${id}`;

  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('CACHE HIT');
    return JSON.parse(cached);
  }

  // 2. Cache miss → hit DB
  console.log('CACHE MISS');
  const product = await db.query('SELECT * FROM products WHERE id = $1', [id]);

  if (!product) return null;

  // 3. Store in cache
  await redis.set(cacheKey, JSON.stringify(product), 'EX', CACHE_TTL);

  return product;
}

module.exports = { getProduct };
```

---

## Cache Middleware for Express

Reusable middleware — attach to any route.

```js
// middleware/cache.js
const redis = require('../redis');

function cacheMiddleware(ttlSeconds = 60) {
  return async (req, res, next) => {
    const key = `cache:${req.method}:${req.originalUrl}`;

    try {
      const cached = await redis.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      // Intercept res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        redis.set(key, JSON.stringify(data), 'EX', ttlSeconds).catch(console.error);
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.error('Cache middleware error:', err);
      next(); // fail open — don't crash the request
    }
  };
}

module.exports = cacheMiddleware;
```

```js
// routes/products.js
const express = require('express');
const cache   = require('../middleware/cache');
const { getProduct } = require('../services/productService');

const router = express.Router();

// Cache this route for 5 minutes
router.get('/products/:id', cache(300), async (req, res) => {
  const product = await getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});
```

---

## Invalidating Cache on Update/Delete

```js
// When a product is updated → bust the cache
async function updateProduct(id, data) {
  await db.query('UPDATE products SET ... WHERE id = $1', [id]);

  // Invalidate
  await redis.del(`product:${id}`);
  await redis.del(`cache:GET:/products/${id}`);
}

// Pattern delete (use carefully — O(N) scan)
async function invalidateProductList() {
  const keys = await redis.keys('cache:GET:/products*');
  if (keys.length) await redis.del(...keys);
}
```

---

## Handling Redis Failures Gracefully

Always **fail open** — if Redis is down, fall through to the DB.

```js
async function getProductSafe(id) {
  try {
    const cached = await redis.get(`product:${id}`);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.error('Redis unavailable, falling back to DB:', err.message);
    // Don't throw — just continue
  }

  // DB fallback
  const product = await db.query('SELECT * FROM products WHERE id = $1', [id]);

  try {
    await redis.set(`product:${id}`, JSON.stringify(product), 'EX', 300);
  } catch (err) {
    console.error('Redis write failed:', err.message);
  }

  return product;
}
```

---

## Environment Config

```env
# .env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_AUTH_TOKEN=
CACHE_TTL=300
```

```env
# .env.production (ElastiCache)
REDIS_HOST=my-cluster.abc123.use1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_AUTH_TOKEN=your-secret-token
CACHE_TTL=300
```

---

## Quick Checklist

- [ ] Use `ioredis` not `redis`
- [ ] Always `JSON.stringify` / `JSON.parse` for objects
- [ ] Always set TTL — never cache forever
- [ ] Fail open — Redis down should not crash your API
- [ ] Invalidate on write (update/delete)
- [ ] Never store sensitive data (passwords, tokens) in cache
- [ ] Use namespaced keys: `entity:id:field` → `product:42` or `user:5:profile`
