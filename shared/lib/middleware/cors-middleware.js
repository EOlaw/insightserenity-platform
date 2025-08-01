'use strict';

/**
 * @fileoverview CORS middleware implementation with multi-tenant support
 * @module shared/lib/middleware/cors-middleware
 * @requires module:cors
 * @requires module:shared/lib/middleware/cors-config
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/config
 */

const cors = require('cors');
const { getCorsConfig } = require('./cors-config');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const AuditService = require('../security/audit/audit-service');
const config = require('./helmet-config');

/**
 * @class CorsMiddleware
 * @description Enhanced CORS middleware with security features and multi-tenant support
 */
class CorsMiddleware {
  /**
   * @private
   * @type {CorsConfig}
   */
  #corsConfig;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #corsInstances;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #originMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enableForAllRoutes: process.env.CORS_ENABLE_ALL !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true',
    auditCorsViolations: process.env.CORS_AUDIT_VIOLATIONS === 'true',
    blockOnViolation: process.env.CORS_BLOCK_ON_VIOLATION === 'true',
    customHeaders: {
      'X-Permitted-Cross-Domain-Policies': 'none',
      'X-DNS-Prefetch-Control': 'off'
    },
    metrics: {
      enabled: process.env.CORS_METRICS_ENABLED !== 'false',
      sampleRate: parseFloat(process.env.CORS_METRICS_SAMPLE_RATE || '0.1')
    },
    errorHandling: {
      exposeErrors: process.env.NODE_ENV !== 'production',
      customErrorMessage: 'Cross-Origin Request Blocked',
      logViolations: true
    },
    bypass: {
      paths: process.env.CORS_BYPASS_PATHS ? 
        process.env.CORS_BYPASS_PATHS.split(',').map(p => p.trim()) : [],
      userAgents: process.env.CORS_BYPASS_USER_AGENTS ?
        process.env.CORS_BYPASS_USER_AGENTS.split(',').map(ua => ua.trim()) : []
    }
  };

  /**
   * Creates CorsMiddleware instance
   * @param {Object} [options] - Middleware configuration
   * @param {CorsConfig} [corsConfig] - CORS configuration instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(options = {}, corsConfig, auditService) {
    this.#config = { ...CorsMiddleware.#DEFAULT_CONFIG, ...options };
    this.#corsConfig = corsConfig || getCorsConfig();
    this.#auditService = auditService || new AuditService();
    this.#corsInstances = new Map();
    this.#originMetrics = new Map();

    logger.info('CorsMiddleware initialized', {
      enableForAllRoutes: this.#config.enableForAllRoutes,
      trustProxy: this.#config.trustProxy,
      auditEnabled: this.#config.auditCorsViolations
    });
  }

  /**
   * Creates CORS middleware
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  middleware(options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Check bypass conditions
        if (this.#shouldBypass(req)) {
          return next();
        }

        // Extract context
        const context = this.#extractContext(req);

        // Get or create CORS instance
        const corsInstance = await this.#getCorsInstance(context, options);

        // Apply CORS with error handling
        corsInstance(req, res, (err) => {
          if (err) {
            this.#handleCorsError(err, req, res, correlationId);
          } else {
            // Add custom headers
            this.#addCustomHeaders(res);

            // Track metrics
            if (this.#config.metrics.enabled) {
              this.#trackOriginMetrics(req.headers.origin);
            }

            next();
          }
        });

      } catch (error) {
        logger.error('CORS middleware error', {
          correlationId,
          error: error.message,
          origin: req.headers.origin
        });

        this.#handleCorsError(error, req, res, correlationId);
      }
    };
  }

  /**
   * Creates CORS middleware for specific routes
   * @param {Array<string>} routes - Route patterns
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  forRoutes(routes, options = {}) {
    const routePatterns = routes.map(route => {
      if (typeof route === 'string') {
        return new RegExp(route.replace(/\*/g, '.*'));
      }
      return route;
    });

    return (req, res, next) => {
      const matches = routePatterns.some(pattern => {
        if (pattern instanceof RegExp) {
          return pattern.test(req.path);
        }
        return req.path === pattern;
      });

      if (matches) {
        return this.middleware(options)(req, res, next);
      }

      next();
    };
  }

  /**
   * Creates CORS middleware for specific origins
   * @param {Array<string>} origins - Allowed origins
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  forOrigins(origins, options = {}) {
    return this.middleware({
      ...options,
      origin: (origin, callback) => {
        if (!origin || origins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    });
  }

  /**
   * Creates preflight handler
   * @param {Object} [options] - Handler options
   * @returns {Function} Express middleware function
   */
  preflight(options = {}) {
    return async (req, res, next) => {
      if (req.method !== 'OPTIONS') {
        return next();
      }

      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        const context = this.#extractContext(req);
        const corsOptions = await this.#corsConfig.getCorsOptions(context);

        // Handle preflight request
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Methods', corsOptions.methods);
        res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders);
        res.header('Access-Control-Max-Age', corsOptions.maxAge);

        if (corsOptions.credentials) {
          res.header('Access-Control-Allow-Credentials', 'true');
        }

        // Add custom headers
        this.#addCustomHeaders(res);

        logger.debug('Preflight request handled', {
          correlationId,
          origin: req.headers.origin,
          method: req.headers['access-control-request-method']
        });

        res.status(corsOptions.optionsSuccessStatus).end();

      } catch (error) {
        logger.error('Preflight handling error', {
          correlationId,
          error: error.message
        });

        res.status(500).json({
          error: this.#config.errorHandling.exposeErrors ? 
            error.message : 
            'Internal server error'
        });
      }
    };
  }

  /**
   * Validates CORS policy for a request
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} Validation result
   */
  async validateRequest(req) {
    const origin = req.headers.origin;
    const context = this.#extractContext(req);

    try {
      const allowed = await this.#corsConfig.isOriginAllowed(origin, context);

      return {
        valid: allowed,
        origin,
        context,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('CORS validation error', {
        origin,
        error: error.message
      });

      return {
        valid: false,
        origin,
        context,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * @private
   * Extracts context from request
   */
  #extractContext(req) {
    return {
      tenantId: req.tenantId || 
                req.headers['x-tenant-id'] || 
                req.auth?.user?.organizationId,
      userId: req.auth?.user?._id,
      ip: this.#getClientIP(req),
      userAgent: req.headers['user-agent'],
      correlationId: req.correlationId
    };
  }

  /**
   * @private
   * Gets client IP address
   */
  #getClientIP(req) {
    if (this.#config.trustProxy) {
      return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.headers['x-real-ip'] ||
             req.connection.remoteAddress;
    }
    return req.connection.remoteAddress;
  }

  /**
   * @private
   * Gets or creates CORS instance for context
   */
  async #getCorsInstance(context, options) {
    const cacheKey = this.#getCorsInstanceKey(context, options);
    
    // Check cache
    let corsInstance = this.#corsInstances.get(cacheKey);
    if (corsInstance) {
      return corsInstance;
    }

    // Get CORS options
    const corsOptions = await this.#corsConfig.getCorsOptions(context);

    // Merge with provided options
    const finalOptions = {
      ...corsOptions,
      ...options,
      // Override origin function to use our validator
      origin: async (origin, callback) => {
        try {
          if (!origin && !corsOptions.credentials) {
            // Allow requests without origin header (same-origin)
            callback(null, true);
            return;
          }

          const allowed = await this.#corsConfig.isOriginAllowed(origin, context);
          
          if (allowed) {
            callback(null, true);
          } else {
            const error = new Error(this.#config.errorHandling.customErrorMessage);
            error.statusCode = 403;
            error.origin = origin;
            callback(error);
          }

        } catch (error) {
          logger.error('Origin validation error in CORS', {
            origin,
            error: error.message
          });
          callback(error);
        }
      }
    };

    // Create CORS instance
    corsInstance = cors(finalOptions);

    // Cache instance
    this.#corsInstances.set(cacheKey, corsInstance);

    // Limit cache size
    if (this.#corsInstances.size > 100) {
      const firstKey = this.#corsInstances.keys().next().value;
      this.#corsInstances.delete(firstKey);
    }

    return corsInstance;
  }

  /**
   * @private
   * Gets CORS instance cache key
   */
  #getCorsInstanceKey(context, options) {
    const parts = [
      context.tenantId || 'global',
      options.credentials ? 'cred' : 'nocred',
      options.methods || 'default'
    ];
    return parts.join(':');
  }

  /**
   * @private
   * Checks if request should bypass CORS
   */
  #shouldBypass(req) {
    // Check bypass paths
    if (this.#config.bypass.paths.some(path => req.path.startsWith(path))) {
      return true;
    }

    // Check bypass user agents
    const userAgent = req.headers['user-agent'];
    if (userAgent && this.#config.bypass.userAgents.some(ua => 
      userAgent.includes(ua))) {
      return true;
    }

    // Health check endpoints
    if (req.path === '/health' || req.path === '/ready') {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Adds custom security headers
   */
  #addCustomHeaders(res) {
    Object.entries(this.#config.customHeaders).forEach(([header, value]) => {
      res.setHeader(header, value);
    });
  }

  /**
   * @private
   * Handles CORS errors
   */
  #handleCorsError(error, req, res, correlationId) {
    const origin = req.headers.origin;
    const isViolation = error.message?.includes('Not allowed by CORS') || 
                       error.statusCode === 403;

    if (isViolation) {
      // Log violation
      if (this.#config.errorHandling.logViolations) {
        logger.warn('CORS policy violation', {
          correlationId,
          origin,
          method: req.method,
          path: req.path,
          ip: this.#getClientIP(req)
        });
      }

      // Audit violation
      if (this.#config.auditCorsViolations) {
        this.#auditCorsViolation(req, origin, correlationId).catch(err =>
          logger.error('Failed to audit CORS violation', { error: err.message })
        );
      }

      // Block request if configured
      if (this.#config.blockOnViolation) {
        return res.status(403).json({
          error: this.#config.errorHandling.customErrorMessage,
          correlationId
        });
      }
    }

    // Handle other errors
    const statusCode = error.statusCode || 500;
    const message = this.#config.errorHandling.exposeErrors ? 
      error.message : 
      'Internal server error';

    res.status(statusCode).json({
      error: message,
      correlationId
    });
  }

  /**
   * @private
   * Audits CORS violation
   */
  async #auditCorsViolation(req, origin, correlationId) {
    await this.#auditService.logEvent({
      event: 'security.cors.violation',
      severity: 'warning',
      userId: req.auth?.user?._id,
      organizationId: req.auth?.user?.organizationId,
      ipAddress: this.#getClientIP(req),
      userAgent: req.headers['user-agent'],
      correlationId,
      metadata: {
        origin,
        method: req.method,
        path: req.path,
        headers: {
          'access-control-request-method': req.headers['access-control-request-method'],
          'access-control-request-headers': req.headers['access-control-request-headers']
        }
      }
    });
  }

  /**
   * @private
   * Tracks origin metrics
   */
  #trackOriginMetrics(origin) {
    if (!origin || Math.random() > this.#config.metrics.sampleRate) {
      return;
    }

    const count = this.#originMetrics.get(origin) || 0;
    this.#originMetrics.set(origin, count + 1);

    // Periodic cleanup
    if (this.#originMetrics.size > 1000) {
      const entries = Array.from(this.#originMetrics.entries());
      entries.sort((a, b) => b[1] - a[1]);
      
      // Keep top 500
      this.#originMetrics = new Map(entries.slice(0, 500));
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `cors_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets CORS metrics
   * @returns {Object} CORS metrics
   */
  getMetrics() {
    const topOrigins = Array.from(this.#originMetrics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([origin, count]) => ({ origin, count }));

    return {
      totalOrigins: this.#originMetrics.size,
      topOrigins,
      corsInstances: this.#corsInstances.size,
      configuration: this.#corsConfig.getConfigSummary()
    };
  }

  /**
   * Clears CORS instance cache
   */
  clearCache() {
    this.#corsInstances.clear();
    logger.info('CORS instance cache cleared');
  }

  /**
   * Updates CORS configuration
   * @param {Object} updates - Configuration updates
   * @returns {Promise<void>}
   */
  async updateConfiguration(updates) {
    // This would update the configuration
    // Implementation depends on specific requirements
    logger.info('CORS configuration updated', { updates });
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates CorsMiddleware instance
 * @param {Object} [options] - Middleware options
 * @returns {CorsMiddleware} CorsMiddleware instance
 */
const getCorsMiddleware = (options) => {
  if (!instance) {
    instance = new CorsMiddleware(options);
  }
  return instance;
};

module.exports = {
  CorsMiddleware,
  getCorsMiddleware,
  // Export convenience methods
  cors: (options) => getCorsMiddleware().middleware(options),
  corsForRoutes: (routes, options) => getCorsMiddleware().forRoutes(routes, options),
  corsForOrigins: (origins, options) => getCorsMiddleware().forOrigins(origins, options),
  corsPreflight: (options) => getCorsMiddleware().preflight(options),
  validateCors: (req) => getCorsMiddleware().validateRequest(req)
};