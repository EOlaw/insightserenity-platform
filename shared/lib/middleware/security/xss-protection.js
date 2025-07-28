'use strict';

/**
 * @fileoverview XSS protection middleware for preventing cross-site scripting attacks
 * @module shared/lib/middleware/security/xss-protection
 * @requires module:xss
 * @requires module:sanitize-html
 * @requires module:dompurify
 * @requires module:jsdom
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/config
 */

const xss = require('xss');
const sanitizeHtml = require('sanitize-html');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const AuditService = require('../../security/audit/audit-service');
const CacheService = require('../../services/cache-service');
const config = require('../../../config');

// Initialize DOMPurify with JSDOM
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * @class XSSProtectionMiddleware
 * @description Comprehensive XSS protection with multiple sanitization strategies
 */
class XSSProtectionMiddleware {
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
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Map}
   */
  #sanitizers;

  /**
   * @private
   * @type {Map}
   */
  #detectionPatterns;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    strategies: {
      body: true,
      query: true,
      params: true,
      headers: true,
      cookies: false
    },
    sanitization: {
      stripTags: true,
      encodeEntities: true,
      removeScripts: true,
      removeEventHandlers: true,
      removeDataAttributes: false,
      allowedTags: [
        'p', 'br', 'strong', 'em', 'u', 'i', 'b', 'a', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div'
      ],
      allowedAttributes: {
        'a': ['href', 'title', 'target', 'rel'],
        'img': ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class', 'id', 'style']
      },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      allowedStyles: {
        '*': {
          'color': [/^#[0-9a-f]{3,6}$/i, /^rgb\(/, /^hsl\(/],
          'background-color': [/^#[0-9a-f]{3,6}$/i, /^rgb\(/, /^hsl\(/],
          'font-size': [/^\d+(?:px|em|rem|%)$/],
          'text-align': [/^(left|right|center|justify)$/]
        }
      }
    },
    validation: {
      maxInputLength: 10000,
      maxDepth: 10,
      rejectOnDetection: false,
      logSuspiciousPatterns: true
    },
    exemptions: {
      paths: ['/api/admin/content', '/api/cms'],
      fields: ['markdown', 'html_content', 'rich_text'],
      roles: ['admin', 'content_editor']
    },
    detection: {
      patterns: {
        script: /<script[^>]*>[\s\S]*?<\/script>/gi,
        eventHandler: /on\w+\s*=\s*["'][^"']*["']/gi,
        javascript: /javascript\s*:/gi,
        dataUri: /data:[^,]*;base64/gi,
        iframeEmbed: /<iframe[^>]*>/gi,
        objectEmbed: /<object[^>]*>/gi,
        embedTag: /<embed[^>]*>/gi,
        formAction: /<form[^>]*action\s*=/gi,
        metaRefresh: /<meta[^>]*http-equiv\s*=\s*["']refresh["']/gi,
        linkImport: /<link[^>]*rel\s*=\s*["']import["']/gi,
        svgScript: /<svg[^>]*>[\s\S]*?<script/gi,
        expression: /expression\s*\(/gi,
        vbscript: /vbscript\s*:/gi
      },
      scoring: {
        threshold: 5,
        weights: {
          script: 10,
          eventHandler: 8,
          javascript: 7,
          dataUri: 5,
          iframeEmbed: 6,
          objectEmbed: 6,
          embedTag: 6,
          formAction: 4,
          metaRefresh: 3,
          linkImport: 3,
          svgScript: 9,
          expression: 7,
          vbscript: 7
        }
      }
    },
    monitoring: {
      logAttempts: true,
      trackMetrics: true,
      alertOnHighRisk: true,
      quarantineSuspicious: true
    }
  };

  /**
   * Creates XSS protection middleware instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, auditService, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#sanitizers = new Map();
    this.#detectionPatterns = new Map();

    this.#initializeSanitizers();
    this.#initializeDetectionPatterns();

    logger.info('XSSProtectionMiddleware initialized', {
      strategies: Object.keys(this.#config.strategies).filter(k => this.#config.strategies[k]),
      allowedTags: this.#config.sanitization.allowedTags.length
    });
  }

  /**
   * Returns XSS protection middleware
   * @param {Object} [options] - Runtime options
   * @returns {Function} Express middleware function
   */
  getMiddleware(options = {}) {
    return async (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Check exemptions
        if (this.#isExempt(req)) {
          return next();
        }

        // Track suspicious activity
        const suspiciousScore = await this.#detectSuspiciousPatterns(req);
        
        if (suspiciousScore >= this.#config.detection.scoring.threshold) {
          if (this.#config.validation.rejectOnDetection) {
            throw new AppError(
              'Potentially malicious content detected',
              400,
              ERROR_CODES.XSS_DETECTED,
              { correlationId, score: suspiciousScore }
            );
          }

          // Log high-risk attempt
          if (this.#config.monitoring.alertOnHighRisk) {
            await this.#logXSSAttempt(req, 'high_risk', suspiciousScore, correlationId);
          }
        }

        // Sanitize request data
        await this.#sanitizeRequest(req);

        // Set security headers
        this.#setSecurityHeaders(res);

        // Track metrics
        if (this.#config.monitoring.trackMetrics) {
          this.#trackMetrics('success', Date.now() - startTime);
        }

        logger.debug('XSS protection applied', {
          correlationId,
          path: req.path,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        if (this.#config.monitoring.logAttempts) {
          await this.#logXSSAttempt(req, 'blocked', 0, correlationId, error);
        }

        logger.error('XSS protection error', {
          correlationId,
          error: error.message,
          path: req.path,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'XSS protection failed',
          500,
          ERROR_CODES.XSS_PROTECTION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Sanitizes a string value
   * @param {string} value - Value to sanitize
   * @param {Object} [options] - Sanitization options
   * @returns {string} Sanitized value
   */
  sanitize(value, options = {}) {
    if (typeof value !== 'string') {
      return value;
    }

    const sanitizer = options.sanitizer || 'default';
    const sanitizerFunc = this.#sanitizers.get(sanitizer);

    if (!sanitizerFunc) {
      logger.warn('Unknown sanitizer requested', { sanitizer });
      return this.#sanitizers.get('default')(value, options);
    }

    return sanitizerFunc(value, options);
  }

  /**
   * Validates if content contains XSS patterns
   * @param {string} content - Content to validate
   * @returns {Object} Validation result
   */
  validate(content) {
    const detectedPatterns = [];
    let score = 0;

    this.#detectionPatterns.forEach((pattern, name) => {
      if (pattern.regex.test(content)) {
        detectedPatterns.push(name);
        score += pattern.weight;
      }
    });

    return {
      isClean: detectedPatterns.length === 0,
      score,
      patterns: detectedPatterns,
      isSuspicious: score >= this.#config.detection.scoring.threshold
    };
  }

  /**
   * Adds custom sanitizer
   * @param {string} name - Sanitizer name
   * @param {Function} sanitizerFunc - Sanitizer function
   */
  addSanitizer(name, sanitizerFunc) {
    this.#sanitizers.set(name, sanitizerFunc);
    logger.debug('Custom sanitizer added', { name });
  }

  /**
   * Adds custom detection pattern
   * @param {string} name - Pattern name
   * @param {RegExp} regex - Detection regex
   * @param {number} weight - Pattern weight
   */
  addDetectionPattern(name, regex, weight) {
    this.#detectionPatterns.set(name, { regex, weight });
    logger.debug('Custom detection pattern added', { name, weight });
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const envConfig = {
      sanitization: {
        allowedTags: config.security?.xss?.allowedTags || 
                    XSSProtectionMiddleware.#DEFAULT_CONFIG.sanitization.allowedTags,
        allowedAttributes: config.security?.xss?.allowedAttributes || 
                          XSSProtectionMiddleware.#DEFAULT_CONFIG.sanitization.allowedAttributes
      },
      validation: {
        rejectOnDetection: config.security?.xss?.rejectOnDetection ?? 
                          (process.env.NODE_ENV === 'production'),
        maxInputLength: parseInt(process.env.XSS_MAX_INPUT_LENGTH) || 
                       XSSProtectionMiddleware.#DEFAULT_CONFIG.validation.maxInputLength
      },
      exemptions: {
        paths: config.security?.xss?.exemptPaths || 
               XSSProtectionMiddleware.#DEFAULT_CONFIG.exemptions.paths,
        roles: config.security?.xss?.exemptRoles || 
               XSSProtectionMiddleware.#DEFAULT_CONFIG.exemptions.roles
      }
    };

    return {
      ...XSSProtectionMiddleware.#DEFAULT_CONFIG,
      ...envConfig,
      ...options,
      sanitization: {
        ...XSSProtectionMiddleware.#DEFAULT_CONFIG.sanitization,
        ...envConfig.sanitization,
        ...options.sanitization
      },
      validation: {
        ...XSSProtectionMiddleware.#DEFAULT_CONFIG.validation,
        ...envConfig.validation,
        ...options.validation
      },
      exemptions: {
        ...XSSProtectionMiddleware.#DEFAULT_CONFIG.exemptions,
        ...envConfig.exemptions,
        ...options.exemptions
      }
    };
  }

  /**
   * @private
   * Initializes sanitizers
   */
  #initializeSanitizers() {
    // Default sanitizer using xss library
    this.#sanitizers.set('default', (value, options) => {
      return xss(value, {
        whiteList: this.#config.sanitization.allowedTags.reduce((acc, tag) => {
          acc[tag] = this.#config.sanitization.allowedAttributes[tag] || 
                     this.#config.sanitization.allowedAttributes['*'] || [];
          return acc;
        }, {}),
        stripIgnoreTag: this.#config.sanitization.stripTags,
        stripIgnoreTagBody: ['script', 'style'],
        onTagAttr: (tag, name, value) => {
          // Custom attribute filtering
          if (name === 'href' || name === 'src') {
            const url = value.replace(/^["']|["']$/g, '');
            try {
              const parsed = new URL(url);
              if (!this.#config.sanitization.allowedSchemes.includes(parsed.protocol.replace(':', ''))) {
                return '';
              }
            } catch {
              // Relative URL or invalid
              if (url.startsWith('javascript:') || url.startsWith('data:')) {
                return '';
              }
            }
          }
        }
      });
    });

    // Strict sanitizer using sanitize-html
    this.#sanitizers.set('strict', (value, options) => {
      return sanitizeHtml(value, {
        allowedTags: options.allowedTags || [],
        allowedAttributes: {},
        allowedSchemes: ['http', 'https'],
        disallowedTagsMode: 'discard'
      });
    });

    // HTML sanitizer using DOMPurify
    this.#sanitizers.set('html', (value, options) => {
      return DOMPurify.sanitize(value, {
        ALLOWED_TAGS: this.#config.sanitization.allowedTags,
        ALLOWED_ATTR: Object.keys(this.#config.sanitization.allowedAttributes)
          .reduce((acc, key) => {
            if (key === '*') {
              acc.push(...this.#config.sanitization.allowedAttributes[key]);
            } else {
              this.#config.sanitization.allowedAttributes[key].forEach(attr => {
                acc.push(attr);
              });
            }
            return acc;
        }, []),
        ALLOW_DATA_ATTR: this.#config.sanitization.removeDataAttributes === false,
        SAFE_FOR_TEMPLATES: true,
        SAFE_FOR_XML: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_DOM_IMPORT: false,
        FORCE_BODY: true,
        SANITIZE_DOM: true
      });
    });

    // Plain text sanitizer
    this.#sanitizers.set('text', (value) => {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    });

    // URL sanitizer
    this.#sanitizers.set('url', (value) => {
      try {
        const url = new URL(value);
        if (!this.#config.sanitization.allowedSchemes.includes(url.protocol.replace(':', ''))) {
          return '';
        }
        return url.toString();
      } catch {
        // Invalid URL
        return '';
      }
    });
  }

  /**
   * @private
   * Initializes detection patterns
   */
  #initializeDetectionPatterns() {
    Object.entries(this.#config.detection.patterns).forEach(([name, regex]) => {
      this.#detectionPatterns.set(name, {
        regex,
        weight: this.#config.detection.scoring.weights[name] || 1
      });
    });
  }

  /**
   * @private
   * Detects suspicious patterns in request
   */
  async #detectSuspiciousPatterns(req) {
    let totalScore = 0;
    const detectedPatterns = [];

    // Check all configured request parts
    const checkData = {};
    
    if (this.#config.strategies.body && req.body) {
      checkData.body = JSON.stringify(req.body);
    }
    if (this.#config.strategies.query && req.query) {
      checkData.query = JSON.stringify(req.query);
    }
    if (this.#config.strategies.params && req.params) {
      checkData.params = JSON.stringify(req.params);
    }
    if (this.#config.strategies.headers && req.headers) {
      checkData.headers = JSON.stringify(req.headers);
    }

    // Scan for patterns
    for (const [location, data] of Object.entries(checkData)) {
      this.#detectionPatterns.forEach((pattern, name) => {
        if (pattern.regex.test(data)) {
          totalScore += pattern.weight;
          detectedPatterns.push({ location, pattern: name });
        }
      });
    }

    if (detectedPatterns.length > 0 && this.#config.validation.logSuspiciousPatterns) {
      logger.warn('Suspicious patterns detected', {
        path: req.path,
        patterns: detectedPatterns,
        score: totalScore
      });
    }

    return totalScore;
  }

  /**
   * @private
   * Sanitizes request data
   */
  async #sanitizeRequest(req) {
    // Sanitize body
    if (this.#config.strategies.body && req.body) {
      req.body = this.#sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (this.#config.strategies.query && req.query) {
      req.query = this.#sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (this.#config.strategies.params && req.params) {
      req.params = this.#sanitizeObject(req.params);
    }

    // Sanitize headers (carefully)
    if (this.#config.strategies.headers && req.headers) {
      const safeHeaders = ['user-agent', 'referer', 'x-forwarded-for'];
      safeHeaders.forEach(header => {
        if (req.headers[header]) {
          req.headers[header] = this.sanitize(req.headers[header], { sanitizer: 'text' });
        }
      });
    }

    // Sanitize cookies
    if (this.#config.strategies.cookies && req.cookies) {
      req.cookies = this.#sanitizeObject(req.cookies);
    }
  }

  /**
   * @private
   * Sanitizes object recursively
   */
  #sanitizeObject(obj, depth = 0) {
    if (depth > this.#config.validation.maxDepth) {
      logger.warn('Max sanitization depth reached', { depth });
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.#sanitizeObject(item, depth + 1));
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitize(key, { sanitizer: 'text' });
        
        if (typeof value === 'string') {
          // Check if field is exempt
          if (this.#config.exemptions.fields.includes(key)) {
            sanitized[sanitizedKey] = value;
          } else {
            // Check length
            if (value.length > this.#config.validation.maxInputLength) {
              logger.warn('Input exceeds max length', { 
                field: key, 
                length: value.length 
              });
              sanitized[sanitizedKey] = value.substring(0, this.#config.validation.maxInputLength);
            } else {
              sanitized[sanitizedKey] = this.sanitize(value);
            }
          }
        } else {
          sanitized[sanitizedKey] = this.#sanitizeObject(value, depth + 1);
        }
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * @private
   * Sets security headers
   */
  #setSecurityHeaders(res) {
    // Content-Type options to prevent XSS
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // XSS Protection header (legacy but still useful)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Content Security Policy for XSS prevention
    if (!res.getHeader('Content-Security-Policy')) {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
      );
    }
  }

  /**
   * @private
   * Checks if request is exempt
   */
  #isExempt(req) {
    // Check path exemptions
    if (this.#config.exemptions.paths.some(path => req.path.startsWith(path))) {
      return true;
    }

    // Check role exemptions
    if (req.auth?.user?.roles) {
      const userRoles = req.auth.user.roles.map(r => r.name || r);
      if (userRoles.some(role => this.#config.exemptions.roles.includes(role))) {
        return true;
      }
    }

    return false;
  }

  /**
   * @private
   * Logs XSS attempt
   */
  async #logXSSAttempt(req, type, score, correlationId, error = null) {
    try {
      await this.#auditService.logEvent({
        event: 'security.xss_attempt',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        severity: type === 'high_risk' ? 'critical' : 'warning',
        correlationId,
        metadata: {
          type,
          score,
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          error: error?.message
        }
      });

      // Quarantine suspicious content if configured
      if (this.#config.monitoring.quarantineSuspicious && type === 'high_risk') {
        const quarantineKey = `xss_quarantine:${correlationId}`;
        await this.#cacheService.set(quarantineKey, {
          request: {
            body: req.body,
            query: req.query,
            params: req.params
          },
          score,
          timestamp: new Date()
        }, 86400); // 24 hours
      }

    } catch (err) {
      logger.error('Failed to log XSS attempt', { error: err.message });
    }
  }

  /**
   * @private
   * Tracks metrics
   */
  #trackMetrics(result, duration) {
    try {
      // Implementation would send to metrics service
      logger.debug('XSS protection metrics', {
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
    return `xss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets quarantined content
   * @param {string} correlationId - Correlation ID
   * @returns {Promise<Object|null>} Quarantined content
   */
  async getQuarantinedContent(correlationId) {
    const quarantineKey = `xss_quarantine:${correlationId}`;
    return this.#cacheService.get(quarantineKey);
  }

  /**
   * Clears quarantine
   * @param {number} [olderThanHours=24] - Clear entries older than hours
   * @returns {Promise<number>} Number of cleared entries
   */
  async clearQuarantine(olderThanHours = 24) {
    // Implementation would clear old quarantine entries
    logger.info('Quarantine cleared', { olderThanHours });
    return 0;
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates XSS protection middleware instance
 * @param {Object} [options] - Configuration options
 * @returns {XSSProtectionMiddleware} Middleware instance
 */
const getXSSProtectionMiddleware = (options) => {
  if (!instance) {
    instance = new XSSProtectionMiddleware(options);
  }
  return instance;
};

module.exports = {
  XSSProtectionMiddleware,
  getXSSProtectionMiddleware,
  // Export convenience methods
  xssProtection: (options) => getXSSProtectionMiddleware(options).getMiddleware(),
  sanitize: (value, options) => getXSSProtectionMiddleware().sanitize(value, options),
  validateXSS: (content) => getXSSProtectionMiddleware().validate(content)
};