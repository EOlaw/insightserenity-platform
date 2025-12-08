/**
 * @fileoverview Middleware Index
 * @module shared/lib/middleware
 * @description Central export point for all middleware modules
 */

const authMiddleware = require('./auth-middleware');
const permissionMiddleware = require('./permission-middleware');
const rateLimiterMiddleware = require('./rate-limiter');

module.exports = {
    // Auth middleware
    ...authMiddleware,

    // Permission middleware
    ...permissionMiddleware,

    // Rate limiter middleware
    ...rateLimiterMiddleware
};

// Also export individual modules for direct import
module.exports.auth = authMiddleware;
module.exports.permissions = permissionMiddleware;
module.exports.rateLimit = rateLimiterMiddleware;