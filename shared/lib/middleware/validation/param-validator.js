'use strict';

/**
 * @fileoverview Parameter validation middleware with type coercion and transformation
 * @module shared/lib/middleware/validation/param-validator
 * @requires module:joi
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/tenant-model
 * @requires module:shared/lib/config
 */

const Joi = require('joi');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const DateHelper = require('../../utils/helpers/date-helper');
const StringHelper = require('../../utils/helpers/string-helper');
const CacheService = require('../../services/cache-service');
const TenantModel = require('..\..\database\models\organizations\tenant-model');
const config = require('..\helmet-config');

/**
 * @class ParamValidator
 * @description Advanced parameter validation with type coercion and transformations
 */
class ParamValidator {
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
   * @type {Map<string, Function>}
   */
  #typeCoercers;

  /**
   * @private
   * @type {Map<string, Function>}
   */
  #transformers;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #validationRules;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    coercion: {
      enabled: true,
      strict: false,
      dateFormats: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'],
      numberLocale: 'en-US'
    },
    transformation: {
      enabled: true,
      trimStrings: true,
      normalizeStrings: true,
      caseConversion: null // 'lower', 'upper', 'camel', 'snake'
    },
    validation: {
      allowUnknown: false,
      removeUnknown: true,
      castArrays: true,
      parseArrays: true
    },
    defaults: {
      pagination: {
        page: 1,
        limit: 20,
        maxLimit: 100
      },
      sorting: {
        order: 'asc',
        allowedFields: []
      }
    },
    cache: {
      enabled: true,
      ttl: 3600
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #PARAM_TYPES = {
    STRING: 'string',
    NUMBER: 'number',
    INTEGER: 'integer',
    FLOAT: 'float',
    BOOLEAN: 'boolean',
    DATE: 'date',
    DATETIME: 'datetime',
    TIME: 'time',
    ARRAY: 'array',
    OBJECT: 'object',
    JSON: 'json',
    UUID: 'uuid',
    OBJECTID: 'objectId',
    EMAIL: 'email',
    URL: 'url',
    ENUM: 'enum'
  };

  /**
   * Creates ParamValidator instance
   * @param {Object} [options] - Validator configuration
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#typeCoercers = new Map();
    this.#transformers = new Map();
    this.#validationRules = new Map();

    // Initialize coercers and transformers
    this.#initializeCoercers();
    this.#initializeTransformers();
    this.#initializeValidationRules();

    logger.info('ParamValidator initialized', {
      coercionEnabled: this.#config.coercion.enabled,
      transformationEnabled: this.#config.transformation.enabled
    });
  }

  /**
   * Validates parameters with type coercion
   * @param {Object} rules - Validation rules for parameters
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validate(rules, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Process each parameter source
        const sources = ['params', 'query', 'body'];
        const errors = [];
        const validated = {};

        for (const source of sources) {
          if (!rules[source]) continue;

          try {
            const sourceData = req[source] || {};
            const validatedSource = await this.#validateSource(
              source,
              sourceData,
              rules[source],
              { ...this.#config, ...options }
            );

            // Apply validated data
            req[source] = validatedSource;
            validated[source] = validatedSource;

          } catch (error) {
            errors.push({
              source,
              errors: error.details || error.message
            });
          }
        }

        if (errors.length > 0) {
          throw new AppError(
            'Parameter validation failed',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { correlationId, errors }
          );
        }

        // Store validated parameters
        req.validated = validated;
        req.validationMetadata = {
          correlationId,
          timestamp: new Date(),
          duration: Date.now() - startTime
        };

        logger.debug('Parameter validation successful', {
          correlationId,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        logger.error('Parameter validation failed', {
          correlationId,
          error: error.message,
          duration: Date.now() - startTime
        });

        next(error instanceof AppError ? error : new AppError(
          'Parameter validation failed',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Validates and coerces a single parameter
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   * @param {Object} rule - Validation rule
   * @param {Object} [options] - Validation options
   * @returns {Promise<*>} Validated and coerced value
   */
  async validateParam(name, value, rule, options = {}) {
    try {
      // Apply coercion if enabled
      if (this.#config.coercion.enabled && rule.type) {
        value = await this.#coerceValue(value, rule.type, rule.coercionOptions);
      }

      // Apply transformation if enabled
      if (this.#config.transformation.enabled && rule.transform) {
        value = await this.#transformValue(value, rule.transform);
      }

      // Build Joi schema from rule
      const schema = this.#buildParamSchema(rule);

      // Validate
      const { error, value: validated } = schema.validate(value, {
        convert: true,
        ...options
      });

      if (error) {
        throw new AppError(
          `Invalid parameter: ${name}`,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { 
            parameter: name,
            value,
            error: error.message 
          }
        );
      }

      return validated;

    } catch (error) {
      logger.error('Parameter validation failed', {
        name,
        value,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Creates pagination validator
   * @param {Object} [options] - Pagination options
   * @returns {Function} Express middleware function
   */
  validatePagination(options = {}) {
    const defaults = { ...this.#config.defaults.pagination, ...options };

    return this.validate({
      query: {
        page: {
          type: ParamValidator.#PARAM_TYPES.INTEGER,
          min: 1,
          default: defaults.page,
          description: 'Page number'
        },
        limit: {
          type: ParamValidator.#PARAM_TYPES.INTEGER,
          min: 1,
          max: defaults.maxLimit,
          default: defaults.limit,
          description: 'Items per page'
        },
        offset: {
          type: ParamValidator.#PARAM_TYPES.INTEGER,
          min: 0,
          optional: true,
          description: 'Skip items'
        }
      }
    });
  }

  /**
   * Creates sorting validator
   * @param {Array<string>} allowedFields - Allowed sort fields
   * @param {Object} [options] - Sorting options
   * @returns {Function} Express middleware function
   */
  validateSorting(allowedFields, options = {}) {
    const defaults = { ...this.#config.defaults.sorting, ...options };

    return this.validate({
      query: {
        sort: {
          type: ParamValidator.#PARAM_TYPES.STRING,
          optional: true,
          enum: allowedFields,
          description: 'Sort field'
        },
        order: {
          type: ParamValidator.#PARAM_TYPES.STRING,
          optional: true,
          enum: ['asc', 'desc'],
          default: defaults.order,
          description: 'Sort order'
        }
      }
    });
  }

  /**
   * Creates date range validator
   * @param {Object} [options] - Date range options
   * @returns {Function} Express middleware function
   */
  validateDateRange(options = {}) {
    return this.validate({
      query: {
        startDate: {
          type: ParamValidator.#PARAM_TYPES.DATE,
          optional: !options.required,
          before: options.maxDate,
          description: 'Start date'
        },
        endDate: {
          type: ParamValidator.#PARAM_TYPES.DATE,
          optional: !options.required,
          after: 'startDate',
          before: options.maxDate,
          description: 'End date'
        }
      }
    });
  }

  /**
   * Creates search parameters validator
   * @param {Object} [options] - Search options
   * @returns {Function} Express middleware function
   */
  validateSearch(options = {}) {
    return this.validate({
      query: {
        q: {
          type: ParamValidator.#PARAM_TYPES.STRING,
          optional: true,
          minLength: options.minLength || 1,
          maxLength: options.maxLength || 200,
          transform: ['trim', 'escape'],
          description: 'Search query'
        },
        fields: {
          type: ParamValidator.#PARAM_TYPES.ARRAY,
          optional: true,
          items: {
            type: ParamValidator.#PARAM_TYPES.STRING,
            enum: options.searchableFields
          },
          description: 'Fields to search'
        },
        match: {
          type: ParamValidator.#PARAM_TYPES.STRING,
          optional: true,
          enum: ['exact', 'partial', 'fuzzy'],
          default: 'partial',
          description: 'Match type'
        }
      }
    });
  }

  /**
   * @private
   * Merges configuration
   */
  #mergeConfig(options) {
    const merged = { ...ParamValidator.#DEFAULT_CONFIG };

    Object.keys(ParamValidator.#DEFAULT_CONFIG).forEach(key => {
      if (typeof ParamValidator.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(ParamValidator.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...ParamValidator.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Initializes type coercers
   */
  #initializeCoercers() {
    // String coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.STRING, (value) => {
      if (value === null || value === undefined) return undefined;
      return String(value);
    });

    // Number coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.NUMBER, (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const num = Number(value);
      return isNaN(num) ? value : num;
    });

    // Integer coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.INTEGER, (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const num = parseInt(value, 10);
      return isNaN(num) ? value : num;
    });

    // Float coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.FLOAT, (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const num = parseFloat(value);
      return isNaN(num) ? value : num;
    });

    // Boolean coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.BOOLEAN, (value) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === '1' || value === 1) return true;
      if (value === 'false' || value === '0' || value === 0) return false;
      return value;
    });

    // Date coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.DATE, (value, options = {}) => {
      if (value === null || value === undefined || value === '') return undefined;
      if (value instanceof Date) return value;
      
      // Try multiple date formats
      const formats = options.formats || this.#config.coercion.dateFormats;
      for (const format of formats) {
        const date = DateHelper.parseDate(value, format);
        if (date) return date;
      }
      
      // Try native Date parsing
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date;
    });

    // Array coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.ARRAY, (value, options = {}) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value)) return value;
      
      if (typeof value === 'string') {
        // Try JSON parsing
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        
        // Try comma-separated
        if (value.includes(',')) {
          return value.split(',').map(v => v.trim());
        }
      }
      
      // Single value to array
      return this.#config.validation.castArrays ? [value] : value;
    });

    // Object/JSON coercer
    this.#typeCoercers.set(ParamValidator.#PARAM_TYPES.OBJECT, (value) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object') return value;
      
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {}
      }
      
      return value;
    });
  }

  /**
   * @private
   * Initializes transformers
   */
  #initializeTransformers() {
    // Trim transformer
    this.#transformers.set('trim', (value) => {
      return typeof value === 'string' ? value.trim() : value;
    });

    // Lowercase transformer
    this.#transformers.set('lowercase', (value) => {
      return typeof value === 'string' ? value.toLowerCase() : value;
    });

    // Uppercase transformer
    this.#transformers.set('uppercase', (value) => {
      return typeof value === 'string' ? value.toUpperCase() : value;
    });

    // Capitalize transformer
    this.#transformers.set('capitalize', (value) => {
      return typeof value === 'string' ? 
        value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : value;
    });

    // Snake case transformer
    this.#transformers.set('snakeCase', (value) => {
      return typeof value === 'string' ? StringHelper.toSnakeCase(value) : value;
    });

    // Camel case transformer
    this.#transformers.set('camelCase', (value) => {
      return typeof value === 'string' ? StringHelper.toCamelCase(value) : value;
    });

    // Escape HTML transformer
    this.#transformers.set('escape', (value) => {
      return typeof value === 'string' ? StringHelper.escapeHtml(value) : value;
    });

    // Normalize transformer (remove extra spaces, normalize unicode)
    this.#transformers.set('normalize', (value) => {
      if (typeof value !== 'string') return value;
      return value.normalize('NFC').replace(/\s+/g, ' ').trim();
    });

    // Slug transformer
    this.#transformers.set('slug', (value) => {
      return typeof value === 'string' ? StringHelper.slugify(value) : value;
    });

    // Round number transformer
    this.#transformers.set('round', (value, options = {}) => {
      if (typeof value !== 'number') return value;
      const precision = options.precision || 0;
      return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
    });
  }

  /**
   * @private
   * Initializes validation rules
   */
  #initializeValidationRules() {
    // Common validation patterns
    this.#validationRules.set('email', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      transform: ['trim', 'lowercase']
    });

    this.#validationRules.set('phone', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^\+?[1-9]\d{1,14}$/,
      transform: ['trim']
    });

    this.#validationRules.set('uuid', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      transform: ['trim', 'lowercase']
    });

    this.#validationRules.set('objectId', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^[0-9a-fA-F]{24}$/,
      transform: ['trim']
    });

    this.#validationRules.set('url', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^https?:\/\/.+/,
      transform: ['trim']
    });

    this.#validationRules.set('alphanumeric', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^[a-zA-Z0-9]+$/,
      transform: ['trim']
    });

    this.#validationRules.set('slug', {
      type: ParamValidator.#PARAM_TYPES.STRING,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      transform: ['trim', 'lowercase', 'slug']
    });
  }

  /**
   * @private
   * Validates parameter source
   */
  async #validateSource(source, data, rules, options) {
    const validated = {};
    const errors = [];

    for (const [param, rule] of Object.entries(rules)) {
      try {
        let value = data[param];

        // Apply default if not present
        if (value === undefined && rule.default !== undefined) {
          value = typeof rule.default === 'function' ? rule.default() : rule.default;
        }

        // Check if required
        if (value === undefined && !rule.optional) {
          throw new Error(`${param} is required`);
        }

        // Skip if optional and not provided
        if (value === undefined && rule.optional) {
          continue;
        }

        // Validate parameter
        validated[param] = await this.validateParam(param, value, rule, options);

      } catch (error) {
        errors.push({
          parameter: param,
          message: error.message,
          value: data[param]
        });
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        `${source} validation failed`,
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { source, errors }
      );
    }

    // Remove unknown parameters if configured
    if (options.validation.removeUnknown) {
      Object.keys(data).forEach(key => {
        if (!rules[key]) {
          delete data[key];
        }
      });
    }

    return { ...data, ...validated };
  }

  /**
   * @private
   * Coerces value to specified type
   */
  async #coerceValue(value, type, options = {}) {
    const coercer = this.#typeCoercers.get(type);
    if (!coercer) {
      logger.warn('No coercer found for type', { type });
      return value;
    }

    try {
      return coercer(value, options);
    } catch (error) {
      logger.error('Coercion failed', {
        type,
        value,
        error: error.message
      });
      return value;
    }
  }

  /**
   * @private
   * Transforms value
   */
  async #transformValue(value, transforms) {
    if (!transforms) return value;

    const transformList = Array.isArray(transforms) ? transforms : [transforms];
    let transformed = value;

    for (const transform of transformList) {
      const transformerName = typeof transform === 'string' ? transform : transform.name;
      const transformerOptions = typeof transform === 'object' ? transform.options : {};

      const transformer = this.#transformers.get(transformerName);
      if (transformer) {
        transformed = transformer(transformed, transformerOptions);
      } else {
        logger.warn('No transformer found', { transform: transformerName });
      }
    }

    return transformed;
  }

  /**
   * @private
   * Builds Joi schema from rule
   */
  #buildParamSchema(rule) {
    let schema;

    // Get predefined rule if exists
    if (rule.rule && this.#validationRules.has(rule.rule)) {
      const predefined = this.#validationRules.get(rule.rule);
      rule = { ...predefined, ...rule };
    }

    // Build base schema by type
    switch (rule.type) {
      case ParamValidator.#PARAM_TYPES.STRING:
        schema = Joi.string();
        break;
      case ParamValidator.#PARAM_TYPES.NUMBER:
      case ParamValidator.#PARAM_TYPES.FLOAT:
        schema = Joi.number();
        break;
      case ParamValidator.#PARAM_TYPES.INTEGER:
        schema = Joi.number().integer();
        break;
      case ParamValidator.#PARAM_TYPES.BOOLEAN:
        schema = Joi.boolean();
        break;
      case ParamValidator.#PARAM_TYPES.DATE:
      case ParamValidator.#PARAM_TYPES.DATETIME:
        schema = Joi.date();
        break;
      case ParamValidator.#PARAM_TYPES.ARRAY:
        schema = Joi.array();
        if (rule.items) {
          schema = schema.items(this.#buildParamSchema(rule.items));
        }
        break;
      case ParamValidator.#PARAM_TYPES.OBJECT:
      case ParamValidator.#PARAM_TYPES.JSON:
        schema = Joi.object();
        if (rule.properties) {
          const properties = {};
          Object.entries(rule.properties).forEach(([key, prop]) => {
            properties[key] = this.#buildParamSchema(prop);
          });
          schema = schema.keys(properties);
        }
        break;
      default:
        schema = Joi.any();
    }

    // Apply constraints
    if (rule.required) schema = schema.required();
    if (rule.optional) schema = schema.optional();
    if (rule.min !== undefined) schema = schema.min(rule.min);
    if (rule.max !== undefined) schema = schema.max(rule.max);
    if (rule.minLength !== undefined) schema = schema.min(rule.minLength);
    if (rule.maxLength !== undefined) schema = schema.max(rule.maxLength);
    if (rule.pattern) schema = schema.pattern(rule.pattern);
    if (rule.enum) schema = schema.valid(...rule.enum);
    if (rule.before) schema = schema.max(rule.before);
    if (rule.after) schema = schema.min(rule.after);
    if (rule.description) schema = schema.description(rule.description);

    return schema;
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `param_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Adds custom type coercer
   * @param {string} type - Type name
   * @param {Function} coercer - Coercer function
   */
  addCoercer(type, coercer) {
    this.#typeCoercers.set(type, coercer);
    logger.info('Custom coercer added', { type });
  }

  /**
   * Adds custom transformer
   * @param {string} name - Transformer name
   * @param {Function} transformer - Transformer function
   */
  addTransformer(name, transformer) {
    this.#transformers.set(name, transformer);
    logger.info('Custom transformer added', { name });
  }

  /**
   * Adds validation rule template
   * @param {string} name - Rule name
   * @param {Object} rule - Rule definition
   */
  addValidationRule(name, rule) {
    this.#validationRules.set(name, rule);
    logger.info('Validation rule added', { name });
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates ParamValidator instance
 * @param {Object} [config] - Validator configuration
 * @returns {ParamValidator} Validator instance
 */
const getParamValidator = (config) => {
  if (!instance) {
    instance = new ParamValidator(config);
  }
  return instance;
};

module.exports = {
  ParamValidator,
  getParamValidator,
  // Export convenience methods
  validate: (rules, options) => getParamValidator().validate(rules, options),
  validateParam: (name, value, rule, options) => getParamValidator().validateParam(name, value, rule, options),
  validatePagination: (options) => getParamValidator().validatePagination(options),
  validateSorting: (fields, options) => getParamValidator().validateSorting(fields, options),
  validateDateRange: (options) => getParamValidator().validateDateRange(options),
  validateSearch: (options) => getParamValidator().validateSearch(options)
};