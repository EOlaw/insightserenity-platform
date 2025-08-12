'use strict';

/**
 * @fileoverview Cache Manager Service - Enterprise-grade caching with Redis and in-memory fallback
 * @module servers/gateway/services/cache-manager
 * @version 3.0.0
 * @requires ioredis
 * @requires events
 * @requires crypto
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { promisify } = require('util');

// Enhanced LRU Cache Implementation with Version Compatibility
let LRUCacheClass;
let cacheImplementationType = 'fallback';

try {
    // Attempt to load lru-cache v7+ (ESM/Named export pattern)
    const lruModule = require('lru-cache');
    if (lruModule.LRUCache) {
        LRUCacheClass = lruModule.LRUCache;
        cacheImplementationType = 'lru-v7+';
    } else if (typeof lruModule === 'function') {
        // lru-cache v6 (Default export pattern)
        LRUCacheClass = lruModule;
        cacheImplementationType = 'lru-v6';
    } else {
        throw new Error('Unsupported lru-cache version');
    }
} catch (error) {
    console.warn('LRU cache package not available, implementing fallback cache');
    
    // Enterprise-grade fallback LRU implementation
    LRUCacheClass = class EnterpriseMapCache extends Map {
        constructor(options = {}) {
            super();
            this.maxSize = options.max || 1000;
            this.defaultTTL = options.ttl || 300000; // milliseconds
            this.timers = new Map();
            this.accessOrder = new Map();
            this.disposeCallback = options.dispose;
            this.updateAgeOnGet = options.updateAgeOnGet !== false;
            this.allowStale = options.allowStale || false;
            this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
            
            // Auto-cleanup interval
            this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
        }

        set(key, value, ttl) {
            // Clear existing timer
            this.clearTimer(key);
            
            // Enforce size limit with LRU eviction
            if (this.size >= this.maxSize && !this.has(key)) {
                this.evictLRU();
            }
            
            // Set value
            const expirationTime = Date.now() + (ttl || this.defaultTTL);
            const item = { value, expires: expirationTime, lastAccess: Date.now() };
            super.set(key, item);
            this.stats.sets++;
            
            // Update access order
            this.accessOrder.set(key, Date.now());
            
            // Set expiration timer
            const timeout = setTimeout(() => {
                this.deleteExpired(key);
            }, ttl || this.defaultTTL);
            
            this.timers.set(key, timeout);
            return this;
        }

        get(key) {
            const item = super.get(key);
            
            if (!item) {
                this.stats.misses++;
                return undefined;
            }
            
            // Check expiration
            if (Date.now() > item.expires) {
                if (!this.allowStale) {
                    this.delete(key);
                    this.stats.misses++;
                    return undefined;
                }
            }
            
            // Update access time if configured
            if (this.updateAgeOnGet) {
                item.lastAccess = Date.now();
                this.accessOrder.set(key, Date.now());
            }
            
            this.stats.hits++;
            return item.value;
        }

        has(key) {
            const item = super.get(key);
            if (!item) return false;
            
            // Check expiration
            if (Date.now() > item.expires) {
                this.delete(key);
                return false;
            }
            
            return true;
        }

        delete(key) {
            this.clearTimer(key);
            this.accessOrder.delete(key);
            this.stats.deletes++;
            
            if (this.disposeCallback && this.has(key)) {
                const item = super.get(key);
                this.disposeCallback(item.value, key, 'delete');
            }
            
            return super.delete(key);
        }

        clear() {
            // Clear all timers
            for (const timer of this.timers.values()) {
                clearTimeout(timer);
            }
            this.timers.clear();
            this.accessOrder.clear();
            
            // Call dispose for all items
            if (this.disposeCallback) {
                for (const [key, item] of this.entries()) {
                    this.disposeCallback(item.value, key, 'clear');
                }
            }
            
            super.clear();
        }

        clearTimer(key) {
            const timer = this.timers.get(key);
            if (timer) {
                clearTimeout(timer);
                this.timers.delete(key);
            }
        }

        deleteExpired(key) {
            if (this.disposeCallback && this.has(key)) {
                const item = super.get(key);
                this.disposeCallback(item.value, key, 'expire');
            }
            this.delete(key);
        }

        evictLRU() {
            if (this.size === 0) return;
            
            // Find least recently used item
            let oldestKey = null;
            let oldestTime = Date.now();
            
            for (const [key, accessTime] of this.accessOrder) {
                if (accessTime < oldestTime) {
                    oldestTime = accessTime;
                    oldestKey = key;
                }
            }
            
            if (oldestKey) {
                if (this.disposeCallback && this.has(oldestKey)) {
                    const item = super.get(oldestKey);
                    this.disposeCallback(item.value, oldestKey, 'evict');
                }
                this.delete(oldestKey);
                this.stats.evictions++;
            }
        }

        cleanup() {
            const now = Date.now();
            const keysToDelete = [];
            
            for (const [key, item] of this.entries()) {
                if (now > item.expires) {
                    keysToDelete.push(key);
                }
            }
            
            for (const key of keysToDelete) {
                this.deleteExpired(key);
            }
        }

        getStats() {
            return { ...this.stats };
        }

        destroy() {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }
            this.clear();
        }
    };
    
    cacheImplementationType = 'enterprise-fallback';
}

// Redis client with enhanced error handling
let Redis;
try {
    Redis = require('ioredis');
} catch (error) {
    console.warn('ioredis package not available, Redis functionality disabled');
    Redis = null;
}

// Optional cache-manager with graceful fallback
let cacheManager, redisStore;
try {
    cacheManager = require('cache-manager');
    try {
        redisStore = require('cache-manager-redis-store');
    } catch (error) {
        console.warn('cache-manager-redis-store not available');
    }
} catch (error) {
    console.warn('cache-manager not available, using direct implementation');
}

/**
 * Enterprise-grade Cache Manager with comprehensive caching strategies
 * Supports Redis clustering, memory caching, write-through, write-behind,
 * refresh-ahead patterns, and circuit breaker protection
 * 
 * @class CacheManager
 * @extends EventEmitter
 */
class CacheManager extends EventEmitter {
    /**
     * Creates an instance of CacheManager with enterprise configuration
     * @constructor
     * @param {Object} config - Comprehensive cache configuration
     */
    constructor(config = {}) {
        super();
        
        this.config = config;
        this.isConnected = false;
        this.implementationType = cacheImplementationType;
        
        // Core cache instances
        this.redisClient = null;
        this.redisPubClient = null;
        this.redisSubClient = null;
        this.memoryCache = null;
        this.multiTierCache = null;
        
        // Performance and monitoring metrics
        this.metrics = {
            operations: { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 },
            performance: { avgGetTime: 0, avgSetTime: 0, totalGetTime: 0, totalSetTime: 0 },
            memory: { hits: 0, misses: 0, evictions: 0, expirations: 0 },
            redis: { hits: 0, misses: 0, errors: 0, circuitBreakerTrips: 0 },
            ratios: { hitRate: 0, memoryHitRate: 0, redisHitRate: 0 }
        };
        
        // Enhanced configuration with enterprise defaults
        this.cacheConfig = this.buildEnterpriseConfig(config);
        
        // Advanced caching features
        this.patterns = new Map();
        this.tags = new Map();
        this.dependencies = new Map();
        this.writeBehindQueue = [];
        this.refreshAheadJobs = new Map();
        this.warmupFunctions = new Map();
        this.invalidationSubscriptions = new Set();
        
        // Circuit breaker for Redis resilience
        this.circuitBreaker = {
            state: 'closed', // 'closed', 'open', 'half-open'
            failures: 0,
            threshold: this.cacheConfig.circuitBreaker.threshold,
            timeout: this.cacheConfig.circuitBreaker.timeout,
            nextAttempt: null,
            successCount: 0
        };
        
        // Operational intervals
        this.intervals = {
            writeBehind: null,
            cleanup: null,
            monitoring: null,
            healthCheck: null
        };
        
        // Key management
        this.keyGenerator = config.keyGenerator || this.defaultKeyGenerator.bind(this);
        this.maxKeyLength = config.maxKeyLength || 250;
        
        console.log(`Cache Manager initialized with ${this.implementationType} implementation`);
    }

    /**
     * Builds enterprise-grade configuration with intelligent defaults
     * @private
     * @param {Object} config - User configuration
     * @returns {Object} Enhanced configuration
     */
    buildEnterpriseConfig(config) {
        return {
            redis: {
                enabled: config.redis?.enabled !== false,
                host: config.redis?.host || process.env.REDIS_HOST || 'localhost',
                port: config.redis?.port || process.env.REDIS_PORT || 6379,
                password: config.redis?.password || process.env.REDIS_PASSWORD,
                db: config.redis?.db || process.env.REDIS_DB || 0,
                keyPrefix: config.redis?.keyPrefix || process.env.REDIS_KEY_PREFIX || 'gateway:',
                ttl: config.redis?.ttl || 3600,
                maxRetriesPerRequest: config.redis?.maxRetriesPerRequest || 3,
                retryDelayOnFailover: config.redis?.retryDelayOnFailover || 100,
                enableOfflineQueue: config.redis?.enableOfflineQueue !== false,
                lazyConnect: config.redis?.lazyConnect !== false,
                keepAlive: config.redis?.keepAlive || 30000,
                ...config.redis
            },
            memory: {
                max: config.memory?.max || parseInt(process.env.CACHE_MEMORY_MAX, 10) || 1000,
                ttl: config.memory?.ttl || parseInt(process.env.CACHE_MEMORY_TTL, 10) || 300,
                updateAgeOnGet: config.memory?.updateAgeOnGet !== false,
                updateAgeOnHas: config.memory?.updateAgeOnHas !== false,
                allowStale: config.memory?.allowStale !== false,
                ...config.memory
            },
            strategies: {
                writeThrough: config.strategies?.writeThrough !== false,
                writeBehind: config.strategies?.writeBehind || false,
                refreshAhead: config.strategies?.refreshAhead || false,
                cacheAside: config.strategies?.cacheAside || false,
                batchSize: config.strategies?.batchSize || 100,
                batchInterval: config.strategies?.batchInterval || 1000
            },
            clustering: {
                enabled: config.clustering?.enabled || false,
                nodes: config.clustering?.nodes || [],
                options: {
                    enableOfflineQueue: false,
                    redisOptions: { password: config.redis?.password },
                    ...config.clustering?.options
                }
            },
            circuitBreaker: {
                enabled: config.circuitBreaker?.enabled !== false,
                threshold: config.circuitBreaker?.threshold || 5,
                timeout: config.circuitBreaker?.timeout || 30000,
                halfOpenMaxCalls: config.circuitBreaker?.halfOpenMaxCalls || 3
            },
            monitoring: {
                enabled: config.monitoring?.enabled !== false,
                interval: config.monitoring?.interval || 60000,
                metricsCollector: config.monitoring?.metricsCollector,
                healthCheck: config.monitoring?.healthCheck !== false
            },
            compression: {
                enabled: config.compression?.enabled || false,
                threshold: config.compression?.threshold || 1024,
                algorithm: config.compression?.algorithm || 'gzip'
            },
            serialization: {
                type: config.serialization?.type || 'json'
            }
        };
    }

    /**
     * Establishes connections to all cache stores with comprehensive error handling
     * @async
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.isConnected) {
            console.log('Cache Manager already connected');
            return;
        }

        try {
            console.log('Initializing Cache Manager connections...');
            
            // Initialize memory cache as primary fallback
            await this.initializeMemoryCache();
            
            // Initialize Redis if enabled and available
            if (this.cacheConfig.redis.enabled && Redis) {
                await this.initializeRedis();
            } else {
                console.log('Redis disabled or unavailable, operating in memory-only mode');
            }
            
            // Setup multi-tier caching if cache-manager is available
            if (cacheManager) {
                this.initializeMultiTierCache();
            }
            
            // Initialize advanced features
            this.setupInvalidationSystem();
            this.startMonitoringSystem();
            this.startMaintenanceServices();
            
            // Perform cache warmup if configured
            if (this.config.warmup) {
                await this.executeWarmupSequence();
            }
            
            this.isConnected = true;
            this.emit('cache:connected', { 
                implementation: this.implementationType,
                redis: !!this.redisClient,
                multiTier: !!this.multiTierCache
            });
            
            console.log('Cache Manager connected successfully');
            
        } catch (error) {
            console.error('Failed to connect Cache Manager:', error);
            await this.handleConnectionError(error);
        }
    }

    /**
     * Initializes memory cache with version-specific configuration
     * @private
     * @async
     */
    async initializeMemoryCache() {
        try {
            const options = {
                max: this.cacheConfig.memory.max,
                ttl: this.cacheConfig.memory.ttl * 1000, // Convert to milliseconds
                updateAgeOnGet: this.cacheConfig.memory.updateAgeOnGet,
                updateAgeOnHas: this.cacheConfig.memory.updateAgeOnHas,
                allowStale: this.cacheConfig.memory.allowStale
            };

            // Configure dispose handler with proper parameter ordering
            const disposeHandler = (value, key, reason) => {
                const actualReason = reason || 'dispose';
                if (actualReason === 'evict') {
                    this.metrics.memory.evictions++;
                } else if (actualReason === 'expire') {
                    this.metrics.memory.expirations++;
                }
                this.emit('cache:dispose', { key, reason: actualReason });
            };

            // Version-specific initialization
            if (this.implementationType === 'lru-v7+') {
                options.dispose = disposeHandler;
                options.ttlResolution = 1000;
                options.ttlAutopurge = true;
            } else if (this.implementationType === 'lru-v6') {
                options.dispose = disposeHandler;
                options.noDisposeOnSet = true;
            } else {
                // Enterprise fallback or custom implementation
                options.dispose = disposeHandler;
            }

            this.memoryCache = new LRUCacheClass(options);
            
            console.log(`Memory cache initialized with ${this.implementationType} (max: ${options.max}, ttl: ${options.ttl}ms)`);
            
        } catch (error) {
            console.error('Memory cache initialization failed:', error);
            throw new Error(`Memory cache initialization failed: ${error.message}`);
        }
    }

    /**
     * Initializes Redis connection with clustering and error handling
     * @private
     * @async
     */
    async initializeRedis() {
        try {
            if (this.cacheConfig.clustering.enabled && this.cacheConfig.clustering.nodes.length > 0) {
                // Redis Cluster configuration
                this.redisClient = new Redis.Cluster(
                    this.cacheConfig.clustering.nodes,
                    this.cacheConfig.clustering.options
                );
                console.log('Redis cluster client initialized');
            } else {
                // Single Redis instance
                this.redisClient = new Redis({
                    ...this.cacheConfig.redis,
                    retryDelayOnFailover: this.cacheConfig.redis.retryDelayOnFailover,
                    enableOfflineQueue: this.cacheConfig.redis.enableOfflineQueue,
                    lazyConnect: this.cacheConfig.redis.lazyConnect
                });
                console.log('Redis single-instance client initialized');
            }
            
            // Setup comprehensive Redis event handling
            this.setupRedisEventHandlers(this.redisClient);
            
            // Create dedicated pub/sub clients for cache invalidation
            this.redisPubClient = this.redisClient.duplicate();
            this.redisSubClient = this.redisClient.duplicate();
            
            // Verify connection
            const pong = await this.redisClient.ping();
            if (pong !== 'PONG') {
                throw new Error('Redis ping failed');
            }
            
            console.log('Redis connection established and verified');
            
        } catch (error) {
            console.error('Redis initialization failed:', error);
            this.handleRedisConnectionFailure(error);
        }
    }

    /**
     * Sets up comprehensive Redis event handlers
     * @private
     * @param {Object} client - Redis client instance
     */
    setupRedisEventHandlers(client) {
        client.on('connect', () => {
            console.log('Redis client connected');
            this.resetCircuitBreaker();
            this.emit('redis:connected');
        });
        
        client.on('ready', () => {
            console.log('Redis client ready');
            this.emit('redis:ready');
        });
        
        client.on('error', (error) => {
            console.error('Redis error:', error);
            this.metrics.redis.errors++;
            this.handleRedisError(error);
        });
        
        client.on('close', () => {
            console.log('Redis connection closed');
            this.emit('redis:disconnected');
        });
        
        client.on('reconnecting', (delay) => {
            console.log(`Redis reconnecting in ${delay}ms`);
            this.emit('redis:reconnecting', { delay });
        });
        
        client.on('end', () => {
            console.log('Redis connection ended');
            this.emit('redis:ended');
        });
    }

    /**
     * Initializes multi-tier cache with cache-manager
     * @private
     */
    initializeMultiTierCache() {
        if (!cacheManager) return;

        try {
            const stores = [];
            
            // L1: Memory cache
            stores.push(cacheManager.caching({
                store: 'memory',
                max: this.cacheConfig.memory.max,
                ttl: this.cacheConfig.memory.ttl
            }));
            
            // L2: Redis cache (if available and circuit breaker is closed)
            if (this.redisClient && this.circuitBreaker.state === 'closed' && redisStore) {
                stores.push(cacheManager.caching({
                    store: redisStore,
                    redisInstance: this.redisClient,
                    ttl: this.cacheConfig.redis.ttl
                }));
            }
            
            if (stores.length > 1) {
                this.multiTierCache = cacheManager.multiCaching(stores);
                console.log('Multi-tier cache initialized with', stores.length, 'stores');
            }
            
        } catch (error) {
            console.error('Multi-tier cache initialization failed:', error);
        }
    }

    /**
     * Enhanced cache get operation with comprehensive fallback
     * @async
     * @param {string} key - Cache key
     * @param {Object} options - Get options
     * @returns {Promise<*>} Cached value or null
     */
    async get(key, options = {}) {
        const startTime = Date.now();
        
        try {
            const normalizedKey = this.normalizeKey(key);
            
            // L1: Memory cache
            let value = this.getFromMemory(normalizedKey);
            if (value !== null && value !== undefined) {
                this.updateGetMetrics(startTime, 'memory');
                this.emit('cache:hit', { key: normalizedKey, source: 'memory' });
                return this.deserializeValue(value);
            }
            
            // L2: Redis cache (if available and circuit breaker allows)
            if (this.shouldUseRedis() && !options.skipRedis) {
                value = await this.getFromRedis(normalizedKey);
                if (value !== null && value !== undefined) {
                    // Populate L1 cache if write-through is enabled
                    if (this.cacheConfig.strategies.writeThrough) {
                        this.setInMemory(normalizedKey, value, options.ttl);
                    }
                    
                    this.updateGetMetrics(startTime, 'redis');
                    this.emit('cache:hit', { key: normalizedKey, source: 'redis' });
                    return this.deserializeValue(value);
                }
            }
            
            // Cache miss
            this.updateGetMetrics(startTime, 'miss');
            this.emit('cache:miss', { key: normalizedKey });
            
            // Schedule refresh-ahead if configured
            if (this.cacheConfig.strategies.refreshAhead && options.refreshFunction) {
                this.scheduleRefreshAhead(normalizedKey, options.refreshFunction, options.ttl);
            }
            
            return null;
            
        } catch (error) {
            console.error('Cache get error:', error);
            this.metrics.operations.errors++;
            this.emit('cache:error', { operation: 'get', key, error });
            
            // Fallback to memory cache on error
            return this.getFromMemory(this.normalizeKey(key));
        }
    }

    /**
     * Enhanced cache set operation with multiple strategies
     * @async
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in seconds
     * @param {Object} options - Set options
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl, options = {}) {
        const startTime = Date.now();
        
        try {
            const normalizedKey = this.normalizeKey(key);
            const serializedValue = this.serializeValue(value);
            const finalTTL = ttl || this.cacheConfig.redis.ttl;
            
            // Always set in memory cache (L1)
            this.setInMemory(normalizedKey, serializedValue, finalTTL);
            
            // Handle Redis operations based on strategy
            if (this.shouldUseRedis()) {
                if (this.cacheConfig.strategies.writeBehind) {
                    this.queueWriteBehind(normalizedKey, serializedValue, finalTTL);
                } else if (this.cacheConfig.strategies.writeThrough || !this.cacheConfig.strategies.cacheAside) {
                    await this.setInRedis(normalizedKey, serializedValue, finalTTL);
                }
            }
            
            // Handle metadata
            this.handleCacheMetadata(normalizedKey, options);
            
            this.updateSetMetrics(startTime);
            this.emit('cache:set', { key: normalizedKey, ttl: finalTTL });
            
            return true;
            
        } catch (error) {
            console.error('Cache set error:', error);
            this.metrics.operations.errors++;
            this.emit('cache:error', { operation: 'set', key, error });
            return false;
        }
    }

    /**
     * Gets value from memory cache with error handling
     * @private
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    getFromMemory(key) {
        try {
            const value = this.memoryCache.get(key);
            if (value !== undefined) {
                this.metrics.memory.hits++;
                return value;
            }
            this.metrics.memory.misses++;
            return null;
        } catch (error) {
            console.error('Memory cache get error:', error);
            this.metrics.memory.misses++;
            return null;
        }
    }

    /**
     * Sets value in memory cache with version compatibility
     * @private
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - TTL in seconds
     */
    setInMemory(key, value, ttl) {
        try {
            const ttlMs = (ttl || this.cacheConfig.memory.ttl) * 1000;
            
            if (this.implementationType === 'lru-v7+' || this.implementationType === 'enterprise-fallback') {
                this.memoryCache.set(key, value, ttlMs);
            } else {
                // LRU v6 doesn't support TTL in set method
                this.memoryCache.set(key, value);
            }
            
        } catch (error) {
            console.error('Memory cache set error:', error);
        }
    }

    /**
     * Gets value from Redis with circuit breaker protection
     * @private
     * @async
     * @param {string} key - Cache key
     * @returns {Promise<*>} Cached value or null
     */
    async getFromRedis(key) {
        try {
            const value = await this.redisClient.get(key);
            if (value !== null) {
                this.metrics.redis.hits++;
                this.recordCircuitBreakerSuccess();
                return value;
            }
            this.metrics.redis.misses++;
            return null;
        } catch (error) {
            this.handleRedisError(error);
            return null;
        }
    }

    /**
     * Sets value in Redis with error handling
     * @private
     * @async
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - TTL in seconds
     */
    async setInRedis(key, value, ttl) {
        try {
            if (ttl && ttl > 0) {
                await this.redisClient.setex(key, ttl, value);
            } else {
                await this.redisClient.set(key, value);
            }
            this.recordCircuitBreakerSuccess();
        } catch (error) {
            this.handleRedisError(error);
            throw error;
        }
    }

    /**
     * Handles Redis errors and circuit breaker logic
     * @private
     * @param {Error} error - Redis error
     */
    handleRedisError(error) {
        this.circuitBreaker.failures++;
        this.metrics.redis.errors++;
        
        if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
            this.openCircuitBreaker();
        }
        
        this.emit('redis:error', error);
    }

    /**
     * Opens circuit breaker for Redis protection
     * @private
     */
    openCircuitBreaker() {
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.nextAttempt = Date.now() + this.circuitBreaker.timeout;
        this.metrics.redis.circuitBreakerTrips++;
        
        console.log('Redis circuit breaker opened due to failures');
        this.emit('circuit-breaker:open');
        
        // Schedule circuit breaker transition to half-open
        setTimeout(() => {
            this.circuitBreaker.state = 'half-open';
            this.circuitBreaker.successCount = 0;
            console.log('Circuit breaker moved to half-open state');
            this.emit('circuit-breaker:half-open');
        }, this.circuitBreaker.timeout);
    }

    /**
     * Records successful Redis operation for circuit breaker
     * @private
     */
    recordCircuitBreakerSuccess() {
        if (this.circuitBreaker.state === 'half-open') {
            this.circuitBreaker.successCount++;
            if (this.circuitBreaker.successCount >= this.cacheConfig.circuitBreaker.halfOpenMaxCalls) {
                this.resetCircuitBreaker();
            }
        }
    }

    /**
     * Resets circuit breaker to closed state
     * @private
     */
    resetCircuitBreaker() {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.successCount = 0;
        this.circuitBreaker.nextAttempt = null;
        console.log('Circuit breaker reset to closed state');
        this.emit('circuit-breaker:closed');
    }

    /**
     * Determines if Redis should be used based on circuit breaker state
     * @private
     * @returns {boolean} Whether Redis should be used
     */
    shouldUseRedis() {
        if (!this.redisClient) return false;
        
        if (this.circuitBreaker.state === 'closed') return true;
        if (this.circuitBreaker.state === 'half-open') return true;
        
        // Check if timeout has passed for open circuit breaker
        if (this.circuitBreaker.state === 'open' && Date.now() >= this.circuitBreaker.nextAttempt) {
            this.circuitBreaker.state = 'half-open';
            this.circuitBreaker.successCount = 0;
            return true;
        }
        
        return false;
    }

    /**
     * Normalizes cache key with prefix and length validation
     * @private
     * @param {string} key - Raw cache key
     * @returns {string} Normalized key
     */
    normalizeKey(key) {
        if (!key || typeof key !== 'string') {
            throw new Error('Cache key must be a non-empty string');
        }
        
        let normalizedKey = key;
        
        // Add prefix if not present
        if (!key.startsWith(this.cacheConfig.redis.keyPrefix)) {
            normalizedKey = `${this.cacheConfig.redis.keyPrefix}${key}`;
        }
        
        // Handle key length limit
        if (normalizedKey.length > this.maxKeyLength) {
            const hash = crypto.createHash('sha256').update(normalizedKey).digest('hex');
            normalizedKey = `${normalizedKey.substring(0, this.maxKeyLength - 65)}:${hash}`;
        }
        
        return normalizedKey;
    }

    /**
     * Serializes value for storage with compression support
     * @private
     * @param {*} value - Value to serialize
     * @returns {string} Serialized value
     */
    serializeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }
        
        try {
            let serialized = JSON.stringify(value);
            
            // Apply compression if enabled and above threshold
            if (this.cacheConfig.compression.enabled && 
                serialized.length > this.cacheConfig.compression.threshold) {
                serialized = this.compressData(serialized);
            }
            
            return serialized;
        } catch (error) {
            console.error('Serialization error:', error);
            return String(value);
        }
    }

    /**
     * Deserializes value from storage with decompression support
     * @private
     * @param {string} value - Serialized value
     * @returns {*} Deserialized value
     */
    deserializeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }
        
        try {
            let processedValue = value;
            
            // Decompress if needed
            if (this.cacheConfig.compression.enabled && this.isCompressed(value)) {
                processedValue = this.decompressData(value);
            }
            
            return JSON.parse(processedValue);
        } catch (error) {
            console.error('Deserialization error:', error);
            return value;
        }
    }

    /**
     * Compresses data using specified algorithm
     * @private
     * @param {string} data - Data to compress
     * @returns {string} Compressed data
     */
    compressData(data) {
        try {
            const zlib = require('zlib');
            const compressed = zlib.gzipSync(Buffer.from(data));
            return `COMPRESSED:${compressed.toString('base64')}`;
        } catch (error) {
            console.error('Compression error:', error);
            return data;
        }
    }

    /**
     * Decompresses data
     * @private
     * @param {string} data - Compressed data
     * @returns {string} Decompressed data
     */
    decompressData(data) {
        try {
            if (!data.startsWith('COMPRESSED:')) return data;
            
            const zlib = require('zlib');
            const compressed = data.replace('COMPRESSED:', '');
            const buffer = Buffer.from(compressed, 'base64');
            const decompressed = zlib.gunzipSync(buffer);
            return decompressed.toString();
        } catch (error) {
            console.error('Decompression error:', error);
            return data;
        }
    }

    /**
     * Checks if data is compressed
     * @private
     * @param {string} data - Data to check
     * @returns {boolean} Compression status
     */
    isCompressed(data) {
        return typeof data === 'string' && data.startsWith('COMPRESSED:');
    }

    /**
     * Handles cache metadata (tags, dependencies, patterns)
     * @private
     * @param {string} key - Cache key
     * @param {Object} options - Metadata options
     */
    handleCacheMetadata(key, options) {
        if (options.tags && Array.isArray(options.tags)) {
            this.addTags(key, options.tags);
        }
        
        if (options.dependencies && Array.isArray(options.dependencies)) {
            this.addDependencies(key, options.dependencies);
        }
        
        if (options.pattern) {
            this.addPattern(key, options.pattern);
        }
    }

    /**
     * Adds tags to cache entry
     * @private
     * @param {string} key - Cache key
     * @param {Array<string>} tags - Tags to add
     */
    addTags(key, tags) {
        if (!this.tags.has(key)) {
            this.tags.set(key, new Set());
        }
        const keyTags = this.tags.get(key);
        tags.forEach(tag => keyTags.add(tag));
    }

    /**
     * Adds dependencies to cache entry
     * @private
     * @param {string} key - Cache key
     * @param {Array<string>} dependencies - Dependencies to add
     */
    addDependencies(key, dependencies) {
        if (!this.dependencies.has(key)) {
            this.dependencies.set(key, new Set());
        }
        const keyDeps = this.dependencies.get(key);
        dependencies.forEach(dep => keyDeps.add(dep));
    }

    /**
     * Adds pattern to cache entry
     * @private
     * @param {string} key - Cache key
     * @param {string} pattern - Pattern to add
     */
    addPattern(key, pattern) {
        if (!this.patterns.has(pattern)) {
            this.patterns.set(pattern, new Set());
        }
        this.patterns.get(pattern).add(key);
    }

    /**
     * Queues write-behind operation
     * @private
     * @param {string} key - Cache key
     * @param {*} value - Value to write
     * @param {number} ttl - TTL in seconds
     */
    queueWriteBehind(key, value, ttl) {
        this.writeBehindQueue.push({
            key, value, ttl,
            timestamp: Date.now(),
            retries: 0
        });
        
        if (!this.intervals.writeBehind) {
            this.startWriteBehindProcessor();
        }
    }

    /**
     * Starts write-behind batch processor
     * @private
     */
    startWriteBehindProcessor() {
        this.intervals.writeBehind = setInterval(async () => {
            if (this.writeBehindQueue.length === 0) {
                clearInterval(this.intervals.writeBehind);
                this.intervals.writeBehind = null;
                return;
            }
            
            const batch = this.writeBehindQueue.splice(0, this.cacheConfig.strategies.batchSize);
            await this.processWriteBehindBatch(batch);
        }, this.cacheConfig.strategies.batchInterval);
    }

    /**
     * Processes write-behind batch with retry logic
     * @private
     * @async
     * @param {Array} batch - Batch of write operations
     */
    async processWriteBehindBatch(batch) {
        if (!this.shouldUseRedis()) {
            // Re-queue with incremented retry count
            const requeuedBatch = batch.map(item => ({
                ...item,
                retries: item.retries + 1
            })).filter(item => item.retries < 3);
            
            this.writeBehindQueue.unshift(...requeuedBatch);
            return;
        }
        
        try {
            const pipeline = this.redisClient.pipeline();
            
            for (const { key, value, ttl } of batch) {
                if (ttl && ttl > 0) {
                    pipeline.setex(key, ttl, value);
                } else {
                    pipeline.set(key, value);
                }
            }
            
            await pipeline.exec();
            
        } catch (error) {
            console.error('Write-behind batch error:', error);
            
            // Re-queue with retry logic
            const requeuedBatch = batch.map(item => ({
                ...item,
                retries: item.retries + 1
            })).filter(item => item.retries < 3);
            
            this.writeBehindQueue.unshift(...requeuedBatch);
        }
    }

    /**
     * Schedules refresh-ahead operation
     * @private
     * @param {string} key - Cache key
     * @param {Function} refreshFunction - Function to refresh value
     * @param {number} ttl - TTL in seconds
     */
    scheduleRefreshAhead(key, refreshFunction, ttl) {
        const refreshTime = (ttl * 0.8) * 1000; // Refresh at 80% of TTL
        
        const jobId = setTimeout(async () => {
            try {
                const value = await refreshFunction();
                await this.set(key, value, ttl);
                this.emit('cache:refreshed', { key });
            } catch (error) {
                console.error('Refresh-ahead error:', error);
            } finally {
                this.refreshAheadJobs.delete(key);
            }
        }, refreshTime);
        
        this.refreshAheadJobs.set(key, jobId);
    }

    /**
     * Sets up cache invalidation system
     * @private
     */
    setupInvalidationSystem() {
        if (!this.redisSubClient) return;
        
        try {
            this.redisSubClient.subscribe('cache:invalidate');
            
            this.redisSubClient.on('message', async (channel, message) => {
                if (channel === 'cache:invalidate') {
                    try {
                        const { key, pattern, tags } = JSON.parse(message);
                        
                        if (key) {
                            this.memoryCache.delete(key);
                        } else if (pattern) {
                            await this.clearByPattern(pattern);
                        } else if (tags) {
                            await this.clearByTags(tags);
                        }
                        
                        this.emit('cache:invalidated', { key, pattern, tags });
                    } catch (error) {
                        console.error('Invalidation message error:', error);
                    }
                }
            });
            
            console.log('Cache invalidation system initialized');
        } catch (error) {
            console.error('Failed to setup invalidation system:', error);
        }
    }

    /**
     * Starts comprehensive monitoring system
     * @private
     */
    startMonitoringSystem() {
        if (!this.cacheConfig.monitoring.enabled) return;
        
        this.intervals.monitoring = setInterval(() => {
            this.calculateMetrics();
            this.emit('cache:metrics', this.getDetailedMetrics());
            
            if (this.cacheConfig.monitoring.metricsCollector) {
                this.cacheConfig.monitoring.metricsCollector.recordCacheMetrics('gateway', this.metrics);
            }
        }, this.cacheConfig.monitoring.interval);
        
        // Health check interval
        if (this.cacheConfig.monitoring.healthCheck) {
            this.intervals.healthCheck = setInterval(async () => {
                const health = await this.performHealthCheck();
                this.emit('cache:health', health);
            }, this.cacheConfig.monitoring.interval * 2);
        }
        
        console.log('Monitoring system started');
    }

    /**
     * Starts maintenance services
     * @private
     */
    startMaintenanceServices() {
        // Cleanup interval for expired entries and metadata
        this.intervals.cleanup = setInterval(() => {
            this.performMaintenance();
        }, 300000); // Every 5 minutes
        
        console.log('Maintenance services started');
    }

    /**
     * Performs routine maintenance tasks
     * @private
     */
    performMaintenance() {
        try {
            // Clean up expired refresh-ahead jobs
            const now = Date.now();
            for (const [key, jobId] of this.refreshAheadJobs) {
                // Add logic to check if job is still valid
                // Clean up if needed
            }
            
            // Clean up old write-behind entries
            const cutoff = now - 300000; // 5 minutes
            this.writeBehindQueue = this.writeBehindQueue.filter(
                item => item.timestamp > cutoff
            );
            
            // Emit maintenance completion
            this.emit('cache:maintenance', {
                timestamp: now,
                writeBehindQueueSize: this.writeBehindQueue.length,
                refreshAheadJobs: this.refreshAheadJobs.size
            });
            
        } catch (error) {
            console.error('Maintenance error:', error);
        }
    }

    /**
     * Calculates comprehensive metrics
     * @private
     */
    calculateMetrics() {
        const totalOps = this.metrics.operations.hits + this.metrics.operations.misses;
        const totalMemoryOps = this.metrics.memory.hits + this.metrics.memory.misses;
        const totalRedisOps = this.metrics.redis.hits + this.metrics.redis.misses;
        
        this.metrics.ratios.hitRate = totalOps > 0 ? (this.metrics.operations.hits / totalOps) * 100 : 0;
        this.metrics.ratios.memoryHitRate = totalMemoryOps > 0 ? (this.metrics.memory.hits / totalMemoryOps) * 100 : 0;
        this.metrics.ratios.redisHitRate = totalRedisOps > 0 ? (this.metrics.redis.hits / totalRedisOps) * 100 : 0;
        
        if (this.metrics.operations.hits + this.metrics.operations.misses > 0) {
            this.metrics.performance.avgGetTime = this.metrics.performance.totalGetTime / (this.metrics.operations.hits + this.metrics.operations.misses);
        }
        
        if (this.metrics.operations.sets > 0) {
            this.metrics.performance.avgSetTime = this.metrics.performance.totalSetTime / this.metrics.operations.sets;
        }
    }

    /**
     * Updates get operation metrics
     * @private
     * @param {number} startTime - Operation start time
     * @param {string} source - Source of the cache hit/miss
     */
    updateGetMetrics(startTime, source) {
        const duration = Date.now() - startTime;
        this.metrics.performance.totalGetTime += duration;
        
        if (source === 'memory') {
            this.metrics.operations.hits++;
        } else if (source === 'redis') {
            this.metrics.operations.hits++;
        } else if (source === 'miss') {
            this.metrics.operations.misses++;
        }
    }

    /**
     * Updates set operation metrics
     * @private
     * @param {number} startTime - Operation start time
     */
    updateSetMetrics(startTime) {
        const duration = Date.now() - startTime;
        this.metrics.performance.totalSetTime += duration;
        this.metrics.operations.sets++;
    }

    /**
     * Performs comprehensive health check
     * @private
     * @async
     * @returns {Object} Health status
     */
    async performHealthCheck() {
        const health = {
            overall: 'healthy',
            timestamp: Date.now(),
            components: {
                memory: { status: 'healthy', details: {} },
                redis: { status: 'unknown', details: {} },
                circuitBreaker: { status: this.circuitBreaker.state, details: {} }
            }
        };
        
        try {
            // Memory cache health
            if (this.memoryCache) {
                health.components.memory.status = 'healthy';
                health.components.memory.details = {
                    size: this.memoryCache.size || 0,
                    max: this.cacheConfig.memory.max
                };
            }
            
            // Redis health
            if (this.redisClient && this.shouldUseRedis()) {
                try {
                    const pong = await this.redisClient.ping();
                    health.components.redis.status = pong === 'PONG' ? 'healthy' : 'unhealthy';
                } catch (error) {
                    health.components.redis.status = 'unhealthy';
                    health.components.redis.details.error = error.message;
                }
            }
            
            // Overall health assessment
            const componentStatuses = Object.values(health.components).map(c => c.status);
            if (componentStatuses.includes('unhealthy')) {
                health.overall = 'degraded';
            } else if (componentStatuses.includes('unknown')) {
                health.overall = 'partial';
            }
            
        } catch (error) {
            health.overall = 'unhealthy';
            health.error = error.message;
        }
        
        return health;
    }

    /**
     * Executes cache warmup sequence
     * @private
     * @async
     */
    async executeWarmupSequence() {
        console.log('Starting cache warmup sequence...');
        
        for (const [name, warmupFn] of this.warmupFunctions) {
            try {
                await warmupFn();
                console.log(`Cache warmup completed: ${name}`);
            } catch (error) {
                console.error(`Cache warmup failed for ${name}:`, error);
            }
        }
        
        this.emit('cache:warmed-up');
        console.log('Cache warmup sequence completed');
    }

    /**
     * Default key generator for complex objects
     * @private
     * @param {Object} options - Key generation options
     * @returns {string} Generated key
     */
    defaultKeyGenerator(options) {
        const parts = [];
        
        if (options.prefix) parts.push(options.prefix);
        if (options.method) parts.push(options.method);
        if (options.url) parts.push(options.url);
        if (options.params) parts.push(JSON.stringify(options.params));
        if (options.headers) parts.push(JSON.stringify(options.headers));
        
        const key = parts.join(':');
        const hash = crypto.createHash('sha256').update(key).digest('hex');
        
        return hash.substring(0, 16);
    }

    /**
     * Handles Redis connection failures
     * @private
     * @param {Error} error - Connection error
     */
    handleRedisConnectionFailure(error) {
        console.error('Redis connection failed, activating circuit breaker:', error);
        this.openCircuitBreaker();
        this.emit('redis:connection-failed', error);
    }

    /**
     * Handles general connection errors with graceful degradation
     * @private
     * @async
     * @param {Error} error - Connection error
     */
    async handleConnectionError(error) {
        console.error('Cache connection error:', error);
        
        // Ensure memory cache is available as fallback
        if (!this.memoryCache) {
            await this.initializeMemoryCache();
        }
        
        this.isConnected = true;
        console.log('Operating in degraded mode with memory cache only');
        
        this.emit('cache:degraded', { error: error.message, mode: 'memory-only' });
    }

    /**
     * Gets comprehensive cache statistics
     * @returns {Object} Detailed cache statistics
     */
    getDetailedMetrics() {
        return {
            ...this.metrics,
            system: {
                implementation: this.implementationType,
                connected: this.isConnected,
                memorySize: this.memoryCache?.size || 0,
                memoryMax: this.cacheConfig.memory.max,
                circuitBreakerState: this.circuitBreaker.state,
                writeBehindQueueSize: this.writeBehindQueue.length,
                refreshAheadJobs: this.refreshAheadJobs.size,
                redisConnected: !!this.redisClient && this.shouldUseRedis()
            },
            configuration: {
                redis: this.cacheConfig.redis.enabled,
                clustering: this.cacheConfig.clustering.enabled,
                writeThrough: this.cacheConfig.strategies.writeThrough,
                writeBehind: this.cacheConfig.strategies.writeBehind,
                refreshAhead: this.cacheConfig.strategies.refreshAhead,
                compression: this.cacheConfig.compression.enabled
            }
        };
    }

    /**
     * Registers warmup function for cache initialization
     * @param {string} name - Warmup function name
     * @param {Function} fn - Warmup function
     */
    registerWarmupFunction(name, fn) {
        this.warmupFunctions.set(name, fn);
        console.log(`Warmup function registered: ${name}`);
    }

    /**
     * Publishes cache invalidation message
     * @async
     * @param {Object} invalidation - Invalidation details
     */
    async publishInvalidation(invalidation) {
        if (!this.redisPubClient) return;
        
        try {
            await this.redisPubClient.publish('cache:invalidate', JSON.stringify(invalidation));
            this.emit('cache:invalidation-published', invalidation);
        } catch (error) {
            console.error('Failed to publish invalidation:', error);
        }
    }

    /**
     * Clears cache by pattern
     * @private
     * @async
     * @param {string} pattern - Pattern to match
     */
    async clearByPattern(pattern) {
        const keys = this.patterns.get(pattern);
        if (!keys) return;
        
        for (const key of keys) {
            this.memoryCache.delete(key);
        }
        
        this.patterns.delete(pattern);
    }

    /**
     * Clears cache by tags
     * @private
     * @async
     * @param {Array<string>} tags - Tags to match
     */
    async clearByTags(tags) {
        const keysToDelete = [];
        
        for (const [key, keyTags] of this.tags) {
            if (tags.some(tag => keyTags.has(tag))) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.memoryCache.delete(key);
            this.tags.delete(key);
        }
    }

    /**
     * Gracefully disconnects from all cache stores
     * @async
     * @returns {Promise<void>}
     */
    async disconnect() {
        console.log('Disconnecting Cache Manager...');
        
        try {
            // Clear all intervals
            Object.values(this.intervals).forEach(interval => {
                if (interval) clearInterval(interval);
            });
            
            // Clear refresh-ahead jobs
            for (const jobId of this.refreshAheadJobs.values()) {
                clearTimeout(jobId);
            }
            this.refreshAheadJobs.clear();
            
            // Process remaining write-behind queue
            if (this.writeBehindQueue.length > 0) {
                console.log(`Processing ${this.writeBehindQueue.length} remaining write-behind operations...`);
                await this.processWriteBehindBatch(this.writeBehindQueue);
            }
            
            // Disconnect Redis clients
            if (this.redisClient) {
                await this.redisClient.quit();
            }
            if (this.redisPubClient) {
                await this.redisPubClient.quit();
            }
            if (this.redisSubClient) {
                await this.redisSubClient.quit();
            }
            
            // Clear memory cache
            if (this.memoryCache) {
                if (typeof this.memoryCache.destroy === 'function') {
                    this.memoryCache.destroy();
                } else {
                    this.memoryCache.clear();
                }
            }
            
            // Reset state
            this.isConnected = false;
            this.patterns.clear();
            this.tags.clear();
            this.dependencies.clear();
            this.writeBehindQueue = [];
            
            this.emit('cache:disconnected');
            console.log('Cache Manager disconnected successfully');
            
        } catch (error) {
            console.error('Error during cache disconnect:', error);
            throw error;
        }
    }
}

module.exports = { CacheManager };