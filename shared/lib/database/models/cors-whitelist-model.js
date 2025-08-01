'use strict';

/**
 * @fileoverview Simplified CORS configuration module for development
 * @module shared/lib/middleware/cors-config
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/config
 */

const logger = require('../../../lib/utils/logger');
const CacheService = require('../../services/cache-service');
const config = require('../../../config');

/**
 * @class CorsConfig
 * @description Simplified CORS configuration for development with static origins
 */
class CorsConfig {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Set<string>}
   */
  #staticOrigins;

  /**
   * @private
   * @type {RegExp[]}
   */
  #originPatterns;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    origins: {
      allowed: process.env.CORS_ALLOWED_ORIGINS ? 
        process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [],
      patterns: process.env.CORS_ORIGIN_PATTERNS ?
        process.env.CORS_ORIGIN_PATTERNS.split(',').map(p => p.trim()) : [],
      allowSubdomains: process.env.CORS_ALLOW_SUBDOMAINS === 'true',
      validateSSL: process.env.NODE_ENV === 'production'
    },
    credentials: process.env.CORS_CREDENTIALS !== 'false',
    methods: process.env.CORS_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS || 
      'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Correlation-ID,X-Tenant-ID',
    exposedHeaders: process.env.CORS_EXPOSED_HEADERS || 
      'X-Total-Count,X-Page-Count,X-Current-Page,X-Rate-Limit-Remaining,X-Correlation-ID',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10), // 24 hours
    preflightContinue: process.env.CORS_PREFLIGHT_CONTINUE === 'true',
    optionsSuccessStatus: parseInt(process.env.CORS_OPTIONS_STATUS || '204', 10),
    cache: {
      enabled: process.env.CORS_CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CORS_CACHE_TTL || '3600', 10), // 1 hour
      prefix: 'cors:origins:'
    },
    security: {
      blockNullOrigin: process.env.CORS_BLOCK_NULL_ORIGIN !== 'false',
      requireHTTPS: process.env.NODE_ENV === 'production',
      validateOrigin: true,
      maxOriginLength: 2000
    }
  };

  /**
   * Creates CorsConfig instance
   * @param {Object} [options] - Configuration options
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#staticOrigins = new Set();
    this.#originPatterns = [];

    // Initialize configurations
    this.#initializeStaticOrigins();
    this.#initializeOriginPatterns();

    logger.info('CorsConfig initialized (simplified)', {
      staticOrigins: this.#staticOrigins.size,
      patterns: this.#originPatterns.length,
      environment: process.env.NODE_ENV
    });
  }

  /**
   * Gets CORS configuration options
   * @param {Object} [context] - Request context
   * @returns {Promise<Object>} CORS options object
   */
  async getCorsOptions(context = {}) {
    const corsOptions = {
      origin: await this.#createOriginValidator(context),
      credentials: this.#config.credentials,
      methods: this.#config.methods,
      allowedHeaders: this.#config.allowedHeaders,
      exposedHeaders: this.#config.exposedHeaders,
      maxAge: this.#config.maxAge,
      preflightContinue: this.#config.preflightContinue,
      optionsSuccessStatus: this.#config.optionsSuccessStatus
    };

    return corsOptions;
  }

  /**
   * Validates an origin
   * @param {string} origin - Origin to validate
   * @param {Object} [context] - Request context
   * @returns {Promise<boolean>} Whether origin is allowed
   */
  async isOriginAllowed(origin, context = {}) {
    try {
      // Security checks
      if (!this.#performSecurityChecks(origin)) {
        return false;
      }

      // Check cache first
      const cacheKey = this.#getOriginCacheKey(origin);
      const cached = await this.#cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Check static origins
      if (this.#staticOrigins.has(origin)) {
        await this.#cacheOriginResult(origin, true);
        return true;
      }

      // Check patterns
      if (this.#matchesPattern(origin)) {
        await this.#cacheOriginResult(origin, true);
        return true;
      }

      await this.#cacheOriginResult(origin, false);
      return false;

    } catch (error) {
      logger.error('Error validating origin', {
        origin,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Adds an origin to the whitelist (in-memory only)
   * @param {string} origin - Origin to add
   * @param {Object} [options] - Addition options
   * @returns {Promise<void>}
   */
  async addOrigin(origin, options = {}) {
    try {
      // Validate origin format
      if (!this.#isValidOrigin(origin)) {
        throw new Error(`Invalid origin format: ${origin}`);
      }

      this.#staticOrigins.add(origin);

      // Clear cache
      await this.#clearOriginCache(origin);

      logger.info('Origin added to whitelist (in-memory)', { origin });

    } catch (error) {
      logger.error('Failed to add origin', {
        origin,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Removes an origin from the whitelist
   * @param {string} origin - Origin to remove
   * @returns {Promise<void>}
   */
  async removeOrigin(origin) {
    try {
      this.#staticOrigins.delete(origin);
      await this.#clearOriginCache(origin);

      logger.info('Origin removed from whitelist', { origin });

    } catch (error) {
      logger.error('Failed to remove origin', {
        origin,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lists all configured origins
   * @returns {Promise<Array>} List of origins
   */
  async listOrigins() {
    const origins = [];

    // Add static origins
    this.#staticOrigins.forEach(origin => {
      origins.push({
        origin,
        type: 'static',
        source: 'config'
      });
    });

    // Add pattern origins
    this.#originPatterns.forEach(pattern => {
      origins.push({
        origin: pattern.source,
        type: 'pattern',
        source: 'config'
      });
    });

    return origins;
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...CorsConfig.#DEFAULT_CONFIG };

    Object.keys(CorsConfig.#DEFAULT_CONFIG).forEach(key => {
      if (typeof CorsConfig.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(CorsConfig.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...CorsConfig.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Initializes static origins from configuration
   */
  #initializeStaticOrigins() {
    // Add configured origins
    this.#config.origins.allowed.forEach(origin => {
      if (this.#isValidOrigin(origin)) {
        this.#staticOrigins.add(origin);
      } else {
        logger.warn('Invalid origin in configuration', { origin });
      }
    });

    // Add development origins
    if (process.env.NODE_ENV === 'development') {
      const devOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5000',
        'http://localhost:5001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5000',
        'http://127.0.0.1:5001'
      ];

      devOrigins.forEach(origin => {
        this.#staticOrigins.add(origin);
      });

      logger.info('Development origins added', { count: devOrigins.length });
    }

    // Add origins from environment variables
    if (process.env.CORS_ORIGINS) {
      const envOrigins = process.env.CORS_ORIGINS.split(',').map(o => o.trim());
      envOrigins.forEach(origin => {
        if (this.#isValidOrigin(origin)) {
          this.#staticOrigins.add(origin);
        }
      });
    }
  }

  /**
   * @private
   * Initializes origin patterns
   */
  #initializeOriginPatterns() {
    this.#config.origins.patterns.forEach(pattern => {
      try {
        this.#originPatterns.push(new RegExp(pattern));
      } catch (error) {
        logger.warn('Invalid origin pattern', { pattern, error: error.message });
      }
    });

    // Add subdomain pattern if enabled
    if (this.#config.origins.allowSubdomains && process.env.APP_DOMAIN) {
      const domain = process.env.APP_DOMAIN.replace(/\./g, '\\.');
      this.#originPatterns.push(
        new RegExp(`^https?://([a-z0-9-]+\\.)*${domain}$`, 'i')
      );
    }
  }

  /**
   * @private
   * Creates origin validator function for CORS
   */
  async #createOriginValidator(context) {
    return async (origin, callback) => {
      try {
        // Handle missing origin (same-origin requests)
        if (!origin) {
          callback(null, !this.#config.security.blockNullOrigin);
          return;
        }

        const allowed = await this.isOriginAllowed(origin, context);
        
        if (allowed) {
          callback(null, true);
        } else {
          logger.debug('Origin not allowed', { origin });
          
          // In development, log the rejected origin for debugging
          if (process.env.NODE_ENV === 'development') {
            logger.warn('CORS: Origin rejected', { 
              origin,
              availableOrigins: Array.from(this.#staticOrigins)
            });
          }
          
          callback(new Error('Not allowed by CORS'));
        }

      } catch (error) {
        logger.error('Origin validation error', {
          origin,
          error: error.message
        });
        callback(error);
      }
    };
  }

  /**
   * @private
   * Performs security checks on origin
   */
  #performSecurityChecks(origin) {
    if (!origin || typeof origin !== 'string') {
      return false;
    }

    // Check origin length
    if (origin.length > this.#config.security.maxOriginLength) {
      logger.warn('Origin exceeds maximum length', { 
        origin: origin.substring(0, 100) + '...',
        length: origin.length 
      });
      return false;
    }

    // Validate origin format
    if (!this.#isValidOrigin(origin)) {
      return false;
    }

    // Check HTTPS requirement
    if (this.#config.security.requireHTTPS && !origin.startsWith('https://')) {
      // Allow localhost in development
      if (process.env.NODE_ENV !== 'development' || 
          (!origin.includes('localhost') && !origin.includes('127.0.0.1'))) {
        logger.debug('Non-HTTPS origin blocked', { origin });
        return false;
      }
    }

    return true;
  }

  /**
   * @private
   * Validates origin format
   */
  #isValidOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.origin === origin && ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  /**
   * @private
   * Checks if origin matches any pattern
   */
  #matchesPattern(origin) {
    return this.#originPatterns.some(pattern => pattern.test(origin));
  }

  /**
   * @private
   * Gets origin cache key
   */
  #getOriginCacheKey(origin) {
    return `${this.#config.cache.prefix}${origin}`;
  }

  /**
   * @private
   * Caches origin validation result
   */
  async #cacheOriginResult(origin, allowed) {
    if (!this.#config.cache.enabled) return;

    const cacheKey = this.#getOriginCacheKey(origin);
    await this.#cacheService.set(cacheKey, allowed, this.#config.cache.ttl);
  }

  /**
   * @private
   * Clears origin from cache
   */
  async #clearOriginCache(origin) {
    if (!this.#config.cache.enabled) return;

    await this.#cacheService.clear(`${this.#config.cache.prefix}${origin}`);
  }

  /**
   * Gets configuration summary
   * @returns {Object} Configuration summary
   */
  getConfigSummary() {
    return {
      staticOrigins: this.#staticOrigins.size,
      patterns: this.#originPatterns.length,
      credentials: this.#config.credentials,
      methods: this.#config.methods,
      cacheEnabled: this.#config.cache.enabled,
      environment: process.env.NODE_ENV
    };
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates CorsConfig instance
 * @param {Object} [options] - Configuration options
 * @returns {CorsConfig} CorsConfig instance
 */
const getCorsConfig = (options) => {
  if (!instance) {
    instance = new CorsConfig(options);
  }
  return instance;
};

module.exports = {
  CorsConfig,
  getCorsConfig,
  // Export convenience methods
  getCorsOptions: (context) => getCorsConfig().getCorsOptions(context),
  isOriginAllowed: (origin, context) => getCorsConfig().isOriginAllowed(origin, context),
  addOrigin: (origin, options) => getCorsConfig().addOrigin(origin, options),
  removeOrigin: (origin) => getCorsConfig().removeOrigin(origin),
  listOrigins: () => getCorsConfig().listOrigins()
};