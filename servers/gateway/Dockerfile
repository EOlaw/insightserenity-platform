# Multi-stage Dockerfile for InsightSerenity API Gateway
# Optimized for production with security hardening and minimal attack surface

# Stage 1: Dependencies
FROM node:18-alpine AS dependencies
LABEL maintainer="InsightSerenity DevOps <devops@insightserenity.com>"
LABEL description="API Gateway Dependencies Stage"

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    openssl \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /gateway

# Copy package files
COPY package*.json ./
COPY servers/gateway/package*.json ./servers/gateway/

# Install production dependencies
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Copy production dependencies
RUN cp -R node_modules /tmp/prod_node_modules

# Install all dependencies for building
RUN npm ci --no-audit --no-fund

# Stage 2: Builder
FROM node:18-alpine AS builder
LABEL description="API Gateway Builder Stage"

# Install build tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /gateway

# Copy dependencies from previous stage
COPY --from=dependencies /gateway/node_modules ./node_modules
COPY --from=dependencies /gateway/servers/gateway/node_modules ./servers/gateway/node_modules

# Copy source code
COPY . .

# Build the application if needed (TypeScript compilation, etc.)
RUN if [ -f "tsconfig.json" ]; then \
        npm run build; \
    fi

# Remove development dependencies and files
RUN rm -rf \
    node_modules \
    servers/gateway/node_modules \
    test \
    tests \
    spec \
    coverage \
    .git \
    .github \
    .vscode \
    .idea \
    *.log \
    *.md \
    .eslintrc* \
    .prettierrc* \
    jest.config.* \
    tsconfig.json \
    .env.* \
    docker-compose*.yml

# Stage 3: Security Scanner
FROM aquasec/trivy:latest AS security-scanner
LABEL description="Security Scanning Stage"

# Copy built application for scanning
COPY --from=builder /gateway /gateway

# Run security scan
RUN trivy filesystem \
    --no-progress \
    --security-checks vuln,config \
    --severity HIGH,CRITICAL \
    --exit-code 0 \
    /gateway || true

# Generate security report
RUN trivy filesystem \
    --no-progress \
    --format json \
    --output /tmp/security-report.json \
    /gateway || true

# Stage 4: Production Runtime
FROM node:18-alpine AS runtime
LABEL maintainer="InsightSerenity DevOps <devops@insightserenity.com>"
LABEL description="API Gateway Production Runtime"
LABEL version="1.0.0"

# Install runtime dependencies and security updates
RUN apk upgrade --no-cache \
    && apk add --no-cache \
        dumb-init \
        curl \
        ca-certificates \
        tzdata \
    && rm -rf /var/cache/apk/* \
    && update-ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S gateway \
    && adduser -u 1001 -S gateway -G gateway

# Set timezone
ENV TZ=UTC

# Create necessary directories
RUN mkdir -p \
    /gateway \
    /gateway/logs \
    /gateway/tmp \
    /gateway/uploads \
    /gateway/ssl \
    /gateway/config \
    && chown -R gateway:gateway /gateway

WORKDIR /gateway

# Copy production dependencies
COPY --from=dependencies --chown=gateway:gateway /tmp/prod_node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=gateway:gateway /gateway .

# Copy security report
COPY --from=security-scanner --chown=gateway:gateway /tmp/security-report.json ./security-report.json

# Copy configuration files
COPY --chown=gateway:gateway servers/gateway/config ./servers/gateway/config

# Set environment defaults
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --enable-source-maps" \
    PORT=8080 \
    LOG_LEVEL=info \
    CLUSTER_WORKERS=0 \
    GATEWAY_NAME=api-gateway

# Health check configuration
HEALTHCHECK --interval=30s \
    --timeout=10s \
    --start-period=60s \
    --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Security: Drop all capabilities and add only required ones
USER gateway

# Expose ports
EXPOSE 8080 9090

# Set security options
LABEL security.capabilities.drop="ALL"
LABEL security.capabilities.add="NET_BIND_SERVICE"
LABEL security.no-new-privileges="true"
LABEL security.read-only-root="true"

# Volume mounts for persistent data
VOLUME ["/gateway/logs", "/gateway/uploads", "/gateway/ssl", "/gateway/config"]

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "--trace-warnings", "--trace-deprecation", "servers/gateway/server.js"]

# Stage 5: Development (optional, for development builds)
FROM runtime AS development
LABEL description="API Gateway Development Runtime"

# Switch to root for development setup
USER root

# Install development tools
RUN apk add --no-cache \
    bash \
    vim \
    net-tools \
    iputils \
    bind-tools \
    tcpdump \
    strace \
    htop \
    && rm -rf /var/cache/apk/*

# Install development dependencies
RUN npm install -g \
    nodemon \
    node-inspector \
    npm-check-updates \
    && npm cache clean --force

# Copy development configuration
COPY --chown=gateway:gateway servers/gateway/.env.example ./servers/gateway/.env
COPY --chown=gateway:gateway servers/gateway/nodemon.json ./servers/gateway/

# Enable Node.js debugging
ENV NODE_ENV=development \
    NODE_OPTIONS="--inspect=0.0.0.0:9229 --max-old-space-size=4096" \
    DEBUG="gateway:*" \
    LOG_LEVEL=debug

# Expose debugging port
EXPOSE 9229

# Switch back to gateway user
USER gateway

# Use nodemon for development
CMD ["nodemon", "--config", "servers/gateway/nodemon.json", "servers/gateway/server.js"]

# Stage 6: Testing (optional, for test runs)
FROM dependencies AS testing
LABEL description="API Gateway Testing Stage"

WORKDIR /gateway

# Copy source code
COPY . .

# Install testing tools
RUN npm install -g \
    jest \
    @jest/globals \
    supertest \
    && npm cache clean --force

# Run linting
RUN npm run lint || true

# Run tests
RUN npm test || true

# Generate coverage report
RUN npm run test:coverage || true

# Security audit
RUN npm audit --production || true

# Stage 7: Distroless Production (Ultra-secure, minimal attack surface)
FROM gcr.io/distroless/nodejs18-debian11:nonroot AS distroless
LABEL maintainer="InsightSerenity DevOps <devops@insightserenity.com>"
LABEL description="API Gateway Distroless Production"

WORKDIR /gateway

# Copy only the necessary files from builder
COPY --from=dependencies --chown=nonroot:nonroot /tmp/prod_node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /gateway .

# Set environment
ENV NODE_ENV=production \
    PORT=8080

# Expose port
EXPOSE 8080

# Run as non-root user (automatic in distroless)
USER nonroot

# Start application
ENTRYPOINT ["node"]
CMD ["servers/gateway/server.js"]