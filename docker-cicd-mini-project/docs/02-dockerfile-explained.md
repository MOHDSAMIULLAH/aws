# Dockerfile Explained — Line by Line

## Our Dockerfile (multi-stage build)

```dockerfile
# ── STAGE 1: deps ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── STAGE 2: production image ─────────────────────────────
FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
CMD ["node", "index.js"]
```

---

## Every instruction explained

### `FROM node:20-alpine AS deps`
- `FROM` sets the base image — Node 20 on Alpine Linux (~5 MB vs ~900 MB Ubuntu)
- `AS deps` names this stage so the second stage can copy from it
- Alpine = tiny Linux distro, ideal for production images

### `WORKDIR /app`
- Creates `/app` inside the container and sets it as the working directory
- All subsequent `COPY` and `RUN` commands execute from here
- Avoids cluttering the root `/` directory

### `COPY package*.json ./`
- Copies `package.json` AND `package-lock.json` into `/app`
- The `*` matches both files in one instruction
- **Why before COPY . .?** — Docker caches layers. If `package.json` doesn't change, the next `RUN npm ci` layer is served from cache. Build goes from ~60s → ~3s on subsequent builds.

### `RUN npm ci --omit=dev`
- `npm ci` = clean install, reads lock file exactly, faster and reproducible
- `--omit=dev` removes nodemon, jest, etc. — nothing you don't need in prod

### `FROM node:20-alpine` (stage 2)
- Fresh Alpine image — no leftover build tools from stage 1
- Stage 1's only job was to produce `node_modules`

### `RUN addgroup -S appgroup && adduser -S appuser -G appgroup`
- Creates a system group and user
- `-S` = system account (no password, no home dir)
- **Why?** Never run production apps as root. If the app is compromised, the attacker has root access to the container (and possibly the host).

### `COPY --from=deps /app/node_modules ./node_modules`
- Grabs the pre-built `node_modules` from stage 1
- The intermediate stage is discarded — it never ships

### `COPY . .`
- Copies your source code into the container
- Files in `.dockerignore` are excluded (node_modules, .env, .git)

### `RUN chown -R appuser:appgroup /app`
- Transfers ownership of all files to appuser before switching to that user

### `USER appuser`
- All commands from this point run as `appuser`, not root

### `EXPOSE 3000`
- Documents that the app listens on port 3000
- Does NOT publish the port — that's done with `-p 3000:3000` at `docker run`

### `CMD ["node", "index.js"]`
- Default command when the container starts
- Exec form (JSON array) is preferred — no shell wrapper, signals go directly to Node
- `ENTRYPOINT` vs `CMD`: CMD can be overridden at runtime; ENTRYPOINT cannot

---

## Layer caching — why order matters

```
Layer 1:  FROM node:20-alpine          ← almost never changes (cached)
Layer 2:  WORKDIR /app                 ← never changes (cached)
Layer 3:  COPY package*.json ./        ← changes only when deps change
Layer 4:  RUN npm ci --omit=dev       ← rerun only when layer 3 changes
Layer 5:  COPY . .                     ← changes on every code edit
Layer 6:  CMD ["node", "index.js"]     ← never changes (cached)
```

Result: most builds only re-run Layer 5. npm install is cached.

---

## Why multi-stage?

```
Single stage:           Multi-stage:
base image              base image
+ npm install tools     + deps stage (discarded)
+ devDependencies       + only node_modules
+ build artifacts       + your source code
= ~400 MB image         = ~120 MB image
```

Multi-stage images are smaller, faster to pull, and have a smaller attack surface.
