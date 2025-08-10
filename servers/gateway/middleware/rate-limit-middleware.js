/**
 * Rate Limiting Middleware
 * Implements sophisticated rate limiting with multiple strategies
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');

/**
 * Rate Limit Middleware Class
 */
class RateLimitMiddleware {
    constructor(config, cacheManager) {
        this.config = config;
        this.cacheManager = cacheManager;
        this.limiters = new Map();
        this.globalLimiter = null;
        this.endpointLimiters = new Map();
        this.userLimiters = new Map();
        this.tenantLimiters = new Map();
        this.ipLimiters = new Map();
    }

    /**
     * Initialize rate limiting
     */
    async initialize() {
        if (!this.config.enabled) {
            return;
        }

        // Setup global rate limiter
        await this.setupGlobalLimiter();

        // Setup endpoint-specific limiters
        await this.setupEndpointLimiters();

        // Setup specialized limiters
        await this.setupSpecializedLimiters();
    }

    /**
     * Setup global rate limiter
     */
    async setupGlobalLimiter() {
        const globalConfig = this.config.global || {};
        
        if (this.config.store?.type === 'redis' && this.cacheManager) {
            const redisClient = await this.cacheManager.getClient();
            
            // Create Redis-based rate limiter
            this.globalLimiter = new RateLimiterRedis({
                storeClient: redisClient,
                keyPrefix: this.config.store.prefix || 'rl:global:',
                points: globalConfig.max || 100,
                duration: Math.floor((globalConfig.windowMs || 60000) / 1000),
                blockDuration: globalConfig.blockDuration || 0,
                execEvenly: globalConfig.execEvenly || false
            });
        } else {
            // Create memory-based rate limiter
            this.globalLimiter = new RateLimiterMemory({
                keyPrefix: 'rl:global:',
                points: globalConfig.max || 100,
                duration: Math.floor((globalConfig.windowMs || 60000) / 1000),
                blockDuration: globalConfig.blockDuration || 0,
                execEvenly: globalConfig.execEvenly || false
            });
        }
    }

    /**
     * Setup endpoint-specific limiters
     */
    async setupEndpointLimiters() {
        const endpoints = this.config.endpoints || [];
        
        for (const endpoint of endpoints) {
            const limiter = await this.createLimiter(endpoint);
            this.endpointLimiters.set(endpoint.path, limiter);
        }
    }

    /**
     * Setup specialized limiters
     */
    async setupSpecializedLimiters() {
        // User-based rate limiter
        this.userLimiters.set('default', await this.createLimiter({
            max: 1000,
            windowMs: 60000,
            keyPrefix: 'rl:user:'
        }));

        // Tenant-based rate limiter
        this.tenantLimiters.set('default', await this.createLimiter({
            max: 10000,
            windowMs: 60000,
            keyPrefix: 'rl:tenant:'
        }));

        // IP-based rate limiter for DDoS protection
        this.ipLimiters.set('ddos', await this.createLimiter({
            max: 50,
            windowMs: 1000,
            blockDuration: 60,
            keyPrefix: 'rl:ip:ddos:'
        }));

        // API key rate limiter
        this.limiters.set('apikey', await this.createLimiter({
            max: 5000,
            windowMs: 3600000,
            keyPrefix: 'rl:apikey:'
        }));
    }

    /**
     * Create a rate limiter instance
     */
    async createLimiter(config) {
        if (this.config.store?.type === 'redis' && this.cacheManager) {
            const redisClient = await this.cacheManager.getClient();
            
            return new RateLimiterRedis({
                storeClient: redisClient,
                keyPrefix: config.keyPrefix || 'rl:',
                points: config.max,
                duration: Math.floor((config.windowMs || 60000) / 1000),
                blockDuration: config.blockDuration || 0,
                execEvenly: config.execEvenly || false
            });
        } else {
            return new RateLimiterMemory({
                keyPrefix: config.keyPrefix || 'rl:',
                points: config.max,
                duration: Math.floor((config.windowMs || 60000) / 1000),
                blockDuration: config.blockDuration || 0,
                execEvenly: config.execEvenly || false
            });
        }
    }

    /**
     * Get middleware function
     */
    getMiddleware() {
        return async (req, res, next) => {
            if (!this.config.enabled) {
                return next();
            }

            try {
                // Get rate limit key components
                const ip = this.getClientIp(req);
                const userId = req.user?.id;
                const tenantId = req.tenant?.id || req.user?.tenantId;
                const apiKey = req.headers['x-api-key'];
                const endpoint = req.path;

                // Check IP-based DDoS protection first
                const ddosLimiter = this.ipLimiters.get('ddos');
                if (ddosLimiter) {
                    try {
                        await ddosLimiter.consume(ip, 1);
                    } catch (rejRes) {
                        return this.handleRateLimitExceeded(req, res, rejRes, 'DDoS protection');
                    }
                }

                // Check endpoint-specific limits
                const endpointLimiter = this.getEndpointLimiter(endpoint);
                if (endpointLimiter) {
                    try {
                        await endpointLimiter.consume(`${endpoint}:${ip}`, 1);
                    } catch (rejRes) {
                        return this.handleRateLimitExceeded(req, res, rejRes, 'Endpoint limit');
                    }
                }

                // Check user-based limits
                if (userId) {
                    const userLimiter = this.userLimiters.get('default');
                    if (userLimiter) {
                        try {
                            await userLimiter.consume(userId, 1);
                        } catch (rejRes) {
                            return this.handleRateLimitExceeded(req, res, rejRes, 'User limit');
                        }
                    }
                }

                // Check tenant-based limits
                if (tenantId) {
                    const tenantLimiter = this.tenantLimiters.get('default');
                    if (tenantLimiter) {
                        try {
                            await tenantLimiter.consume(tenantId, 1);
                        } catch (rejRes) {
                            return this.handleRateLimitExceeded(req, res, rejRes, 'Tenant limit');
                        }
                    }
                }

                // Check API key limits
                if (apiKey) {
                    const apiKeyLimiter = this.limiters.get('apikey');
                    if (apiKeyLimiter) {
                        try {
                            await apiKeyLimiter.consume(apiKey, 1);
                        } catch (rejRes) {
                            return this.handleRateLimitExceeded(req, res, rejRes, 'API key limit');
                        }
                    }
                }

                // Check global rate limit
                if (this.globalLimiter) {
                    const key = userId || apiKey || ip;
                    try {
                        const rateLimitRes = await this.globalLimiter.consume(key, 1);
                        
                        // Add rate limit headers
                        this.setRateLimitHeaders(res, rateLimitRes);
                    } catch (rejRes) {
                        return this.handleRateLimitExceeded(req, res, rejRes, 'Global limit');
                    }
                }

                next();
            } catch (error) {
                console.error('Rate limiting error:', error);
                // Don't block on rate limiting errors
                next();
            }
        };
    }

    /**
     * Get endpoint-specific limiter
     */
    getEndpointLimiter(path) {
        // Exact match
        if (this.endpointLimiters.has(path)) {
            return this.endpointLimiters.get(path);
        }

        // Prefix match
        for (const [endpointPath, limiter] of this.endpointLimiters) {
            if (path.startsWith(endpointPath)) {
                return limiter;
            }
        }

        return null;
    }

    /**
     * Get client IP address
     */
    getClientIp(req) {
        // Check various headers for the real IP
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }

        const realIp = req.headers['x-real-ip'];
        if (realIp) {
            return realIp;
        }

        const cfConnectingIp = req.headers['cf-connecting-ip'];
        if (cfConnectingIp) {
            return cfConnectingIp;
        }

        return req.connection.remoteAddress || req.ip;
    }

    /**
     * Set rate limit headers
     */
    setRateLimitHeaders(res, rateLimitRes) {
        if (this.config.global?.standardHeaders) {
            res.setHeader('RateLimit-Limit', rateLimitRes.totalPoints);
            res.setHeader('RateLimit-Remaining', rateLimitRes.remainingPoints);
            res.setHeader('RateLimit-Reset', new Date(Date.now() + rateLimitRes.msBeforeNext).toISOString());
        }

        if (this.config.global?.legacyHeaders) {
            res.setHeader('X-RateLimit-Limit', rateLimitRes.totalPoints);
            res.setHeader('X-RateLimit-Remaining', rateLimitRes.remainingPoints);
            res.setHeader('X-RateLimit-Reset', Math.round((Date.now() + rateLimitRes.msBeforeNext) / 1000));
        }

        // Custom headers
        res.setHeader('X-RateLimit-Remaining', rateLimitRes.remainingPoints);
        res.setHeader('X-RateLimit-Burst-Capacity', rateLimitRes.totalPoints);
        res.setHeader('X-RateLimit-Replenish-Rate', Math.round(rateLimitRes.totalPoints / (rateLimitRes.msBeforeNext / 1000)));
    }

    /**
     * Handle rate limit exceeded
     */
    handleRateLimitExceeded(req, res, rejRes, limitType) {
        // Log rate limit violation
        console.warn('Rate limit exceeded', {
            requestId: req.id,
            ip: this.getClientIp(req),
            userId: req.user?.id,
            tenantId: req.tenant?.id,
            path: req.path,
            limitType: limitType,
            msBeforeNext: rejRes.msBeforeNext
        });

        // Set retry-after header
        res.setHeader('Retry-After', Math.round(rejRes.msBeforeNext / 1000));
        
        // Set rate limit headers
        if (this.config.global?.standardHeaders) {
            res.setHeader('RateLimit-Limit', rejRes.totalPoints || 0);
            res.setHeader('RateLimit-Remaining', rejRes.remainingPoints || 0);
            res.setHeader('RateLimit-Reset', new Date(Date.now() + rejRes.msBeforeNext).toISOString());
        }

        // Send error response
        return res.status(429).json({
            error: 'Too Many Requests',
            message: this.config.global?.message || 'Rate limit exceeded, please try again later',
            limitType: limitType,
            retryAfter: Math.round(rejRes.msBeforeNext / 1000),
            requestId: req.id
        });
    }

    /**
     * Create custom rate limiter for specific use case
     */
    async createCustomLimiter(name, config) {
        const limiter = await this.createLimiter(config);
        this.limiters.set(name, limiter);
        return limiter;
    }

    /**
     * Get rate limit status for a key
     */
    async getRateLimitStatus(limiterName, key) {
        const limiter = this.limiters.get(limiterName) || this.globalLimiter;
        if (!limiter) {
            return null;
        }

        try {
            const res = await limiter.get(key);
            return {
                totalPoints: limiter.points,
                consumedPoints: res ? res.consumedPoints : 0,
                remainingPoints: limiter.points - (res ? res.consumedPoints : 0),
                msBeforeNext: res ? res.msBeforeNext : 0,
                isBlocked: res ? res.consumedPoints >= limiter.points : false
            };
        } catch (error) {
            console.error('Error getting rate limit status:', error);
            return null;
        }
    }

    /**
     * Reset rate limit for a key
     */
    async resetRateLimit(limiterName, key) {
        const limiter = this.limiters.get(limiterName) || this.globalLimiter;
        if (!limiter) {
            return false;
        }

        try {
            await limiter.delete(key);
            return true;
        } catch (error) {
            console.error('Error resetting rate limit:', error);
            return false;
        }
    }

    /**
     * Block a key
     */
    async blockKey(limiterName, key, durationSec) {
        const limiter = this.limiters.get(limiterName) || this.globalLimiter;
        if (!limiter) {
            return false;
        }

        try {
            await limiter.block(key, durationSec);
            return true;
        } catch (error) {
            console.error('Error blocking key:', error);
            return false;
        }
    }

    /**
     * Get Express rate limiter (for backward compatibility)
     */
    getExpressLimiter(config) {
        const limiterConfig = {
            windowMs: config.windowMs || this.config.global.windowMs,
            max: config.max || this.config.global.max,
            message: config.message || this.config.global.message,
            standardHeaders: config.standardHeaders ?? this.config.global.standardHeaders,
            legacyHeaders: config.legacyHeaders ?? this.config.global.legacyHeaders,
            skipSuccessfulRequests: config.skipSuccessfulRequests || false,
            skipFailedRequests: config.skipFailedRequests || false,
            keyGenerator: config.keyGenerator || ((req) => {
                return req.user?.id || this.getClientIp(req);
            }),
            handler: (req, res) => {
                this.handleRateLimitExceeded(req, res, {
                    msBeforeNext: config.windowMs,
                    totalPoints: config.max,
                    remainingPoints: 0
                }, 'Express limiter');
            }
        };

        // Use Redis store if available
        if (this.config.store?.type === 'redis' && this.cacheManager) {
            limiterConfig.store = new RedisStore({
                client: this.cacheManager.getClient(),
                prefix: config.prefix || this.config.store.prefix
            });
        }

        return rateLimit(limiterConfig);
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Clear all limiters
        this.limiters.clear();
        this.endpointLimiters.clear();
        this.userLimiters.clear();
        this.tenantLimiters.clear();
        this.ipLimiters.clear();
        this.globalLimiter = null;
    }
}

module.exports = { RateLimitMiddleware };