#!/usr/bin/env bash
# deploy.sh — one-command EC2 setup for rds-crud-api
# Run on a fresh Ubuntu 22.04 EC2 instance:
#   bash deploy.sh
set -e

echo "==> Updating system packages"
sudo apt update && sudo apt upgrade -y

echo "==> Installing Git"
sudo apt install -y git postgresql-client

echo "==> Installing Node.js v20"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Installing Nginx"
sudo apt install -y nginx
sudo systemctl enable nginx

echo "==> Installing app dependencies"
cd ~/app
npm install --omit=dev

echo "==> Please create your .env now:"
echo "    cp .env.example .env && nano .env"
echo ""
echo "==> After editing .env, run the following to continue:"
echo "    bash deploy-step2.sh"
