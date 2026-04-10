# Cache Invalidation Strategies + When NOT to Cache

---

## The Hard Problem

> "There are only two hard things in Computer Science: cache invalidation and naming things."
> — Phil Karlton

Why is it hard? Because you have **two sources of truth** (cache + DB), and they can drift apart.

---

## Cache Invalidation Strategies

### Strategy 1: TTL (Time-Based Expiry) — Simplest

Let the cache expire naturally after N seconds.

```js
await redis.set('product:1', JSON.stringify(product), 'EX', 300); // 5 min
```

**When to use:**
- Data that changes infrequently (product catalog, config settings)
- You can tolerate slightly stale data for N seconds
- Simple use cases

**Tradeoff:**
- Stale data window = TTL duration
- Under heavy traffic, TTL expiry causes a **cache stampede** (all misses hit DB simultaneously)

---

### Strategy 2: Delete on Write — Reliable

When data changes, immediately delete the cache key. Next read will re-populate.

```js
async function updateProduct(id, data) {
  await db.query('UPDATE products SET ... WHERE id = $1', [id]);
  await redis.del(`product:${id}`);       // ← bust specific key
  await redis.del('products:all');         // ← bust list key
}
```

**When to use:**
- Strongly consistent data (financial, inventory)
- Your write rate is low-to-moderate
- You can afford cache misses after writes

**Tradeoff:**
- After every write, the next N readers hit the DB (cold cache)

---

### Strategy 3: Write-Through — Cache Always Fresh

Update cache and DB together on every write.

```js
async function updateProduct(id, data) {
  const result = await db.query('UPDATE products SET ... WHERE id = $1 RETURNING *', [id]);
  const product = result.rows[0];

  // Write to cache immediately
  await redis.set(`product:${id}`, JSON.stringify(product), 'EX', 300);
  await redis.del('products:all'); // list needs full refresh
  return product;
}
```

**When to use:**
- High read-to-write ratio
- You need cache always warm after writes
- Low write latency is acceptable (slightly slower writes)

**Tradeoff:**
- Slightly slower writes (two operations: DB + Redis)
- Cache may store data that's never read again

---

### Strategy 4: Write-Behind (Lazy Write) — High Performance Writes

Write to cache first, asynchronously persist to DB later.

```js
async function updateProduct(id, data) {
  // Write to cache immediately (fast)
  await redis.set(`product:${id}`, JSON.stringify(data), 'EX', 300);

  // Async DB write (background job/queue)
  queue.push({ type: 'UPDATE_PRODUCT', id, data });
}
```

**When to use:**
- Very high write throughput (gaming leaderboards, analytics counters)
- You can tolerate brief inconsistency between cache and DB
- You have a reliable background worker

**Tradeoff:**
- Data loss if Redis crashes before background write completes
- More complex architecture

---

### Strategy 5: Cache-Aside (Lazy Loading) — Most Common

Only cache data when it's actually requested.

```
On Read:
  1. Check cache
  2. If miss → read DB → store in cache → return
  3. If hit  → return cache

On Write:
  → Delete cache key (let next read repopulate)
```

This is what you built in the mini project. Default choice for most APIs.

---

### Strategies Comparison

| Strategy       | Consistency | Write Speed | Read Speed | Complexity |
|----------------|-------------|-------------|------------|------------|
| TTL only       | Eventually  | Fast        | Mostly fast| Low        |
| Delete on Write| Strong      | Fast        | Slower post-write | Low |
| Write-Through  | Strong      | Slower      | Always fast| Medium     |
| Write-Behind   | Eventual    | Fastest     | Always fast| High       |
| Cache-Aside    | Eventually  | Fast        | Mostly fast| Low        |

---

### Strategy 6: Cache Stampede Prevention

When a popular key expires, thousands of requests hit the DB simultaneously.

**Problem:**
```
Key "products:all" expires at 12:00:00
12:00:00 → 500 concurrent requests → ALL go to DB → DB overwhelmed
```

**Solution 1: Probabilistic Early Expiration**
```js
async function getWithStampedeProtection(key, fetchFn, ttl) {
  const data = await redis.get(key);
  if (data) {
    const parsed = JSON.parse(data);

    // Recompute early if within last 20% of TTL
    const remainingTTL = await redis.ttl(key);
    if (remainingTTL < ttl * 0.2 && Math.random() < 0.1) {
      // 10% chance to refresh early → background refresh
      fetchFn().then(fresh => redis.set(key, JSON.stringify(fresh), 'EX', ttl));
    }
    return parsed;
  }

  const fresh = await fetchFn();
  await redis.set(key, JSON.stringify(fresh), 'EX', ttl);
  return fresh;
}
```

**Solution 2: Mutex Lock**
```js
async function getWithLock(key, fetchFn, ttl) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const lock    = await redis.set(lockKey, '1', 'NX', 'EX', 5); // 5s lock

  if (!lock) {
    // Someone else is fetching — wait and retry
    await new Promise(r => setTimeout(r, 100));
    return getWithLock(key, fetchFn, ttl);
  }

  try {
    const data = await fetchFn();
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
    return data;
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## When NOT to Use Cache

This is what separates engineers who use cache well from those who create bugs.

### 1. Frequently Changing Data

```
User's cart → changes on every add/remove
Real-time stock price → changes every second
Live chat messages → new data every 100ms
```
Caching these causes **stale reads** and confuses users.
Rule: if TTL < time to serve + render, don't bother.

---

### 2. Unique Per-User Data (Large User Base)

```
User dashboard → unique per user → cache:user:1, cache:user:2, ..., cache:user:1M
```
With 1M users, you're just moving DB memory to Redis memory.
Cache only **shared/global** data, not per-user unless it's expensive to compute.

---

### 3. Financial or Inventory-Critical Reads

```
"Do we have this item in stock before I charge the card?" → don't cache this
"Account balance before authorizing a transfer?" → never cache this
```
Stale cache can cause **overselling** or **double charges**. Always read from DB with a lock.

---

### 4. Already Fast Queries

If your DB query returns in < 5ms (indexed, simple), adding Redis:
- Adds latency for cache misses
- Adds serialization overhead
- Adds operational complexity

Profile first. Don't cache what's already fast.

---

### 5. Data That Must Be Consistent Across Services

```
Service A writes to DB
Service B reads from its own Redis cache
→ Service B sees stale data
```
In microservices, cache invalidation becomes a distributed systems problem.
Without a proper invalidation bus (e.g., pub/sub via Redis), you'll have inconsistency.

---

### 6. Compliance / Audit-Sensitive Data

If a regulation requires reading the latest value (healthcare, finance), cached reads may violate it.

---

### 7. Small Datasets

If your entire table is 500 rows, just load it into memory in Node.js on startup.
No Redis needed.

```js
// Startup: load config table into memory
let configCache = {};
async function loadConfig() {
  const result = await db.query('SELECT key, value FROM config');
  result.rows.forEach(r => configCache[r.key] = r.value);
}
```

---

## Decision Framework

```
Is the data shared across many users?  → YES → consider cache
Is the data expensive to compute/fetch? → YES → consider cache
Can you tolerate slight staleness?       → YES → use cache + TTL
Does it change more than once/TTL?      → YES → skip cache or write-through
Is it financial/inventory-critical?     → YES → NEVER cache without lock
Is the dataset tiny?                    → YES → app-level cache (JS object)
```

---

## Summary Table

| Scenario                      | Cache? | Strategy        |
|-------------------------------|--------|-----------------|
| Product catalog                | YES    | TTL + Delete on write |
| User profile (shared reads)   | YES    | TTL + Delete on write |
| Auth token                    | YES    | Write-Through   |
| Shopping cart                 | Maybe  | Short TTL or skip |
| Live stock price              | NO     | —               |
| Account balance               | NO     | —               |
| Financial transactions        | NO     | —               |
| Config/feature flags          | YES    | Long TTL + reload on deploy |
| Search results                | YES    | TTL based       |
| Session data                  | YES    | Write-Through   |
