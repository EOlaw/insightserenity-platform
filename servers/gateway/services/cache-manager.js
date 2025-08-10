/**
 * Cache Manager
 * Manages Redis caching for the API Gateway
 */

const Redis = require('ioredis');
const NodeCache = require('node-cache');
const crypto = require('crypto');

/**
 * Cache Manager Class
 */
class CacheManager {
    constructor(config) {
        this.config = config;
        this.redisClient = null;
        this.memoryCache = null;
        this.isConnected = false;
        this.subscribers = new Map();
        this.publishers = new Map();
    }

    /**
     * Connect to cache
     */
    async connect() {
        if (!this.config.enabled) {
            console.info('Cache is disabled');
            this.setupMemoryCache();
            return;
        }

        try {
            // Setup Redis connection
            await this.setupRedis();
            
            // Setup memory cache as fallback
            this.setupMemoryCache();
            
            console.info('Cache Manager connected successfully');
        } catch (error) {
            console.error('Failed to connect to cache:', error);
            // Fall back to memory cache
            this.setupMemoryCache();
        }
    }

    /**
     * Setup Redis connection
     */
    async setupRedis() {
        const redisConfig = this.config.redis || {};
        
        // Create Redis client
        this.redisClient = new Redis({
            host: redisConfig.host || 'localhost',
            port: redisConfig.port || 6379,
            password: redisConfig.password,
            db: redisConfig.db || 0,
            keyPrefix: redisConfig.keyPrefix || 'gateway:',
            retryStrategy: redisConfig.retryStrategy || ((times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }),
            reconnectOnError: (err) => {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
                }
                return false;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
            keepAlive: 30000,
            connectTimeout: 10000,
            autoResubscribe: true,
            autoResendUnfulfilledCommands: true
        });

        // Setup event handlers
        this.redisClient.on('connect', () => {
            console.info('Redis client connected');
            this.isConnected = true;
        });

        this.redisClient.on('ready', () => {
            console.info('Redis client ready');
        });

        this.redisClient.on('error', (error) => {
            console.error('Redis client error:', error);
            this.isConnected = false;
        });

        this.redisClient.on('close', () => {
            console.info('Redis client connection closed');
            this.isConnected = false;
        });

        this.redisClient.on('reconnecting', (delay) => {
            console.info(`Redis client reconnecting in ${delay}ms`);
        });

        // Wait for connection
        await this.redisClient.ping();
    }

    /**
     * Setup memory cache
     */
    setupMemoryCache() {
        this.memoryCache = new NodeCache({
            stdTTL: this.config.ttl?.default || 300,
            checkperiod: 60,
            useClones: false,
            deleteOnExpire: true,
            enableLegacyCallbacks: false,
            maxKeys: 10000
        });

        this.memoryCache.on('expired', (key, value) => {
            console.debug(`Memory cache key expired: ${key}`);
        });

        this.memoryCache.on('flush', () => {
            console.info('Memory cache flushed');
        });
    }

    /**
     * Get value from cache
     */
    async get(key) {
        try {
            // Try Redis first
            if (this.isConnected && this.redisClient) {
                const value = await this.redisClient.get(key);
                if (value) {
                    try {
                        return JSON.parse(value);
                    } catch {
                        return value;
                    }
                }
            }

            // Fallback to memory cache
            if (this.memoryCache) {
                return this.memoryCache.get(key);
            }

            return null;
        } catch (error) {
            console.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Set value in cache
     */
    async set(key, value, ttl = null) {
        try {
            const finalTtl = ttl || this.config.ttl?.default || 300;
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

            // Set in Redis
            if (this.isConnected && this.redisClient) {
                if (ttl) {
                    await this.redisClient.setex(key, finalTtl, serializedValue);
                } else {
                    await this.redisClient.set(key, serializedValue);
                }
            }

            // Also set in memory cache
            if (this.memoryCache) {
                this.memoryCache.set(key, value, finalTtl);
            }

            return true;
        } catch (error) {
            console.error(`Cache set error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete value from cache
     */
    async delete(key) {
        try {
            // Delete from Redis
            if (this.isConnected && this.redisClient) {
                await this.redisClient.del(key);
            }

            // Delete from memory cache
            if (this.memoryCache) {
                this.memoryCache.del(key);
            }

            return true;
        } catch (error) {
            console.error(`Cache delete error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete multiple keys by pattern
     */
    async deletePattern(pattern) {
        try {
            if (this.isConnected && this.redisClient) {
                const keys = await this.redisClient.keys(pattern);
                if (keys.length > 0) {
                    await this.redisClient.del(...keys);
                }
                return keys.length;
            }
            return 0;
        } catch (error) {
            console.error(`Cache delete pattern error for ${pattern}:`, error);
            return 0;
        }
    }

    /**
     * Check if key exists
     */
    async exists(key) {
        try {
            if (this.isConnected && this.redisClient) {
                return await this.redisClient.exists(key) === 1;
            }

            if (this.memoryCache) {
                return this.memoryCache.has(key);
            }

            return false;
        } catch (error) {
            console.error(`Cache exists error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Get TTL for key
     */
    async getTTL(key) {
        try {
            if (this.isConnected && this.redisClient) {
                return await this.redisClient.ttl(key);
            }

            if (this.memoryCache) {
                return this.memoryCache.getTtl(key);
            }

            return -1;
        } catch (error) {
            console.error(`Cache TTL error for key ${key}:`, error);
            return -1;
        }
    }

    /**
     * Set TTL for key
     */
    async expire(key, ttl) {
        try {
            if (this.isConnected && this.redisClient) {
                return await this.redisClient.expire(key, ttl);
            }

            if (this.memoryCache) {
                return this.memoryCache.ttl(key, ttl);
            }

            return false;
        } catch (error) {
            console.error(`Cache expire error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Increment value
     */
    async increment(key, amount = 1) {
        try {
            if (this.isConnected && this.redisClient) {
                return await this.redisClient.incrby(key, amount);
            }

            if (this.memoryCache) {
                const current = this.memoryCache.get(key) || 0;
                const newValue = current + amount;
                this.memoryCache.set(key, newValue);
                return newValue;
            }

            return 0;
        } catch (error) {
            console.error(`Cache increment error for key ${key}:`, error);
            return 0;
        }
    }

    /**
     * Decrement value
     */
    async decrement(key, amount = 1) {
        try {
            if (this.isConnected && this.redisClient) {
                return await this.redisClient.decrby(key, amount);
            }

            if (this.memoryCache) {
                const current = this.memoryCache.get(key) || 0;
                const newValue = current - amount;
                this.memoryCache.set(key, newValue);
                return newValue;
            }

            return 0;
        } catch (error) {
            console.error(`Cache decrement error for key ${key}:`, error);
            return 0;
        }
    }

    /**
     * Get multiple values
     */
    async mget(keys) {
        try {
            if (this.isConnected && this.redisClient) {
                const values = await this.redisClient.mget(...keys);
                return values.map(v => {
                    if (!v) return null;
                    try {
                        return JSON.parse(v);
                    } catch {
                        return v;
                    }
                });
            }

            if (this.memoryCache) {
                return keys.map(key => this.memoryCache.get(key) || null);
            }

            return keys.map(() => null);
        } catch (error) {
            console.error('Cache mget error:', error);
            return keys.map(() => null);
        }
    }

    /**
     * Set multiple values
     */
    async mset(keyValuePairs, ttl = null) {
        try {
            const pipeline = this.redisClient?.pipeline();
            
            for (const [key, value] of Object.entries(keyValuePairs)) {
                const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
                
                if (pipeline) {
                    if (ttl) {
                        pipeline.setex(key, ttl, serializedValue);
                    } else {
                        pipeline.set(key, serializedValue);
                    }
                }
                
                if (this.memoryCache) {
                    this.memoryCache.set(key, value, ttl);
                }
            }
            
            if (pipeline) {
                await pipeline.exec();
            }
            
            return true;
        } catch (error) {
            console.error('Cache mset error:', error);
            return false;
        }
    }

    /**
     * Clear all cache
     */
    async flush() {
        try {
            if (this.isConnected && this.redisClient) {
                await this.redisClient.flushdb();
            }

            if (this.memoryCache) {
                this.memoryCache.flushAll();
            }

            return true;
        } catch (error) {
            console.error('Cache flush error:', error);
            return false;
        }
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        const stats = {
            redis: {
                connected: this.isConnected,
                info: null
            },
            memory: {
                keys: 0,
                hits: 0,
                misses: 0
            }
        };

        try {
            if (this.isConnected && this.redisClient) {
                const info = await this.redisClient.info('stats');
                stats.redis.info = this.parseRedisInfo(info);
            }

            if (this.memoryCache) {
                stats.memory = {
                    keys: this.memoryCache.keys().length,
                    hits: this.memoryCache.getStats().hits,
                    misses: this.memoryCache.getStats().misses,
                    ksize: this.memoryCache.getStats().ksize,
                    vsize: this.memoryCache.getStats().vsize
                };
            }
        } catch (error) {
            console.error('Error getting cache stats:', error);
        }

        return stats;
    }

    /**
     * Parse Redis INFO output
     */
    parseRedisInfo(info) {
        const lines = info.split('\r\n');
        const parsed = {};
        
        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) {
                    parsed[key] = value;
                }
            }
        }
        
        return parsed;
    }

    /**
     * Create pub/sub subscriber
     */
    async subscribe(channel, callback) {
        if (!this.isConnected || !this.redisClient) {
            console.warn('Cannot subscribe: Redis not connected');
            return null;
        }

        try {
            let subscriber = this.subscribers.get(channel);
            
            if (!subscriber) {
                subscriber = this.redisClient.duplicate();
                await subscriber.subscribe(channel);
                this.subscribers.set(channel, subscriber);
                
                subscriber.on('message', (ch, message) => {
                    if (ch === channel) {
                        try {
                            const data = JSON.parse(message);
                            callback(data);
                        } catch {
                            callback(message);
                        }
                    }
                });
            }
            
            return subscriber;
        } catch (error) {
            console.error(`Failed to subscribe to channel ${channel}:`, error);
            return null;
        }
    }

    /**
     * Publish message to channel
     */
    async publish(channel, message) {
        if (!this.isConnected || !this.redisClient) {
            console.warn('Cannot publish: Redis not connected');
            return false;
        }

        try {
            const data = typeof message === 'string' ? message : JSON.stringify(message);
            await this.redisClient.publish(channel, data);
            return true;
        } catch (error) {
            console.error(`Failed to publish to channel ${channel}:`, error);
            return false;
        }
    }

    /**
     * Unsubscribe from channel
     */
    async unsubscribe(channel) {
        const subscriber = this.subscribers.get(channel);
        if (subscriber) {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
            this.subscribers.delete(channel);
        }
    }

    /**
     * Generate cache key
     */
    generateKey(...parts) {
        return parts.filter(Boolean).join(':');
    }

    /**
     * Hash key for consistent hashing
     */
    hashKey(key) {
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     * Get Redis client (for direct access)
     */
    getClient() {
        return this.redisClient;
    }

    /**
     * Disconnect from cache
     */
    async disconnect() {
        try {
            // Unsubscribe all channels
            for (const [channel, subscriber] of this.subscribers) {
                await subscriber.unsubscribe(channel);
                await subscriber.quit();
            }
            this.subscribers.clear();

            // Close Redis connection
            if (this.redisClient) {
                await this.redisClient.quit();
                this.redisClient = null;
            }

            // Clear memory cache
            if (this.memoryCache) {
                this.memoryCache.flushAll();
                this.memoryCache.close();
                this.memoryCache = null;
            }

            this.isConnected = false;
            console.info('Cache Manager disconnected');
        } catch (error) {
            console.error('Error disconnecting from cache:', error);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await this.disconnect();
    }
}

module.exports = { CacheManager };