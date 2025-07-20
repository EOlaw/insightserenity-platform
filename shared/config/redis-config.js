'use strict';

/**
 * @fileoverview Redis configuration for caching, sessions, and real-time features
 * @module shared/config/redis-config
 */

const { parseBoolean, parseNumber, parseArray } = require('./base-config').helpers;

// Redis configuration object
const redisConfig = {
  // Connection settings
  enabled: parseBoolean(process.env.REDIS_ENABLED, true),
  host: process.env.REDIS_HOST || 'localhost',
  port: parseNumber(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD || '',
  username: process.env.REDIS_USERNAME || '',
  database: parseNumber(process.env.REDIS_DATABASE, 0),
  connectionName: process.env.REDIS_CONNECTION_NAME || 'InsightSerenity',
  
  // Connection URL (overrides individual settings if provided)
  url: process.env.REDIS_URL || null,

  // Connection pool settings
  pool: {
    min: parseNumber(process.env.REDIS_POOL_MIN, 5),
    max: parseNumber(process.env.REDIS_POOL_MAX, 50),
    acquireTimeoutMillis: parseNumber(process.env.REDIS_POOL_ACQUIRE_TIMEOUT, 10000),
    idleTimeoutMillis: parseNumber(process.env.REDIS_POOL_IDLE_TIMEOUT, 30000),
    evictionRunIntervalMillis: parseNumber(process.env.REDIS_POOL_EVICTION_INTERVAL, 60000),
    testOnBorrow: parseBoolean(process.env.REDIS_POOL_TEST_ON_BORROW, true)
  },

  // Retry strategy
  retry: {
    attempts: parseNumber(process.env.REDIS_RETRY_ATTEMPTS, 10),
    delay: parseNumber(process.env.REDIS_RETRY_DELAY, 500),
    backoff: process.env.REDIS_RETRY_BACKOFF || 'exponential', // linear, exponential
    maxDelay: parseNumber(process.env.REDIS_RETRY_MAX_DELAY, 3000)
  },

  // TLS/SSL configuration
  tls: {
    enabled: parseBoolean(process.env.REDIS_TLS_ENABLED, false),
    ca: process.env.REDIS_TLS_CA || '',
    cert: process.env.REDIS_TLS_CERT || '',
    key: process.env.REDIS_TLS_KEY || '',
    rejectUnauthorized: parseBoolean(process.env.REDIS_TLS_REJECT_UNAUTHORIZED, true),
    servername: process.env.REDIS_TLS_SERVERNAME || ''
  },

  // Sentinel configuration (for high availability)
  sentinel: {
    enabled: parseBoolean(process.env.REDIS_SENTINEL_ENABLED, false),
    sentinels: parseArray(process.env.REDIS_SENTINELS, []),
    name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
    password: process.env.REDIS_SENTINEL_PASSWORD || '',
    sentinelRetryStrategy: {
      attempts: parseNumber(process.env.REDIS_SENTINEL_RETRY_ATTEMPTS, 10),
      delay: parseNumber(process.env.REDIS_SENTINEL_RETRY_DELAY, 1000)
    }
  },

  // Cluster configuration (for horizontal scaling)
  cluster: {
    enabled: parseBoolean(process.env.REDIS_CLUSTER_ENABLED, false),
    nodes: parseArray(process.env.REDIS_CLUSTER_NODES, []),
    options: {
      enableReadyCheck: parseBoolean(process.env.REDIS_CLUSTER_READY_CHECK, true),
      maxRedirections: parseNumber(process.env.REDIS_CLUSTER_MAX_REDIRECTIONS, 16),
      retryDelayOnFailover: parseNumber(process.env.REDIS_CLUSTER_FAILOVER_DELAY, 100),
      retryDelayOnClusterDown: parseNumber(process.env.REDIS_CLUSTER_DOWN_DELAY, 300),
      slotsRefreshTimeout: parseNumber(process.env.REDIS_CLUSTER_SLOTS_TIMEOUT, 1000),
      clusterRetryStrategy: {
        attempts: parseNumber(process.env.REDIS_CLUSTER_RETRY_ATTEMPTS, 10),
        delay: parseNumber(process.env.REDIS_CLUSTER_RETRY_DELAY, 1000)
      }
    }
  },

  // Cache configuration
  cache: {
    prefix: process.env.REDIS_CACHE_PREFIX || 'cache:',
    ttl: parseNumber(process.env.REDIS_CACHE_TTL, 3600), // 1 hour default
    maxKeys: parseNumber(process.env.REDIS_CACHE_MAX_KEYS, 10000),
    checkPeriod: parseNumber(process.env.REDIS_CACHE_CHECK_PERIOD, 600), // 10 minutes
    useClones: parseBoolean(process.env.REDIS_CACHE_USE_CLONES, true),
    deleteOnExpire: parseBoolean(process.env.REDIS_CACHE_DELETE_ON_EXPIRE, true),
    enableLocking: parseBoolean(process.env.REDIS_CACHE_ENABLE_LOCKING, true),
    lockTimeout: parseNumber(process.env.REDIS_CACHE_LOCK_TIMEOUT, 5000),
    lockRetries: parseNumber(process.env.REDIS_CACHE_LOCK_RETRIES, 3)
  },

  // Session store configuration
  session: {
    prefix: process.env.REDIS_SESSION_PREFIX || 'sess:',
    ttl: parseNumber(process.env.REDIS_SESSION_TTL, 86400), // 24 hours
    disableTouch: parseBoolean(process.env.REDIS_SESSION_DISABLE_TOUCH, false),
    serializer: process.env.REDIS_SESSION_SERIALIZER || 'json', // json, msgpack
    scanCount: parseNumber(process.env.REDIS_SESSION_SCAN_COUNT, 100)
  },

  // Queue configuration (for background jobs)
  queue: {
    prefix: process.env.REDIS_QUEUE_PREFIX || 'queue:',
    defaultJobOptions: {
      removeOnComplete: parseBoolean(process.env.REDIS_QUEUE_REMOVE_ON_COMPLETE, true),
      removeOnFail: parseBoolean(process.env.REDIS_QUEUE_REMOVE_ON_FAIL, false),
      attempts: parseNumber(process.env.REDIS_QUEUE_ATTEMPTS, 3),
      backoff: {
        type: process.env.REDIS_QUEUE_BACKOFF_TYPE || 'exponential',
        delay: parseNumber(process.env.REDIS_QUEUE_BACKOFF_DELAY, 5000)
      }
    },
    rateLimiter: {
      max: parseNumber(process.env.REDIS_QUEUE_RATE_LIMIT_MAX, 10),
      duration: parseNumber(process.env.REDIS_QUEUE_RATE_LIMIT_DURATION, 1000)
    }
  },

  // Pub/Sub configuration
  pubsub: {
    enabled: parseBoolean(process.env.REDIS_PUBSUB_ENABLED, true),
    prefix: process.env.REDIS_PUBSUB_PREFIX || 'pubsub:',
    channels: {
      notifications: process.env.REDIS_PUBSUB_NOTIFICATIONS || 'notifications',
      events: process.env.REDIS_PUBSUB_EVENTS || 'events',
      updates: process.env.REDIS_PUBSUB_UPDATES || 'updates',
      broadcast: process.env.REDIS_PUBSUB_BROADCAST || 'broadcast'
    }
  },

  // Rate limiting configuration
  rateLimiter: {
    prefix: process.env.REDIS_RATE_LIMIT_PREFIX || 'rl:',
    points: parseNumber(process.env.REDIS_RATE_LIMIT_POINTS, 100),
    duration: parseNumber(process.env.REDIS_RATE_LIMIT_DURATION, 900), // 15 minutes
    blockDuration: parseNumber(process.env.REDIS_RATE_LIMIT_BLOCK_DURATION, 600), // 10 minutes
    execEvenly: parseBoolean(process.env.REDIS_RATE_LIMIT_EXEC_EVENLY, false)
  },

  // Multi-tenant support
  multiTenant: {
    enabled: parseBoolean(process.env.REDIS_MULTI_TENANT_ENABLED, true),
    isolationStrategy: process.env.REDIS_TENANT_ISOLATION || 'prefix', // prefix, database
    tenantPrefix: process.env.REDIS_TENANT_PREFIX || 'tenant:',
    sharedKeys: parseArray(process.env.REDIS_SHARED_KEYS, ['system', 'config']),
    maxDbIndex: parseNumber(process.env.REDIS_MAX_DB_INDEX, 15)
  },

  // Performance optimization
  performance: {
    pipelining: parseBoolean(process.env.REDIS_PIPELINING, true),
    offlineQueue: parseBoolean(process.env.REDIS_OFFLINE_QUEUE, true),
    lazyConnect: parseBoolean(process.env.REDIS_LAZY_CONNECT, false),
    enableReadyCheck: parseBoolean(process.env.REDIS_READY_CHECK, true),
    enableAutoPipelining: parseBoolean(process.env.REDIS_AUTO_PIPELINING, true),
    autoPipeliningIgnoredCommands: parseArray(process.env.REDIS_AUTO_PIPELINE_IGNORE, ['info', 'ping'])
  },

  // Monitoring and metrics
  monitoring: {
    enabled: parseBoolean(process.env.REDIS_MONITORING_ENABLED, true),
    commandStats: parseBoolean(process.env.REDIS_COMMAND_STATS, true),
    latencyMonitor: parseBoolean(process.env.REDIS_LATENCY_MONITOR, true),
    slowlogThreshold: parseNumber(process.env.REDIS_SLOWLOG_THRESHOLD, 10000), // microseconds
    keyspaceNotifications: process.env.REDIS_KEYSPACE_NOTIFICATIONS || 'Ex', // Expired events
    memoryAnalysis: parseBoolean(process.env.REDIS_MEMORY_ANALYSIS, true),
    metricsInterval: parseNumber(process.env.REDIS_METRICS_INTERVAL, 60000) // 1 minute
  },

  // Persistence configuration
  persistence: {
    aof: {
      enabled: parseBoolean(process.env.REDIS_AOF_ENABLED, true),
      fsync: process.env.REDIS_AOF_FSYNC || 'everysec' // always, everysec, no
    },
    rdb: {
      enabled: parseBoolean(process.env.REDIS_RDB_ENABLED, true),
      checksum: parseBoolean(process.env.REDIS_RDB_CHECKSUM, true),
      compression: parseBoolean(process.env.REDIS_RDB_COMPRESSION, true)
    }
  },

  // Memory management
  memory: {
    policy: process.env.REDIS_MEMORY_POLICY || 'allkeys-lru',
    maxMemory: process.env.REDIS_MAX_MEMORY || '256mb',
    maxMemorySamples: parseNumber(process.env.REDIS_MEMORY_SAMPLES, 5),
    evictionPolicy: process.env.REDIS_EVICTION_POLICY || 'volatile-lru'
  },

  // Security settings
  security: {
    requirePass: parseBoolean(process.env.REDIS_REQUIRE_PASS, true),
    renameCommands: parseArray(process.env.REDIS_RENAME_COMMANDS, []),
    disableCommands: parseArray(process.env.REDIS_DISABLE_COMMANDS, ['FLUSHDB', 'FLUSHALL', 'CONFIG']),
    aclEnabled: parseBoolean(process.env.REDIS_ACL_ENABLED, false),
    aclFile: process.env.REDIS_ACL_FILE || ''
  }
};

// Validate Redis configuration
const validateRedisConfig = (config) => {
  const errors = [];

  if (!config.enabled) {
    return true; // Skip validation if Redis is disabled
  }

  // Validate connection settings
  if (!config.url && !config.host) {
    errors.push('Redis host or URL is required');
  }

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }

  // Validate pool settings
  if (config.pool.min > config.pool.max) {
    errors.push('Redis pool min size cannot be greater than max size');
  }

  // Validate retry backoff
  const validBackoffs = ['linear', 'exponential'];
  if (!validBackoffs.includes(config.retry.backoff)) {
    errors.push(`Invalid retry backoff: ${config.retry.backoff}`);
  }

  // Validate cluster configuration
  if (config.cluster.enabled && config.cluster.nodes.length === 0) {
    errors.push('Redis cluster nodes are required when cluster is enabled');
  }

  // Validate sentinel configuration
  if (config.sentinel.enabled && config.sentinel.sentinels.length === 0) {
    errors.push('Redis sentinel nodes are required when sentinel is enabled');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (!config.password && config.security.requirePass) {
      errors.push('Redis password is required in production');
    }
    if (!config.tls.enabled && !config.url?.includes('rediss://')) {
      console.warn('Warning: TLS is recommended for Redis in production');
    }
    if (!config.persistence.aof.enabled && !config.persistence.rdb.enabled) {
      errors.push('At least one persistence method should be enabled in production');
    }
  }

  // Validate memory policy
  const validPolicies = [
    'noeviction',
    'allkeys-lru',
    'volatile-lru',
    'allkeys-lfu',
    'volatile-lfu',
    'allkeys-random',
    'volatile-random',
    'volatile-ttl'
  ];
  if (!validPolicies.includes(config.memory.policy)) {
    errors.push(`Invalid memory policy: ${config.memory.policy}`);
  }

  if (errors.length > 0) {
    throw new Error('Redis configuration validation failed:\n' + errors.join('\n'));
  }

  return true;
};

// Validate the configuration
validateRedisConfig(redisConfig);

// Export configuration
module.exports = redisConfig;