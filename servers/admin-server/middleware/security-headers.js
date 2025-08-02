'use strict';

/**
 * @fileoverview Comprehensive security headers middleware for admin protection
 * @module servers/admin-server/middleware/security-headers
 * @requires module:shared/lib/utils/logger
 * @requires module:servers/admin-server/config
 */

const logger = require('../../../shared/lib/utils/logger');
const config = require('../config');
const crypto = require('crypto');

/**
 * @class SecurityHeadersMiddleware
 * @description Enforces strict security headers for admin panel protection
 */
class SecurityHeadersMiddleware {
  /**
   * @private
   * @static
   * @type {Object|null}
   */
  static #cacheService = null;

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    // HSTS Configuration
    hsts: {
      enabled: config.security?.hsts?.enabled !== false,
      maxAge: config.security?.hsts?.maxAge || 31536000, // 1 year
      includeSubDomains: config.security?.hsts?.includeSubDomains !== false,
      preload: config.security?.hsts?.preload !== false
    },
    
    // Content Security Policy
    csp: {
      enabled: config.security?.csp?.enabled !== false,
      reportOnly: config.security?.csp?.reportOnly || false,
      reportUri: config.security?.csp?.reportUri || '/api/v1/admin/security/csp-report',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'nonce-{nonce}'",
          config.security?.csp?.trustedScripts || []
        ].flat(),
        styleSrc: [
          "'self'",
          "'nonce-{nonce}'",
          config.security?.csp?.trustedStyles || []
        ].flat(),
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          config.apiUrl || '',
          config.security?.csp?.trustedConnections || []
        ].flat().filter(Boolean),
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
    
    // Feature/Permissions Policy
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
    
    // Additional Headers
    additional: {
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      xXssProtection: '1; mode=block',
      xDnsPrefetchControl: 'off',
      xDownloadOptions: 'noopen',
      xPermittedCrossDomainPolicies: 'none',
      referrerPolicy: 'strict-origin-when-cross-origin',
      expectCT: {
        enabled: config.security?.expectCT?.enabled || false,
        maxAge: config.security?.expectCT?.maxAge || 86400,
        enforce: config.security?.expectCT?.enforce || false,
        reportUri: config.security?.expectCT?.reportUri
      }
    },
    
    // Nonce generation
    nonce: {
      enabled: true,
      algorithm: 'sha256',
      length: 16
    },
    
    // Cache configuration
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
      prefix: 'security_headers:'
    }
  };

  /**
   * @private
   * @static
   * @type {Map<string, Function>}
   */
  static #headerGenerators = new Map();

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #reportedViolations = new Set();

  /**
   * Get or initialize cache service
   * @private
   * @static
   * @returns {Object|null} Cache service instance
   */
  static #getCacheService() {
    if (!this.#cacheService) {
      try {
        // Safely require and instantiate CacheService
        const CacheService = require('../../../shared/lib/services/cache-service');
        
        // Use singleton pattern if available, otherwise create new instance
        if (typeof CacheService.getInstance === 'function') {
          this.#cacheService = CacheService.getInstance({
            namespace: 'security_headers',
            fallbackToMemory: true
          });
        } else {
          this.#cacheService = new CacheService({
            namespace: 'security_headers',
            fallbackToMemory: true
          });
        }
      } catch (error) {
        logger.warn('CacheService not available, proceeding without cache', {
          error: error.message
        });
        this.#cacheService = null;
      }
    }
    return this.#cacheService;
  }

  /**
   * Initialize security headers middleware
   * @static
   */
  static initialize() {
    try {
      // Setup header generators
      this.#setupHeaderGenerators();
      
      // Validate configuration
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
   * Main security headers middleware
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

        // Apply all security headers
        await this.#applySecurityHeaders(req, res);

        // Set up CSP violation reporting
        if (this.#config.csp.enabled && !this.#config.csp.reportOnly) {
          this.#setupViolationReporting(req, res);
        }

        next();
      } catch (error) {
        logger.error('Security headers middleware error', {
          error: error.message,
          path: req.path
        });
        // Continue without headers on error - fail open
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
      // Apply stricter CSP
      const strictCSP = this.#generateStrictCSP(req);
      res.setHeader('Content-Security-Policy', strictCSP);
      
      // No caching for sensitive data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Additional strict headers
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
      
      next();
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
          
          // Prevent duplicate reports
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
            
            // Store violation for analysis
            await this.#storeViolation(violation, req);
          }
        }
        
        res.status(204).end();
      } catch (error) {
        logger.error('CSP report handling error', {
          error: error.message
        });
        res.status(204).end();
      }
    };
  }

  /**
   * @private
   * Apply all security headers
   */
  static async #applySecurityHeaders(req, res) {
    // HSTS
    if (this.#config.hsts.enabled && req.secure) {
      res.setHeader('Strict-Transport-Security', this.#generateHSTS());
    }

    // CSP
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
      if (typeof value === 'string') {
        const headerName = this.#normalizeHeaderName(key);
        res.setHeader(headerName, value);
      }
    });

    // Expect-CT
    if (this.#config.additional.expectCT.enabled) {
      res.setHeader('Expect-CT', this.#generateExpectCT());
    }

    // Custom admin headers
    res.setHeader('X-Admin-Panel', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Powered-By', 'InsightSerenity Admin');
    
    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
  }

  /**
   * @private
   * Generate HSTS header
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
   * @private
   * Generate CSP header
   */
  static #generateCSP(req) {
    const nonce = req.nonce;
    const directives = [];
    
    Object.entries(this.#config.csp.directives).forEach(([directive, values]) => {
      if (values && values.length > 0) {
        const processedValues = values.map(value => 
          value.replace('{nonce}', nonce)
        );
        
        // Convert camelCase to kebab-case
        const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
        directives.push(`${directiveName} ${processedValues.join(' ')}`);
      }
    });
    
    // Add report URI if configured
    if (this.#config.csp.reportUri) {
      directives.push(`report-uri ${this.#config.csp.reportUri}`);
    }
    
    return directives.join('; ');
  }

  /**
   * @private
   * Generate strict CSP for sensitive operations
   */
  static #generateStrictCSP(req) {
    const nonce = req.nonce;
    
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
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
  }

  /**
   * @private
   * Generate Permissions Policy header
   */
  static #generatePermissionsPolicy() {
    const policies = [];
    
    Object.entries(this.#config.permissions.policies).forEach(([feature, allowList]) => {
      if (allowList.length === 0) {
        policies.push(`${feature}=()`);
      } else {
        policies.push(`${feature}=(${allowList.join(' ')})`);
      }
    });
    
    return policies.join(', ');
  }

  /**
   * @private
   * Generate Expect-CT header
   */
  static #generateExpectCT() {
    const parts = [`max-age=${this.#config.additional.expectCT.maxAge}`];
    
    if (this.#config.additional.expectCT.enforce) {
      parts.push('enforce');
    }
    
    if (this.#config.additional.expectCT.reportUri) {
      parts.push(`report-uri="${this.#config.additional.expectCT.reportUri}"`);
    }
    
    return parts.join(', ');
  }

  /**
   * @private
   * Generate cryptographic nonce
   */
  static #generateNonce() {
    return crypto.randomBytes(this.#config.nonce.length).toString('base64');
  }

  /**
   * @private
   * Setup header generators
   */
  static #setupHeaderGenerators() {
    // Dynamic header generators can be added here
    this.#headerGenerators.set('timestamp', () => new Date().toISOString());
    this.#headerGenerators.set('requestId', () => crypto.randomBytes(8).toString('hex'));
  }

  /**
   * @private
   * Setup CSP violation reporting
   */
  static #setupViolationReporting(req, res) {
    // Add report-to header for modern browsers
    const reportTo = {
      group: 'csp-endpoint',
      max_age: 10886400, // 126 days
      endpoints: [{
        url: this.#config.csp.reportUri
      }]
    };
    
    res.setHeader('Report-To', JSON.stringify(reportTo));
  }

  /**
   * @private
   * Generate violation key for deduplication
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
   * @private
   * Store CSP violation for analysis
   */
  static async #storeViolation(violation, req) {
    try {
      const cacheService = this.#getCacheService();
      if (!cacheService) {
        // Log violation without caching if cache service unavailable
        logger.warn('CSP violation logged (cache unavailable)', {
          violation: violation['violated-directive'],
          uri: violation['blocked-uri']
        });
        return;
      }

      const violationData = {
        timestamp: new Date(),
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        sample: violation['script-sample'],
        referrer: violation['referrer'],
        statusCode: violation['status-code'],
        userAgent: req.get('user-agent'),
        ip: req.ip
      };
      
      // Store in cache for aggregation
      const cacheKey = `${this.#config.cache.prefix}violations:${Date.now()}`;
      await cacheService.set(cacheKey, violationData, 86400); // 24 hours
      
    } catch (error) {
      logger.error('Failed to store CSP violation', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Normalize header name from camelCase
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
   * @private
   * Validate configuration
   */
  static #validateConfiguration() {
    // Ensure CSP directives are arrays
    Object.keys(this.#config.csp.directives).forEach(directive => {
      if (!Array.isArray(this.#config.csp.directives[directive])) {
        this.#config.csp.directives[directive] = [this.#config.csp.directives[directive]];
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

  /**
   * Update security headers configuration
   * @static
   * @param {Object} updates - Configuration updates
   */
  static updateConfig(updates) {
    Object.assign(this.#config, updates);
    this.#validateConfiguration();
    logger.info('Security headers configuration updated');
  }

  /**
   * Get CSP violations report
   * @static
   * @returns {Promise<Array>} Recent violations
   */
  static async getViolationsReport() {
    try {
      const cacheService = this.#getCacheService();
      if (!cacheService) {
        return [];
      }

      const keys = await cacheService.keys(`${this.#config.cache.prefix}violations:*`);
      const violations = [];
      
      for (const key of keys) {
        const violation = await cacheService.get(key);
        if (violation) {
          violations.push(violation);
        }
      }
      
      return violations.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (error) {
      logger.error('Failed to get violations report', {
        error: error.message
      });
      return [];
    }
  }
}

// Initialize on module load
SecurityHeadersMiddleware.initialize();

// Export middleware and utility functions
module.exports = {
  middleware: SecurityHeadersMiddleware.middleware.bind(SecurityHeadersMiddleware),
  strict: SecurityHeadersMiddleware.strict.bind(SecurityHeadersMiddleware),
  cspReportHandler: SecurityHeadersMiddleware.cspReportHandler.bind(SecurityHeadersMiddleware),
  getConfig: SecurityHeadersMiddleware.getConfig.bind(SecurityHeadersMiddleware),
  updateConfig: SecurityHeadersMiddleware.updateConfig.bind(SecurityHeadersMiddleware),
  getViolationsReport: SecurityHeadersMiddleware.getViolationsReport.bind(SecurityHeadersMiddleware)
};