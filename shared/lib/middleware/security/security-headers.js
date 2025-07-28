'use strict';

/**
 * @fileoverview Security headers middleware for comprehensive HTTP security
 * @module shared/lib/middleware/security/security-headers
 * @requires module:helmet
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/config
 */

const helmet = require('helmet');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const AuditService = require('../../security/audit/audit-service');
const config = require('../../../config');

/**
 * @class SecurityHeadersMiddleware
 * @description Configures and applies comprehensive security headers using Helmet
 */
class SecurityHeadersMiddleware {
  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Map}
   */
  #customHeaders;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      },
      reportOnly: false,
      reportUri: process.env.CSP_REPORT_URI || '/api/security/csp-report'
    },
    crossOriginEmbedderPolicy: {
      policy: process.env.NODE_ENV === 'production' ? 'require-corp' : 'unsafe-none'
    },
    crossOriginOpenerPolicy: {
      policy: 'same-origin-allow-popups'
    },
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },
    dnsPrefetchControl: {
      allow: false
    },
    frameguard: {
      action: 'deny'
    },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    xssFilter: true,
    customHeaders: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-Download-Options': 'noopen',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'X-XSS-Protection': '1; mode=block',
      'Feature-Policy': "geolocation 'none'; microphone 'none'; camera 'none'",
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    },
    monitoring: {
      logViolations: true,
      alertOnCriticalViolations: true,
      trackMetrics: true
    }
  };

  /**
   * Creates security headers middleware instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(options = {}, auditService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#customHeaders = new Map();

    this.#initializeCustomHeaders();

    logger.info('SecurityHeadersMiddleware initialized', {
      environment: process.env.NODE_ENV,
      hstsEnabled: !!this.#config.hsts,
      cspEnabled: !!this.#config.contentSecurityPolicy
    });
  }

  /**
   * Returns configured Helmet middleware
   * @param {Object} [overrides] - Runtime configuration overrides
   * @returns {Function} Express middleware function
   */
  getMiddleware(overrides = {}) {
    const runtimeConfig = this.#mergeConfig(overrides);
    const helmetConfig = this.#buildHelmetConfig(runtimeConfig);

    return async (req, res, next) => {
      const startTime = Date.now();

      try {
        // Apply Helmet middleware
        const helmetMiddleware = helmet(helmetConfig);
        
        helmetMiddleware(req, res, (err) => {
          if (err) {
            logger.error('Helmet middleware error', {
              error: err.message,
              path: req.path
            });
            return next(err);
          }

          // Apply custom headers
          this.#applyCustomHeaders(req, res);

          // Monitor CSP violations
          if (req.path === runtimeConfig.contentSecurityPolicy.reportUri) {
            this.#handleCSPReport(req, res);
            return;
          }

          // Track metrics
          if (runtimeConfig.monitoring.trackMetrics) {
            this.#trackSecurityMetrics(req, res, Date.now() - startTime);
          }

          next();
        });

      } catch (error) {
        logger.error('Security headers middleware error', {
          error: error.message,
          path: req.path
        });

        next(new AppError(
          'Security headers configuration error',
          500,
          'SECURITY_HEADERS_ERROR',
          { originalError: error.message }
        ));
      }
    };
  }

  /**
   * Adds custom security header
   * @param {string} name - Header name
   * @param {string|Function} value - Header value or function
   */
  addCustomHeader(name, value) {
    this.#customHeaders.set(name, value);
    logger.debug('Custom security header added', { name });
  }

  /**
   * Removes custom security header
   * @param {string} name - Header name
   */
  removeCustomHeader(name) {
    this.#customHeaders.delete(name);
    logger.debug('Custom security header removed', { name });
  }

  /**
   * Updates CSP directive
   * @param {string} directive - CSP directive name
   * @param {Array<string>} sources - Allowed sources
   */
  updateCSPDirective(directive, sources) {
    if (!this.#config.contentSecurityPolicy.directives[directive]) {
      this.#config.contentSecurityPolicy.directives[directive] = [];
    }
    this.#config.contentSecurityPolicy.directives[directive] = sources;
    
    logger.info('CSP directive updated', { directive, sources });
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const envConfig = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: config.security?.csp?.defaultSrc || SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy.directives.defaultSrc,
          scriptSrc: config.security?.csp?.scriptSrc || SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy.directives.scriptSrc,
          styleSrc: config.security?.csp?.styleSrc || SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy.directives.styleSrc,
          imgSrc: config.security?.csp?.imgSrc || SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy.directives.imgSrc,
          connectSrc: config.security?.csp?.connectSrc || SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy.directives.connectSrc
        },
        reportUri: config.security?.csp?.reportUri || process.env.CSP_REPORT_URI
      },
      hsts: {
        maxAge: parseInt(process.env.HSTS_MAX_AGE) || SecurityHeadersMiddleware.#DEFAULT_CONFIG.hsts.maxAge,
        includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
        preload: process.env.HSTS_PRELOAD !== 'false'
      }
    };

    return {
      ...SecurityHeadersMiddleware.#DEFAULT_CONFIG,
      ...envConfig,
      ...options,
      contentSecurityPolicy: {
        ...SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy,
        ...envConfig.contentSecurityPolicy,
        ...options.contentSecurityPolicy,
        directives: {
          ...SecurityHeadersMiddleware.#DEFAULT_CONFIG.contentSecurityPolicy.directives,
          ...envConfig.contentSecurityPolicy?.directives,
          ...options.contentSecurityPolicy?.directives
        }
      }
    };
  }

  /**
   * @private
   * Builds Helmet configuration
   */
  #buildHelmetConfig(config) {
    const helmetConfig = { ...config };
    
    // Remove custom properties not used by Helmet
    delete helmetConfig.customHeaders;
    delete helmetConfig.monitoring;

    // Environment-specific adjustments
    if (process.env.NODE_ENV === 'development') {
      // Relax some policies for development
      helmetConfig.contentSecurityPolicy.directives.scriptSrc.push("'unsafe-eval'");
      helmetConfig.hsts = false; // Disable HSTS in development
    }

    return helmetConfig;
  }

  /**
   * @private
   * Initializes custom headers from config
   */
  #initializeCustomHeaders() {
    Object.entries(this.#config.customHeaders).forEach(([name, value]) => {
      this.#customHeaders.set(name, value);
    });
  }

  /**
   * @private
   * Applies custom security headers
   */
  #applyCustomHeaders(req, res) {
    this.#customHeaders.forEach((value, name) => {
      if (typeof value === 'function') {
        const headerValue = value(req, res);
        if (headerValue) {
          res.setHeader(name, headerValue);
        }
      } else {
        res.setHeader(name, value);
      }
    });

    // Dynamic headers based on request context
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', `max-age=${this.#config.hsts.maxAge}; includeSubDomains; preload`);
    }
  }

  /**
   * @private
   * Handles CSP violation reports
   */
  async #handleCSPReport(req, res) {
    try {
      const report = req.body;
      
      if (this.#config.monitoring.logViolations) {
        logger.warn('CSP violation reported', {
          documentUri: report['csp-report']?.['document-uri'],
          violatedDirective: report['csp-report']?.['violated-directive'],
          blockedUri: report['csp-report']?.['blocked-uri'],
          sourceFile: report['csp-report']?.['source-file'],
          lineNumber: report['csp-report']?.['line-number']
        });
      }

      // Audit CSP violations
      await this.#auditService.logEvent({
        event: 'security.csp_violation',
        severity: 'warning',
        metadata: {
          report: report['csp-report'],
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        }
      });

      // Alert on critical violations
      if (this.#config.monitoring.alertOnCriticalViolations) {
        const criticalDirectives = ['script-src', 'object-src', 'base-uri'];
        const violatedDirective = report['csp-report']?.['violated-directive'];
        
        if (criticalDirectives.some(d => violatedDirective?.includes(d))) {
          logger.error('Critical CSP violation detected', {
            violatedDirective,
            documentUri: report['csp-report']?.['document-uri']
          });
        }
      }

      res.status(204).end();
    } catch (error) {
      logger.error('Error handling CSP report', { error: error.message });
      res.status(204).end();
    }
  }

  /**
   * @private
   * Tracks security metrics
   */
  async #trackSecurityMetrics(req, res, duration) {
    try {
      const metrics = {
        path: req.path,
        method: req.method,
        securityHeadersApplied: true,
        duration,
        timestamp: new Date()
      };

      // Log metrics (could be sent to monitoring service)
      logger.debug('Security headers metrics', metrics);
    } catch (error) {
      logger.error('Error tracking security metrics', { error: error.message });
    }
  }

  /**
   * Gets current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Validates security headers on response
   * @param {Object} res - Express response object
   * @returns {Object} Validation result
   */
  validateHeaders(res) {
    const headers = res.getHeaders();
    const issues = [];

    // Check critical security headers
    const criticalHeaders = [
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'strict-transport-security',
      'content-security-policy'
    ];

    criticalHeaders.forEach(header => {
      if (!headers[header]) {
        issues.push(`Missing critical header: ${header}`);
      }
    });

    return {
      valid: issues.length === 0,
      issues,
      headers: Object.keys(headers).filter(h => 
        h.toLowerCase().includes('x-') || 
        h.toLowerCase().includes('security') ||
        h.toLowerCase().includes('policy')
      )
    };
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates security headers middleware instance
 * @param {Object} [options] - Configuration options
 * @returns {SecurityHeadersMiddleware} Middleware instance
 */
const getSecurityHeadersMiddleware = (options) => {
  if (!instance) {
    instance = new SecurityHeadersMiddleware(options);
  }
  return instance;
};

module.exports = {
  SecurityHeadersMiddleware,
  getSecurityHeadersMiddleware,
  // Export convenience method
  securityHeaders: (options) => getSecurityHeadersMiddleware(options).getMiddleware()
};