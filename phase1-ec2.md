# Phase 1 — Topic 2: EC2 + Production Setup (Complete Guide)

---

## What is EC2 Internally?

EC2 (Elastic Compute Cloud) is AWS's virtualization service built on top of the **Nitro hypervisor** (AWS's custom bare-metal hypervisor).

```
AWS Physical Data Center
└── Physical Host Machine (bare metal)
    └── Nitro Hypervisor
        ├── Your EC2 Instance (t2.micro) ← you get this
        ├── Another customer's instance
        └── Another customer's instance
```

- Each EC2 instance is a **Virtual Machine (VM)** — isolated slice of a physical server
- You get dedicated CPU, RAM, network, and disk (EBS volume)
- When you "start" an instance, AWS provisions a VM on a physical host in your chosen Availability Zone
- Your data is isolated — other tenants cannot see your memory or disk

**Flow when you launch:**
```
You click Launch → AWS picks a physical host → Nitro creates a VM →
Attaches EBS volume (your disk) → Assigns private IP (VPC) →
Assigns public IP (if enabled) → Instance is "running"
```

---

## Why Security Groups Are Important?

A Security Group is a **stateful virtual firewall** at the instance level.

```
Internet
   ↓
[Security Group] ← AWS enforces this BEFORE traffic reaches your instance
   ↓
EC2 Instance
```

**Stateful** means: if you allow inbound port 3000, response traffic is automatically allowed outbound — no separate outbound rule needed.

**Why it matters:**
- Without it, your server is fully exposed to the internet
- Port 22 open to the world = brute-forced within minutes
- First and most critical line of defense
- Changes apply **instantly** — no restart needed

| Direction | Default | Controls |
|---|---|---|
| Inbound | All DENY | What traffic can reach your instance |
| Outbound | All ALLOW | What traffic your instance can send out |

---

## Why PM2?

Node.js is **single-threaded** and dies if it crashes. In production you need:

```
Without PM2:                      With PM2:
node index.js                     pm2 start index.js
     ↓                                 ↓
App crashes → 404 forever         App crashes → PM2 restarts in <1s
Server reboots → app is dead      Server reboots → PM2 auto-starts app
One CPU core used                 Cluster mode → all CPU cores used
No logs → blind debugging         Structured logs with rotation
```

PM2 is a **process manager** — it owns your Node process, keeps it alive, and gives you full observability.

---

## Why Nginx?

Node.js is NOT designed to face raw internet traffic directly.

```
Without Nginx:                    With Nginx:
Internet → Node.js:3000           Internet → Nginx:80/443 → Node.js:3000
     ↓                                 ↓
No SSL (HTTPS)                    SSL termination handled by Nginx
No gzip compression               Gzip enabled → faster responses
No rate limiting                  Rate limiting → DDoS protection
No static file serving            Nginx serves static files (fast)
One app per server                Multiple apps on one server (virtual hosts)
```

Nginx is a **battle-hardened web server** designed for thousands of concurrent connections.

---

## Key Terms

| Term | What it means |
|---|---|
| AMI | OS image (like Ubuntu 22.04) — the "template" |
| Instance Type | CPU + RAM size (t2.micro = free tier) |
| Key Pair | SSH key to log into your server |
| Security Group | Stateful firewall rules (which ports are open) |
| Elastic IP | Static public IP that doesn't change on restart |
| EBS Volume | The hard disk attached to your instance |

---

## Architecture Overview

```
Your laptop  →  SSH (port 22)  →  EC2 Instance (Ubuntu VM)
                                        ↓
                                  PM2 (process manager)
                                        ↓
                                  Node.js app :3000
                                        ↑
Internet → Security Group → Nginx :80/:443 (reverse proxy)
```

---

## Hands-On Steps

### Step 1: Launch EC2 Instance

1. AWS Console → **EC2** → **Launch Instance**
2. Name: `zeenat-node-server`
3. AMI: **Ubuntu Server 22.04 LTS** (free tier eligible)
4. Instance type: **t2.micro** (free tier)
5. Key pair → **Create new key pair**
   - Name: `zeenat-key`
   - Type: RSA, format: `.pem`
   - Click **Create** → auto-downloads `zeenat-key.pem`
6. Network settings → **Create security group**
   - Allow SSH — port `22` — Source: **My IP**
   - Allow HTTP — port `80` — Source: **Anywhere (0.0.0.0/0)**
7. Storage: 8 GB gp3 (default)
8. Click **Launch Instance**

> Wait ~1 minute → Instance state shows **running** → note the **Public IPv4 address**

---

### Step 2: Edit Inbound Rules — Allow Port 3000 (Testing Only)

1. EC2 → Instances → click your instance
2. Scroll down → **Security** tab → click the Security Group link
3. **Inbound rules** → **Edit inbound rules**
4. Add rule:
   - Type: Custom TCP
   - Port range: `3000`
   - Source: `0.0.0.0/0`
   - Description: `Node app direct access`
5. Save rules

> Remove this rule once Nginx is configured — traffic should only enter via port 80.

---

### Step 3: SSH Into the Instance

```bash
# Fix key permissions (required on Mac/Linux)
chmod 400 ~/Downloads/zeenat-key.pem

# SSH in
ssh -i ~/Downloads/zeenat-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

> On Windows: use Git Bash or WSL with the same command.

---

### Step 4: Install Node.js + Git

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Git
sudo apt install -y git
git --version

# Install Node.js v20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v
npm -v
```

---

### Step 5: Clone or Create a Node.js Express App

**Option A — Clone from GitHub:**
```bash
git clone https://github.com/<your-username>/<your-repo>.git ~/app
cd ~/app
npm install
```

**Option B — Create manually:**
```bash
mkdir ~/app && cd ~/app
npm init -y
npm install express

cat > index.js << 'EOF'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from EC2!', server: 'zeenat-node-server' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage()
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
EOF
```

---

### Step 6: Run the App on Port 3000

```bash
node index.js
```

Access it:
```
http://<YOUR_EC2_PUBLIC_IP>:3000
http://<YOUR_EC2_PUBLIC_IP>:3000/health
```

Confirm you see JSON in your browser → then stop the process (`Ctrl+C`) → move to PM2.

---

### Step 7: PM2 — Full Production Setup

#### Install
```bash
sudo npm install -g pm2
```

#### Start App (Basic)
```bash
cd ~/app
pm2 start index.js --name "zeenat-node-app"
```

#### Cluster Mode (use all CPU cores)
```bash
pm2 start index.js --name "zeenat-node-app" -i max
```

#### Create Ecosystem Config File (Best Practice)
```bash
nano ~/app/ecosystem.config.js
```

```js
module.exports = {
  apps: [
    {
      name: 'zeenat-node-app',
      script: 'index.js',
      instances: 'max',             // cluster mode — one per CPU core
      exec_mode: 'cluster',
      watch: false,                  // never watch files in production
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/zeenat-app-error.log',
      out_file: '/var/log/pm2/zeenat-app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M'     // auto-restart if memory leaks
    }
  ]
};
```

```bash
# Create log directory
sudo mkdir -p /var/log/pm2
sudo chown ubuntu:ubuntu /var/log/pm2

# Start with production env
pm2 start ecosystem.config.js --env production
```

#### Auto-restart on Server Reboot
```bash
pm2 startup
# Copy and run the exact command it outputs, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

pm2 save   # saves current process list — CRITICAL, don't skip
```

#### Log Management
```bash
# View logs
pm2 logs                              # all apps
pm2 logs zeenat-node-app              # specific app
pm2 logs zeenat-node-app --lines 100  # last 100 lines

# Install log rotation (prevent disk fill)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M    # rotate at 10MB
pm2 set pm2-logrotate:retain 7        # keep 7 old files
pm2 set pm2-logrotate:compress true   # gzip old logs
```

#### Essential PM2 Commands
```bash
pm2 status                        # all running processes
pm2 monit                         # real-time CPU + memory dashboard
pm2 restart zeenat-node-app       # hard restart (brief downtime)
pm2 reload zeenat-node-app        # zero-downtime restart (cluster mode)
pm2 stop zeenat-node-app
pm2 delete zeenat-node-app
pm2 describe zeenat-node-app      # full process info
pm2 flush zeenat-node-app         # clear logs
```

---

### Step 8: Nginx — Full Production Setup

#### Install
```bash
sudo apt install -y nginx
sudo systemctl enable nginx    # auto-start on reboot
sudo systemctl start nginx
```

#### Create Config File
```bash
sudo nano /etc/nginx/sites-available/zeenat-app
```

```nginx
server {
    listen 80;
    server_name _;              # replace _ with your domain when ready

    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";

    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Pass real client IP to Node.js
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Serve static files directly via Nginx (much faster than Node)
    location /static/ {
        alias /home/ubuntu/app/public/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Block access to hidden files (.env, .git, etc.)
    location ~ /\. {
        deny all;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/zeenat-app /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test config — MUST say "syntax is ok"
sudo nginx -t

# Reload (zero downtime)
sudo systemctl reload nginx
```

App now live on port 80:
```
http://<YOUR_EC2_PUBLIC_IP>
http://<YOUR_EC2_PUBLIC_IP>/health
```

> Go back to Security Group → remove the port 3000 inbound rule.

---

### Step 9: Allocate Elastic IP (Static IP)

1. EC2 → **Elastic IPs** → **Allocate Elastic IP address** → Allocate
2. Select the new IP → **Actions** → **Associate Elastic IP address**
3. Instance: select `zeenat-node-server` → Associate
4. Update your SSH command with the new IP

> Elastic IP is free **only while associated with a running instance**. Unattached IPs are billed.

---

### Step 10: Domain + SSL (Optional but Recommended)

#### Point DNS to EC2
- Domain registrar (GoDaddy / Namecheap / Route53)
- Add **A record**:
  - Host: `api` (or `@` for root)
  - Value: your Elastic IP
  - TTL: 300

#### Update Nginx server_name
```nginx
server {
    listen 80;
    server_name api.zeenat.dev www.api.zeenat.dev;
    ...
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

#### Free SSL with Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx

# Auto-configure SSL
sudo certbot --nginx -d api.zeenat.dev

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot auto-adds to your Nginx config:
```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/api.zeenat.dev/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/api.zeenat.dev/privkey.pem;
```

---

## Hands-On Problems

### Problem 1 — Deploy a Multi-Route API
Extend `index.js` with these routes and verify each one hits via browser + curl:

```js
app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'Zeenat', role: 'admin' },
    { id: 2, name: 'Ali', role: 'dev' }
  ]);
});

app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'Zeenat' });
});

app.post('/api/users', (req, res) => {
  const { name } = req.body;
  res.status(201).json({ id: Date.now(), name });
});
```

Test with curl:
```bash
curl http://<IP>/api/users
curl http://<IP>/api/users/1
curl -X POST http://<IP>/api/users -H "Content-Type: application/json" -d '{"name":"Sara"}'
```

---

### Problem 2 — Environment Variables + Dotenv
Goal: Never hardcode config in code.

```bash
npm install dotenv

# Create .env file
cat > ~/app/.env << 'EOF'
NODE_ENV=production
PORT=3000
APP_NAME=zeenat-api
SECRET_KEY=mysecretkey123
EOF

# Add .env to .gitignore
echo ".env" >> ~/app/.gitignore
```

Update `index.js`:
```js
require('dotenv').config();

app.get('/config', (req, res) => {
  res.json({
    app: process.env.APP_NAME,
    env: process.env.NODE_ENV,
    port: process.env.PORT
  });
});
```

Update `ecosystem.config.js` — env vars are already handled via `env_production`.
Reload: `pm2 reload zeenat-node-app`

---

### Problem 3 — Nginx Rate Limiting
Goal: Block IPs that make too many requests (basic DDoS protection).

```bash
sudo nano /etc/nginx/sites-available/zeenat-app
```

Add inside the `server` block (before `location /`):
```nginx
# Define rate limit zone: 10 requests/second per IP
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

Add inside `location /`:
```nginx
limit_req zone=api_limit burst=20 nodelay;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Test: hammer the endpoint — after 20 burst requests you'll get `503 Service Unavailable`.

---

### Problem 4 — Simulate App Crash + PM2 Auto-recovery
Goal: Prove PM2 restarts your app.

```bash
# Find the PID of your Node process
pm2 status   # note the pid

# Kill the process
kill -9 <PID>

# Immediately check PM2
pm2 status   # you'll see "restart" status
# Within 1 second it goes back to "online"

# Check restart count
pm2 describe zeenat-node-app | grep restart
```

---

### Problem 5 — Deploy Code Update with Zero Downtime
Goal: Update code without dropping a single request.

```bash
# Simulate updating your app
nano ~/app/index.js
# change the message in GET / to "v2 - Updated!"

# Reload without downtime (cluster mode)
pm2 reload zeenat-node-app

# Verify
curl http://localhost:3000
# Should return "v2 - Updated!"
```

---

## Mini Projects

### Mini Project 1 — Live Health Status API
Endpoint `/health` returns: uptime, timestamp, env, memory usage.
Already built in Step 5. Used by Load Balancers to check instance health.

### Mini Project 2 — Simple URL Shortener API
```js
const store = {};

app.post('/shorten', (req, res) => {
  const { url } = req.body;
  const code = Math.random().toString(36).substring(2, 7);
  store[code] = url;
  res.json({ short: `http://<YOUR_IP>/${code}` });
});

app.get('/:code', (req, res) => {
  const url = store[req.params.code];
  if (!url) return res.status(404).json({ error: 'Not found' });
  res.redirect(url);
});
```

Test:
```bash
curl -X POST http://<IP>/shorten -H "Content-Type: application/json" -d '{"url":"https://google.com"}'
# Returns: { "short": "http://<IP>/abc12" }
# Visit that URL in browser → redirects to google.com
```

---

## Interview Questions & Answers

### Q1: App running but can't reach from browser — what do you check?
1. App actually running? (`pm2 status` or `curl localhost:3000`)
2. Port open in Security Group?
3. Nginx running? (`sudo systemctl status nginx`)
4. Correct public/Elastic IP?
5. Instance in public subnet with internet gateway?

### Q2: EC2 vs Lambda — when do you use which?
| EC2 | Lambda |
|---|---|
| Long-running processes | Short-lived, event-driven |
| WebSocket / persistent connections | REST APIs, triggers |
| Full OS control needed | No server management |
| Predictable high traffic | Spiky/unpredictable traffic |

### Q3: How do you deploy new code without downtime?
- `pm2 reload` — graceful restart (cluster mode, zero downtime)
- Load Balancer + rolling deploy via Auto Scaling
- Blue/Green deployment

### Q4: Why not expose Node.js directly on port 80?
- Port 80 requires root on Linux — running Node as root is dangerous
- Nginx handles SSL termination, gzip, rate limiting, static files
- Nginx is battle-hardened for raw internet traffic
- Single Nginx can proxy to multiple Node processes

### Q5: How does PM2 cluster mode work?
PM2 uses Node.js's built-in `cluster` module. It forks one worker process per CPU core, all listening on the same port. The master distributes connections round-robin. Worker crashes → master spawns replacement immediately.

### Q6: pm2 restart vs pm2 reload — what's the difference?
- `pm2 restart` — kills all workers then starts fresh → brief downtime
- `pm2 reload` — starts new workers first, drains old ones, kills them → zero downtime
- Always use `reload` in production with cluster mode

### Q7: Nginx logs 127.0.0.1 for all requests — how do you get real client IP in Node.js?
```js
app.set('trust proxy', 1);  // trust first proxy (Nginx)
// Now req.ip returns real client IP from X-Forwarded-For header
```

### Q8: EC2 instance gets high CPU — how do you debug?
1. `pm2 monit` — which process consuming CPU
2. `top` or `htop` — system-level view
3. Check if Node process is in a CPU loop (blocking event loop)
4. Check Nginx access logs for request spike: `sudo tail -f /var/log/nginx/access.log`
5. Consider horizontal scaling via Auto Scaling Group (Phase 3)

---

## Mistakes to Avoid

| Mistake | Why Dangerous | Fix |
|---|---|---|
| Port 22 open to `0.0.0.0/0` | Server brute-forced in minutes | Restrict to My IP |
| No Elastic IP | IP changes on restart → breaks domain/DNS | Allocate + attach |
| Running Node as root | Security risk + port 80 issues | Use `ubuntu` user + Nginx |
| No PM2 / process manager | App dies, never recovers | Install PM2 |
| Forgot `pm2 save` after startup | App gone after reboot | Always save after startup |
| Port 3000 open in production | Bypasses Nginx security layer | Remove after Nginx setup |
| SSH password auth enabled | Brute-force attack surface | Key pair only |
| No log rotation | Disk fills up → app crashes | pm2-logrotate |
| Hardcoded env vars in code | Secrets leak in repo | Use .env + dotenv |

---

## Production Checklist

```
[ ] EC2 instance running (Ubuntu 22.04, t2.micro)
[ ] Elastic IP allocated and attached
[ ] Security group: port 22 (My IP), port 80 + 443 (Anywhere only)
[ ] Port 3000 removed from Security Group
[ ] Node.js + Git installed
[ ] App cloned/created and running
[ ] ecosystem.config.js created
[ ] PM2 running in cluster mode with ecosystem file
[ ] pm2 startup command run
[ ] pm2 save done
[ ] pm2-logrotate installed and configured
[ ] Nginx installed and proxying to port 3000
[ ] Nginx enabled (systemctl enable nginx)
[ ] Nginx config tested (nginx -t passes)
[ ] NODE_ENV=production set
[ ] .env file created, .gitignore updated
[ ] SSL configured (if domain available)
[ ] /health endpoint working
```

---

## Key Rules (Senior Engineer Mindset)

- Always attach IAM Role to EC2 — never hardcode AWS keys
- Security Group = first line of defense, keep it minimal
- Never expose Node.js directly — Nginx sits in front
- PM2 cluster mode is non-negotiable for production
- Elastic IP is required if you use a domain
- Zero-downtime deploy = `pm2 reload`, not `pm2 restart`
- Rotate logs — a full disk kills your app silently
- Minimal open ports = minimal attack surface
