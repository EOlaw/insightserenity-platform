/**
 * @fileoverview Rate Limiting Middleware
 * @module shared/lib/middleware/rate-limiter
 * @description Comprehensive rate limiting middleware with multiple strategies and storage backends
 */

const { AppError } = require('../../../shared/lib/utils/app-error');
const logger = require('../../../shared/lib/utils/logger').createLogger({
    serviceName: 'rate-limiter-middleware'
});

/**
 * Rate limit storage backends
 */
class RateLimitStore {
    constructor() {
        this.store = new Map();
        this.cleanupInterval = null;
    }

    /**
     * Get current count for a key
     * @param {string} key - Rate limit key
     * @returns {Promise<Object>} Count and expiry info
     */
    async get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return { count: 0, resetTime: null };
        }

        if (Date.now() > entry.resetTime) {
            this.store.delete(key);
            return { count: 0, resetTime: null };
        }

        return {
            count: entry.count,
            resetTime: entry.resetTime
        };
    }

    /**
     * Increment count for a key
     * @param {string} key - Rate limit key
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Promise<Object>} Updated count and expiry
     */
    async increment(key, windowMs) {
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now > entry.resetTime) {
            const resetTime = now + windowMs;
            this.store.set(key, {
                count: 1,
                resetTime
            });
            return { count: 1, resetTime };
        }

        entry.count++;
        this.store.set(key, entry);
        return {
            count: entry.count,
            resetTime: entry.resetTime
        };
    }

    /**
     * Reset count for a key
     * @param {string} key - Rate limit key
     * @returns {Promise<void>}
     */
    async reset(key) {
        this.store.delete(key);
    }

    /**
     * Start cleanup interval to remove expired entries
     * @param {number} interval - Cleanup interval in milliseconds
     */
    startCleanup(interval = 60000) {
        if (this.cleanupInterval) {
            return;
        }

        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleanedCount = 0;

            for (const [key, entry] of this.store.entries()) {
                if (now > entry.resetTime) {
                    this.store.delete(key);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                logger.debug('Cleaned up expired rate limit entries', {
                    count: cleanedCount
                });
            }
        }, interval);
    }

    /**
     * Stop cleanup interval
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Get store statistics
     * @returns {Object} Store stats
     */
    getStats() {
        return {
            totalKeys: this.store.size,
            backend: 'memory'
        };
    }
}

/**
 * Redis-based rate limit store (optional)
 */
class RedisRateLimitStore {
    constructor(redisClient) {
        this.redis = redisClient;
    }

    async get(key) {
        try {
            const data = await this.redis.get(key);
            if (!data) {
                return { count: 0, resetTime: null };
            }

            const parsed = JSON.parse(data);
            return {
                count: parsed.count,
                resetTime: parsed.resetTime
            };
        } catch (error) {
            logger.error('Redis get error', { error: error.message });
            return { count: 0, resetTime: null };
        }
    }

    async increment(key, windowMs) {
        try {
            const now = Date.now();
            const data = await this.redis.get(key);

            if (!data) {
                const resetTime = now + windowMs;
                await this.redis.set(
                    key,
                    JSON.stringify({ count: 1, resetTime }),
                    'PX',
                    windowMs
                );
                return { count: 1, resetTime };
            }

            const parsed = JSON.parse(data);
            parsed.count++;

            await this.redis.set(
                key,
                JSON.stringify(parsed),
                'PX',
                parsed.resetTime - now
            );

            return {
                count: parsed.count,
                resetTime: parsed.resetTime
            };
        } catch (error) {
            logger.error('Redis increment error', { error: error.message });
            throw error;
        }
    }

    async reset(key) {
        try {
            await this.redis.del(key);
        } catch (error) {
            logger.error('Redis reset error', { error: error.message });
        }
    }

    getStats() {
        return {
            backend: 'redis',
            connected: this.redis.status === 'ready'
        };
    }
}

/**
 * Rate limiting strategy implementations
 */
class RateLimitStrategies {
    /**
     * Fixed window strategy
     * @param {Object} options - Strategy options
     * @returns {Function} Strategy function
     */
    static fixedWindow(options) {
        return async (store, key, maxRequests, windowMs) => {
            const result = await store.increment(key, windowMs);
            
            return {
                allowed: result.count <= maxRequests,
                current: result.count,
                limit: maxRequests,
                remaining: Math.max(0, maxRequests - result.count),
                resetTime: result.resetTime
            };
        };
    }

    /**
     * Sliding window strategy
     * @param {Object} options - Strategy options
     * @returns {Function} Strategy function
     */
    static slidingWindow(options) {
        const precision = options.precision || 1000; // 1 second precision

        return async (store, key, maxRequests, windowMs) => {
            const now = Date.now();
            const windowKey = `${key}:${Math.floor(now / precision)}`;
            
            // Get counts for current and previous windows
            const currentWindow = await store.get(windowKey);
            const previousWindowKey = `${key}:${Math.floor((now - precision) / precision)}`;
            const previousWindow = await store.get(previousWindowKey);

            // Calculate weighted count
            const timeInCurrentWindow = now % precision;
            const weightForPrevious = 1 - (timeInCurrentWindow / precision);
            const estimatedCount = 
                currentWindow.count + 
                (previousWindow.count * weightForPrevious);

            const allowed = estimatedCount < maxRequests;

            if (allowed) {
                await store.increment(windowKey, windowMs);
            }

            return {
                allowed,
                current: Math.ceil(estimatedCount),
                limit: maxRequests,
                remaining: Math.max(0, Math.floor(maxRequests - estimatedCount)),
                resetTime: now + windowMs
            };
        };
    }

    /**
     * Token bucket strategy
     * @param {Object} options - Strategy options
     * @returns {Function} Strategy function
     */
    static tokenBucket(options) {
        const refillRate = options.refillRate || 1; // tokens per second
        const bucketSize = options.bucketSize;

        return async (store, key, maxRequests, windowMs) => {
            const now = Date.now();
            const bucket = await store.get(key);

            let tokens = bucket.count || maxRequests;
            let lastRefill = bucket.resetTime || now;

            // Calculate tokens to add based on time elapsed
            const timePassed = now - lastRefill;
            const tokensToAdd = (timePassed / 1000) * refillRate;
            tokens = Math.min(bucketSize || maxRequests, tokens + tokensToAdd);

            const allowed = tokens >= 1;

            if (allowed) {
                tokens--;
            }

            // Store updated bucket state
            await store.increment(key, windowMs);

            return {
                allowed,
                current: Math.floor(maxRequests - tokens),
                limit: maxRequests,
                remaining: Math.floor(tokens),
                resetTime: now + (tokens === 0 ? windowMs : 0)
            };
        };
    }
}

/**
 * Rate limiter configuration class
 */
class RateLimiterConfig {
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 100;
        this.windowMs = options.windowMs || 60000; // 1 minute default
        this.message = options.message || 'Too many requests, please try again later';
        this.statusCode = options.statusCode || 429;
        this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
        this.skipFailedRequests = options.skipFailedRequests || false;
        this.keyGenerator = options.keyGenerator || this._defaultKeyGenerator;
        this.skip = options.skip || (() => false);
        this.onLimitReached = options.onLimitReached || null;
        this.strategy = options.strategy || 'fixedWindow';
        this.store = options.store || new RateLimitStore();
        this.headers = options.headers !== false;
        this.standardHeaders = options.standardHeaders !== false;
        this.legacyHeaders = options.legacyHeaders !== false;
    }

    _defaultKeyGenerator(req) {
        const ip = req.ip || 
                   req.connection?.remoteAddress || 
                   req.socket?.remoteAddress ||
                   req.connection?.socket?.remoteAddress;
        
        return `rl:${ip}`;
    }
}

/**
 * Main rate limiter middleware factory
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
function rateLimiter(options = {}) {
    const config = new RateLimiterConfig(options);
    
    // Initialize cleanup for memory store
    if (config.store instanceof RateLimitStore) {
        config.store.startCleanup();
    }

    // Get strategy function
    let strategyFn;
    if (typeof config.strategy === 'function') {
        strategyFn = config.strategy;
    } else {
        switch (config.strategy) {
            case 'slidingWindow':
                strategyFn = RateLimitStrategies.slidingWindow(options);
                break;
            case 'tokenBucket':
                strategyFn = RateLimitStrategies.tokenBucket(options);
                break;
            case 'fixedWindow':
            default:
                strategyFn = RateLimitStrategies.fixedWindow(options);
                break;
        }
    }

    return async (req, res, next) => {
        try {
            // Check if this request should be skipped
            if (await config.skip(req)) {
                return next();
            }

            // Generate unique key for this request
            const key = await config.keyGenerator(req);

            // Apply rate limiting strategy
            const result = await strategyFn(
                config.store,
                key,
                config.maxRequests,
                config.windowMs
            );

            // Log rate limit check
            logger.debug('Rate limit check', {
                key,
                allowed: result.allowed,
                current: result.current,
                limit: result.limit,
                remaining: result.remaining,
                strategy: config.strategy
            });

            // Set rate limit headers
            if (config.headers) {
                setRateLimitHeaders(res, result, config);
            }

            // Check if limit exceeded
            if (!result.allowed) {
                logger.warn('Rate limit exceeded', {
                    key,
                    current: result.current,
                    limit: result.limit,
                    ip: req.ip,
                    path: req.path,
                    method: req.method
                });

                // Call onLimitReached callback if provided
                if (config.onLimitReached) {
                    await config.onLimitReached(req, res, result);
                }

                const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
                res.set('Retry-After', String(retryAfter));

                throw AppError.rateLimit(config.message, {
                    context: {
                        limit: result.limit,
                        current: result.current,
                        retryAfter
                    }
                });
            }

            // Store rate limit info in request for later use
            req.rateLimit = {
                limit: result.limit,
                current: result.current,
                remaining: result.remaining,
                resetTime: result.resetTime
            };

            // Handle response event to conditionally count the request
            if (config.skipSuccessfulRequests || config.skipFailedRequests) {
                const originalSend = res.send;
                res.send = function(data) {
                    const statusCode = res.statusCode;
                    const isSuccess = statusCode >= 200 && statusCode < 400;

                    if ((config.skipSuccessfulRequests && isSuccess) ||
                        (config.skipFailedRequests && !isSuccess)) {
                        // Decrement the count
                        config.store.reset(key).catch(err => {
                            logger.error('Failed to reset rate limit', {
                                error: err.message
                            });
                        });
                    }

                    return originalSend.apply(res, arguments);
                };
            }

            next();

        } catch (error) {
            if (error instanceof AppError) {
                next(error);
            } else {
                logger.error('Rate limiter middleware error', {
                    error: error.message,
                    stack: error.stack
                });
                next(AppError.internal('Rate limiting processing error'));
            }
        }
    };
}

/**
 * Set rate limit response headers
 * @private
 */
function setRateLimitHeaders(res, result, config) {
    // Standard draft headers (RateLimit-*)
    if (config.standardHeaders) {
        res.set('RateLimit-Limit', String(result.limit));
        res.set('RateLimit-Remaining', String(result.remaining));
        res.set('RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));
    }

    // Legacy headers (X-RateLimit-*)
    if (config.legacyHeaders) {
        res.set('X-RateLimit-Limit', String(result.limit));
        res.set('X-RateLimit-Remaining', String(result.remaining));
        res.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));
    }
}

/**
 * Create custom rate limiter with specific configuration
 * @param {Object} options - Rate limiter options
 * @returns {Function} Configured rate limiter middleware
 */
function createRateLimiter(options) {
    return rateLimiter(options);
}

/**
 * Predefined rate limiter presets
 */
const RateLimiterPresets = {
    /**
     * Strict rate limiter for sensitive operations
     * @param {Object} overrides - Override default options
     * @returns {Function} Rate limiter middleware
     */
    strict: (overrides = {}) => rateLimiter({
        maxRequests: 10,
        windowMs: 60000, // 1 minute
        message: 'Too many requests. Please wait before trying again.',
        ...overrides
    }),

    /**
     * Standard rate limiter for general API endpoints
     * @param {Object} overrides - Override default options
     * @returns {Function} Rate limiter middleware
     */
    standard: (overrides = {}) => rateLimiter({
        maxRequests: 100,
        windowMs: 60000, // 1 minute
        ...overrides
    }),

    /**
     * Lenient rate limiter for public endpoints
     * @param {Object} overrides - Override default options
     * @returns {Function} Rate limiter middleware
     */
    lenient: (overrides = {}) => rateLimiter({
        maxRequests: 1000,
        windowMs: 60000, // 1 minute
        ...overrides
    }),

    /**
     * Authentication rate limiter
     * @param {Object} overrides - Override default options
     * @returns {Function} Rate limiter middleware
     */
    auth: (overrides = {}) => rateLimiter({
        maxRequests: 5,
        windowMs: 300000, // 5 minutes
        message: 'Too many login attempts. Please try again later.',
        skipSuccessfulRequests: true,
        ...overrides
    }),

    /**
     * File upload rate limiter
     * @param {Object} overrides - Override default options
     * @returns {Function} Rate limiter middleware
     */
    upload: (overrides = {}) => rateLimiter({
        maxRequests: 10,
        windowMs: 3600000, // 1 hour
        message: 'Upload limit reached. Please try again later.',
        ...overrides
    })
};

/**
 * Global rate limiter that can be applied to all routes
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
function globalRateLimiter(options = {}) {
    const defaultOptions = {
        maxRequests: 1000,
        windowMs: 60000,
        skip: (req) => {
            // Skip rate limiting for health check and static assets
            return req.path === '/health' || 
                   req.path === '/metrics' ||
                   req.path.startsWith('/static');
        },
        ...options
    };

    return rateLimiter(defaultOptions);
}

/**
 * Per-user rate limiter
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
function perUserRateLimiter(options = {}) {
    return rateLimiter({
        ...options,
        keyGenerator: (req) => {
            const userId = req.user?.id || req.user?._id;
            if (!userId) {
                return `rl:ip:${req.ip}`;
            }
            return `rl:user:${userId}`;
        }
    });
}

/**
 * Per-tenant rate limiter
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
function perTenantRateLimiter(options = {}) {
    return rateLimiter({
        ...options,
        keyGenerator: (req) => {
            const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
            if (!tenantId) {
                return `rl:ip:${req.ip}`;
            }
            return `rl:tenant:${tenantId}`;
        }
    });
}

module.exports = {
    rateLimiter,
    createRateLimiter,
    globalRateLimiter,
    perUserRateLimiter,
    perTenantRateLimiter,
    RateLimiterPresets,
    RateLimitStore,
    RedisRateLimitStore,
    RateLimiterConfig,
    RateLimitStrategies
};