'use strict';

/**
 * @fileoverview Comprehensive Cache Helper Utility
 * Provides a unified interface for caching operations with support for both
 * in-memory LRU cache and Redis backends. Includes advanced features like
 * metrics tracking, batch operations, memoization, and configuration management.
 *
 * @author Cache Helper Team
 * @version 1.0.0
 */

/**
 * Cache configuration object
 * @typedef {Object} CacheConfig
 * @property {string} backend - 'memory' or 'redis'
 * @property {number} ttl - Time to live in seconds
 * @property {string} namespace - Cache namespace
 * @property {boolean} serialize - Whether to serialize values
 * @property {number} maxSize - Maximum cache size for memory backend
 * @property {Object} compression - Compression settings
 */

/**
 * Cache options object
 * @typedef {Object} CacheOptions
 * @property {string} backend - Override default backend
 * @property {number} ttl - Time to live in seconds
 * @property {string} namespace - Cache namespace
 * @property {boolean} serialize - Whether to serialize values
 * @property {boolean} skipMetrics - Skip metrics tracking
 * @property {boolean} compress - Enable compression
 */

/**
 * Cache statistics object
 * @typedef {Object} CacheStats
 * @property {number} hits - Number of cache hits
 * @property {number} misses - Number of cache misses
 * @property {number} sets - Number of set operations
 * @property {number} deletes - Number of delete operations
 * @property {number} errors - Number of errors
 * @property {number} hitRate - Cache hit rate percentage
 * @property {Object} memory - Memory cache stats
 * @property {Object} redis - Redis cache stats
 */

/**
 * Comprehensive Cache Helper Class
 * Provides unified caching interface with support for multiple backends,
 * advanced features, and comprehensive monitoring capabilities.
 */
class CacheHelper {
    // Private static properties
    static #initialized = false;
    static #redisClient = null;
    static #memoryCache = null;
    static #configs = new Map();
    static #stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        memory: { size: 0, maxSize: 1000 },
        redis: { connected: false }
    };
    static #defaultConfig = {
        backend: 'memory',
        ttl: 3600, // 1 hour
        namespace: 'default',
        serialize: true,
        maxSize: 1000,
        compression: {
            enabled: false,
            threshold: 1024
        }
    };

    /**
     * Initialize the cache helper with default settings
     * Sets up the in-memory LRU cache and prepares for Redis connection
     *
     * @param {Object} options - Initialization options
     * @param {number} [options.maxSize=1000] - Maximum size for memory cache
     * @param {Object} [options.defaultConfig] - Default cache configuration
     * @throws {Error} If already initialized
     */
    static initialize(options = {}) {
        if (this.#initialized) {
            throw new Error('CacheHelper is already initialized');
        }

        try {
            // Initialize LRU cache
            this.#memoryCache = new Map();
            this.#stats.memory.maxSize = options.maxSize || 1000;

            // Merge default configuration
            if (options.defaultConfig) {
                this.#defaultConfig = { ...this.#defaultConfig, ...options.defaultConfig };
            }

            // Set up periodic cleanup for memory cache
            this.#setupMemoryCleanup();

            this.#initialized = true;
            this.#log('info', 'CacheHelper initialized successfully');
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', 'Failed to initialize CacheHelper', error);
            throw error;
        }
    }

    /**
     * Set Redis client for Redis backend operations
     *
     * @param {Object} client - Redis client instance
     * @throws {Error} If client is invalid or not connected
     */
    static setRedisClient(client) {
        if (!client || typeof client.get !== 'function') {
            throw new Error('Invalid Redis client provided');
        }

        this.#redisClient = client;
        this.#stats.redis.connected = true;
        this.#log('info', 'Redis client configured successfully');

        // Set up Redis error handling
        client.on('error', (error) => {
            this.#stats.errors++;
            this.#stats.redis.connected = false;
            this.#log('error', 'Redis connection error', error);
        });

        client.on('connect', () => {
            this.#stats.redis.connected = true;
            this.#log('info', 'Redis client connected');
        });
    }

    /**
     * Generate a standardized cache key
     *
     * @param {string} namespace - Cache namespace
     * @param {string|Object} identifier - Key identifier
     * @returns {string} Generated cache key
     */
    static generateKey(namespace, identifier) {
        const normalizedNamespace = namespace || this.#defaultConfig.namespace;
        const keyPart = typeof identifier === 'object'
            ? JSON.stringify(identifier)
            : String(identifier);

        return `${normalizedNamespace}:${keyPart}`;
    }

    /**
     * Get value from cache
     *
     * @param {string} key - Cache key
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<*>} Cached value or null if not found
     */
    static async get(key, options = {}) {
        this.#ensureInitialized();

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const fullKey = this.#buildFullKey(key, config);

            let value;
            if (backend === 'redis' && this.#redisClient) {
                value = await this.#getFromRedis(fullKey);
            } else {
                value = this.#getFromMemory(fullKey);
            }

            if (value !== null && value !== undefined) {
                this.#stats.hits++;
                if (!options.skipMetrics) {
                    this.#updateMetrics('hit', backend);
                }

                return config.serialize ? this.#deserialize(value) : value;
            } else {
                this.#stats.misses++;
                if (!options.skipMetrics) {
                    this.#updateMetrics('miss', backend);
                }
                return null;
            }
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to get cache key: ${key}`, error);
            return null;
        }
    }

    /**
     * Set value in cache with optional TTL
     *
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<boolean>} Success status
     */
    static async set(key, value, options = {}) {
        this.#ensureInitialized();

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const fullKey = this.#buildFullKey(key, config);
            const serializedValue = config.serialize ? this.#serialize(value) : value;
            const ttl = options.ttl || config.ttl;

            let success = false;
            if (backend === 'redis' && this.#redisClient) {
                success = await this.#setInRedis(fullKey, serializedValue, ttl);
            } else {
                success = this.#setInMemory(fullKey, serializedValue, ttl);
            }

            if (success) {
                this.#stats.sets++;
                if (!options.skipMetrics) {
                    this.#updateMetrics('set', backend);
                }
            }

            return success;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to set cache key: ${key}`, error);
            return false;
        }
    }

    /**
     * Delete value from cache
     *
     * @param {string} key - Cache key
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<boolean>} Success status
     */
    static async delete(key, options = {}) {
        this.#ensureInitialized();

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const fullKey = this.#buildFullKey(key, config);

            let success = false;
            if (backend === 'redis' && this.#redisClient) {
                success = await this.#deleteFromRedis(fullKey);
            } else {
                success = this.#deleteFromMemory(fullKey);
            }

            if (success) {
                this.#stats.deletes++;
                if (!options.skipMetrics) {
                    this.#updateMetrics('delete', backend);
                }
            }

            return success;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to delete cache key: ${key}`, error);
            return false;
        }
    }

    /**
     * Clear cache entries matching a pattern
     *
     * @param {string} pattern - Pattern to match (supports wildcards)
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<number>} Number of deleted entries
     */
    static async clearPattern(pattern, options = {}) {
        this.#ensureInitialized();

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const fullPattern = this.#buildFullKey(pattern, config);

            let deletedCount = 0;
            if (backend === 'redis' && this.#redisClient) {
                deletedCount = await this.#clearPatternFromRedis(fullPattern);
            } else {
                deletedCount = this.#clearPatternFromMemory(fullPattern);
            }

            this.#stats.deletes += deletedCount;
            return deletedCount;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to clear pattern: ${pattern}`, error);
            return 0;
        }
    }

    /**
     * Clear all cache entries
     *
     * @returns {Promise<boolean>} Success status
     */
    static async clearAll() {
        this.#ensureInitialized();

        try {
            let success = true;

            // Clear memory cache
            this.#memoryCache.clear();
            this.#stats.memory.size = 0;

            // Clear Redis cache if available
            if (this.#redisClient) {
                try {
                    await this.#redisClient.flushall();
                } catch (redisError) {
                    this.#log('warn', 'Failed to clear Redis cache', redisError);
                    success = false;
                }
            }

            this.#log('info', 'All caches cleared');
            return success;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', 'Failed to clear all caches', error);
            return false;
        }
    }

    /**
     * Get value from cache or load using provided loader function
     *
     * @param {string} key - Cache key
     * @param {Function} loader - Function to load data if not in cache
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<*>} Cached or loaded value
     */
    static async getOrLoad(key, loader, options = {}) {
        this.#ensureInitialized();

        if (typeof loader !== 'function') {
            throw new Error('Loader must be a function');
        }

        try {
            // Try to get from cache first
            let value = await this.get(key, options);

            if (value !== null && value !== undefined) {
                return value;
            }

            // Load data using loader function
            value = await loader();

            // Cache the loaded value
            if (value !== null && value !== undefined) {
                await this.set(key, value, options);
            }

            return value;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to get or load cache key: ${key}`, error);
            throw error;
        }
    }

    /**
     * Memoize a function with caching
     *
     * @param {Function} fn - Function to memoize
     * @param {Object} [options={}] - Memoization options
     * @param {Function} [options.keyGenerator] - Custom key generator
     * @param {number} [options.ttl] - Cache TTL
     * @param {string} [options.namespace] - Cache namespace
     * @returns {Function} Memoized function
     */
    static memoize(fn, options = {}) {
        this.#ensureInitialized();

        if (typeof fn !== 'function') {
            throw new Error('First argument must be a function');
        }

        const {
            keyGenerator = (...args) => JSON.stringify(args),
            ttl = this.#defaultConfig.ttl,
            namespace = 'memoized'
        } = options;

        return async (...args) => {
            try {
                const cacheKey = this.generateKey(namespace, keyGenerator(...args));

                return await this.getOrLoad(
                    cacheKey,
                    () => fn(...args),
                    { ttl, ...options }
                );
            } catch (error) {
                this.#log('error', 'Memoized function error', error);
                return fn(...args);
            }
        };
    }

    /**
     * Batch get multiple keys from cache
     *
     * @param {string[]} keys - Array of cache keys
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<Object>} Object with key-value pairs
     */
    static async mget(keys, options = {}) {
        this.#ensureInitialized();

        if (!Array.isArray(keys)) {
            throw new Error('Keys must be an array');
        }

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const results = {};

            if (backend === 'redis' && this.#redisClient) {
                const fullKeys = keys.map(key => this.#buildFullKey(key, config));
                const values = await this.#mgetFromRedis(fullKeys);

                keys.forEach((key, index) => {
                    const value = values[index];
                    results[key] = value && config.serialize ? this.#deserialize(value) : value;
                });
            } else {
                for (const key of keys) {
                    results[key] = await this.get(key, { ...options, skipMetrics: true });
                }
            }

            return results;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', 'Failed to batch get from cache', error);
            return {};
        }
    }

    /**
     * Batch set multiple key-value pairs in cache
     *
     * @param {Object} keyValues - Object with key-value pairs
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<boolean>} Success status
     */
    static async mset(keyValues, options = {}) {
        this.#ensureInitialized();

        if (typeof keyValues !== 'object' || keyValues === null) {
            throw new Error('keyValues must be an object');
        }

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const entries = Object.entries(keyValues);

            if (backend === 'redis' && this.#redisClient) {
                const redisData = [];
                for (const [key, value] of entries) {
                    const fullKey = this.#buildFullKey(key, config);
                    const serializedValue = config.serialize ? this.#serialize(value) : value;
                    redisData.push([fullKey, serializedValue]);
                }

                return await this.#msetInRedis(redisData, options.ttl || config.ttl);
            } else {
                let success = true;
                for (const [key, value] of entries) {
                    const result = await this.set(key, value, { ...options, skipMetrics: true });
                    if (!result) success = false;
                }
                return success;
            }
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', 'Failed to batch set cache', error);
            return false;
        }
    }

    /**
     * Increment a numeric value in cache
     *
     * @param {string} key - Cache key
     * @param {number} [amount=1] - Amount to increment
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<number>} New value after increment
     */
    static async increment(key, amount = 1, options = {}) {
        this.#ensureInitialized();

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const fullKey = this.#buildFullKey(key, config);

            if (backend === 'redis' && this.#redisClient) {
                return await this.#incrementInRedis(fullKey, amount);
            } else {
                return await this.#incrementInMemory(fullKey, amount, config);
            }
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to increment cache key: ${key}`, error);
            throw error;
        }
    }

    /**
     * Decrement a numeric value in cache
     *
     * @param {string} key - Cache key
     * @param {number} [amount=1] - Amount to decrement
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<number>} New value after decrement
     */
    static async decrement(key, amount = 1, options = {}) {
        return this.increment(key, -amount, options);
    }

    /**
     * Add member to a set in cache
     *
     * @param {string} key - Cache key for the set
     * @param {*} member - Member to add to set
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<boolean>} Success status
     */
    static async addToSet(key, member, options = {}) {
        this.#ensureInitialized();

        try {
            const config = this.#mergeConfig(options);
            const backend = options.backend || config.backend;
            const fullKey = this.#buildFullKey(key, config);

            if (backend === 'redis' && this.#redisClient) {
                return await this.#addToSetInRedis(fullKey, member);
            } else {
                return await this.#addToSetInMemory(fullKey, member, config);
            }
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', `Failed to add to set: ${key}`, error);
            return false;
        }
    }

    /**
     * Get comprehensive cache statistics
     *
     * @returns {CacheStats} Cache statistics object
     */
    static getStats() {
        const hitRate = this.#stats.hits + this.#stats.misses > 0
            ? ((this.#stats.hits / (this.#stats.hits + this.#stats.misses)) * 100).toFixed(2)
            : 0;

        return {
            ...this.#stats,
            hitRate: parseFloat(hitRate),
            memory: {
                ...this.#stats.memory,
                size: this.#memoryCache ? this.#memoryCache.size : 0
            }
        };
    }

    /**
     * Warm up cache with preloaded data
     *
     * @param {Function} dataLoader - Function that returns data to cache
     * @param {string[]} keys - Array of keys to warm up
     * @param {CacheOptions} [options={}] - Cache options
     * @returns {Promise<Object>} Warm up results
     */
    static async warmUp(dataLoader, keys, options = {}) {
        this.#ensureInitialized();

        if (typeof dataLoader !== 'function') {
            throw new Error('dataLoader must be a function');
        }

        if (!Array.isArray(keys)) {
            throw new Error('keys must be an array');
        }

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        try {
            const warmUpPromises = keys.map(async (key) => {
                try {
                    const data = await dataLoader(key);
                    const success = await this.set(key, data, options);

                    if (success) {
                        results.success++;
                    } else {
                        results.failed++;
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push({ key, error: error.message });
                }
            });

            await Promise.all(warmUpPromises);
            this.#log('info', `Cache warm-up completed: ${results.success} success, ${results.failed} failed`);

            return results;
        } catch (error) {
            this.#stats.errors++;
            this.#log('error', 'Cache warm-up failed', error);
            throw error;
        }
    }

    /**
     * Create a named cache configuration
     *
     * @param {string} name - Configuration name
     * @param {CacheConfig} config - Cache configuration
     */
    static createConfig(name, config) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error('Configuration name must be a non-empty string');
        }

        const mergedConfig = { ...this.#defaultConfig, ...config };
        this.#configs.set(name, mergedConfig);
        this.#log('info', `Cache configuration '${name}' created`);
    }

    /**
     * Get value using named configuration
     *
     * @param {string} configName - Configuration name
     * @param {string} key - Cache key
     * @param {CacheOptions} [options={}] - Additional options
     * @returns {Promise<*>} Cached value
     */
    static async getWithConfig(configName, key, options = {}) {
        const config = this.#configs.get(configName);
        if (!config) {
            throw new Error(`Configuration '${configName}' not found`);
        }

        return this.get(key, { ...config, ...options });
    }

    /**
     * Set value using named configuration
     *
     * @param {string} configName - Configuration name
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {CacheOptions} [options={}] - Additional options
     * @returns {Promise<boolean>} Success status
     */
    static async setWithConfig(configName, key, value, options = {}) {
        const config = this.#configs.get(configName);
        if (!config) {
            throw new Error(`Configuration '${configName}' not found`);
        }

        return this.set(key, value, { ...config, ...options });
    }

    // Private helper methods

    /**
     * Ensure the cache helper is initialized
     * @private
     */
    static #ensureInitialized() {
        if (!this.#initialized) {
            throw new Error('CacheHelper not initialized. Call initialize() first.');
        }
    }

    /**
     * Merge configuration with defaults
     * @private
     */
    static #mergeConfig(options) {
        return { ...this.#defaultConfig, ...options };
    }

    /**
     * Build full cache key with namespace
     * @private
     */
    static #buildFullKey(key, config) {
        return config.namespace ? `${config.namespace}:${key}` : key;
    }

    /**
     * Serialize value for storage
     * @private
     */
    static #serialize(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            this.#log('warn', 'Failed to serialize value', error);
            return String(value);
        }
    }

    /**
     * Deserialize value from storage
     * @private
     */
    static #deserialize(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return value;
        }
    }

    /**
     * Get value from Redis
     * @private
     */
    static async #getFromRedis(key) {
        try {
            return await this.#redisClient.get(key);
        } catch (error) {
            this.#log('error', 'Redis get error', error);
            return null;
        }
    }

    /**
     * Set value in Redis
     * @private
     */
    static async #setInRedis(key, value, ttl) {
        try {
            if (ttl && ttl > 0) {
                await this.#redisClient.setex(key, ttl, value);
            } else {
                await this.#redisClient.set(key, value);
            }
            return true;
        } catch (error) {
            this.#log('error', 'Redis set error', error);
            return false;
        }
    }

    /**
     * Delete value from Redis
     * @private
     */
    static async #deleteFromRedis(key) {
        try {
            const result = await this.#redisClient.del(key);
            return result > 0;
        } catch (error) {
            this.#log('error', 'Redis delete error', error);
            return false;
        }
    }

    /**
     * Clear pattern from Redis
     * @private
     */
    static async #clearPatternFromRedis(pattern) {
        try {
            const keys = await this.#redisClient.keys(pattern);
            if (keys.length > 0) {
                await this.#redisClient.del(...keys);
            }
            return keys.length;
        } catch (error) {
            this.#log('error', 'Redis clear pattern error', error);
            return 0;
        }
    }

    /**
     * Batch get from Redis
     * @private
     */
    static async #mgetFromRedis(keys) {
        try {
            return await this.#redisClient.mget(...keys);
        } catch (error) {
            this.#log('error', 'Redis mget error', error);
            return new Array(keys.length).fill(null);
        }
    }

    /**
     * Batch set in Redis
     * @private
     */
    static async #msetInRedis(keyValues, ttl) {
        try {
            const multi = this.#redisClient.multi();

            for (const [key, value] of keyValues) {
                if (ttl && ttl > 0) {
                    multi.setex(key, ttl, value);
                } else {
                    multi.set(key, value);
                }
            }

            await multi.exec();
            return true;
        } catch (error) {
            this.#log('error', 'Redis mset error', error);
            return false;
        }
    }

    /**
     * Increment value in Redis
     * @private
     */
    static async #incrementInRedis(key, amount) {
        try {
            if (amount === 1) {
                return await this.#redisClient.incr(key);
            } else {
                return await this.#redisClient.incrby(key, amount);
            }
        } catch (error) {
            this.#log('error', 'Redis increment error', error);
            throw error;
        }
    }

    /**
     * Add to set in Redis
     * @private
     */
    static async #addToSetInRedis(key, member) {
        try {
            const result = await this.#redisClient.sadd(key, member);
            return result > 0;
        } catch (error) {
            this.#log('error', 'Redis set add error', error);
            return false;
        }
    }

    /**
     * Get value from memory cache
     * @private
     */
    static #getFromMemory(key) {
        const entry = this.#memoryCache.get(key);
        if (!entry) return null;

        // Check if entry has expired
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.#memoryCache.delete(key);
            this.#stats.memory.size = this.#memoryCache.size;
            return null;
        }

        // Update LRU order
        this.#memoryCache.delete(key);
        this.#memoryCache.set(key, entry);

        return entry.value;
    }

    /**
     * Set value in memory cache
     * @private
     */
    static #setInMemory(key, value, ttl) {
        try {
            // Implement LRU eviction
            if (this.#memoryCache.size >= this.#stats.memory.maxSize) {
                const firstKey = this.#memoryCache.keys().next().value;
                this.#memoryCache.delete(firstKey);
            }

            const entry = {
                value,
                createdAt: Date.now(),
                expiresAt: ttl ? Date.now() + (ttl * 1000) : null
            };

            this.#memoryCache.set(key, entry);
            this.#stats.memory.size = this.#memoryCache.size;
            return true;
        } catch (error) {
            this.#log('error', 'Memory set error', error);
            return false;
        }
    }

    /**
     * Delete value from memory cache
     * @private
     */
    static #deleteFromMemory(key) {
        const deleted = this.#memoryCache.delete(key);
        if (deleted) {
            this.#stats.memory.size = this.#memoryCache.size;
        }
        return deleted;
    }

    /**
     * Clear pattern from memory cache
     * @private
     */
    static #clearPatternFromMemory(pattern) {
        let deletedCount = 0;
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));

        for (const key of this.#memoryCache.keys()) {
            if (regex.test(key)) {
                this.#memoryCache.delete(key);
                deletedCount++;
            }
        }

        this.#stats.memory.size = this.#memoryCache.size;
        return deletedCount;
    }

    /**
     * Increment value in memory cache
     * @private
     */
    static async #incrementInMemory(key, amount, config) {
        const current = await this.get(key, { backend: 'memory', serialize: false });
        const newValue = (typeof current === 'number' ? current : 0) + amount;

        await this.set(key, newValue, {
            backend: 'memory',
            serialize: false,
            ttl: config.ttl
        });

        return newValue;
    }

    /**
     * Add to set in memory cache
     * @private
     */
    static async #addToSetInMemory(key, member, config) {
        const currentSet = await this.get(key, { backend: 'memory' }) || new Set();
        const set = currentSet instanceof Set ? currentSet : new Set(Array.isArray(currentSet) ? currentSet : []);

        const sizeBefore = set.size;
        set.add(member);

        if (set.size > sizeBefore) {
            await this.set(key, set, { backend: 'memory', ttl: config.ttl });
            return true;
        }

        return false;
    }

    /**
     * Set up periodic cleanup for expired memory cache entries
     * @private
     */
    static #setupMemoryCleanup() {
        setInterval(() => {
            const now = Date.now();
            let cleaned = 0;

            for (const [key, entry] of this.#memoryCache.entries()) {
                if (entry.expiresAt && now > entry.expiresAt) {
                    this.#memoryCache.delete(key);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                this.#stats.memory.size = this.#memoryCache.size;
                this.#log('debug', `Cleaned ${cleaned} expired cache entries`);
            }
        }, 60000); // Run every minute
    }

    /**
     * Update cache metrics
     * @private
     */
    static #updateMetrics(operation, backend) {
        // Implementation can be extended for more detailed metrics
        // This is a placeholder for future metric tracking features
    }

    /**
     * Logging utility
     * @private
     */
    static #log(level, message, error = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [CacheHelper] [${level.toUpperCase()}] ${message}`;

        if (typeof console !== 'undefined') {
            switch (level) {
                case 'error':
                    console.error(logMessage, error || '');
                    break;
                case 'warn':
                    console.warn(logMessage);
                    break;
                case 'info':
                    console.info(logMessage);
                    break;
                case 'debug':
                    console.debug(logMessage);
                    break;
                default:
                    console.log(logMessage);
            }
        }
    }
}

module.exports = CacheHelper;
