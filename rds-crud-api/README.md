# RDS CRUD API — Blog App

A Node.js REST API backed by **AWS RDS PostgreSQL**.  
Runs locally with a `.env` file. Runs on EC2 with an IAM Role (no hardcoded credentials).

---

## Architecture

```
Browser / Postman / curl
        │
        │  HTTP request
        ▼
   EC2 Instance (Ubuntu 22.04)
   ┌──────────────────────────────────────┐
   │  Nginx (port 80)                     │
   │    └── reverse proxy → port 3000     │
   │         ▼                            │
   │  PM2 → Node.js / Express             │
   │    ├── /api/users  (CRUD)            │
   │    └── /api/posts  (CRUD)            │
   └──────────────┬───────────────────────┘
                  │  pg (port 5432, SSL)
                  ▼
   RDS PostgreSQL (private subnet)
   ┌──────────────────────────────────────┐
   │  Database: blogapp                   │
   │  Tables:   users, posts              │
   │  Access:   EC2 Security Group only   │
   └──────────────────────────────────────┘
```

---

## API Endpoints

| Method | Endpoint            | Description                      |
|--------|---------------------|----------------------------------|
| GET    | `/`                 | List all endpoints               |
| GET    | `/health`           | Health check                     |
| GET    | `/api/users`        | List all users                   |
| GET    | `/api/users/:id`    | Get a single user                |
| POST   | `/api/users`        | Create a user                    |
| PUT    | `/api/users/:id`    | Update a user (partial)          |
| DELETE | `/api/users/:id`    | Delete a user (cascades posts)   |
| GET    | `/api/posts`        | List all posts                   |
| GET    | `/api/posts?user_id=1` | List posts by user            |
| GET    | `/api/posts/:id`    | Get a single post                |
| POST   | `/api/posts`        | Create a post                    |
| PUT    | `/api/posts/:id`    | Update a post (partial)          |
| DELETE | `/api/posts/:id`    | Delete a post                    |

---

## Project Structure

```
rds-crud-api/
├── index.js                     # Express entry point
├── ecosystem.config.js          # PM2 config
├── deploy.sh                    # EC2 setup — step 1
├── deploy-step2.sh              # EC2 setup — step 2 (after .env)
├── .env.example                 # Environment variable template
├── aws/
│   └── iam-policy.json          # IAM policy for EC2 role
└── src/
    ├── config/db.js             # PostgreSQL connection pool
    ├── routes/
    │   ├── users.js             # User CRUD routes
    │   └── posts.js             # Post CRUD routes
    ├── middleware/errorHandler.js
    └── db/
        ├── schema.sql           # Table definitions
        └── migrate.js           # Migration runner
```

---

## Part 1 — AWS Console: Create the RDS Instance

### Step 1 — Create a DB Subnet Group

RDS needs subnets in at least 2 Availability Zones before it can launch.

1. Go to **RDS → Subnet groups → Create DB subnet group**
2. Fill in:
   - **Name:** `zeenat-db-subnet-group`
   - **Description:** Subnet group for RDS PostgreSQL
   - **VPC:** your VPC (default VPC is fine for this project)
3. Under **Add subnets**, select subnets from **at least 2 AZs**:
   - e.g., one in `ap-south-1a`, one in `ap-south-1b`
4. Click **Create**

---

### Step 2 — Launch the RDS Instance

1. Go to **RDS → Databases → Create database**
2. Choose:
   - **Creation method:** Standard Create
   - **Engine:** PostgreSQL
   - **Engine version:** 16.x (latest)
   - **Template:** Free tier
3. **Settings:**
   - DB instance identifier: `zeenat-postgres`
   - Master username: `zeenatadmin`
   - Master password: choose a strong password — save it, you'll need it in `.env`
4. **Instance configuration:**
   - DB instance class: `db.t3.micro` (free tier)
5. **Storage:**
   - Storage type: `gp2`
   - Allocated storage: `20 GiB`
   - **Uncheck** "Enable storage autoscaling" (avoids surprise costs while learning)
6. **Connectivity:**
   - VPC: your VPC
   - DB subnet group: `zeenat-db-subnet-group`
   - **Public access: No** ← critical — DB must NOT be reachable from internet
   - VPC security group: select **Create new**
     - New security group name: `rds-postgres-sg`
   - Availability zone: No preference
   - Database port: `5432`
7. **Database authentication:** Password authentication
8. **Additional configuration:**
   - Initial database name: `blogapp`
   - Enable automated backups: yes, 7 days retention
   - Enable encryption: yes (default)
   - Everything else: leave as default
9. Click **Create database** — takes ~5 minutes

After it's created, go to the instance and copy the **Endpoint** — it looks like:

```
zeenat-postgres.xxxxxxxxxxxxxxxx.ap-south-1.rds.amazonaws.com
```

This is your `DB_HOST`. It never changes.

---

### Step 3 — Configure Security Groups

This is the most security-critical step. RDS must only accept connections from your EC2.

#### Find your EC2's Security Group ID

1. Go to **EC2 → Instances → your instance → Security tab**
2. Copy the **Security Group ID** — looks like `sg-0abc123def456789`

#### Update the RDS Security Group

1. Go to **EC2 → Security Groups**
2. Find and click `rds-postgres-sg`
3. Click **Inbound rules → Edit inbound rules**
4. **Delete** any existing rules
5. Click **Add rule:**
   - Type: `PostgreSQL`
   - Port range: `5432`
   - Source: **Custom** → paste your EC2's Security Group ID (e.g., `sg-0abc123def456789`)
6. Click **Save rules**

**Why reference the SG, not the IP?**  
EC2 public IPs change on every stop/start. Security Group IDs are permanent.  
Any EC2 in that SG — whether 1 instance or 10 — automatically gets access.

#### Verify no public access

1. RDS → your instance → **Connectivity & security** tab
2. Confirm: **Publicly accessible: No**

---

### Step 4 — (Optional) Store Password in AWS Secrets Manager

For production, never put your DB password in a `.env` file on disk.

1. Go to **Secrets Manager → Store a new secret**
2. Secret type: **Credentials for Amazon RDS database**
3. Username: `zeenatadmin`, Password: your RDS password
4. Database: select `zeenat-postgres`
5. Secret name: `zeenat-app/db-credentials`
6. Click **Store**

Then attach the `SecretsManagerReadWrite` policy to your EC2 IAM Role (or use the scoped policy in `aws/iam-policy.json`).

For this project, using `.env` on the EC2 instance is acceptable.

---

## Part 2 — Run Locally

### Prerequisites
- Node.js v18+ installed
- PostgreSQL client (`psql`) installed locally, or connect via EC2
- RDS instance running and security group allowing your local IP (for local dev only — revert after)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/rds-crud-api.git
cd rds-crud-api

# 2. Install dependencies
npm install

# 3. Create .env
cp .env.example .env
```

Edit `.env` with your RDS values:
```env
NODE_ENV=development
PORT=3000
APP_NAME=rds-crud-api
AWS_REGION=ap-south-1
DB_HOST=zeenat-postgres.xxxxxxxx.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=blogapp
DB_USER=zeenatadmin
DB_PASSWORD=YourStrongPassword123!
DB_SSL=true
```

```bash
# 4. Run the DB migration (creates tables)
npm run migrate

# 5. Start the dev server
npm run dev

# 6. Test
curl http://localhost:3000/health
```

---

## Part 3 — Deploy on EC2

### Prerequisites
- EC2 instance running (Ubuntu 22.04, t2.micro)
- Security group on EC2: port 22 (My IP), port 80 (0.0.0.0/0)
- EC2 IAM Role with the policy in `aws/iam-policy.json` attached
- RDS `rds-postgres-sg` inbound rule pointing to EC2's Security Group ID (Step 3 above)

---

### Step 1 — SSH into EC2

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

### Step 2 — Clone the Repo and Run Deploy Step 1

```bash
git clone https://github.com/<your-username>/rds-crud-api.git ~/app
cd ~/app
bash deploy.sh
```

This installs: Node.js, PM2, Nginx, postgresql-client, app dependencies.

---

### Step 3 — Configure `.env` on EC2

```bash
cp .env.example .env
nano .env
```

On EC2, your `.env` does **not** need `AWS_PROFILE` — the IAM Role handles auth:

```env
NODE_ENV=production
PORT=3000
APP_NAME=rds-crud-api
AWS_REGION=ap-south-1
DB_HOST=zeenat-postgres.xxxxxxxx.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=blogapp
DB_USER=zeenatadmin
DB_PASSWORD=YourStrongPassword123!
DB_SSL=true
```

---

### Step 4 — Verify DB Connectivity from EC2

Before starting the app, confirm EC2 can reach RDS:

```bash
psql -h zeenat-postgres.xxxxxxxx.ap-south-1.rds.amazonaws.com \
     -U zeenatadmin \
     -d blogapp \
     -p 5432
# enter your password when prompted
# you should see: blogapp=>
# type \q to exit
```

If this **hangs** (not refused — just hangs), the security group is blocking.  
Go back to Step 3 and verify the inbound rule on `rds-postgres-sg`.

---

### Step 5 — Run Deploy Step 2

```bash
bash deploy-step2.sh
```

This:
- Runs the DB migration (creates `users` and `posts` tables)
- Configures Nginx as a reverse proxy on port 80
- Starts the app with PM2
- Configures PM2 to auto-start on reboot

---

### Step 6 — Verify Deployment

```bash
# Check app is running
pm2 status

# View logs
pm2 logs rds-crud-api

# Test from EC2
curl http://localhost:3000/health

# Test from your local machine
curl http://<EC2-PUBLIC-IP>/health
```

Expected response:
```json
{
  "status": "healthy",
  "app": "rds-crud-api",
  "env": "production",
  "db": "zeenat-postgres.xxxxxxxx.ap-south-1.rds.amazonaws.com",
  "uptime": "4.21s",
  "timestamp": "2026-04-09T10:00:00.000Z"
}
```

---

## Part 4 — Test All Endpoints

Replace `BASE` with your EC2 public IP or `http://localhost:3000` for local testing.

```bash
BASE=http://<EC2-PUBLIC-IP>

# ── Users ────────────────────────────────────────

# Create user 1
curl -s -X POST $BASE/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Zeenat","email":"zeenat@example.com"}' | jq

# Create user 2
curl -s -X POST $BASE/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Zeenat","email":"zeenat@example.com"}' | jq

# List all users
curl -s $BASE/api/users | jq

# Get user by ID
curl -s $BASE/api/users/1 | jq

# Update user name
curl -s -X PUT $BASE/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Zeenat Updated"}' | jq

# ── Posts ────────────────────────────────────────

# Create post for user 1
curl -s -X POST $BASE/api/posts \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"title":"My First Post","body":"Hello from RDS!"}' | jq

# Create second post for user 1
curl -s -X POST $BASE/api/posts \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"title":"Learning AWS","body":"EC2 + RDS + S3"}' | jq

# List all posts
curl -s $BASE/api/posts | jq

# List posts by user
curl -s "$BASE/api/posts?user_id=1" | jq

# Get single post
curl -s $BASE/api/posts/1 | jq

# Update post
curl -s -X PUT $BASE/api/posts/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title"}' | jq

# Delete post
curl -s -X DELETE $BASE/api/posts/1
# → 204 No Content (no body)

# Delete user (also deletes their posts — ON DELETE CASCADE)
curl -s -X DELETE $BASE/api/users/2
# → 204 No Content

# Trigger a 404
curl -s $BASE/api/users/999 | jq
# → {"error": "User not found"}

# Try duplicate email
curl -s -X POST $BASE/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Dupe","email":"zeenat@example.com"}' | jq
# → {"error": "Email already exists"}
```

---

## PM2 Management

```bash
pm2 status                    # view running apps
pm2 logs rds-crud-api         # live logs
pm2 reload rds-crud-api       # zero-downtime reload (after .env change)
pm2 restart rds-crud-api      # full restart
pm2 monit                     # real-time CPU/RAM monitor
```

---

## Database Access (from EC2)

```bash
# Connect to RDS directly
psql -h $DB_HOST -U zeenatadmin -d blogapp

# Useful psql commands
\dt               # list tables
\d users          # describe users table
SELECT * FROM users;
SELECT * FROM posts;
\q                # quit
```

---

## Troubleshooting

| Problem | Symptom | Fix |
|---------|---------|-----|
| SG misconfigured | `psql` hangs, never connects | Check `rds-postgres-sg` inbound rule — source must be EC2's SG ID |
| Wrong DB_HOST | `getaddrinfo ENOTFOUND` | Copy endpoint from RDS console → Connectivity & security |
| Wrong password | `password authentication failed` | Update `.env` DB_PASSWORD, run `pm2 reload rds-crud-api` |
| Tables don't exist | `relation "users" does not exist` | Run `npm run migrate` |
| App not restarting after reboot | App down after EC2 restart | Run `pm2 startup` then `pm2 save` |
| Nginx 502 | Browser gets 502 Bad Gateway | App crashed — check `pm2 status` and `pm2 logs` |
| Port 80 unreachable | Browser times out | EC2 Security Group missing inbound port 80 rule |

---

## Security Notes

- RDS has **no public IP** — only reachable from inside the VPC
- DB password is in `.env` on disk (acceptable for solo dev). For teams: use **AWS Secrets Manager**
- SSL is enabled for all production connections (`ssl: { rejectUnauthorized: false }`)
- All SQL uses **parameterized queries** (`$1`, `$2`) — no SQL injection possible
- IAM Role on EC2 means no AWS access keys are stored on the server
