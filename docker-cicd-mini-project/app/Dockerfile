# ─────────────────────────────────────────────────────────────
# STAGE 1 – deps
#   Install ONLY production dependencies.
#   Separating this layer means Docker cache skips npm install
#   on every build unless package.json actually changes.
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests only — everything else is excluded so the
# layer is invalidated only when dependencies change.
COPY package*.json ./

# npm ci = clean install, reproducible, faster than npm install
# --omit=dev skips nodemon, jest, etc. from the final image
RUN npm ci --omit=dev


# ─────────────────────────────────────────────────────────────
# STAGE 2 – production image
#   Copies pre-built node_modules from stage 1.
#   Result: zero build tools end up in the shipped image.
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root user inside the container
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Pull pre-installed deps from the "deps" stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Set ownership so appuser can read/write the app dir
RUN chown -R appuser:appgroup /app

USER appuser

# Informational — does NOT publish the port externally
EXPOSE 3000

# Prefer exec form (avoids a shell wrapper process)
CMD ["node", "index.js"]
