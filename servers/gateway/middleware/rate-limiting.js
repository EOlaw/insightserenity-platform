'use strict';

/**
 * @fileoverview Rate Limiting Middleware - Comprehensive rate limiting and throttling
 * @module servers/gateway/middleware/rate-limiting
 * @requires express-rate-limit
 * @requires rate-limit-redis
 * @requires express-slow-down
 * @requires bottleneck
 * @requires events
 */

const { EventEmitter } = require('events');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const Bottleneck = require('bottleneck');
const crypto = require('crypto');

// Handle different versions of rate-limit-redis
let RedisStore;
try {
    // Try newer version format
    RedisStore = require('rate-limit-redis').default;
} catch (error) {
    try {
        // Try named export
        const { RedisStore: NamedRedisStore } = require('rate-limit-redis');
        RedisStore = NamedRedisStore;
    } catch (error2) {
        // Fallback to old format
        RedisStore = require('rate-limit-redis');
    }
}

/**
 * RateLimitingMiddleware class provides comprehensive rate limiting and throttling
 * capabilities for the API Gateway. It implements multiple rate limiting strategies
 * including fixed window, sliding window, token bucket, and leaky bucket algorithms.
 * The middleware supports user-based, IP-based, and API key-based rate limiting with
 * dynamic limits, distributed rate limiting across multiple instances, and advanced
 * features like burst handling, gradual backoff, and quota management.
 * 
 * @class RateLimitingMiddleware
 * @extends EventEmitter
 */
class RateLimitingMiddleware extends EventEmitter {
    /**
     * Creates an instance of RateLimitingMiddleware
     * @constructor
     * @param {Object} config - Rate limiting configuration
     * @param {CacheManager} cacheManager - Cache manager for distributed rate limiting
     * @param {MetricsCollector} metricsCollector - Metrics collector for monitoring
     * @param {Logger} logger - Logger instance
     */
    constructor(config, cacheManager, metricsCollector, logger) {
        super();
        this.config = config || {};
        this.cacheManager = cacheManager;
        this.metricsCollector = metricsCollector;
        this.logger = logger;
        this.isInitialized = false;

        // Rate limiters storage
        this.rateLimiters = new Map();
        this.slowDownLimiters = new Map();
        this.bottlenecks = new Map();

        // Rate limiting strategies
        this.strategies = {
            'fixed-window': this.createFixedWindowLimiter.bind(this),
            'sliding-window': this.createSlidingWindowLimiter.bind(this),
            'token-bucket': this.createTokenBucketLimiter.bind(this),
            'leaky-bucket': this.createLeakyBucketLimiter.bind(this),
            'adaptive': this.createAdaptiveLimiter.bind(this)
        };

        // Default configuration
        this.defaultConfig = {
            strategy: config.strategy || 'sliding-window',
            windowMs: config.global?.windowMs || 60000,
            max: config.global?.max || 100,
            message: config.global?.message || 'Too many requests, please try again later',
            statusCode: config.global?.statusCode || 429,
            headers: config.global?.headers !== false,
            keyGenerator: config.global?.keyGenerator || this.defaultKeyGenerator.bind(this),
            skip: config.global?.skip || (() => false),
            skipSuccessfulRequests: config.global?.skipSuccessfulRequests || false,
            skipFailedRequests: config.global?.skipFailedRequests || false,
            ...config.global
        };

        // User tier configurations
        this.tierConfigs = {
            free: {
                windowMs: 60000,
                max: 10,
                daily: 1000,
                monthly: 10000,
                burst: 5
            },
            basic: {
                windowMs: 60000,
                max: 60,
                daily: 10000,
                monthly: 100000,
                burst: 20
            },
            premium: {
                windowMs: 60000,
                max: 200,
                daily: 50000,
                monthly: 1000000,
                burst: 50
            },
            enterprise: {
                windowMs: 60000,
                max: 1000,
                daily: -1, // Unlimited
                monthly: -1, // Unlimited
                burst: 200
            },
            ...config.tiers
        };

        // Path-specific configurations
        this.pathConfigs = config.paths || {};

        // Dynamic rate limiting
        this.dynamicLimiting = {
            enabled: config.dynamic?.enabled || false,
            algorithm: config.dynamic?.algorithm || 'cpu-based',
            minRate: config.dynamic?.minRate || 10,
            maxRate: config.dynamic?.maxRate || 1000,
            targetCpu: config.dynamic?.targetCpu || 70,
            adjustmentFactor: config.dynamic?.adjustmentFactor || 0.1
        };

        // Quota management
        this.quotaManagement = {
            enabled: config.quota?.enabled || false,
            storage: config.quota?.storage || 'redis',
            resetInterval: config.quota?.resetInterval || 'daily',
            enforcement: config.quota?.enforcement || 'hard'
        };

        // Burst handling
        this.burstHandling = {
            enabled: config.burst?.enabled !== false,
            multiplier: config.burst?.multiplier || 2,
            duration: config.burst?.duration || 10000,
            cooldown: config.burst?.cooldown || 60000
        };

        // Gradual backoff
        this.backoffConfig = {
            enabled: config.backoff?.enabled || false,
            delayAfter: config.backoff?.delayAfter || 10,
            delayMs: config.backoff?.delayMs || 100,
            maxDelayMs: config.backoff?.maxDelayMs || 5000
        };

        // Distributed rate limiting
        this.distributedConfig = {
            enabled: config.distributed?.enabled !== false,
            prefix: config.distributed?.prefix || 'ratelimit:',
            client: null
        };

        // Rate limit bypass tokens
        this.bypassTokens = new Set(config.bypassTokens || []);

        // Statistics
        this.statistics = {
            totalRequests: 0,
            limitedRequests: 0,
            throttledRequests: 0,
            bypassedRequests: 0,
            quotaExceeded: 0,
            burstActivations: 0,
            averageRequestRate: 0,
            peakRequestRate: 0,
            limitsByTier: {
                free: 0,
                basic: 0,
                premium: 0,
                enterprise: 0
            }
        };

        // Request tracking for analytics
        this.requestTracking = new Map();
        this.trackingWindow = 60000; // 1 minute

        // Quota storage
        this.quotaStorage = new Map();

        // Burst state tracking
        this.burstStates = new Map();

        // Dynamic rate adjustment
        this.currentRateLimits = new Map();
        this.adjustmentInterval = null;

        // Monitoring intervals
        this.monitoringInterval = null;
        this.cleanupInterval = null;
    }

    /**
     * Initializes the rate limiting middleware
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Rate limiting middleware already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Rate Limiting Middleware');

            // Setup distributed rate limiting
            if (this.distributedConfig.enabled) {
                await this.setupDistributedRateLimiting();
            }

            // Initialize default rate limiters
            await this.initializeDefaultLimiters();

            // Initialize path-specific limiters
            this.initializePathLimiters();

            // Setup monitoring
            this.startMonitoring();

            // Setup cleanup
            this.startCleanup();

            // Setup dynamic adjustment
            if (this.dynamicLimiting.enabled) {
                this.startDynamicAdjustment();
            }

            this.isInitialized = true;
            this.emit('ratelimit:initialized');

            this.log('info', 'Rate Limiting Middleware initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Rate Limiting Middleware', error);
            throw error;
        }
    }

    /**
     * Sets up distributed rate limiting
     * @private
     * @async
     */
    async setupDistributedRateLimiting() {
        if (this.cacheManager && this.cacheManager.redisClient) {
            this.distributedConfig.client = this.cacheManager.redisClient;
            this.log('info', 'Distributed rate limiting enabled with Redis');
        } else {
            this.log('warn', 'Redis not available, falling back to local rate limiting');
            this.distributedConfig.enabled = false;
        }
    }

    /**
     * Initializes default rate limiters
     * @private
     * @async
     */
    async initializeDefaultLimiters() {
        // Global rate limiter
        const globalLimiter = await this.createRateLimiter('global', this.defaultConfig);
        this.rateLimiters.set('global', globalLimiter);

        // Create tier-specific limiters
        for (const [tier, config] of Object.entries(this.tierConfigs)) {
            const tierLimiter = await this.createRateLimiter(`tier:${tier}`, config);
            this.rateLimiters.set(`tier:${tier}`, tierLimiter);
        }

        // Create slow down limiter for gradual backoff
        if (this.backoffConfig.enabled) {
            const slowDownLimiter = this.createSlowDownLimiter('global', this.backoffConfig);
            this.slowDownLimiters.set('global', slowDownLimiter);
        }

        this.log('info', 'Default rate limiters initialized');
    }

    /**
     * Initializes path-specific limiters
     * @private
     */
    initializePathLimiters() {
        for (const [path, config] of Object.entries(this.pathConfigs)) {
            const pathLimiter = this.createRateLimiter(`path:${path}`, config);
            this.rateLimiters.set(`path:${path}`, pathLimiter);

            if (config.slowDown) {
                const slowDownLimiter = this.createSlowDownLimiter(`path:${path}`, config.slowDown);
                this.slowDownLimiters.set(`path:${path}`, slowDownLimiter);
            }
        }

        this.log('info', 'Path-specific rate limiters initialized');
    }

    /**
     * Creates a rate limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Rate limiter instance
     */
    createRateLimiter(name, config) {
        const strategy = config.strategy || this.defaultConfig.strategy;
        const createLimiter = this.strategies[strategy];

        if (!createLimiter) {
            throw new Error(`Unknown rate limiting strategy: ${strategy}`);
        }

        return createLimiter(name, config);
    }

    /**
     * Creates fixed window rate limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Rate limiter
     */
    createFixedWindowLimiter(name, config) {
        const options = {
            windowMs: config.windowMs || this.defaultConfig.windowMs,
            max: config.max || this.defaultConfig.max,
            message: config.message || this.defaultConfig.message,
            statusCode: config.statusCode || this.defaultConfig.statusCode,
            headers: config.headers !== false,
            keyGenerator: config.keyGenerator || this.defaultKeyGenerator.bind(this),
            skip: config.skip || (() => false),
            skipSuccessfulRequests: config.skipSuccessfulRequests || false,
            skipFailedRequests: config.skipFailedRequests || false,
            handler: (req, res) => this.handleRateLimitExceeded(req, res, name)
        };

        // Use Redis store if distributed and available
        if (this.distributedConfig.enabled && this.distributedConfig.client) {
            try {
                options.store = new RedisStore({
                    sendCommand: (...args) => this.distributedConfig.client.call(...args),
                    prefix: `${this.distributedConfig.prefix}${name}:`
                });
            } catch (error) {
                this.log('warn', `Failed to create Redis store for ${name}, falling back to memory store`, error);
                // Will use default memory store if Redis fails
            }
        }

        return rateLimit(options);
    }

    /**
     * Creates sliding window rate limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Rate limiter
     */
    createSlidingWindowLimiter(name, config) {
        // Similar to fixed window but with sliding window logic
        const limiter = this.createFixedWindowLimiter(name, config);

        // Add sliding window tracking
        const originalHandler = limiter;
        return async (req, res, next) => {
            const key = this.generateKey(req, config);
            const window = await this.getSlidingWindow(key, config.windowMs);

            if (window.count >= config.max) {
                return this.handleRateLimitExceeded(req, res, name);
            }

            await this.updateSlidingWindow(key, config.windowMs);
            originalHandler(req, res, next);
        };
    }

    /**
     * Creates token bucket rate limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Rate limiter
     */
    createTokenBucketLimiter(name, config) {
        const bottleneck = new Bottleneck({
            reservoir: config.max || 100,
            reservoirRefreshAmount: config.max || 100,
            reservoirRefreshInterval: config.windowMs || 60000,
            maxConcurrent: config.maxConcurrent || 10,
            minTime: config.minTime || 0
        });

        this.bottlenecks.set(name, bottleneck);

        return async (req, res, next) => {
            try {
                await bottleneck.schedule(() => Promise.resolve());
                next();
            } catch (error) {
                this.handleRateLimitExceeded(req, res, name);
            }
        };
    }

    /**
     * Creates leaky bucket rate limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Rate limiter
     */
    createLeakyBucketLimiter(name, config) {
        const bottleneck = new Bottleneck({
            maxConcurrent: 1,
            minTime: config.windowMs / config.max,
            highWater: config.max,
            strategy: Bottleneck.strategy.LEAK
        });

        this.bottlenecks.set(name, bottleneck);

        return async (req, res, next) => {
            try {
                await bottleneck.schedule(() => Promise.resolve());
                next();
            } catch (error) {
                this.handleRateLimitExceeded(req, res, name);
            }
        };
    }

    /**
     * Creates adaptive rate limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Rate limiter
     */
    createAdaptiveLimiter(name, config) {
        // Start with base limiter
        let currentLimit = config.max || this.defaultConfig.max;
        this.currentRateLimits.set(name, currentLimit);

        return async (req, res, next) => {
            const key = this.generateKey(req, config);
            const limit = this.currentRateLimits.get(name) || currentLimit;

            // Check current usage
            const usage = await this.getUsage(key);

            if (usage >= limit) {
                return this.handleRateLimitExceeded(req, res, name);
            }

            await this.incrementUsage(key);

            // Add rate limit headers
            res.setHeader('X-RateLimit-Limit', limit);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - usage - 1));
            res.setHeader('X-RateLimit-Reset', new Date(Date.now() + config.windowMs).toISOString());

            next();
        };
    }

    /**
     * Creates slow down limiter
     * @private
     * @param {string} name - Limiter name
     * @param {Object} config - Limiter configuration
     * @returns {Object} Slow down limiter
     */
    createSlowDownLimiter(name, config) {
        const options = {
            windowMs: config.windowMs || 60000,
            delayAfter: config.delayAfter || 10,
            delayMs: config.delayMs || 100,
            maxDelayMs: config.maxDelayMs || 5000,
            keyGenerator: config.keyGenerator || this.defaultKeyGenerator.bind(this),
            skip: config.skip || (() => false)
        };

        // Use Redis store if distributed
        if (this.distributedConfig.enabled && this.distributedConfig.client) {
            options.store = new RedisStore({
                client: this.distributedConfig.client,
                prefix: `${this.distributedConfig.prefix}slowdown:${name}:`
            });
        }

        return slowDown(options);
    }

    /**
     * Apply rate limiting middleware
     * @param {Object} config - Rate limit configuration
     * @returns {Function} Express middleware function
     */
    apply(config = {}) {
        return async (req, res, next) => {
            const startTime = Date.now();

            try {
                this.statistics.totalRequests++;

                // Check bypass token
                if (this.checkBypassToken(req)) {
                    this.statistics.bypassedRequests++;
                    return next();
                }

                // Get user tier
                const tier = this.getUserTier(req);

                // Check quota if enabled
                if (this.quotaManagement.enabled) {
                    const quotaExceeded = await this.checkQuota(req, tier);
                    if (quotaExceeded) {
                        this.statistics.quotaExceeded++;
                        return this.handleQuotaExceeded(req, res);
                    }
                }

                // Get applicable rate limiter
                const limiter = this.getRateLimiter(req, tier);

                // Check burst mode
                if (this.burstHandling.enabled) {
                    const burstActive = await this.checkBurstMode(req, tier);
                    if (burstActive) {
                        this.statistics.burstActivations++;
                        // Apply burst multiplier
                        config = { ...config, max: config.max * this.burstHandling.multiplier };
                    }
                }

                // Apply rate limiting
                limiter(req, res, (err) => {
                    if (err) {
                        return next(err);
                    }

                    // Apply slow down if configured
                    const slowDownLimiter = this.getSlowDownLimiter(req);
                    if (slowDownLimiter) {
                        slowDownLimiter(req, res, next);
                    } else {
                        next();
                    }
                });

                // Track request
                this.trackRequest(req, tier);

                // Record metrics
                const duration = Date.now() - startTime;
                this.emit('ratelimit:checked', { duration, tier, limited: false });

            } catch (error) {
                this.log('error', 'Rate limiting error', error);
                next(error);
            }
        };
    }

    /**
     * Gets user tier from request
     * @private
     * @param {Object} req - Request object
     * @returns {string} User tier
     */
    getUserTier(req) {
        if (req.user) {
            return req.user.tier || req.user.plan || 'free';
        }

        // Check API key tier
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            // Would look up API key tier from database
            return 'basic';
        }

        return 'free';
    }

    /**
     * Gets applicable rate limiter
     * @private
     * @param {Object} req - Request object
     * @param {string} tier - User tier
     * @returns {Function} Rate limiter
     */
    getRateLimiter(req, tier) {
        // Check for path-specific limiter
        const pathLimiter = this.getPathLimiter(req.path);
        if (pathLimiter) {
            return pathLimiter;
        }

        // Check for tier-specific limiter
        const tierLimiter = this.rateLimiters.get(`tier:${tier}`);
        if (tierLimiter) {
            return tierLimiter;
        }

        // Return global limiter
        return this.rateLimiters.get('global') || ((req, res, next) => next());
    }

    /**
     * Gets path-specific limiter
     * @private
     * @param {string} path - Request path
     * @returns {Function|null} Rate limiter or null
     */
    getPathLimiter(path) {
        for (const [pattern, limiter] of this.rateLimiters) {
            if (pattern.startsWith('path:')) {
                const pathPattern = pattern.substring(5);
                if (path === pathPattern || path.startsWith(pathPattern)) {
                    return limiter;
                }
            }
        }
        return null;
    }

    /**
     * Gets slow down limiter
     * @private
     * @param {Object} req - Request object
     * @returns {Function|null} Slow down limiter or null
     */
    getSlowDownLimiter(req) {
        // Check for path-specific slow down
        for (const [pattern, limiter] of this.slowDownLimiters) {
            if (pattern.startsWith('path:')) {
                const pathPattern = pattern.substring(5);
                if (req.path === pathPattern || req.path.startsWith(pathPattern)) {
                    return limiter;
                }
            }
        }

        return this.slowDownLimiters.get('global') || null;
    }

    /**
     * Checks bypass token
     * @private
     * @param {Object} req - Request object
     * @returns {boolean} Bypass status
     */
    checkBypassToken(req) {
        const token = req.headers['x-ratelimit-bypass'];
        return token && this.bypassTokens.has(token);
    }

    /**
     * Checks quota
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {string} tier - User tier
     * @returns {Promise<boolean>} Quota exceeded status
     */
    async checkQuota(req, tier) {
        const userId = req.user?.id || req.ip;
        const tierConfig = this.tierConfigs[tier];

        if (!tierConfig.daily || tierConfig.daily === -1) {
            return false;
        }

        const quotaKey = `quota:${userId}:daily`;
        const usage = await this.getQuotaUsage(quotaKey);

        return usage >= tierConfig.daily;
    }

    /**
     * Gets quota usage
     * @private
     * @async
     * @param {string} key - Quota key
     * @returns {Promise<number>} Usage count
     */
    async getQuotaUsage(key) {
        if (this.distributedConfig.enabled && this.cacheManager) {
            const usage = await this.cacheManager.get(key);
            return parseInt(usage) || 0;
        }

        return this.quotaStorage.get(key) || 0;
    }

    /**
     * Increments quota usage
     * @private
     * @async
     * @param {string} key - Quota key
     */
    async incrementQuotaUsage(key) {
        if (this.distributedConfig.enabled && this.cacheManager) {
            const current = await this.getQuotaUsage(key);
            await this.cacheManager.set(key, current + 1, 86400); // 24 hours
        } else {
            const current = this.quotaStorage.get(key) || 0;
            this.quotaStorage.set(key, current + 1);
        }
    }

    /**
     * Checks burst mode
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {string} tier - User tier
     * @returns {Promise<boolean>} Burst mode status
     */
    async checkBurstMode(req, tier) {
        const userId = req.user?.id || req.ip;
        const burstKey = `burst:${userId}`;

        const burstState = this.burstStates.get(burstKey);

        if (!burstState) {
            // Not in burst mode
            return false;
        }

        const now = Date.now();

        // Check if burst has expired
        if (now > burstState.expiresAt) {
            this.burstStates.delete(burstKey);
            return false;
        }

        // Check if in cooldown
        if (now < burstState.cooldownUntil) {
            return false;
        }

        return true;
    }

    /**
     * Activates burst mode
     * @private
     * @param {Object} req - Request object
     */
    activateBurstMode(req) {
        const userId = req.user?.id || req.ip;
        const burstKey = `burst:${userId}`;

        const now = Date.now();

        this.burstStates.set(burstKey, {
            activatedAt: now,
            expiresAt: now + this.burstHandling.duration,
            cooldownUntil: now + this.burstHandling.duration + this.burstHandling.cooldown
        });
    }

    /**
     * Tracks request for analytics
     * @private
     * @param {Object} req - Request object
     * @param {string} tier - User tier
     */
    trackRequest(req, tier) {
        const now = Date.now();
        const userId = req.user?.id || req.ip;
        const trackingKey = `tracking:${userId}`;

        let tracking = this.requestTracking.get(trackingKey);
        if (!tracking) {
            tracking = {
                requests: [],
                tier
            };
            this.requestTracking.set(trackingKey, tracking);
        }

        // Add current request
        tracking.requests.push(now);

        // Clean old requests
        const cutoff = now - this.trackingWindow;
        tracking.requests = tracking.requests.filter(time => time > cutoff);

        // Calculate request rate
        const requestRate = (tracking.requests.length / this.trackingWindow) * 1000;

        // Update statistics
        this.statistics.averageRequestRate =
            (this.statistics.averageRequestRate + requestRate) / 2;

        if (requestRate > this.statistics.peakRequestRate) {
            this.statistics.peakRequestRate = requestRate;
        }
    }

    /**
     * Default key generator
     * @private
     * @param {Object} req - Request object
     * @returns {string} Rate limit key
     */
    defaultKeyGenerator(req) {
        if (req.user) {
            return `user:${req.user.id}`;
        }

        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            return `apikey:${apiKey}`;
        }

        return `ip:${req.ip}`;
    }

    /**
     * Generates rate limit key
     * @private
     * @param {Object} req - Request object
     * @param {Object} config - Configuration
     * @returns {string} Rate limit key
     */
    generateKey(req, config) {
        const keyGenerator = config.keyGenerator || this.defaultKeyGenerator;
        return keyGenerator(req);
    }

    /**
     * Gets sliding window data
     * @private
     * @async
     * @param {string} key - Window key
     * @param {number} windowMs - Window duration
     * @returns {Promise<Object>} Window data
     */
    async getSlidingWindow(key, windowMs) {
        const now = Date.now();
        const windowStart = now - windowMs;

        if (this.distributedConfig.enabled && this.cacheManager) {
            const data = await this.cacheManager.get(`sliding:${key}`);
            const requests = data ? JSON.parse(data) : [];
            const validRequests = requests.filter(time => time > windowStart);

            return {
                count: validRequests.length,
                requests: validRequests
            };
        }

        // Local storage fallback
        const requests = this.getLocalSlidingWindow(key);
        const validRequests = requests.filter(time => time > windowStart);

        return {
            count: validRequests.length,
            requests: validRequests
        };
    }

    /**
     * Updates sliding window
     * @private
     * @async
     * @param {string} key - Window key
     * @param {number} windowMs - Window duration
     */
    async updateSlidingWindow(key, windowMs) {
        const now = Date.now();
        const window = await this.getSlidingWindow(key, windowMs);

        window.requests.push(now);

        if (this.distributedConfig.enabled && this.cacheManager) {
            await this.cacheManager.set(`sliding:${key}`, JSON.stringify(window.requests), windowMs / 1000);
        } else {
            this.setLocalSlidingWindow(key, window.requests);
        }
    }

    /**
     * Gets local sliding window
     * @private
     * @param {string} key - Window key
     * @returns {Array} Request times
     */
    getLocalSlidingWindow(key) {
        // Implementation for local storage
        return [];
    }

    /**
     * Sets local sliding window
     * @private
     * @param {string} key - Window key
     * @param {Array} requests - Request times
     */
    setLocalSlidingWindow(key, requests) {
        // Implementation for local storage
    }

    /**
     * Gets usage count
     * @private
     * @async
     * @param {string} key - Usage key
     * @returns {Promise<number>} Usage count
     */
    async getUsage(key) {
        if (this.distributedConfig.enabled && this.cacheManager) {
            const usage = await this.cacheManager.get(`usage:${key}`);
            return parseInt(usage) || 0;
        }

        return 0;
    }

    /**
     * Increments usage count
     * @private
     * @async
     * @param {string} key - Usage key
     */
    async incrementUsage(key) {
        if (this.distributedConfig.enabled && this.cacheManager) {
            const current = await this.getUsage(key);
            await this.cacheManager.set(`usage:${key}`, current + 1, 60);
        }
    }

    /**
     * Handles rate limit exceeded
     * @private
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {string} limiterName - Limiter name
     */
    handleRateLimitExceeded(req, res, limiterName) {
        this.statistics.limitedRequests++;

        const tier = this.getUserTier(req);
        this.statistics.limitsByTier[tier] = (this.statistics.limitsByTier[tier] || 0) + 1;

        this.log('warn', 'Rate limit exceeded', {
            limiter: limiterName,
            user: req.user?.id,
            ip: req.ip,
            path: req.path,
            tier
        });

        this.emit('ratelimit:exceeded', {
            limiter: limiterName,
            user: req.user?.id,
            ip: req.ip,
            path: req.path,
            tier
        });

        const message = this.defaultConfig.message;
        const retryAfter = Math.ceil(this.defaultConfig.windowMs / 1000);

        res.status(429)
            .set('Retry-After', retryAfter)
            .json({
                error: 'Too Many Requests',
                message,
                retryAfter
            });
    }

    /**
     * Handles quota exceeded
     * @private
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    handleQuotaExceeded(req, res) {
        this.log('warn', 'Quota exceeded', {
            user: req.user?.id,
            ip: req.ip,
            path: req.path
        });

        this.emit('quota:exceeded', {
            user: req.user?.id,
            ip: req.ip,
            path: req.path
        });

        res.status(429).json({
            error: 'Quota Exceeded',
            message: 'Your daily/monthly quota has been exceeded',
            upgradeUrl: '/pricing'
        });
    }

    /**
     * Starts monitoring
     * @private
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.emit('ratelimit:metrics', this.getStatistics());

            if (this.metricsCollector) {
                this.recordMetrics();
            }
        }, 60000); // Every minute

        this.log('info', 'Rate limit monitoring started');
    }

    /**
     * Starts cleanup
     * @private
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();

            // Clean request tracking
            for (const [key, tracking] of this.requestTracking) {
                const cutoff = now - this.trackingWindow;
                tracking.requests = tracking.requests.filter(time => time > cutoff);

                if (tracking.requests.length === 0) {
                    this.requestTracking.delete(key);
                }
            }

            // Clean burst states
            for (const [key, state] of this.burstStates) {
                if (now > state.cooldownUntil) {
                    this.burstStates.delete(key);
                }
            }

            // Clean quota storage (local)
            if (!this.distributedConfig.enabled) {
                // Reset daily quotas at midnight
                const hour = new Date().getHours();
                if (hour === 0) {
                    this.quotaStorage.clear();
                }
            }
        }, 60000); // Every minute

        this.log('info', 'Rate limit cleanup started');
    }

    /**
     * Starts dynamic adjustment
     * @private
     */
    startDynamicAdjustment() {
        this.adjustmentInterval = setInterval(async () => {
            if (this.dynamicLimiting.algorithm === 'cpu-based') {
                await this.adjustBasedOnCpu();
            } else if (this.dynamicLimiting.algorithm === 'load-based') {
                await this.adjustBasedOnLoad();
            } else if (this.dynamicLimiting.algorithm === 'error-based') {
                await this.adjustBasedOnErrors();
            }
        }, 30000); // Every 30 seconds

        this.log('info', 'Dynamic rate adjustment started');
    }

    /**
     * Adjusts rate limits based on CPU usage
     * @private
     * @async
     */
    async adjustBasedOnCpu() {
        const os = require('os');
        const cpus = os.cpus();

        // Calculate CPU usage
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

        // Adjust limits based on CPU usage
        for (const [name, currentLimit] of this.currentRateLimits) {
            let newLimit = currentLimit;

            if (cpuUsage > this.dynamicLimiting.targetCpu) {
                // Reduce limit
                newLimit = Math.max(
                    this.dynamicLimiting.minRate,
                    currentLimit * (1 - this.dynamicLimiting.adjustmentFactor)
                );
            } else if (cpuUsage < this.dynamicLimiting.targetCpu - 10) {
                // Increase limit
                newLimit = Math.min(
                    this.dynamicLimiting.maxRate,
                    currentLimit * (1 + this.dynamicLimiting.adjustmentFactor)
                );
            }

            if (newLimit !== currentLimit) {
                this.currentRateLimits.set(name, Math.round(newLimit));
                this.log('info', `Adjusted rate limit for ${name}: ${currentLimit} -> ${newLimit}`);
            }
        }
    }

    /**
     * Adjusts rate limits based on load
     * @private
     * @async
     */
    async adjustBasedOnLoad() {
        // Implementation for load-based adjustment
        const avgRequestRate = this.statistics.averageRequestRate;
        const targetRate = this.dynamicLimiting.maxRate * 0.7;

        if (avgRequestRate > targetRate) {
            // Reduce limits
            for (const [name, currentLimit] of this.currentRateLimits) {
                const newLimit = Math.max(
                    this.dynamicLimiting.minRate,
                    currentLimit * 0.9
                );
                this.currentRateLimits.set(name, Math.round(newLimit));
            }
        }
    }

    /**
     * Adjusts rate limits based on error rate
     * @private
     * @async
     */
    async adjustBasedOnErrors() {
        // Implementation for error-based adjustment
        const errorRate = this.statistics.limitedRequests / this.statistics.totalRequests;

        if (errorRate > 0.1) {
            // Too many rate limit errors, increase limits slightly
            for (const [name, currentLimit] of this.currentRateLimits) {
                const newLimit = Math.min(
                    this.dynamicLimiting.maxRate,
                    currentLimit * 1.1
                );
                this.currentRateLimits.set(name, Math.round(newLimit));
            }
        }
    }

    /**
     * Collects metrics
     * @private
     */
    collectMetrics() {
        // Update request rates
        let totalRate = 0;
        let count = 0;

        for (const tracking of this.requestTracking.values()) {
            const rate = (tracking.requests.length / this.trackingWindow) * 1000;
            totalRate += rate;
            count++;
        }

        if (count > 0) {
            this.statistics.averageRequestRate = totalRate / count;
        }
    }

    /**
     * Records metrics
     * @private
     */
    recordMetrics() {
        if (!this.metricsCollector) return;

        this.metricsCollector.setGauge('ratelimit_total_requests', this.statistics.totalRequests);
        this.metricsCollector.setGauge('ratelimit_limited_requests', this.statistics.limitedRequests);
        this.metricsCollector.setGauge('ratelimit_throttled_requests', this.statistics.throttledRequests);
        this.metricsCollector.setGauge('ratelimit_bypassed_requests', this.statistics.bypassedRequests);
        this.metricsCollector.setGauge('ratelimit_quota_exceeded', this.statistics.quotaExceeded);
        this.metricsCollector.setGauge('ratelimit_burst_activations', this.statistics.burstActivations);
        this.metricsCollector.setGauge('ratelimit_average_request_rate', this.statistics.averageRequestRate);
        this.metricsCollector.setGauge('ratelimit_peak_request_rate', this.statistics.peakRequestRate);

        // Record tier-specific metrics
        for (const [tier, count] of Object.entries(this.statistics.limitsByTier)) {
            this.metricsCollector.setGauge('ratelimit_limits_by_tier', count, { tier });
        }
    }

    /**
     * Gets statistics
     * @returns {Object} Rate limiting statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            activeLimiters: this.rateLimiters.size,
            activeSlowDowns: this.slowDownLimiters.size,
            activeBottlenecks: this.bottlenecks.size,
            trackedUsers: this.requestTracking.size,
            burstStates: this.burstStates.size,
            currentLimits: Object.fromEntries(this.currentRateLimits)
        };
    }

    /**
     * Resets statistics
     */
    resetStatistics() {
        this.statistics = {
            totalRequests: 0,
            limitedRequests: 0,
            throttledRequests: 0,
            bypassedRequests: 0,
            quotaExceeded: 0,
            burstActivations: 0,
            averageRequestRate: 0,
            peakRequestRate: 0,
            limitsByTier: {
                free: 0,
                basic: 0,
                premium: 0,
                enterprise: 0
            }
        };
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger) {
            this.logger[level](message, data);
        } else {
            console[level](message, data);
        }
    }

    /**
     * Cleans up resources
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.log('info', 'Cleaning up Rate Limiting Middleware');

        // Clear intervals
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.adjustmentInterval) {
            clearInterval(this.adjustmentInterval);
        }

        // Clear bottlenecks
        for (const bottleneck of this.bottlenecks.values()) {
            await bottleneck.stop();
        }

        // Clear maps
        this.rateLimiters.clear();
        this.slowDownLimiters.clear();
        this.bottlenecks.clear();
        this.requestTracking.clear();
        this.quotaStorage.clear();
        this.burstStates.clear();
        this.currentRateLimits.clear();

        this.isInitialized = false;
        this.emit('ratelimit:cleanup');
    }
}

module.exports = { RateLimitingMiddleware };