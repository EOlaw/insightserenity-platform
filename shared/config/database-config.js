'use strict';

/**
 * @fileoverview Database configuration for MongoDB and multi-tenant support
 * @module shared/config/database-config
 */

const { parseBoolean, parseNumber, parseArray, parseJSON } = require('./base-config').helpers;

// Database configuration object
const databaseConfig = {
  // MongoDB connection settings
  uri: process.env.DB_URI || process.env.MONGODB_URI || 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/Insightserenity_dev?retryWrites=true&w=majority',
  
  // Connection options
  options: {
    // Connection pool settings
    maxPoolSize: parseNumber(process.env.DB_MAX_POOL_SIZE, 100),
    minPoolSize: parseNumber(process.env.DB_MIN_POOL_SIZE, 10),
    maxIdleTimeMS: parseNumber(process.env.DB_MAX_IDLE_TIME_MS, 60000),
    waitQueueTimeoutMS: parseNumber(process.env.DB_WAIT_QUEUE_TIMEOUT_MS, 5000),
    
    // Socket settings
    socketTimeoutMS: parseNumber(process.env.DB_SOCKET_TIMEOUT_MS, 45000),
    connectTimeoutMS: parseNumber(process.env.DB_CONNECT_TIMEOUT_MS, 30000),
    serverSelectionTimeoutMS: parseNumber(process.env.DB_SERVER_SELECTION_TIMEOUT_MS, 30000),
    
    // Retry settings
    retryWrites: parseBoolean(process.env.DB_RETRY_WRITES, true),
    retryReads: parseBoolean(process.env.DB_RETRY_READS, true),
    
    // Write concern
    w: process.env.DB_WRITE_CONCERN || 'majority',
    wtimeoutMS: parseNumber(process.env.DB_WRITE_TIMEOUT_MS, 5000),
    journal: parseBoolean(process.env.DB_JOURNAL, true),
    
    // Read preference
    readPreference: process.env.DB_READ_PREFERENCE || 'primaryPreferred',
    readConcernLevel: process.env.DB_READ_CONCERN_LEVEL || 'majority',
    
    // Other options
    directConnection: parseBoolean(process.env.DB_DIRECT_CONNECTION, false),
    appName: process.env.DB_APP_NAME || 'InsightSerenity',
    compressors: parseArray(process.env.DB_COMPRESSORS, ['snappy', 'zlib']),
    zlibCompressionLevel: parseNumber(process.env.DB_ZLIB_COMPRESSION_LEVEL, 6)
  },

  // Database names for different services
  databases: {
    admin: process.env.DB_NAME_ADMIN || 'insightserenity_admin',
    shared: process.env.DB_NAME_SHARED || 'insightserenity_shared',
    tenantPrefix: process.env.DB_TENANT_PREFIX || 'tenant_',
    audit: process.env.DB_NAME_AUDIT || 'insightserenity_audit',
    analytics: process.env.DB_NAME_ANALYTICS || 'insightserenity_analytics'
  },

  // Collection naming conventions
  collections: {
    prefix: process.env.COLLECTION_PREFIX || '',
    suffix: process.env.COLLECTION_SUFFIX || '',
    pluralize: parseBoolean(process.env.COLLECTION_PLURALIZE, true),
    camelCase: parseBoolean(process.env.COLLECTION_CAMEL_CASE, false)
  },

  // Multi-tenant database configuration
  multiTenant: {
    strategy: process.env.DB_TENANT_STRATEGY || 'database', // database, collection, hybrid
    sharedCollections: parseArray(process.env.DB_SHARED_COLLECTIONS, [
      'organizations',
      'subscriptions',
      'features',
      'plans',
      'systemSettings'
    ]),
    tenantCollections: parseArray(process.env.DB_TENANT_COLLECTIONS, [
      'users',
      'clients',
      'projects',
      'consultants',
      'jobs',
      'candidates',
      'applications'
    ]),
    connectionPoolPerTenant: parseBoolean(process.env.DB_POOL_PER_TENANT, false),
    maxConnectionsPerTenant: parseNumber(process.env.DB_MAX_CONN_PER_TENANT, 10)
  },

  // Schema validation
  validation: {
    enabled: parseBoolean(process.env.DB_VALIDATION_ENABLED, true),
    level: process.env.DB_VALIDATION_LEVEL || 'moderate', // off, moderate, strict
    action: process.env.DB_VALIDATION_ACTION || 'warn', // warn, error
    jsonSchema: parseBoolean(process.env.DB_JSON_SCHEMA, true)
  },

  // Indexes configuration
  indexes: {
    autoCreate: parseBoolean(process.env.DB_AUTO_CREATE_INDEXES, true),
    background: parseBoolean(process.env.DB_BACKGROUND_INDEXES, true),
    unique: parseBoolean(process.env.DB_UNIQUE_INDEXES, true),
    sparse: parseBoolean(process.env.DB_SPARSE_INDEXES, true),
    expireAfterSeconds: parseNumber(process.env.DB_TTL_INDEXES, 0),
    textIndexVersion: parseNumber(process.env.DB_TEXT_INDEX_VERSION, 3)
  },

  // Migrations configuration
  migrations: {
    enabled: parseBoolean(process.env.DB_MIGRATIONS_ENABLED, true),
    directory: process.env.DB_MIGRATIONS_DIR || './migrations',
    collection: process.env.DB_MIGRATIONS_COLLECTION || '_migrations',
    autoRun: parseBoolean(process.env.DB_MIGRATIONS_AUTO_RUN, false),
    validateChecksums: parseBoolean(process.env.DB_MIGRATIONS_VALIDATE_CHECKSUMS, true)
  },

  // Backup configuration
  backup: {
    enabled: parseBoolean(process.env.DB_BACKUP_ENABLED, true),
    schedule: process.env.DB_BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
    retention: parseNumber(process.env.DB_BACKUP_RETENTION_DAYS, 30),
    provider: process.env.DB_BACKUP_PROVIDER || 'local', // local, s3, azure, gcp
    path: process.env.DB_BACKUP_PATH || './backups',
    compress: parseBoolean(process.env.DB_BACKUP_COMPRESS, true),
    encrypt: parseBoolean(process.env.DB_BACKUP_ENCRYPT, true)
  },

  // Performance optimization
  performance: {
    enableProfiling: parseBoolean(process.env.DB_ENABLE_PROFILING, false),
    profilingLevel: parseNumber(process.env.DB_PROFILING_LEVEL, 1), // 0=off, 1=slow, 2=all
    slowQueryThreshold: parseNumber(process.env.DB_SLOW_QUERY_THRESHOLD, 100), // ms
    enableQueryCache: parseBoolean(process.env.DB_ENABLE_QUERY_CACHE, true),
    cacheSize: parseNumber(process.env.DB_CACHE_SIZE_MB, 256),
    enableAggregationCache: parseBoolean(process.env.DB_ENABLE_AGG_CACHE, true)
  },

  // Monitoring and metrics
  monitoring: {
    enabled: parseBoolean(process.env.DB_MONITORING_ENABLED, true),
    metricsInterval: parseNumber(process.env.DB_METRICS_INTERVAL, 60000), // 1 minute
    logSlowQueries: parseBoolean(process.env.DB_LOG_SLOW_QUERIES, true),
    logQueryPlans: parseBoolean(process.env.DB_LOG_QUERY_PLANS, false),
    trackCollectionStats: parseBoolean(process.env.DB_TRACK_COLLECTION_STATS, true),
    trackIndexUsage: parseBoolean(process.env.DB_TRACK_INDEX_USAGE, true)
  },

  // Sharding configuration (for future scalability)
  sharding: {
    enabled: parseBoolean(process.env.DB_SHARDING_ENABLED, false),
    key: process.env.DB_SHARDING_KEY || 'tenantId',
    chunkSize: parseNumber(process.env.DB_CHUNK_SIZE_MB, 64),
    autoSplit: parseBoolean(process.env.DB_AUTO_SPLIT, true),
    balancerEnabled: parseBoolean(process.env.DB_BALANCER_ENABLED, true)
  },

  // Replication configuration
  replication: {
    enabled: parseBoolean(process.env.DB_REPLICATION_ENABLED, false),
    replicaSet: process.env.DB_REPLICA_SET || 'rs0',
    readFromSecondaries: parseBoolean(process.env.DB_READ_FROM_SECONDARIES, true),
    writeConcern: {
      w: process.env.DB_REPLICA_WRITE_CONCERN || 'majority',
      j: parseBoolean(process.env.DB_REPLICA_JOURNAL, true),
      wtimeout: parseNumber(process.env.DB_REPLICA_WRITE_TIMEOUT, 5000)
    }
  },

  // Transaction settings
  transactions: {
    enabled: parseBoolean(process.env.DB_TRANSACTIONS_ENABLED, true),
    maxCommitTime: parseNumber(process.env.DB_MAX_COMMIT_TIME_MS, 5000),
    retryLimit: parseNumber(process.env.DB_TRANSACTION_RETRY_LIMIT, 3),
    timeout: parseNumber(process.env.DB_TRANSACTION_TIMEOUT_MS, 60000)
  },

  // Security settings
  security: {
    authEnabled: parseBoolean(process.env.DB_AUTH_ENABLED, true),
    authSource: process.env.DB_AUTH_SOURCE || 'admin',
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    authMechanism: process.env.DB_AUTH_MECHANISM || 'SCRAM-SHA-256',
    tls: parseBoolean(process.env.DB_TLS_ENABLED, false),
    tlsCAFile: process.env.DB_TLS_CA_FILE || '',
    tlsCertificateKeyFile: process.env.DB_TLS_CERT_KEY_FILE || '',
    tlsAllowInvalidCertificates: parseBoolean(process.env.DB_TLS_ALLOW_INVALID_CERTS, false),
    tlsAllowInvalidHostnames: parseBoolean(process.env.DB_TLS_ALLOW_INVALID_HOSTNAMES, false)
  }
};

// Validate database configuration
const validateDatabaseConfig = (config) => {
  const errors = [];

  // Validate URI
  if (!config.uri) {
    errors.push('Database URI is required');
  } else {
    try {
      new URL(config.uri);
    } catch (error) {
      errors.push('Invalid database URI: ' + error.message);
    }
  }

  // Validate pool size
  if (config.options.minPoolSize > config.options.maxPoolSize) {
    errors.push('Min pool size cannot be greater than max pool size');
  }

  // Validate multi-tenant strategy
  const validStrategies = ['database', 'collection', 'hybrid'];
  if (!validStrategies.includes(config.multiTenant.strategy)) {
    errors.push(`Invalid multi-tenant strategy: ${config.multiTenant.strategy}`);
  }

  // Validate validation level
  const validLevels = ['off', 'moderate', 'strict'];
  if (!validLevels.includes(config.validation.level)) {
    errors.push(`Invalid validation level: ${config.validation.level}`);
  }

  // Validate backup provider
  const validProviders = ['local', 's3', 'azure', 'gcp'];
  if (!validProviders.includes(config.backup.provider)) {
    errors.push(`Invalid backup provider: ${config.backup.provider}`);
  }

  // Validate security settings
  if (config.security.authEnabled && (!config.security.username || !config.security.password)) {
    errors.push('Username and password are required when authentication is enabled');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (config.uri.includes('localhost') || config.uri.includes('127.0.0.1')) {
      errors.push('Production database should not use localhost');
    }
    if (!config.security.authEnabled) {
      errors.push('Database authentication must be enabled in production');
    }
    if (!config.backup.enabled) {
      errors.push('Database backups must be enabled in production');
    }
    if (!config.security.tls && !config.uri.includes('mongodb+srv://')) {
      errors.push('TLS/SSL must be enabled for production database connections');
    }
  }

  if (errors.length > 0) {
    throw new Error('Database configuration validation failed:\n' + errors.join('\n'));
  }

  return true;
};

// Validate the configuration
validateDatabaseConfig(databaseConfig);

// Export configuration
module.exports = databaseConfig;