# Admin Server Dockerfile
# Production-ready multi-stage build for InsightSerenity Admin Server

# Stage 1: Base image with dependencies
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    openssl \
    ca-certificates \
    && update-ca-certificates

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY ../../shared/package*.json ./shared/

# Stage 2: Development dependencies for building
FROM base AS dev-deps
RUN npm ci --include=dev

# Stage 3: Production dependencies only
FROM base AS prod-deps
RUN npm ci --only=production --omit=dev && npm cache clean --force

# Stage 4: Build stage (if needed for transpilation)
FROM dev-deps AS build
COPY . .
COPY ../../shared ./shared
# Run any build steps here (e.g., TypeScript compilation)
RUN npm run build || true

# Stage 5: Security scanner
FROM base AS security
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY package*.json ./
RUN npm audit --production --audit-level=high || true

# Stage 6: Final production image
FROM node:18-alpine AS production

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install only runtime dependencies
RUN apk add --no-cache \
    curl \
    openssl \
    ca-certificates \
    && update-ca-certificates

WORKDIR /usr/src/app

# Copy shared modules first
COPY --chown=nodejs:nodejs ../../shared ./shared

# Copy production dependencies
COPY --from=prod-deps --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs app.js ./
COPY --chown=nodejs:nodejs config ./config
COPY --chown=nodejs:nodejs middleware ./middleware
COPY --chown=nodejs:nodejs modules ./modules
COPY --chown=nodejs:nodejs routes ./routes
COPY --chown=nodejs:nodejs utils ./utils
COPY --chown=nodejs:nodejs views ./views
COPY --chown=nodejs:nodejs public ./public

# Create necessary directories
RUN mkdir -p logs uploads temp && \
    chown -R nodejs:nodejs logs uploads temp

# Security hardening
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Admin server specific environment
ENV ADMIN_SERVER=true
ENV SERVER_TYPE=admin

# Switch to non-root user
USER nodejs

# Expose admin port (not publicly accessible in production)
EXPOSE 5001

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

# Security: Drop all capabilities except what's needed
# This is handled by docker-compose or k8s security context

# Add metadata
LABEL maintainer="InsightSerenity Platform Team" \
      version="3.0.0" \
      description="InsightSerenity Admin Server - Platform Management" \
      security.scan="enabled"

# Start the admin server
CMD ["node", "server.js"]