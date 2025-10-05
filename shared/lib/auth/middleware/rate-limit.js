/**
 * @fileoverview Enterprise Rate Limiting Middleware
 * @module shared/lib/auth/middleware/rate-limit
 * @description Advanced rate limiting with multiple strategies, distributed support, and dynamic limits
 * @version 2.0.0
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger');
const Redis = require('ioredis');

/**
 * Rate limit strategies
 * @enum {string}
 */
const RATE_LIMIT_STRATEGY = {
    FIXED_WINDOW: 'fixed_window',
    SLIDING_WINDOW: 'sliding_window',
    TOKEN_BUCKET: 'token_bucket',
    LEAKY_BUCKET: 'leaky_bucket'
};

/**
 * Rate limit key generators
 * @enum {string}
 */
const KEY_GENERATOR_TYPE = {
    IP: 'ip',
    USER: 'user',
    API_KEY: 'api_key',
    TENANT: 'tenant',
    COMBINED: 'combined',
    CUSTOM: 'custom'
};

/**
 * Rate limiting statistics
 * @type {Object}
 */
const rateLimitStats = {
    totalRequests: 0,
    limitedRequests: 0,
    bypassedRequests: 0,
    limitsByEndpoint: new Map(),
    limitsByUser: new Map(),
    limitsByIP: new Map()
};

/**
 * Redis client for distributed rate limiting
 * Initialize only if Redis is configured
 */
let redisClient = null;

/**
 * Initialize Redis client for distributed rate limiting
 * @returns {Object|null} Redis client or null
 */
function initializeRedis() {
    if (redisClient) {
        return redisClient;
    }

    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || 6379;
    const redisPassword = process.env.REDIS_PASSWORD;

    try {
        if (redisUrl) {
            redisClient = new Redis(redisUrl, {
                enableOfflineQueue: false,
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        logger.error('Redis connection failed after 3 retries');
                        return null;
                    }
                    return Math.min(times * 100, 2000);
                }
            });
        } else if (process.env.REDIS_ENABLED === 'true') {
            redisClient = new Redis({
                host: redisHost,
                port: redisPort,
                password: redisPassword,
                enableOfflineQueue: false,
                maxRetriesPerRequest: 3
            });
        }

        if (redisClient) {
            redisClient.on('error', (err) => {
                logger.error('Redis client error', { error: err.message });
            });

            redisClient.on('connect', () => {
                logger.info('Redis connected for rate limiting');
            });

            logger.info('Redis rate limiting initialized');
        }
    } catch (error) {
        logger.error('Failed to initialize Redis for rate limiting', {
            error: error.message
        });
        redisClient = null;
    }

    return redisClient;
}

/**
 * Get Redis store for rate limiter
 * @returns {Object|undefined} Redis store or undefined (falls back to memory)
 */
function getRedisStore() {
    const redis = initializeRedis();

    if (!redis) {
        logger.warn('Redis not available, using in-memory rate limiting');
        return undefined;
    }

    try {
        return new RedisStore({
            client: redis,
            prefix: 'rl:',
            sendCommand: (...args) => redis.call(...args)
        });
    } catch (error) {
        logger.error('Failed to create Redis store', { error: error.message });
        return undefined;
    }
}

/**
 * Generate rate limit key based on strategy
 * @param {Object} req - Express request object
 * @param {string} type - Key generator type
 * @param {Object} options - Additional options
 * @returns {string} Rate limit key
 */
function generateRateLimitKey(req, type, options = {}) {
    const parts = [];

    switch (type) {
        case KEY_GENERATOR_TYPE.IP:
            // Handle both IPv4 and IPv6
            const ip = req.ip || req.connection?.remoteAddress || 'unknown';
            // Normalize IPv6 addresses
            const normalizedIP = ip.includes('::ffff:')
                ? ip.split('::ffff:')[1]
                : ip;
            parts.push(`ip:${normalizedIP}`);
            break;

        case KEY_GENERATOR_TYPE.USER:
            if (req.user?.id) {
                parts.push(`user:${req.user.id}`);
            } else {
                // Fall back to IP if user not authenticated
                parts.push(`ip:${req.ip || 'unknown'}`);
            }
            break;

        case KEY_GENERATOR_TYPE.API_KEY:
            const apiKey = req.headers['x-api-key'] || req.query.apiKey;
            if (apiKey) {
                // Use hash of API key for privacy
                const crypto = require('crypto');
                const hashedKey = crypto.createHash('sha256')
                    .update(apiKey)
                    .digest('hex')
                    .substring(0, 16);
                parts.push(`apikey:${hashedKey}`);
            } else {
                parts.push(`ip:${req.ip || 'unknown'}`);
            }
            break;

        case KEY_GENERATOR_TYPE.TENANT:
            if (req.tenantId) {
                parts.push(`tenant:${req.tenantId}`);
            } else if (req.user?.tenantId) {
                parts.push(`tenant:${req.user.tenantId}`);
            } else {
                parts.push(`ip:${req.ip || 'unknown'}`);
            }
            break;

        case KEY_GENERATOR_TYPE.COMBINED:
            // Combine multiple factors
            if (req.user?.id) {
                parts.push(`user:${req.user.id}`);
            }
            if (req.tenantId) {
                parts.push(`tenant:${req.tenantId}`);
            }
            const combinedIP = req.ip || 'unknown';
            parts.push(`ip:${combinedIP}`);
            break;

        case KEY_GENERATOR_TYPE.CUSTOM:
            if (options.keyGenerator && typeof options.keyGenerator === 'function') {
                return options.keyGenerator(req);
            }
            parts.push(`ip:${req.ip || 'unknown'}`);
            break;

        default:
            parts.push(`ip:${req.ip || 'unknown'}`);
    }

    // Add endpoint identifier if specified
    if (options.includeEndpoint) {
        const endpoint = `${req.method}:${req.path}`;
        parts.push(`endpoint:${endpoint}`);
    }

    return parts.join('|');
}

/**
 * Get dynamic rate limit based on user tier/plan
 * @param {Object} req - Express request object
 * @param {Object} baseConfig - Base configuration
 * @returns {Object} Dynamic rate limit configuration
 */
function getDynamicRateLimit(req, baseConfig) {
    const config = { ...baseConfig };

    // Check for authenticated user with subscription/tier
    if (req.user) {
        const userTier = req.user.subscription?.tier ||
            req.user.plan ||
            'free';

        // Adjust limits based on tier
        const tierMultipliers = {
            free: 1,
            basic: 2,
            pro: 5,
            enterprise: 10,
            unlimited: 100
        };

        const multiplier = tierMultipliers[userTier.toLowerCase()] || 1;
        config.max = Math.floor(config.max * multiplier);

        logger.debug('Applied dynamic rate limit', {
            userId: req.user.id,
            tier: userTier,
            multiplier: multiplier,
            newMax: config.max
        });
    }

    // Check for API key with custom limits
    const apiKey = req.headers['x-api-key'];
    if (apiKey && req.apiKeyLimits) {
        config.max = req.apiKeyLimits.requestsPerWindow || config.max;
        config.windowMs = req.apiKeyLimits.windowMs || config.windowMs;
    }

    return config;
}

/**
 * Skip rate limiting based on conditions
 * @param {Object} req - Express request object
 * @param {Object} options - Skip options
 * @returns {boolean} True to skip rate limiting
 */
function shouldSkipRateLimit(req, options = {}) {
    // Skip for whitelisted IPs
    if (options.whitelist && Array.isArray(options.whitelist)) {
        const requestIP = req.ip || req.connection?.remoteAddress;
        if (options.whitelist.includes(requestIP)) {
            rateLimitStats.bypassedRequests++;
            logger.debug('Rate limit bypassed: Whitelisted IP', { ip: requestIP });
            return true;
        }
    }

    // Skip for internal requests
    if (options.skipInternal) {
        const isInternal = req.ip === '127.0.0.1' ||
            req.ip === '::1' ||
            req.ip?.startsWith('10.') ||
            req.ip?.startsWith('172.') ||
            req.ip?.startsWith('192.168.');

        if (isInternal) {
            rateLimitStats.bypassedRequests++;
            return true;
        }
    }

    // Skip for specific user roles
    if (options.skipRoles && req.user?.roles) {
        const hasSkipRole = options.skipRoles.some(role =>
            req.user.roles.includes(role)
        );

        if (hasSkipRole) {
            rateLimitStats.bypassedRequests++;
            logger.debug('Rate limit bypassed: User role', {
                userId: req.user.id,
                roles: req.user.roles
            });
            return true;
        }
    }

    // Skip for admin users
    if (options.skipAdmin && req.user?.role === 'admin') {
        rateLimitStats.bypassedRequests++;
        return true;
    }

    // Custom skip function
    if (options.customSkip && typeof options.customSkip === 'function') {
        const shouldSkip = options.customSkip(req);
        if (shouldSkip) {
            rateLimitStats.bypassedRequests++;
        }
        return shouldSkip;
    }

    return false;
}

/**
 * Handle rate limit exceeded
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Handler options
 */
function handleRateLimitExceeded(req, res, options) {
    rateLimitStats.limitedRequests++;
    rateLimitStats.totalRequests++;

    // Track by endpoint
    const endpoint = `${req.method}:${req.path}`;
    const endpointCount = rateLimitStats.limitsByEndpoint.get(endpoint) || 0;
    rateLimitStats.limitsByEndpoint.set(endpoint, endpointCount + 1);

    // Track by user
    if (req.user?.id) {
        const userCount = rateLimitStats.limitsByUser.get(req.user.id) || 0;
        rateLimitStats.limitsByUser.set(req.user.id, userCount + 1);
    }

    // Track by IP
    const ip = req.ip || 'unknown';
    const ipCount = rateLimitStats.limitsByIP.get(ip) || 0;
    rateLimitStats.limitsByIP.set(ip, ipCount + 1);

    logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        endpoint: endpoint,
        path: req.path,
        method: req.method,
        userAgent: req.get('user-agent')
    });

    // Custom handler
    if (options.customHandler && typeof options.customHandler === 'function') {
        return options.customHandler(req, res);
    }

    // Default response
    const retryAfter = res.getHeader('Retry-After') || 60;
    const response = {
        success: false,
        error: options.message || 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter,
        limit: res.getHeader('X-RateLimit-Limit'),
        remaining: 0,
        resetAt: new Date(Date.now() + (retryAfter * 1000)).toISOString()
    };

    res.status(429).json(response);
}

/**
 * Create rate limiter with advanced configuration
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
    const defaultConfig = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: 'Too many requests from this source',
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: KEY_GENERATOR_TYPE.IP,
        enableDynamic: false,
        enableRedis: process.env.REDIS_ENABLED === 'true',
        whitelist: [],
        skipInternal: process.env.NODE_ENV === 'development',
        skipRoles: [],
        skipAdmin: false
    };

    const config = { ...defaultConfig, ...options };

    // Base rate limiter configuration
    const limiterConfig = {
        windowMs: config.windowMs,
        max: async (req) => {
            if (config.enableDynamic) {
                const dynamicConfig = getDynamicRateLimit(req, { max: config.max });
                return dynamicConfig.max;
            }
            return config.max;
        },
        message: config.message,
        standardHeaders: config.standardHeaders,
        legacyHeaders: config.legacyHeaders,
        skipSuccessfulRequests: config.skipSuccessfulRequests,
        skipFailedRequests: config.skipFailedRequests,

        // Key generator
        keyGenerator: (req) => {
            return generateRateLimitKey(req, config.keyGenerator, {
                includeEndpoint: config.includeEndpoint,
                keyGenerator: config.customKeyGenerator
            });
        },

        // Skip function
        skip: (req) => {
            return shouldSkipRateLimit(req, {
                whitelist: config.whitelist,
                skipInternal: config.skipInternal,
                skipRoles: config.skipRoles,
                skipAdmin: config.skipAdmin,
                customSkip: config.customSkip
            });
        },

        // Handler for rate limit exceeded
        handler: (req, res) => {
            handleRateLimitExceeded(req, res, {
                message: config.message,
                customHandler: config.customHandler
            });
        },

        // Use Redis store if enabled
        store: config.enableRedis ? getRedisStore() : undefined,

        // Request property
        requestPropertyName: 'rateLimit'
    };

    // Validate configuration
    if (config.onLimitReached && typeof config.onLimitReached === 'function') {
        limiterConfig.onLimitReached = config.onLimitReached;
    }

    const limiter = rateLimit(limiterConfig);

    // Wrap limiter to track statistics
    return (req, res, next) => {
        rateLimitStats.totalRequests++;
        limiter(req, res, next);
    };
}

/**
 * Preset rate limiters for common use cases
 */
const presets = {
    /**
     * General API rate limiter
     */
    general: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: 'Too many requests. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.IP
    }),

    /**
     * Strict rate limiter for authentication endpoints
     */
    authentication: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        skipSuccessfulRequests: true,
        message: 'Too many authentication attempts. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.IP,
        includeEndpoint: true
    }),

    /**
     * Login rate limiter
     */
    login: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        skipSuccessfulRequests: true,
        message: 'Too many login attempts. Please wait before trying again.',
        keyGenerator: KEY_GENERATOR_TYPE.IP
    }),

    /**
     * Registration rate limiter
     */
    registration: createRateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
        message: 'Too many registration attempts. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.IP
    }),

    /**
     * Password reset rate limiter
     */
    passwordReset: createRateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
        message: 'Too many password reset requests. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.IP
    }),

    /**
     * Email verification rate limiter
     */
    emailVerification: createRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 5,
        message: 'Too many verification email requests.',
        keyGenerator: KEY_GENERATOR_TYPE.USER
    }),

    /**
     * MFA verification rate limiter
     */
    mfaVerification: createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10,
        message: 'Too many MFA verification attempts. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.COMBINED,
        skipSuccessfulRequests: true
    }),

    /**
     * API endpoint rate limiter
     */
    api: createRateLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 60,
        message: 'API rate limit exceeded. Please reduce request frequency.',
        keyGenerator: KEY_GENERATOR_TYPE.USER,
        enableDynamic: true,
        skipAdmin: true
    }),

    /**
     * File upload rate limiter
     */
    upload: createRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 20,
        message: 'Too many upload requests. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.USER
    }),

    /**
     * Search rate limiter
     */
    search: createRateLimiter({
        windowMs: 60 * 1000,
        max: 30,
        message: 'Too many search requests. Please slow down.',
        keyGenerator: KEY_GENERATOR_TYPE.USER
    }),

    /**
     * Export rate limiter
     */
    export: createRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 10,
        message: 'Too many export requests. Please try again later.',
        keyGenerator: KEY_GENERATOR_TYPE.USER
    }),

    /**
     * Webhook rate limiter
     */
    webhook: createRateLimiter({
        windowMs: 60 * 1000,
        max: 100,
        message: 'Webhook rate limit exceeded.',
        keyGenerator: KEY_GENERATOR_TYPE.API_KEY
    })
};

/**
 * Get rate limiting statistics
 * @returns {Object} Rate limiting statistics
 */
function getRateLimitStats() {
    return {
        totalRequests: rateLimitStats.totalRequests,
        limitedRequests: rateLimitStats.limitedRequests,
        bypassedRequests: rateLimitStats.bypassedRequests,
        limitRate: rateLimitStats.totalRequests > 0
            ? ((rateLimitStats.limitedRequests / rateLimitStats.totalRequests) * 100).toFixed(2) + '%'
            : '0%',
        topLimitedEndpoints: Array.from(rateLimitStats.limitsByEndpoint.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([endpoint, count]) => ({ endpoint, count })),
        topLimitedIPs: Array.from(rateLimitStats.limitsByIP.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ip, count]) => ({ ip, count })),
        redisEnabled: !!redisClient,
        timestamp: new Date()
    };
}

/**
 * Reset rate limiting statistics
 */
function resetRateLimitStats() {
    rateLimitStats.totalRequests = 0;
    rateLimitStats.limitedRequests = 0;
    rateLimitStats.bypassedRequests = 0;
    rateLimitStats.limitsByEndpoint.clear();
    rateLimitStats.limitsByUser.clear();
    rateLimitStats.limitsByIP.clear();

    logger.info('Rate limiting statistics reset');
}

/**
 * Close Redis connection
 */
async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis connection closed');
    }
}

module.exports = createRateLimiter;
module.exports.createRateLimiter = createRateLimiter;
module.exports.presets = presets;
module.exports.general = presets.general;
module.exports.authentication = presets.authentication;
module.exports.login = presets.login;
module.exports.registration = presets.registration;
module.exports.passwordReset = presets.passwordReset;
module.exports.emailVerification = presets.emailVerification;
module.exports.mfaVerification = presets.mfaVerification;
module.exports.api = presets.api;
module.exports.upload = presets.upload;
module.exports.search = presets.search;
module.exports.export = presets.export;
module.exports.webhook = presets.webhook;
module.exports.getRateLimitStats = getRateLimitStats;
module.exports.resetRateLimitStats = resetRateLimitStats;
module.exports.closeRedis = closeRedis;
module.exports.RATE_LIMIT_STRATEGY = RATE_LIMIT_STRATEGY;
module.exports.KEY_GENERATOR_TYPE = KEY_GENERATOR_TYPE;