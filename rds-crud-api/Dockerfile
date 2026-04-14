# ── Stage: production image ───────────────────────────────────────────────────
# Use Alpine for a minimal, ~5MB base OS (vs ~900MB ubuntu)
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy dependency files first — Docker caches this layer
# If package.json doesn't change, npm install is skipped on rebuilds
COPY package*.json ./

# Install only production dependencies (skip devDependencies like nodemon)
RUN npm ci --omit=dev

# Copy the rest of the app source code
COPY . .

# Create a non-root user for security (never run as root in prod)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Document which port the app listens on (informational only — does not publish it)
EXPOSE 3000

# The command that runs when the container starts
CMD ["node", "index.js"]
