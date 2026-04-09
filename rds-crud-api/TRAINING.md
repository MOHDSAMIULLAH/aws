# Copilot Training Mode — Full System Rebuild Guide

> Use these prompts in GitHub Copilot / Cursor to rebuild this entire project from scratch.
> Goal: Understand + Practice + Never forget.

---

## Complete Flow

```
Postman / Browser
        ↓
EC2 (Node.js API via PM2)
        ↓ (SSL connection)
RDS PostgreSQL (private)
```

---

## Step 1 — Project Setup (Node.js + Express)

```
You are a senior backend engineer.

Create a Node.js Express project with PostgreSQL (pg library).

Requirements:
- Use Express
- Use pg Pool
- Use .env
- Folder structure:
    src/config/db.js
    src/routes/users.js
    src/routes/posts.js
    src/db/migrate.js
- Add /health route
- Clean production-ready code

Output only code.
```

---

## Step 2 — Database Schema + Migration

```
Create PostgreSQL schema and migration logic.

Requirements:
- users table: id, name, email (unique), created_at
- posts table: id, user_id (FK), title, body, created_at
- ON DELETE CASCADE
- Write schema.sql
- Write migrate.js

Use pg Pool. Output only code.
```

---

## Step 3 — Fix DB Connection (AWS RDS)

```
Fix PostgreSQL connection for AWS RDS.

Requirements:
- Use pg Pool
- Read env variables
- Add SSL: { rejectUnauthorized: false }
- Handle errors properly

Output only db.js
```

---

## Step 4 — CRUD APIs

```
Create CRUD APIs for users and posts.

Requirements:
- REST endpoints
- async/await
- parameterized queries ($1)
- error handling
- JSON responses

Output only code.
```

---

## Step 5 — .env Setup

```
Generate .env.example

Include:
NODE_ENV
PORT
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
DB_SSL
```

---

## Step 6 — AWS RDS Setup

```
Write step-by-step AWS RDS PostgreSQL setup.

Include:
- DB subnet group
- RDS instance
- Private access (no public)
- Security group (EC2 → RDS only)
- Endpoint usage
```

---

## Step 7 — EC2 Deployment Scripts

```
Write EC2 deployment scripts.

Requirements:
- Install Node.js
- Install PM2
- Install Nginx
- Install PostgreSQL client
- Clone repo
- Install deps
- Setup env
- Run migration
- Start app

Output: deploy.sh, deploy-step2.sh
```

---

## Step 8 — PM2 Setup

```
Create ecosystem.config.js

Requirements:
- Name: rds-crud-api
- Entry: index.js
- Cluster mode
- Auto restart
- Load env
```

---

## Step 9 — Nginx Setup

```
Write Nginx config

Requirements:
- Port 80
- Proxy to 3000
- Production-ready
```

---

## Step 10 — Debugging Guide

```
Explain these errors with fixes:
- ENOTFOUND             → wrong DB host
- timeout               → security group issue
- password auth failed  → wrong password
- no pg_hba.conf entry  → SSL missing
- EADDRINUSE            → port already in use
```

---

## Core Concepts

| Concept | What it does |
|---|---|
| Security Group | Firewall — controls who can access |
| SSH | Remote login to EC2 |
| psql | Direct DB communication |
| SSL | Secure DB connection (mandatory for RDS) |
| PM2 | Keeps app running after disconnect/reboot |
| Nginx | Exposes app on port 80 to the public |

---

## Practice Routine

Repeat until muscle memory:

```bash
# 1. Delete and re-clone
rm -rf ~/app
git clone https://github.com/<your-username>/rds-crud-api.git ~/app
cd ~/app

# 2. Setup env
cp .env.example .env
nano .env

# 3. Install + migrate
npm install
npm run migrate

# 4. Start app
pm2 start ecosystem.config.js --env production

# 5. Verify app
curl http://localhost:3000/health

# 6. Verify DB
psql -h $DB_HOST -U zeenatadmin -d blogapp
# blogapp=> SELECT * FROM users;
```

---

## Debugging Mindset

Every problem falls into one of five categories:

| Category | Check |
|---|---|
| Network | Security Groups — is the port open? is the source correct? |
| Auth | Username / Password in `.env` |
| Config | `.env` values — DB_HOST, DB_NAME, DB_PORT |
| Code | `db.js` SSL config, route files |
| Runtime | PM2 status, port conflicts (`lsof -i :3000`) |

---

## Final Goal

You can call yourself production-ready when you can:

- [ ] Create an RDS instance from scratch (subnet group, SG, endpoint)
- [ ] SSH into EC2 and deploy the app without the deploy script
- [ ] Run migrations and verify tables with `psql`
- [ ] Debug a failed DB connection from the error message alone
- [ ] Explain why the SG rule uses a Security Group ID, not an IP
