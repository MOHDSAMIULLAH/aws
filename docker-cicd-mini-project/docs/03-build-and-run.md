# Build and Run — Step by Step

## Prerequisites
- Docker Desktop installed and running
- Node.js 20+ (for local dev only)

---

## Step 1 — Build the image

```bash
# Navigate into the app folder
cd docker-cicd-mini-project/app

# Build the image
# -t = tag (name:version)
# .  = build context (current folder, where Dockerfile lives)
docker build -t docker-cicd-app:1.0 .
```

What you'll see:
```
[+] Building 12.3s
 => [deps 1/3] FROM node:20-alpine
 => [deps 2/3] COPY package*.json ./
 => [deps 3/3] RUN npm ci --omit=dev
 => [stage-1 1/4] COPY --from=deps /app/node_modules ./node_modules
 => [stage-1 2/4] COPY . .
 => exporting to image
```

Re-run the build (simulate a code change):
```bash
# Edit index.js, then rebuild — notice npm install is CACHED
docker build -t docker-cicd-app:1.0 .
# => [deps 3/3] CACHED   <-- npm install skipped, ~3s total
```

---

## Step 2 — Inspect the image

```bash
# List images
docker images docker-cicd-app

# Check image size
docker image inspect docker-cicd-app:1.0 --format '{{.Size}}' | numfmt --to=iec

# See all layers and their sizes
docker history docker-cicd-app:1.0
```

---

## Step 3 — Run the container

```bash
# -d        = detached (run in background)
# -p 3000:3000  = map host port 3000 → container port 3000
# --name    = give the container a friendly name
# -e        = set environment variable
docker run -d \
  -p 3000:3000 \
  --name my-api \
  -e APP_NAME=docker-cicd-app \
  -e NODE_ENV=production \
  docker-cicd-app:1.0
```

---

## Step 4 — Test it

```bash
# Check health
curl http://localhost:3000/health

# List products
curl http://localhost:3000/api/products

# Get one product
curl http://localhost:3000/api/products/1
```

Expected response from /health:
```json
{
  "status": "healthy",
  "app": "docker-cicd-app",
  "version": "1.0.0",
  "uptime": "5.23s",
  "timestamp": "2026-04-13T10:00:00.000Z"
}
```

---

## Step 5 — Inspect the running container

```bash
# View logs (live)
docker logs -f my-api

# Enter the container shell (for debugging)
docker exec -it my-api sh

# Check which user the process runs as
docker exec my-api whoami
# → appuser

# See container resource usage
docker stats my-api
```

---

## Step 6 — Stop and clean up

```bash
# Stop the container
docker stop my-api

# Remove the container
docker rm my-api

# Remove the image
docker rmi docker-cicd-app:1.0
```

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `port already in use` | Another process on port 3000 | Use `-p 3001:3000` to map to a different host port |
| `Cannot find module` | Source code not copied | Check `.dockerignore` isn't excluding source files |
| `permission denied` | Running as appuser without access | Check `chown` in Dockerfile |
| `no such file: Dockerfile` | wrong working directory | Make sure you `cd` into the `app/` folder first |
| Container exits immediately | App crashes on start | Run `docker logs my-api` to see the error |

---

## One-liner rebuild and restart

```bash
docker stop my-api && docker rm my-api && \
docker build -t docker-cicd-app:1.0 . && \
docker run -d -p 3000:3000 --name my-api docker-cicd-app:1.0
```
