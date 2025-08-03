'use strict';

/**
 * @fileoverview Admin rate limiting middleware with enhanced security - FIXED VERSION
 * @module servers/admin-server/middleware/admin-rate-limit
 * @requires module:express-rate-limit
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 */

const rateLimit = require('express-rate-limit');
const logger = require('../../../shared/lib/utils/logger');

/**
 * @class AdminRateLimitMiddleware
 * @description Enhanced rate limiting for admin operations with timeout protection
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
   * @private
   * @static
   * @type {boolean}
   */
  static #initializationAttempted = false;

  /**
   * @private
   * @static
   * @type {Map<string, number>}
   */
  static #memoryStore = new Map();

  /**
   * FIXED: Get or initialize cache service with timeout protection
   * @private
   * @static
   * @returns {Object|null} Cache service instance
   */
  static #getCacheService() {
    if (this.#initializationAttempted && !this.#cacheService) {
      return null; // Don't retry failed initialization
    }

    if (!this.#cacheService && !this.#initializationAttempted) {
      this.#initializationAttempted = true;
      
      try {
        // FIXED: Set immediate timeout for initialization
        const initPromise = new Promise((resolve, reject) => {
          try {
            const CacheService = require('../../../shared/lib/services/cache-service');
            
            if (typeof CacheService.getInstance === 'function') {
              resolve(CacheService.getInstance({
                namespace: 'admin_rate_limit',
                fallbackToMemory: true,
                connectTimeout: 1000, // 1 second max
                retryAttempts: 0 // No retries
              }));
            } else {
              resolve(new CacheService({
                namespace: 'admin_rate_limit',
                fallbackToMemory: true,
                connectTimeout: 1000,
                retryAttempts: 0
              }));
            }
          } catch (error) {
            reject(error);
          }
        });

        // FIXED: Race against timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Cache service initialization timeout')), 1500);
        });

        Promise.race([initPromise, timeoutPromise])
          .then(service => {
            this.#cacheService = service;
            logger.info('Cache service initialized for admin rate limiting');
          })
          .catch(error => {
            logger.warn('Cache service initialization failed, using memory-only rate limiting', {
              error: error.message
            });
            this.#cacheService = null;
          });

        // Return null immediately, don't wait for async initialization
        return null;
      } catch (error) {
        logger.warn('Cache service module not available, using memory-only rate limiting', {
          error: error.message
        });
        this.#cacheService = null;
      }
    }

    return this.#cacheService;
  }

  /**
   * FIXED: Create memory-based fallback store
   * @private
   * @static
   * @param {number} windowMs - Window duration in milliseconds
   * @returns {Object} Memory-based rate limit store
   */
  static #createMemoryStore(windowMs) {
    return {
      incr: async (key) => {
        try {
          const now = Date.now();
          const windowStart = now - windowMs;
          
          // Clean old entries
          this.#memoryStore.forEach((timestamp, storeKey) => {
            if (timestamp < windowStart) {
              this.#memoryStore.delete(storeKey);
            }
          });
          
          // Count current hits in window
          let hitCount = 0;
          this.#memoryStore.forEach((timestamp, storeKey) => {
            if (storeKey.startsWith(key + ':') && timestamp >= windowStart) {
              hitCount++;
            }
          });
          
          // Add new hit
          const hitKey = `${key}:${now}:${Math.random()}`;
          this.#memoryStore.set(hitKey, now);
          hitCount++;
          
          return {
            totalHits: hitCount,
            resetTime: new Date(now + windowMs)
          };
        } catch (error) {
          logger.error('Memory store incr error', { key, error: error.message });
          return { totalHits: 1, resetTime: new Date(Date.now() + windowMs) };
        }
      },

      decrement: async (key) => {
        // Memory store doesn't support reliable decrement
        return { totalHits: 0 };
      },

      resetKey: async (key) => {
        try {
          const keysToDelete = [];
          this.#memoryStore.forEach((_, storeKey) => {
            if (storeKey.startsWith(key + ':')) {
              keysToDelete.push(storeKey);
            }
          });
          keysToDelete.forEach(k => this.#memoryStore.delete(k));
        } catch (error) {
          logger.error('Memory store reset error', { key, error: error.message });
        }
      }
    };
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
   * FIXED: Create store for rate limiting with fallback
   * @private
   * @static
   * @param {number} windowMs - Window duration in milliseconds
   * @returns {Object} Rate limit store
   */
  static #createStore(windowMs) {
    const cacheService = this.#getCacheService();
    
    if (!cacheService) {
      logger.debug('Using memory-based rate limiting store');
      return this.#createMemoryStore(windowMs);
    }

    return {
      incr: async (key) => {
        try {
          const ttl = Math.ceil(windowMs / 1000);
          const current = await Promise.race([
            cacheService.increment(key, 1, ttl),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Cache operation timeout')), 2000);
            })
          ]);
          
          return {
            totalHits: current,
            resetTime: new Date(Date.now() + windowMs)
          };
        } catch (error) {
          logger.warn('Cache service rate limit operation failed, falling back to memory', {
            key,
            error: error.message
          });
          
          // Fallback to memory store
          const memoryStore = this.#createMemoryStore(windowMs);
          return await memoryStore.incr(key);
        }
      },

      decrement: async (key) => {
        try {
          if (cacheService && cacheService.decrement) {
            const current = await Promise.race([
              cacheService.decrement(key, 1),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Cache operation timeout')), 1000);
              })
            ]);
            return { totalHits: Math.max(0, current) };
          }
        } catch (error) {
          logger.warn('Cache decrement failed', { key, error: error.message });
        }
        return { totalHits: 0 };
      },

      resetKey: async (key) => {
        try {
          if (cacheService && cacheService.delete) {
            await Promise.race([
              cacheService.delete(key),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Cache operation timeout')), 1000);
              })
            ]);
          }
        } catch (error) {
          logger.warn('Cache reset failed', { key, error: error.message });
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
   * FIXED: Reset rate limit for a specific key with timeout
   * @static
   * @param {string} ip - IP address
   * @param {string} [type='general'] - Rate limit type
   * @returns {Promise<void>}
   */
  static async resetLimit(ip, type = 'general') {
    try {
      const key = `admin_${type}:${ip}`;
      const store = this.#createStore(this.#config[type]?.windowMs || 900000);
      
      await Promise.race([
        store.resetKey(key),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Reset operation timeout')), 2000);
        })
      ]);
      
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
   * FIXED: Get current rate limit status for an IP with timeout
   * @static
   * @param {string} ip - IP address
   * @param {string} [type='general'] - Rate limit type
   * @returns {Promise<Object>} Rate limit status
   */
  static async getStatus(ip, type = 'general') {
    try {
      const cacheService = this.#getCacheService();
      
      if (!cacheService) {
        return {
          available: false,
          reason: 'Cache service not available',
          fallbackToMemory: true
        };
      }

      const key = `admin_${type}:${ip}`;
      const config = this.#config[type] || this.#config.general;
      
      const [current, ttl] = await Promise.race([
        Promise.all([
          cacheService.get(key).catch(() => 0),
          cacheService.ttl(key).catch(() => -1)
        ]),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Status check timeout')), 2000);
        })
      ]);
      
      return {
        available: true,
        current: current || 0,
        limit: config.max,
        remaining: Math.max(0, config.max - (current || 0)),
        resetTime: ttl > 0 ? new Date(Date.now() + (ttl * 1000)) : null,
        windowMs: config.windowMs
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        ip,
        type,
        error: error.message
      });
      return { 
        available: false, 
        error: error.message,
        fallbackToMemory: true
      };
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
      cacheAvailable: !!this.#cacheService,
      initializationAttempted: this.#initializationAttempted,
      memoryStoreSize: this.#memoryStore.size
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