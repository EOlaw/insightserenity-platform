'use strict';

/**
 * @fileoverview Input validation middleware for comprehensive request validation
 * @module shared/lib/middleware/security/input-validation
 * @requires module:express-validator
 * @requires module:validator
 * @requires module:joi
 * @requires module:ajv
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/config
 */

const { body, param, query, header, cookie, validationResult } = require('express-validator');
const validator = require('validator');
const Joi = require('joi');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const commonValidators = require('../../utils/validators/common-validators');
const AuditService = require('../../security/audit/audit-service');
const CacheService = require('../../services/cache-service');
const UserModel = require('../../database/models/users/user-model');
const OrganizationModel = require('../../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model');
const config = require('../../../config');

/**
 * @class InputValidationMiddleware
 * @description Comprehensive input validation with multiple validation strategies
 */
class InputValidationMiddleware {
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
   * @type {Ajv}
   */
  #ajv;

  /**
   * @private
   * @type {Map}
   */
  #schemas;

  /**
   * @private
   * @type {Map}
   */
  #customValidators;

  /**
   * @private
   * @type {Map}
   */
  #validationChains;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    strategies: {
      expressValidator: true,
      joi: true,
      jsonSchema: true,
      customValidators: true,
      contextualValidation: true
    },
    validation: {
      stripUnknown: true,
      abortEarly: false,
      convert: true,
      allowUnknown: false,
      cache: true,
      detailed: process.env.NODE_ENV !== 'production'
    },
    limits: {
      maxFieldSize: 1048576, // 1MB
      maxFields: 100,
      maxFileSize: 52428800, // 50MB
      maxFiles: 10,
      maxParts: 100,
      maxHeaderSize: 8192
    },
    schemas: {
      strict: true,
      coerceTypes: true,
      removeAdditional: true,
      useDefaults: true,
      discriminator: true
    },
    rules: {
      email: {
        normalize: true,
        requireTld: true,
        allowDisplayName: false,
        allowUtf8LocalPart: true
      },
      url: {
        protocols: ['http', 'https'],
        requireProtocol: true,
        requireValidProtocol: true,
        requireHost: true,
        requireTld: true
      },
      password: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true,
        disallowCommon: true
      },
      username: {
        minLength: 3,
        maxLength: 30,
        pattern: /^[a-zA-Z0-9_-]+$/,
        reserved: ['admin', 'root', 'system', 'api', 'public']
      }
    },
    customFormats: {
      objectId: /^[a-fA-F0-9]{24}$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      phone: /^\+?[1-9]\d{1,14}$/,
      creditCard: /^[0-9]{13,19}$/
    },
    contextual: {
      '/api/auth/register': {
        strict: true,
        requireCaptcha: true,
        checkDuplicates: true
      },
      '/api/auth/login': {
        rateLimit: true,
        trackFailures: true
      },
      '/api/admin': {
        requireAuth: true,
        requireRole: 'admin'
      }
    },
    security: {
      maxValidationErrors: 50,
      blockOnRepeatedErrors: true,
      errorThreshold: 10,
      blockDuration: 3600000 // 1 hour
    },
    monitoring: {
      logValidationErrors: true,
      trackMetrics: true,
      alertOnAnomalies: true,
      anomalyThreshold: 100
    }
  };

  /**
   * Creates input validation middleware instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, auditService, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#schemas = new Map();
    this.#customValidators = new Map();
    this.#validationChains = new Map();

    // Initialize AJV
    this.#initializeAjv();

    // Initialize validators
    this.#initializeCustomValidators();
    this.#initializeCommonSchemas();

    logger.info('InputValidationMiddleware initialized', {
      strategies: Object.keys(this.#config.strategies).filter(k => this.#config.strategies[k]),
      customFormats: Object.keys(this.#config.customFormats).length
    });
  }

  /**
   * Creates validation chain for specific fields
   * @param {Object} validations - Field validations
   * @returns {Array} Express validator chain
   */
  validate(validations) {
    const chains = [];

    Object.entries(validations).forEach(([field, rules]) => {
      const chain = this.#createValidationChain(field, rules);
      chains.push(chain);
    });

    // Add error handling middleware
    chains.push(this.#handleValidationErrors());

    return chains;
  }

  /**
   * Validates request against JSON schema
   * @param {string|Object} schema - Schema name or object
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateSchema(schema, options = {}) {
    return async (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Get schema
        const schemaObj = typeof schema === 'string' ? this.#schemas.get(schema) : schema;
        if (!schemaObj) {
          throw new AppError(
            'Validation schema not found',
            500,
            ERROR_CODES.VALIDATION_SCHEMA_NOT_FOUND,
            { schema: typeof schema === 'string' ? schema : 'inline' }
          );
        }

        // Compile and validate
        const validate = this.#ajv.compile(schemaObj);
        const data = options.source || req.body;
        const valid = validate(data);

        if (!valid) {
          const errors = this.#formatAjvErrors(validate.errors);
          
          if (this.#config.monitoring.logValidationErrors) {
            await this.#logValidationErrors(req, errors, correlationId);
          }

          throw new AppError(
            'Validation failed',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            {
              correlationId,
              errors: this.#config.validation.detailed ? errors : errors.slice(0, 5)
            }
          );
        }

        // Apply validated data
        if (options.source) {
          req[options.source] = validate.data;
        } else {
          req.body = validate.data;
        }

        logger.debug('Schema validation successful', {
          correlationId,
          schema: typeof schema === 'string' ? schema : 'inline',
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('Schema validation error', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Schema validation failed',
          500,
          ERROR_CODES.VALIDATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Validates request using Joi schema
   * @param {Object} schema - Joi schema
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateJoi(schema, options = {}) {
    return async (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Prepare data for validation
        const data = {
          body: req.body,
          query: req.query,
          params: req.params,
          headers: req.headers,
          ...options.additionalData
        };

        // Validate
        const validation = schema.validate(data, {
          abortEarly: this.#config.validation.abortEarly,
          convert: this.#config.validation.convert,
          allowUnknown: this.#config.validation.allowUnknown,
          stripUnknown: this.#config.validation.stripUnknown,
          context: {
            user: req.auth?.user,
            correlationId
          }
        });

        if (validation.error) {
          const errors = this.#formatJoiErrors(validation.error);
          
          if (this.#config.monitoring.logValidationErrors) {
            await this.#logValidationErrors(req, errors, correlationId);
          }

          throw new AppError(
            'Validation failed',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            {
              correlationId,
              errors: this.#config.validation.detailed ? errors : errors.slice(0, 5)
            }
          );
        }

        // Apply validated data
        if (validation.value) {
          Object.assign(req, validation.value);
        }

        logger.debug('Joi validation successful', {
          correlationId,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('Joi validation error', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Joi validation failed',
          500,
          ERROR_CODES.VALIDATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Creates custom validator
   * @param {string} name - Validator name
   * @param {Function} validator - Validator function
   * @param {string} [message] - Error message
   */
  addValidator(name, validator, message) {
    this.#customValidators.set(name, {
      validator,
      message: message || `Validation failed for ${name}`
    });
    logger.debug('Custom validator added', { name });
  }

  /**
   * Adds JSON schema
   * @param {string} name - Schema name
   * @param {Object} schema - JSON schema
   */
  addSchema(name, schema) {
    this.#schemas.set(name, schema);
    this.#ajv.addSchema(schema, name);
    logger.debug('JSON schema added', { name });
  }

  /**
   * Creates validation rules for common patterns
   * @returns {Object} Common validation rules
   */
  getCommonValidations() {
    return {
      email: () => body('email')
        .isEmail()
        .normalizeEmail(this.#config.rules.email)
        .custom(this.#customValidators.get('emailDomain').validator),

      password: () => body('password')
        .isLength({ min: this.#config.rules.password.minLength })
        .matches(/[A-Z]/).withMessage('Password must contain uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain number')
        .matches(/[!@#$%^&*]/).withMessage('Password must contain special character')
        .custom(this.#customValidators.get('passwordStrength').validator),

      username: () => body('username')
        .isLength({ 
          min: this.#config.rules.username.minLength,
          max: this.#config.rules.username.maxLength
        })
        .matches(this.#config.rules.username.pattern)
        .custom(this.#customValidators.get('reservedUsername').validator),

      objectId: (field) => param(field)
        .matches(this.#config.customFormats.objectId)
        .withMessage('Invalid ObjectId format'),

      pagination: () => [
        query('page').optional().isInt({ min: 1 }).toInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('sort').optional().isIn(['asc', 'desc'])
      ],

      dateRange: () => [
        query('startDate').optional().isISO8601().toDate(),
        query('endDate').optional().isISO8601().toDate()
          .custom((value, { req }) => {
            if (req.query.startDate && value < req.query.startDate) {
              throw new Error('End date must be after start date');
            }
            return true;
          })
      ]
    };
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const envConfig = {
      validation: {
        detailed: config.security?.validation?.detailed ?? 
                 (process.env.NODE_ENV !== 'production')
      },
      rules: {
        password: {
          minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
          requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
          requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
          requireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS !== 'false'
        }
      },
      security: {
        blockOnRepeatedErrors: config.security?.validation?.blockRepeatedErrors ?? true,
        errorThreshold: parseInt(process.env.VALIDATION_ERROR_THRESHOLD) || 10
      }
    };

    return {
      ...InputValidationMiddleware.#DEFAULT_CONFIG,
      ...envConfig,
      ...options,
      validation: {
        ...InputValidationMiddleware.#DEFAULT_CONFIG.validation,
        ...envConfig.validation,
        ...options.validation
      },
      rules: {
        ...InputValidationMiddleware.#DEFAULT_CONFIG.rules,
        ...envConfig.rules,
        ...options.rules
      },
      security: {
        ...InputValidationMiddleware.#DEFAULT_CONFIG.security,
        ...envConfig.security,
        ...options.security
      }
    };
  }

  /**
   * @private
   * Initializes AJV instance
   */
  #initializeAjv() {
    this.#ajv = new Ajv({
      allErrors: !this.#config.validation.abortEarly,
      removeAdditional: this.#config.schemas.removeAdditional,
      useDefaults: this.#config.schemas.useDefaults,
      coerceTypes: this.#config.schemas.coerceTypes,
      strict: this.#config.schemas.strict,
      discriminator: this.#config.schemas.discriminator
    });

    // Add formats
    addFormats(this.#ajv);

    // Add custom formats
    Object.entries(this.#config.customFormats).forEach(([name, pattern]) => {
      this.#ajv.addFormat(name, pattern);
    });

    // Add custom keywords
    this.#ajv.addKeyword({
      keyword: 'isNotEmpty',
      schemaType: 'boolean',
      compile: function(schema) {
        return function(data) {
          if (schema) {
            return data !== null && data !== undefined && data !== '';
          }
          return true;
        };
      }
    });

    this.#ajv.addKeyword({
      keyword: 'uniqueItems',
      schemaType: 'string',
      compile: function(schemaVal) {
        return function(data) {
          if (Array.isArray(data)) {
            const items = data.map(item => item[schemaVal]);
            return items.length === new Set(items).size;
          }
          return true;
        };
      }
    });
  }

  /**
   * @private
   * Initializes custom validators
   */
  #initializeCustomValidators() {
    // Email domain validator
    this.addValidator('emailDomain', async (value) => {
      if (config.security?.validation?.allowedEmailDomains) {
        const domain = value.split('@')[1];
        return config.security.validation.allowedEmailDomains.includes(domain);
      }
      return true;
    }, 'Email domain not allowed');

    // Password strength validator
    this.addValidator('passwordStrength', async (value) => {
      if (this.#config.rules.password.disallowCommon) {
        // Check against common passwords
        const commonPasswords = ['password', '12345678', 'qwerty', 'abc123'];
        if (commonPasswords.includes(value.toLowerCase())) {
          throw new Error('Password is too common');
        }
      }
      return true;
    });

    // Reserved username validator
    this.addValidator('reservedUsername', async (value) => {
      if (this.#config.rules.username.reserved.includes(value.toLowerCase())) {
        throw new Error('Username is reserved');
      }
      return true;
    });

    // Unique field validator
    this.addValidator('unique', async (value, { req, path }) => {
      const Model = req.validationModel || UserModel;
      const field = path.split('.').pop();
      
      const existing = await Model.findOne({ [field]: value });
      if (existing && existing._id.toString() !== req.params.id) {
        throw new Error(`${field} already exists`);
      }
      return true;
    });

    // Date range validator
    this.addValidator('dateRange', async (value, { req }) => {
      const { startDate, endDate } = value;
      if (startDate && endDate && startDate > endDate) {
        throw new Error('Invalid date range');
      }
      return true;
    });

    // File type validator
    this.addValidator('fileType', async (file) => {
      const allowedTypes = this.#config.limits.allowedMimeTypes || [
        'image/jpeg', 'image/png', 'image/gif', 'application/pdf'
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new Error('File type not allowed');
      }
      return true;
    });

    // Add common validators from utils
    Object.entries(commonValidators).forEach(([name, validator]) => {
      if (typeof validator === 'function') {
        this.addValidator(name, validator);
      }
    });
  }

  /**
   * @private
   * Initializes common schemas
   */
  #initializeCommonSchemas() {
    // User registration schema
    this.addSchema('userRegistration', {
      type: 'object',
      required: ['email', 'password', 'username'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          transform: ['toLowerCase', 'trim']
        },
        password: {
          type: 'string',
          minLength: this.#config.rules.password.minLength,
          maxLength: this.#config.rules.password.maxLength
        },
        username: {
          type: 'string',
          minLength: this.#config.rules.username.minLength,
          maxLength: this.#config.rules.username.maxLength,
          pattern: this.#config.rules.username.pattern.source
        },
        firstName: {
          type: 'string',
          minLength: 1,
          maxLength: 50
        },
        lastName: {
          type: 'string',
          minLength: 1,
          maxLength: 50
        }
      },
      additionalProperties: false
    });

    // User login schema
    this.addSchema('userLogin', {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: {
          type: 'string',
          format: 'email'
        },
        password: {
          type: 'string'
        },
        rememberMe: {
          type: 'boolean',
          default: false
        }
      },
      additionalProperties: false
    });

    // Pagination schema
    this.addSchema('pagination', {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
          default: 1
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 10
        },
        sort: {
          type: 'string',
          enum: ['asc', 'desc'],
          default: 'desc'
        },
        sortBy: {
          type: 'string',
          default: 'createdAt'
        }
      }
    });

    // ID parameter schema
    this.addSchema('idParam', {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          format: 'objectId'
        }
      }
    });
  }

  /**
   * @private
   * Creates validation chain
   */
  #createValidationChain(field, rules) {
    let chain;

    // Determine field location
    if (field.startsWith('body.')) {
      chain = body(field.substring(5));
    } else if (field.startsWith('query.')) {
      chain = query(field.substring(6));
    } else if (field.startsWith('param.')) {
      chain = param(field.substring(6));
    } else if (field.startsWith('header.')) {
      chain = header(field.substring(7));
    } else if (field.startsWith('cookie.')) {
      chain = cookie(field.substring(7));
    } else {
      chain = body(field);
    }

    // Apply rules
    Object.entries(rules).forEach(([rule, value]) => {
      switch (rule) {
        case 'required':
          if (value) chain = chain.notEmpty().withMessage(`${field} is required`);
          break;
        case 'optional':
          if (value) chain = chain.optional();
          break;
        case 'type':
          chain = this.#applyTypeValidation(chain, value, field);
          break;
        case 'length':
          if (typeof value === 'object') {
            chain = chain.isLength(value);
          }
          break;
        case 'min':
          chain = chain.isFloat({ min: value });
          break;
        case 'max':
          chain = chain.isFloat({ max: value });
          break;
        case 'pattern':
          chain = chain.matches(value);
          break;
        case 'custom':
          if (this.#customValidators.has(value)) {
            const { validator, message } = this.#customValidators.get(value);
            chain = chain.custom(validator).withMessage(message);
          }
          break;
        case 'sanitize':
          chain = this.#applySanitization(chain, value);
          break;
        default:
          if (typeof chain[rule] === 'function') {
            chain = chain[rule](value);
          }
      }
    });

    return chain;
  }

  /**
   * @private
   * Applies type validation
   */
  #applyTypeValidation(chain, type, field) {
    switch (type) {
      case 'email':
        return chain.isEmail().normalizeEmail(this.#config.rules.email);
      case 'url':
        return chain.isURL(this.#config.rules.url);
      case 'date':
        return chain.isISO8601().toDate();
      case 'boolean':
        return chain.isBoolean().toBoolean();
      case 'integer':
        return chain.isInt().toInt();
      case 'float':
        return chain.isFloat().toFloat();
      case 'array':
        return chain.isArray();
      case 'object':
        return chain.isObject();
      case 'objectId':
        return chain.matches(this.#config.customFormats.objectId);
      case 'uuid':
        return chain.isUUID();
      case 'phone':
        return chain.matches(this.#config.customFormats.phone);
      default:
        return chain;
    }
  }

  /**
   * @private
   * Applies sanitization
   */
  #applySanitization(chain, sanitizers) {
    const sanitizerList = Array.isArray(sanitizers) ? sanitizers : [sanitizers];

    sanitizerList.forEach(sanitizer => {
      switch (sanitizer) {
        case 'trim':
          chain = chain.trim();
          break;
        case 'escape':
          chain = chain.escape();
          break;
        case 'lowercase':
          chain = chain.toLowerCase();
          break;
        case 'uppercase':
          chain = chain.toUpperCase();
          break;
        case 'blacklist':
          chain = chain.blacklist('\\<\\>');
          break;
        default:
          if (typeof chain[sanitizer] === 'function') {
            chain = chain[sanitizer]();
          }
      }
    });

    return chain;
  }

  /**
   * @private
   * Handles validation errors
   */
  #handleValidationErrors() {
    return async (req, res, next) => {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        const correlationId = req.correlationId || this.#generateCorrelationId();
        const formattedErrors = this.#formatExpressErrors(errors.array());

        // Check error limit
        if (formattedErrors.length > this.#config.security.maxValidationErrors) {
          logger.warn('Excessive validation errors', {
            correlationId,
            errorCount: formattedErrors.length,
            limit: this.#config.security.maxValidationErrors
          });
        }

        // Log errors
        if (this.#config.monitoring.logValidationErrors) {
          await this.#logValidationErrors(req, formattedErrors, correlationId);
        }

        // Track repeated errors
        if (this.#config.security.blockOnRepeatedErrors) {
          await this.#trackValidationErrors(req);
        }

        return next(new AppError(
          'Validation failed',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          {
            correlationId,
            errors: this.#config.validation.detailed ? 
                   formattedErrors : 
                   formattedErrors.slice(0, 5)
          }
        ));
      }

      next();
    };
  }

  /**
   * @private
   * Formats Express Validator errors
   */
  #formatExpressErrors(errors) {
    return errors.map(error => ({
      field: error.param,
      message: error.msg,
      value: this.#config.validation.detailed ? error.value : undefined,
      location: error.location
    }));
  }

  /**
   * @private
   * Formats AJV errors
   */
  #formatAjvErrors(errors) {
    return errors.map(error => ({
      field: error.instancePath.replace(/^\//, '').replace(/\//g, '.'),
      message: error.message,
      keyword: error.keyword,
      params: this.#config.validation.detailed ? error.params : undefined
    }));
  }

  /**
   * @private
   * Formats Joi errors
   */
  #formatJoiErrors(error) {
    return error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type,
      context: this.#config.validation.detailed ? detail.context : undefined
    }));
  }

  /**
   * @private
   * Logs validation errors
   */
  async #logValidationErrors(req, errors, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'validation.failed',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        severity: 'info',
        correlationId,
        metadata: {
          path: req.path,
          method: req.method,
          errorCount: errors.length,
          errors: errors.slice(0, 10), // Log first 10 errors
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        }
      });
    } catch (error) {
      logger.error('Failed to log validation errors', { error: error.message });
    }
  }

  /**
   * @private
   * Tracks validation errors for blocking
   */
  async #trackValidationErrors(req) {
    const key = `validation_errors:${req.ip}`;
    const count = (await this.#cacheService.get(key) || 0) + 1;
    
    await this.#cacheService.set(key, count, 3600); // 1 hour

    if (count >= this.#config.security.errorThreshold) {
      const blockKey = `validation_block:${req.ip}`;
      await this.#cacheService.set(blockKey, true, this.#config.security.blockDuration);
      
      logger.warn('IP blocked for excessive validation errors', {
        ip: req.ip,
        errorCount: count
      });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets validation middleware for checking if blocked
   * @returns {Function} Express middleware function
   */
  checkBlocked() {
    return async (req, res, next) => {
      if (this.#config.security.blockOnRepeatedErrors) {
        const blockKey = `validation_block:${req.ip}`;
        const isBlocked = await this.#cacheService.get(blockKey);
        
        if (isBlocked) {
          return next(new AppError(
            'Too many validation errors. Please try again later.',
            429,
            ERROR_CODES.VALIDATION_BLOCKED
          ));
        }
      }
      next();
    };
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates input validation middleware instance
 * @param {Object} [options] - Configuration options
 * @returns {InputValidationMiddleware} Middleware instance
 */
const getInputValidationMiddleware = (options) => {
  if (!instance) {
    instance = new InputValidationMiddleware(options);
  }
  return instance;
};

module.exports = {
  InputValidationMiddleware,
  getInputValidationMiddleware,
  // Export convenience methods
  validate: (validations) => getInputValidationMiddleware().validate(validations),
  validateSchema: (schema, options) => getInputValidationMiddleware().validateSchema(schema, options),
  validateJoi: (schema, options) => getInputValidationMiddleware().validateJoi(schema, options),
  checkBlocked: () => getInputValidationMiddleware().checkBlocked(),
  // Export validation builders
  ...getInputValidationMiddleware().getCommonValidations()
};