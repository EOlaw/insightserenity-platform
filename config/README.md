# InsightSerenity Platform Configuration System

## Comprehensive Technical Documentation for IT Operations

**Version:** 1.0.0  
**Last Updated:** December 2025  
**Audience:** IT Operations, DevOps Engineers, Backend Developers

---

## Executive Summary

The InsightSerenity Configuration System is a centralized YAML-based configuration management solution designed to replace scattered environment variables and hardcoded values across the platform. This system provides a single source of truth for all configuration settings, enabling consistent deployments across development, staging, and production environments.

The system integrates directly with the existing customer-services and admin-server backends, providing type-safe configuration access, automatic environment detection, and runtime validation. By adopting this configuration approach, the platform gains improved maintainability, easier debugging, and seamless CI/CD integration.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [File Structure and Purpose](#2-file-structure-and-purpose)
3. [Configuration Hierarchy](#3-configuration-hierarchy)
4. [Installation and Setup](#4-installation-and-setup)
5. [Integration with Existing Services](#5-integration-with-existing-services)
6. [Usage Guide](#6-usage-guide)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Feature Flags Management](#8-feature-flags-management)
9. [Production Deployment](#9-production-deployment)
10. [Kubernetes Integration](#10-kubernetes-integration)
11. [Troubleshooting Guide](#11-troubleshooting-guide)
12. [Best Practices](#12-best-practices)
13. [Complete Code Examples](#13-complete-code-examples)

---

## 1. System Architecture

### 1.1 Overview

The configuration system operates as a middleware layer between the application code and configuration sources. It aggregates settings from multiple YAML files and environment variables, merges them according to a defined priority hierarchy, and exposes a unified API for accessing configuration values.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ customer-services│  │  admin-server   │  │  shared libs    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                │                                 │
│                    ┌───────────▼───────────┐                    │
│                    │    ConfigLoader API    │                    │
│                    │   config.get()         │                    │
│                    │   config.getSection()  │                    │
│                    │   config.isFeatureEnabled() │               │
│                    └───────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│                    Configuration Layer                           │
│                                │                                 │
│    ┌───────────────────────────▼───────────────────────────┐    │
│    │              Configuration Merger                      │    │
│    │         (Priority-based Deep Merge)                   │    │
│    └───────────────────────────┬───────────────────────────┘    │
│                                │                                 │
│    ┌───────────┬───────────┬───┴───┬───────────┬───────────┐   │
│    │           │           │       │           │           │    │
│    ▼           ▼           ▼       ▼           ▼           ▼    │
│ default.yaml  dev.yaml  staging  prod.yaml  local.yaml  ENV    │
│ (Priority 1)  (Priority 2) .yaml (Priority 2) (Priority 3) VARS │
│                         (Priority 2)                   (Priority 4)│
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 How It Integrates with Your Current System

The configuration system is designed to work alongside your existing InsightSerenity platform structure:

```
insightserenity-platform/
├── config/                          ← NEW: Configuration System
│   ├── index.js                     ← Entry point for all services
│   ├── ConfigLoader.js              ← Core configuration engine
│   ├── default.yaml                 ← Base settings for all environments
│   ├── development.yaml             ← Development overrides
│   ├── staging.yaml                 ← Staging overrides
│   ├── production.yaml              ← Production overrides
│   ├── local.yaml                   ← Personal developer overrides (git-ignored)
│   └── services/
│       ├── customer-services.yaml   ← Customer backend specific settings
│       └── admin-server.yaml        ← Admin backend specific settings
│
├── servers/
│   ├── customer-services/           ← Imports from ../../config
│   │   ├── server.js
│   │   ├── app.js
│   │   └── modules/
│   │
│   └── admin-server/                ← Imports from ../../config
│       ├── server.js
│       ├── app.js
│       └── config/                  ← Existing config (will be replaced)
│
├── shared/
│   └── lib/
│       └── database/                ← Uses getDbConfig() helper
│
└── kubernetes/                      ← ConfigMaps generated from YAML files
```

### 1.3 What Changes in Your System

The configuration system affects the following areas of your platform:

**Server Initialization:** Instead of reading `process.env` variables directly, servers now import configuration from the centralized config module. This provides validated, typed configuration values with sensible defaults.

**Database Connections:** The `getDbConfig()` helper function replaces manual MongoDB URI construction. It automatically selects the correct database settings based on the current environment and merges connection pool options.

**Middleware Configuration:** Security middleware (Helmet, CORS, rate limiting) now reads settings from YAML files, making it easy to adjust security policies without code changes.

**Feature Toggles:** Business features can be enabled or disabled per environment through the `features` section, allowing gradual rollouts and A/B testing.

**Logging Configuration:** Winston logger settings are externalized, allowing IT operations to adjust log levels and outputs without developer intervention.

---

## 2. File Structure and Purpose

### 2.1 Core Configuration Files

**`default.yaml`** serves as the foundation for all configuration. Every setting that the platform requires should have a default value defined here. This file contains approximately 400 lines of configuration covering server settings, database connections, authentication, security, logging, caching, storage, email, and feature flags. When the platform starts, this file is always loaded first, regardless of the environment.

**`development.yaml`** contains overrides specifically for local development. It relaxes security constraints (longer token expiry, disabled CSP, higher rate limits), enables debug logging, and configures services to use local resources. Developers working on the platform will primarily use these settings.

**`staging.yaml`** mirrors production settings but with additional debugging capabilities. It enables all features for pre-release testing, configures staging-specific resources (separate S3 buckets, staging database names), and includes email redirection to prevent accidental customer notifications during testing.

**`production.yaml`** contains hardened settings optimized for security and performance. It enforces strict security policies, disables development tools, configures production-grade connection pools, and enables comprehensive audit logging. This file should rarely change once the platform is deployed.

**`local.yaml`** (created by copying `local.yaml.example`) allows individual developers to override any setting without affecting the repository. Common uses include pointing to personal MongoDB instances, enabling specific features for testing, or adjusting logging verbosity. This file is git-ignored and should never be committed.

### 2.2 Service-Specific Configuration Files

**`services/customer-services.yaml`** contains configuration specific to the customer-facing API server. This includes module enablement flags for client management, document handling, and recruitment services. It also defines API response formats, pagination defaults, file upload limits, and background job settings.

**`services/admin-server.yaml`** contains configuration for the administrative backend. This includes RBAC role definitions, audit logging settings, dashboard widget configuration, and admin-specific security policies like IP whitelisting and brute force protection thresholds.

### 2.3 JavaScript Modules

**`ConfigLoader.js`** is the core engine that handles file loading, merging, validation, and access. It provides the `ConfigLoader` class with methods for retrieving configuration values, checking feature flags, and responding to configuration changes.

**`index.js`** is the entry point that creates and exports a pre-configured instance. It detects the current service based on environment variables and automatically loads the appropriate service-specific configuration.

---

## 3. Configuration Hierarchy

The configuration system uses a priority-based merge strategy where higher-priority sources override lower-priority ones. Understanding this hierarchy is essential for troubleshooting and customization.

### 3.1 Priority Order (Lowest to Highest)

**Priority 1 - default.yaml:** Contains base values that apply to all environments. Every configuration key should exist here with a sensible default.

**Priority 2 - Environment File:** Based on `NODE_ENV`, the system loads `development.yaml`, `staging.yaml`, or `production.yaml`. Values here override `default.yaml`.

**Priority 3 - local.yaml:** If present, values override both default and environment files. Used for personal developer customization.

**Priority 4 - Service File:** When a service name is specified, the corresponding file from `services/` is merged. These settings take precedence over all YAML files.

**Priority 5 - Environment Variables:** The highest priority. Any environment variable that maps to a configuration path will override all file-based settings.

### 3.2 Merge Example

Consider how the `database.customer.options.maxPoolSize` value is determined:

```yaml
# default.yaml
database:
  customer:
    options:
      maxPoolSize: 50

# development.yaml
database:
  customer:
    options:
      maxPoolSize: 10

# production.yaml
database:
  customer:
    options:
      maxPoolSize: 100
```

In development (`NODE_ENV=development`), the final value is `10`.
In production (`NODE_ENV=production`), the final value is `100`.
If `CONFIG_DATABASE__CUSTOMER__OPTIONS__MAXPOOLSIZE=200` is set, the final value becomes `200` regardless of environment.

---

## 4. Installation and Setup

### 4.1 Prerequisites

Ensure the following dependencies are installed in your root `package.json`:

```bash
npm install yamljs chokidar
```

The `yamljs` package parses YAML files, and `chokidar` enables optional file watching for hot reload during development. Note that `yamljs` is already listed in your existing `package.json`.

### 4.2 Directory Creation

Create the configuration directory structure at the platform root:

```bash
mkdir -p config/services
```

### 4.3 File Placement

Copy all configuration files into the appropriate locations:

```
config/
├── index.js
├── ConfigLoader.js
├── default.yaml
├── development.yaml
├── staging.yaml
├── production.yaml
├── local.yaml.example
├── .gitignore
├── README.md
└── services/
    ├── customer-services.yaml
    └── admin-server.yaml
```

### 4.4 Git Configuration

The provided `.gitignore` file excludes sensitive files from version control:

```gitignore
local.yaml
*.secrets.yaml
config-export*.json
```

Ensure this is properly configured before committing.

### 4.5 Initial Local Setup

Each developer should create their personal configuration:

```bash
cp config/local.yaml.example config/local.yaml
```

Edit `local.yaml` to set personal database URIs and preferences.

---

## 5. Integration with Existing Services

### 5.1 Customer Services Server Integration

Update `servers/customer-services/server.js` to use the configuration system:

**Before (current implementation):**
```javascript
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.DATABASE_CUSTOMER_URI || process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

**After (with configuration system):**
```javascript
const express = require('express');
const mongoose = require('mongoose');
const { createServiceConfig, getDbConfig } = require('../../config');

// Initialize configuration for this service
const config = createServiceConfig('customer-services');

const app = express();
const PORT = config.get('server.customerServices.port', 3001);
const HOST = config.get('server.customerServices.host', '0.0.0.0');

// Get database configuration with all options
const dbConfig = getDbConfig('customer');

mongoose.connect(dbConfig.uri, dbConfig.options);

app.listen(PORT, HOST, () => {
    console.log(`Customer Services running on ${HOST}:${PORT}`);
    console.log(`Environment: ${config.getEnvironment()}`);
    console.log(`Database: ${dbConfig.name}`);
});
```

### 5.2 Admin Server Integration

Update `servers/admin-server/server.js` similarly:

```javascript
const express = require('express');
const { createServiceConfig, getDbConfig } = require('../../config');

const config = createServiceConfig('admin-server');
const app = express();

const PORT = config.get('server.adminServer.port', 3000);
const HOST = config.get('server.adminServer.host', '0.0.0.0');

// Database connection
const dbConfig = getDbConfig('admin');
mongoose.connect(dbConfig.uri, dbConfig.options);

// Configure middleware based on settings
if (config.get('security.helmet.enabled', true)) {
    const helmet = require('helmet');
    app.use(helmet(config.getSection('security.helmet')));
}

app.listen(PORT, HOST, () => {
    console.log(`Admin Server running on ${HOST}:${PORT}`);
});
```

### 5.3 Shared Database Connection Manager

Update `shared/lib/database/connection-manager.js`:

```javascript
const mongoose = require('mongoose');
const { getDbConfig, config } = require('../../../config');

class ConnectionManager {
    constructor() {
        this.connections = new Map();
    }

    async getConnection(databaseName) {
        if (this.connections.has(databaseName)) {
            return this.connections.get(databaseName);
        }

        const dbConfig = getDbConfig(databaseName);
        
        const connection = await mongoose.createConnection(
            dbConfig.uri, 
            dbConfig.options
        );

        // Set up connection event handlers
        connection.on('error', (err) => {
            console.error(`Database ${databaseName} error:`, err);
        });

        connection.on('disconnected', () => {
            console.warn(`Database ${databaseName} disconnected`);
        });

        this.connections.set(databaseName, connection);
        return connection;
    }

    async getCustomerConnection() {
        return this.getConnection('customer');
    }

    async getAdminConnection() {
        return this.getConnection('admin');
    }

    async getSharedConnection() {
        return this.getConnection('shared');
    }

    async closeAll() {
        for (const [name, connection] of this.connections) {
            await connection.close();
            console.log(`Closed connection: ${name}`);
        }
        this.connections.clear();
    }
}

module.exports = new ConnectionManager();
```

### 5.4 Middleware Configuration

Update middleware setup to use configuration values:

```javascript
const { config } = require('../../config');

function configureMiddleware(app) {
    // Body parser
    const bodyConfig = config.get('middleware.bodyParser', {});
    app.use(express.json({ 
        limit: bodyConfig.json?.limit || '10mb' 
    }));
    app.use(express.urlencoded({ 
        limit: bodyConfig.urlencoded?.limit || '10mb',
        extended: true 
    }));

    // Compression
    if (config.get('server.customerServices.compression', true)) {
        const compression = require('compression');
        app.use(compression());
    }

    // CORS
    const corsConfig = config.getSection('security.cors');
    if (corsConfig.origins) {
        const cors = require('cors');
        app.use(cors({
            origin: corsConfig.origins,
            methods: corsConfig.methods,
            allowedHeaders: corsConfig.allowedHeaders,
            exposedHeaders: corsConfig.exposedHeaders,
            credentials: corsConfig.credentials,
            maxAge: corsConfig.maxAge
        }));
    }

    // Rate limiting
    const rateLimitConfig = config.getSection('security.rateLimit');
    if (rateLimitConfig.max) {
        const rateLimit = require('express-rate-limit');
        app.use(rateLimit({
            windowMs: rateLimitConfig.windowMs,
            max: rateLimitConfig.max,
            standardHeaders: rateLimitConfig.standardHeaders,
            legacyHeaders: rateLimitConfig.legacyHeaders,
            message: rateLimitConfig.message
        }));
    }

    // Helmet security headers
    if (config.get('security.helmet.enabled', true)) {
        const helmet = require('helmet');
        const helmetConfig = config.getSection('security.helmet');
        app.use(helmet({
            contentSecurityPolicy: helmetConfig.contentSecurityPolicy,
            crossOriginEmbedderPolicy: helmetConfig.crossOriginEmbedderPolicy,
            crossOriginOpenerPolicy: helmetConfig.crossOriginOpenerPolicy,
            hsts: helmetConfig.hsts
        }));
    }
}

module.exports = { configureMiddleware };
```

---

## 6. Usage Guide

### 6.1 Accessing Configuration Values

The configuration system provides several methods for accessing values:

**Simple Value Access:**
```javascript
const { config } = require('./config');

// Get a single value with dot notation
const port = config.get('server.customerServices.port');

// Get with default value if not found
const timeout = config.get('server.timeouts.request', 30000);

// Check if a path exists
if (config.has('integrations.stripe.secretKey')) {
    // Configure Stripe
}
```

**Section Access:**
```javascript
// Get an entire configuration section
const authConfig = config.getSection('auth');
console.log(authConfig.jwt.accessTokenExpiry);
console.log(authConfig.password.saltRounds);

// Get database section
const dbConfig = config.getSection('database.customer');
```

**Full Configuration:**
```javascript
// Get complete configuration (useful for debugging)
const allConfig = config.getAll();
console.log(JSON.stringify(allConfig, null, 2));
```

### 6.2 Environment Detection

```javascript
const { config } = require('./config');

// Check current environment
if (config.isProduction()) {
    // Enable production-only features
    enableMetricsExport();
}

if (config.isDevelopment()) {
    // Enable development tools
    enableSwagger();
    enableDebugRoutes();
}

if (config.isStaging()) {
    // Staging-specific logic
    redirectEmailsToTestAccount();
}

// Get environment name as string
const env = config.getEnvironment(); // 'development', 'staging', or 'production'
```

### 6.3 Feature Flag Checks

```javascript
const { config } = require('./config');

// Check if a feature is enabled
if (config.isFeatureEnabled('clientManagement')) {
    const clientRoutes = require('./modules/client-management/routes');
    app.use('/api/v1/clients', clientRoutes);
}

if (config.isFeatureEnabled('twoFactorAuth')) {
    // Enable 2FA middleware
}

if (config.isFeatureEnabled('realTimeUpdates')) {
    // Initialize WebSocket server
}

// Conditional feature loading
const enabledFeatures = ['clientManagement', 'documentManagement', 'notifications']
    .filter(feature => config.isFeatureEnabled(feature));
```

### 6.4 Database Configuration Helper

```javascript
const { getDbConfig } = require('./config');

// Get complete database configuration
const customerDb = getDbConfig('customer');
const adminDb = getDbConfig('admin');
const sharedDb = getDbConfig('shared');

// Each returns an object with:
// {
//   name: 'insightserenity_customer_dev',
//   uri: 'mongodb://...',
//   options: { maxPoolSize: 10, ... },
//   connection: { retryAttempts: 5, ... }
// }

// Use with Mongoose
mongoose.connect(customerDb.uri, customerDb.options);
```

### 6.5 Service-Specific Configuration

```javascript
const { createServiceConfig } = require('./config');

// Create configuration for a specific service
const config = createServiceConfig('customer-services');

// Access service-specific settings
const modules = config.getSection('modules');
if (modules.clientManagement.enabled) {
    console.log('Client Management module is enabled');
    console.log('Routes prefix:', modules.clientManagement.routes.prefix);
}

// Access merged configuration (base + service-specific)
const apiConfig = config.getSection('api');
console.log('Pagination default limit:', apiConfig.pagination.defaultLimit);
```

### 6.6 Configuration Metadata

```javascript
const { config } = require('./config');

// Get metadata about loaded configuration
const metadata = config.getMetadata();
console.log('Environment:', metadata.environment);
console.log('Service:', metadata.serviceName);
console.log('Config Directory:', metadata.configDir);
console.log('Loaded Files:', metadata.loadedFiles);
console.log('Load Timestamp:', metadata.loadTimestamp);
```

---

## 7. Environment Variables Reference

### 7.1 Automatic Mappings

The following environment variables are automatically mapped to configuration paths:

**Server Configuration:**

| Environment Variable | Configuration Path | Default |
|---------------------|-------------------|---------|
| `NODE_ENV` | `platform.environment` | `development` |
| `HOST` | `server.customerServices.host` | `0.0.0.0` |
| `PORT` | `server.customerServices.port` | `3001` |
| `ADMIN_HOST` | `server.adminServer.host` | `0.0.0.0` |
| `ADMIN_PORT` | `server.adminServer.port` | `3000` |

**Database Configuration:**

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `DATABASE_ADMIN_URI` | `database.admin.uri` |
| `DATABASE_CUSTOMER_URI` | `database.customer.uri` |
| `DATABASE_SHARED_URI` | `database.shared.uri` |
| `MONGODB_URI` | `database.defaultUri` |

**Authentication:**

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `JWT_SECRET` | `auth.jwt.secret` |
| `JWT_EXPIRY` | `auth.jwt.accessTokenExpiry` |
| `JWT_REFRESH_EXPIRY` | `auth.jwt.refreshTokenExpiry` |
| `SESSION_SECRET` | `auth.session.secret` |

**AWS/Storage:**

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `AWS_REGION` | `storage.s3.region` |
| `AWS_S3_BUCKET` | `storage.s3.bucket` |
| `AWS_ACCESS_KEY_ID` | `aws.accessKeyId` |
| `AWS_SECRET_ACCESS_KEY` | `aws.secretAccessKey` |

**Redis/Caching:**

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `REDIS_HOST` | `cache.redis.host` |
| `REDIS_PORT` | `cache.redis.port` |
| `REDIS_PASSWORD` | `cache.redis.password` |
| `REDIS_URL` | `cache.redis.url` |

**Email:**

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `SMTP_HOST` | `email.smtp.host` |
| `SMTP_PORT` | `email.smtp.port` |
| `SMTP_USER` | `email.smtp.auth.user` |
| `SMTP_PASS` | `email.smtp.auth.pass` |

**Integrations:**

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `STRIPE_SECRET_KEY` | `integrations.stripe.secretKey` |
| `STRIPE_WEBHOOK_SECRET` | `integrations.stripe.webhookSecret` |
| `SENTRY_DSN` | `integrations.errorTracking.sentry.dsn` |

### 7.2 Custom Environment Variable Prefix

Any environment variable prefixed with `CONFIG_` will be mapped to a configuration path using these rules:

- Double underscores (`__`) become dots (`.`)
- Single underscores are removed
- The entire path is lowercased

**Examples:**

```bash
# Sets config.logging.level = 'debug'
export CONFIG_LOGGING__LEVEL=debug

# Sets config.security.cors.credentials = true
export CONFIG_SECURITY__CORS__CREDENTIALS=true

# Sets config.database.customer.options.maxPoolSize = 50
export CONFIG_DATABASE__CUSTOMER__OPTIONS__MAXPOOLSIZE=50
```

### 7.3 Value Type Parsing

Environment variable values are automatically parsed to appropriate types:

- `"true"` and `"false"` become boolean `true` and `false`
- Numeric strings become integers or floats
- Comma-separated values become arrays
- JSON strings are parsed to objects

```bash
# Boolean
export CONFIG_FEATURES__ANALYTICS=true

# Number
export CONFIG_SERVER__PORT=3001

# Array
export CONFIG_SECURITY__CORS__ORIGINS="http://localhost:3000,http://localhost:3001"

# JSON
export CONFIG_CUSTOM__SETTINGS='{"key":"value","nested":{"a":1}}'
```

---

## 8. Feature Flags Management

### 8.1 Available Feature Flags

**Core Features:**

| Flag | Default | Description |
|------|---------|-------------|
| `registration` | `true` | User registration functionality |
| `emailVerification` | `true` | Require email verification |
| `passwordReset` | `true` | Password reset functionality |
| `twoFactorAuth` | `true` | Two-factor authentication |

**Business Features:**

| Flag | Default | Description |
|------|---------|-------------|
| `clientManagement` | `true` | Client management module |
| `documentManagement` | `true` | Document upload/management |
| `recruitmentServices` | `true` | Recruitment module |
| `hostedOrganizations` | `true` | Multi-tenant organizations |

**Advanced Features:**

| Flag | Default | Description |
|------|---------|-------------|
| `analytics` | `false` | Analytics dashboard |
| `reporting` | `false` | Report generation |
| `notifications` | `true` | Notification system |
| `realTimeUpdates` | `false` | WebSocket real-time updates |

**Beta Features:**

| Flag | Default | Description |
|------|---------|-------------|
| `aiAssistant` | `false` | AI-powered assistant |
| `advancedSearch` | `false` | Advanced search capabilities |
| `bulkOperations` | `false` | Bulk data operations |

### 8.2 Enabling Features Per Environment

Features can be enabled or disabled in environment-specific YAML files:

```yaml
# development.yaml - Enable all features for testing
features:
  analytics: true
  reporting: true
  aiAssistant: true
  advancedSearch: true
  bulkOperations: true

# production.yaml - Conservative feature set
features:
  analytics: true
  reporting: true
  aiAssistant: false      # Not ready for production
  advancedSearch: false   # In beta
  bulkOperations: false   # In beta
```

### 8.3 Runtime Feature Checks

```javascript
const { config } = require('./config');

// Conditional route registration
function registerRoutes(app) {
    // Always available
    app.use('/api/v1/auth', authRoutes);
    
    // Feature-gated routes
    if (config.isFeatureEnabled('clientManagement')) {
        app.use('/api/v1/clients', clientRoutes);
    }
    
    if (config.isFeatureEnabled('documentManagement')) {
        app.use('/api/v1/documents', documentRoutes);
    }
    
    if (config.isFeatureEnabled('analytics')) {
        app.use('/api/v1/analytics', analyticsRoutes);
    }
    
    if (config.isFeatureEnabled('realTimeUpdates')) {
        initializeWebSocketServer(app);
    }
}
```

---

## 9. Production Deployment

### 9.1 Required Environment Variables

The following environment variables must be set for production deployment:

```bash
# Required - Application will fail to start without these
export NODE_ENV=production
export JWT_SECRET=<64-character-random-string>
export DATABASE_ADMIN_URI=mongodb+srv://user:pass@cluster.mongodb.net/admin
export DATABASE_CUSTOMER_URI=mongodb+srv://user:pass@cluster.mongodb.net/customer

# Highly Recommended
export DATABASE_SHARED_URI=mongodb+srv://user:pass@cluster.mongodb.net/shared
export SESSION_SECRET=<64-character-random-string>
export REDIS_URL=redis://:password@redis-host:6379

# AWS (if using S3 storage)
export AWS_REGION=us-east-1
export AWS_S3_BUCKET=insightserenity-prod-documents
export AWS_ACCESS_KEY_ID=<access-key>
export AWS_SECRET_ACCESS_KEY=<secret-key>

# Email (if using SMTP)
export SMTP_HOST=smtp.sendgrid.net
export SMTP_PORT=587
export SMTP_USER=apikey
export SMTP_PASS=<sendgrid-api-key>

# Error Tracking (recommended)
export SENTRY_DSN=https://<key>@sentry.io/<project>
```

### 9.2 Security Checklist

Before deploying to production, verify the following settings in `production.yaml`:

| Setting | Required Value | Purpose |
|---------|---------------|---------|
| `devTools.enabled` | `false` | Disable Swagger, playground |
| `errors.showStack` | `false` | Hide stack traces from clients |
| `errors.showDetails` | `false` | Hide error details from clients |
| `security.helmet.enabled` | `true` | Enable security headers |
| `security.helmet.hsts.maxAge` | `31536000` | Enforce HTTPS for 1 year |
| `security.rateLimit.max` | `100` | Limit requests per window |
| `logging.level` | `warn` or `error` | Reduce log volume |
| `database.*.options.autoIndex` | `false` | Prevent index creation |

### 9.3 Health Check Configuration

Ensure health endpoints are properly configured for load balancers:

```yaml
# production.yaml
health:
  enabled: true
  path: /health
  checkInterval: 15000
  checks:
    database: true
    redis: true
    memory: true
    disk: true
  thresholds:
    memory: 85
    cpu: 85
    disk: 80
```

### 9.4 Logging Configuration

Production logging should be JSON-formatted for log aggregation:

```yaml
# production.yaml
logging:
  level: warn
  format: json
  colorize: false
  timestamp: true
  file:
    enabled: true
    directory: /var/log/insightserenity
    maxSize: 50m
    maxFiles: 30d
    compress: true
```

---

## 10. Kubernetes Integration

### 10.1 ConfigMap Creation

Create a ConfigMap from your YAML files:

```bash
kubectl create configmap insightserenity-config \
  --from-file=default.yaml=config/default.yaml \
  --from-file=production.yaml=config/production.yaml \
  --from-file=customer-services.yaml=config/services/customer-services.yaml \
  --from-file=admin-server.yaml=config/services/admin-server.yaml \
  -n insightserenity
```

### 10.2 Secret Creation

Create secrets for sensitive values:

```bash
kubectl create secret generic insightserenity-secrets \
  --from-literal=JWT_SECRET='your-jwt-secret' \
  --from-literal=DATABASE_ADMIN_URI='mongodb+srv://...' \
  --from-literal=DATABASE_CUSTOMER_URI='mongodb+srv://...' \
  --from-literal=AWS_ACCESS_KEY_ID='...' \
  --from-literal=AWS_SECRET_ACCESS_KEY='...' \
  -n insightserenity
```

### 10.3 Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: customer-services
  namespace: insightserenity
spec:
  template:
    spec:
      containers:
        - name: customer-services
          image: insightserenity/customer-services:latest
          env:
            - name: NODE_ENV
              value: "production"
            - name: SERVICE_NAME
              value: "customer-services"
          envFrom:
            - secretRef:
                name: insightserenity-secrets
          volumeMounts:
            - name: config-volume
              mountPath: /app/config
              readOnly: true
      volumes:
        - name: config-volume
          configMap:
            name: insightserenity-config
```

### 10.4 Configuration Updates

To update configuration without redeploying:

```bash
# Update ConfigMap
kubectl create configmap insightserenity-config \
  --from-file=... \
  --dry-run=client -o yaml | kubectl apply -f -

# Trigger rolling restart to pick up changes
kubectl rollout restart deployment/customer-services -n insightserenity
kubectl rollout restart deployment/admin-server -n insightserenity
```

---

## 11. Troubleshooting Guide

### 11.1 Configuration Not Loading

**Symptom:** Application fails to start with "Required configuration file not found" error.

**Solution:** Verify that `default.yaml` exists in the config directory and the path is correct:

```javascript
// Check the resolved config directory
const { config } = require('./config');
console.log(config.getMetadata().configDir);
```

### 11.2 Environment Variables Not Applied

**Symptom:** Environment variables are set but configuration shows default values.

**Diagnosis Steps:**
1. Verify variable names match exactly (case-sensitive)
2. Check for typos in the mapping
3. Ensure variables are exported to the process

```bash
# Verify environment variables are set
env | grep DATABASE
env | grep JWT

# In Node.js
console.log(process.env.DATABASE_CUSTOMER_URI);
```

### 11.3 YAML Syntax Errors

**Symptom:** "Failed to load" error with YAML parse details.

**Solution:** Validate YAML syntax:

```bash
# Install yaml-lint
npm install -g yaml-lint

# Validate files
yaml-lint config/default.yaml
yaml-lint config/production.yaml
```

Common YAML issues include incorrect indentation (use 2 spaces, not tabs), missing colons after keys, and unquoted special characters.

### 11.4 Wrong Environment Loading

**Symptom:** Development settings appear in production.

**Diagnosis:**

```javascript
const { config } = require('./config');
console.log('Environment:', config.getEnvironment());
console.log('Loaded files:', config.getMetadata().loadedFiles);
```

**Solution:** Ensure `NODE_ENV` is set correctly:

```bash
export NODE_ENV=production
```

### 11.5 Database Connection Failures

**Symptom:** MongoDB connection errors in production.

**Diagnosis:**

```javascript
const { getDbConfig } = require('./config');
const dbConfig = getDbConfig('customer');
console.log('URI:', dbConfig.uri);
console.log('Options:', dbConfig.options);
```

**Common Issues include** missing `DATABASE_CUSTOMER_URI` environment variable, incorrect connection string format, and firewall blocking MongoDB Atlas.

### 11.6 Feature Flag Not Working

**Symptom:** Feature is enabled in YAML but `isFeatureEnabled()` returns false.

**Diagnosis:**

```javascript
const { config } = require('./config');
console.log('All features:', config.getSection('features'));
console.log('Specific flag:', config.get('features.analytics'));
```

**Solution:** Ensure the feature is defined in the correct environment file and properly nested under `features:`.

---

## 12. Best Practices

### 12.1 Configuration Organization

Keep related settings together in logical sections:

```yaml
# Good - grouped by concern
auth:
  jwt:
    secret: ...
    accessTokenExpiry: 15m
  password:
    minLength: 8
    saltRounds: 12
```

### 12.2 Default Values

Always provide sensible defaults in `default.yaml` and use them when accessing configuration:

```javascript
// Good - always has a fallback
const timeout = config.get('server.timeouts.request', 30000);

// Bad - will crash if not set
const timeout = config.get('server.timeouts.request');
```

### 12.3 Sensitive Data

Use environment variables for all secrets:

```yaml
# Good - secret comes from environment
auth:
  jwt:
    secret: ${JWT_SECRET}

# Bad - exposed in repository
auth:
  jwt:
    secret: my-super-secret-key
```

### 12.4 Environment-Specific Overrides

Only override what changes between environments:

```yaml
# development.yaml - only overrides
database:
  customer:
    options:
      maxPoolSize: 5  # Lower for dev
```

Do not duplicate the entire configuration in each environment file.

### 12.5 Feature Flags

Use feature flags for gradual rollouts:

```javascript
if (config.isFeatureEnabled('newCheckoutFlow')) {
    return newCheckoutHandler(req, res);
}
return legacyCheckoutHandler(req, res);
```

Do not use feature flags for permanent configuration.

---

## 13. Complete Code Examples

### 13.1 Complete Server Initialization

```javascript
/**
 * Customer Services Server with Full Configuration Integration
 * File: servers/customer-services/server.js
 */

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { createServiceConfig, getDbConfig } = require('../../config');

class CustomerServicesServer {
    constructor() {
        this.config = createServiceConfig('customer-services');
        this.app = express();
        this.server = null;
    }

    async initialize() {
        this.logStartup();
        await this.connectDatabase();
        this.configureMiddleware();
        this.registerRoutes();
        this.configureErrorHandling();
        await this.startServer();
        return this;
    }

    logStartup() {
        const meta = this.config.getMetadata();
        console.log('='.repeat(60));
        console.log('InsightSerenity Customer Services');
        console.log('='.repeat(60));
        console.log(`Environment: ${meta.environment}`);
        console.log(`Service: ${meta.serviceName}`);
        console.log(`Config Directory: ${meta.configDir}`);
        console.log(`Loaded Files: ${meta.loadedFiles.length}`);
        meta.loadedFiles.forEach(f => console.log(`  - ${f}`));
        console.log('='.repeat(60));
    }

    async connectDatabase() {
        const dbConfig = getDbConfig('customer');
        const connectionConfig = this.config.get('database.connection', {});

        console.log(`Connecting to database: ${dbConfig.name}`);

        let attempts = 0;
        const maxAttempts = connectionConfig.retryAttempts || 5;
        const retryDelay = connectionConfig.retryDelay || 5000;

        while (attempts < maxAttempts) {
            try {
                await mongoose.connect(dbConfig.uri, dbConfig.options);
                console.log('Database connected successfully');
                return;
            } catch (error) {
                attempts++;
                console.error(`Database connection attempt ${attempts} failed:`, error.message);
                if (attempts < maxAttempts) {
                    console.log(`Retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        throw new Error('Failed to connect to database after maximum attempts');
    }

    configureMiddleware() {
        // Body parsing
        const bodyConfig = this.config.get('middleware.bodyParser', {});
        this.app.use(express.json({ limit: bodyConfig.json?.limit || '10mb' }));
        this.app.use(express.urlencoded({ 
            limit: bodyConfig.urlencoded?.limit || '10mb',
            extended: true 
        }));

        // Compression
        if (this.config.get('middleware.compression.enabled', true)) {
            this.app.use(compression({
                level: this.config.get('middleware.compression.level', 6),
                threshold: this.config.get('middleware.compression.threshold', 1024)
            }));
        }

        // Security - Helmet
        if (this.config.get('security.helmet.enabled', true)) {
            const helmetConfig = this.config.getSection('security.helmet');
            this.app.use(helmet({
                contentSecurityPolicy: helmetConfig.contentSecurityPolicy,
                crossOriginEmbedderPolicy: helmetConfig.crossOriginEmbedderPolicy,
                hsts: helmetConfig.hsts
            }));
        }

        // Security - CORS
        const corsConfig = this.config.getSection('security.cors');
        if (corsConfig.origins) {
            this.app.use(cors({
                origin: corsConfig.origins,
                methods: corsConfig.methods,
                allowedHeaders: corsConfig.allowedHeaders,
                exposedHeaders: corsConfig.exposedHeaders,
                credentials: corsConfig.credentials,
                maxAge: corsConfig.maxAge
            }));
        }

        // Security - Rate Limiting
        const rateLimitConfig = this.config.getSection('security.rateLimit');
        if (rateLimitConfig.max) {
            this.app.use(rateLimit({
                windowMs: rateLimitConfig.windowMs,
                max: rateLimitConfig.max,
                standardHeaders: rateLimitConfig.standardHeaders,
                legacyHeaders: rateLimitConfig.legacyHeaders,
                message: rateLimitConfig.message
            }));
        }

        // Request ID middleware
        if (this.config.get('request.requestId.enabled', true)) {
            const { v4: uuidv4 } = require('uuid');
            const headerName = this.config.get('request.requestId.header', 'X-Request-ID');
            
            this.app.use((req, res, next) => {
                req.requestId = req.headers[headerName.toLowerCase()] || uuidv4();
                res.setHeader(headerName, req.requestId);
                next();
            });
        }
    }

    registerRoutes() {
        const basePath = this.config.get('server.basePath', '/api/v1');

        // Health check endpoint
        if (this.config.get('health.enabled', true)) {
            const healthPath = this.config.get('health.path', '/health');
            this.app.get(healthPath, (req, res) => {
                res.json({
                    status: 'healthy',
                    environment: this.config.getEnvironment(),
                    timestamp: new Date().toISOString()
                });
            });
        }

        // Feature-gated routes
        if (this.config.isFeatureEnabled('clientManagement')) {
            const clientRoutes = require('./modules/core-business/client-management/routes');
            this.app.use(basePath, clientRoutes);
            console.log('Registered: Client Management routes');
        }

        if (this.config.isFeatureEnabled('documentManagement')) {
            console.log('Registered: Document Management routes');
        }

        if (this.config.isFeatureEnabled('recruitmentServices')) {
            console.log('Registered: Recruitment Services routes');
        }

        // API documentation (development only)
        if (this.config.get('devTools.swagger.enabled', false)) {
            const swaggerPath = this.config.get('devTools.swagger.path', '/api-docs');
            console.log(`Swagger UI available at ${swaggerPath}`);
        }
    }

    configureErrorHandling() {
        const showStack = this.config.get('errors.showStack', false);
        const showDetails = this.config.get('errors.showDetails', false);

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Route ${req.method} ${req.path} not found`
                }
            });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            const statusCode = err.statusCode || 500;
            
            const response = {
                success: false,
                error: {
                    code: err.code || 'INTERNAL_ERROR',
                    message: err.message || 'An unexpected error occurred'
                }
            };

            if (showDetails && err.details) {
                response.error.details = err.details;
            }

            if (showStack && err.stack) {
                response.error.stack = err.stack;
            }

            console.error(`[${req.requestId}] Error:`, err);

            res.status(statusCode).json(response);
        });
    }

    async startServer() {
        const port = this.config.get('server.customerServices.port', 3001);
        const host = this.config.get('server.customerServices.host', '0.0.0.0');

        return new Promise((resolve) => {
            this.server = this.app.listen(port, host, () => {
                console.log(`Server listening on ${host}:${port}`);
                resolve();
            });
        });
    }

    async shutdown() {
        console.log('Shutting down server...');
        
        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
            console.log('HTTP server closed');
        }

        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Start server
const server = new CustomerServicesServer();
server.initialize().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => server.shutdown());
process.on('SIGINT', () => server.shutdown());

module.exports = server;
```

### 13.2 Logger Configuration with Winston

```javascript
/**
 * Winston Logger with Configuration Integration
 * File: shared/lib/logger.js
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const { config } = require('../../config');

function createLogger(serviceName) {
    const loggingConfig = config.getSection('logging');
    const transports = [];

    // Console transport
    const consoleConfig = loggingConfig.transports?.console;
    if (consoleConfig?.enabled !== false) {
        const consoleFormat = loggingConfig.colorize
            ? winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            );

        transports.push(new winston.transports.Console({
            level: consoleConfig?.level || loggingConfig.level || 'info',
            format: consoleFormat
        }));
    }

    // File transports
    if (loggingConfig.file?.enabled) {
        const fileConfig = loggingConfig.file;
        const logDirectory = fileConfig.directory || 'logs';

        // Combined log
        const combinedConfig = loggingConfig.transports?.file?.combined;
        if (combinedConfig?.enabled) {
            transports.push(new DailyRotateFile({
                filename: path.join(logDirectory, combinedConfig.filename || 'app-combined-%DATE%.log'),
                datePattern: fileConfig.datePattern || 'YYYY-MM-DD',
                maxSize: fileConfig.maxSize || '10m',
                maxFiles: fileConfig.maxFiles || '14d',
                level: combinedConfig.level || 'info',
                compress: fileConfig.compress
            }));
        }

        // Error log
        const errorConfig = loggingConfig.transports?.file?.error;
        if (errorConfig?.enabled) {
            transports.push(new DailyRotateFile({
                filename: path.join(logDirectory, errorConfig.filename || 'app-error-%DATE%.log'),
                datePattern: fileConfig.datePattern || 'YYYY-MM-DD',
                maxSize: fileConfig.maxSize || '10m',
                maxFiles: fileConfig.maxFiles || '14d',
                level: 'error',
                compress: fileConfig.compress
            }));
        }
    }

    // Create logger instance
    const logger = winston.createLogger({
        level: loggingConfig.level || 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            loggingConfig.format === 'json'
                ? winston.format.json()
                : winston.format.simple()
        ),
        defaultMeta: { 
            service: serviceName,
            environment: config.getEnvironment()
        },
        transports
    });

    return logger;
}

module.exports = { createLogger };
```

### 13.3 Email Service with Configuration

```javascript
/**
 * Email Service with Configuration Integration
 * File: shared/services/email-service.js
 */

const nodemailer = require('nodemailer');
const { config } = require('../../config');

class EmailService {
    constructor() {
        this.transporter = null;
        this.config = config.getSection('email');
        this.initialize();
    }

    initialize() {
        const provider = this.config.provider || 'smtp';

        // Development mode - log emails to console
        if (config.isDevelopment() || provider === 'console') {
            this.transporter = {
                sendMail: async (options) => {
                    console.log('='.repeat(50));
                    console.log('EMAIL (Development Mode)');
                    console.log('='.repeat(50));
                    console.log('To:', options.to);
                    console.log('Subject:', options.subject);
                    console.log('Body:', options.html?.substring(0, 200) + '...');
                    console.log('='.repeat(50));
                    return { messageId: `dev-${Date.now()}` };
                }
            };
            return;
        }

        // SMTP provider
        if (provider === 'smtp') {
            const smtpConfig = this.config.smtp || {};
            this.transporter = nodemailer.createTransport({
                host: smtpConfig.host || process.env.SMTP_HOST,
                port: smtpConfig.port || process.env.SMTP_PORT || 587,
                secure: smtpConfig.secure || false,
                auth: {
                    user: smtpConfig.auth?.user || process.env.SMTP_USER,
                    pass: smtpConfig.auth?.pass || process.env.SMTP_PASS
                }
            });
            return;
        }

        // AWS SES provider
        if (provider === 'ses') {
            const aws = require('aws-sdk');
            const region = config.get('storage.s3.region', 'us-east-1');
            
            this.transporter = nodemailer.createTransport({
                SES: new aws.SES({ region })
            });
            return;
        }

        throw new Error(`Unknown email provider: ${provider}`);
    }

    async sendEmail(to, subject, html, options = {}) {
        // Staging environment - redirect all emails
        if (config.isStaging() && this.config.staging?.enabled) {
            const originalTo = to;
            to = this.config.staging.redirectTo;
            subject = `[STAGING - Original: ${originalTo}] ${subject}`;
        }

        const mailOptions = {
            from: `"${this.config.from?.name || 'InsightSerenity'}" <${this.config.from?.address || 'noreply@insightserenity.com'}>`,
            replyTo: this.config.replyTo,
            to,
            subject,
            html,
            ...options
        };

        return this.transporter.sendMail(mailOptions);
    }

    async sendWelcomeEmail(user) {
        const subject = 'Welcome to InsightSerenity';
        const html = `
            <h1>Welcome, ${user.firstName}!</h1>
            <p>Your account has been created successfully.</p>
        `;
        return this.sendEmail(user.email, subject, html);
    }

    async sendPasswordResetEmail(user, resetToken) {
        const platformUrl = config.get('platform.url', 'https://insightserenity.com');
        const subject = 'Password Reset Request';
        const html = `
            <h1>Password Reset</h1>
            <p>Click the link below to reset your password:</p>
            <a href="${platformUrl}/reset-password?token=${resetToken}">Reset Password</a>
        `;
        return this.sendEmail(user.email, subject, html);
    }
}

module.exports = new EmailService();
```

---

## Summary

The InsightSerenity Configuration System provides a robust, enterprise-grade solution for managing platform configuration across all environments. By centralizing settings in YAML files with a clear hierarchy, the system enables consistent deployments, easier troubleshooting, and improved maintainability.

Key benefits for IT Operations include environment-specific configuration without code changes, secure handling of sensitive data through environment variables, seamless integration with Kubernetes ConfigMaps, and comprehensive validation to catch configuration errors before deployment.

For developers, the system offers a clean API for accessing configuration values, automatic type parsing, feature flags for gradual rollouts, and hot reload capabilities during development.

By following the integration patterns and best practices outlined in this document, the InsightSerenity platform will have a solid foundation for configuration management that scales with the organization's needs.

---

**Document Control:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | December 2025 | InsightSerenity Team | Initial release |