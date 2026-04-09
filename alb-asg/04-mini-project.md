# Mini Project: Scale a Node.js API Under Load

**Goal:** Build a stateless Node.js API, put it behind ALB + ASG, stress test it, and watch it auto-scale.

**What you'll build:**
```
[Load Generator (your laptop / EC2)]
          |
       [ALB :80]
          |
    [ASG Target Group]
    ├── EC2 #1 — Node.js API
    └── EC2 #2 — Node.js API (scales to 4 under load)
```

---

## Part 1 — The Node.js App

### Create the app

This is a simple stateless REST API that simulates CPU work (so we can trigger scaling).

```bash
mkdir scalable-node-api && cd scalable-node-api
npm init -y
npm install express
```

**server.js**
```js
const express = require('express');
const os = require('os');
const app = express();

app.use(express.json());

// Health check — must respond fast, no heavy work
app.get('/health', (req, res) => {
  res.json({ status: 'ok', host: os.hostname() });
});

// Info endpoint
app.get('/', (req, res) => {
  res.json({
    host: os.hostname(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

// CPU-intensive endpoint (simulates real work)
// Used to trigger auto-scaling
app.get('/compute', (req, res) => {
  const iterations = parseInt(req.query.n) || 1000000;
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i);
  }
  res.json({
    host: os.hostname(),
    result: result.toFixed(2),
    iterations
  });
});

// Simulate a DB-read (fake delay)
app.get('/users', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 100)); // simulate 100ms DB query
  res.json({
    host: os.hostname(),
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${os.hostname()}] Server running on port ${PORT}`);
});
```

---

## Part 2 — Create the AMI (Launch Template Base)

Instead of installing Node.js every time an instance launches, bake it into an AMI.

### Step 1: Launch a base EC2
- AMI: Amazon Linux 2023
- Type: t2.micro
- Name: `node-api-base`

### Step 2: SSH in and set up
```bash
# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Create app directory
sudo mkdir -p /app
sudo chown ec2-user:ec2-user /app
cd /app

# Create the server.js (paste the code above)
nano server.js

# Install dependencies
npm init -y
npm install express

# Test it works
node server.js &
curl http://localhost:3000/health
# Should return: {"status":"ok","host":"..."}

pkill node
```

### Step 3: Create AMI
1. EC2 Console → select `node-api-base` instance
2. **Actions → Image and templates → Create image**
3. Name: `node-api-ami`
4. No reboot: checked (optional)
5. Click **Create image**
6. Wait ~5 minutes → AMI status: **available**

---

## Part 3 — Create Launch Template

1. EC2 → **Launch Templates → Create launch template**
2. Name: `node-api-lt`
3. AMI: select `node-api-ami` (your custom AMI)
4. Instance type: `t2.micro`
5. Key pair: your key pair
6. Security group: `node-server-sg` (port 3000 from ALB SG, port 22 from your IP)
7. **Advanced details → User Data:**

```bash
#!/bin/bash
# App already installed in AMI, just start it
cd /app
nohup node server.js > /var/log/node-api.log 2>&1 &
```

8. Create launch template

---

## Part 4 — Create Target Group + ALB

Follow the same steps from `02-hands-on.md`:
- Target Group: `node-api-tg`, port 3000, health check `/health`
- ALB: `node-api-alb`, internet-facing, 2+ subnets

**Do NOT register individual instances** — the ASG will do that automatically.

---

## Part 5 — Create the Auto Scaling Group

1. EC2 → **Auto Scaling Groups → Create Auto Scaling group**
2. Name: `node-api-asg`
3. **Launch template**: `node-api-lt`
4. **Instance type**: t2.micro (stick with template)
5. **Network**:
   - VPC: your VPC
   - Subnets: select 2+ subnets in different AZs
6. **Load balancing**: Attach to an existing load balancer
   - Choose from target groups: `node-api-tg`
7. **Health checks**:
   - EC2 health check: enabled
   - ELB health check: **enabled** (important — uses ALB health check)
   - Grace period: `60` seconds
8. **Group size**:
   - Desired: `2`
   - Minimum: `2`
   - Maximum: `4`
9. **Scaling policies → Target tracking**:
   - Metric: **ALBRequestCountPerTarget**
   - Target value: `100` (scale out when > 100 req/s per instance)
   
   > For CPU-based testing, use: Average CPU utilization → 50%

10. **Notifications (optional)**: Skip for now
11. Review + Create

Wait ~3 minutes → go to Target Group → both instances should show **healthy**.

---

## Part 6 — Load Test: Watch It Scale

### Option A: Use `hey` (simple HTTP load tester)

Install on your local machine or a separate EC2:

```bash
# On Amazon Linux:
# Download hey binary
wget https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64
chmod +x hey_linux_amd64
sudo mv hey_linux_amd64 /usr/local/bin/hey
```

Run the load test:
```bash
ALB_DNS="your-alb-dns-name.us-east-1.elb.amazonaws.com"

# Warm up — low traffic
hey -n 1000 -c 10 http://$ALB_DNS/

# Medium load — watch CPU
hey -n 5000 -c 50 http://$ALB_DNS/users

# Heavy load — trigger CPU scale-out
hey -n 50000 -c 200 -z 5m http://$ALB_DNS/compute?n=5000000
```

### Option B: Use `ab` (Apache Bench, already installed on Amazon Linux)

```bash
# Install
sudo yum install -y httpd-tools

ALB_DNS="your-alb-dns-name.us-east-1.elb.amazonaws.com"

# Light test
ab -n 1000 -c 10 http://$ALB_DNS/

# Heavy test — run for 5 minutes
ab -n 500000 -c 200 -t 300 http://$ALB_DNS/compute?n=5000000
```

---

## Part 7 — Watch the Scaling Happen

### Monitor in real-time:

**Tab 1: Watch Target Group**
```
EC2 → Target Groups → node-api-tg → Targets tab
Refresh every 30 seconds
```

**Tab 2: Watch ASG Activity**
```
EC2 → Auto Scaling Groups → node-api-asg → Activity tab
You'll see: "Launching a new EC2 instance..."
```

**Tab 3: CloudWatch**
```
CloudWatch → Metrics → EC2 → By Auto Scaling Group
  - CPUUtilization (per ASG)
  - NetworkIn/Out
```

**Tab 4: ALB Metrics**
```
CloudWatch → Metrics → ApplicationELB
  - RequestCount
  - TargetResponseTime
  - HealthyHostCount ← watch this increase!
```

---

## Part 8 — Expected Timeline

```
T+0:    Load test starts
        2 instances handling traffic

T+2min: CPU > 50% on both instances
        CloudWatch alarm triggers
        ASG: "Scaling out..."

T+4min: EC2 #3 launches
        User Data runs (node server.js starts)
        ALB health check: pending

T+5min: EC2 #3 health check passes
        ALB registers it → traffic distributes to 3 instances
        CPU drops to ~35% per instance

T+10min: Load continues, CPU stays ~35%
         No more scaling needed

Load test ends:

T+15min: CPU drops below 30%
         CloudWatch alarm: scale in
         ASG: "Connection draining on EC2 #3..."

T+20min: EC2 #3 terminates
         Back to 2 instances
```

---

## Part 9 — Verify Statelessness

While load is running, check that all instances are serving traffic:

```bash
# Run this in a loop — you should see different hostnames
while true; do
  curl -s http://$ALB_DNS/ | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])"
  sleep 0.5
done
```

Output should alternate between instance hostnames — proof that no single instance is bottlenecking.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| All instances show unhealthy | Health check path wrong | Verify `/health` returns 200 |
| Scale-out never triggers | Metric threshold too high | Lower CPU threshold to 30% |
| Scale-in never happens | Cooldown too long | Check ASG activity log |
| New instances fail health check | App didn't start in User Data | SSH in, check `/var/log/node-api.log` |
| High error rate under load | DB connections exhausted | Reduce pool size or add RDS Proxy |
| Instances terminate immediately | ELB health check failing too fast | Increase grace period to 120s |

---

## Cleanup

```bash
# Delete in this order:
1. Auto Scaling Group (this terminates EC2s automatically)
2. Load Balancer
3. Target Group
4. Launch Template
5. AMI + snapshot (EC2 → AMIs → deregister; Snapshots → delete)
6. Security Groups
```

---

## What You Proved

- A stateless Node.js API can scale horizontally without code changes
- ALB distributes traffic across any number of instances
- ASG automatically reacts to load — no manual intervention
- Health checks ensure traffic only goes to healthy instances
- Connection draining prevents request drops during scale-in
