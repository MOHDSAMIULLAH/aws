#!/usr/bin/env bash
# deploy-step2.sh — run after .env is configured
set -e

echo "==> Running DB migration"
cd ~/app
npm run migrate

echo "==> Configuring Nginx"
sudo tee /etc/nginx/sites-available/rds-crud-api > /dev/null <<'NGINX'
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
NGINX

sudo ln -sf /etc/nginx/sites-available/rds-crud-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> Starting app with PM2"
pm2 start ecosystem.config.js --env production
pm2 startup | tail -1 | bash
pm2 save

echo ""
echo "==> Deploy complete. Test with:"
echo "    curl http://localhost:3000/health"
