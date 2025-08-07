'use strict';

/**
 * @fileoverview SQL injection protection middleware for database query security
 * @module shared/lib/middleware/security/sql-injection-protection
 * @requires module:sqlstring
 * @requires module:validator
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/query-builder
 * @requires module:shared/config
 */

const SqlString = require('sqlstring');
const validator = require('validator');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const AuditService = require('../../security/audit/audit-service');
const CacheService = require('../../services/cache-service');
const QueryBuilder = require('../../database/query-builder');
const config = require('../../../config');

/**
 * @class SQLInjectionProtectionMiddleware
 * @description Comprehensive SQL injection protection with multiple defense layers
 */
class SQLInjectionProtectionMiddleware {
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
   * @type {QueryBuilder}
   */
  #queryBuilder;

  /**
   * @private
   * @type {Map}
   */
  #sqlPatterns;

  /**
   * @private
   * @type {Set}
   */
  #blockedKeywords;

  /**
   * @private
   * @type {Map}
   */
  #parameterValidators;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    protection: {
      parameterizedQueries: true,
      inputEscaping: true,
      keywordBlocking: true,
      patternDetection: true,
      contextualValidation: true,
      queryLogging: process.env.NODE_ENV !== 'production'
    },
    validation: {
      maxQueryLength: 5000,
      maxParameterLength: 1000,
      maxParameterCount: 100,
      allowedCharacters: /^[a-zA-Z0-9\s\-_.,;:'"@#$%&*()+=\[\]{}\/\\<>?!~`]+$/,
      numericFields: ['id', 'age', 'count', 'quantity', 'price', 'amount'],
      dateFields: ['created_at', 'updated_at', 'date', 'timestamp'],
      emailFields: ['email', 'contact_email', 'user_email'],
      urlFields: ['url', 'website', 'link', 'callback_url']
    },
    patterns: {
      unionSelect: /\bunion\s+select\b/gi,
      dropTable: /\bdrop\s+table\b/gi,
      createTable: /\bcreate\s+table\b/gi,
      alterTable: /\balter\s+table\b/gi,
      deleteFrom: /\bdelete\s+from\b/gi,
      insertInto: /\binsert\s+into\b/gi,
      updateSet: /\bupdate\s+.+\s+set\b/gi,
      sqlComment: /--|\/*|\*\//g,
      multipleQueries: /;\s*(select|insert|update|delete|drop|create|alter)/gi,
      hexEncoding: /0x[0-9a-f]+/gi,
      charFunction: /\bchar\s*\(/gi,
      concatFunction: /\bconcat\s*\(/gi,
      sleepFunction: /\b(sleep|waitfor|pg_sleep)\s*\(/gi,
      benchmarkFunction: /\bbenchmark\s*\(/gi,
      informationSchema: /\binformation_schema\b/gi,
      systemTables: /\b(mysql|sys|pg_catalog)\./gi,
      outfile: /\binto\s+outfile\b/gi,
      dumpfile: /\binto\s+dumpfile\b/gi,
      loadFile: /\bload_file\s*\(/gi,
      sqlInjectionOperators: /(\bor\b|\band\b)\s+(['"]?)[\w\s]+\1\s*=\s*\1[\w\s]+\1/gi
    },
    keywords: {
      blocked: [
        'exec', 'execute', 'xp_cmdshell', 'sp_executesql', 'xp_regwrite',
        'xp_regread', 'xp_fileexist', 'xp_dirtree', 'xp_subdirs',
        'sp_oacreate', 'sp_oamethod', 'sp_oagetproperty', 'sp_oasetproperty',
        'sp_oadestroy', 'restore', 'backup', 'sql_variant_property',
        'openrowset', 'opendatasource', 'openquery', 'shutdown',
        'sp_configure', 'sp_addextendedproc', 'sp_dropextendedproc',
        'xp_servicecontrol', 'xp_ntsec_enumdomains', 'xp_terminate_process'
      ],
      contextual: {
        select: ['union', 'join', 'where', 'having', 'group by', 'order by'],
        insert: ['values', 'select', 'set'],
        update: ['set', 'where'],
        delete: ['where', 'from']
      }
    },
    scoring: {
      threshold: 10,
      weights: {
        pattern: 5,
        keyword: 3,
        encoding: 4,
        multipleQueries: 8,
        systemAccess: 10,
        fileOperation: 9,
        timeBasedAttack: 7
      }
    },
    exemptions: {
      paths: ['/api/admin/query', '/api/reporting'],
      roles: ['admin', 'database_admin'],
      parameters: ['search', 'filter', 'sort']
    },
    monitoring: {
      logAttempts: true,
      trackMetrics: true,
      alertOnHighRisk: true,
      blockRepeatOffenders: true,
      offenderThreshold: 3,
      blockDuration: 3600000 // 1 hour
    }
  };

  /**
   * Creates SQL injection protection middleware instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {QueryBuilder} [queryBuilder] - Query builder instance
   */
  constructor(options = {}, auditService, cacheService, queryBuilder) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#queryBuilder = queryBuilder || new QueryBuilder();
    this.#sqlPatterns = new Map();
    this.#blockedKeywords = new Set(this.#config.keywords.blocked);
    this.#parameterValidators = new Map();

    this.#initializePatterns();
    this.#initializeValidators();

    logger.info('SQLInjectionProtectionMiddleware initialized', {
      parameterizedQueries: this.#config.protection.parameterizedQueries,
      patternDetection: this.#config.protection.patternDetection,
      blockedKeywords: this.#blockedKeywords.size
    });
  }

  /**
   * Returns SQL injection protection middleware
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

        // Check if IP is blocked
        if (this.#config.monitoring.blockRepeatOffenders) {
          const isBlocked = await this.#checkIPBlock(req.ip);
          if (isBlocked) {
            throw new AppError(
              'Access temporarily blocked due to suspicious activity',
              403,
              ERROR_CODES.SQL_INJECTION_BLOCKED,
              { correlationId }
            );
          }
        }

        // Analyze request for SQL injection patterns
        const analysis = await this.#analyzeRequest(req);
        
        if (analysis.score >= this.#config.scoring.threshold) {
          // Log high-risk attempt
          if (this.#config.monitoring.alertOnHighRisk) {
            await this.#logSQLInjectionAttempt(req, 'high_risk', analysis, correlationId);
          }

          // Block repeat offenders
          if (this.#config.monitoring.blockRepeatOffenders) {
            await this.#trackOffender(req.ip);
          }

          throw new AppError(
            'Potentially malicious SQL pattern detected',
            400,
            ERROR_CODES.SQL_INJECTION_DETECTED,
            { correlationId, score: analysis.score }
          );
        }

        // Sanitize request parameters
        if (this.#config.protection.inputEscaping) {
          await this.#sanitizeRequest(req);
        }

        // Inject safe query builder
        req.safeQuery = this.#createSafeQueryInterface(req);

        // Track metrics
        if (this.#config.monitoring.trackMetrics) {
          this.#trackMetrics('success', Date.now() - startTime);
        }

        logger.debug('SQL injection protection applied', {
          correlationId,
          path: req.path,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        if (this.#config.monitoring.logAttempts) {
          await this.#logSQLInjectionAttempt(req, 'blocked', null, correlationId, error);
        }

        logger.error('SQL injection protection error', {
          correlationId,
          error: error.message,
          path: req.path,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'SQL injection protection failed',
          500,
          ERROR_CODES.SQL_PROTECTION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Escapes SQL string safely
   * @param {string} value - Value to escape
   * @param {Object} [options] - Escape options
   * @returns {string} Escaped value
   */
  escape(value, options = {}) {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    // Use SqlString for proper escaping
    if (options.isIdentifier) {
      return SqlString.escapeId(value);
    }

    return SqlString.escape(value);
  }

  /**
   * Validates SQL query for safety
   * @param {string} query - SQL query to validate
   * @param {Object} [params] - Query parameters
   * @returns {Object} Validation result
   */
  validateQuery(query, params = {}) {
    const validation = {
      isValid: true,
      issues: [],
      score: 0,
      sanitizedQuery: query,
      sanitizedParams: {}
    };

    // Check query length
    if (query.length > this.#config.validation.maxQueryLength) {
      validation.issues.push('Query exceeds maximum length');
      validation.isValid = false;
    }

    // Check for SQL patterns
    const patterns = this.#detectPatterns(query);
    if (patterns.length > 0) {
      validation.issues.push(...patterns.map(p => `Detected pattern: ${p.name}`));
      validation.score += patterns.reduce((sum, p) => sum + p.weight, 0);
    }

    // Check for blocked keywords
    const keywords = this.#detectKeywords(query);
    if (keywords.length > 0) {
      validation.issues.push(...keywords.map(k => `Blocked keyword: ${k}`));
      validation.isValid = false;
    }

    // Validate parameters
    Object.entries(params).forEach(([key, value]) => {
      const paramValidation = this.#validateParameter(key, value);
      if (!paramValidation.isValid) {
        validation.issues.push(`Invalid parameter ${key}: ${paramValidation.reason}`);
        validation.isValid = false;
      } else {
        validation.sanitizedParams[key] = paramValidation.sanitized;
      }
    });

    validation.isValid = validation.isValid && validation.score < this.#config.scoring.threshold;

    return validation;
  }

  /**
   * Creates parameterized query
   * @param {string} query - SQL query with placeholders
   * @param {Object|Array} params - Query parameters
   * @returns {Object} Parameterized query object
   */
  parameterize(query, params) {
    if (Array.isArray(params)) {
      // Positional parameters
      return {
        sql: query,
        values: params.map(p => this.escape(p))
      };
    }

    // Named parameters
    const values = [];
    const parameterizedQuery = query.replace(/:(\w+)/g, (match, paramName) => {
      if (params.hasOwnProperty(paramName)) {
        values.push(this.escape(params[paramName]));
        return '?';
      }
      return match;
    });

    return {
      sql: parameterizedQuery,
      values
    };
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const envConfig = {
      protection: {
        queryLogging: config.security?.sql?.queryLogging ?? 
                     (process.env.NODE_ENV !== 'production')
      },
      validation: {
        maxQueryLength: parseInt(process.env.SQL_MAX_QUERY_LENGTH) || 
                       SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.validation.maxQueryLength
      },
      keywords: {
        blocked: config.security?.sql?.blockedKeywords || 
                SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.keywords.blocked
      },
      exemptions: {
        paths: config.security?.sql?.exemptPaths || 
               SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.exemptions.paths,
        roles: config.security?.sql?.exemptRoles || 
               SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.exemptions.roles
      },
      monitoring: {
        blockRepeatOffenders: config.security?.sql?.blockRepeatOffenders ?? true,
        blockDuration: parseInt(process.env.SQL_BLOCK_DURATION) || 
                      SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.monitoring.blockDuration
      }
    };

    return {
      ...SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG,
      ...envConfig,
      ...options,
      protection: {
        ...SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.protection,
        ...envConfig.protection,
        ...options.protection
      },
      validation: {
        ...SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.validation,
        ...envConfig.validation,
        ...options.validation
      },
      keywords: {
        ...SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.keywords,
        ...envConfig.keywords,
        ...options.keywords
      },
      monitoring: {
        ...SQLInjectionProtectionMiddleware.#DEFAULT_CONFIG.monitoring,
        ...envConfig.monitoring,
        ...options.monitoring
      }
    };
  }

  /**
   * @private
   * Initializes SQL patterns
   */
  #initializePatterns() {
    Object.entries(this.#config.patterns).forEach(([name, regex]) => {
      this.#sqlPatterns.set(name, {
        regex,
        weight: this.#config.scoring.weights[this.#getPatternCategory(name)] || 1
      });
    });
  }

  /**
   * @private
   * Initializes parameter validators
   */
  #initializeValidators() {
    // Numeric validator
    this.#parameterValidators.set('numeric', (value) => {
      if (!validator.isNumeric(value.toString())) {
        return { isValid: false, reason: 'Not a valid number' };
      }
      return { isValid: true, sanitized: parseFloat(value) };
    });

    // Date validator
    this.#parameterValidators.set('date', (value) => {
      if (!validator.isISO8601(value.toString())) {
        return { isValid: false, reason: 'Not a valid date' };
      }
      return { isValid: true, sanitized: new Date(value).toISOString() };
    });

    // Email validator
    this.#parameterValidators.set('email', (value) => {
      if (!validator.isEmail(value.toString())) {
        return { isValid: false, reason: 'Not a valid email' };
      }
      return { isValid: true, sanitized: validator.normalizeEmail(value) };
    });

    // URL validator
    this.#parameterValidators.set('url', (value) => {
      if (!validator.isURL(value.toString())) {
        return { isValid: false, reason: 'Not a valid URL' };
      }
      return { isValid: true, sanitized: value };
    });

    // Alphanumeric validator
    this.#parameterValidators.set('alphanumeric', (value) => {
      if (!validator.isAlphanumeric(value.toString(), 'en-US', { ignore: ' -_' })) {
        return { isValid: false, reason: 'Contains invalid characters' };
      }
      return { isValid: true, sanitized: value };
    });
  }

  /**
   * @private
   * Analyzes request for SQL injection
   */
  async #analyzeRequest(req) {
    const analysis = {
      score: 0,
      patterns: [],
      keywords: [],
      suspicious: []
    };

    // Analyze all request data
    const requestData = {
      body: JSON.stringify(req.body || {}),
      query: JSON.stringify(req.query || {}),
      params: JSON.stringify(req.params || {}),
      headers: JSON.stringify(this.#getSafeHeaders(req.headers))
    };

    for (const [location, data] of Object.entries(requestData)) {
      // Check patterns
      const patterns = this.#detectPatterns(data);
      analysis.patterns.push(...patterns.map(p => ({ ...p, location })));
      analysis.score += patterns.reduce((sum, p) => sum + p.weight, 0);

      // Check keywords
      const keywords = this.#detectKeywords(data);
      analysis.keywords.push(...keywords.map(k => ({ keyword: k, location })));
      analysis.score += keywords.length * this.#config.scoring.weights.keyword;

      // Check encodings
      if (this.#hasEncodedContent(data)) {
        analysis.suspicious.push({ type: 'encoding', location });
        analysis.score += this.#config.scoring.weights.encoding;
      }
    }

    return analysis;
  }

  /**
   * @private
   * Detects SQL patterns
   */
  #detectPatterns(text) {
    const detected = [];

    this.#sqlPatterns.forEach((pattern, name) => {
      if (pattern.regex.test(text)) {
        detected.push({
          name,
          weight: pattern.weight,
          matches: text.match(pattern.regex)
        });
      }
    });

    return detected;
  }

  /**
   * @private
   * Detects blocked keywords
   */
  #detectKeywords(text) {
    const detected = [];
    const lowerText = text.toLowerCase();

    this.#blockedKeywords.forEach(keyword => {
      if (lowerText.includes(keyword.toLowerCase())) {
        detected.push(keyword);
      }
    });

    return detected;
  }

  /**
   * @private
   * Checks for encoded content
   */
  #hasEncodedContent(text) {
    // Check for hex encoding
    if (/0x[0-9a-f]{4,}/gi.test(text)) return true;
    
    // Check for URL encoding abuse
    if (/%[0-9a-f]{2}/gi.test(text)) {
      const decoded = decodeURIComponent(text);
      if (this.#detectPatterns(decoded).length > 0) return true;
    }

    // Check for base64 encoding
    if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(text)) {
      try {
        const decoded = Buffer.from(text, 'base64').toString();
        if (this.#detectPatterns(decoded).length > 0) return true;
      } catch {}
    }

    return false;
  }

  /**
   * @private
   * Sanitizes request data
   */
  async #sanitizeRequest(req) {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = this.#sanitizeObject(req.body);
    }

    // Sanitize query
    if (req.query && typeof req.query === 'object') {
      req.query = this.#sanitizeObject(req.query);
    }

    // Sanitize params
    if (req.params && typeof req.params === 'object') {
      req.params = this.#sanitizeObject(req.params);
    }
  }

  /**
   * @private
   * Sanitizes object recursively
   */
  #sanitizeObject(obj, path = '') {
    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.#sanitizeObject(item, `${path}[${index}]`)
      );
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string') {
          const validation = this.#validateParameter(key, value);
          sanitized[key] = validation.isValid ? validation.sanitized : this.escape(value);
        } else {
          sanitized[key] = this.#sanitizeObject(value, currentPath);
        }
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * @private
   * Validates parameter
   */
  #validateParameter(key, value) {
    // Check if parameter is exempt
    if (this.#config.exemptions.parameters.includes(key)) {
      return { isValid: true, sanitized: value };
    }

    // Check length
    if (value.toString().length > this.#config.validation.maxParameterLength) {
      return { isValid: false, reason: 'Exceeds maximum length' };
    }

    // Apply field-specific validation
    let validatorType = null;
    
    if (this.#config.validation.numericFields.includes(key)) {
      validatorType = 'numeric';
    } else if (this.#config.validation.dateFields.includes(key)) {
      validatorType = 'date';
    } else if (this.#config.validation.emailFields.includes(key)) {
      validatorType = 'email';
    } else if (this.#config.validation.urlFields.includes(key)) {
      validatorType = 'url';
    }

    if (validatorType && this.#parameterValidators.has(validatorType)) {
      return this.#parameterValidators.get(validatorType)(value);
    }

    // Default validation
    if (!this.#config.validation.allowedCharacters.test(value)) {
      return { isValid: false, reason: 'Contains invalid characters' };
    }

    return { isValid: true, sanitized: this.escape(value) };
  }

  /**
   * @private
   * Creates safe query interface
   */
  #createSafeQueryInterface(req) {
    return {
      select: (table, fields, conditions) => 
        this.#queryBuilder.select(table, fields, conditions),
      
      insert: (table, data) => 
        this.#queryBuilder.insert(table, data),
      
      update: (table, data, conditions) => 
        this.#queryBuilder.update(table, data, conditions),
      
      delete: (table, conditions) => 
        this.#queryBuilder.delete(table, conditions),
      
      raw: (query, params) => {
        const validation = this.validateQuery(query, params);
        if (!validation.isValid) {
          throw new AppError(
            'Invalid query',
            400,
            ERROR_CODES.SQL_QUERY_INVALID,
            { issues: validation.issues }
          );
        }
        return this.parameterize(query, params);
      }
    };
  }

  /**
   * @private
   * Gets safe headers
   */
  #getSafeHeaders(headers) {
    const safeHeaders = ['user-agent', 'referer', 'x-forwarded-for', 'accept'];
    const filtered = {};
    
    safeHeaders.forEach(header => {
      if (headers[header]) {
        filtered[header] = headers[header];
      }
    });
    
    return filtered;
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
   * Checks IP block status
   */
  async #checkIPBlock(ip) {
    const blockKey = `sql_block:${ip}`;
    return !!(await this.#cacheService.get(blockKey));
  }

  /**
   * @private
   * Tracks repeat offender
   */
  async #trackOffender(ip) {
    const offenseKey = `sql_offenses:${ip}`;
    const offenses = (await this.#cacheService.get(offenseKey) || 0) + 1;
    
    await this.#cacheService.set(offenseKey, offenses, 86400); // 24 hours

    if (offenses >= this.#config.monitoring.offenderThreshold) {
      const blockKey = `sql_block:${ip}`;
      await this.#cacheService.set(blockKey, true, this.#config.monitoring.blockDuration);
      
      logger.warn('IP blocked for repeated SQL injection attempts', { ip, offenses });
    }
  }

  /**
   * @private
   * Logs SQL injection attempt
   */
  async #logSQLInjectionAttempt(req, type, analysis, correlationId, error = null) {
    try {
      await this.#auditService.logEvent({
        event: 'security.sql_injection_attempt',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        severity: type === 'high_risk' ? 'critical' : 'warning',
        correlationId,
        metadata: {
          type,
          analysis,
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          error: error?.message
        }
      });

    } catch (err) {
      logger.error('Failed to log SQL injection attempt', { error: err.message });
    }
  }

  /**
   * @private
   * Gets pattern category
   */
  #getPatternCategory(patternName) {
    const categories = {
      unionSelect: 'pattern',
      dropTable: 'pattern',
      createTable: 'pattern',
      multipleQueries: 'multipleQueries',
      sleepFunction: 'timeBasedAttack',
      benchmarkFunction: 'timeBasedAttack',
      informationSchema: 'systemAccess',
      systemTables: 'systemAccess',
      outfile: 'fileOperation',
      loadFile: 'fileOperation'
    };

    return categories[patternName] || 'pattern';
  }

  /**
   * @private
   * Tracks metrics
   */
  #trackMetrics(result, duration) {
    try {
      logger.debug('SQL injection protection metrics', {
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
    return `sql_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates SQL injection protection middleware instance
 * @param {Object} [options] - Configuration options
 * @returns {SQLInjectionProtectionMiddleware} Middleware instance
 */
const getSQLInjectionProtectionMiddleware = (options) => {
  if (!instance) {
    instance = new SQLInjectionProtectionMiddleware(options);
  }
  return instance;
};

module.exports = {
  SQLInjectionProtectionMiddleware,
  getSQLInjectionProtectionMiddleware,
  // Export convenience methods
  sqlProtection: (options) => getSQLInjectionProtectionMiddleware(options).getMiddleware(),
  escapeSQL: (value, options) => getSQLInjectionProtectionMiddleware().escape(value, options),
  validateSQL: (query, params) => getSQLInjectionProtectionMiddleware().validateQuery(query, params),
  parameterizeQuery: (query, params) => getSQLInjectionProtectionMiddleware().parameterize(query, params)
};