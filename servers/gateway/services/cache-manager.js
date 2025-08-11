'use strict';

/**
 * @fileoverview Cache Manager Service - Comprehensive caching with Redis and in-memory fallback
 * @module servers/gateway/services/cache-manager
 * @requires redis
 * @requires ioredis
 * @requires lru-cache
 * @requires cache-manager
 * @requires cache-manager-redis-store
 * @requires events
 * @requires crypto
 */

const { EventEmitter } = require('events');
const Redis = require('ioredis');
const LRU = require('lru-cache');
const cacheManager = require('cache-manager');
const redisStore = require('cache-manager-redis-store');
const crypto = require('crypto');
const { promisify } = require('util');

/**
 * CacheManager class provides comprehensive caching capabilities with Redis as primary store
 * and in-memory LRU cache as fallback. It implements multiple caching strategies including
 * write-through, write-behind, refresh-ahead, and cache-aside patterns. The manager supports
 * TTL management, cache invalidation, clustering, sharding, and monitoring for enterprise-grade
 * caching requirements.
 * 
 * @class CacheManager
 * @extends EventEmitter
 */
class CacheManager extends EventEmitter {
    /**
     * Creates an instance of CacheManager
     * @constructor
     * @param {Object} config - Cache configuration
     */
    constructor(config) {
        super();
        this.config = config || {};
        this.isConnected = false;
        
        // Cache stores
        this.redisClient = null;
        this.redisPubClient = null;
        this.redisSubClient = null;
        this.memoryCache = null;
        this.multiTierCache = null;
        
        // Cache statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            memoryHits: 0,
            memoryMisses: 0,
            redisHits: 0,
            redisMisses: 0,
            hitRate: 0,
            avgGetTime: 0,
            avgSetTime: 0,
            totalGetTime: 0,
            totalSetTime: 0,
            evictions: 0,
            expirations: 0
        };
        
        // Cache configuration
        this.cacheConfig = {
            redis: {
                host: config.redis?.host || 'localhost',
                port: config.redis?.port || 6379,
                password: config.redis?.password,
                db: config.redis?.db || 0,
                keyPrefix: config.redis?.keyPrefix || 'gateway:',
                ttl: config.redis?.ttl || 3600,
                maxRetriesPerRequest: config.redis?.maxRetriesPerRequest || 3,
                enableReadyCheck: true,
                lazyConnect: false,
                ...config.redis
            },
            memory: {
                max: config.memory?.max || 1000,
                ttl: config.memory?.ttl || 300,
                updateAgeOnGet: config.memory?.updateAgeOnGet !== false,
                updateAgeOnHas: config.memory?.updateAgeOnHas !== false,
                stale: config.memory?.stale !== false,
                ...config.memory
            },
            strategies: {
                writeThrough: config.strategies?.writeThrough !== false,
                writeBehind: config.strategies?.writeBehind || false,
                refreshAhead: config.strategies?.refreshAhead || false,
                cacheAside: config.strategies?.cacheAside || false
            },
            clustering: {
                enabled: config.clustering?.enabled || false,
                nodes: config.clustering?.nodes || [],
                options: config.clustering?.options || {}
            },
            sharding: {
                enabled: config.sharding?.enabled || false,
                shards: config.sharding?.shards || 1,
                hashFunction: config.sharding?.hashFunction || 'crc32'
            }
        };
        
        // Cache patterns
        this.patterns = new Map();
        this.tags = new Map();
        this.dependencies = new Map();
        
        // Write-behind queue
        this.writeBehindQueue = [];
        this.writeBehindInterval = null;
        
        // Refresh-ahead configuration
        this.refreshAheadJobs = new Map();
        this.refreshAheadInterval = null;
        
        // Cache warmup configuration
        this.warmupFunctions = new Map();
        this.isWarmedUp = false;
        
        // Invalidation subscriptions
        this.invalidationSubscriptions = new Set();
        
        // Circuit breaker for Redis failures
        this.redisCircuitBreaker = {
            failures: 0,
            threshold: 5,
            timeout: 30000,
            state: 'closed',
            nextAttempt: null
        };
        
        // Compression settings
        this.compression = {
            enabled: config.compression?.enabled || false,
            threshold: config.compression?.threshold || 1024,
            algorithm: config.compression?.algorithm || 'gzip'
        };
        
        // Serialization settings
        this.serialization = {
            type: config.serialization?.type || 'json',
            compress: config.serialization?.compress || false
        };
        
        // Monitoring
        this.monitoring = {
            enabled: config.monitoring?.enabled !== false,
            interval: config.monitoring?.interval || 60000,
            metricsCollector: config.monitoring?.metricsCollector
        };
        
        // Cache key generation
        this.keyGenerator = config.keyGenerator || this.defaultKeyGenerator.bind(this);
        
        // Maximum key length
        this.maxKeyLength = config.maxKeyLength || 250;
        
        // Cleanup intervals
        this.cleanupInterval = null;
        this.statsInterval = null;
    }

    /**
     * Connects to cache stores
     * @async
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.isConnected) {
            console.log('Cache manager already connected');
            return;
        }

        try {
            console.log('Connecting Cache Manager');
            
            // Initialize memory cache
            this.initializeMemoryCache();
            
            // Initialize Redis connection
            await this.initializeRedis();
            
            // Initialize multi-tier cache
            this.initializeMultiTierCache();
            
            // Setup cache invalidation
            this.setupInvalidation();
            
            // Setup monitoring
            if (this.monitoring.enabled) {
                this.startMonitoring();
            }
            
            // Setup cleanup
            this.startCleanup();
            
            // Warm up cache if configured
            if (this.config.warmup) {
                await this.warmupCache();
            }
            
            this.isConnected = true;
            this.emit('cache:connected');
            
            console.log('Cache Manager connected successfully');
        } catch (error) {
            console.error('Failed to connect Cache Manager:', error);
            this.handleConnectionError(error);
            throw error;
        }
    }

    /**
     * Initializes in-memory LRU cache
     * @private
     */
    initializeMemoryCache() {
        this.memoryCache = new LRU({
            max: this.cacheConfig.memory.max,
            ttl: this.cacheConfig.memory.ttl * 1000,
            updateAgeOnGet: this.cacheConfig.memory.updateAgeOnGet,
            updateAgeOnHas: this.cacheConfig.memory.updateAgeOnHas,
            stale: this.cacheConfig.memory.stale,
            dispose: (key, value, reason) => {
                if (reason === 'evict') {
                    this.stats.evictions++;
                } else if (reason === 'expire') {
                    this.stats.expirations++;
                }
                this.emit('cache:dispose', { key, reason });
            },
            noDisposeOnSet: true,
            ttlResolution: 1000,
            ttlAutopurge: true,
            allowStale: true,
            updateAgeOnGet: true
        });
        
        console.log('Memory cache initialized');
    }

    /**
     * Initializes Redis connection
     * @private
     * @async
     */
    async initializeRedis() {
        try {
            if (this.cacheConfig.clustering.enabled) {
                // Redis Cluster
                this.redisClient = new Redis.Cluster(
                    this.cacheConfig.clustering.nodes,
                    this.cacheConfig.clustering.options
                );
            } else {
                // Single Redis instance
                this.redisClient = new Redis(this.cacheConfig.redis);
            }
            
            // Setup Redis event handlers
            this.setupRedisEventHandlers(this.redisClient);
            
            // Create pub/sub clients for invalidation
            this.redisPubClient = this.redisClient.duplicate();
            this.redisSubClient = this.redisClient.duplicate();
            
            // Wait for connection
            await this.redisClient.ping();
            
            console.log('Redis connection established');
        } catch (error) {
            console.error('Redis connection failed:', error);
            
            // Activate circuit breaker
            this.activateCircuitBreaker();
            
            // Continue with memory cache only
            console.log('Falling back to memory cache only');
        }
    }

    /**
     * Sets up Redis event handlers
     * @private
     * @param {Object} client - Redis client
     */
    setupRedisEventHandlers(client) {
        client.on('connect', () => {
            console.log('Redis client connected');
            this.redisCircuitBreaker.state = 'closed';
            this.redisCircuitBreaker.failures = 0;
            this.emit('redis:connected');
        });
        
        client.on('ready', () => {
            console.log('Redis client ready');
            this.emit('redis:ready');
        });
        
        client.on('error', (error) => {
            console.error('Redis client error:', error);
            this.stats.errors++;
            this.handleRedisError(error);
        });
        
        client.on('close', () => {
            console.log('Redis connection closed');
            this.emit('redis:disconnected');
        });
        
        client.on('reconnecting', (delay) => {
            console.log(`Redis reconnecting in ${delay}ms`);
        });
    }

    /**
     * Initializes multi-tier cache
     * @private
     */
    initializeMultiTierCache() {
        const stores = [];
        
        // Memory store (L1)
        stores.push(
            cacheManager.caching({
                store: 'memory',
                max: this.cacheConfig.memory.max,
                ttl: this.cacheConfig.memory.ttl
            })
        );
        
        // Redis store (L2)
        if (this.redisClient && this.redisCircuitBreaker.state === 'closed') {
            stores.push(
                cacheManager.caching({
                    store: redisStore,
                    redisInstance: this.redisClient,
                    ttl: this.cacheConfig.redis.ttl
                })
            );
        }
        
        this.multiTierCache = cacheManager.multiCaching(stores);
        console.log('Multi-tier cache initialized');
    }

    /**
     * Gets value from cache
     * @async
     * @param {string} key - Cache key
     * @param {Object} options - Get options
     * @returns {Promise<*>} Cached value or null
     */
    async get(key, options = {}) {
        const startTime = Date.now();
        
        try {
            // Validate and normalize key
            const normalizedKey = this.normalizeKey(key);
            
            // Check circuit breaker
            if (this.isCircuitBreakerOpen()) {
                return this.getFromMemory(normalizedKey);
            }
            
            // Try memory cache first (L1)
            let value = this.getFromMemory(normalizedKey);
            if (value !== null && value !== undefined) {
                this.stats.hits++;
                this.stats.memoryHits++;
                this.updateGetMetrics(startTime);
                this.emit('cache:hit', { key: normalizedKey, source: 'memory' });
                return this.deserializeValue(value);
            }
            
            this.stats.memoryMisses++;
            
            // Try Redis (L2)
            if (this.redisClient && !options.skipRedis) {
                value = await this.getFromRedis(normalizedKey);
                if (value !== null && value !== undefined) {
                    this.stats.hits++;
                    this.stats.redisHits++;
                    
                    // Populate memory cache (write-through)
                    if (this.cacheConfig.strategies.writeThrough) {
                        this.setInMemory(normalizedKey, value, options.ttl);
                    }
                    
                    this.updateGetMetrics(startTime);
                    this.emit('cache:hit', { key: normalizedKey, source: 'redis' });
                    return this.deserializeValue(value);
                }
            }
            
            this.stats.misses++;
            this.stats.redisMisses++;
            this.updateGetMetrics(startTime);
            this.emit('cache:miss', { key: normalizedKey });
            
            // Check refresh-ahead
            if (this.cacheConfig.strategies.refreshAhead && options.refreshFunction) {
                this.scheduleRefreshAhead(normalizedKey, options.refreshFunction, options.ttl);
            }
            
            return null;
        } catch (error) {
            console.error('Cache get error:', error);
            this.stats.errors++;
            this.emit('cache:error', { operation: 'get', key, error });
            
            // Fallback to memory cache on error
            return this.getFromMemory(this.normalizeKey(key));
        }
    }

    /**
     * Sets value in cache
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
            // Validate and normalize key
            const normalizedKey = this.normalizeKey(key);
            const serializedValue = this.serializeValue(value);
            const finalTTL = ttl || this.cacheConfig.redis.ttl;
            
            // Set in memory cache
            this.setInMemory(normalizedKey, serializedValue, finalTTL);
            
            // Handle different caching strategies
            if (this.cacheConfig.strategies.writeBehind) {
                // Queue for async write
                this.queueWriteBehind(normalizedKey, serializedValue, finalTTL);
            } else if (this.cacheConfig.strategies.writeThrough || !this.cacheConfig.strategies.cacheAside) {
                // Write to Redis immediately
                if (this.redisClient && !this.isCircuitBreakerOpen()) {
                    await this.setInRedis(normalizedKey, serializedValue, finalTTL);
                }
            }
            
            // Handle tags
            if (options.tags) {
                this.addTags(normalizedKey, options.tags);
            }
            
            // Handle dependencies
            if (options.dependencies) {
                this.addDependencies(normalizedKey, options.dependencies);
            }
            
            // Handle patterns
            if (options.pattern) {
                this.addPattern(normalizedKey, options.pattern);
            }
            
            this.stats.sets++;
            this.updateSetMetrics(startTime);
            this.emit('cache:set', { key: normalizedKey, ttl: finalTTL });
            
            return true;
        } catch (error) {
            console.error('Cache set error:', error);
            this.stats.errors++;
            this.emit('cache:error', { operation: 'set', key, error });
            return false;
        }
    }

    /**
     * Deletes value from cache
     * @async
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} Success status
     */
    async delete(key) {
        try {
            const normalizedKey = this.normalizeKey(key);
            
            // Delete from memory cache
            this.memoryCache.delete(normalizedKey);
            
            // Delete from Redis
            if (this.redisClient && !this.isCircuitBreakerOpen()) {
                await this.redisClient.del(normalizedKey);
            }
            
            // Clean up metadata
            this.tags.delete(normalizedKey);
            this.dependencies.delete(normalizedKey);
            this.patterns.delete(normalizedKey);
            
            this.stats.deletes++;
            this.emit('cache:delete', { key: normalizedKey });
            
            // Invalidate dependencies
            await this.invalidateDependencies(normalizedKey);
            
            return true;
        } catch (error) {
            console.error('Cache delete error:', error);
            this.stats.errors++;
            this.emit('cache:error', { operation: 'delete', key, error });
            return false;
        }
    }

    /**
     * Clears all cache entries
     * @async
     * @param {Object} options - Clear options
     * @returns {Promise<boolean>} Success status
     */
    async clear(options = {}) {
        try {
            if (options.pattern) {
                // Clear by pattern
                return await this.clearByPattern(options.pattern);
            } else if (options.tags) {
                // Clear by tags
                return await this.clearByTags(options.tags);
            } else {
                // Clear all
                this.memoryCache.clear();
                
                if (this.redisClient && !this.isCircuitBreakerOpen()) {
                    const keys = await this.redisClient.keys(`${this.cacheConfig.redis.keyPrefix}*`);
                    if (keys.length > 0) {
                        await this.redisClient.del(...keys);
                    }
                }
                
                // Clear metadata
                this.tags.clear();
                this.dependencies.clear();
                this.patterns.clear();
                
                this.emit('cache:cleared');
                return true;
            }
        } catch (error) {
            console.error('Cache clear error:', error);
            this.stats.errors++;
            this.emit('cache:error', { operation: 'clear', error });
            return false;
        }
    }

    /**
     * Gets value from memory cache
     * @private
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    getFromMemory(key) {
        return this.memoryCache.get(key);
    }

    /**
     * Sets value in memory cache
     * @private
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - TTL in seconds
     */
    setInMemory(key, value, ttl) {
        const ttlMs = (ttl || this.cacheConfig.memory.ttl) * 1000;
        this.memoryCache.set(key, value, ttlMs);
    }

    /**
     * Gets value from Redis
     * @private
     * @async
     * @param {string} key - Cache key
     * @returns {Promise<*>} Cached value or null
     */
    async getFromRedis(key) {
        try {
            const value = await this.redisClient.get(key);
            return value;
        } catch (error) {
            this.handleRedisError(error);
            return null;
        }
    }

    /**
     * Sets value in Redis
     * @private
     * @async
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - TTL in seconds
     */
    async setInRedis(key, value, ttl) {
        try {
            if (ttl) {
                await this.redisClient.setex(key, ttl, value);
            } else {
                await this.redisClient.set(key, value);
            }
        } catch (error) {
            this.handleRedisError(error);
        }
    }

    /**
     * Handles Redis errors
     * @private
     * @param {Error} error - Redis error
     */
    handleRedisError(error) {
        this.redisCircuitBreaker.failures++;
        
        if (this.redisCircuitBreaker.failures >= this.redisCircuitBreaker.threshold) {
            this.activateCircuitBreaker();
        }
        
        this.emit('redis:error', error);
    }

    /**
     * Activates circuit breaker for Redis
     * @private
     */
    activateCircuitBreaker() {
        this.redisCircuitBreaker.state = 'open';
        this.redisCircuitBreaker.nextAttempt = Date.now() + this.redisCircuitBreaker.timeout;
        
        console.log('Redis circuit breaker activated');
        this.emit('circuit-breaker:open');
        
        // Schedule circuit breaker reset
        setTimeout(() => {
            this.redisCircuitBreaker.state = 'half-open';
            this.redisCircuitBreaker.failures = 0;
            console.log('Redis circuit breaker in half-open state');
        }, this.redisCircuitBreaker.timeout);
    }

    /**
     * Checks if circuit breaker is open
     * @private
     * @returns {boolean} Circuit breaker state
     */
    isCircuitBreakerOpen() {
        if (this.redisCircuitBreaker.state === 'closed') {
            return false;
        }
        
        if (this.redisCircuitBreaker.state === 'half-open') {
            // Try one request
            return false;
        }
        
        if (Date.now() >= this.redisCircuitBreaker.nextAttempt) {
            this.redisCircuitBreaker.state = 'half-open';
            return false;
        }
        
        return true;
    }

    /**
     * Normalizes cache key
     * @private
     * @param {string} key - Raw cache key
     * @returns {string} Normalized key
     */
    normalizeKey(key) {
        let normalizedKey = key;
        
        // Add prefix
        if (!key.startsWith(this.cacheConfig.redis.keyPrefix)) {
            normalizedKey = `${this.cacheConfig.redis.keyPrefix}${key}`;
        }
        
        // Truncate if too long
        if (normalizedKey.length > this.maxKeyLength) {
            const hash = crypto.createHash('sha256').update(normalizedKey).digest('hex');
            normalizedKey = `${normalizedKey.substring(0, this.maxKeyLength - 65)}:${hash}`;
        }
        
        return normalizedKey;
    }

    /**
     * Serializes value for storage
     * @private
     * @param {*} value - Value to serialize
     * @returns {string} Serialized value
     */
    serializeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }
        
        let serialized;
        
        if (this.serialization.type === 'json') {
            serialized = JSON.stringify(value);
        } else if (this.serialization.type === 'msgpack') {
            // Would use msgpack library
            serialized = JSON.stringify(value);
        } else {
            serialized = String(value);
        }
        
        // Compress if enabled and above threshold
        if (this.compression.enabled && serialized.length > this.compression.threshold) {
            serialized = this.compress(serialized);
        }
        
        return serialized;
    }

    /**
     * Deserializes value from storage
     * @private
     * @param {string} value - Serialized value
     * @returns {*} Deserialized value
     */
    deserializeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }
        
        try {
            // Decompress if needed
            if (this.compression.enabled && this.isCompressed(value)) {
                value = this.decompress(value);
            }
            
            if (this.serialization.type === 'json') {
                return JSON.parse(value);
            } else if (this.serialization.type === 'msgpack') {
                // Would use msgpack library
                return JSON.parse(value);
            } else {
                return value;
            }
        } catch (error) {
            console.error('Deserialization error:', error);
            return value;
        }
    }

    /**
     * Compresses data
     * @private
     * @param {string} data - Data to compress
     * @returns {string} Compressed data
     */
    compress(data) {
        const zlib = require('zlib');
        const compressed = zlib.gzipSync(data);
        return compressed.toString('base64');
    }

    /**
     * Decompresses data
     * @private
     * @param {string} data - Compressed data
     * @returns {string} Decompressed data
     */
    decompress(data) {
        const zlib = require('zlib');
        const buffer = Buffer.from(data, 'base64');
        const decompressed = zlib.gunzipSync(buffer);
        return decompressed.toString();
    }

    /**
     * Checks if data is compressed
     * @private
     * @param {string} data - Data to check
     * @returns {boolean} Compression status
     */
    isCompressed(data) {
        // Simple check - could be improved
        return typeof data === 'string' && data.length > 0 && /^[A-Za-z0-9+/=]+$/.test(data);
    }

    /**
     * Default key generator
     * @private
     * @param {Object} options - Key generation options
     * @returns {string} Generated key
     */
    defaultKeyGenerator(options) {
        const parts = [];
        
        if (options.prefix) {
            parts.push(options.prefix);
        }
        
        if (options.method) {
            parts.push(options.method);
        }
        
        if (options.url) {
            parts.push(options.url);
        }
        
        if (options.params) {
            parts.push(JSON.stringify(options.params));
        }
        
        const key = parts.join(':');
        const hash = crypto.createHash('sha256').update(key).digest('hex');
        
        return hash.substring(0, 16);
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
     * Clears cache by pattern
     * @private
     * @async
     * @param {string} pattern - Pattern to match
     * @returns {Promise<boolean>} Success status
     */
    async clearByPattern(pattern) {
        const keys = [];
        
        // Find keys matching pattern
        for (const [p, keySet] of this.patterns) {
            if (p === pattern || p.match(pattern)) {
                keys.push(...keySet);
            }
        }
        
        // Clear matching keys
        for (const key of keys) {
            await this.delete(key);
        }
        
        return true;
    }

    /**
     * Clears cache by tags
     * @private
     * @async
     * @param {Array<string>} tags - Tags to match
     * @returns {Promise<boolean>} Success status
     */
    async clearByTags(tags) {
        const keys = [];
        
        // Find keys with matching tags
        for (const [key, keyTags] of this.tags) {
            if (tags.some(tag => keyTags.has(tag))) {
                keys.push(key);
            }
        }
        
        // Clear matching keys
        for (const key of keys) {
            await this.delete(key);
        }
        
        return true;
    }

    /**
     * Invalidates cache dependencies
     * @private
     * @async
     * @param {string} key - Cache key
     */
    async invalidateDependencies(key) {
        const deps = this.dependencies.get(key);
        if (!deps) return;
        
        for (const dep of deps) {
            await this.delete(dep);
        }
    }

    /**
     * Queues write-behind operation
     * @private
     * @param {string} key - Cache key
     * @param {*} value - Value to write
     * @param {number} ttl - TTL in seconds
     */
    queueWriteBehind(key, value, ttl) {
        this.writeBehindQueue.push({ key, value, ttl, timestamp: Date.now() });
        
        // Start processing if not already running
        if (!this.writeBehindInterval) {
            this.startWriteBehind();
        }
    }

    /**
     * Starts write-behind processing
     * @private
     */
    startWriteBehind() {
        this.writeBehindInterval = setInterval(async () => {
            if (this.writeBehindQueue.length === 0) {
                clearInterval(this.writeBehindInterval);
                this.writeBehindInterval = null;
                return;
            }
            
            const batch = this.writeBehindQueue.splice(0, 100);
            await this.processWriteBehindBatch(batch);
        }, 1000);
    }

    /**
     * Processes write-behind batch
     * @private
     * @async
     * @param {Array} batch - Batch of write operations
     */
    async processWriteBehindBatch(batch) {
        if (!this.redisClient || this.isCircuitBreakerOpen()) {
            // Re-queue if Redis is unavailable
            this.writeBehindQueue.unshift(...batch);
            return;
        }
        
        const pipeline = this.redisClient.pipeline();
        
        for (const { key, value, ttl } of batch) {
            if (ttl) {
                pipeline.setex(key, ttl, value);
            } else {
                pipeline.set(key, value);
            }
        }
        
        try {
            await pipeline.exec();
        } catch (error) {
            console.error('Write-behind batch error:', error);
            // Re-queue on error
            this.writeBehindQueue.unshift(...batch);
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
     * Sets up cache invalidation
     * @private
     */
    setupInvalidation() {
        if (!this.redisSubClient) return;
        
        // Subscribe to invalidation channel
        this.redisSubClient.subscribe('cache:invalidate');
        
        this.redisSubClient.on('message', async (channel, message) => {
            if (channel === 'cache:invalidate') {
                try {
                    const { key, pattern, tags } = JSON.parse(message);
                    
                    if (key) {
                        await this.delete(key);
                    } else if (pattern) {
                        await this.clearByPattern(pattern);
                    } else if (tags) {
                        await this.clearByTags(tags);
                    }
                } catch (error) {
                    console.error('Invalidation message error:', error);
                }
            }
        });
    }

    /**
     * Publishes cache invalidation
     * @async
     * @param {Object} invalidation - Invalidation details
     */
    async publishInvalidation(invalidation) {
        if (!this.redisPubClient) return;
        
        try {
            await this.redisPubClient.publish('cache:invalidate', JSON.stringify(invalidation));
        } catch (error) {
            console.error('Publish invalidation error:', error);
        }
    }

    /**
     * Warms up cache
     * @private
     * @async
     */
    async warmupCache() {
        console.log('Warming up cache');
        
        for (const [name, warmupFn] of this.warmupFunctions) {
            try {
                await warmupFn();
                console.log(`Cache warmup completed: ${name}`);
            } catch (error) {
                console.error(`Cache warmup failed for ${name}:`, error);
            }
        }
        
        this.isWarmedUp = true;
        this.emit('cache:warmed-up');
    }

    /**
     * Registers cache warmup function
     * @param {string} name - Warmup function name
     * @param {Function} fn - Warmup function
     */
    registerWarmupFunction(name, fn) {
        this.warmupFunctions.set(name, fn);
    }

    /**
     * Updates get metrics
     * @private
     * @param {number} startTime - Operation start time
     */
    updateGetMetrics(startTime) {
        const duration = Date.now() - startTime;
        this.stats.totalGetTime += duration;
        const totalGets = this.stats.hits + this.stats.misses;
        this.stats.avgGetTime = this.stats.totalGetTime / totalGets;
        this.stats.hitRate = (this.stats.hits / totalGets) * 100;
    }

    /**
     * Updates set metrics
     * @private
     * @param {number} startTime - Operation start time
     */
    updateSetMetrics(startTime) {
        const duration = Date.now() - startTime;
        this.stats.totalSetTime += duration;
        this.stats.avgSetTime = this.stats.totalSetTime / this.stats.sets;
    }

    /**
     * Starts monitoring
     * @private
     */
    startMonitoring() {
        this.statsInterval = setInterval(() => {
            this.emit('cache:stats', { ...this.stats });
            
            if (this.monitoring.metricsCollector) {
                this.monitoring.metricsCollector.recordCacheMetrics('gateway', this.stats);
            }
        }, this.monitoring.interval);
    }

    /**
     * Starts cleanup interval
     * @private
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            // Clean up expired refresh-ahead jobs
            for (const [key, jobId] of this.refreshAheadJobs) {
                // Check if job is still valid
                // Clean up if needed
            }
            
            // Clean up old write-behind entries
            const cutoff = Date.now() - 300000; // 5 minutes
            this.writeBehindQueue = this.writeBehindQueue.filter(
                item => item.timestamp > cutoff
            );
        }, 60000); // Every minute
    }

    /**
     * Gets cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            memorySize: this.memoryCache.size,
            memoryMax: this.memoryCache.max,
            circuitBreakerState: this.redisCircuitBreaker.state,
            writeBehindQueueSize: this.writeBehindQueue.length,
            refreshAheadJobs: this.refreshAheadJobs.size
        };
    }

    /**
     * Handles connection errors
     * @private
     * @param {Error} error - Connection error
     */
    handleConnectionError(error) {
        console.error('Cache connection error:', error);
        
        // Continue with memory cache only
        this.isConnected = true;
        console.log('Operating in memory-only mode');
    }

    /**
     * Disconnects from cache stores
     * @async
     * @returns {Promise<void>}
     */
    async disconnect() {
        console.log('Disconnecting Cache Manager');
        
        // Clear intervals
        if (this.writeBehindInterval) {
            clearInterval(this.writeBehindInterval);
        }
        if (this.refreshAheadInterval) {
            clearInterval(this.refreshAheadInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        
        // Clear refresh-ahead jobs
        for (const jobId of this.refreshAheadJobs.values()) {
            clearTimeout(jobId);
        }
        
        // Process remaining write-behind queue
        if (this.writeBehindQueue.length > 0) {
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
        this.memoryCache.clear();
        
        this.isConnected = false;
        this.emit('cache:disconnected');
        
        console.log('Cache Manager disconnected');
    }
}

module.exports = { CacheManager };