'use strict';

/**
 * @fileoverview Base configuration settings for the InsightSerenity platform
 * @module shared/config/base-config
 */

// Configuration helper functions
const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(value.toString().toLowerCase());
};

const parseArray = (value, defaultValue = []) => {
  if (!value) return defaultValue;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return defaultValue;
};

const parseNumber = (value, defaultValue = 0) => {
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

const parseJSON = (value, defaultValue = {}) => {
  if (!value) return defaultValue;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
};

// Base configuration object
const baseConfig = {
  // Application metadata
  app: {
    name: process.env.APP_NAME || 'InsightSerenity Platform',
    version: process.env.APP_VERSION || '1.0.0',
    description: process.env.APP_DESCRIPTION || 'Enterprise Multi-tenant Platform for Consulting and Recruitment',
    environment: process.env.NODE_ENV || 'development',
    timezone: process.env.TZ || 'UTC',
    locale: process.env.DEFAULT_LOCALE || 'en-US'
  },

  // Server configuration
  server: {
    adminPort: parseNumber(process.env.ADMIN_PORT, 3001),
    servicesPort: parseNumber(process.env.SERVICES_PORT, 3002),
    gatewayPort: parseNumber(process.env.GATEWAY_PORT, 3000),
    host: process.env.SERVER_HOST || '0.0.0.0',
    protocol: process.env.SERVER_PROTOCOL || 'http',
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    compression: parseBoolean(process.env.ENABLE_COMPRESSION, true),
    requestTimeout: parseNumber(process.env.REQUEST_TIMEOUT, 30000), // 30 seconds
    shutdownTimeout: parseNumber(process.env.SHUTDOWN_TIMEOUT, 10000), // 10 seconds
    keepAliveTimeout: parseNumber(process.env.KEEP_ALIVE_TIMEOUT, 65000), // 65 seconds
    headersTimeout: parseNumber(process.env.HEADERS_TIMEOUT, 66000) // 66 seconds
  },

  // API configuration
  api: {
    version: process.env.API_VERSION || 'v1',
    prefix: process.env.API_PREFIX || '/api',
    pagination: {
      defaultLimit: parseNumber(process.env.DEFAULT_PAGE_LIMIT, 20),
      maxLimit: parseNumber(process.env.MAX_PAGE_LIMIT, 100)
    },
    responseTimeout: parseNumber(process.env.API_RESPONSE_TIMEOUT, 25000),
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
    rateLimiting: {
      enabled: parseBoolean(process.env.RATE_LIMITING_ENABLED, true),
      windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
      maxRequests: parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100)
    }
  },

  // Multi-tenant configuration
  multiTenant: {
    enabled: parseBoolean(process.env.MULTI_TENANT_ENABLED, true),
    strategy: process.env.TENANT_STRATEGY || 'subdomain', // subdomain, header, path
    headerName: process.env.TENANT_HEADER_NAME || 'X-Tenant-ID',
    defaultTenant: process.env.DEFAULT_TENANT || 'default',
    allowTenantCreation: parseBoolean(process.env.ALLOW_TENANT_CREATION, false),
    tenantIsolation: {
      database: parseBoolean(process.env.TENANT_DB_ISOLATION, true),
      schema: parseBoolean(process.env.TENANT_SCHEMA_ISOLATION, false),
      collection: parseBoolean(process.env.TENANT_COLLECTION_ISOLATION, true)
    },
    maxTenantsPerOrganization: parseNumber(process.env.MAX_TENANTS_PER_ORG, 10)
  },

  // URLs configuration
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3001',
  servicesUrl: process.env.SERVICES_URL || 'http://localhost:3002',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:4200',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',

  // CORS configuration
  cors: {
    enabled: parseBoolean(process.env.CORS_ENABLED, true),
    origins: parseArray(process.env.CORS_ORIGINS, ['http://localhost:4200']),
    credentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
    methods: parseArray(process.env.CORS_METHODS, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
    allowedHeaders: parseArray(process.env.CORS_ALLOWED_HEADERS, [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Tenant-ID',
      'X-Organization-ID',
      'X-Session-ID'
    ]),
    exposedHeaders: parseArray(process.env.CORS_EXPOSED_HEADERS, [
      'X-Total-Count',
      'X-Page-Count',
      'X-Current-Page',
      'X-Per-Page',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ]),
    maxAge: parseNumber(process.env.CORS_MAX_AGE, 86400) // 24 hours
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    colorize: parseBoolean(process.env.LOG_COLORIZE, process.env.NODE_ENV === 'development'),
    timestamp: parseBoolean(process.env.LOG_TIMESTAMP, true),
    prettyPrint: parseBoolean(process.env.LOG_PRETTY_PRINT, process.env.NODE_ENV === 'development'),
    logRequests: parseBoolean(process.env.LOG_REQUESTS, true),
    logResponses: parseBoolean(process.env.LOG_RESPONSES, false),
    excludePaths: parseArray(process.env.LOG_EXCLUDE_PATHS, ['/health', '/metrics']),
    sensitiveFields: parseArray(process.env.LOG_SENSITIVE_FIELDS, [
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      'creditCard',
      'ssn',
      'apiKey'
    ])
  },

  // File upload configuration
  uploads: {
    enabled: parseBoolean(process.env.UPLOADS_ENABLED, true),
    provider: process.env.UPLOAD_PROVIDER || 'local', // local, s3, azure, gcp
    maxFileSize: parseNumber(process.env.MAX_FILE_SIZE, 10485760), // 10MB
    allowedMimeTypes: parseArray(process.env.ALLOWED_MIME_TYPES, [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]),
    localPath: process.env.UPLOAD_LOCAL_PATH || './uploads',
    urlPath: process.env.UPLOAD_URL_PATH || '/uploads',
    generateThumbnails: parseBoolean(process.env.GENERATE_THUMBNAILS, true),
    thumbnailSizes: parseJSON(process.env.THUMBNAIL_SIZES, {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    })
  },

  // Feature flags
  features: {
    authentication: {
      localAuth: parseBoolean(process.env.FEATURE_LOCAL_AUTH, true),
      oauth: parseBoolean(process.env.FEATURE_OAUTH, true),
      passkeys: parseBoolean(process.env.FEATURE_PASSKEYS, false),
      twoFactor: parseBoolean(process.env.FEATURE_TWO_FACTOR, true),
      sso: parseBoolean(process.env.FEATURE_SSO, false)
    },
    modules: {
      consulting: parseBoolean(process.env.FEATURE_CONSULTING, true),
      recruitment: parseBoolean(process.env.FEATURE_RECRUITMENT, true),
      whiteLabel: parseBoolean(process.env.FEATURE_WHITE_LABEL, true),
      analytics: parseBoolean(process.env.FEATURE_ANALYTICS, true),
      api: parseBoolean(process.env.FEATURE_API, true)
    },
    experimental: {
      aiAssistant: parseBoolean(process.env.FEATURE_AI_ASSISTANT, false),
      advancedAnalytics: parseBoolean(process.env.FEATURE_ADVANCED_ANALYTICS, false),
      blockchain: parseBoolean(process.env.FEATURE_BLOCKCHAIN, false)
    }
  },

  // Performance configuration
  performance: {
    enableClustering: parseBoolean(process.env.ENABLE_CLUSTERING, true),
    workers: parseNumber(process.env.WORKER_COUNT, 0), // 0 = auto (CPU cores)
    enableGracefulShutdown: parseBoolean(process.env.ENABLE_GRACEFUL_SHUTDOWN, true),
    memoryLimit: parseNumber(process.env.MEMORY_LIMIT, 512), // MB
    cpuThreshold: parseNumber(process.env.CPU_THRESHOLD, 80), // percentage
    restartOnMemoryLimit: parseBoolean(process.env.RESTART_ON_MEMORY_LIMIT, true)
  },

  // Maintenance mode
  maintenance: {
    enabled: parseBoolean(process.env.MAINTENANCE_MODE, false),
    message: process.env.MAINTENANCE_MESSAGE || 'The system is currently under maintenance. Please check back later.',
    allowedIPs: parseArray(process.env.MAINTENANCE_ALLOWED_IPS, []),
    startTime: process.env.MAINTENANCE_START_TIME || null,
    endTime: process.env.MAINTENANCE_END_TIME || null
  }
};

// Validate base configuration
const validateBaseConfig = (config) => {
  const errors = [];

  // Validate ports
  if (config.server.adminPort === config.server.servicesPort) {
    errors.push('Admin and Services ports must be different');
  }

  // Validate URLs
  try {
    new URL(config.apiUrl);
    new URL(config.adminUrl);
    new URL(config.servicesUrl);
    new URL(config.clientUrl);
  } catch (error) {
    errors.push('Invalid URL configuration: ' + error.message);
  }

  // Validate multi-tenant configuration
  if (config.multiTenant.enabled) {
    const validStrategies = ['subdomain', 'header', 'path'];
    if (!validStrategies.includes(config.multiTenant.strategy)) {
      errors.push(`Invalid tenant strategy: ${config.multiTenant.strategy}`);
    }
  }

  // Validate file upload configuration
  if (config.uploads.enabled) {
    const validProviders = ['local', 's3', 'azure', 'gcp'];
    if (!validProviders.includes(config.uploads.provider)) {
      errors.push(`Invalid upload provider: ${config.uploads.provider}`);
    }
  }

  if (errors.length > 0) {
    throw new Error('Base configuration validation failed:\n' + errors.join('\n'));
  }

  return true;
};

// Validate the configuration
validateBaseConfig(baseConfig);

// Export configuration
module.exports = baseConfig;

// Export helper functions for reuse
module.exports.helpers = {
  parseBoolean,
  parseArray,
  parseNumber,
  parseJSON
};