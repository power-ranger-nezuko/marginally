# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build-time OS deps (Prisma binary generation needs openssl)
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig*.json ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client then compile TypeScript
RUN npx prisma generate
RUN npm run build

# Prune dev dependencies so only production deps remain
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Chromium + fonts for Puppeteer (pdf-service uses puppeteer-core)
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      curl

# Tell puppeteer-core where Chromium lives (set at build time; overridable at runtime)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production

# Run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy compiled output + production node_modules + Prisma artifacts
COPY --chown=appuser:appgroup --from=builder /app/dist ./dist
COPY --chown=appuser:appgroup --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=builder /app/prisma ./prisma

EXPOSE 4000

# Run migrations then start the API server.
# Worker and PDF services override this via ECS task definition `command`.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
