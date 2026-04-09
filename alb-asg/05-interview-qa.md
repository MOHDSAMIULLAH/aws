# ALB + ASG Interview Q&A

---

## Tier 1 — Fundamentals (Junior / Mid)

**Q: What is an Application Load Balancer and why would you use it?**

> ALB is an L7 load balancer that distributes HTTP/HTTPS traffic across multiple backend targets. You'd use it to:
> - Distribute load across multiple EC2 instances so no single instance is overwhelmed
> - Route different URL paths to different services (e.g., `/api` → backend, `/` → frontend)
> - Handle SSL termination (decrypt HTTPS at the ALB, pass plain HTTP to backends)
> - Do health checks and automatically stop sending traffic to unhealthy instances

---

**Q: What's the difference between ALB, NLB, and Classic LB?**

> - **ALB** — Layer 7 (HTTP/HTTPS), path/host/header-based routing, best for web apps and REST APIs
> - **NLB** — Layer 4 (TCP/UDP), ultra-low latency, static IP, best for gaming, IoT, extreme throughput
> - **Classic LB** — legacy, avoid in new designs

---

**Q: What is a Target Group?**

> A Target Group is a logical group of backends (EC2 instances, IPs, or Lambdas) that the ALB routes traffic to. It has its own health check config. An ALB Listener rule says "if path is /api/* → forward to this Target Group."

---

**Q: Explain ALB health checks. What if they fail?**

> ALB periodically sends HTTP requests to a configured path (e.g., `/health`) on each target. If a target fails the check N times in a row (unhealthy threshold), ALB stops sending traffic to it. When it starts passing again (healthy threshold), traffic resumes automatically. The app is not terminated — only traffic is stopped.

---

**Q: What is an Auto Scaling Group?**

> An ASG is a group of EC2 instances managed together. It:
> - Maintains a desired count of instances
> - Automatically adds instances (scale out) when demand rises
> - Automatically removes instances (scale in) when demand drops
> - Uses a Launch Template to know what kind of EC2 to create

---

**Q: What are min, desired, and max in an ASG?**

> - **Min:** ASG never goes below this. Your floor — ensures you always have N instances running.
> - **Desired:** The current target count. ASG adjusts to maintain this.
> - **Max:** ASG never goes above this. Your cost ceiling.

---

## Tier 2 — Design & Architecture (Mid / Senior)

**Q: You have a Node.js API behind an ALB. Users are randomly getting logged out. What's happening?**

> Classic sticky session / stateful backend problem. The app is storing sessions in memory (or on the local filesystem). ALB is round-robining requests across instances. When a request lands on an instance that doesn't have that user's session, auth fails.
>
> Fix: Move sessions to a shared external store — Redis (ElastiCache) or use stateless JWT tokens so any instance can verify the session independently.

---

**Q: Your ASG scales out fine but users see errors during scale-in. Why?**

> During scale-in, the ASG terminates an instance. If ALB doesn't drain in-flight connections first, those requests drop. ALB has "connection draining" (deregistration delay, default 300s) — the instance is deregistered, ALB stops NEW requests to it, but waits for in-flight requests to complete before the instance is terminated.
>
> The bug is likely one of:
> - Deregistration delay too short (set it higher than your p99 request time)
> - ASG terminating without respecting the lifecycle hook
> - Scale-in happening too fast (increase cooldown period)

---

**Q: What scaling metric would you use for a Node.js API — CPU or request count?**

> Request count per target (ALBRequestCountPerTarget) is usually better for Node.js APIs because:
> - Node is single-threaded and can handle concurrent I/O without high CPU
> - A slow DB query causes high latency but not CPU spike — CPU metric misses this
> - Request count directly reflects user load
>
> Use CPU only if your API does CPU-bound work (e.g., image processing, crypto).

---

**Q: How would you make a Node.js API stateless?**

> 1. Replace server-side sessions with JWTs (client holds the token)
> 2. Move any file writes to S3 instead of local disk
> 3. Move any caches (rate limiting, counters) to Redis
> 4. Use environment variables for config — no hardcoded IPs
> 5. Remove any cron jobs from the app process (put them on a separate dedicated instance or Lambda)

---

**Q: Why does ALB require subnets in at least 2 AZs?**

> For high availability. If one AZ goes down (power failure, network issue), the ALB continues routing traffic through the healthy AZ. If the ALB were in only one AZ and that AZ failed, your entire app would be unreachable. AWS enforces the 2-AZ minimum as a best-practice guardrail.

---

**Q: Walk me through what happens when traffic spikes and ASG scales out.**

> 1. CloudWatch alarm triggers (e.g., CPU > 70% for 2 mins)
> 2. ASG scaling policy fires: desired += N
> 3. ASG creates new EC2 from Launch Template
> 4. EC2 starts, User Data script runs (app boots)
> 5. ASG registers new instance with ALB Target Group
> 6. ALB runs health checks → instance passes
> 7. ALB begins routing traffic to new instance
> 8. Load distributes, CPU drops
> 9. CloudWatch alarm resolves
> 10. After cooldown + scale-in conditions met, excess instances terminate with connection draining

---

## Tier 3 — Deep Dive (Senior / Architect)

**Q: What is the "thundering herd" problem with ASG and how do you prevent it?**

> When all instances are under load and scale-out triggers, the new instances aren't ready immediately. During the 2-5 minutes it takes for them to boot and pass health checks, the original instances shoulder the full load — often crashing them. Now you have a cascading failure.
>
> **Prevention:**
> - Pre-bake AMIs so startup time is seconds, not minutes
> - Add a warm pool (ASG feature) — keep pre-warmed instances in stopped state, ready to activate in ~30s instead of 3 minutes
> - Set min capacity higher than normal load so there's buffer
> - Use predictive scaling when load patterns are predictable

---

**Q: How do you achieve zero-downtime deployments with ASG?**

> Several strategies:
>
> **Rolling update (default):** ASG replaces old instances gradually. Set `MaxBatch` and `MinInstancesInService`. Old instances stay up while new ones launch. Risk: briefly mixed versions serving traffic.
>
> **Blue/green:** Create a new ASG with new version. Shift ALB traffic from old Target Group to new. Old ASG stays up as rollback option. Delete old ASG after validation.
>
> **Canary:** Create new ASG, add to ALB with weighted Target Group. Send 5% traffic to new, 95% to old. Gradually shift.

---

**Q: What is an ALB Listener Rule and give a use case with path-based routing?**

> A Listener Rule evaluates incoming requests and decides where to forward them. Rules have conditions (path, host, header, query string) and actions (forward, redirect, fixed response).
>
> Example — microservices behind one ALB:
> ```
> Rule 1: path /api/users/*  → Target Group: users-service-tg
> Rule 2: path /api/orders/* → Target Group: orders-service-tg
> Rule 3: path /api/search/* → Target Group: search-service-tg
> Default: path /*           → Target Group: frontend-tg
> ```
> This means you only need one ALB (one cost) for multiple services, separated by URL path.

---

**Q: Your app has 8 instances under load but PostgreSQL is throwing "too many connections." What do you do?**

> Each Node.js instance has a connection pool (e.g., pg-pool max: 10). 8 instances × 10 = 80 connections. PostgreSQL's default max_connections is 100, so you're hitting the limit.
>
> **Fixes:**
> 1. **Immediate:** Reduce pool size per instance (`max: 5`)
> 2. **Medium-term:** Add **RDS Proxy** — it pools connections between the app tier and RDS. 8 instances connect to the proxy, the proxy maintains a small pool to actual RDS. Handles 1000s of app connections → dozens of DB connections
> 3. **Long-term:** Read replicas for read-heavy queries; proper connection management

---

## Common Mistake Questions

**Q: A junior dev on your team sets min=0 for the ASG to save money. What's the risk?**

> During a scale-in event (e.g., overnight low traffic), the ASG could terminate all instances. When traffic returns, there are 0 instances — ALB has no healthy targets, all users see 502/503 errors. The ASG will start scaling out, but there's a 2-5 minute cold start window where the app is completely down. Always set min >= 1, typically min >= 2 for production.

---

**Q: Someone says "just enable sticky sessions to fix the logout problem." What do you say?**

> Sticky sessions are a band-aid, not a fix. Problems:
> 1. Uneven load distribution — some instances overloaded, others idle
> 2. If the "sticky" instance dies, the user loses their session anyway — worse UX
> 3. Makes scale-in harder — can't remove an instance that has active "stuck" users
> 4. Doesn't work properly with modern SPAs where API calls go to different endpoints
>
> The right fix is to make the backend stateless. Move sessions to Redis or use JWTs.
