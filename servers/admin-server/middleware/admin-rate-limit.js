'use strict';

/**
 * @fileoverview Admin rate limiting middleware with enhanced security
 * @module servers/admin-server/middleware/admin-rate-limit
 * @requires module:express-rate-limit
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 */

const rateLimit = require('express-rate-limit');
const logger = require('../../../shared/lib/utils/logger');

/**
 * @class AdminRateLimitMiddleware
 * @description Enhanced rate limiting for admin operations with different tiers
 */
class AdminRateLimitMiddleware {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    // General admin rate limiting
    general: {
      windowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW, 10) || 900000, // 15 minutes
      max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX, 10) || 1000,
      message: {
        error: {
          message: 'Too many requests from this IP for admin operations',
          code: 'ADMIN_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(900000 / 1000), // 15 minutes in seconds
          timestamp: new Date().toISOString()
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },

    // Strict rate limiting for sensitive operations
    strict: {
      windowMs: parseInt(process.env.ADMIN_STRICT_RATE_LIMIT_WINDOW, 10) || 300000, // 5 minutes
      max: parseInt(process.env.ADMIN_STRICT_RATE_LIMIT_MAX, 10) || 10,
      message: {
        error: {
          message: 'Too many sensitive operations from this IP',
          code: 'ADMIN_STRICT_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(300000 / 1000), // 5 minutes in seconds
          timestamp: new Date().toISOString()
        }
      },
      standardHeaders: true,
      legacyHeaders: false
    },

    // Login-specific rate limiting
    login: {
      windowMs: parseInt(process.env.ADMIN_LOGIN_RATE_WINDOW, 10) || 900000, // 15 minutes
      max: parseInt(process.env.ADMIN_LOGIN_RATE_MAX, 10) || 5,
      message: {
        error: {
          message: 'Too many login attempts from this IP',
          code: 'ADMIN_LOGIN_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(900000 / 1000), // 15 minutes in seconds
          timestamp: new Date().toISOString()
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true // Don't count successful logins
    }
  };

  /**
   * @private
   * @static
   * @type {Object|null}
   */
  static #cacheService = null;

  /**
   * Get or initialize cache service
   * @private
   * @static
   * @returns {Object|null} Cache service instance
   */
  static #getCacheService() {
    if (!this.#cacheService) {
      try {
        const CacheService = require('../../../shared/lib/services/cache-service');
        
        // Use singleton pattern if available
        if (typeof CacheService.getInstance === 'function') {
          this.#cacheService = CacheService.getInstance({
            namespace: 'admin_rate_limit',
            fallbackToMemory: true
          });
        } else {
          this.#cacheService = new CacheService({
            namespace: 'admin_rate_limit',
            fallbackToMemory: true
          });
        }
      } catch (error) {
        logger.warn('CacheService not available for rate limiting, using memory only', {
          error: error.message
        });
        this.#cacheService = null;
      }
    }
    return this.#cacheService;
  }

  /**
   * Create key generator for rate limiting
   * @private
   * @static
   * @param {Object} options - Key generation options
   * @returns {Function} Key generator function
   */
  static #createKeyGenerator(options = {}) {
    return (req) => {
      const baseKey = req.ip || req.connection?.remoteAddress || 'unknown';
      const prefix = options.prefix || 'admin';
      
      // Include user ID if authenticated for more precise limiting
      if (req.user?.id) {
        return `${prefix}:${baseKey}:${req.user.id}`;
      }
      
      return `${prefix}:${baseKey}`;
    };
  }

  /**
   * Create store for rate limiting
   * @private
   * @static
   * @param {number} windowMs - Window duration in milliseconds
   * @returns {Object} Rate limit store
   */
  static #createStore(windowMs) {
    const cacheService = this.#getCacheService();
    
    if (!cacheService) {
      // Fallback to default memory store
      return undefined;
    }

    return {
      incr: async (key) => {
        try {
          const ttl = Math.ceil(windowMs / 1000);
          const current = await cacheService.increment(key, 1, ttl);
          return {
            totalHits: current,
            resetTime: new Date(Date.now() + windowMs)
          };
        } catch (error) {
          logger.error('Rate limit store incr error', {
            key,
            error: error.message
          });
          throw error;
        }
      },

      decrement: async (key) => {
        try {
          const current = await cacheService.decrement(key, 1);
          return {
            totalHits: Math.max(0, current)
          };
        } catch (error) {
          logger.error('Rate limit store decrement error', {
            key,
            error: error.message
          });
          // Don't throw on decrement errors
          return { totalHits: 0 };
        }
      },

      resetKey: async (key) => {
        try {
          await cacheService.delete(key);
        } catch (error) {
          logger.error('Rate limit store reset error', {
            key,
            error: error.message
          });
        }
      }
    };
  }

  /**
   * Create enhanced rate limiter with logging
   * @private
   * @static
   * @param {Object} config - Rate limiter configuration
   * @param {string} type - Rate limiter type for logging
   * @returns {Function} Express middleware
   */
  static #createRateLimiter(config, type) {
    const limiterConfig = {
      ...config,
      keyGenerator: this.#createKeyGenerator({ prefix: `admin_${type}` }),
      store: this.#createStore(config.windowMs),
      handler: (req, res) => {
        // Enhanced logging for rate limit violations
        logger.warn('Admin rate limit exceeded', {
          type,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          path: req.path,
          method: req.method,
          userId: req.user?.id,
          timestamp: new Date().toISOString()
        });

        // Send structured error response
        res.status(429).json(config.message);
      }
      // REMOVED: onLimitReached - deprecated in express-rate-limit v7
      // Threshold logging is now handled within the handler function above
    };

    return rateLimit(limiterConfig);
  }

  /**
   * General admin rate limiting middleware
   * @static
   * @returns {Function} Express middleware
   */
  static general() {
    return this.#createRateLimiter(this.#config.general, 'general');
  }

  /**
   * Strict rate limiting for sensitive operations
   * @static
   * @returns {Function} Express middleware
   */
  static strict() {
    return this.#createRateLimiter(this.#config.strict, 'strict');
  }

  /**
   * Login-specific rate limiting
   * @static
   * @returns {Function} Express middleware
   */
  static login() {
    return this.#createRateLimiter(this.#config.login, 'login');
  }

  /**
   * API-specific rate limiting
   * @static
   * @returns {Function} Express middleware
   */
  static api() {
    const apiConfig = {
      windowMs: 60000, // 1 minute
      max: 100, // 100 requests per minute
      message: {
        error: {
          message: 'API rate limit exceeded',
          code: 'ADMIN_API_RATE_LIMIT_EXCEEDED',
          retryAfter: 60,
          timestamp: new Date().toISOString()
        }
      },
      standardHeaders: true,
      legacyHeaders: false
    };

    return this.#createRateLimiter(apiConfig, 'api');
  }

  /**
   * Custom rate limiter factory
   * @static
   * @param {Object} options - Custom rate limit options
   * @returns {Function} Express middleware
   */
  static custom(options = {}) {
    const defaultOptions = {
      windowMs: 900000, // 15 minutes
      max: 100,
      message: {
        error: {
          message: 'Rate limit exceeded',
          code: 'CUSTOM_RATE_LIMIT_EXCEEDED',
          timestamp: new Date().toISOString()
        }
      },
      standardHeaders: true,
      legacyHeaders: false
    };

    const config = { ...defaultOptions, ...options };
    return this.#createRateLimiter(config, options.type || 'custom');
  }

  /**
   * Reset rate limit for a specific key
   * @static
   * @param {string} ip - IP address
   * @param {string} [type='general'] - Rate limit type
   * @returns {Promise<void>}
   */
  static async resetLimit(ip, type = 'general') {
    const cacheService = this.#getCacheService();
    if (!cacheService) {
      logger.warn('Cannot reset rate limit - cache service not available');
      return;
    }

    try {
      const key = `admin_${type}:${ip}`;
      await cacheService.delete(key);
      logger.info('Rate limit reset', { ip, type, key });
    } catch (error) {
      logger.error('Failed to reset rate limit', {
        ip,
        type,
        error: error.message
      });
    }
  }

  /**
   * Get current rate limit status for an IP
   * @static
   * @param {string} ip - IP address
   * @param {string} [type='general'] - Rate limit type
   * @returns {Promise<Object>} Rate limit status
   */
  static async getStatus(ip, type = 'general') {
    const cacheService = this.#getCacheService();
    if (!cacheService) {
      return { available: false };
    }

    try {
      const key = `admin_${type}:${ip}`;
      const current = await cacheService.get(key) || 0;
      const ttl = await cacheService.ttl(key);
      const config = this.#config[type] || this.#config.general;
      
      return {
        available: true,
        current,
        limit: config.max,
        remaining: Math.max(0, config.max - current),
        resetTime: ttl > 0 ? new Date(Date.now() + (ttl * 1000)) : null,
        windowMs: config.windowMs
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        ip,
        type,
        error: error.message
      });
      return { available: false, error: error.message };
    }
  }

  /**
   * Get rate limit configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      cacheAvailable: !!this.#getCacheService()
    };
  }
}

// Create default export using general rate limiter
const defaultRateLimit = AdminRateLimitMiddleware.general();

// Export both default and named exports
module.exports = defaultRateLimit;
module.exports.AdminRateLimitMiddleware = AdminRateLimitMiddleware;
module.exports.general = AdminRateLimitMiddleware.general.bind(AdminRateLimitMiddleware);
module.exports.strict = AdminRateLimitMiddleware.strict.bind(AdminRateLimitMiddleware);
module.exports.login = AdminRateLimitMiddleware.login.bind(AdminRateLimitMiddleware);
module.exports.api = AdminRateLimitMiddleware.api.bind(AdminRateLimitMiddleware);
module.exports.custom = AdminRateLimitMiddleware.custom.bind(AdminRateLimitMiddleware);
module.exports.resetLimit = AdminRateLimitMiddleware.resetLimit.bind(AdminRateLimitMiddleware);
module.exports.getStatus = AdminRateLimitMiddleware.getStatus.bind(AdminRateLimitMiddleware);
module.exports.getConfig = AdminRateLimitMiddleware.getConfig.bind(AdminRateLimitMiddleware);