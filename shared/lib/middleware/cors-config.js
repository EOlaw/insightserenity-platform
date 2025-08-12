'use strict';

/**
 * @fileoverview CORS configuration module with dynamic origin management
 * @module shared/lib/middleware/cors-config
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/cors-whitelist-model
 * @requires module:shared/lib/database/models/tenant-model
 * @requires module:shared/lib/config
 */

const logger = require('../utils/logger');
const CacheService = require('../services/cache-service');
const CorsWhitelistModel = require('../database/models/security/cors-whitelist-model');
const TenantModel = require('../database/models/organizations/tenant-model');
const config = require('./helmet-config');

/**
 * @class CorsConfig
 * @description Dynamic CORS configuration with environment-based and database-driven origins
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
   * @type {Map<string, Set<string>>}
   */
  #tenantOrigins;

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
      dynamic: process.env.CORS_DYNAMIC_ORIGINS === 'true',
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
    },
    multiTenant: {
      enabled: process.env.CORS_MULTI_TENANT === 'true',
      isolateOrigins: true,
      inheritGlobalOrigins: false
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #ORIGIN_TYPES = {
    STATIC: 'static',
    PATTERN: 'pattern',
    DYNAMIC: 'dynamic',
    TENANT: 'tenant'
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
    this.#tenantOrigins = new Map();
    this.#originPatterns = [];

    // Initialize configurations
    this.#initializeStaticOrigins();
    this.#initializeOriginPatterns();

    // Load dynamic origins if enabled
    if (this.#config.origins.dynamic) {
      this.#loadDynamicOrigins().catch(err => 
        logger.error('Failed to load dynamic CORS origins', { error: err.message })
      );
    }

    logger.info('CorsConfig initialized', {
      staticOrigins: this.#staticOrigins.size,
      patterns: this.#originPatterns.length,
      dynamicEnabled: this.#config.origins.dynamic,
      multiTenantEnabled: this.#config.multiTenant.enabled
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

    // Add tenant-specific headers if multi-tenant
    if (this.#config.multiTenant.enabled && context.tenantId) {
      corsOptions.allowedHeaders = this.#appendTenantHeaders(corsOptions.allowedHeaders);
    }

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
      const cacheKey = this.#getOriginCacheKey(origin, context.tenantId);
      const cached = await this.#cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Check static origins
      if (this.#staticOrigins.has(origin)) {
        await this.#cacheOriginResult(origin, true, context.tenantId);
        return true;
      }

      // Check patterns
      if (this.#matchesPattern(origin)) {
        await this.#cacheOriginResult(origin, true, context.tenantId);
        return true;
      }

      // Check tenant-specific origins
      if (context.tenantId && this.#config.multiTenant.enabled) {
        const allowed = await this.#checkTenantOrigin(origin, context.tenantId);
        if (allowed) {
          await this.#cacheOriginResult(origin, true, context.tenantId);
          return true;
        }
      }

      // Check dynamic origins
      if (this.#config.origins.dynamic) {
        const allowed = await this.#checkDynamicOrigin(origin, context);
        await this.#cacheOriginResult(origin, allowed, context.tenantId);
        return allowed;
      }

      await this.#cacheOriginResult(origin, false, context.tenantId);
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
   * Adds an origin to the whitelist
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

      if (options.tenantId && this.#config.multiTenant.enabled) {
        // Add tenant-specific origin
        await this.#addTenantOrigin(origin, options.tenantId, options);
      } else {
        // Add global origin
        this.#staticOrigins.add(origin);
        
        if (options.persist && this.#config.origins.dynamic) {
          await CorsWhitelistModel.create({
            origin,
            type: CorsConfig.#ORIGIN_TYPES.STATIC,
            isActive: true,
            metadata: options.metadata
          });
        }
      }

      // Clear cache
      await this.#clearOriginCache(origin);

      logger.info('Origin added to whitelist', {
        origin,
        tenantId: options.tenantId,
        persisted: options.persist
      });

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
   * @param {Object} [options] - Removal options
   * @returns {Promise<void>}
   */
  async removeOrigin(origin, options = {}) {
    try {
      if (options.tenantId && this.#config.multiTenant.enabled) {
        // Remove tenant-specific origin
        await this.#removeTenantOrigin(origin, options.tenantId);
      } else {
        // Remove global origin
        this.#staticOrigins.delete(origin);
        
        if (this.#config.origins.dynamic) {
          await CorsWhitelistModel.deleteOne({ origin });
        }
      }

      // Clear cache
      await this.#clearOriginCache(origin);

      logger.info('Origin removed from whitelist', {
        origin,
        tenantId: options.tenantId
      });

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
   * @param {Object} [filter] - Filter options
   * @returns {Promise<Array>} List of origins
   */
  async listOrigins(filter = {}) {
    const origins = [];

    // Add static origins
    this.#staticOrigins.forEach(origin => {
      origins.push({
        origin,
        type: CorsConfig.#ORIGIN_TYPES.STATIC,
        source: 'config'
      });
    });

    // Add pattern origins
    this.#originPatterns.forEach(pattern => {
      origins.push({
        origin: pattern.source,
        type: CorsConfig.#ORIGIN_TYPES.PATTERN,
        source: 'config'
      });
    });

    // Add tenant origins if requested
    if (filter.tenantId && this.#config.multiTenant.enabled) {
      const tenantOrigins = this.#tenantOrigins.get(filter.tenantId);
      if (tenantOrigins) {
        tenantOrigins.forEach(origin => {
          origins.push({
            origin,
            type: CorsConfig.#ORIGIN_TYPES.TENANT,
            tenantId: filter.tenantId,
            source: 'tenant'
          });
        });
      }
    }

    // Add dynamic origins
    if (this.#config.origins.dynamic && !filter.staticOnly) {
      const dynamicOrigins = await CorsWhitelistModel.find({
        isActive: true,
        ...(filter.tenantId && { tenantId: filter.tenantId })
      });

      dynamicOrigins.forEach(record => {
        origins.push({
          origin: record.origin,
          type: record.type,
          tenantId: record.tenantId,
          source: 'database',
          metadata: record.metadata
        });
      });
    }

    return origins;
  }

  /**
   * Reloads dynamic origins from database
   * @returns {Promise<void>}
   */
  async reloadOrigins() {
    try {
      logger.info('Reloading CORS origins');

      if (this.#config.origins.dynamic) {
        await this.#loadDynamicOrigins();
      }

      if (this.#config.multiTenant.enabled) {
        await this.#loadTenantOrigins();
      }

      // Clear cache
      await this.#cacheService.clear(`${this.#config.cache.prefix}*`);

      logger.info('CORS origins reloaded successfully');

    } catch (error) {
      logger.error('Failed to reload CORS origins', {
        error: error.message
      });
      throw error;
    }
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
    this.#config.origins.allowed.forEach(origin => {
      if (this.#isValidOrigin(origin)) {
        this.#staticOrigins.add(origin);
      } else {
        logger.warn('Invalid origin in configuration', { origin });
      }
    });

    // Add localhost origins in development
    if (process.env.NODE_ENV === 'development') {
      this.#staticOrigins.add('http://localhost:3000');
      this.#staticOrigins.add('http://localhost:3001');
      this.#staticOrigins.add('http://127.0.0.1:3000');
      this.#staticOrigins.add('http://127.0.0.1:3001');
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
          logger.debug('Origin not allowed', { 
            origin, 
            tenantId: context.tenantId 
          });
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
   * Loads dynamic origins from database
   */
  async #loadDynamicOrigins() {
    try {
      const origins = await CorsWhitelistModel.find({
        isActive: true,
        type: { $ne: CorsConfig.#ORIGIN_TYPES.TENANT }
      });

      origins.forEach(record => {
        if (record.type === CorsConfig.#ORIGIN_TYPES.STATIC) {
          this.#staticOrigins.add(record.origin);
        } else if (record.type === CorsConfig.#ORIGIN_TYPES.PATTERN) {
          try {
            this.#originPatterns.push(new RegExp(record.origin));
          } catch (error) {
            logger.warn('Invalid pattern in database', {
              pattern: record.origin,
              error: error.message
            });
          }
        }
      });

      logger.info('Dynamic origins loaded', { count: origins.length });

    } catch (error) {
      logger.error('Failed to load dynamic origins', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Loads tenant-specific origins
   */
  async #loadTenantOrigins() {
    try {
      const tenantOrigins = await CorsWhitelistModel.find({
        isActive: true,
        type: CorsConfig.#ORIGIN_TYPES.TENANT,
        tenantId: { $exists: true }
      });

      tenantOrigins.forEach(record => {
        if (!this.#tenantOrigins.has(record.tenantId)) {
          this.#tenantOrigins.set(record.tenantId, new Set());
        }
        this.#tenantOrigins.get(record.tenantId).add(record.origin);
      });

      logger.info('Tenant origins loaded', {
        tenants: this.#tenantOrigins.size,
        totalOrigins: tenantOrigins.length
      });

    } catch (error) {
      logger.error('Failed to load tenant origins', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Checks tenant-specific origin
   */
  async #checkTenantOrigin(origin, tenantId) {
    // Check in-memory cache
    const tenantOrigins = this.#tenantOrigins.get(tenantId);
    if (tenantOrigins && tenantOrigins.has(origin)) {
      return true;
    }

    // Check if global origins should be inherited
    if (this.#config.multiTenant.inheritGlobalOrigins && 
        this.#staticOrigins.has(origin)) {
      return true;
    }

    // Check database if dynamic
    if (this.#config.origins.dynamic) {
      const record = await CorsWhitelistModel.findOne({
        origin,
        tenantId,
        isActive: true
      });
      
      if (record) {
        // Update in-memory cache
        if (!this.#tenantOrigins.has(tenantId)) {
          this.#tenantOrigins.set(tenantId, new Set());
        }
        this.#tenantOrigins.get(tenantId).add(origin);
        return true;
      }
    }

    return false;
  }

  /**
   * @private
   * Checks dynamic origin
   */
  async #checkDynamicOrigin(origin, context) {
    const query = {
      origin,
      isActive: true
    };

    if (context.tenantId) {
      query.$or = [
        { tenantId: context.tenantId },
        { tenantId: null }
      ];
    }

    const record = await CorsWhitelistModel.findOne(query);
    return !!record;
  }

  /**
   * @private
   * Adds tenant-specific origin
   */
  async #addTenantOrigin(origin, tenantId, options) {
    if (!this.#tenantOrigins.has(tenantId)) {
      this.#tenantOrigins.set(tenantId, new Set());
    }
    this.#tenantOrigins.get(tenantId).add(origin);

    if (options.persist && this.#config.origins.dynamic) {
      await CorsWhitelistModel.create({
        origin,
        tenantId,
        type: CorsConfig.#ORIGIN_TYPES.TENANT,
        isActive: true,
        metadata: options.metadata
      });
    }
  }

  /**
   * @private
   * Removes tenant-specific origin
   */
  async #removeTenantOrigin(origin, tenantId) {
    const tenantOrigins = this.#tenantOrigins.get(tenantId);
    if (tenantOrigins) {
      tenantOrigins.delete(origin);
    }

    if (this.#config.origins.dynamic) {
      await CorsWhitelistModel.deleteOne({ origin, tenantId });
    }
  }

  /**
   * @private
   * Appends tenant-specific headers
   */
  #appendTenantHeaders(headers) {
    const tenantHeaders = ['X-Tenant-ID', 'X-Organization-ID'];
    const headerArray = headers.split(',').map(h => h.trim());
    
    tenantHeaders.forEach(header => {
      if (!headerArray.includes(header)) {
        headerArray.push(header);
      }
    });

    return headerArray.join(',');
  }

  /**
   * @private
   * Gets origin cache key
   */
  #getOriginCacheKey(origin, tenantId) {
    const base = `${this.#config.cache.prefix}${origin}`;
    return tenantId ? `${base}:${tenantId}` : base;
  }

  /**
   * @private
   * Caches origin validation result
   */
  async #cacheOriginResult(origin, allowed, tenantId) {
    if (!this.#config.cache.enabled) return;

    const cacheKey = this.#getOriginCacheKey(origin, tenantId);
    await this.#cacheService.set(cacheKey, allowed, this.#config.cache.ttl);
  }

  /**
   * @private
   * Clears origin from cache
   */
  async #clearOriginCache(origin) {
    if (!this.#config.cache.enabled) return;

    await this.#cacheService.clear(`${this.#config.cache.prefix}${origin}*`);
  }

  /**
   * Gets configuration summary
   * @returns {Object} Configuration summary
   */
  getConfigSummary() {
    return {
      staticOrigins: this.#staticOrigins.size,
      patterns: this.#originPatterns.length,
      tenants: this.#tenantOrigins.size,
      credentials: this.#config.credentials,
      methods: this.#config.methods,
      dynamicEnabled: this.#config.origins.dynamic,
      multiTenantEnabled: this.#config.multiTenant.enabled,
      cacheEnabled: this.#config.cache.enabled
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
  removeOrigin: (origin, options) => getCorsConfig().removeOrigin(origin, options),
  listOrigins: (filter) => getCorsConfig().listOrigins(filter),
  reloadOrigins: () => getCorsConfig().reloadOrigins()
};