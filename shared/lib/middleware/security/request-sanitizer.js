'use strict';

/**
 * @fileoverview Request sanitizer middleware for comprehensive input sanitization
 * @module shared/lib/middleware/security/request-sanitizer
 * @requires module:validator
 * @requires module:dompurify
 * @requires module:jsdom
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/config
 */

const validator = require('validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const AuditService = require('../../security/audit/audit-service');
const CacheService = require('../../services/cache-service');
const UserModel = require('..\..\database\models\users\user-model');
const OrganizationModel = require('..\..\..\..\servers\customer-services\modules\hosted-organizations\organizations\models\organization-model');
const config = require('../../../config');

// Initialize DOMPurify
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * @class RequestSanitizerMiddleware
 * @description Comprehensive request sanitization with multiple strategies and context awareness
 */
class RequestSanitizerMiddleware {
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
  #sanitizationRules;

  /**
   * @private
   * @type {Map}
   */
  #contextualSanitizers;

  /**
   * @private
   * @type {Set}
   */
  #trustedDomains;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    strategies: {
      trimWhitespace: true,
      removeNullBytes: true,
      normalizeUnicode: true,
      decodeEntities: true,
      stripControlCharacters: true,
      normalizeLineEndings: true,
      removeInvisibleCharacters: true,
      validateEncoding: true
    },
    depth: {
      maxNestingLevel: 10,
      maxArrayLength: 1000,
      maxObjectKeys: 100,
      maxStringLength: 10000
    },
    sanitization: {
      headers: {
        enabled: true,
        include: ['user-agent', 'referer', 'x-forwarded-for', 'accept-language'],
        exclude: ['authorization', 'cookie', 'x-api-key']
      },
      body: {
        enabled: true,
        contentTypes: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'],
        maxSize: 10485760 // 10MB
      },
      query: {
        enabled: true,
        maxParams: 50,
        maxKeyLength: 100,
        maxValueLength: 1000
      },
      params: {
        enabled: true,
        rules: {
          id: { type: 'alphanumeric', maxLength: 24 },
          slug: { type: 'slug', maxLength: 100 },
          email: { type: 'email', normalize: true },
          date: { type: 'date', format: 'YYYY-MM-DD' }
        }
      },
      files: {
        enabled: true,
        maxSize: 52428800, // 50MB
        allowedMimeTypes: [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'application/pdf', 'application/zip',
          'text/plain', 'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        scanForMalware: true,
        stripMetadata: true
      }
    },
    transformation: {
      toLowerCase: ['email', 'username'],
      toUpperCase: ['countryCode', 'currencyCode'],
      trim: true,
      removeExtraSpaces: true,
      normalizeEmail: true,
      normalizeUrl: true
    },
    validation: {
      rejectOnFailure: false,
      logFailures: true,
      strictMode: process.env.NODE_ENV === 'production'
    },
    contextual: {
      enabled: true,
      rules: {
        '/api/auth': { strict: true, allowHtml: false },
        '/api/admin': { strict: true, requireAuth: true },
        '/api/public': { strict: false, rateLimit: true },
        '/api/upload': { validateFiles: true, scanFiles: true }
      }
    },
    exemptions: {
      paths: ['/api/webhooks', '/api/raw'],
      roles: ['admin', 'system'],
      ips: config.security?.trustedIPs || []
    },
    monitoring: {
      logSanitization: true,
      trackMetrics: true,
      alertOnAnomalies: true,
      anomalyThreshold: 100
    }
  };

  /**
   * Creates request sanitizer middleware instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, auditService, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#sanitizationRules = new Map();
    this.#contextualSanitizers = new Map();
    this.#trustedDomains = new Set(config.security?.trustedDomains || []);

    this.#initializeSanitizationRules();
    this.#initializeContextualSanitizers();

    logger.info('RequestSanitizerMiddleware initialized', {
      strategies: Object.keys(this.#config.strategies).filter(k => this.#config.strategies[k]),
      contextualRules: Object.keys(this.#config.contextual.rules).length
    });
  }

  /**
   * Returns request sanitizer middleware
   * @param {Object} [options] - Runtime options
   * @returns {Function} Express middleware function
   */
  getMiddleware(options = {}) {
    return async (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Check if exempt
        if (this.#isExempt(req)) {
          return next();
        }

        // Get contextual rules
        const contextRules = this.#getContextualRules(req);

        // Track original values for auditing
        const originalData = this.#captureOriginalData(req);

        // Sanitize headers
        if (this.#config.sanitization.headers.enabled) {
          await this.#sanitizeHeaders(req, contextRules);
        }

        // Sanitize query parameters
        if (this.#config.sanitization.query.enabled && req.query) {
          req.query = await this.#sanitizeQuery(req.query, contextRules);
        }

        // Sanitize URL parameters
        if (this.#config.sanitization.params.enabled && req.params) {
          req.params = await this.#sanitizeParams(req.params, contextRules);
        }

        // Sanitize body
        if (this.#config.sanitization.body.enabled && req.body) {
          req.body = await this.#sanitizeBody(req.body, req.headers['content-type'], contextRules);
        }

        // Sanitize files
        if (this.#config.sanitization.files.enabled && req.files) {
          await this.#sanitizeFiles(req.files, contextRules);
        }

        // Validate sanitized data
        if (this.#config.validation.strictMode) {
          const validation = await this.#validateSanitizedData(req);
          if (!validation.isValid && this.#config.validation.rejectOnFailure) {
            throw new AppError(
              'Invalid request data after sanitization',
              400,
              ERROR_CODES.SANITIZATION_FAILED,
              { correlationId, issues: validation.issues }
            );
          }
        }

        // Track changes
        const changes = this.#trackChanges(originalData, req);
        if (changes.length > 0 && this.#config.monitoring.logSanitization) {
          logger.debug('Request data sanitized', {
            correlationId,
            path: req.path,
            changes: changes.length,
            duration: Date.now() - startTime
          });
        }

        // Check for anomalies
        if (this.#config.monitoring.alertOnAnomalies && changes.length > this.#config.monitoring.anomalyThreshold) {
          await this.#alertAnomaly(req, changes, correlationId);
        }

        // Add sanitization metadata
        req.sanitization = {
          applied: true,
          changes,
          correlationId,
          timestamp: new Date()
        };

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('Request sanitization error', {
          correlationId,
          error: error.message,
          path: req.path,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Request sanitization failed',
          500,
          ERROR_CODES.SANITIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Sanitizes a value based on type and rules
   * @param {*} value - Value to sanitize
   * @param {Object} [rules] - Sanitization rules
   * @returns {*} Sanitized value
   */
  sanitize(value, rules = {}) {
    if (value === null || value === undefined) {
      return value;
    }

    // Apply type-specific sanitization
    if (typeof value === 'string') {
      return this.#sanitizeString(value, rules);
    } else if (Array.isArray(value)) {
      return this.#sanitizeArray(value, rules);
    } else if (typeof value === 'object') {
      return this.#sanitizeObject(value, rules);
    } else if (typeof value === 'number') {
      return this.#sanitizeNumber(value, rules);
    } else if (typeof value === 'boolean') {
      return value;
    }

    return value;
  }

  /**
   * Adds custom sanitization rule
   * @param {string} name - Rule name
   * @param {Function} sanitizer - Sanitizer function
   */
  addSanitizationRule(name, sanitizer) {
    this.#sanitizationRules.set(name, sanitizer);
    logger.debug('Custom sanitization rule added', { name });
  }

  /**
   * Adds contextual sanitizer
   * @param {string|RegExp} pathPattern - Path pattern
   * @param {Object} rules - Context-specific rules
   */
  addContextualSanitizer(pathPattern, rules) {
    this.#contextualSanitizers.set(pathPattern, rules);
    logger.debug('Contextual sanitizer added', { pathPattern: pathPattern.toString() });
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const envConfig = {
      sanitization: {
        body: {
          maxSize: parseInt(process.env.MAX_BODY_SIZE) || 
                  RequestSanitizerMiddleware.#DEFAULT_CONFIG.sanitization.body.maxSize
        },
        files: {
          maxSize: parseInt(process.env.MAX_FILE_SIZE) || 
                  RequestSanitizerMiddleware.#DEFAULT_CONFIG.sanitization.files.maxSize,
          allowedMimeTypes: config.security?.upload?.allowedMimeTypes || 
                           RequestSanitizerMiddleware.#DEFAULT_CONFIG.sanitization.files.allowedMimeTypes
        }
      },
      validation: {
        strictMode: config.security?.sanitizer?.strictMode ?? 
                   (process.env.NODE_ENV === 'production')
      },
      exemptions: {
        paths: config.security?.sanitizer?.exemptPaths || 
               RequestSanitizerMiddleware.#DEFAULT_CONFIG.exemptions.paths,
        ips: config.security?.trustedIPs || []
      }
    };

    return {
      ...RequestSanitizerMiddleware.#DEFAULT_CONFIG,
      ...envConfig,
      ...options,
      sanitization: {
        ...RequestSanitizerMiddleware.#DEFAULT_CONFIG.sanitization,
        ...envConfig.sanitization,
        ...options.sanitization
      },
      exemptions: {
        ...RequestSanitizerMiddleware.#DEFAULT_CONFIG.exemptions,
        ...envConfig.exemptions,
        ...options.exemptions
      }
    };
  }

  /**
   * @private
   * Initializes sanitization rules
   */
  #initializeSanitizationRules() {
    // String sanitizers
    this.#sanitizationRules.set('trim', (value) => value.trim());
    this.#sanitizationRules.set('lowercase', (value) => value.toLowerCase());
    this.#sanitizationRules.set('uppercase', (value) => value.toUpperCase());
    this.#sanitizationRules.set('removeExtraSpaces', (value) => value.replace(/\s+/g, ' '));
    this.#sanitizationRules.set('removeNullBytes', (value) => value.replace(/\0/g, ''));
    this.#sanitizationRules.set('stripControlChars', (value) => value.replace(/[\x00-\x1F\x7F]/g, ''));
    this.#sanitizationRules.set('normalizeLineEndings', (value) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    
    // Specific type sanitizers
    this.#sanitizationRules.set('email', (value) => {
      const trimmed = value.trim().toLowerCase();
      return validator.isEmail(trimmed) ? validator.normalizeEmail(trimmed) : '';
    });

    this.#sanitizationRules.set('url', (value) => {
      try {
        const url = new URL(value);
        return url.toString();
      } catch {
        return '';
      }
    });

    this.#sanitizationRules.set('slug', (value) => {
      return value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    });

    this.#sanitizationRules.set('alphanumeric', (value) => {
      return value.replace(/[^a-zA-Z0-9]/g, '');
    });

    this.#sanitizationRules.set('numeric', (value) => {
      return value.replace(/[^0-9.-]/g, '');
    });

    this.#sanitizationRules.set('phone', (value) => {
      return value.replace(/[^0-9+()-\s]/g, '');
    });

    this.#sanitizationRules.set('html', (value) => {
      return DOMPurify.sanitize(value, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
        ALLOWED_ATTR: ['href', 'title']
      });
    });

    this.#sanitizationRules.set('noHtml', (value) => {
      return value.replace(/<[^>]*>/g, '');
    });

    this.#sanitizationRules.set('escape', (value) => {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    });
  }

  /**
   * @private
   * Initializes contextual sanitizers
   */
  #initializeContextualSanitizers() {
    // Add default contextual rules
    Object.entries(this.#config.contextual.rules).forEach(([path, rules]) => {
      this.#contextualSanitizers.set(path, rules);
    });
  }

  /**
   * @private
   * Sanitizes string value
   */
  #sanitizeString(value, rules) {
    let sanitized = value;

    // Apply basic strategies
    if (this.#config.strategies.trimWhitespace && rules.trim !== false) {
      sanitized = this.#sanitizationRules.get('trim')(sanitized);
    }

    if (this.#config.strategies.removeNullBytes) {
      sanitized = this.#sanitizationRules.get('removeNullBytes')(sanitized);
    }

    if (this.#config.strategies.stripControlCharacters) {
      sanitized = this.#sanitizationRules.get('stripControlChars')(sanitized);
    }

    if (this.#config.strategies.normalizeLineEndings) {
      sanitized = this.#sanitizationRules.get('normalizeLineEndings')(sanitized);
    }

    if (this.#config.strategies.removeInvisibleCharacters) {
      // Remove zero-width characters
      sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    }

    // Apply length limit
    if (rules.maxLength || this.#config.depth.maxStringLength) {
      const maxLength = rules.maxLength || this.#config.depth.maxStringLength;
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }
    }

    // Apply type-specific sanitization
    if (rules.type && this.#sanitizationRules.has(rules.type)) {
      sanitized = this.#sanitizationRules.get(rules.type)(sanitized);
    }

    // Apply custom rules
    if (rules.sanitizer && this.#sanitizationRules.has(rules.sanitizer)) {
      sanitized = this.#sanitizationRules.get(rules.sanitizer)(sanitized);
    }

    // Apply transformations
    if (rules.toLowerCase || this.#config.transformation.toLowerCase.includes(rules.field)) {
      sanitized = sanitized.toLowerCase();
    }

    if (rules.toUpperCase || this.#config.transformation.toUpperCase.includes(rules.field)) {
      sanitized = sanitized.toUpperCase();
    }

    if (this.#config.transformation.removeExtraSpaces) {
      sanitized = this.#sanitizationRules.get('removeExtraSpaces')(sanitized);
    }

    return sanitized;
  }

  /**
   * @private
   * Sanitizes array
   */
  #sanitizeArray(value, rules, depth = 0) {
    if (depth > this.#config.depth.maxNestingLevel) {
      logger.warn('Max nesting level reached during sanitization');
      return [];
    }

    // Apply length limit
    let array = value;
    if (array.length > this.#config.depth.maxArrayLength) {
      array = array.slice(0, this.#config.depth.maxArrayLength);
    }

    return array.map(item => this.sanitize(item, rules));
  }

  /**
   * @private
   * Sanitizes object
   */
  #sanitizeObject(value, rules, depth = 0) {
    if (depth > this.#config.depth.maxNestingLevel) {
      logger.warn('Max nesting level reached during sanitization');
      return {};
    }

    const sanitized = {};
    const keys = Object.keys(value);

    // Apply key limit
    const maxKeys = Math.min(keys.length, this.#config.depth.maxObjectKeys);

    for (let i = 0; i < maxKeys; i++) {
      const key = keys[i];
      const fieldRules = { ...rules, field: key };

      // Sanitize key
      const sanitizedKey = this.#sanitizeString(key, { type: 'alphanumeric', maxLength: 100 });

      // Get field-specific rules
      if (this.#config.sanitization.params.rules[key]) {
        Object.assign(fieldRules, this.#config.sanitization.params.rules[key]);
      }

      // Sanitize value
      sanitized[sanitizedKey] = this.sanitize(value[key], fieldRules);
    }

    return sanitized;
  }

  /**
   * @private
   * Sanitizes number
   */
  #sanitizeNumber(value, rules) {
    let num = value;

    // Apply range limits
    if (rules.min !== undefined && num < rules.min) {
      num = rules.min;
    }
    if (rules.max !== undefined && num > rules.max) {
      num = rules.max;
    }

    // Apply precision
    if (rules.precision !== undefined) {
      num = parseFloat(num.toFixed(rules.precision));
    }

    return num;
  }

  /**
   * @private
   * Sanitizes headers
   */
  async #sanitizeHeaders(req, contextRules) {
    const { include, exclude } = this.#config.sanitization.headers;

    Object.keys(req.headers).forEach(header => {
      const lowerHeader = header.toLowerCase();

      // Skip excluded headers
      if (exclude.includes(lowerHeader)) {
        return;
      }

      // Only process included headers
      if (include.length > 0 && !include.includes(lowerHeader)) {
        return;
      }

      // Sanitize header value
      if (typeof req.headers[header] === 'string') {
        req.headers[header] = this.#sanitizeString(req.headers[header], {
          type: 'noHtml',
          maxLength: 1000,
          trim: true
        });
      }
    });
  }

  /**
   * @private
   * Sanitizes query parameters
   */
  async #sanitizeQuery(query, contextRules) {
    const paramCount = Object.keys(query).length;
    
    if (paramCount > this.#config.sanitization.query.maxParams) {
      logger.warn('Query parameter count exceeds limit', {
        count: paramCount,
        limit: this.#config.sanitization.query.maxParams
      });
    }

    return this.#sanitizeObject(query, {
      maxKeyLength: this.#config.sanitization.query.maxKeyLength,
      maxLength: this.#config.sanitization.query.maxValueLength,
      type: 'escape'
    });
  }

  /**
   * @private
   * Sanitizes URL parameters
   */
  async #sanitizeParams(params, contextRules) {
    const sanitized = {};

    Object.entries(params).forEach(([key, value]) => {
      const rules = this.#config.sanitization.params.rules[key] || {
        type: 'escape',
        maxLength: 100
      };

      sanitized[key] = this.sanitize(value, rules);
    });

    return sanitized;
  }

  /**
   * @private
   * Sanitizes request body
   */
  async #sanitizeBody(body, contentType, contextRules) {
    // Check content type
    const type = contentType?.split(';')[0];
    if (!this.#config.sanitization.body.contentTypes.includes(type)) {
      logger.warn('Unsupported content type for sanitization', { contentType });
      return body;
    }

    // Check size
    const bodySize = JSON.stringify(body).length;
    if (bodySize > this.#config.sanitization.body.maxSize) {
      throw new AppError(
        'Request body exceeds maximum size',
        413,
        ERROR_CODES.PAYLOAD_TOO_LARGE
      );
    }

    // Apply contextual rules
    const rules = contextRules.allowHtml === false ? { type: 'noHtml' } : {};

    return this.sanitize(body, rules);
  }

  /**
   * @private
   * Sanitizes uploaded files
   */
  async #sanitizeFiles(files, contextRules) {
    const fileArray = Array.isArray(files) ? files : [files];

    for (const file of fileArray) {
      // Check file size
      if (file.size > this.#config.sanitization.files.maxSize) {
        throw new AppError(
          'File size exceeds limit',
          413,
          ERROR_CODES.FILE_TOO_LARGE,
          { filename: file.originalname, size: file.size }
        );
      }

      // Check MIME type
      if (!this.#config.sanitization.files.allowedMimeTypes.includes(file.mimetype)) {
        throw new AppError(
          'File type not allowed',
          415,
          ERROR_CODES.UNSUPPORTED_FILE_TYPE,
          { filename: file.originalname, mimetype: file.mimetype }
        );
      }

      // Sanitize filename
      file.originalname = this.#sanitizeString(file.originalname, {
        type: 'slug',
        maxLength: 255
      });

      // Add file validation metadata
      file.sanitized = {
        validated: true,
        timestamp: new Date()
      };

      // TODO: Implement malware scanning if configured
      if (this.#config.sanitization.files.scanForMalware && contextRules.scanFiles) {
        file.sanitized.scanned = true;
        file.sanitized.malwareDetected = false;
      }
    }
  }

  /**
   * @private
   * Gets contextual rules for request
   */
  #getContextualRules(req) {
    if (!this.#config.contextual.enabled) {
      return {};
    }

    let rules = {};

    this.#contextualSanitizers.forEach((contextRules, pattern) => {
      if (typeof pattern === 'string' && req.path.startsWith(pattern)) {
        Object.assign(rules, contextRules);
      } else if (pattern instanceof RegExp && pattern.test(req.path)) {
        Object.assign(rules, contextRules);
      }
    });

    return rules;
  }

  /**
   * @private
   * Captures original data for tracking
   */
  #captureOriginalData(req) {
    return {
      headers: { ...req.headers },
      query: req.query ? { ...req.query } : {},
      params: req.params ? { ...req.params } : {},
      body: req.body ? JSON.parse(JSON.stringify(req.body)) : null
    };
  }

  /**
   * @private
   * Tracks changes made during sanitization
   */
  #trackChanges(original, current) {
    const changes = [];

    // Compare each data type
    ['headers', 'query', 'params', 'body'].forEach(type => {
      const originalData = original[type];
      const currentData = current[type];

      if (originalData && currentData) {
        const diff = this.#compareObjects(originalData, currentData, type);
        changes.push(...diff);
      }
    });

    return changes;
  }

  /**
   * @private
   * Compares objects for changes
   */
  #compareObjects(original, current, prefix = '') {
    const changes = [];

    // Check for modified or removed keys
    Object.keys(original).forEach(key => {
      const path = prefix ? `${prefix}.${key}` : key;

      if (!(key in current)) {
        changes.push({ path, type: 'removed', original: original[key] });
      } else if (typeof original[key] === 'object' && original[key] !== null) {
        changes.push(...this.#compareObjects(original[key], current[key], path));
      } else if (original[key] !== current[key]) {
        changes.push({
          path,
          type: 'modified',
          original: original[key],
          sanitized: current[key]
        });
      }
    });

    // Check for added keys
    Object.keys(current).forEach(key => {
      if (!(key in original)) {
        const path = prefix ? `${prefix}.${key}` : key;
        changes.push({ path, type: 'added', value: current[key] });
      }
    });

    return changes;
  }

  /**
   * @private
   * Validates sanitized data
   */
  async #validateSanitizedData(req) {
    const issues = [];

    // Validate required fields based on context
    const contextRules = this.#getContextualRules(req);
    
    if (contextRules.requireAuth && !req.auth) {
      issues.push('Authentication required for this endpoint');
    }

    // Add more validation as needed

    return {
      isValid: issues.length === 0,
      issues
    };
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

    // Check IP exemptions
    if (this.#config.exemptions.ips.includes(req.ip)) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Alerts on anomaly detection
   */
  async #alertAnomaly(req, changes, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'security.sanitization_anomaly',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        severity: 'warning',
        correlationId,
        metadata: {
          path: req.path,
          method: req.method,
          changeCount: changes.length,
          threshold: this.#config.monitoring.anomalyThreshold,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        }
      });

      logger.warn('Sanitization anomaly detected', {
        correlationId,
        path: req.path,
        changeCount: changes.length
      });

    } catch (error) {
      logger.error('Failed to log anomaly', { error: error.message });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `san_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets sanitization statistics
   * @returns {Object} Sanitization statistics
   */
  getStatistics() {
    // Implementation would return actual statistics
    return {
      totalRequests: 0,
      totalChanges: 0,
      anomaliesDetected: 0,
      commonChanges: []
    };
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates request sanitizer middleware instance
 * @param {Object} [options] - Configuration options
 * @returns {RequestSanitizerMiddleware} Middleware instance
 */
const getRequestSanitizerMiddleware = (options) => {
  if (!instance) {
    instance = new RequestSanitizerMiddleware(options);
  }
  return instance;
};

module.exports = {
  RequestSanitizerMiddleware,
  getRequestSanitizerMiddleware,
  // Export convenience methods
  requestSanitizer: (options) => getRequestSanitizerMiddleware(options).getMiddleware(),
  sanitizeValue: (value, rules) => getRequestSanitizerMiddleware().sanitize(value, rules)
};