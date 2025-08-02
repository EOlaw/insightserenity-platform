/**
 * @fileoverview FIXED Security headers middleware for admin protection
 * @module servers/admin-server/middleware/security-headers
 */

'use strict';

const logger = require('../../../shared/lib/utils/logger');
const config = require('../config');
const crypto = require('crypto');

/**
 * @class SecurityHeadersMiddleware
 * @description FIXED version - handles non-string values properly
 */
class SecurityHeadersMiddleware {
  static #cacheService = null;
  static #config = {
    hsts: {
      enabled: config.security?.hsts?.enabled !== false,
      maxAge: config.security?.hsts?.maxAge || 31536000,
      includeSubDomains: config.security?.hsts?.includeSubDomains !== false,
      preload: config.security?.hsts?.preload !== false
    },
    
    csp: {
      enabled: config.security?.csp?.enabled !== false,
      reportOnly: config.security?.csp?.reportOnly || false,
      reportUri: config.security?.csp?.reportUri || '/api/v1/admin/security/csp-report',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-{nonce}'"],
        styleSrc: ["'self'", "'nonce-{nonce}'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        childSrc: ["'self'"],
        frameSrc: ["'none'"],
        workerSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: config.security?.csp?.upgradeInsecureRequests !== false
      }
    },
    
    permissions: {
      enabled: config.security?.permissions?.enabled !== false,
      policies: {
        accelerometer: [],
        camera: [],
        geolocation: [],
        gyroscope: [],
        magnetometer: [],
        microphone: [],
        payment: [],
        usb: [],
        fullscreen: ["'self'"],
        clipboard: ["'self'"]
      }
    },
    
    additional: {
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      xXssProtection: '1; mode=block',
      xDnsPrefetchControl: 'off',
      xDownloadOptions: 'noopen',
      xPermittedCrossDomainPolicies: 'none',
      referrerPolicy: 'strict-origin-when-cross-origin'
    },
    
    nonce: {
      enabled: true,
      algorithm: 'sha256',
      length: 16
    }
  };

  static #reportedViolations = new Set();

  /**
   * Initialize security headers middleware
   * @static
   */
  static initialize() {
    try {
      this.#validateConfiguration();
      
      logger.info('Security headers middleware initialized', {
        hsts: this.#config.hsts.enabled,
        csp: this.#config.csp.enabled,
        permissions: this.#config.permissions.enabled
      });
    } catch (error) {
      logger.error('Failed to initialize security headers', { error: error.message });
      throw error;
    }
  }

  /**
   * FIXED: Main security headers middleware with proper error handling
   * @static
   * @returns {Function} Express middleware
   */
  static middleware() {
    return async (req, res, next) => {
      try {
        // Generate nonce for this request
        const nonce = this.#generateNonce();
        req.nonce = nonce;
        res.locals.nonce = nonce;

        // Apply all security headers with error handling
        await this.#applySecurityHeaders(req, res);

        next();
      } catch (error) {
        logger.error('Security headers middleware error', {
          error: error.message,
          path: req.path,
          stack: error.stack
        });
        
        // Continue without headers rather than blocking the request
        next();
      }
    };
  }

  /**
   * Apply strict headers for sensitive operations
   * @static
   * @returns {Function} Express middleware
   */
  static strict() {
    return (req, res, next) => {
      try {
        // Apply stricter CSP with safe defaults
        const strictCSP = [
          "default-src 'self'",
          `script-src 'self' 'nonce-${req.nonce || 'default'}'`,
          `style-src 'self' 'nonce-${req.nonce || 'default'}'`,
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self'",
          "media-src 'none'",
          "object-src 'none'",
          "child-src 'none'",
          "frame-src 'none'",
          "worker-src 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "upgrade-insecure-requests"
        ].join('; ');

        res.setHeader('Content-Security-Policy', strictCSP);
        
        // No caching for sensitive data
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Additional strict headers
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        
        next();
      } catch (error) {
        logger.error('Strict security headers error', { error: error.message });
        next();
      }
    };
  }

  /**
   * CSP violation report handler
   * @static
   * @returns {Function} Express middleware
   */
  static cspReportHandler() {
    return async (req, res) => {
      try {
        const report = req.body;
        
        if (report && report['csp-report']) {
          const violation = report['csp-report'];
          const violationKey = this.#generateViolationKey(violation);
          
          if (!this.#reportedViolations.has(violationKey)) {
            this.#reportedViolations.add(violationKey);
            
            logger.warn('CSP violation reported', {
              documentUri: violation['document-uri'],
              violatedDirective: violation['violated-directive'],
              blockedUri: violation['blocked-uri'],
              sourceFile: violation['source-file'],
              lineNumber: violation['line-number'],
              columnNumber: violation['column-number']
            });
          }
        }
        
        res.status(204).end();
      } catch (error) {
        logger.error('CSP report handling error', { error: error.message });
        res.status(204).end();
      }
    };
  }

  /**
   * FIXED: Apply all security headers with proper validation
   * @private
   */
  static async #applySecurityHeaders(req, res) {
    try {
      // HSTS
      if (this.#config.hsts.enabled && req.secure) {
        res.setHeader('Strict-Transport-Security', this.#generateHSTS());
      }

      // CSP - FIXED to handle non-string values
      if (this.#config.csp.enabled) {
        const cspHeader = this.#config.csp.reportOnly 
          ? 'Content-Security-Policy-Report-Only'
          : 'Content-Security-Policy';
        res.setHeader(cspHeader, this.#generateCSP(req));
      }

      // Permissions Policy
      if (this.#config.permissions.enabled) {
        res.setHeader('Permissions-Policy', this.#generatePermissionsPolicy());
      }

      // Standard security headers
      Object.entries(this.#config.additional).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length > 0) {
          const headerName = this.#normalizeHeaderName(key);
          res.setHeader(headerName, value);
        }
      });

      // Custom admin headers
      res.setHeader('X-Admin-Panel', 'true');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Remove potentially dangerous headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');

    } catch (error) {
      logger.error('Error applying security headers', { error: error.message });
      // Continue without failing the request
    }
  }

  /**
   * FIXED: Generate CSP header with proper string handling
   * @private
   */
  static #generateCSP(req) {
    try {
      const nonce = req.nonce || this.#generateNonce();
      const directives = [];
      
      Object.entries(this.#config.csp.directives).forEach(([directive, values]) => {
        if (Array.isArray(values) && values.length > 0) {
          // FIXED: Ensure all values are strings before processing
          const processedValues = values
            .filter(value => value != null) // Remove null/undefined
            .map(value => {
              const stringValue = String(value); // Convert to string safely
              return stringValue.includes('{nonce}') ? stringValue.replace('{nonce}', nonce) : stringValue;
            });
          
          if (processedValues.length > 0) {
            // Convert camelCase to kebab-case
            const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
            directives.push(`${directiveName} ${processedValues.join(' ')}`);
          }
        }
      });
      
      // Add report URI if configured
      if (this.#config.csp.reportUri && typeof this.#config.csp.reportUri === 'string') {
        directives.push(`report-uri ${this.#config.csp.reportUri}`);
      }
      
      return directives.join('; ');
    } catch (error) {
      logger.error('Error generating CSP', { error: error.message });
      // Return a safe default CSP
      return "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'";
    }
  }

  /**
   * Generate HSTS header
   * @private
   */
  static #generateHSTS() {
    const parts = [`max-age=${this.#config.hsts.maxAge}`];
    
    if (this.#config.hsts.includeSubDomains) {
      parts.push('includeSubDomains');
    }
    
    if (this.#config.hsts.preload) {
      parts.push('preload');
    }
    
    return parts.join('; ');
  }

  /**
   * Generate Permissions Policy header
   * @private
   */
  static #generatePermissionsPolicy() {
    const policies = [];
    
    Object.entries(this.#config.permissions.policies).forEach(([feature, allowList]) => {
      if (Array.isArray(allowList)) {
        if (allowList.length === 0) {
          policies.push(`${feature}=()`);
        } else {
          policies.push(`${feature}=(${allowList.join(' ')})`);
        }
      }
    });
    
    return policies.join(', ');
  }

  /**
   * Generate cryptographic nonce
   * @private
   */
  static #generateNonce() {
    return crypto.randomBytes(this.#config.nonce.length).toString('base64');
  }

  /**
   * Generate violation key for deduplication
   * @private
   */
  static #generateViolationKey(violation) {
    const key = [
      violation['violated-directive'],
      violation['blocked-uri'],
      violation['source-file'],
      violation['line-number']
    ].filter(Boolean).join('|');
    
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * Normalize header name from camelCase
   * @private
   */
  static #normalizeHeaderName(name) {
    return name
      .replace(/([A-Z])/g, '-$1')
      .replace(/^x([A-Z])/g, 'X-$1')
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('-');
  }

  /**
   * Validate configuration
   * @private
   */
  static #validateConfiguration() {
    // Ensure CSP directives are arrays
    Object.keys(this.#config.csp.directives).forEach(directive => {
      if (!Array.isArray(this.#config.csp.directives[directive])) {
        this.#config.csp.directives[directive] = [this.#config.csp.directives[directive]].filter(Boolean);
      }
    });
    
    // Validate HSTS max age
    if (this.#config.hsts.maxAge < 31536000) {
      logger.warn('HSTS max-age is less than recommended 1 year');
    }
  }

  /**
   * Get current security headers configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      reportedViolations: this.#reportedViolations.size
    };
  }
}

// Initialize on module load
SecurityHeadersMiddleware.initialize();

// Export middleware and utility functions
module.exports = {
  middleware: SecurityHeadersMiddleware.middleware.bind(SecurityHeadersMiddleware),
  strict: SecurityHeadersMiddleware.strict.bind(SecurityHeadersMiddleware),
  cspReportHandler: SecurityHeadersMiddleware.cspReportHandler.bind(SecurityHeadersMiddleware),
  getConfig: SecurityHeadersMiddleware.getConfig.bind(SecurityHeadersMiddleware)
};