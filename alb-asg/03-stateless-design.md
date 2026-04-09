# Stateless Backend Design + Why Scaling Fails

---

## The Core Rule

> **Stateless = any instance can handle any request at any time.**

If instance #1 must handle a request because it holds some data, your backend is **stateful** — and scaling breaks.

---

## Stateful vs Stateless: A Real Example

### Stateful (bad for scaling)

```
User logs in → EC2 #1 stores session in memory
User makes next request → ALB routes to EC2 #2
EC2 #2: "Who are you? I have no session for you." → 401 Unauthorized
```

```js
// Node.js — BAD: storing session in process memory
const sessions = {}; // dies when instance restarts

app.post('/login', (req, res) => {
  sessions[userId] = { loggedIn: true, cart: [] }; // stored HERE
  res.json({ ok: true });
});

app.get('/dashboard', (req, res) => {
  const session = sessions[req.userId]; // only exists on THIS instance
  if (!session) return res.status(401).json({ error: 'not logged in' });
  res.json(session);
});
```

### Stateless (good for scaling)

```
User logs in → get a JWT token
User makes any request with JWT → ANY instance can verify it
No shared memory needed
```

```js
// Node.js — GOOD: JWT, no server-side state
const jwt = require('jsonwebtoken');

app.post('/login', (req, res) => {
  // verify credentials against DB...
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  res.json({ token }); // client holds the state
});

app.get('/dashboard', (req, res) => {
  const user = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
  // fetch user data from DB (shared, not per-instance)
  res.json({ user });
});
```

---

## The 12-Factor App Rule: Stateless Processes

From the [12-Factor App](https://12factor.net/processes) methodology:

> "Processes are stateless and share-nothing. Any data that needs to persist must be stored in a stateful backing service, typically a database."

Your Node.js API should be a pure **function**:
```
request + external state (DB, cache) → response
```

Never:
```
request + in-memory state → response  ← breaks scaling
```

---

## Where State Should Live (Not In EC2)

| State Type | Where to Store | AWS Service |
|---|---|---|
| User sessions | External cache | ElastiCache (Redis) |
| User data | Database | RDS PostgreSQL |
| File uploads | Object storage | S3 |
| Shopping cart | Cache or DB | ElastiCache / DynamoDB |
| Rate limiting counters | Cache | ElastiCache (Redis) |
| WebSocket connections | Message broker | API Gateway WebSockets / SQS |

---

## Why Scaling Fails — The 6 Common Reasons

### 1. In-Memory Sessions (Most Common)

**Symptom:** Users randomly get logged out, or get 401 errors on every other request.

**Root cause:** ALB round-robins traffic. Session is on instance A. Next request goes to instance B. Session not found.

**Fix:** Use Redis (ElastiCache) for sessions.

```js
// Use connect-redis instead of in-memory session
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');

const client = redis.createClient({ url: process.env.REDIS_URL });
app.use(session({
  store: new RedisStore({ client }),
  secret: process.env.SESSION_SECRET
}));
```

---

### 2. Local File Storage

**Symptom:** User uploads profile picture on instance A. When served from instance B → 404.

**Root cause:** EC2 local disk is not shared. Instance A's `/uploads/` doesn't exist on instance B.

**Fix:** Upload directly to S3.

```js
// BAD
app.post('/upload', upload.single('file'), (req, res) => {
  // saves to /tmp/uploads on THIS instance only
  fs.writeFileSync('/tmp/uploads/' + req.file.originalname, req.file.buffer);
});

// GOOD
const aws = require('aws-sdk');
const s3 = new aws.S3();
app.post('/upload', upload.single('file'), async (req, res) => {
  await s3.putObject({
    Bucket: process.env.S3_BUCKET,
    Key: req.file.originalname,
    Body: req.file.buffer
  }).promise();
});
```

---

### 3. Sticky Sessions (Workaround That Creates Problems)

**What it is:** ALB "sticks" a user to the same EC2 for every request using a cookie.

**Why it's bad:**
- Defeats the purpose of load balancing
- If that instance dies, user loses their session anyway
- Uneven load distribution (one instance handles all "stuck" users)
- ASG scale-in is harder (can't remove instances with active stickied users)

**When it's acceptable:** Stateful WebSocket apps as a short-term fix.

```
ALB → Stickiness: Enabled (AWSALB cookie, 1 day)
```

**Real fix:** Make the app stateless, remove sticky sessions.

---

### 4. Cooldown Period Too Short

**Symptom:** Traffic spikes → ASG adds instances → CPU goes DOWN → ASG removes instances → CPU spikes again. Ping-pong loop.

**Root cause:** New instances come online but cooldown is too short, so the metric looks good before the instance is stable, triggering scale-in immediately.

**Fix:**
- Set cooldown to 300s+
- Use **Target Tracking** instead of step scaling
- Use **request count per target** (ALB metric) instead of CPU

---

### 5. App Takes Too Long to Start

**Symptom:** Under load, new instances spin up but health checks fail for 2+ minutes. Traffic keeps hitting the 2 original overloaded instances.

**Root cause:** User Data script installs npm packages from scratch. Takes 3-5 minutes. Health checks fail until the app is up.

**Fix:** Use a pre-baked AMI with Node.js and dependencies already installed.

```bash
# Build your AMI once:
# 1. Launch EC2
# 2. Install node, npm, your dependencies
# 3. Create AMI from that instance
# 4. Use that AMI in your Launch Template
# User Data only needs: npm start (2 seconds vs 5 minutes)
```

---

### 6. Database Connection Exhaustion

**Symptom:** Scaling works at 2 instances. At 8 instances (under load), DB starts throwing "too many connections" errors.

**Root cause:** Each Node.js instance opens a connection pool (e.g., 10 connections × 8 instances = 80 connections). PostgreSQL default max is 100.

**Fix:**
- Use **RDS Proxy** — pools connections between app and DB
- Reduce pool size per instance
- Use `pg-pool` with `max: 5` instead of default 10

```js
// Tune this:
const pool = new Pool({
  max: 5,             // reduce per-instance pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## Checklist: Is My Node.js API Scalable?

- [ ] No in-memory sessions (use Redis or JWT)
- [ ] No local file writes (use S3)
- [ ] No hardcoded IPs or hostnames (use env vars)
- [ ] DB connection pool sized appropriately
- [ ] `/health` endpoint returns 200 fast (< 1s, no DB query)
- [ ] App starts under 30 seconds (better: < 5 seconds)
- [ ] No cron jobs on app instances (move to separate dedicated instance)
- [ ] No sticky sessions

---

## The Scaling Mental Model

```
Traffic doubled?
  → New instance starts
  → Runs your app
  → ALB health check passes
  → Traffic starts flowing
  → App handles requests identically to others

Traffic halved?
  → ALB drains connections from one instance (300s)
  → Instance terminates
  → Users notice nothing
```

This only works if every instance is truly interchangeable.
