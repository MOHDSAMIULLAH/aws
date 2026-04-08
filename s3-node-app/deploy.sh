#!/bin/bash
# ─────────────────────────────────────────────────────────
# EC2 Deploy Script — Zeenat S3 Node API
# Run this once on a fresh Ubuntu 22.04 EC2 instance
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────

set -e  # exit immediately on any error

echo "──────────────────────────────────────────"
echo " Zeenat S3 Node API — EC2 Deploy Script"
echo " Region: ap-south-1 (Mumbai)"
echo "──────────────────────────────────────────"

# ── 1. System update ─────────────────────────
echo "[1/7] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ── 2. Install Git ───────────────────────────
echo "[2/7] Installing Git..."
sudo apt install -y git
git --version

# ── 3. Install Node.js v20 ───────────────────
echo "[3/7] Installing Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
echo "Node: $(node -v) | NPM: $(npm -v)"

# ── 4. Install PM2 ───────────────────────────
echo "[4/7] Installing PM2..."
sudo npm install -g pm2

# ── 5. Install Nginx ─────────────────────────
echo "[5/7] Installing Nginx..."
sudo apt install -y nginx
sudo systemctl enable nginx

# ── 6. Clone repo and install dependencies ───
echo "[6/7] Setting up application..."
APP_DIR="$HOME/app"

if [ -d "$APP_DIR" ]; then
  echo "Directory $APP_DIR exists — pulling latest code..."
  cd "$APP_DIR" && git pull
else
  echo "Cloning repo..."
  # Replace with your actual GitHub repo URL
  git clone https://github.com/<your-username>/s3-node-app.git "$APP_DIR"
  cd "$APP_DIR"
fi

npm install

# ── Create .env if not present ───────────────
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "⚠️  .env created from .env.example"
  echo "    Edit it now: nano $APP_DIR/.env"
  echo "    At minimum set: S3_BUCKET_NAME"
  echo ""
fi

# ── 7. Configure Nginx ───────────────────────
echo "[7/7] Configuring Nginx..."

sudo tee /etc/nginx/sites-available/zeenat-app > /dev/null << 'NGINX'
server {
    listen 80;
    server_name _;

    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

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

    location ~ /\. {
        deny all;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/zeenat-app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# ── Start app with PM2 ───────────────────────
echo "Starting app with PM2..."
cd "$APP_DIR"
pm2 start ecosystem.config.js --env production
pm2 startup | tail -1 | bash   # run the generated systemd command
pm2 save

# ── Done ─────────────────────────────────────
echo ""
echo "✅ Deploy complete!"
echo ""
echo "  App running at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "  Health check:   http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/health"
echo ""
echo "  Next steps:"
echo "  1. Edit .env:         nano $APP_DIR/.env"
echo "  2. Reload app:        pm2 reload zeenat-s3-api"
echo "  3. View logs:         pm2 logs zeenat-s3-api"
echo "  4. Monitor:           pm2 monit"
