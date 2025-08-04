'use strict';

/**
 * @fileoverview Enhanced Redis configuration with memory fallback support
 * @module shared/config/redis-config
 */

const { parseBoolean, parseNumber, parseArray } = require('./base-config').helpers;

// Redis configuration object with enhanced fallback support
const redisConfig = {
  // Connection settings
  enabled: parseBoolean(process.env.REDIS_ENABLED, false),
  host: process.env.REDIS_HOST || 'localhost',
  port: parseNumber(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD || '',
  username: process.env.REDIS_USERNAME || '',
  database: parseNumber(process.env.REDIS_DATABASE, 0),
  connectionName: process.env.REDIS_CONNECTION_NAME || 'InsightSerenity',
  
  // Connection URL (overrides individual settings if provided)
  url: process.env.REDIS_URL || null,

  // Enhanced fallback configuration
  fallback: {
    enabled: parseBoolean(process.env.CACHE_FALLBACK_TO_MEMORY, false),
    maxReconnectAttempts: parseNumber(process.env.CACHE_MAX_RECONNECT_ATTEMPTS, 3),
    reconnectDelay: parseNumber(process.env.CACHE_RECONNECT_DELAY, 5000),
    disableRetryOnFailure: parseBoolean(process.env.CACHE_DISABLE_RETRY_ON_FAILURE, false),
    memoryStore: {
      maxItems: parseNumber(process.env.CACHE_MEMORY_MAX_ITEMS, 10000),
      ttlCheckInterval: parseNumber(process.env.CACHE_MEMORY_TTL_CHECK_INTERVAL, 60000),
      defaultTtl: parseNumber(process.env.CACHE_MEMORY_DEFAULT_TTL, 3600)
    }
  },

  // Connection pool settings
  pool: {
    min: parseNumber(process.env.REDIS_POOL_MIN, 5),
    max: parseNumber(process.env.REDIS_POOL_MAX, 50),
    acquireTimeoutMillis: parseNumber(process.env.REDIS_POOL_ACQUIRE_TIMEOUT, 10000),
    idleTimeoutMillis: parseNumber(process.env.REDIS_POOL_IDLE_TIMEOUT, 30000),
    evictionRunIntervalMillis: parseNumber(process.env.REDIS_POOL_EVICTION_INTERVAL, 60000),
    testOnBorrow: parseBoolean(process.env.REDIS_POOL_TEST_ON_BORROW, true)
  },

  // Enhanced retry strategy with controlled limits
  retry: {
    attempts: parseNumber(process.env.REDIS_RETRY_ATTEMPTS, 3),
    delay: parseNumber(process.env.REDIS_RETRY_DELAY, 5000),
    backoff: process.env.REDIS_RETRY_BACKOFF || 'linear',
    maxDelay: parseNumber(process.env.REDIS_RETRY_MAX_DELAY, 10000)
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
    ttl: parseNumber(process.env.REDIS_CACHE_TTL, 3600),
    maxKeys: parseNumber(process.env.REDIS_CACHE_MAX_KEYS, 10000),
    checkPeriod: parseNumber(process.env.REDIS_CACHE_CHECK_PERIOD, 600),
    useClones: parseBoolean(process.env.REDIS_CACHE_USE_CLONES, true),
    deleteOnExpire: parseBoolean(process.env.REDIS_CACHE_DELETE_ON_EXPIRE, true),
    enableLocking: parseBoolean(process.env.REDIS_CACHE_ENABLE_LOCKING, true),
    lockTimeout: parseNumber(process.env.REDIS_CACHE_LOCK_TIMEOUT, 5000),
    lockRetries: parseNumber(process.env.REDIS_CACHE_LOCK_RETRIES, 3)
  },

  // Session store configuration
  session: {
    prefix: process.env.REDIS_SESSION_PREFIX || 'sess:',
    ttl: parseNumber(process.env.REDIS_SESSION_TTL, 86400),
    disableTouch: parseBoolean(process.env.REDIS_SESSION_DISABLE_TOUCH, false),
    serializer: process.env.REDIS_SESSION_SERIALIZER || 'json',
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
    duration: parseNumber(process.env.REDIS_RATE_LIMIT_DURATION, 900),
    blockDuration: parseNumber(process.env.REDIS_RATE_LIMIT_BLOCK_DURATION, 600),
    execEvenly: parseBoolean(process.env.REDIS_RATE_LIMIT_EXEC_EVENLY, false)
  },

  // Multi-tenant support
  multiTenant: {
    enabled: parseBoolean(process.env.REDIS_MULTI_TENANT_ENABLED, true),
    isolationStrategy: process.env.REDIS_TENANT_ISOLATION || 'prefix',
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
    slowlogThreshold: parseNumber(process.env.REDIS_SLOWLOG_THRESHOLD, 10000),
    keyspaceNotifications: process.env.REDIS_KEYSPACE_NOTIFICATIONS || 'Ex',
    memoryAnalysis: parseBoolean(process.env.REDIS_MEMORY_ANALYSIS, true),
    metricsInterval: parseNumber(process.env.REDIS_METRICS_INTERVAL, 60000)
  },

  // Persistence configuration
  persistence: {
    aof: {
      enabled: parseBoolean(process.env.REDIS_AOF_ENABLED, true),
      fsync: process.env.REDIS_AOF_FSYNC || 'everysec'
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

console.log('Redis Configuration Debug:', {
  envValue: process.env.REDIS_ENABLED,
  parsedValue: parseBoolean(process.env.REDIS_ENABLED, false),
  finalEnabled: redisConfig.enabled
});

/**
 * Enhanced Memory Store Implementation
 * Provides Redis-compatible interface when Redis is unavailable
 */
class MemoryStore {
  constructor(options = {}) {
    this.store = new Map();
    this.timers = new Map();
    this.maxItems = options.maxItems || 10000;
    this.defaultTtl = options.defaultTtl || 3600;
    this.checkInterval = options.ttlCheckInterval || 60000;
    this.isMemoryClient = true;
    
    // Start TTL cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, this.checkInterval);
    
    console.log('[Redis] Memory store initialized with fallback support');
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.del(key);
      return null;
    }
    
    return item.value;
  }

  async set(key, value, ttl) {
    // Enforce item limit
    if (this.store.size >= this.maxItems && !this.store.has(key)) {
      this.evictOldest();
    }

    const expiresAt = ttl ? Date.now() + (ttl * 1000) : null;
    
    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });

    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set expiration timer
    if (expiresAt) {
      const timer = setTimeout(() => {
        this.del(key);
      }, ttl * 1000);
      this.timers.set(key, timer);
    }

    return 'OK';
  }

  async del(key) {
    const deleted = this.store.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return deleted ? 1 : 0;
  }

  async exists(key) {
    if (!this.store.has(key)) return 0;
    
    const item = this.store.get(key);
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.del(key);
      return 0;
    }
    
    return 1;
  }

  async expire(key, ttl) {
    const item = this.store.get(key);
    if (!item) return 0;
    
    const expiresAt = Date.now() + (ttl * 1000);
    item.expiresAt = expiresAt;
    
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.del(key);
    }, ttl * 1000);
    this.timers.set(key, timer);
    
    return 1;
  }

  async flushall() {
    this.store.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    return 'OK';
  }

  async keys(pattern) {
    const keys = Array.from(this.store.keys());
    if (pattern === '*') return keys;
    
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return keys.filter(key => regex.test(key));
  }

  async quit() {
    this.cleanup();
    return 'OK';
  }

  disconnect() {
    this.cleanup();
  }

  cleanup() {
    clearInterval(this.cleanupInterval);
    this.timers.forEach(timer => clearTimeout(timer));
    this.store.clear();
    this.timers.clear();
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.del(key);
      }
    }
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, item] of this.store.entries()) {
      if (item.createdAt < oldestTime) {
        oldestTime = item.createdAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.del(oldestKey);
    }
  }
}

/**
 * Enhanced Redis Client Factory with Robust Fallback
 */
class RedisClientFactory {
  static createClient() {
    // Return memory client if Redis is disabled or fallback is enabled
    if (!redisConfig.enabled || redisConfig.fallback.enabled) {
      console.log('[Redis] Using memory store fallback');
      return new MemoryStore(redisConfig.fallback.memoryStore);
    }

    try {
      const Redis = require('ioredis');
      
      const connectionOptions = {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        username: redisConfig.username,
        db: redisConfig.database,
        connectionName: redisConfig.connectionName,
        lazyConnect: true,
        maxRetriesPerRequest: redisConfig.retry.attempts,
        retryDelayOnFailover: redisConfig.retry.delay,
        retryDelayOnClusterDown: redisConfig.retry.delay,
        connectTimeout: 10000,
        commandTimeout: 5000,
        enableReadyCheck: redisConfig.performance.enableReadyCheck,
        enableOfflineQueue: redisConfig.performance.offlineQueue
      };

      if (redisConfig.url) {
        connectionOptions.url = redisConfig.url;
      }

      const client = new Redis(connectionOptions);
      let connectionAttempts = 0;

      // Enhanced error handling with fallback
      client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        
        if (redisConfig.fallback.disableRetryOnFailure || 
            connectionAttempts >= redisConfig.fallback.maxReconnectAttempts) {
          console.log('[Redis] Max retry attempts reached, disconnecting');
          client.disconnect();
          
          if (redisConfig.fallback.enabled) {
            console.log('[Redis] Falling back to memory store');
            return new MemoryStore(redisConfig.fallback.memoryStore);
          }
        }
        
        connectionAttempts++;
      });

      client.on('connect', () => {
        console.log('[Redis] Connected successfully');
        connectionAttempts = 0;
      });

      client.on('reconnecting', (delay) => {
        console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${connectionAttempts + 1})`);
      });

      client.on('end', () => {
        console.log('[Redis] Connection ended');
      });

      return client;

    } catch (error) {
      console.error('[Redis] Failed to initialize Redis client:', error.message);
      
      if (redisConfig.fallback.enabled) {
        console.log('[Redis] Falling back to memory store');
        return new MemoryStore(redisConfig.fallback.memoryStore);
      }
      
      throw error;
    }
  }
}

// Validate Redis configuration
const validateRedisConfig = (config) => {
  const errors = [];

  if (!config.enabled && !config.fallback.enabled) {
    errors.push('Either Redis or memory fallback must be enabled');
  }

  if (config.enabled) {
    if (!config.url && !config.host) {
      errors.push('Redis host or URL is required when Redis is enabled');
    }

    if (config.port < 1 || config.port > 65535) {
      errors.push('Redis port must be between 1 and 65535');
    }

    if (config.pool.min > config.pool.max) {
      errors.push('Redis pool min size cannot be greater than max size');
    }

    const validBackoffs = ['linear', 'exponential'];
    if (!validBackoffs.includes(config.retry.backoff)) {
      errors.push(`Invalid retry backoff: ${config.retry.backoff}`);
    }

    if (config.cluster.enabled && config.cluster.nodes.length === 0) {
      errors.push('Redis cluster nodes are required when cluster is enabled');
    }

    if (config.sentinel.enabled && config.sentinel.sentinels.length === 0) {
      errors.push('Redis sentinel nodes are required when sentinel is enabled');
    }

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

    const validPolicies = [
      'noeviction', 'allkeys-lru', 'volatile-lru', 'allkeys-lfu',
      'volatile-lfu', 'allkeys-random', 'volatile-random', 'volatile-ttl'
    ];
    if (!validPolicies.includes(config.memory.policy)) {
      errors.push(`Invalid memory policy: ${config.memory.policy}`);
    }
  }

  // if (errors.length > 0) {
  //   throw new Error('Redis configuration validation failed:\n' + errors.join('\n'));
  // }

  return true;
};

// Validate the configuration
validateRedisConfig(redisConfig);

// Export configuration and factory
module.exports = {
  config: redisConfig,
  RedisClientFactory,
  MemoryStore
};