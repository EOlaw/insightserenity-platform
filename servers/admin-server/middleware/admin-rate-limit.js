'use strict';

/**
 * @fileoverview Admin-specific rate limiting middleware with flexible policies
 * @module servers/admin-server/middleware/admin-rate-limit
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:servers/admin-server/config
 */

const rateLimiter = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { CacheService } = require('../../../shared/lib/services/cache-service');
const logger = require('../../../shared/lib/utils/logger');
const AppError = require('../../../shared/lib/utils/app-error');
const config = require('../config');
const { ERROR_CODES } = require('../../../shared/lib/utils/constants/error-codes');

/**
 * @class AdminRateLimitMiddleware
 * @description Flexible rate limiting for admin operations with role-based limits
 */
class AdminRateLimitMiddleware {
  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService = new CacheService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #rateLimitConfig = {
    global: {
      windowMs: config.rateLimit?.windowMs || 15 * 60 * 1000, // 15 minutes
      max: config.rateLimit?.max || 1000, // requests per window
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests from this admin account'
    },
    byRole: {
      SUPER_ADMIN: {
        windowMs: 15 * 60 * 1000,
        max: 5000 // Higher limit for super admins
      },
      PLATFORM_ADMIN: {
        windowMs: 15 * 60 * 1000,
        max: 2000
      },
      SUPPORT_ADMIN: {
        windowMs: 15 * 60 * 1000,
        max: 1000
      },
      BILLING_ADMIN: {
        windowMs: 15 * 60 * 1000,
        max: 1000
      }
    },
    byOperation: {
      read: { windowMs: 60000, max: 100 },
      write: { windowMs: 60000, max: 50 },
      delete: { windowMs: 60000, max: 20 },
      export: { windowMs: 300000, max: 10 },
      bulk: { windowMs: 300000, max: 5 },
      sensitive: { windowMs: 300000, max: 3 }
    }
  };

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #limiters = new Map();

  /**
   * Initialize rate limiters
   * @static
   */
  static initialize() {
    try {
      // Create role-based limiters
      Object.entries(this.#rateLimitConfig.byRole).forEach(([role, config]) => {
        this.#createLimiter(`role:${role}`, config);
      });

      // Create operation-based limiters
      Object.entries(this.#rateLimitConfig.byOperation).forEach(([operation, config]) => {
        this.#createLimiter(`operation:${operation}`, config);
      });

      logger.info('Admin rate limiters initialized', {
        limiters: Array.from(this.#limiters.keys())
      });
    } catch (error) {
      logger.error('Failed to initialize admin rate limiters', { error: error.message });
      throw error;
    }
  }

  /**
   * Global rate limit middleware
   * @static
   * @returns {Function} Express middleware
   */
  static global() {
    const limiter = this.#createLimiter('global', {
      ...this.#rateLimitConfig.global,
      keyGenerator: (req) => {
        // Use admin ID if authenticated, otherwise IP
        return req.admin?._id || req.ip;
      },
      handler: this.#handleRateLimitExceeded.bind(this),
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/metrics';
      }
    });

    return limiter;
  }

  /**
   * Role-based rate limit middleware
   * @static
   * @returns {Function} Express middleware
   */
  static byRole() {
    return async (req, res, next) => {
      try {
        if (!req.admin) {
          return next();
        }

        const role = req.admin.role;
        const limiterKey = `role:${role}`;
        const limiter = this.#limiters.get(limiterKey);

        if (!limiter) {
          logger.warn('No rate limiter found for role', { role });
          return next();
        }

        limiter(req, res, next);
      } catch (error) {
        logger.error('Role-based rate limit error', {
          error: error.message,
          role: req.admin?.role
        });
        next(error);
      }
    };
  }

  /**
   * Operation-based rate limit middleware
   * @static
   * @param {string} operationType - Type of operation
   * @returns {Function} Express middleware
   */
  static byOperation(operationType) {
    const limiterKey = `operation:${operationType}`;
    let limiter = this.#limiters.get(limiterKey);

    if (!limiter) {
      const config = this.#rateLimitConfig.byOperation[operationType] || 
                     this.#rateLimitConfig.byOperation.read;
      
      limiter = this.#createLimiter(limiterKey, {
        ...config,
        keyGenerator: (req) => `${req.admin?._id}:${operationType}`,
        message: `Too many ${operationType} operations`,
        handler: this.#handleRateLimitExceeded.bind(this)
      });
    }

    return limiter;
  }

  /**
   * Custom rate limit for specific endpoints
   * @static
   * @param {Object} options - Rate limit options
   * @returns {Function} Express middleware
   */
  static custom(options) {
    const {
      windowMs = 60000,
      max = 10,
      keyGenerator,
      message = 'Rate limit exceeded',
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;

    return this.#createLimiter(`custom:${Date.now()}`, {
      windowMs,
      max,
      message,
      keyGenerator: keyGenerator || ((req) => req.admin?._id || req.ip),
      handler: this.#handleRateLimitExceeded.bind(this),
      skipSuccessfulRequests,
      skipFailedRequests,
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  /**
   * Adaptive rate limiting based on system load
   * @static
   * @returns {Function} Express middleware
   */
  static adaptive() {
    return async (req, res, next) => {
      try {
        // Get current system metrics
        const systemLoad = await this.#getSystemLoad();
        
        // Adjust rate limits based on load
        const adjustmentFactor = this.#calculateAdjustmentFactor(systemLoad);
        
        if (adjustmentFactor < 1) {
          // System under load, apply stricter limits
          const adaptiveLimit = Math.floor(this.#rateLimitConfig.global.max * adjustmentFactor);
          
          const limiter = this.#createLimiter('adaptive', {
            windowMs: this.#rateLimitConfig.global.windowMs,
            max: adaptiveLimit,
            message: 'System under high load, please retry later',
            keyGenerator: (req) => req.admin?._id || req.ip,
            handler: this.#handleRateLimitExceeded.bind(this)
          });

          return limiter(req, res, next);
        }

        // Normal load, proceed without additional limiting
        next();
      } catch (error) {
        logger.error('Adaptive rate limiting error', {
          error: error.message
        });
        // On error, proceed without adaptive limiting
        next();
      }
    };
  }

  /**
   * Reset rate limit for specific key
   * @static
   * @param {string} key - Rate limit key
   * @param {string} [limiterType='global'] - Limiter type
   * @returns {Promise<void>}
   */
  static async resetLimit(key, limiterType = 'global') {
    try {
      const cacheKey = `rate_limit:${limiterType}:${key}`;
      await this.#cacheService.delete(cacheKey);
      
      logger.info('Rate limit reset', { key, limiterType });
    } catch (error) {
      logger.error('Failed to reset rate limit', {
        error: error.message,
        key,
        limiterType
      });
      throw error;
    }
  }

  /**
   * Get current rate limit status for a key
   * @static
   * @param {string} key - Rate limit key
   * @param {string} [limiterType='global'] - Limiter type
   * @returns {Promise<Object>} Rate limit status
   */
  static async getLimitStatus(key, limiterType = 'global') {
    try {
      const config = limiterType.startsWith('role:') 
        ? this.#rateLimitConfig.byRole[limiterType.split(':')[1]]
        : this.#rateLimitConfig[limiterType] || this.#rateLimitConfig.global;

      const cacheKey = `rate_limit:${limiterType}:${key}`;
      const current = await this.#cacheService.get(cacheKey) || 0;
      
      return {
        limit: config.max,
        remaining: Math.max(0, config.max - current),
        resetAt: new Date(Date.now() + config.windowMs),
        windowMs: config.windowMs
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        error: error.message,
        key,
        limiterType
      });
      throw error;
    }
  }

  /**
   * @private
   * Create rate limiter instance
   */
  static #createLimiter(key, options) {
    const store = new RedisStore({
      client: this.#cacheService.getClient(),
      prefix: 'admin_rate_limit:'
    });

    const limiter = rateLimiter({
      store,
      ...options,
      standardHeaders: true,
      legacyHeaders: false
    });

    this.#limiters.set(key, limiter);
    return limiter;
  }

  /**
   * @private
   * Handle rate limit exceeded
   */
  static async #handleRateLimitExceeded(req, res) {
    const retryAfter = res.getHeader('Retry-After');
    const limit = res.getHeader('X-RateLimit-Limit');
    
    logger.warn('Admin rate limit exceeded', {
      adminId: req.admin?._id,
      ip: req.ip,
      path: req.path,
      method: req.method,
      retryAfter,
      limit
    });

    // Audit log for rate limit violations
    if (req.admin?._id) {
      await this.#logRateLimitViolation(req, res);
    }

    res.status(429).json({
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests',
        details: {
          retryAfter: parseInt(retryAfter) || 60,
          limit: parseInt(limit),
          resetAt: new Date(Date.now() + (parseInt(retryAfter) || 60) * 1000)
        }
      }
    });
  }

  /**
   * @private
   * Log rate limit violation for audit
   */
  static async #logRateLimitViolation(req, res) {
    try {
      const AuditLogModel = require('../../../shared/lib/database/models/audit-log-model');
      
      await AuditLogModel.create({
        action: 'admin.rate_limit_exceeded',
        userId: req.admin._id,
        resource: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        metadata: {
          path: req.path,
          limit: res.getHeader('X-RateLimit-Limit'),
          retryAfter: res.getHeader('Retry-After'),
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to log rate limit violation', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Get current system load metrics
   */
  static async #getSystemLoad() {
    try {
      // This would connect to your monitoring system
      // For now, returning mock data
      const metrics = {
        cpu: 0.65, // 65% CPU usage
        memory: 0.72, // 72% memory usage
        activeRequests: 450,
        databaseConnections: 80
      };

      return metrics;
    } catch (error) {
      logger.error('Failed to get system metrics', {
        error: error.message
      });
      return { cpu: 0.5, memory: 0.5 };
    }
  }

  /**
   * @private
   * Calculate adjustment factor based on system load
   */
  static #calculateAdjustmentFactor(metrics) {
    const { cpu = 0.5, memory = 0.5 } = metrics;
    
    // If CPU or memory usage is above 80%, start reducing limits
    const maxUsage = Math.max(cpu, memory);
    
    if (maxUsage > 0.9) {
      return 0.5; // 50% of normal limits
    } else if (maxUsage > 0.8) {
      return 0.7; // 70% of normal limits
    } else if (maxUsage > 0.7) {
      return 0.85; // 85% of normal limits
    }
    
    return 1; // Normal limits
  }
}

// Initialize on module load
AdminRateLimitMiddleware.initialize();

// Export middleware functions
module.exports = {
  global: AdminRateLimitMiddleware.global.bind(AdminRateLimitMiddleware),
  byRole: AdminRateLimitMiddleware.byRole.bind(AdminRateLimitMiddleware),
  byOperation: AdminRateLimitMiddleware.byOperation.bind(AdminRateLimitMiddleware),
  custom: AdminRateLimitMiddleware.custom.bind(AdminRateLimitMiddleware),
  adaptive: AdminRateLimitMiddleware.adaptive.bind(AdminRateLimitMiddleware),
  resetLimit: AdminRateLimitMiddleware.resetLimit.bind(AdminRateLimitMiddleware),
  getLimitStatus: AdminRateLimitMiddleware.getLimitStatus.bind(AdminRateLimitMiddleware)
};