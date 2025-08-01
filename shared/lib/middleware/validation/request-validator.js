'use strict';

/**
 * @fileoverview Simplified request validation middleware for development
 * @module shared/lib/middleware/validation/request-validator
 * @requires module:joi
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/config
 */

const Joi = require('joi');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const config = require('../../../config');

/**
 * @class RequestValidator
 * @description Simplified request validation middleware for development environments
 */
class RequestValidator {
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
   * @type {Map<string, Object>}
   */
  #schemaCache;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #validationMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
    presence: 'optional',
    cache: {
      enabled: true,
      ttl: 3600, // 1 hour
      maxSize: 1000
    },
    errorResponse: {
      includeDetails: process.env.NODE_ENV !== 'production',
      formatError: true,
      includeStack: false
    },
    customMessages: {
      'string.base': '{{#label}} must be a string',
      'string.email': '{{#label}} must be a valid email address',
      'number.base': '{{#label}} must be a number',
      'date.base': '{{#label}} must be a valid date',
      'required': '{{#label}} is required'
    },
    sanitization: {
      enabled: true,
      trimStrings: true,
      normalizeEmail: true,
      escapeHtml: true
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #VALIDATION_TARGETS = {
    BODY: 'body',
    QUERY: 'query',
    PARAMS: 'params',
    HEADERS: 'headers',
    COOKIES: 'cookies',
    FILES: 'files'
  };

  /**
   * Creates RequestValidator instance
   * @param {Object} [options] - Validator configuration
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#schemaCache = new Map();
    this.#validationMetrics = new Map();

    logger.info('RequestValidator initialized (simplified)', {
      cacheEnabled: this.#config.cache.enabled,
      targets: Object.values(RequestValidator.#VALIDATION_TARGETS),
      environment: process.env.NODE_ENV
    });
  }

  /**
   * Validates request against schema
   * @param {Object|Function} schema - Joi schema or schema factory
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validate(schema, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Get or build schema
        const validationSchema = await this.#getValidationSchema(schema, req);

        // Extract data to validate
        const dataToValidate = this.#extractValidationData(req, options);

        // Perform validation
        const validatedData = await this.#performValidation(
          dataToValidate,
          validationSchema,
          { ...this.#config, ...options }
        );

        // Apply validated data back to request
        this.#applyValidatedData(req, validatedData, options);

        // Sanitize data if enabled
        if (this.#config.sanitization.enabled) {
          await this.#sanitizeData(req, options);
        }

        // Update metrics
        this.#updateMetrics('success', req.route?.path, Date.now() - startTime);

        logger.debug('Request validation successful', {
          correlationId,
          path: req.path,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        // Update metrics
        this.#updateMetrics('failure', req.route?.path, duration);

        logger.error('Request validation failed', {
          correlationId,
          path: req.path,
          error: error.message,
          duration
        });

        // Format and return error
        const formattedError = this.#formatValidationError(error, correlationId);
        next(formattedError);
      }
    };
  }

  /**
   * Validates request body
   * @param {Object} schema - Joi schema for body validation
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateBody(schema, options = {}) {
    return this.validate(schema, {
      ...options,
      targets: [RequestValidator.#VALIDATION_TARGETS.BODY]
    });
  }

  /**
   * Validates query parameters
   * @param {Object} schema - Joi schema for query validation
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateQuery(schema, options = {}) {
    return this.validate(schema, {
      ...options,
      targets: [RequestValidator.#VALIDATION_TARGETS.QUERY]
    });
  }

  /**
   * Validates route parameters
   * @param {Object} schema - Joi schema for params validation
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateParams(schema, options = {}) {
    return this.validate(schema, {
      ...options,
      targets: [RequestValidator.#VALIDATION_TARGETS.PARAMS]
    });
  }

  /**
   * Validates headers
   * @param {Object} schema - Joi schema for headers validation
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateHeaders(schema, options = {}) {
    return this.validate(schema, {
      ...options,
      targets: [RequestValidator.#VALIDATION_TARGETS.HEADERS],
      stripUnknown: false // Don't strip unknown headers
    });
  }

  /**
   * Validates multiple targets
   * @param {Object} schemas - Object with schemas for different targets
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateMultiple(schemas, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const errors = [];

      try {
        // Validate each target
        for (const [target, schema] of Object.entries(schemas)) {
          if (!RequestValidator.#VALIDATION_TARGETS[target.toUpperCase()]) {
            logger.warn('Invalid validation target', { target });
            continue;
          }

          try {
            await new Promise((resolve, reject) => {
              this.validate(schema, {
                ...options,
                targets: [target]
              })(req, res, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          } catch (error) {
            errors.push({
              target,
              errors: error.details || error.message
            });
          }
        }

        if (errors.length > 0) {
          throw new AppError(
            'Multiple validation errors',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { correlationId, errors }
          );
        }

        next();

      } catch (error) {
        logger.error('Multiple validation failed', {
          correlationId,
          error: error.message
        });

        next(error);
      }
    };
  }

  /**
   * Creates static validator (replaces database rule functionality)
   * @param {Object} staticSchema - Static Joi schema object
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateWithStaticRules(staticSchema, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Use static schema directly
        const schema = this.#buildJoiSchema(staticSchema);

        // Validate using built schema
        await new Promise((resolve, reject) => {
          this.validate(schema, options)(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        next();

      } catch (error) {
        logger.error('Static rule validation failed', {
          correlationId,
          error: error.message
        });

        next(error);
      }
    };
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = {
      ...RequestValidator.#DEFAULT_CONFIG,
      ...options
    };

    // Deep merge nested objects
    Object.keys(RequestValidator.#DEFAULT_CONFIG).forEach(key => {
      if (typeof RequestValidator.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(RequestValidator.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...RequestValidator.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      }
    });

    return merged;
  }

  /**
   * @private
   * Gets or builds validation schema
   */
  async #getValidationSchema(schema, req) {
    // If schema is a function, call it with request context
    if (typeof schema === 'function') {
      return schema(req);
    }

    // Check cache
    if (this.#config.cache.enabled) {
      const cacheKey = this.#getSchemaCacheKey(schema);
      const cached = this.#schemaCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Build Joi schema with custom messages
    const joiSchema = this.#buildJoiSchema(schema);

    // Cache schema
    if (this.#config.cache.enabled) {
      this.#cacheSchema(schema, joiSchema);
    }

    return joiSchema;
  }

  /**
   * @private
   * Builds Joi schema with configuration
   */
  #buildJoiSchema(schema) {
    if (Joi.isSchema(schema)) {
      return schema.messages(this.#config.customMessages);
    }

    return Joi.object(schema).messages(this.#config.customMessages);
  }

  /**
   * @private
   * Extracts data to validate from request
   */
  #extractValidationData(req, options) {
    const targets = options.targets || [
      RequestValidator.#VALIDATION_TARGETS.BODY,
      RequestValidator.#VALIDATION_TARGETS.QUERY,
      RequestValidator.#VALIDATION_TARGETS.PARAMS
    ];

    const data = {};

    targets.forEach(target => {
      switch (target) {
        case RequestValidator.#VALIDATION_TARGETS.BODY:
          if (req.body) data.body = req.body;
          break;
        case RequestValidator.#VALIDATION_TARGETS.QUERY:
          if (req.query) data.query = req.query;
          break;
        case RequestValidator.#VALIDATION_TARGETS.PARAMS:
          if (req.params) data.params = req.params;
          break;
        case RequestValidator.#VALIDATION_TARGETS.HEADERS:
          if (req.headers) data.headers = req.headers;
          break;
        case RequestValidator.#VALIDATION_TARGETS.COOKIES:
          if (req.cookies) data.cookies = req.cookies;
          break;
        case RequestValidator.#VALIDATION_TARGETS.FILES:
          if (req.files) data.files = req.files;
          break;
      }
    });

    // Return flat object if single target
    if (targets.length === 1) {
      return data[targets[0]] || {};
    }

    return data;
  }

  /**
   * @private
   * Performs validation
   */
  async #performValidation(data, schema, options) {
    const validationOptions = {
      abortEarly: options.abortEarly,
      stripUnknown: options.stripUnknown,
      convert: options.convert,
      presence: options.presence,
      context: options.context || {}
    };

    const { error, value } = schema.validate(data, validationOptions);

    if (error) {
      throw this.#createValidationError(error);
    }

    return value;
  }

  /**
   * @private
   * Creates validation error
   */
  #createValidationError(joiError) {
    const details = joiError.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type,
      context: detail.context
    }));

    return new AppError(
      'Validation failed',
      400,
      ERROR_CODES.VALIDATION_ERROR,
      { details, _original: joiError }
    );
  }

  /**
   * @private
   * Applies validated data back to request
   */
  #applyValidatedData(req, validatedData, options) {
    const targets = options.targets || [
      RequestValidator.#VALIDATION_TARGETS.BODY,
      RequestValidator.#VALIDATION_TARGETS.QUERY,
      RequestValidator.#VALIDATION_TARGETS.PARAMS
    ];

    if (targets.length === 1) {
      // Single target - apply directly
      req[targets[0]] = validatedData;
    } else {
      // Multiple targets - apply each
      Object.entries(validatedData).forEach(([target, data]) => {
        req[target] = data;
      });
    }

    // Store validated data for reference
    req.validated = validatedData;
  }

  /**
   * @private
   * Sanitizes request data
   */
  async #sanitizeData(req, options) {
    const targets = options.targets || [RequestValidator.#VALIDATION_TARGETS.BODY];

    for (const target of targets) {
      if (req[target]) {
        req[target] = this.#sanitizeObject(req[target]);
      }
    }
  }

  /**
   * @private
   * Recursively sanitizes object
   */
  #sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return this.#sanitizeValue(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.#sanitizeObject(item));
    }

    const sanitized = {};
    Object.entries(obj).forEach(([key, value]) => {
      sanitized[key] = this.#sanitizeObject(value);
    });

    return sanitized;
  }

  /**
   * @private
   * Sanitizes individual value
   */
  #sanitizeValue(value) {
    if (typeof value !== 'string') return value;

    let sanitized = value;

    if (this.#config.sanitization.trimStrings) {
      sanitized = sanitized.trim();
    }

    if (this.#config.sanitization.escapeHtml) {
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }

    return sanitized;
  }

  /**
   * @private
   * Updates validation metrics
   */
  #updateMetrics(result, path, duration) {
    const key = `${path || 'unknown'}:${result}`;
    const metrics = this.#validationMetrics.get(key) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0
    };

    metrics.count++;
    metrics.totalDuration += duration;
    metrics.avgDuration = metrics.totalDuration / metrics.count;

    this.#validationMetrics.set(key, metrics);
  }

  /**
   * @private
   * Formats validation error for response
   */
  #formatValidationError(error, correlationId) {
    if (!this.#config.errorResponse.formatError) {
      return error;
    }

    const formatted = new AppError(
      'Validation failed',
      400,
      ERROR_CODES.VALIDATION_ERROR,
      {
        correlationId,
        errors: error.details || error.message
      }
    );

    if (!this.#config.errorResponse.includeDetails) {
      formatted.details = undefined;
    }

    if (!this.#config.errorResponse.includeStack) {
      formatted.stack = undefined;
    }

    return formatted;
  }

  /**
   * @private
   * Gets schema cache key
   */
  #getSchemaCacheKey(schema) {
    if (typeof schema === 'string') return schema;
    return `schema_${JSON.stringify(schema)}`.substring(0, 100);
  }

  /**
   * @private
   * Caches schema
   */
  #cacheSchema(original, built) {
    if (this.#schemaCache.size >= this.#config.cache.maxSize) {
      // Remove oldest entry
      const firstKey = this.#schemaCache.keys().next().value;
      this.#schemaCache.delete(firstKey);
    }

    const key = this.#getSchemaCacheKey(original);
    this.#schemaCache.set(key, built);
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets validation metrics
   * @returns {Object} Validation metrics
   */
  getMetrics() {
    const metrics = {};
    
    this.#validationMetrics.forEach((value, key) => {
      metrics[key] = { ...value };
    });

    return metrics;
  }

  /**
   * Clears validation cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    this.#schemaCache.clear();
    logger.info('Validation cache cleared');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates RequestValidator instance
 * @param {Object} [config] - Validator configuration
 * @returns {RequestValidator} Validator instance
 */
const getRequestValidator = (config) => {
  if (!instance) {
    instance = new RequestValidator(config);
  }
  return instance;
};

module.exports = {
  RequestValidator,
  getRequestValidator,
  // Export convenience methods
  validate: (schema, options) => getRequestValidator().validate(schema, options),
  validateBody: (schema, options) => getRequestValidator().validateBody(schema, options),
  validateQuery: (schema, options) => getRequestValidator().validateQuery(schema, options),
  validateParams: (schema, options) => getRequestValidator().validateParams(schema, options),
  validateHeaders: (schema, options) => getRequestValidator().validateHeaders(schema, options),
  validateMultiple: (schemas, options) => getRequestValidator().validateMultiple(schemas, options),
  validateWithRules: (staticSchema, options) => getRequestValidator().validateWithStaticRules(staticSchema, options)
};