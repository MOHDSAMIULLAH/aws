# Redis + ElastiCache Interview Q&A

---

## Junior Level

**Q: What is Redis and why do we use it?**

Redis is an in-memory key-value store used primarily for caching. Because data lives in RAM, reads are 100-1000x faster than hitting a database. We use it to reduce database load, improve API response times, and store ephemeral data like sessions and rate limit counters.

---

**Q: What's the difference between a cache hit and a cache miss?**

A cache hit means the requested key exists in Redis, so we return it directly without touching the database. A cache miss means the key doesn't exist — we query the DB, store the result in Redis with a TTL, then return it. Hit rate should be > 80% for caching to be worthwhile.

---

**Q: What is TTL and why does it matter?**

TTL (Time To Live) is the expiry time on a Redis key. After TTL seconds, Redis automatically deletes the key. It prevents stale data from persisting indefinitely and controls memory usage. Every cached value should have a TTL — never cache forever.

---

**Q: How does Redis differ from a relational database?**

Redis stores data in RAM, supports only key-value access patterns, has no SQL, and loses data if not configured for persistence. Databases store data on disk, support complex queries, have ACID transactions, and are designed for durability. They solve different problems — Redis is a speed layer, not a replacement.

---

**Q: What data types does Redis support?**

String, Hash, List, Set, Sorted Set, and with modules: JSON, TimeSeries, HyperLogLog, Streams. For API caching, String (JSON.stringify) or Hash are most common.

---

## Mid Level

**Q: Explain cache-aside vs write-through caching.**

Cache-aside (lazy loading): read from cache first; on miss, read from DB and populate cache. Cache is only populated for data that's actually requested. Simpler and saves memory.

Write-through: on every write, update DB and cache simultaneously. Cache is always warm, but writes are slower and you might cache data that's rarely read.

Cache-aside with delete-on-write is the most common production pattern.

---

**Q: What is cache stampede and how do you prevent it?**

When a hot key expires, many concurrent requests all get a cache miss simultaneously and hammer the DB. Prevention strategies:
1. **Mutex lock** — only one request fetches from DB; others wait
2. **Probabilistic early expiration** — randomly refresh the cache before TTL ends
3. **Background refresh** — a scheduled job refreshes hot keys before they expire

---

**Q: How do you handle cache invalidation when a product is updated?**

Delete the specific cache key on write:
```js
await db.query('UPDATE products SET ... WHERE id = $1', [id]);
await redis.del(`product:${id}`);
await redis.del('products:all');
```
The next read will get a cache miss, fetch fresh data from DB, and repopulate the cache.

---

**Q: What happens if Redis is down? How should your app behave?**

Fail open — fall through to the database. Redis being unavailable should degrade performance, not cause downtime. Wrap all Redis operations in try/catch and proceed with the DB if Redis throws. Log the error, alert, but keep serving requests.

---

**Q: How do you avoid storing sensitive data in Redis?**

Never cache passwords, private keys, or payment info. Cache only non-sensitive reads. If you must cache sessions, use opaque tokens (not JWTs with user data) and ensure TLS + AUTH token is set on the Redis connection.

---

**Q: How do you key Redis entries to avoid collisions?**

Use namespaced, descriptive keys:
- `entity:id` → `product:42`
- `entity:id:field` → `user:5:profile`
- `scope:filter` → `products:category:electronics`
- `route:path` → `cache:GET:/products/42`

Consistency prevents collisions and makes pattern-based invalidation (`keys product:*`) safe.

---

## Senior / Architect Level

**Q: Walk me through how you'd design a caching layer for a 3-tier web app.**

```
Client → CDN (static/edge cache)
       → API Servers (stateless, behind ALB)
           → Redis ElastiCache (hot data: config, sessions, popular entities)
           → PostgreSQL RDS (source of truth)
```

Strategy:
- Cache popular product pages: TTL = 5 min, delete on write
- Cache user sessions: write-through, TTL = session timeout
- Cache computed aggregates (e.g., bestsellers): refresh via background job
- Never cache financial/inventory in the critical path
- Use reader endpoint for reads, primary for writes
- Multi-AZ ElastiCache for failover

---

**Q: When would you choose Redis Cluster Mode?**

When a single Redis node runs out of memory or becomes a write bottleneck. Cluster Mode shards data across multiple nodes using consistent hashing. Each shard handles a subset of keyspace. Use Cluster Mode when:
- Dataset > single node RAM (e.g., > 50GB)
- Write throughput exceeds a single primary's capacity
- You need horizontal scaling

Drawback: multi-key operations (MGET, transactions) work only within a single shard.

---

**Q: How does ElastiCache handle failover?**

With Multi-AZ enabled: if the primary node fails, ElastiCache promotes the replica in another AZ automatically, typically within 30-60 seconds. The DNS endpoint updates to point to the new primary. Your app reconnects via the same cluster endpoint — no code change needed. You lose in-flight writes during the failover window.

---

**Q: How do you handle cache invalidation in a microservices architecture?**

Each service has its own cache and the same invalidation problem multiplied. Options:
1. **Event-driven invalidation** — when Service A updates a product, it publishes to SNS/SQS; Service B consumes the event and deletes its cache key
2. **Shared Redis with namespacing** — risky (coupling) but simple for small teams
3. **Short TTLs** — accept eventual consistency; fine for most read use cases
4. **Polling/refresh** — background jobs refresh caches on a schedule

For strong consistency, event-driven invalidation is the correct architecture.

---

**Q: What metrics do you monitor for Redis in production?**

| Metric               | Alert When                     |
|----------------------|-------------------------------|
| `keyspace_hits`      | Hit rate drops below 80%       |
| `used_memory`        | > 80% of `maxmemory`           |
| `evicted_keys`       | Any evictions (wrong sizing)   |
| `connected_clients`  | Spike = connection leak        |
| `replication_lag`    | Replica falling behind primary |
| Command latency      | p99 > 1ms is suspicious        |

---

**Q: Redis is "eventually consistent" — how do you guarantee read-your-own-writes?**

After a user updates data, route their next read directly to the DB (bypass cache) for one request using a flag:

```js
async function getProduct(id, { bypassCache = false } = {}) {
  if (!bypassCache) {
    const cached = await redis.get(`product:${id}`);
    if (cached) return JSON.parse(cached);
  }

  const product = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  await redis.set(`product:${id}`, JSON.stringify(product.rows[0]), 'EX', 300);
  return product.rows[0];
}

// After update:
await updateProduct(id, data);
return getProduct(id, { bypassCache: true }); // guaranteed fresh
```

---

## Scenario Questions

**Q: Your API response time jumped from 5ms to 500ms. Redis hit rate is 20%. What happened and how do you fix it?**

Root cause: cache is cold or keys are expiring too quickly.
- Check TTL — maybe too short
- Check if a deploy flushed the cache
- Check eviction policy — if `maxmemory-policy` is `allkeys-lru`, Redis might be evicting under memory pressure
- Check if an invalidation bug is deleting too aggressively

Fix: increase TTL, add cache warming on deploy, size Redis node correctly.

---

**Q: A user sees their old profile photo 3 minutes after updating it. What's wrong?**

Stale cache. The update wrote to DB but didn't invalidate `user:${id}:profile` in Redis. TTL is 5 minutes. Fix: delete cache key on every profile write.

---

**Q: You accidentally cached user A's data under user B's key. How does this happen and how do you prevent it?**

Happens when cache keys are constructed from mutable or un-sanitized input. Prevention:
- Always use unique, immutable identifiers in keys (user ID, not username)
- Code review all cache key construction
- Never construct keys from user-provided values without sanitization
- Add integration tests that verify cache isolation between users
