/**
 * @fileoverview Rate Limiting Middleware
 */

const rateLimit = require('express-rate-limit');

const createRateLimiter = (options = {}) => {
    const defaults = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: 'Too many requests',
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            return req.user?.id || req.ip;
        }
    };
    
    return rateLimit({ ...defaults, ...options });
};

module.exports = {
    general: createRateLimiter(),
    
    login: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        skipSuccessfulRequests: true,
        message: 'Too many login attempts'
    }),
    
    passwordReset: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 3,
        message: 'Too many password reset requests'
    }),
    
    registration: createRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 5,
        message: 'Too many registration attempts'
    }),
    
    api: createRateLimiter({
        windowMs: 60 * 1000,
        max: 60,
        message: 'API rate limit exceeded'
    })
};
