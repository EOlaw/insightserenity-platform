/**
 * @fileoverview Rate Limiter Middleware
 * @module shared/lib/middleware/rate-limiter
 * @description Rate limiting middleware for API protection against abuse
 */

const { AppError } = require('../utils/app-error');
const { createLogger } = require('../utils/logger');

const logger = createLogger({ serviceName: 'rate-limiter' });

/**
 * In-memory store for rate limiting
 * In production, use Redis or similar for distributed rate limiting
 */
class MemoryStore {
    constructor() {
        this.hits = new Map();
        this.resetTimes = new Map();
        
        // Cleanup expired entries every minute
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    /**
     * Increment hit count for a key
     * @param {string} key - Rate limit key
     * @param {number} windowMs - Window duration in milliseconds
     * @returns {Object} Current hits and reset time
     */
    increment(key, windowMs) {
        const now = Date.now();
        const resetTime = this.resetTimes.get(key);

        // Reset if window has passed
        if (!resetTime || now > resetTime) {
            this.hits.set(key, 1);
            this.resetTimes.set(key, now + windowMs);
            return {
                hits: 1,
                resetTime: now + windowMs
            };
        }

        // Increment existing counter
        const currentHits = (this.hits.get(key) || 0) + 1;
        this.hits.set(key, currentHits);

        return {
            hits: currentHits,
            resetTime: this.resetTimes.get(key)
        };
    }

    /**
     * Get current hit count for a key
     * @param {string} key - Rate limit key
     * @returns {number} Current hit count
     */
    getHits(key) {
        const now = Date.now();
        const resetTime = this.resetTimes.get(key);

        if (!resetTime || now > resetTime) {
            return 0;
        }

        return this.hits.get(key) || 0;
    }

    /**
     * Reset count for a key
     * @param {string} key - Rate limit key
     */
    reset(key) {
        this.hits.delete(key);
        this.resetTimes.delete(key);
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, resetTime] of this.resetTimes.entries()) {
            if (now > resetTime) {
                this.hits.delete(key);
                this.resetTimes.delete(key);
            }
        }
    }

    /**
     * Destroy the store and cleanup interval
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.hits.clear();
        this.resetTimes.clear();
    }
}

// Default store instance
const defaultStore = new MemoryStore();

/**
 * Default key generator - uses IP address
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
const defaultKeyGenerator = (req) => {
    // Try various ways to get client IP
    const ip = req.ip ||
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        'unknown';

    return `rl:${ip}`;
};

/**
 * User-based key generator
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
const userKeyGenerator = (req) => {
    if (req.user && req.user.id) {
        return `rl:user:${req.user.id}`;
    }
    return defaultKeyGenerator(req);
};

/**
 * Tenant-based key generator
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
const tenantKeyGenerator = (req) => {
    if (req.tenantId) {
        return `rl:tenant:${req.tenantId}`;
    }
    return defaultKeyGenerator(req);
};

/**
 * Endpoint-based key generator
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
const endpointKeyGenerator = (req) => {
    const base = req.user?.id ? `user:${req.user.id}` : (req.ip || 'unknown');
    return `rl:${base}:${req.method}:${req.baseUrl}${req.path}`;
};

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param {number} options.max - Maximum requests per window (default: 100)
 * @param {string} options.message - Error message when limit exceeded
 * @param {Function} options.keyGenerator - Custom key generator function
 * @param {Object} options.store - Custom store instance
 * @param {boolean} options.skipFailedRequests - Don't count failed requests
 * @param {boolean} options.skipSuccessfulRequests - Don't count successful requests
 * @param {Function} options.skip - Function to skip rate limiting for certain requests
 * @param {Function} options.handler - Custom handler when limit exceeded
 * @param {boolean} options.headers - Include rate limit headers (default: true)
 * @param {number} options.statusCode - HTTP status code when limited (default: 429)
 * @returns {Function} Express middleware function
 */
const rateLimiter = (options = {}) => {
    const {
        windowMs = 60000,
        max = 100,
        message = 'Too many requests, please try again later',
        keyGenerator = defaultKeyGenerator,
        store = defaultStore,
        skipFailedRequests = false,
        skipSuccessfulRequests = false,
        skip = null,
        handler = null,
        headers = true,
        statusCode = 429
    } = options;

    return async (req, res, next) => {
        try {
            // Check if should skip rate limiting
            if (skip && await skip(req, res)) {
                return next();
            }

            // Generate key for this request
            const key = keyGenerator(req);

            // Increment counter
            const { hits, resetTime } = store.increment(key, windowMs);

            // Calculate remaining requests
            const remaining = Math.max(0, max - hits);

            // Add rate limit headers
            if (headers) {
                res.setHeader('X-RateLimit-Limit', max);
                res.setHeader('X-RateLimit-Remaining', remaining);
                res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));
                res.setHeader('X-RateLimit-Window', windowMs);
            }

            // Store info on request for later use
            req.rateLimit = {
                limit: max,
                remaining,
                resetTime,
                hits
            };

            // Check if limit exceeded
            if (hits > max) {
                logger.warn('Rate limit exceeded', {
                    key,
                    hits,
                    max,
                    ip: req.ip,
                    path: req.path,
                    method: req.method,
                    userId: req.user?.id
                });

                // Add Retry-After header
                const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
                res.setHeader('Retry-After', retryAfter);

                // Use custom handler if provided
                if (handler) {
                    return handler(req, res, next, {
                        limit: max,
                        hits,
                        remaining: 0,
                        resetTime,
                        retryAfter
                    });
                }

                // Default error response
                return res.status(statusCode).json({
                    success: false,
                    error: {
                        message,
                        code: 'RATE_LIMIT_EXCEEDED',
                        details: {
                            limit: max,
                            windowMs,
                            retryAfter
                        }
                    }
                });
            }

            // Handle skipFailedRequests / skipSuccessfulRequests
            if (skipFailedRequests || skipSuccessfulRequests) {
                const originalEnd = res.end;
                res.end = function(...args) {
                    const shouldDecrement = 
                        (skipFailedRequests && res.statusCode >= 400) ||
                        (skipSuccessfulRequests && res.statusCode < 400);

                    if (shouldDecrement) {
                        // Decrement the counter since we're skipping this request
                        const currentHits = store.getHits(key);
                        if (currentHits > 0) {
                            store.hits.set(key, currentHits - 1);
                        }
                    }

                    originalEnd.apply(res, args);
                };
            }

            next();
        } catch (error) {
            logger.error('Rate limiter error', { error: error.message });
            // Don't block requests on rate limiter errors
            next();
        }
    };
};

/**
 * Create a strict rate limiter for sensitive endpoints
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware function
 */
const strictRateLimiter = (options = {}) => {
    return rateLimiter({
        windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
        max: options.max || 5,
        message: options.message || 'Too many attempts, please try again later',
        keyGenerator: options.keyGenerator || endpointKeyGenerator,
        ...options
    });
};

/**
 * Create a rate limiter for authentication endpoints
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware function
 */
const authRateLimiter = (options = {}) => {
    return rateLimiter({
        windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
        max: options.max || 10,
        message: options.message || 'Too many login attempts, please try again later',
        keyGenerator: (req) => {
            // Rate limit by IP + email combination for login
            const email = req.body?.email || 'unknown';
            const ip = req.ip || 'unknown';
            return `rl:auth:${ip}:${email}`;
        },
        skipSuccessfulRequests: true, // Only count failed attempts
        ...options
    });
};

/**
 * Create a rate limiter for API endpoints
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware function
 */
const apiRateLimiter = (options = {}) => {
    return rateLimiter({
        windowMs: options.windowMs || 60000, // 1 minute
        max: options.max || 100,
        message: options.message || 'API rate limit exceeded',
        keyGenerator: options.keyGenerator || userKeyGenerator,
        ...options
    });
};

/**
 * Create a slow-down middleware (increases response time instead of blocking)
 * @param {Object} options - Options
 * @param {number} options.windowMs - Time window
 * @param {number} options.delayAfter - Start delaying after this many requests
 * @param {number} options.delayMs - Delay per request over limit
 * @param {number} options.maxDelayMs - Maximum delay
 * @returns {Function} Express middleware function
 */
const slowDown = (options = {}) => {
    const {
        windowMs = 60000,
        delayAfter = 50,
        delayMs = 500,
        maxDelayMs = 10000,
        keyGenerator = defaultKeyGenerator,
        store = defaultStore
    } = options;

    return async (req, res, next) => {
        try {
            const key = `sd:${keyGenerator(req)}`;
            const { hits } = store.increment(key, windowMs);

            if (hits > delayAfter) {
                const delayCount = hits - delayAfter;
                const delay = Math.min(delayCount * delayMs, maxDelayMs);

                logger.debug('Slowing down request', {
                    key,
                    hits,
                    delay,
                    path: req.path
                });

                await new Promise(resolve => setTimeout(resolve, delay));
            }

            next();
        } catch (error) {
            logger.error('Slow down middleware error', { error: error.message });
            next();
        }
    };
};

/**
 * Create a combined rate limiter with multiple tiers
 * @param {Array<Object>} tiers - Array of rate limit configurations
 * @returns {Function} Express middleware function
 */
const tieredRateLimiter = (tiers) => {
    const limiters = tiers.map(tier => ({
        check: tier.check || (() => true),
        limiter: rateLimiter(tier)
    }));

    return async (req, res, next) => {
        for (const { check, limiter } of limiters) {
            if (await check(req)) {
                return limiter(req, res, next);
            }
        }
        next();
    };
};

/**
 * Skip rate limiting for certain IPs (whitelist)
 * @param {Array<string>} whitelist - Array of whitelisted IPs
 * @returns {Function} Skip function for rate limiter
 */
const skipWhitelistedIPs = (whitelist) => {
    return (req) => {
        const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
        return whitelist.includes(ip);
    };
};

/**
 * Skip rate limiting for authenticated users with specific roles
 * @param {Array<string>} roles - Array of roles to skip
 * @returns {Function} Skip function for rate limiter
 */
const skipRoles = (roles) => {
    return (req) => {
        if (!req.user || !req.user.roles) return false;
        return roles.some(role => req.user.roles.includes(role));
    };
};

module.exports = {
    // Main middleware
    rateLimiter,
    strictRateLimiter,
    authRateLimiter,
    apiRateLimiter,
    slowDown,
    tieredRateLimiter,

    // Key generators
    defaultKeyGenerator,
    userKeyGenerator,
    tenantKeyGenerator,
    endpointKeyGenerator,

    // Skip functions
    skipWhitelistedIPs,
    skipRoles,

    // Store
    MemoryStore,
    defaultStore
};