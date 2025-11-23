/**
 * @fileoverview Rate Limiting Middleware
 * @module servers/admin-server/middleware/rate-limiter
 * @description Implements configurable rate limiting to prevent abuse and ensure fair resource usage
 * @version 1.0.0
 */

'use strict';

const { AppError } = require('../../../shared/lib/utils/app-error');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'rate-limiter' });

/**
 * In-memory store for rate limit tracking
 * In production, consider using Redis for distributed rate limiting
 */
class RateLimitStore {
    constructor() {
        this.hits = new Map();
        this.resetTime = new Map();
    }

    /**
     * Increment hit count for a key
     * @param {string} key - Rate limit key (usually IP address)
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Object} Hit count and reset time
     */
    increment(key, windowMs) {
        const now = Date.now();
        const resetTime = this.resetTime.get(key);

        // Reset if window has expired
        if (!resetTime || now > resetTime) {
            this.hits.set(key, 1);
            this.resetTime.set(key, now + windowMs);
            return {
                hits: 1,
                resetTime: now + windowMs
            };
        }

        // Increment hit count
        const currentHits = this.hits.get(key) || 0;
        const newHits = currentHits + 1;
        this.hits.set(key, newHits);

        return {
            hits: newHits,
            resetTime: resetTime
        };
    }

    /**
     * Get current hit count for a key
     * @param {string} key - Rate limit key
     * @returns {number} Current hit count
     */
    getHits(key) {
        const now = Date.now();
        const resetTime = this.resetTime.get(key);

        if (!resetTime || now > resetTime) {
            return 0;
        }

        return this.hits.get(key) || 0;
    }

    /**
     * Reset hit count for a key
     * @param {string} key - Rate limit key
     */
    reset(key) {
        this.hits.delete(key);
        this.resetTime.delete(key);
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, resetTime] of this.resetTime.entries()) {
            if (now > resetTime) {
                this.hits.delete(key);
                this.resetTime.delete(key);
            }
        }
    }
}

// Global store instance
const store = new RateLimitStore();

// Cleanup expired entries every 10 minutes
setInterval(() => {
    store.cleanup();
}, 10 * 60 * 1000);

/**
 * Generate rate limit key from request
 * @param {express.Request} req - Express request object
 * @param {string} keyGenerator - Key generation strategy
 * @returns {string} Rate limit key
 */
const generateKey = (req, keyGenerator = 'ip') => {
    switch (keyGenerator) {
        case 'ip':
            return req.ip || req.connection.remoteAddress || 'unknown';
        
        case 'user':
            return req.user?.id || req.ip || 'anonymous';
        
        case 'token':
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                return authHeader.substring(7);
            }
            return req.ip || 'no-token';
        
        case 'api-key':
            return req.headers['x-api-key'] || req.ip || 'no-api-key';
        
        default:
            return req.ip || 'unknown';
    }
};

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limiter configuration
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum requests per window
 * @param {string} options.message - Error message when limit exceeded
 * @param {boolean} options.standardHeaders - Include standard rate limit headers
 * @param {boolean} options.legacyHeaders - Include legacy rate limit headers
 * @param {string} options.keyGenerator - Key generation strategy
 * @param {boolean} options.skipSuccessfulRequests - Skip counting successful requests
 * @param {boolean} options.skipFailedRequests - Skip counting failed requests
 * @returns {Function} Express middleware function
 */
const rateLimiter = (options = {}) => {
    const {
        windowMs = 60000,
        maxRequests = 100,
        message = 'Too many requests, please try again later',
        standardHeaders = true,
        legacyHeaders = false,
        keyGenerator = 'ip',
        skipSuccessfulRequests = false,
        skipFailedRequests = false
    } = options;

    return (req, res, next) => {
        try {
            const key = generateKey(req, keyGenerator);
            const result = store.increment(key, windowMs);

            // Calculate time until reset
            const timeUntilReset = Math.ceil((result.resetTime - Date.now()) / 1000);

            // Set standard headers (draft-ietf-httpapi-ratelimit-headers)
            if (standardHeaders) {
                res.setHeader('RateLimit-Limit', maxRequests);
                res.setHeader('RateLimit-Remaining', Math.max(0, maxRequests - result.hits));
                res.setHeader('RateLimit-Reset', Math.ceil(result.resetTime / 1000));
            }

            // Set legacy headers (X-RateLimit-*)
            if (legacyHeaders) {
                res.setHeader('X-RateLimit-Limit', maxRequests);
                res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - result.hits));
                res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
            }

            // Check if limit exceeded
            if (result.hits > maxRequests) {
                res.setHeader('Retry-After', timeUntilReset);

                logger.warn('Rate limit exceeded', {
                    key,
                    hits: result.hits,
                    limit: maxRequests,
                    windowMs,
                    requestId: req.requestId,
                    path: req.path,
                    method: req.method
                });

                return next(new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'));
            }

            // Handle skip options
            if (skipSuccessfulRequests || skipFailedRequests) {
                const originalSend = res.send;
                res.send = function (data) {
                    const statusCode = res.statusCode;

                    // Decrement hit count based on skip options
                    if ((skipSuccessfulRequests && statusCode < 400) ||
                        (skipFailedRequests && statusCode >= 400)) {
                        const currentHits = store.getHits(key);
                        if (currentHits > 0) {
                            store.hits.set(key, currentHits - 1);
                        }
                    }

                    return originalSend.call(this, data);
                };
            }

            logger.debug('Rate limit check passed', {
                key,
                hits: result.hits,
                limit: maxRequests,
                remaining: maxRequests - result.hits,
                requestId: req.requestId
            });

            next();
        } catch (error) {
            logger.error('Rate limiter error', {
                error: error.message,
                requestId: req.requestId
            });

            // Don't block request on rate limiter errors
            next();
        }
    };
};

/**
 * Create endpoint-specific rate limiter
 * @param {string} endpoint - Endpoint identifier
 * @param {Object} options - Rate limiter configuration
 * @returns {Function} Express middleware function
 */
const endpointRateLimiter = (endpoint, options = {}) => {
    const enhancedKeyGenerator = (req, keyGenerator) => {
        const baseKey = generateKey(req, keyGenerator);
        return `${endpoint}:${baseKey}`;
    };

    return (req, res, next) => {
        const key = enhancedKeyGenerator(req, options.keyGenerator || 'ip');
        req.rateLimitKey = key;

        const limiter = rateLimiter(options);
        limiter(req, res, next);
    };
};

/**
 * Create sliding window rate limiter (more accurate but slightly more expensive)
 * @param {Object} options - Rate limiter configuration
 * @returns {Function} Express middleware function
 */
const slidingWindowRateLimiter = (options = {}) => {
    const {
        windowMs = 60000,
        maxRequests = 100,
        message = 'Too many requests, please try again later',
        keyGenerator = 'ip'
    } = options;

    const timestamps = new Map();

    return (req, res, next) => {
        try {
            const key = generateKey(req, keyGenerator);
            const now = Date.now();
            const windowStart = now - windowMs;

            // Get or initialize timestamp array for this key
            let keyTimestamps = timestamps.get(key) || [];

            // Remove timestamps outside the window
            keyTimestamps = keyTimestamps.filter(timestamp => timestamp > windowStart);

            // Check if limit exceeded
            if (keyTimestamps.length >= maxRequests) {
                const oldestTimestamp = keyTimestamps[0];
                const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

                res.setHeader('Retry-After', retryAfter);
                res.setHeader('RateLimit-Limit', maxRequests);
                res.setHeader('RateLimit-Remaining', 0);

                logger.warn('Sliding window rate limit exceeded', {
                    key,
                    requests: keyTimestamps.length,
                    limit: maxRequests,
                    windowMs,
                    requestId: req.requestId
                });

                return next(new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'));
            }

            // Add current timestamp
            keyTimestamps.push(now);
            timestamps.set(key, keyTimestamps);

            // Set headers
            res.setHeader('RateLimit-Limit', maxRequests);
            res.setHeader('RateLimit-Remaining', maxRequests - keyTimestamps.length);

            logger.debug('Sliding window rate limit check passed', {
                key,
                requests: keyTimestamps.length,
                limit: maxRequests,
                requestId: req.requestId
            });

            next();
        } catch (error) {
            logger.error('Sliding window rate limiter error', {
                error: error.message,
                requestId: req.requestId
            });
            next();
        }
    };
};

/**
 * Reset rate limit for a specific key
 * @param {string} key - Rate limit key to reset
 */
const resetRateLimit = (key) => {
    store.reset(key);
    logger.info('Rate limit reset', { key });
};

/**
 * Get current rate limit status for a key
 * @param {string} key - Rate limit key
 * @returns {Object} Rate limit status
 */
const getRateLimitStatus = (key) => {
    const hits = store.getHits(key);
    const resetTime = store.resetTime.get(key);

    return {
        hits,
        resetTime: resetTime ? new Date(resetTime) : null,
        remaining: resetTime && hits ? Math.max(0, 100 - hits) : 100
    };
};

module.exports = {
    rateLimiter,
    endpointRateLimiter,
    slidingWindowRateLimiter,
    resetRateLimit,
    getRateLimitStatus,
    RateLimitStore
};