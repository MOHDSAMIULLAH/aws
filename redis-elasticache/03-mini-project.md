# Mini Project: Cache API Responses with Redis

**What you'll build:** A Node.js REST API that caches product data from PostgreSQL in Redis. You'll see the latency difference between cache hits and misses with timestamps.

---

## Architecture

```
Client
  │
  ▼
Express API  ──cache hit──►  Redis (fast, ~1ms)
     │                           │
     │ cache miss                │ store result
     ▼                           │
PostgreSQL  ────────────────────►
```

---

## Project Structure

```
redis-cache-demo/
├── src/
│   ├── index.js          ← Express app entry
│   ├── redis.js          ← Redis client
│   ├── db.js             ← PostgreSQL client
│   ├── routes/
│   │   └── products.js   ← API routes
│   ├── services/
│   │   └── productService.js  ← Business logic + caching
│   └── middleware/
│       └── cache.js      ← Reusable cache middleware
├── .env
└── package.json
```

---

## Step 1: Init Project

```bash
mkdir redis-cache-demo && cd redis-cache-demo
npm init -y
npm install express ioredis pg dotenv
```

---

## Step 2: .env

```env
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shopdb
DB_USER=postgres
DB_PASSWORD=yourpassword

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
CACHE_TTL=60
```

---

## Step 3: Database Setup (PostgreSQL)

Run this once to seed data:

```sql
CREATE DATABASE shopdb;

\c shopdb

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  category TEXT,
  stock INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert 10 sample products
INSERT INTO products (name, price, category, stock)
SELECT
  'Product ' || i,
  (random() * 100 + 10)::NUMERIC(10,2),
  CASE (i % 3)
    WHEN 0 THEN 'Electronics'
    WHEN 1 THEN 'Clothing'
    ELSE 'Books'
  END,
  floor(random() * 200)::INT
FROM generate_series(1, 10) AS i;
```

---

## Step 4: src/db.js

```js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

module.exports = pool;
```

---

## Step 5: src/redis.js

```js
const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy(times) {
    return Math.min(times * 100, 2000);
  },
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error',   (err) => console.error('[Redis] Error:', err.message));

module.exports = redis;
```

---

## Step 6: src/services/productService.js

```js
const db    = require('../db');
const redis = require('../redis');

const TTL = parseInt(process.env.CACHE_TTL || '60');

// ── GET ALL ────────────────────────────────────────────────────
async function getAllProducts() {
  const cacheKey = 'products:all';

  const cached = await redis.get(cacheKey);
  if (cached) {
    return { source: 'cache', data: JSON.parse(cached) };
  }

  const result = await db.query('SELECT * FROM products ORDER BY id');
  await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', TTL);

  return { source: 'db', data: result.rows };
}

// ── GET BY ID ─────────────────────────────────────────────────
async function getProductById(id) {
  const cacheKey = `product:${id}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return { source: 'cache', data: JSON.parse(cached) };
  }

  const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  if (!result.rows.length) return null;

  await redis.set(cacheKey, JSON.stringify(result.rows[0]), 'EX', TTL);

  return { source: 'db', data: result.rows[0] };
}

// ── CREATE ────────────────────────────────────────────────────
async function createProduct({ name, price, category, stock }) {
  const result = await db.query(
    'INSERT INTO products (name, price, category, stock) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, price, category, stock]
  );
  const product = result.rows[0];

  // Invalidate the list cache
  await redis.del('products:all');

  return product;
}

// ── UPDATE ────────────────────────────────────────────────────
async function updateProduct(id, { name, price, category, stock }) {
  const result = await db.query(
    'UPDATE products SET name=$1, price=$2, category=$3, stock=$4 WHERE id=$5 RETURNING *',
    [name, price, category, stock, id]
  );
  if (!result.rows.length) return null;

  const product = result.rows[0];

  // Invalidate both caches
  await redis.del(`product:${id}`);
  await redis.del('products:all');

  return product;
}

// ── DELETE ────────────────────────────────────────────────────
async function deleteProduct(id) {
  const result = await db.query('DELETE FROM products WHERE id=$1 RETURNING id', [id]);
  if (!result.rows.length) return false;

  await redis.del(`product:${id}`);
  await redis.del('products:all');

  return true;
}

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct };
```

---

## Step 7: src/routes/products.js

```js
const express = require('express');
const svc     = require('../services/productService');

const router = express.Router();

// GET /products — includes cache diagnostic in response
router.get('/', async (req, res) => {
  const start  = Date.now();
  const result = await svc.getAllProducts();
  const ms     = Date.now() - start;

  res.json({
    source:   result.source,    // "cache" or "db"
    latencyMs: ms,
    count:    result.data.length,
    data:     result.data,
  });
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  const start  = Date.now();
  const result = await svc.getProductById(req.params.id);
  const ms     = Date.now() - start;

  if (!result) return res.status(404).json({ error: 'Not found' });

  res.json({
    source:    result.source,
    latencyMs: ms,
    data:      result.data,
  });
});

// POST /products
router.post('/', async (req, res) => {
  const { name, price, category, stock } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });

  const product = await svc.createProduct({ name, price, category, stock });
  res.status(201).json(product);
});

// PUT /products/:id
router.put('/:id', async (req, res) => {
  const product = await svc.updateProduct(req.params.id, req.body);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// DELETE /products/:id
router.delete('/:id', async (req, res) => {
  const deleted = await svc.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
```

---

## Step 8: src/index.js

```js
require('dotenv').config();
const express  = require('express');
const products = require('./routes/products');
const redis    = require('./redis');

const app = express();
app.use(express.json());

app.use('/products', products);

// Cache stats endpoint
app.get('/cache/stats', async (req, res) => {
  const info = await redis.info('stats');
  const lines = info.split('\r\n');

  const stat = (key) => {
    const line = lines.find(l => l.startsWith(key));
    return line ? line.split(':')[1] : '?';
  };

  res.json({
    hits:       stat('keyspace_hits'),
    misses:     stat('keyspace_misses'),
    hitRate:    `${(
      (parseInt(stat('keyspace_hits')) /
       (parseInt(stat('keyspace_hits')) + parseInt(stat('keyspace_misses')))) * 100
    ).toFixed(1)}%`,
    evictions:  stat('evicted_keys'),
  });
});

// Cache flush (dev only)
app.delete('/cache', async (req, res) => {
  await redis.flushall();
  res.json({ message: 'Cache flushed' });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
```

---

## Step 9: Run It

```bash
# Terminal 1: start Redis
redis-server

# Terminal 2: start app
node src/index.js
```

---

## Step 10: Test — See the Difference

### First call (cache miss)
```bash
curl http://localhost:3000/products/1
# Response:
# { "source": "db", "latencyMs": 45, "data": {...} }
```

### Second call (cache hit)
```bash
curl http://localhost:3000/products/1
# Response:
# { "source": "cache", "latencyMs": 2, "data": {...} }
```

**45ms → 2ms. That's the power of Redis.**

### Check cache stats
```bash
curl http://localhost:3000/cache/stats
# { "hits": "3", "misses": "1", "hitRate": "75.0%", "evictions": "0" }
```

### Update product (invalidates cache)
```bash
curl -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Product","price":99.99,"category":"Electronics","stock":50}'

# Next GET will be a cache miss → fresh from DB
```

### Flush cache
```bash
curl -X DELETE http://localhost:3000/cache
```

---

## Key Observations

| Scenario         | Latency | Source |
|------------------|---------|--------|
| First request    | ~40-80ms| DB     |
| Repeated request | ~1-3ms  | Cache  |
| After update     | ~40-80ms| DB (invalidated) |
| Cache warm again | ~1-3ms  | Cache  |

---

## Extending This Project

1. Add Redis cluster support for high load
2. Add cache warming on startup (pre-populate cache)
3. Add `/products?category=Electronics` — cache per query param
4. Use Redis Hash instead of String for product objects
5. Connect to AWS ElastiCache by changing `REDIS_HOST` in `.env`
