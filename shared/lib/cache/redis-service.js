'use strict';

/**
 * @fileoverview Redis Service - Caching and Pub/Sub for real-time analytics
 * @module shared/lib/cache/redis-service
 * @description Production-ready Redis service with connection pooling, pub/sub, and health checks
 */

const Redis = require('ioredis');
const { EventEmitter } = require('events');
const logger = require('../utils/logger').createLogger({
    serviceName: 'redis-service'
});

/**
 * Redis Service
 * Handles caching, pub/sub, and connection management
 * @class RedisService
 * @extends EventEmitter
 */
class RedisService extends EventEmitter {
    constructor() {
        super();
        
        this.client = null;
        this.subscriber = null;
        this.publisher = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // Configuration
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB) || 0,
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'insightserenity:',
            
            // Connection settings
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: true,
            connectTimeout: 10000,
            
            // Reconnection settings
            retryStrategy: (times) => {
                if (times > this.maxReconnectAttempts) {
                    logger.error('Redis max reconnection attempts reached');
                    return null; // Stop reconnecting
                }
                const delay = Math.min(times * 1000, 5000); // Max 5 second delay
                logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
                return delay;
            },
            
            // Performance settings
            lazyConnect: false,
            keepAlive: 30000, // 30 seconds
            family: 4, // IPv4
        };
        
        // Default TTL values (in seconds)
        this.ttl = {
            dashboard: parseInt(process.env.CACHE_TTL_DASHBOARD) || 600, // 10 minutes
            stats: parseInt(process.env.CACHE_TTL_STATS) || 300, // 5 minutes
            analytics: parseInt(process.env.CACHE_TTL_ANALYTICS) || 900, // 15 minutes
            shortLived: 60, // 1 minute
            longLived: 3600, // 1 hour
        };
        
        // Pub/Sub channels
        this.channels = {
            ASSIGNMENT_UPDATED: 'analytics:assignment:updated',
            TIME_LOGGED: 'analytics:time:logged',
            FEEDBACK_RECEIVED: 'analytics:feedback:received',
            CERTIFICATION_ADDED: 'analytics:certification:added',
            SKILL_UPDATED: 'analytics:skill:updated',
            CACHE_INVALIDATE: 'cache:invalidate',
            DASHBOARD_REFRESH: 'dashboard:refresh',
        };
        
        // Metrics
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            eventsPublished: 0,
            eventsReceived: 0,
            errors: 0,
        };
    }

    // ============================================================================
    // CONNECTION MANAGEMENT
    // ============================================================================

    /**
     * Initialize Redis connections
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            if (this.isConnected) {
                logger.warn('Redis already initialized');
                return;
            }

            logger.info('Initializing Redis connections', {
                host: this.config.host,
                port: this.config.port,
                db: this.config.db
            });

            // Create main client for caching
            this.client = new Redis(this.config);
            this._setupClientEventHandlers(this.client, 'client');

            // Create separate connections for pub/sub
            this.publisher = new Redis(this.config);
            this._setupClientEventHandlers(this.publisher, 'publisher');

            this.subscriber = new Redis(this.config);
            this._setupClientEventHandlers(this.subscriber, 'subscriber');

            // Wait for all connections to be ready
            await Promise.all([
                this._waitForReady(this.client),
                this._waitForReady(this.publisher),
                this._waitForReady(this.subscriber)
            ]);

            this.isConnected = true;
            this.emit('connected');
            
            logger.info('Redis connections established successfully');

        } catch (error) {
            logger.error('Failed to initialize Redis', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup event handlers for Redis client
     * @private
     */
    _setupClientEventHandlers(client, name) {
        client.on('connect', () => {
            logger.info(`Redis ${name} connecting`);
        });

        client.on('ready', () => {
            logger.info(`Redis ${name} ready`);
            this.reconnectAttempts = 0;
        });

        client.on('error', (error) => {
            logger.error(`Redis ${name} error`, { error: error.message });
            this.metrics.errors++;
            this.emit('error', error);
        });

        client.on('close', () => {
            logger.warn(`Redis ${name} connection closed`);
            this.isConnected = false;
        });

        client.on('reconnecting', (delay) => {
            this.reconnectAttempts++;
            logger.warn(`Redis ${name} reconnecting`, { 
                delay, 
                attempt: this.reconnectAttempts 
            });
        });

        client.on('end', () => {
            logger.info(`Redis ${name} connection ended`);
        });
    }

    /**
     * Wait for Redis client to be ready
     * @private
     */
    _waitForReady(client) {
        return new Promise((resolve, reject) => {
            if (client.status === 'ready') {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Redis connection timeout'));
            }, this.config.connectTimeout);

            client.once('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            client.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Check if Redis is connected
     * @returns {boolean}
     */
    isReady() {
        return this.isConnected && 
               this.client?.status === 'ready' &&
               this.publisher?.status === 'ready' &&
               this.subscriber?.status === 'ready';
    }

    /**
     * Get health status
     * @returns {Object}
     */
    getHealthStatus() {
        return {
            connected: this.isConnected,
            clientStatus: this.client?.status || 'disconnected',
            publisherStatus: this.publisher?.status || 'disconnected',
            subscriberStatus: this.subscriber?.status || 'disconnected',
            metrics: this.metrics,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    // ============================================================================
    // CACHING OPERATIONS
    // ============================================================================

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cached value or null
     */
    async get(key) {
        try {
            if (!this.isReady()) {
                logger.warn('Redis not ready, skipping cache get');
                return null;
            }

            const fullKey = this._buildKey(key);
            const value = await this.client.get(fullKey);

            if (value) {
                this.metrics.cacheHits++;
                logger.debug('Cache hit', { key: fullKey });
                return JSON.parse(value);
            }

            this.metrics.cacheMisses++;
            logger.debug('Cache miss', { key: fullKey });
            return null;

        } catch (error) {
            logger.error('Cache get error', { key, error: error.message });
            this.metrics.errors++;
            return null; // Fail gracefully
        }
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in seconds (optional)
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl = null) {
        try {
            if (!this.isReady()) {
                logger.warn('Redis not ready, skipping cache set');
                return false;
            }

            const fullKey = this._buildKey(key);
            const serialized = JSON.stringify(value);
            const ttlSeconds = ttl || this.ttl.dashboard;

            await this.client.setex(fullKey, ttlSeconds, serialized);
            
            logger.debug('Cache set', { key: fullKey, ttl: ttlSeconds });
            return true;

        } catch (error) {
            logger.error('Cache set error', { key, error: error.message });
            this.metrics.errors++;
            return false;
        }
    }

    /**
     * Delete key from cache
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} Success status
     */
    async del(key) {
        try {
            if (!this.isReady()) {
                logger.warn('Redis not ready, skipping cache delete');
                return false;
            }

            const fullKey = this._buildKey(key);
            await this.client.del(fullKey);
            
            logger.debug('Cache deleted', { key: fullKey });
            return true;

        } catch (error) {
            logger.error('Cache delete error', { key, error: error.message });
            this.metrics.errors++;
            return false;
        }
    }

    /**
     * Delete multiple keys matching pattern
     * @param {string} pattern - Key pattern (e.g., "dashboard:*")
     * @returns {Promise<number>} Number of keys deleted
     */
    async delPattern(pattern) {
        try {
            if (!this.isReady()) {
                logger.warn('Redis not ready, skipping pattern delete');
                return 0;
            }

            const fullPattern = this._buildKey(pattern);
            const keys = await this.client.keys(fullPattern);
            
            if (keys.length === 0) {
                return 0;
            }

            const deleted = await this.client.del(...keys);
            logger.info('Pattern deleted', { pattern: fullPattern, count: deleted });
            
            return deleted;

        } catch (error) {
            logger.error('Pattern delete error', { pattern, error: error.message });
            this.metrics.errors++;
            return 0;
        }
    }

    /**
     * Check if key exists
     * @param {string} key - Cache key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        try {
            if (!this.isReady()) {
                return false;
            }

            const fullKey = this._buildKey(key);
            const exists = await this.client.exists(fullKey);
            return exists === 1;

        } catch (error) {
            logger.error('Cache exists error', { key, error: error.message });
            return false;
        }
    }

    /**
     * Get remaining TTL for key
     * @param {string} key - Cache key
     * @returns {Promise<number>} TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
     */
    async ttlRemaining(key) {
        try {
            if (!this.isReady()) {
                return -2;
            }

            const fullKey = this._buildKey(key);
            return await this.client.ttl(fullKey);

        } catch (error) {
            logger.error('TTL check error', { key, error: error.message });
            return -2;
        }
    }

    /**
     * Increment counter
     * @param {string} key - Counter key
     * @param {number} amount - Amount to increment (default: 1)
     * @returns {Promise<number>} New value
     */
    async incr(key, amount = 1) {
        try {
            if (!this.isReady()) {
                return 0;
            }

            const fullKey = this._buildKey(key);
            return await this.client.incrby(fullKey, amount);

        } catch (error) {
            logger.error('Increment error', { key, error: error.message });
            return 0;
        }
    }

    // ============================================================================
    // PUB/SUB OPERATIONS
    // ============================================================================

    /**
     * Publish event to channel
     * @param {string} channel - Channel name
     * @param {Object} data - Event data
     * @returns {Promise<boolean>} Success status
     */
    async publish(channel, data) {
        try {
            if (!this.isReady()) {
                logger.warn('Redis not ready, skipping publish');
                return false;
            }

            const message = JSON.stringify({
                data,
                timestamp: new Date().toISOString(),
                source: 'redis-service'
            });

            await this.publisher.publish(channel, message);
            this.metrics.eventsPublished++;
            
            logger.debug('Event published', { channel, data });
            return true;

        } catch (error) {
            logger.error('Publish error', { channel, error: error.message });
            this.metrics.errors++;
            return false;
        }
    }

    /**
     * Subscribe to channel
     * @param {string} channel - Channel name
     * @param {Function} handler - Message handler function
     * @returns {Promise<void>}
     */
    async subscribe(channel, handler) {
        try {
            if (!this.isReady()) {
                throw new Error('Redis not ready for subscription');
            }

            await this.subscriber.subscribe(channel);
            
            this.subscriber.on('message', (receivedChannel, message) => {
                if (receivedChannel === channel) {
                    try {
                        this.metrics.eventsReceived++;
                        const parsed = JSON.parse(message);
                        handler(parsed.data, parsed);
                        
                        logger.debug('Event received', { channel, data: parsed.data });
                    } catch (error) {
                        logger.error('Message handler error', { 
                            channel, 
                            error: error.message 
                        });
                    }
                }
            });

            logger.info('Subscribed to channel', { channel });

        } catch (error) {
            logger.error('Subscribe error', { channel, error: error.message });
            throw error;
        }
    }

    /**
     * Subscribe to multiple channels
     * @param {Array<string>} channels - Channel names
     * @param {Function} handler - Message handler function
     * @returns {Promise<void>}
     */
    async subscribeMultiple(channels, handler) {
        try {
            if (!this.isReady()) {
                throw new Error('Redis not ready for subscription');
            }

            await this.subscriber.subscribe(...channels);
            
            this.subscriber.on('message', (receivedChannel, message) => {
                if (channels.includes(receivedChannel)) {
                    try {
                        this.metrics.eventsReceived++;
                        const parsed = JSON.parse(message);
                        handler(receivedChannel, parsed.data, parsed);
                        
                        logger.debug('Event received', { 
                            channel: receivedChannel, 
                            data: parsed.data 
                        });
                    } catch (error) {
                        logger.error('Message handler error', { 
                            channel: receivedChannel, 
                            error: error.message 
                        });
                    }
                }
            });

            logger.info('Subscribed to multiple channels', { channels });

        } catch (error) {
            logger.error('Subscribe multiple error', { error: error.message });
            throw error;
        }
    }

    /**
     * Unsubscribe from channel
     * @param {string} channel - Channel name
     * @returns {Promise<void>}
     */
    async unsubscribe(channel) {
        try {
            if (!this.isReady()) {
                return;
            }

            await this.subscriber.unsubscribe(channel);
            logger.info('Unsubscribed from channel', { channel });

        } catch (error) {
            logger.error('Unsubscribe error', { channel, error: error.message });
        }
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Build full cache key with prefix
     * @private
     */
    _buildKey(key) {
        return `${this.config.keyPrefix}${key}`;
    }

    /**
     * Flush all cache (USE WITH CAUTION)
     * @returns {Promise<boolean>}
     */
    async flushAll() {
        try {
            if (!this.isReady()) {
                return false;
            }

            await this.client.flushdb();
            logger.warn('Cache flushed');
            return true;

        } catch (error) {
            logger.error('Flush error', { error: error.message });
            return false;
        }
    }

    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        const hitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
            ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2)
            : 0;

        return {
            ...this.metrics,
            hitRate: `${hitRate}%`,
            uptime: process.uptime()
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            eventsPublished: 0,
            eventsReceived: 0,
            errors: 0,
        };
        logger.info('Metrics reset');
    }

    // ============================================================================
    // SHUTDOWN
    // ============================================================================

    /**
     * Graceful shutdown
     * @async
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            logger.info('Shutting down Redis connections');

            if (this.client) {
                await this.client.quit();
            }

            if (this.publisher) {
                await this.publisher.quit();
            }

            if (this.subscriber) {
                await this.subscriber.quit();
            }

            this.isConnected = false;
            this.emit('disconnected');
            
            logger.info('Redis connections closed');

        } catch (error) {
            logger.error('Shutdown error', { error: error.message });
            
            // Force disconnect if graceful shutdown fails
            this.client?.disconnect();
            this.publisher?.disconnect();
            this.subscriber?.disconnect();
        }
    }
}

// Export singleton instance
module.exports = new RedisService();