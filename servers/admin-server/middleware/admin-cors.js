'use strict';

/**
 * @fileoverview Admin-specific CORS middleware with stricter security
 * @module servers/admin-server/middleware/admin-cors
 * @requires module:shared/lib/middleware/cors-config
 * @requires module:shared/lib/utils/logger
 * @requires module:servers/admin-server/config
 */

const { CorsConfig } = require('../../../shared/lib/middleware/cors-config');
const logger = require('../../../shared/lib/utils/logger');
const config = require('../config');
const cors = require('cors');

/**
 * @class AdminCorsMiddleware
 * @description CORS middleware with admin-specific security policies
 */
class AdminCorsMiddleware {
  /**
   * @private
   * @static
   * @type {CorsConfig}
   */
  static #corsConfig;

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #adminCorsOptions = {
    origins: {
      allowed: config.cors?.allowedOrigins || [
        process.env.ADMIN_FRONTEND_URL,
        process.env.ADMIN_STAGING_URL
      ].filter(Boolean),
      dynamic: false, // Admin doesn't support dynamic origins
      patterns: config.cors?.patterns || [],
      allowSubdomains: false, // Strict origin matching for admin
      validateSSL: process.env.NODE_ENV === 'production'
    },
    credentials: true, // Always require credentials for admin
    methods: 'GET,PUT,POST,DELETE,PATCH,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Admin-Token',
      'X-Session-ID',
      'X-CSRF-Token',
      'X-Requested-With',
      'X-Correlation-ID',
      'X-Admin-Action'
    ].join(','),
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Rate-Limit-Remaining',
      'X-Session-Expires',
      'X-CSRF-Token'
    ].join(','),
    maxAge: 600, // 10 minutes for admin (shorter than customer)
    preflightContinue: false,
    optionsSuccessStatus: 204,
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
      prefix: 'admin:cors:'
    },
    security: {
      blockNullOrigin: true,
      requireHTTPS: process.env.NODE_ENV === 'production',
      validateOrigin: true,
      maxOriginLength: 255
    }
  };

  /**
   * Initialize admin CORS configuration
   * @static
   */
  static initialize() {
    try {
      this.#corsConfig = new CorsConfig(this.#adminCorsOptions);
      
      logger.info('Admin CORS middleware initialized', {
        allowedOrigins: this.#adminCorsOptions.origins.allowed.length,
        environment: process.env.NODE_ENV
      });
    } catch (error) {
      logger.error('Failed to initialize admin CORS', { error: error.message });
      throw error;
    }
  }

  /**
   * Get CORS middleware for admin routes
   * @static
   * @returns {Function} Express CORS middleware
   */
  static middleware() {
    if (!this.#corsConfig) {
      this.initialize();
    }

    return async (req, res, next) => {
      try {
        // Get CORS options with admin context
        const corsOptions = await this.#corsConfig.getCorsOptions({
          tenantId: req.admin?.organizationId,
          userId: req.admin?._id,
          sessionId: req.session?.id
        });

        // Add admin-specific validations
        const enhancedOptions = {
          ...corsOptions,
          origin: async (origin, callback) => {
            try {
              // Special handling for admin development
              if (process.env.NODE_ENV === 'development' && !origin) {
                // Allow same-origin requests in development
                return callback(null, true);
              }

              // Validate origin through base CORS config
              const originalValidator = corsOptions.origin;
              await originalValidator(origin, async (error, allowed) => {
                if (error || !allowed) {
                  logger.warn('Admin CORS blocked origin', {
                    origin,
                    ip: req.ip,
                    path: req.path
                  });
                  return callback(error || new Error('Not allowed by admin CORS'));
                }

                // Additional admin-specific checks
                const isAdminOrigin = await this.#validateAdminOrigin(origin, req);
                if (!isAdminOrigin) {
                  return callback(new Error('Invalid admin origin'));
                }

                callback(null, true);
              });
            } catch (error) {
              logger.error('Admin CORS validation error', {
                error: error.message,
                origin
              });
              callback(error);
            }
          }
        };

        // Apply CORS with enhanced options
        cors(enhancedOptions)(req, res, next);

      } catch (error) {
        logger.error('Admin CORS middleware error', {
          error: error.message,
          path: req.path
        });
        next(error);
      }
    };
  }

  /**
   * Middleware for strict CORS (no wildcards allowed)
   * @static
   * @returns {Function} Express middleware
   */
  static strict() {
    return cors({
      origin: (origin, callback) => {
        const allowedOrigins = this.#adminCorsOptions.origins.allowed;
        
        if (!origin && process.env.NODE_ENV === 'development') {
          // Allow same-origin in development
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('Strict CORS blocked origin', { origin });
          callback(new Error('Not allowed by strict admin CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-CSRF-Token'],
      maxAge: 300
    });
  }

  /**
   * Add admin-specific CORS headers manually
   * @static
   * @returns {Function} Express middleware
   */
  static headers() {
    return (req, res, next) => {
      // Add security headers specific to admin
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Admin-specific headers
      res.setHeader('X-Admin-API', 'true');
      res.setHeader('X-API-Version', config.apiVersion || 'v1');
      
      next();
    };
  }

  /**
   * @private
   * Validate admin-specific origin requirements
   */
  static async #validateAdminOrigin(origin, req) {
    // Check if origin is in admin whitelist
    if (!this.#adminCorsOptions.origins.allowed.includes(origin)) {
      // Check if it matches any admin pattern
      const adminPatterns = [
        /^https:\/\/admin\./,
        /^https:\/\/[a-z0-9-]+\.admin\./
      ];

      const matchesAdminPattern = adminPatterns.some(pattern => 
        pattern.test(origin)
      );

      if (!matchesAdminPattern) {
        return false;
      }
    }

    // Additional security checks for production
    if (process.env.NODE_ENV === 'production') {
      // Ensure HTTPS
      if (!origin.startsWith('https://')) {
        return false;
      }

      // Validate against known admin domains
      const adminDomains = config.security?.adminDomains || [];
      const originUrl = new URL(origin);
      
      if (adminDomains.length > 0 && !adminDomains.includes(originUrl.hostname)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get current CORS configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#adminCorsOptions,
      initialized: !!this.#corsConfig
    };
  }

  /**
   * Update allowed origins dynamically
   * @static
   * @param {Array<string>} origins - New allowed origins
   */
  static async updateAllowedOrigins(origins) {
    if (!Array.isArray(origins)) {
      throw new Error('Origins must be an array');
    }

    // Validate each origin
    const validOrigins = origins.filter(origin => {
      try {
        new URL(origin);
        return true;
      } catch {
        logger.warn('Invalid origin format', { origin });
        return false;
      }
    });

    this.#adminCorsOptions.origins.allowed = validOrigins;
    
    // Reinitialize CORS config
    this.initialize();

    logger.info('Admin CORS origins updated', {
      count: validOrigins.length,
      origins: validOrigins
    });
  }
}

// Initialize on module load
AdminCorsMiddleware.initialize();

// Export middleware functions
module.exports = {
  middleware: AdminCorsMiddleware.middleware.bind(AdminCorsMiddleware),
  strict: AdminCorsMiddleware.strict.bind(AdminCorsMiddleware),
  headers: AdminCorsMiddleware.headers.bind(AdminCorsMiddleware),
  getConfig: AdminCorsMiddleware.getConfig.bind(AdminCorsMiddleware),
  updateAllowedOrigins: AdminCorsMiddleware.updateAllowedOrigins.bind(AdminCorsMiddleware)
};