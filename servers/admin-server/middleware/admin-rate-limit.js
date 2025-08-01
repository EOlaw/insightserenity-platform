'use strict';

/**
 * @fileoverview Enterprise-grade caching service with Redis and in-memory fallback
 * @module shared/lib/services/cache-service
 * @requires module:ioredis
 * @requires module:node-cache
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/config
 */

const Redis = require('ioredis');
const NodeCache = require('node-cache');
const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const config = require('../../../shared/config');
const { ERROR_CODES } = require('../../../shared/lib/utils/constants/error-codes');
const crypto = require('crypto');

/**
 * @class CacheService
 * @description Multi-tier caching service with Redis primary and in-memory fallback
 */
class CacheService {
  /**
   * @private
   * @type {Redis}
   */
  #redisClient;

  /**
   * @private
   * @type {Redis}
   */
  #redisSubscriber;

  /**
   * @private
   * @type {Redis}
   */
  #redisPublisher;

  /**
   * @private
   * @type {NodeCache}
   */
  #memoryCache;

  /**
   * @private
   * @type {Map<string, Function>}
   */
  #refreshHandlers;

  /**
   * @private
   * @type {Map<string, NodeJS.Timeout>}
   */
  #refreshTimers;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {boolean}
   */
  #isConnected;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #cacheStats;

  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @type {number}
   */
  #reconnectAttempts;

  /**
   * @private
   * @type {boolean}
   */
  #redisEnabled;

  /**
   * @private
   * @static
   * @type {Map<string, CacheService>}
   */
  static #instances = new Map();

  /**
   * Creates cache service instance
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.redis] - Redis configuration
   * @param {Object} [options.memory] - Memory cache configuration
   * @param {boolean} [options.encryption=false] - Enable encryption
   * @param {boolean} [options.compression=true] - Enable compression
   * @param {string} [options.namespace=''] - Cache key namespace
   */
  constructor(options = {}) {
    this.#config = {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        password: config.redis?.password,
        db: config.redis?.db || 0,
        keyPrefix: config.redis?.keyPrefix || 'cache:',
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
        commandTimeout: 3000,
        retryConnectOnFailover: false,
        retries: 3,
        retryDelay: function(times) {
          return Math.min(times * 1000, 3000);
        },
        maxRetryTime: 15000,
        ...options.redis
      },
      memory: {
        stdTTL: 600, // 10 minutes
        checkperiod: 120, // 2 minutes
        useClones: false,
        maxKeys: 1000,
        ...options.memory
      },
      encryption: options.encryption || config.cache?.encryption || false,
      compression: options.compression ?? config.cache?.compression ?? true,
      namespace: options.namespace || '',
      fallbackToMemory: options.fallbackToMemory ?? true,
      syncToMemory: options.syncToMemory ?? true,
      statsInterval: options.statsInterval || 60000, // 1 minute
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      redisEnabled: options.redisEnabled ?? config.redis?.enabled ?? true
    };

    this.#isConnected = false;
    this.#reconnectAttempts = 0;
    this.#redisEnabled = this.#config.redisEnabled;
    this.#refreshHandlers = new Map();
    this.#refreshTimers = new Map();
    this.#cacheStats = new Map();

    if (this.#config.encryption) {
      try {
        const EncryptionService = require('../security/encryption/encryption-service');
        this.#encryptionService = new EncryptionService();
      } catch (error) {
        logger.warn('Encryption service not available, proceeding without encryption', {
          error: error.message
        });
        this.#config.encryption = false;
      }
    }

    this.#initialize();
  }

  /**
   * Get or create singleton instance
   * @static
   * @param {Object} [options] - Configuration options
   * @returns {CacheService} Cache service instance
   */
  static getInstance(options = {}) {
    const key = options.namespace || 'default';
    
    if (!this.#instances.has(key)) {
      this.#instances.set(key, new CacheService(options));
    }
    
    return this.#instances.get(key);
  }

  /**
   * Get underlying Redis client for advanced operations
   * @returns {Redis|null} Redis client or null if not connected
   */
  getClient() {
    return this.#isConnected && this.#redisClient ? this.#redisClient : null;
  }

  /**
   * Check if Redis is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.#isConnected;
  }

  /**
   * Check if Redis is enabled in configuration
   * @returns {boolean} Redis enabled status
   */
  isRedisEnabled() {
    return this.#redisEnabled;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - Time to live in seconds
   * @param {Object} [options] - Additional options
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl, options = {}) {
    const fullKey = this.#buildKey(key);
    const startTime = Date.now();

    try {
      const serialized = await this.#serialize(value, options);
      const expiry = ttl || this.#config.memory.stdTTL;

      // Set in Redis if connected
      if (this.#isConnected && this.#redisEnabled) {
        try {
          await this.#redisClient.setex(fullKey, expiry, serialized);
          
          // Publish change event for distributed cache invalidation
          if (options.publish !== false) {
            await this.#publishChange('set', fullKey, { ttl: expiry });
          }
        } catch (redisError) {
          logger.warn('Redis set operation failed, using memory fallback', {
            key: fullKey,
            error: redisError.message
          });
        }
      }

      // Set in memory cache
      if (this.#config.syncToMemory || !this.#isConnected) {
        this.#memoryCache.set(fullKey, value, expiry);
      }

      // Update stats
      this.#updateStats('set', Date.now() - startTime, true);

      // Set up auto-refresh if handler provided
      if (options.refreshHandler) {
        this.#setupAutoRefresh(key, options.refreshHandler, ttl);
      }

      logger.debug('Cache set', { key: fullKey, ttl: expiry });
      return true;

    } catch (error) {
      this.#updateStats('set', Date.now() - startTime, false);
      logger.error('Cache set error', { key: fullKey, error: error.message });
      
      if (this.#config.fallbackToMemory) {
        try {
          this.#memoryCache.set(fullKey, value, ttl);
          return true;
        } catch (memoryError) {
          logger.error('Memory cache set also failed', {
            key: fullKey,
            error: memoryError.message
          });
        }
      }
      
      return false;
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @param {Object} [options] - Additional options
   * @returns {Promise<*>} Cached value or null
   */
  async get(key, options = {}) {
    const fullKey = this.#buildKey(key);
    const startTime = Date.now();

    try {
      let value = null;
      let source = 'none';

      // Try memory cache first
      if (this.#config.syncToMemory || !this.#isConnected) {
        value = this.#memoryCache.get(fullKey);
        if (value !== undefined) {
          source = 'memory';
        }
      }

      // Try Redis if not found in memory
      if (value === undefined && this.#isConnected && this.#redisEnabled) {
        try {
          const serialized = await this.#redisClient.get(fullKey);
          if (serialized) {
            value = await this.#deserialize(serialized, options);
            source = 'redis';
            
            // Sync to memory if enabled
            if (this.#config.syncToMemory && value !== null) {
              const ttl = await this.#redisClient.ttl(fullKey);
              if (ttl > 0) {
                this.#memoryCache.set(fullKey, value, ttl);
              }
            }
          }
        } catch (redisError) {
          logger.warn('Redis get operation failed', {
            key: fullKey,
            error: redisError.message
          });
        }
      }

      // Update stats
      this.#updateStats('get', Date.now() - startTime, value !== null, source);

      // Call loader function if provided and value not found
      if (value === null && options.loader) {
        value = await this.#loadAndCache(key, options.loader, options);
      }

      logger.debug('Cache get', { key: fullKey, found: value !== null, source });
      return value;

    } catch (error) {
      this.#updateStats('get', Date.now() - startTime, false);
      logger.error('Cache get error', { key: fullKey, error: error.message });
      
      // Try memory cache as fallback
      if (this.#config.fallbackToMemory) {
        const memoryValue = this.#memoryCache.get(fullKey);
        if (memoryValue !== undefined) {
          return memoryValue;
        }
      }
      
      return null;
    }
  }

  /**
   * Get multiple cache values
   * @param {Array<string>} keys - Cache keys
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Object with key-value pairs
   */
  async mget(keys, options = {}) {
    const fullKeys = keys.map(key => this.#buildKey(key));
    const startTime = Date.now();
    const results = {};

    try {
      // Get from memory first
      const memoryResults = {};
      const missingKeys = [];

      fullKeys.forEach((fullKey, index) => {
        const value = this.#memoryCache.get(fullKey);
        if (value !== undefined) {
          memoryResults[keys[index]] = value;
        } else {
          missingKeys.push(fullKey);
        }
      });

      // Get missing keys from Redis
      if (missingKeys.length > 0 && this.#isConnected && this.#redisEnabled) {
        try {
          const redisValues = await this.#redisClient.mget(...missingKeys);
          
          for (let i = 0; i < missingKeys.length; i++) {
            if (redisValues[i]) {
              const originalKey = keys[fullKeys.indexOf(missingKeys[i])];
              const value = await this.#deserialize(redisValues[i], options);
              results[originalKey] = value;
            }
          }
        } catch (redisError) {
          logger.warn('Redis mget operation failed', {
            keys: missingKeys,
            error: redisError.message
          });
        }
      }

      // Merge results
      Object.assign(results, memoryResults);

      this.#updateStats('mget', Date.now() - startTime, true);
      return results;

    } catch (error) {
      this.#updateStats('mget', Date.now() - startTime, false);
      logger.error('Cache mget error', { keys, error: error.message });
      return {};
    }
  }

  /**
   * Delete cache value
   * @param {string} key - Cache key
   * @param {Object} [options] - Additional options
   * @returns {Promise<boolean>} Success status
   */
  async delete(key, options = {}) {
    const fullKey = this.#buildKey(key);
    const startTime = Date.now();

    try {
      let deleted = false;

      // Delete from Redis
      if (this.#isConnected && this.#redisEnabled) {
        try {
          deleted = await this.#redisClient.del(fullKey) > 0;
          
          // Publish change event
          if (options.publish !== false) {
            await this.#publishChange('delete', fullKey);
          }
        } catch (redisError) {
          logger.warn('Redis delete operation failed', {
            key: fullKey,
            error: redisError.message
          });
        }
      }

      // Delete from memory
      const memoryDeleted = this.#memoryCache.del(fullKey);
      deleted = deleted || memoryDeleted;

      // Cancel auto-refresh
      this.#cancelAutoRefresh(key);

      this.#updateStats('delete', Date.now() - startTime, deleted);
      logger.debug('Cache delete', { key: fullKey, deleted });
      
      return deleted;

    } catch (error) {
      this.#updateStats('delete', Date.now() - startTime, false);
      logger.error('Cache delete error', { key: fullKey, error: error.message });
      return false;
    }
  }

  /**
   * Clear all cache
   * @param {Object} [options] - Additional options
   * @returns {Promise<boolean>} Success status
   */
  async clear(options = {}) {
    const startTime = Date.now();

    try {
      // Clear Redis
      if (this.#isConnected && this.#redisEnabled) {
        try {
          if (this.#config.redis.keyPrefix) {
            const keys = await this.#scanKeys('*');
            if (keys.length > 0) {
              await this.#redisClient.del(...keys);
            }
          } else {
            await this.#redisClient.flushdb();
          }
          
          // Publish clear event
          if (options.publish !== false) {
            await this.#publishChange('clear', '*');
          }
        } catch (redisError) {
          logger.warn('Redis clear operation failed', {
            error: redisError.message
          });
        }
      }

      // Clear memory
      this.#memoryCache.flushAll();

      // Clear all auto-refresh
      this.#refreshTimers.forEach(timer => clearTimeout(timer));
      this.#refreshTimers.clear();
      this.#refreshHandlers.clear();

      this.#updateStats('clear', Date.now() - startTime, true);
      logger.info('Cache cleared');
      
      return true;

    } catch (error) {
      this.#updateStats('clear', Date.now() - startTime, false);
      logger.error('Cache clear error', { error: error.message });
      return false;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Existence status
   */
  async exists(key) {
    const fullKey = this.#buildKey(key);

    try {
      // Check memory first
      if (this.#memoryCache.has(fullKey)) {
        return true;
      }

      // Check Redis
      if (this.#isConnected && this.#redisEnabled) {
        try {
          return await this.#redisClient.exists(fullKey) > 0;
        } catch (redisError) {
          logger.warn('Redis exists operation failed', {
            key: fullKey,
            error: redisError.message
          });
        }
      }

      return false;

    } catch (error) {
      logger.error('Cache exists error', { key: fullKey, error: error.message });
      return false;
    }
  }

  /**
   * Get remaining TTL for key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds, -1 if no TTL, -2 if not exists
   */
  async ttl(key) {
    const fullKey = this.#buildKey(key);

    try {
      // Check Redis first
      if (this.#isConnected && this.#redisEnabled) {
        try {
          return await this.#redisClient.ttl(fullKey);
        } catch (redisError) {
          logger.warn('Redis TTL operation failed', {
            key: fullKey,
            error: redisError.message
          });
        }
      }

      // Check memory
      const ttl = this.#memoryCache.getTtl(fullKey);
      if (ttl) {
        return Math.round((ttl - Date.now()) / 1000);
      }

      return -2;

    } catch (error) {
      logger.error('Cache TTL error', { key: fullKey, error: error.message });
      return -2;
    }
  }

  /**
   * Increment numeric value
   * @param {string} key - Cache key
   * @param {number} [amount=1] - Increment amount
   * @param {number} [ttl] - TTL in seconds
   * @returns {Promise<number>} New value
   */
  async increment(key, amount = 1, ttl) {
    const fullKey = this.#buildKey(key);

    try {
      let newValue;

      if (this.#isConnected && this.#redisEnabled) {
        try {
          newValue = await this.#redisClient.incrby(fullKey, amount);
          if (ttl) {
            await this.#redisClient.expire(fullKey, ttl);
          }
        } catch (redisError) {
          logger.warn('Redis increment operation failed, using memory fallback', {
            key: fullKey,
            error: redisError.message
          });
          // Fall through to memory implementation
        }
      }

      if (newValue === undefined) {
        const current = this.#memoryCache.get(fullKey) || 0;
        newValue = current + amount;
        this.#memoryCache.set(fullKey, newValue, ttl);
      }

      return newValue;

    } catch (error) {
      logger.error('Cache increment error', { key: fullKey, error: error.message });
      throw new AppError(
        'Failed to increment cache value',
        500,
        ERROR_CODES.CACHE_INCREMENT_ERROR,
        { key, error: error.message }
      );
    }
  }

  /**
   * Decrement numeric value
   * @param {string} key - Cache key
   * @param {number} [amount=1] - Decrement amount
   * @param {number} [ttl] - TTL in seconds
   * @returns {Promise<number>} New value
   */
  async decrement(key, amount = 1, ttl) {
    return this.increment(key, -amount, ttl);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const stats = {
      memory: {
        keys: this.#memoryCache.keys().length,
        hits: this.#memoryCache.getStats().hits,
        misses: this.#memoryCache.getStats().misses,
        hitRate: this.#calculateHitRate(this.#memoryCache.getStats())
      },
      redis: {
        connected: this.#isConnected,
        enabled: this.#redisEnabled,
        reconnectAttempts: this.#reconnectAttempts
      },
      operations: {}
    };

    // Aggregate operation stats
    this.#cacheStats.forEach((opStats, operation) => {
      stats.operations[operation] = {
        count: opStats.count,
        successCount: opStats.successCount,
        failureCount: opStats.failureCount,
        avgDuration: opStats.totalDuration / opStats.count,
        successRate: (opStats.successCount / opStats.count) * 100
      };
    });

    return stats;
  }

  /**
   * @private
   * Initialize cache connections
   */
  async #initialize() {
    // Initialize memory cache
    this.#memoryCache = new NodeCache(this.#config.memory);

    // Initialize Redis only if enabled
    if (!this.#redisEnabled) {
      logger.info('Redis disabled, using memory cache only');
      this.#startStatsCollection();
      return;
    }

    try {
      this.#redisClient = new Redis({
        ...this.#config.redis,
        lazyConnect: true
      });

      this.#redisSubscriber = this.#redisClient.duplicate();
      this.#redisPublisher = this.#redisClient.duplicate();

      // Set up event handlers
      this.#setupRedisEventHandlers();

      // Connect with timeout
      const connectPromise = Promise.all([
        this.#redisClient.connect(),
        this.#redisSubscriber.connect(),
        this.#redisPublisher.connect()
      ]);

      await Promise.race([
        connectPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);

      // Subscribe to cache changes
      await this.#subscribeToChanges();

      this.#isConnected = true;
      logger.info('CacheService initialized with Redis', {
        host: this.#config.redis.host,
        port: this.#config.redis.port
      });

    } catch (error) {
      logger.warn('Redis connection failed, using memory cache only', {
        error: error.message
      });
      this.#isConnected = false;
      this.#redisEnabled = false;
    }

    // Start stats collection
    this.#startStatsCollection();
  }

  /**
   * @private
   * Set up Redis event handlers with reconnection limits
   */
  #setupRedisEventHandlers() {
    this.#redisClient.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
      this.#isConnected = false;
    });

    this.#redisClient.on('connect', () => {
      logger.info('Redis client connected');
      this.#isConnected = true;
      this.#reconnectAttempts = 0; // Reset counter on successful connection
    });

    this.#redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.#redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
      this.#isConnected = false;
    });

    this.#redisClient.on('reconnecting', (ms) => {
      this.#reconnectAttempts++;
      
      if (this.#reconnectAttempts >= this.#config.maxReconnectAttempts) {
        logger.error('Maximum Redis reconnection attempts reached, disabling Redis', {
          attempts: this.#reconnectAttempts,
          maxAttempts: this.#config.maxReconnectAttempts
        });
        
        // Disconnect to stop further attempts
        try {
          this.#redisClient.disconnect();
          this.#redisSubscriber.disconnect();
          this.#redisPublisher.disconnect();
        } catch (disconnectError) {
          logger.error('Error disconnecting Redis clients', {
            error: disconnectError.message
          });
        }
        
        this.#redisEnabled = false;
        this.#isConnected = false;
        return;
      }
      
      logger.info('Redis client reconnecting', {
        attempt: this.#reconnectAttempts,
        delay: ms,
        maxAttempts: this.#config.maxReconnectAttempts
      });
    });

    this.#redisClient.on('end', () => {
      logger.warn('Redis connection ended');
      this.#isConnected = false;
    });

    // Set up similar handlers for subscriber and publisher
    this.#setupRedisClientHandlers(this.#redisSubscriber, 'subscriber');
    this.#setupRedisClientHandlers(this.#redisPublisher, 'publisher');
  }

  /**
   * @private
   * Set up event handlers for Redis client instances
   */
  #setupRedisClientHandlers(client, type) {
    client.on('error', (error) => {
      logger.error(`Redis ${type} error`, { error: error.message });
    });

    client.on('connect', () => {
      logger.debug(`Redis ${type} connected`);
    });

    client.on('close', () => {
      logger.debug(`Redis ${type} connection closed`);
    });
  }

  /**
   * @private
   * Subscribe to cache change events
   */
  async #subscribeToChanges() {
    if (!this.#isConnected || !this.#redisSubscriber) return;

    try {
      const channel = `${this.#config.redis.keyPrefix}changes`;
      
      await this.#redisSubscriber.subscribe(channel);
      
      this.#redisSubscriber.on('message', (channel, message) => {
        try {
          const { action, key } = JSON.parse(message);
          this.#handleCacheChange(action, key);
        } catch (error) {
          logger.error('Error handling cache change message', { error: error.message });
        }
      });
    } catch (error) {
      logger.error('Failed to subscribe to cache changes', { error: error.message });
    }
  }

  /**
   * @private
   * Publish cache change event
   */
  async #publishChange(action, key, data = {}) {
    if (!this.#isConnected || !this.#redisPublisher) return;

    const channel = `${this.#config.redis.keyPrefix}changes`;
    const message = JSON.stringify({ action, key, ...data });
    
    try {
      await this.#redisPublisher.publish(channel, message);
    } catch (error) {
      logger.error('Error publishing cache change', { error: error.message });
    }
  }

  /**
   * @private
   * Handle cache change from other instances
   */
  #handleCacheChange(action, key) {
    switch (action) {
      case 'set':
        // Invalidate local memory cache to force reload from Redis
        this.#memoryCache.del(key);
        break;
      
      case 'delete':
        this.#memoryCache.del(key);
        break;
      
      case 'clear':
        this.#memoryCache.flushAll();
        break;
    }
  }

  /**
   * @private
   * Build full cache key
   */
  #buildKey(key) {
    const namespace = this.#config.namespace ? `${this.#config.namespace}:` : '';
    return `${namespace}${key}`;
  }

  /**
   * @private
   * Serialize value for storage
   */
  async #serialize(value, options = {}) {
    let serialized = JSON.stringify(value);
    
    // Compress if enabled
    if (this.#config.compression && serialized.length > 1024) {
      try {
        const zlib = require('zlib');
        serialized = zlib.gzipSync(serialized).toString('base64');
        serialized = `gzip:${serialized}`;
      } catch (error) {
        logger.warn('Compression failed, storing uncompressed', {
          error: error.message
        });
      }
    }
    
    // Encrypt if enabled
    if (this.#config.encryption && options.encrypt !== false && this.#encryptionService) {
      try {
        serialized = await this.#encryptionService.encrypt(serialized);
        serialized = `enc:${serialized}`;
      } catch (error) {
        logger.warn('Encryption failed, storing unencrypted', {
          error: error.message
        });
      }
    }
    
    return serialized;
  }

  /**
   * @private
   * Deserialize value from storage
   */
  async #deserialize(data, options = {}) {
    let deserialized = data;
    
    // Decrypt if encrypted
    if (deserialized.startsWith('enc:')) {
      if (this.#encryptionService) {
        try {
          deserialized = deserialized.substring(4);
          deserialized = await this.#encryptionService.decrypt(deserialized);
        } catch (error) {
          logger.error('Decryption failed', { error: error.message });
          throw error;
        }
      } else {
        throw new Error('Encrypted data found but encryption service not available');
      }
    }
    
    // Decompress if compressed
    if (deserialized.startsWith('gzip:')) {
      try {
        const zlib = require('zlib');
        deserialized = deserialized.substring(5);
        deserialized = zlib.gunzipSync(Buffer.from(deserialized, 'base64')).toString();
      } catch (error) {
        logger.error('Decompression failed', { error: error.message });
        throw error;
      }
    }
    
    return JSON.parse(deserialized);
  }

  /**
   * @private
   * Load value and cache it
   */
  async #loadAndCache(key, loader, options = {}) {
    try {
      const value = await loader();
      
      if (value !== null && value !== undefined) {
        const ttl = options.ttl || this.#config.memory.stdTTL;
        await this.set(key, value, ttl, options);
      }
      
      return value;
    } catch (error) {
      logger.error('Cache loader error', { key, error: error.message });
      throw error;
    }
  }

  /**
   * @private
   * Scan Redis keys by pattern
   */
  async #scanKeys(pattern) {
    if (!this.#isConnected || !this.#redisClient) return [];

    const keys = [];
    try {
      const stream = this.#redisClient.scanStream({
        match: this.#config.redis.keyPrefix + pattern,
        count: 100
      });

      return new Promise((resolve, reject) => {
        stream.on('data', (resultKeys) => {
          keys.push(...resultKeys);
        });
        
        stream.on('end', () => {
          resolve(keys);
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Redis scan failed', { error: error.message });
      return [];
    }
  }

  /**
   * @private
   * Set up auto-refresh for key
   */
  #setupAutoRefresh(key, handler, ttl) {
    // Cancel existing refresh
    this.#cancelAutoRefresh(key);
    
    // Store handler
    this.#refreshHandlers.set(key, handler);
    
    // Schedule refresh before expiry
    const refreshInterval = (ttl * 1000) * 0.8; // Refresh at 80% of TTL
    
    const timer = setInterval(async () => {
      try {
        const value = await handler();
        if (value !== null && value !== undefined) {
          await this.set(key, value, ttl, { refreshHandler: handler });
        }
      } catch (error) {
        logger.error('Auto-refresh error', { key, error: error.message });
      }
    }, refreshInterval);
    
    this.#refreshTimers.set(key, timer);
  }

  /**
   * @private
   * Cancel auto-refresh for key
   */
  #cancelAutoRefresh(key) {
    const timer = this.#refreshTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.#refreshTimers.delete(key);
      this.#refreshHandlers.delete(key);
    }
  }

  /**
   * @private
   * Update operation statistics
   */
  #updateStats(operation, duration, success, source = null) {
    if (!this.#cacheStats.has(operation)) {
      this.#cacheStats.set(operation, {
        count: 0,
        successCount: 0,
        failureCount: 0,
        totalDuration: 0,
        sources: {}
      });
    }

    const stats = this.#cacheStats.get(operation);
    stats.count++;
    stats.totalDuration += duration;
    
    if (success) {
      stats.successCount++;
      if (source) {
        stats.sources[source] = (stats.sources[source] || 0) + 1;
      }
    } else {
      stats.failureCount++;
    }
  }

  /**
   * @private
   * Calculate hit rate
   */
  #calculateHitRate(stats) {
    const total = stats.hits + stats.misses;
    return total > 0 ? (stats.hits / total) * 100 : 0;
  }

  /**
   * @private
   * Start statistics collection
   */
  #startStatsCollection() {
    setInterval(() => {
      const stats = this.getStats();
      logger.debug('Cache statistics', stats);
    }, this.#config.statsInterval);
  }

  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down CacheService');

    // Clear all timers
    this.#refreshTimers.forEach(timer => clearInterval(timer));
    this.#refreshTimers.clear();

    // Close Redis connections
    if (this.#redisClient) {
      try {
        await this.#redisClient.quit();
      } catch (error) {
        logger.error('Error closing Redis client', { error: error.message });
      }
    }
    
    if (this.#redisSubscriber) {
      try {
        await this.#redisSubscriber.quit();
      } catch (error) {
        logger.error('Error closing Redis subscriber', { error: error.message });
      }
    }
    
    if (this.#redisPublisher) {
      try {
        await this.#redisPublisher.quit();
      } catch (error) {
        logger.error('Error closing Redis publisher', { error: error.message });
      }
    }

    // Clear memory cache
    this.#memoryCache.flushAll();
    this.#memoryCache.close();

    this.#isConnected = false;
    this.#redisEnabled = false;
    logger.info('CacheService shutdown complete');
  }
}

module.exports = CacheService;