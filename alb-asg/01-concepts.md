# ALB + ASG — Core Concepts

---

## 1. Application Load Balancer (ALB)

### What it does
ALB sits in front of your EC2 instances (or containers/lambdas) and distributes incoming HTTP/HTTPS traffic across them.

Think of it as a **smart traffic cop** — it reads the request (URL path, headers, host) and decides which backend to send it to.

---

### ALB vs Classic LB vs NLB

| Feature | Classic LB (CLB) | ALB | NLB |
|---|---|---|---|
| Layer | L4 + L7 | L7 only | L4 only |
| Routing | Basic | Path/Host/Header | IP/Port |
| WebSocket | No | Yes | Yes |
| HTTP/2 | No | Yes | No |
| Use case | Legacy | Web apps, APIs | TCP/UDP, extreme perf |

**Rule of thumb:** Always use ALB for Node.js APIs, REST backends, web apps.

---

### ALB Architecture

```
Internet
   |
  [ALB]  ← Public subnet (has public IP)
   |
  [Target Group]
   ├── EC2 instance 1  ← Private subnet
   ├── EC2 instance 2  ← Private subnet
   └── EC2 instance 3  ← Private subnet
```

---

### Key ALB Components

#### Listener
- Listens on a port (e.g., 80 or 443)
- Has rules that say "if request matches X → send to target group Y"

#### Target Group
- A logical group of backends (EC2s, IPs, Lambdas)
- ALB routes to this group
- Has its own **health check** config

#### Target
- A single backend — one EC2 instance, one Lambda, etc.

#### Rules (on the Listener)
- Default rule: catch-all → send to main target group
- Custom rules: path-based, host-based routing

```
/api/*       → Target Group: api-servers
/images/*    → Target Group: static-servers  (or S3)
default      → Target Group: frontend-servers
```

---

### Health Checks

ALB periodically sends a request to each target. If the target fails N times in a row → **marked unhealthy** → traffic stops going to it.

Config:
- **Protocol**: HTTP / HTTPS
- **Path**: `/health` (you create this endpoint in your app)
- **Interval**: How often to check (default: 30s)
- **Healthy threshold**: How many passes to mark healthy (default: 5)
- **Unhealthy threshold**: How many fails to mark unhealthy (default: 2)
- **Timeout**: How long to wait for response (default: 5s)

---

## 2. Auto Scaling Group (ASG)

### What it does
ASG automatically adds or removes EC2 instances based on demand.

- Too much traffic → **scale out** (add instances)
- Traffic drops → **scale in** (remove instances)

---

### ASG Architecture

```
ASG (min: 2, desired: 2, max: 5)
   |
   ├── EC2 #1  ← Auto created from Launch Template
   ├── EC2 #2  ← Auto created from Launch Template
   └── [EC2 #3, #4, #5 spin up under load]
```

---

### Key ASG Components

#### Launch Template (LT)
Blueprint for new EC2s — defines:
- AMI (which OS + pre-installed software)
- Instance type (t2.micro, etc.)
- Key pair
- Security group
- User Data script (auto-start your Node.js app)

#### Min / Desired / Max
- **Min**: ASG never goes below this (even at zero load)
- **Desired**: ASG tries to maintain this count normally
- **Max**: ASG never goes above this (cost guard)

#### Scaling Policies

| Type | How it works | Use case |
|---|---|---|
| Target Tracking | Keep CPU at X% | Most common, set-and-forget |
| Step Scaling | Add N instances when CPU > X% | Fine-grained control |
| Scheduled | Scale up at 9am, down at 6pm | Predictable load patterns |
| Predictive | ML forecasts load, pre-scales | High-traffic apps |

---

### ASG + ALB Integration

```
Load → ALB → forwards to Target Group
                   ↑
              ASG registers/deregisters EC2s here automatically
```

When ASG adds a new EC2:
1. EC2 starts, runs User Data script (your app boots)
2. ASG registers it with the ALB Target Group
3. ALB health check passes → traffic flows to new instance

When ASG removes an EC2:
1. ALB stops sending **new** requests (connection draining)
2. In-flight requests finish (default: 300s drain time)
3. EC2 terminates

---

### Scaling Triggers

- **CloudWatch Alarm** → CPU > 70% for 2 minutes → scale out
- **CloudWatch Alarm** → CPU < 30% for 5 minutes → scale in
- **Request count per target** (ALB metric) → most accurate for web apps
- **Custom metrics** (e.g., queue depth, DB connections)

---

## 3. Mental Model: The Full Picture

```
         [Internet]
              |
         [Route 53]  (optional, DNS)
              |
    [ALB - Public Subnet]
    ┌─────────────────────┐
    │  Listener :80/:443  │
    │  Rules + TG         │
    └─────────────────────┘
              |
    [Target Group: node-api-tg]
    ┌─────────────────────┐
    │  Health: GET /health│
    │  Port: 3000         │
    └─────────────────────┘
              |
    [ASG - Private Subnet]
    ┌─────────────────────┐
    │  min:2  max:5       │
    │  Launch Template    │
    │  user-data: npm start│
    └─────────────────────┘
    |       |       |
   EC2#1  EC2#2  EC2#3 (scales in/out)
```

---

## Key Numbers to Know (Interview)

| Thing | Default / Typical |
|---|---|
| ALB health check interval | 30s |
| Unhealthy threshold | 2 failures |
| Connection draining (deregistration delay) | 300s |
| ASG cooldown period | 300s |
| Max instances per ASG | 200 (soft limit) |
| ALB idle timeout | 60s |
