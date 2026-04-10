# Redis Basics + AWS ElastiCache Overview

---

## What is Redis?

Redis = **RE**mote **DI**ctionary **S**erver

- In-memory key-value store
- Data lives in RAM → microsecond reads/writes
- Used for: caching, sessions, queues, pub/sub, rate limiting
- Supports data expiry (TTL = Time To Live)

Think of it like a **super-fast scratchpad** your app writes to and reads from — instead of hitting the database every time.

---

## Redis vs Database — Mental Model

```
Without Cache:
User → API → PostgreSQL (disk) → 100ms response

With Cache:
User → API → Redis (RAM) → 1ms response ✅
              ↓ (cache miss)
           PostgreSQL → store in Redis → respond
```

---

## Redis Data Types

| Type         | Use Case                          | Example Key              |
|--------------|-----------------------------------|--------------------------|
| String       | Simple cache, counters            | `user:42:name → "Sam"`   |
| Hash         | Object storage                    | `user:42 → {name, email}`|
| List         | Job queues, activity feeds        | `notifications:42`       |
| Set          | Unique tags, friend lists         | `tags:post:5`            |
| Sorted Set   | Leaderboards, ranked data         | `leaderboard → [scores]` |
| JSON (module)| Cache full API responses          | `api:/products`          |

---

## Key Redis Commands (You'll Use These Daily)

```bash
# String
SET user:1 "Sam"           # store
GET user:1                 # retrieve
SET user:1 "Sam" EX 60    # store with 60s TTL
DEL user:1                 # delete
EXISTS user:1              # check if key exists → 0 or 1

# Hash (best for objects)
HSET user:1 name "Sam" age 25
HGET user:1 name
HGETALL user:1

# TTL management
TTL user:1                 # remaining TTL in seconds
EXPIRE user:1 120          # reset TTL
PERSIST user:1             # remove TTL (make permanent)

# Utility
KEYS *                     # list ALL keys (don't use in prod!)
FLUSHALL                   # wipe entire cache (careful!)
INFO memory                # memory usage stats
```

---

## Cache Hit vs Cache Miss

```
Cache HIT  → key exists in Redis → return immediately ✅
Cache MISS → key not in Redis   → go to DB, store result, return
```

**Hit Rate** = hits / (hits + misses) × 100
- Good: > 80%
- Great: > 95%

---

## Redis Persistence (important to know)

Redis is in-memory but can persist to disk:

| Mode    | Description                        | Risk              |
|---------|------------------------------------|-------------------|
| No Save | Pure cache, data lost on restart   | Data loss OK      |
| RDB     | Snapshot every N seconds           | Lose recent data  |
| AOF     | Log every write (like DB WAL)      | Safer, larger     |
| Both    | RDB + AOF                          | Most durable      |

For **caching only** → persistence OFF is fine.

---

## AWS ElastiCache Overview

ElastiCache = **Managed Redis (or Memcached) on AWS**

You don't install, patch, or manage Redis — AWS does it.

### ElastiCache for Redis gives you:
- Auto failover (if primary dies, replica promoted)
- Multi-AZ replication
- Encryption at rest + in transit
- CloudWatch metrics (memory hits, evictions)
- Automated backups
- VPC-only access (no public internet)

---

## ElastiCache Architecture

```
                         ┌─────────────────────────────┐
                         │         Your VPC             │
                         │                              │
  EC2 / Lambda / ECS ──► │  ElastiCache Cluster         │
                         │  ┌──────────┐  ┌──────────┐  │
                         │  │ Primary  │→ │ Replica  │  │
                         │  │ (write)  │  │ (read)   │  │
                         │  └──────────┘  └──────────┘  │
                         │     AZ-1           AZ-2       │
                         └─────────────────────────────┘
```

- Apps connect to **Primary endpoint** for writes
- Apps connect to **Reader endpoint** for reads (scales horizontally)
- If primary fails → replica auto-promoted in ~30s

---

## ElastiCache Cluster Modes

### Mode 1: Single Node (Dev/Test)
```
App → [Primary only]
```
- Cheapest
- No replication
- Data lost if node dies

### Mode 2: Cluster Disabled (Replica Group)
```
App → [Primary] → replicated to → [Replica 1, Replica 2]
```
- High availability
- Failover support
- One shard (all data on one node)

### Mode 3: Cluster Mode Enabled (Sharding)
```
App → [Shard 1: keys A-G] + [Shard 2: keys H-P] + [Shard 3: keys Q-Z]
```
- Horizontal scaling
- Data split across multiple shards
- Each shard has primary + replicas
- For very large datasets

---

## ElastiCache: Key Settings

| Setting              | What It Does                              |
|----------------------|-------------------------------------------|
| Node type            | Size: `cache.t3.micro`, `cache.r6g.large` |
| Engine version       | Redis 7.x recommended                     |
| Multi-AZ             | Automatic failover across AZs             |
| Encryption at rest   | Encrypts stored data                      |
| Encryption in transit| TLS between app and Redis                 |
| Auth token           | Password for Redis AUTH                   |
| Subnet group         | Which VPC subnets ElastiCache uses        |
| Security Group       | Controls who can reach port 6379          |

---

## ElastiCache vs Self-Managed Redis on EC2

| Feature          | ElastiCache         | Self-managed on EC2    |
|------------------|---------------------|------------------------|
| Setup            | 5 min console click | Manual install + config|
| Patching         | AWS handles         | You handle             |
| Failover         | Automatic           | Manual or scripted     |
| Monitoring       | CloudWatch built-in | You set up             |
| Cost             | Higher              | Lower (but ops cost)   |
| Control          | Limited             | Full                   |
| **Recommended**  | **Yes, for prod**   | Only for special cases |

---

## Free Tier Note

- `cache.t3.micro` — 750 hours/month free for 12 months
- Enough for dev/test and this entire training

---

## Key Concepts Recap

```
Redis         = in-memory key-value store, microsecond latency
TTL           = auto-expiry on keys
Cache HIT     = found in Redis
Cache MISS    = not found → go to DB
ElastiCache   = managed Redis on AWS
Primary       = handles writes
Replica       = handles reads, promotes on failure
Cluster Mode  = sharding for huge datasets
```
