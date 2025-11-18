/**
 * @fileoverview Rate Limiting Middleware
 * @module servers/gateway/middleware/rate-limit
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware Factory
 */
module.exports = (options = {}) => {
    const defaults = {
        windowMs: 60000, // 1 minute
        max: 100,
        message: 'Too many requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
        validate: {
            trustProxy: false  // Explicitly disable validation for trust proxy
        },
        keyGenerator: (req) => {
            // Use IP + user ID for authenticated requests
            const userId = req.auth?.userId || req.user?.id;
            return userId ? `${req.ip}:${userId}` : req.ip;
        },
        skip: (req) => {
            // Skip for certain paths or conditions
            if (req.path === '/health' || req.path === '/ready') {
                return true;
            }

            // Check if user has special rate limit privileges
            if (req.auth?.rateLimit) {
                req.rateLimit = { limit: req.auth.rateLimit };
            }

            return false;
        },
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: options.message || 'Too many requests, please try again later',
                    retryAfter: req.rateLimit?.resetTime || res.getHeader('X-RateLimit-Reset')
                }
            });
        }
    };

    // Merge options with defaults
    const config = { ...defaults, ...options };

    return rateLimit(config);
};
