'use strict';

/**
 * @fileoverview CSRF protection middleware for preventing cross-site request forgery
 * @module shared/lib/middleware/security/csrf-protection
 * @requires module:csurf
 * @requires module:crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/session-model
 * @requires module:shared/config
 */

const csrf = require('csurf');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const SessionModel = require('../../database/models/auth/session-model');
const config = require('../../../config');

/**
 * @class CSRFProtectionMiddleware
 * @description Implements comprehensive CSRF protection with double-submit cookies and synchronizer tokens
 */
class CSRFProtectionMiddleware {
  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #csrfMiddleware;

  /**
   * @private
   * @type {Set}
   */
  #exemptPaths;

  /**
   * @private
   * @type {Map}
   */
  #tokenStore;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    cookie: {
      key: '_csrf',
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 86400000, // 24 hours
      signed: true
    },
    token: {
      length: 32,
      algorithm: 'sha256',
      saltLength: 8,
      headerName: 'x-csrf-token',
      bodyField: '_csrf',
      queryParam: '_csrf'
    },
    doubleSubmit: {
      enabled: true,
      cookieName: 'csrf-token',
      headerName: 'x-csrf-token'
    },
    session: {
      enabled: true,
      key: 'csrfSecret'
    },
    exemptPaths: [
      '/api/webhooks',
      '/api/health',
      '/api/metrics',
      '/api/security/csp-report'
    ],
    exemptMethods: ['GET', 'HEAD', 'OPTIONS'],
    validation: {
      strictMode: process.env.NODE_ENV === 'production',
      validateReferer: true,
      validateOrigin: true,
      allowedOrigins: config.security?.csrf?.allowedOrigins || [process.env.APP_URL],
      timeWindow: 3600000 // 1 hour
    },
    monitoring: {
      logViolations: true,
      trackMetrics: true,
      alertOnRepeatedFailures: true,
      failureThreshold: 5
    }
  };

  /**
   * Creates CSRF protection middleware instance
   * @param {Object} [options] - Configuration options
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(options = {}, cacheService, auditService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#exemptPaths = new Set(this.#config.exemptPaths);
    this.#tokenStore = new Map();

    // Initialize CSRF middleware
    this.#initializeCSRFMiddleware();

    logger.info('CSRFProtectionMiddleware initialized', {
      doubleSubmitEnabled: this.#config.doubleSubmit.enabled,
      sessionEnabled: this.#config.session.enabled,
      strictMode: this.#config.validation.strictMode
    });
  }

  /**
   * Returns CSRF protection middleware
   * @param {Object} [options] - Runtime options
   * @returns {Function} Express middleware function
   */
  getMiddleware(options = {}) {
    return async (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Check if path is exempt
        if (this.#isExemptPath(req.path) || this.#isExemptMethod(req.method)) {
          return next();
        }

        // Validate request origin
        if (this.#config.validation.validateOrigin || this.#config.validation.validateReferer) {
          const originValid = await this.#validateRequestOrigin(req);
          if (!originValid) {
            throw new AppError(
              'Invalid request origin',
              403,
              ERROR_CODES.CSRF_ORIGIN_MISMATCH,
              { correlationId }
            );
          }
        }

        // Apply CSRF protection based on configuration
        if (this.#config.doubleSubmit.enabled) {
          await this.#doubleSubmitCookieValidation(req, res, next);
        } else {
          await this.#synchronizerTokenValidation(req, res, next);
        }

        // Track successful validation
        if (this.#config.monitoring.trackMetrics) {
          this.#trackMetrics('success', Date.now() - startTime);
        }

      } catch (error) {
        const duration = Date.now() - startTime;

        // Log CSRF violation
        if (this.#config.monitoring.logViolations) {
          await this.#logCSRFViolation(req, error, correlationId);
        }

        // Track failure
        if (this.#config.monitoring.trackMetrics) {
          this.#trackMetrics('failure', duration);
        }

        // Check for repeated failures
        if (this.#config.monitoring.alertOnRepeatedFailures) {
          await this.#checkRepeatedFailures(req);
        }

        logger.error('CSRF protection failed', {
          correlationId,
          error: error.message,
          path: req.path,
          method: req.method,
          duration
        });

        if (error.code === 'EBADCSRFTOKEN') {
          next(new AppError(
            'Invalid CSRF token',
            403,
            ERROR_CODES.CSRF_TOKEN_INVALID,
            { correlationId }
          ));
        } else {
          next(error instanceof AppError ? error : new AppError(
            'CSRF protection error',
            403,
            ERROR_CODES.CSRF_PROTECTION_ERROR,
            { correlationId, originalError: error.message }
          ));
        }
      }
    };
  }

  /**
   * Generates CSRF token for request
   * @param {Object} req - Express request object
   * @returns {string} CSRF token
   */
  generateToken(req) {
    try {
      if (this.#config.doubleSubmit.enabled) {
        return this.#generateDoubleSubmitToken(req);
      } else {
        return req.csrfToken ? req.csrfToken() : this.#generateSynchronizerToken(req);
      }
    } catch (error) {
      logger.error('Error generating CSRF token', { error: error.message });
      throw new AppError(
        'Failed to generate CSRF token',
        500,
        ERROR_CODES.CSRF_TOKEN_GENERATION_ERROR
      );
    }
  }

  /**
   * Adds path to CSRF exemption list
   * @param {string} path - Path to exempt
   */
  addExemptPath(path) {
    this.#exemptPaths.add(path);
    logger.debug('Path added to CSRF exemption', { path });
  }

  /**
   * Removes path from CSRF exemption list
   * @param {string} path - Path to remove
   */
  removeExemptPath(path) {
    this.#exemptPaths.delete(path);
    logger.debug('Path removed from CSRF exemption', { path });
  }

  /**
   * Middleware to inject CSRF token into response locals
   * @returns {Function} Express middleware function
   */
  injectToken() {
    return (req, res, next) => {
      try {
        const token = this.generateToken(req);
        
        // Make token available in templates
        res.locals.csrfToken = token;
        
        // Set token in response header
        res.setHeader(this.#config.token.headerName, token);
        
        // Set token cookie for double-submit
        if (this.#config.doubleSubmit.enabled) {
          res.cookie(this.#config.doubleSubmit.cookieName, token, {
            ...this.#config.cookie,
            httpOnly: false // Must be readable by JavaScript
          });
        }

        next();
      } catch (error) {
        logger.error('Error injecting CSRF token', { error: error.message });
        next(error);
      }
    };
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const envConfig = {
      cookie: {
        secure: config.security?.csrf?.secureCookie ?? (process.env.NODE_ENV === 'production'),
        sameSite: config.security?.csrf?.sameSite || 'strict'
      },
      validation: {
        strictMode: config.security?.csrf?.strictMode ?? (process.env.NODE_ENV === 'production'),
        allowedOrigins: config.security?.csrf?.allowedOrigins || [
          process.env.APP_URL,
          process.env.API_URL
        ].filter(Boolean)
      },
      exemptPaths: config.security?.csrf?.exemptPaths || CSRFProtectionMiddleware.#DEFAULT_CONFIG.exemptPaths
    };

    return {
      ...CSRFProtectionMiddleware.#DEFAULT_CONFIG,
      ...envConfig,
      ...options,
      cookie: {
        ...CSRFProtectionMiddleware.#DEFAULT_CONFIG.cookie,
        ...envConfig.cookie,
        ...options.cookie
      },
      validation: {
        ...CSRFProtectionMiddleware.#DEFAULT_CONFIG.validation,
        ...envConfig.validation,
        ...options.validation
      }
    };
  }

  /**
   * @private
   * Initializes CSRF middleware
   */
  #initializeCSRFMiddleware() {
    if (!this.#config.doubleSubmit.enabled) {
      // Use csurf for synchronizer token pattern
      this.#csrfMiddleware = csrf({
        cookie: this.#config.session.enabled ? false : this.#config.cookie,
        sessionKey: this.#config.session.key,
        value: (req) => {
          // Custom token extraction
          return req.body[this.#config.token.bodyField] ||
                 req.query[this.#config.token.queryParam] ||
                 req.headers[this.#config.token.headerName] ||
                 req.headers[this.#config.token.headerName.toLowerCase()];
        }
      });
    }
  }

  /**
   * @private
   * Double-submit cookie validation
   */
  async #doubleSubmitCookieValidation(req, res, next) {
    const cookieToken = req.cookies[this.#config.doubleSubmit.cookieName];
    const headerToken = req.headers[this.#config.doubleSubmit.headerName] ||
                       req.headers[this.#config.doubleSubmit.headerName.toLowerCase()] ||
                       req.body[this.#config.token.bodyField];

    if (!cookieToken || !headerToken) {
      throw new AppError(
        'CSRF token missing',
        403,
        ERROR_CODES.CSRF_TOKEN_MISSING
      );
    }

    // Validate tokens match
    if (!this.#compareTokens(cookieToken, headerToken)) {
      throw new AppError(
        'CSRF token mismatch',
        403,
        ERROR_CODES.CSRF_TOKEN_MISMATCH
      );
    }

    // Validate token age
    const tokenData = await this.#validateTokenAge(cookieToken);
    if (!tokenData.valid) {
      throw new AppError(
        'CSRF token expired',
        403,
        ERROR_CODES.CSRF_TOKEN_EXPIRED
      );
    }

    // Store validated token in request
    req.csrfTokenValidated = true;
    req.csrfToken = () => cookieToken;

    next();
  }

  /**
   * @private
   * Synchronizer token validation
   */
  async #synchronizerTokenValidation(req, res, next) {
    // Use csurf middleware
    this.#csrfMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      // Additional validation
      if (this.#config.validation.strictMode) {
        const token = req.csrfToken();
        const sessionToken = req.session?.[this.#config.session.key];

        if (sessionToken && !this.#compareTokens(token, sessionToken)) {
          return next(new AppError(
            'Session CSRF token mismatch',
            403,
            ERROR_CODES.CSRF_SESSION_MISMATCH
          ));
        }
      }

      next();
    });
  }

  /**
   * @private
   * Generates double-submit token
   */
  #generateDoubleSubmitToken(req) {
    const timestamp = Date.now();
    const salt = crypto.randomBytes(this.#config.token.saltLength).toString('hex');
    const sessionId = req.sessionID || req.auth?.session?.id || 'anonymous';
    
    const data = `${sessionId}:${timestamp}:${salt}`;
    const hash = crypto
      .createHmac(this.#config.token.algorithm, config.security?.csrf?.secret || process.env.CSRF_SECRET || 'csrf-secret')
      .update(data)
      .digest('hex');

    const token = Buffer.from(`${timestamp}:${salt}:${hash}`).toString('base64');
    
    // Store token metadata
    this.#tokenStore.set(token, {
      timestamp,
      sessionId,
      used: false
    });

    return token;
  }

  /**
   * @private
   * Generates synchronizer token
   */
  #generateSynchronizerToken(req) {
    const token = crypto.randomBytes(this.#config.token.length).toString('hex');
    
    // Store in session if available
    if (req.session) {
      req.session[this.#config.session.key] = token;
    }

    return token;
  }

  /**
   * @private
   * Compares tokens in constant time
   */
  #compareTokens(token1, token2) {
    if (!token1 || !token2 || token1.length !== token2.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(token1),
      Buffer.from(token2)
    );
  }

  /**
   * @private
   * Validates token age
   */
  async #validateTokenAge(token) {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      const [timestamp] = decoded.split(':');
      
      const tokenAge = Date.now() - parseInt(timestamp);
      const isValid = tokenAge <= this.#config.validation.timeWindow;

      // Check if token was already used
      const tokenData = this.#tokenStore.get(token);
      if (tokenData?.used && this.#config.validation.strictMode) {
        return { valid: false, reason: 'Token already used' };
      }

      if (isValid && tokenData) {
        tokenData.used = true;
      }

      return { valid: isValid, age: tokenAge };
    } catch (error) {
      logger.error('Error validating token age', { error: error.message });
      return { valid: false, reason: 'Invalid token format' };
    }
  }

  /**
   * @private
   * Validates request origin
   */
  async #validateRequestOrigin(req) {
    const origin = req.headers.origin || req.headers.referer;
    const host = req.headers.host;

    if (!origin && this.#config.validation.strictMode) {
      return false;
    }

    if (origin) {
      try {
        const originUrl = new URL(origin);
        const hostUrl = new URL(`${req.protocol}://${host}`);

        // Check if origin matches host
        if (originUrl.host === hostUrl.host) {
          return true;
        }

        // Check allowed origins
        return this.#config.validation.allowedOrigins.some(allowed => {
          if (allowed === '*') return true;
          const allowedUrl = new URL(allowed);
          return originUrl.host === allowedUrl.host;
        });
      } catch (error) {
        logger.warn('Invalid origin header', { origin, error: error.message });
        return false;
      }
    }

    return true;
  }

  /**
   * @private
   * Checks if path is exempt
   */
  #isExemptPath(path) {
    return this.#exemptPaths.has(path) || 
           Array.from(this.#exemptPaths).some(exempt => {
             if (exempt.includes('*')) {
               const regex = new RegExp(exempt.replace(/\*/g, '.*'));
               return regex.test(path);
             }
             return false;
           });
  }

  /**
   * @private
   * Checks if method is exempt
   */
  #isExemptMethod(method) {
    return this.#config.exemptMethods.includes(method.toUpperCase());
  }

  /**
   * @private
   * Logs CSRF violation
   */
  async #logCSRFViolation(req, error, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'security.csrf_violation',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        severity: 'warning',
        correlationId,
        metadata: {
          path: req.path,
          method: req.method,
          origin: req.headers.origin,
          referer: req.headers.referer,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          error: error.message
        }
      });

      // Cache failure for repeated failure detection
      const failureKey = `csrf_failure:${req.ip}`;
      const failures = await this.#cacheService.get(failureKey) || 0;
      await this.#cacheService.set(failureKey, failures + 1, 3600); // 1 hour

    } catch (err) {
      logger.error('Failed to log CSRF violation', { error: err.message });
    }
  }

  /**
   * @private
   * Checks for repeated failures
   */
  async #checkRepeatedFailures(req) {
    try {
      const failureKey = `csrf_failure:${req.ip}`;
      const failures = await this.#cacheService.get(failureKey) || 0;

      if (failures >= this.#config.monitoring.failureThreshold) {
        logger.error('Repeated CSRF failures detected', {
          ipAddress: req.ip,
          failures,
          threshold: this.#config.monitoring.failureThreshold
        });

        // Could trigger additional security measures here
        await this.#auditService.logEvent({
          event: 'security.csrf_repeated_failures',
          severity: 'critical',
          metadata: {
            ipAddress: req.ip,
            failures,
            userAgent: req.headers['user-agent']
          }
        });
      }
    } catch (error) {
      logger.error('Error checking repeated failures', { error: error.message });
    }
  }

  /**
   * @private
   * Tracks metrics
   */
  #trackMetrics(result, duration) {
    try {
      // Implementation would send to metrics service
      logger.debug('CSRF metrics', {
        result,
        duration,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error tracking metrics', { error: error.message });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `csrf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleans up expired tokens
   */
  cleanupTokens() {
    const now = Date.now();
    let cleaned = 0;

    this.#tokenStore.forEach((data, token) => {
      if (now - data.timestamp > this.#config.validation.timeWindow) {
        this.#tokenStore.delete(token);
        cleaned++;
      }
    });

    logger.info('CSRF token cleanup completed', { cleaned });
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates CSRF protection middleware instance
 * @param {Object} [options] - Configuration options
 * @returns {CSRFProtectionMiddleware} Middleware instance
 */
const getCSRFProtectionMiddleware = (options) => {
  if (!instance) {
    instance = new CSRFProtectionMiddleware(options);
    
    // Schedule token cleanup
    setInterval(() => {
      instance.cleanupTokens();
    }, 3600000); // Every hour
  }
  return instance;
};

module.exports = {
  CSRFProtectionMiddleware,
  getCSRFProtectionMiddleware,
  // Export convenience methods
  csrfProtection: (options) => getCSRFProtectionMiddleware(options).getMiddleware(),
  generateCSRFToken: (req) => getCSRFProtectionMiddleware().generateToken(req),
  injectCSRFToken: () => getCSRFProtectionMiddleware().injectToken()
};