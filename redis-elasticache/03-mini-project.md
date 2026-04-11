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

---

## Part 2: Deploy to AWS (ElastiCache + EC2 + RDS)

Move the exact same app to AWS — swap `localhost` env vars for real AWS endpoints.

### Target Architecture

```
Internet
   │
   ▼
EC2 (Node.js API)  ──cache hit──►  ElastiCache (Redis)
        │                                  │
        │ cache miss                       │ store result
        ▼                                  │
   RDS (PostgreSQL) ──────────────────────►
```

All three live inside a **VPC**. Only EC2 has a public IP; RDS and ElastiCache are private.

---

### AWS Step 1 — Create a VPC (or use default)

> Skip if you already have a VPC with public + private subnets.

1. Go to **VPC → Your VPCs → Create VPC**
2. Name: `elasticache-demo-vpc`
3. IPv4 CIDR: `10.0.0.0/16`
4. Create **2 public subnets** (for EC2):
   - `10.0.1.0/24` in `us-east-1a`
   - `10.0.2.0/24` in `us-east-1b`
5. Create **2 private subnets** (for RDS + ElastiCache):
   - `10.0.3.0/24` in `us-east-1a`
   - `10.0.4.0/24` in `us-east-1b`
6. Attach an **Internet Gateway** to the VPC
7. Add route `0.0.0.0/0 → IGW` to the **public route table** only

---

### AWS Step 2 — Create Security Groups

Create **3 security groups** in your VPC:

#### SG-1: `sg-ec2`
| Direction | Type  | Port | Source    |
|-----------|-------|------|-----------|
| Inbound   | SSH   | 22   | Your IP   |
| Inbound   | HTTP  | 3000 | 0.0.0.0/0 |
| Outbound  | All   | All  | 0.0.0.0/0 |

#### SG-2: `sg-redis`
| Direction | Type        | Port | Source   |
|-----------|-------------|------|----------|
| Inbound   | Custom TCP  | 6379 | sg-ec2   |
| Outbound  | All         | All  | 0.0.0.0/0 |

#### SG-3: `sg-rds`
| Direction | Type        | Port | Source   |
|-----------|-------------|------|----------|
| Inbound   | PostgreSQL  | 5432 | sg-ec2   |
| Outbound  | All         | All  | 0.0.0.0/0 |

**Key rule:** Redis and RDS only accept traffic from EC2's security group — never from the internet.

---

### AWS Step 3 — Create ElastiCache (Redis)

1. Go to **ElastiCache → Get Started → Create cluster**
2. Choose **Redis OSS**
3. Configuration:
   - Cluster mode: **Disabled** (simpler for this project)
   - Name: `demo-redis`
   - Node type: `cache.t3.micro` (Free Tier eligible)
   - Number of replicas: `0` (just primary for dev)
4. **Subnet group:**
   - Create new → name: `redis-subnet-group`
   - Select your **private subnets** (`10.0.3.0/24`, `10.0.4.0/24`)
5. **Security:** attach `sg-redis`
6. Disable encryption in transit (for simplicity in dev)
7. Click **Create**
8. Wait ~5 mins. Copy the **Primary Endpoint** (looks like `demo-redis.xxxxx.cache.amazonaws.com`)

---

### AWS Step 4 — Create RDS (PostgreSQL)

1. Go to **RDS → Create database**
2. Engine: **PostgreSQL**, version 15
3. Template: **Free tier**
4. Settings:
   - DB name: `shopdb`
   - Username: `postgres`
   - Password: `yourpassword`
5. Instance: `db.t3.micro`
6. Storage: 20 GiB gp2
7. **Connectivity:**
   - VPC: your VPC
   - Subnet group: create new with private subnets
   - Public access: **No**
   - Security group: `sg-rds`
8. Click **Create database**
9. Wait ~5 mins. Copy the **Endpoint** (looks like `shopdb.xxxxx.us-east-1.rds.amazonaws.com`)

---

### AWS Step 5 — Launch EC2 (Node.js App)

1. Go to **EC2 → Launch Instance**
2. AMI: **Amazon Linux 2023**
3. Type: `t2.micro`
4. Network: your VPC, **public subnet**, auto-assign public IP: **Yes**
5. Security group: `sg-ec2`
6. Key pair: create or use existing
7. Click **Launch**

**SSH into EC2:**
```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

**Install Node.js and Git:**
```bash
# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git

# Verify
node -v && npm -v
```

---

### AWS Step 6 — Seed RDS from EC2

EC2 is inside the VPC so it can reach RDS privately.

```bash
# Install psql client
sudo dnf install -y postgresql15

# Connect to RDS (use your RDS endpoint)
psql -h shopdb.xxxxx.us-east-1.rds.amazonaws.com -U postgres -d postgres

# Inside psql:
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

\q
```

---

### AWS Step 7 — Deploy App on EC2

```bash
# Clone or copy project
git clone https://github.com/your-repo/redis-cache-demo.git
cd redis-cache-demo
npm install
```

**Create `.env` with AWS endpoints:**
```env
PORT=3000

# RDS endpoint
DB_HOST=shopdb.xxxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=shopdb
DB_USER=postgres
DB_PASSWORD=yourpassword

# ElastiCache primary endpoint (no port in the hostname)
REDIS_HOST=demo-redis.xxxxx.cache.amazonaws.com
REDIS_PORT=6379
CACHE_TTL=60
```

**Start the app:**
```bash
node src/index.js
# [Redis] Connected
# Server running on port 3000
```

---

### AWS Step 8 — Test from Your Machine

```bash
# Replace with your EC2 public IP
EC2=http://<EC2_PUBLIC_IP>:3000

# Cache miss (hits RDS)
curl $EC2/products/1
# { "source": "db", "latencyMs": 55, ... }

# Cache hit (hits ElastiCache)
curl $EC2/products/1
# { "source": "cache", "latencyMs": 3, ... }

# Stats
curl $EC2/cache/stats
# { "hits": "1", "misses": "1", "hitRate": "50.0%" }
```

---

### AWS Cost Reminder (Free Tier)

| Service      | Free Tier           | Beyond Free Tier     |
|--------------|---------------------|----------------------|
| EC2 t2.micro | 750 hrs/month       | ~$0.0116/hr          |
| RDS t3.micro | 750 hrs/month       | ~$0.017/hr           |
| ElastiCache t3.micro | Not free    | ~$0.017/hr           |

> ElastiCache has **no Free Tier** — delete the cluster after practice to avoid charges.

---

### Cleanup (Important!)

```bash
# Order matters — delete dependents first
1. ElastiCache → Delete cluster "demo-redis"
2. RDS → Delete database "shopdb" (no final snapshot needed for dev)
3. EC2 → Terminate instance
4. VPC → Delete (will also remove subnets, route tables, IGW)
```

---

### Local → AWS: What Changed

| Config      | Local              | AWS                                        |
|-------------|--------------------|--------------------------------------------|
| `REDIS_HOST`| `localhost`        | `demo-redis.xxxxx.cache.amazonaws.com`     |
| `DB_HOST`   | `localhost`        | `shopdb.xxxxx.us-east-1.rds.amazonaws.com` |
| App code    | No change          | No change                                  |

**That's it. Zero code changes — only `.env` updates.**
