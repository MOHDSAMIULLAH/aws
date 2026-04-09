# Hands-On Lab: ALB + EC2 + Health Checks

**Goal:** Create an ALB, attach 2 EC2 instances running a Node.js app, configure health checks, and watch traffic distribute.

**Time:** ~45 minutes  
**Cost:** ~$0.05 (ALB charges per hour, stop/delete after lab)

---

## Prerequisites

- VPC with at least 2 public subnets in different AZs (from VPC lab)
- Or use default VPC (it has subnets in multiple AZs already)
- Key pair created in EC2

---

## Step 0 — Plan the Setup

```
[Your Browser]
     |
   [ALB] — listens on port 80
     |
  [Target Group: my-node-tg]
  ├── EC2 #1 (us-east-1a) — running Node.js on port 3000
  └── EC2 #2 (us-east-1b) — running Node.js on port 3000
```

Each EC2 will respond with its own **hostname** so you can see the ALB routing between them.

---

## Step 1 — Launch 2 EC2 Instances

### EC2 #1
1. Go to **EC2 → Launch Instance**
2. Name: `node-server-1`
3. AMI: **Amazon Linux 2023**
4. Instance type: `t2.micro`
5. Key pair: your existing key pair
6. Network:
   - VPC: default (or your custom VPC)
   - Subnet: pick `us-east-1a` (or AZ-a)
   - **Auto-assign public IP: Enable** (for SSH access during lab)
7. Security Group — create new: `node-server-sg`
   - Inbound rule 1: HTTP (port 80) from `0.0.0.0/0`
   - Inbound rule 2: Custom TCP (port 3000) from `0.0.0.0/0`
   - Inbound rule 3: SSH (port 22) from `My IP`
8. **Advanced → User Data** — paste this:

```bash
#!/bin/bash
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

mkdir -p /app
cat > /app/server.js << 'EOF'
const http = require('http');
const os = require('os');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', host: os.hostname() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from Node.js!',
    host: os.hostname(),
    timestamp: new Date().toISOString()
  }));
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
EOF

node /app/server.js &
```

9. Click **Launch Instance**

### EC2 #2
Repeat the exact same steps but:
- Name: `node-server-2`
- Subnet: pick **a different AZ** (`us-east-1b`)
- Security Group: **select existing** → `node-server-sg`
- Same User Data script

---

## Step 2 — Verify EC2s Are Running

Wait ~2 minutes for User Data to complete.

1. SSH into EC2 #1:
```bash
ssh -i your-key.pem ec2-user@<ec2-1-public-ip>
```

2. Test the app:
```bash
curl http://localhost:3000
curl http://localhost:3000/health
```

You should see JSON with the hostname. Repeat for EC2 #2.

---

## Step 3 — Create a Target Group

1. Go to **EC2 → Target Groups → Create target group**
2. **Target type**: Instances
3. **Name**: `my-node-tg`
4. **Protocol**: HTTP
5. **Port**: `3000`
6. **VPC**: same as your EC2s
7. **Health checks**:
   - Protocol: HTTP
   - Path: `/health`
   - **Advanced health check settings**:
     - Healthy threshold: `2`
     - Unhealthy threshold: `2`
     - Timeout: `5`
     - Interval: `10`
     - Success codes: `200`
8. Click **Next**
9. **Register targets**: select both EC2 instances → **Include as pending below**
10. Click **Create target group**

---

## Step 4 — Create the ALB

1. Go to **EC2 → Load Balancers → Create Load Balancer**
2. Choose **Application Load Balancer**
3. **Name**: `my-node-alb`
4. **Scheme**: Internet-facing
5. **IP address type**: IPv4
6. **Network mapping**:
   - VPC: same as EC2s
   - Subnets: select **at least 2 subnets** in different AZs
   
   > ALB requires 2+ AZs — this is mandatory

7. **Security group** — create new: `alb-sg`
   - Inbound: HTTP (port 80) from `0.0.0.0/0`
   - Inbound: HTTPS (port 443) from `0.0.0.0/0`

   > Note: ALB SG allows 80/443 from internet. EC2 SG allows 3000 from ALB SG.
   
   **Best practice:** Update `node-server-sg` to allow port 3000 from `alb-sg` only (not 0.0.0.0/0)

8. **Listeners and routing**:
   - Listener: HTTP : 80
   - Default action: Forward to `my-node-tg`

9. Click **Create load balancer**

---

## Step 5 — Tighten Security Group Rules (Best Practice)

Once ALB is created:

1. Go to `node-server-sg` → Edit inbound rules
2. Change the port 3000 rule:
   - Source: change from `0.0.0.0/0` → **Custom → select `alb-sg`**
3. Save

Now EC2s only accept traffic on port 3000 from the ALB, not the open internet.

---

## Step 6 — Test the ALB

1. Go to your ALB → copy the **DNS name** (looks like `my-node-alb-123456.us-east-1.elb.amazonaws.com`)
2. Open in browser or curl:

```bash
# Hit it multiple times — you'll see different hostnames
curl http://<alb-dns-name>
curl http://<alb-dns-name>
curl http://<alb-dns-name>

# Health endpoint
curl http://<alb-dns-name>/health
```

Each response should show a different `host` value — that's the ALB round-robin routing between your 2 EC2s.

---

## Step 7 — Test Health Checks

Watch what happens when one instance goes down:

1. **SSH into EC2 #1**, kill the Node.js process:
```bash
pkill node
```

2. Wait ~20 seconds (2 failed health checks × 10s interval)

3. Go to **Target Group → Targets tab**
   - EC2 #1 should show: **unhealthy**
   - EC2 #2 shows: **healthy**

4. Hit the ALB — all traffic now goes to EC2 #2 only

5. Restart Node on EC2 #1:
```bash
node /app/server.js &
```

6. Wait ~20 seconds — EC2 #1 becomes **healthy** again

Traffic resumes to both instances automatically.

---

## Step 8 — Add Path-Based Routing (Bonus)

1. Go to **ALB → Listeners → View/edit rules**
2. Add a rule:
   - IF path is `/api/*`
   - THEN forward to `my-node-tg`
3. Add another target group for `/admin/*` (if you had one)

This is how you run microservices behind one ALB.

---

## Cleanup (Important — Saves $)

Delete in this order:
1. Load Balancer (`my-node-alb`)
2. Target Group (`my-node-tg`)
3. EC2 instances (`node-server-1`, `node-server-2`)
4. Security Groups (`alb-sg` — after ALB deleted)

> ALB costs ~$0.008/hour + $0.008/LCU-hour. Delete after lab!
