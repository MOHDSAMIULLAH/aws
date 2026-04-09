# Zeenat S3 Node API

A Node.js REST API that uploads, lists, fetches, and deletes files in AWS S3.  
Runs locally with AWS SSO credentials. Runs on EC2 with an IAM Role (no keys needed).

---

## Architecture — End-to-End Flow

```
Browser / Postman / curl
        │
        │  HTTP request
        ▼
   EC2 Instance (Ubuntu 22.04)
   ┌──────────────────────────────────┐
   │  Nginx (port 80)                 │
   │    └── reverse proxy             │
   │         ▼                        │
   │  PM2 → Node.js app (port 3000)   │
   │    └── Express routes            │
   │         ▼                        │
   │  AWS SDK v3 (@aws-sdk/client-s3) │
   │    └── IAM Role (no hardcoded    │
   │         keys in production)      │
   └────────────┬─────────────────────┘
                │  AWS API call (HTTPS)
                ▼
         S3 Bucket (ap-south-1)
         zeenat-node-uploads/
           └── uploads/<uuid>.ext
```

---

## API Endpoints

| Method | Endpoint             | Description                        |
|--------|----------------------|------------------------------------|
| GET    | `/`                  | List all endpoints                 |
| GET    | `/health`            | Health check (uptime, bucket name) |
| POST   | `/api/upload`        | Upload a file (form-data key: `file`) |
| GET    | `/api/files`         | List all uploaded files            |
| GET    | `/api/file/:key`     | Get a pre-signed URL for a file    |
| DELETE | `/api/file/:key`     | Delete a file from S3              |

**Allowed file types:** jpg, png, webp, pdf  
**Max file size:** 5 MB

---

## Part 1 — Run Locally

### Prerequisites
- Node.js v18+ installed
- AWS CLI configured with SSO (`aws configure sso`)
- An S3 bucket created in `ap-south-1`

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/s3-node-app.git
cd s3-node-app

# 2. Install dependencies
npm install

# 3. Create your .env file
cp .env.example .env

# 4. Edit .env — set your bucket name and SSO profile
nano .env
```

Your `.env` should look like:
```env
NODE_ENV=development
PORT=3000
APP_NAME=zeenat-s3-api
AWS_REGION=ap-south-1
AWS_PROFILE=PowerUserAccess-961014542396   # your SSO profile name
S3_BUCKET_NAME=zeenat-node-uploads         # your bucket name
```

```bash
# 5. Log in with AWS SSO (do this before running the app)
aws sso login --profile PowerUserAccess-961014542396

# 6. Start the dev server
npm run dev

# 7. Test
curl http://localhost:3000/health
```

---

## Part 2 — Deploy on EC2 (Step-by-Step)

### Step 1 — AWS Console: Create IAM Role for EC2

1. Go to **IAM → Roles → Create role**
2. Trusted entity: **AWS service → EC2**
3. Click **Next**, then **Create policy** (JSON tab):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowListBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::zeenat-node-uploads"
    },
    {
      "Sid": "AllowObjectOperations",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::zeenat-node-uploads/*"
    }
  ]
}
```

4. Name the policy: `S3NodeAppPolicy`
5. Attach it to the role, name the role: `EC2-S3-NodeApp-Role`

---

### Step 2 — AWS Console: Launch EC2 Instance

1. Go to **EC2 → Launch Instance**
2. Settings:
   - **AMI:** Ubuntu Server 22.04 LTS
   - **Instance type:** t2.micro (free tier)
   - **Key pair:** create/select one (you'll need the `.pem` file)
   - **Security group — inbound rules:**
     | Port | Protocol | Source    | Reason          |
     |------|----------|-----------|-----------------|
     | 22   | SSH      | My IP     | SSH access      |
     | 80   | HTTP     | 0.0.0.0/0 | Public web      |
   - **IAM instance profile:** select `EC2-S3-NodeApp-Role`
3. Launch the instance.

---

### Step 3 — Connect to EC2 via SSH

```bash
# From your local machine (replace with your EC2 public IP and key file)
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

### Step 4 — Run the Deploy Script

The repo includes `deploy.sh` that sets up everything automatically.

Option A — **Automated (recommended)**:
```bash
# On the EC2 instance, clone and run the deploy script
git clone https://github.com/<your-username>/s3-node-app.git ~/app
cd ~/app
bash deploy.sh
```

Option B — **Manual step-by-step** (if you want to understand what happens):

```bash
# 4a. Update system
sudo apt update && sudo apt upgrade -y

# 4b. Install Git
sudo apt install -y git

# 4c. Install Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x.x

# 4d. Install PM2 (process manager)
sudo npm install -g pm2

# 4e. Install Nginx (reverse proxy)
sudo apt install -y nginx
sudo systemctl enable nginx

# 4f. Clone your repo
git clone https://github.com/<your-username>/s3-node-app.git ~/app
cd ~/app
npm install

# 4g. Create .env
cp .env.example .env
nano .env
```

On EC2, your `.env` is simpler — **no AWS keys needed** (IAM Role handles auth):
```env
NODE_ENV=production
PORT=3000
APP_NAME=zeenat-s3-api
AWS_REGION=ap-south-1
S3_BUCKET_NAME=zeenat-node-uploads
```

```bash
# 4h. Configure Nginx as reverse proxy
sudo nano /etc/nginx/sites-available/zeenat-app
```

Paste this Nginx config:
```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site and reload Nginx
sudo ln -s /etc/nginx/sites-available/zeenat-app /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# 4i. Start app with PM2
cd ~/app
pm2 start ecosystem.config.js --env production

# 4j. Enable PM2 to auto-start on reboot
pm2 startup | tail -1 | bash
pm2 save
```

---

### Step 5 — Verify Deployment

```bash
# Check app is running
pm2 status

# View logs
pm2 logs zeenat-s3-api

# Test from the EC2 instance
curl http://localhost:3000/health

# Test from your local machine (use the EC2 public IP)
curl http://<EC2-PUBLIC-IP>/health
```

Expected response:
```json
{
  "status": "healthy",
  "app": "zeenat-s3-api",
  "env": "production",
  "bucket": "zeenat-node-uploads",
  "uptime": "12.34s",
  "timestamp": "2026-04-09T10:00:00.000Z"
}
```

---

### Step 6 — Test File Upload

```bash
# Upload a file (from your local machine)
curl -X POST http://<EC2-PUBLIC-IP>/api/upload \
  -F "file=@/path/to/image.jpg"

# List files
curl http://<EC2-PUBLIC-IP>/api/files

# Delete a file (use the 'key' from the upload response)
curl -X DELETE "http://<EC2-PUBLIC-IP>/api/file/uploads/<uuid>.jpg"
```

---

## PM2 Management Commands

```bash
pm2 status                          # view all running apps
pm2 logs zeenat-s3-api              # live logs
pm2 reload zeenat-s3-api            # zero-downtime reload (after .env change)
pm2 restart zeenat-s3-api           # full restart
pm2 monit                           # real-time CPU/memory monitor
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `AccessDenied` from S3 | Check IAM Role is attached to EC2 and has correct S3 permissions |
| Port 80 not accessible | Check EC2 Security Group has inbound rule for port 80 |
| App not restarting after reboot | Run `pm2 startup` then `pm2 save` |
| Nginx 502 Bad Gateway | App is not running — check `pm2 status` and `pm2 logs` |
| `Cannot find module` error | Run `npm install` in `~/app` |

---

## Project Structure

```
s3-node-app/
├── index.js                  # Express app entry point
├── ecosystem.config.js       # PM2 cluster config
├── deploy.sh                 # One-command EC2 setup script
├── .env.example              # Environment variable template
├── aws/
│   ├── iam-policy.json       # IAM policy for S3 access
│   └── s3-cors.json          # S3 CORS config
└── src/
    ├── config/s3.js          # S3 client (SSO for local, IAM Role for EC2)
    ├── routes/upload.js      # Upload / list / get / delete routes
    └── middleware/errorHandler.js
```
