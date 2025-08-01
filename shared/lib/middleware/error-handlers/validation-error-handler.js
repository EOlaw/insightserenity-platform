'use strict';

/**
 * @fileoverview Validation error handler middleware for request and data validation
 * @module shared/lib/middleware/error-handlers/validation-error-handler
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/config
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const commonValidators = require('../../utils/validators/common-validators');
const AuditService = require('../../security/audit/audit-service');
const config = require('../helmet-config');

/**
 * @class ValidationErrorHandler
 * @description Comprehensive validation error handler with detailed error formatting,
 * field mapping, and intelligent error suggestions
 */
class ValidationErrorHandler {
  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #validationPatterns;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #errorFrequency;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enableAudit: process.env.VALIDATION_ERROR_ENABLE_AUDIT === 'true',
    enableSuggestions: process.env.VALIDATION_ERROR_ENABLE_SUGGESTIONS !== 'false',
    enableMetrics: process.env.VALIDATION_ERROR_ENABLE_METRICS !== 'false',
    enableFieldMapping: process.env.VALIDATION_ERROR_ENABLE_FIELD_MAPPING !== 'false',
    maxErrorsPerField: parseInt(process.env.VALIDATION_ERROR_MAX_PER_FIELD || '3', 10),
    maxTotalErrors: parseInt(process.env.VALIDATION_ERROR_MAX_TOTAL || '20', 10),
    includeFieldValues: process.env.NODE_ENV === 'development',
    sanitizeValues: process.env.VALIDATION_ERROR_SANITIZE_VALUES !== 'false',
    errorFormats: {
      simple: process.env.VALIDATION_ERROR_FORMAT === 'simple',
      detailed: process.env.VALIDATION_ERROR_FORMAT !== 'simple'
    },
    fieldMappings: {
      // Common field name mappings for better UX
      email: 'Email Address',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      firstName: 'First Name',
      lastName: 'Last Name',
      phoneNumber: 'Phone Number',
      organizationId: 'Organization',
      tenantId: 'Workspace',
      userId: 'User',
      startDate: 'Start Date',
      endDate: 'End Date'
    },
    commonPatterns: {
      email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Please enter a valid email address'
      },
      phone: {
        pattern: /^\+?[\d\s\-\(\)]+$/,
        message: 'Please enter a valid phone number'
      },
      url: {
        pattern: /^https?:\/\/.+/,
        message: 'Please enter a valid URL starting with http:// or https://'
      },
      alphanumeric: {
        pattern: /^[a-zA-Z0-9]+$/,
        message: 'Only letters and numbers are allowed'
      },
      slug: {
        pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        message: 'Only lowercase letters, numbers, and hyphens are allowed'
      }
    },
    errorMessages: {
      required: '{field} is required',
      minLength: '{field} must be at least {min} characters long',
      maxLength: '{field} must not exceed {max} characters',
      min: '{field} must be at least {min}',
      max: '{field} must not exceed {max}',
      email: '{field} must be a valid email address',
      url: '{field} must be a valid URL',
      pattern: '{field} has an invalid format',
      unique: '{field} already exists',
      enum: '{field} must be one of: {values}',
      type: '{field} must be a valid {type}',
      date: '{field} must be a valid date',
      boolean: '{field} must be true or false',
      number: '{field} must be a valid number',
      integer: '{field} must be a whole number',
      array: '{field} must be an array',
      object: '{field} must be an object'
    },
    suggestions: {
      email: [
        'Check for typos in the email address',
        'Ensure the email contains @ and a domain',
        'Remove any spaces from the email'
      ],
      password: [
        'Use at least 12 characters',
        'Include uppercase and lowercase letters',
        'Add numbers and special characters',
        'Avoid common passwords'
      ],
      date: [
        'Use format: YYYY-MM-DD',
        'Ensure the date is valid',
        'Check that the date is not in the past/future as required'
      ],
      phone: [
        'Include country code for international numbers',
        'Remove any special characters except +, -, and spaces',
        'Ensure the number has the correct number of digits'
      ]
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #VALIDATION_SOURCES = {
    BODY: 'body',
    QUERY: 'query',
    PARAMS: 'params',
    HEADERS: 'headers',
    SCHEMA: 'schema',
    DATABASE: 'database',
    BUSINESS: 'business'
  };

  /**
   * Creates ValidationErrorHandler instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(options = {}, auditService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#validationPatterns = new Map();
    this.#errorFrequency = new Map();

    // Initialize validation patterns
    this.#initializeValidationPatterns();

    logger.info('ValidationErrorHandler initialized', {
      enableAudit: this.#config.enableAudit,
      enableSuggestions: this.#config.enableSuggestions,
      format: this.#config.errorFormats.detailed ? 'detailed' : 'simple'
    });
  }

  /**
   * Handles validation errors from various sources
   * @param {Error|Object} error - Validation error
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  handle = async (error, req, res, next) => {
    // Only handle validation errors
    if (!this.#isValidationError(error)) {
      return next(error);
    }

    const correlationId = req.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      // Parse validation error
      const parsedError = this.#parseValidationError(error);

      // Enhance with context
      const enhancedError = this.#enhanceValidationError(parsedError, req, correlationId);

      // Log validation error
      await this.#logValidationError(enhancedError, req);

      // Track metrics
      if (this.#config.enableMetrics) {
        this.#trackErrorMetrics(enhancedError);
      }

      // Audit if enabled
      if (this.#config.enableAudit) {
        await this.#auditValidationError(enhancedError, req);
      }

      // Build error response
      const errorResponse = this.#buildErrorResponse(enhancedError);

      // Send response
      res.status(enhancedError.statusCode || 400).json(errorResponse);

      const duration = Date.now() - startTime;
      logger.debug('Validation error response sent', {
        correlationId,
        fieldCount: enhancedError.errors?.length || 0,
        duration
      });

    } catch (handlerError) {
      logger.error('Validation error handler failed', {
        originalError: error.message,
        handlerError: handlerError.message,
        correlationId
      });

      // Fallback response
      res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: ERROR_CODES.VALIDATION_ERROR,
          correlationId
        }
      });
    }
  };

  /**
   * Express middleware for request validation
   * @param {Object|Function} schema - Validation schema or function
   * @param {string} [source='body'] - Request source to validate
   * @returns {Function} Express middleware
   */
  validateRequest = (schema, source = 'body') => {
    return async (req, res, next) => {
      try {
        const data = this.#getRequestData(req, source);
        const validationResult = await this.#validateData(data, schema, source);

        if (!validationResult.isValid) {
          const error = new AppError(
            'Validation failed',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            {
              source,
              errors: validationResult.errors
            }
          );
          return this.handle(error, req, res, next);
        }

        // Attach validated data
        req.validated = req.validated || {};
        req.validated[source] = validationResult.data;

        next();

      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...ValidationErrorHandler.#DEFAULT_CONFIG };

    Object.keys(ValidationErrorHandler.#DEFAULT_CONFIG).forEach(key => {
      if (typeof ValidationErrorHandler.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(ValidationErrorHandler.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...ValidationErrorHandler.#DEFAULT_CONFIG[key],
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
   * Initializes common validation patterns
   */
  #initializeValidationPatterns() {
    Object.entries(this.#config.commonPatterns).forEach(([name, config]) => {
      this.#validationPatterns.set(name, config);
    });
  }

  /**
   * @private
   * Checks if error is a validation error
   */
  #isValidationError(error) {
    // Check error code
    if (error.code === ERROR_CODES.VALIDATION_ERROR) {
      return true;
    }

    // Check error name
    const validationErrorNames = [
      'ValidationError',
      'ValidatorError',
      'CastError',
      'ValidationException'
    ];
    
    if (validationErrorNames.includes(error.name)) {
      return true;
    }

    // Check for validation-specific properties
    if (error.errors || error.validationErrors || error.failures) {
      return true;
    }

    // Check status code
    if (error.statusCode === 422 || error.status === 422) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Parses various validation error formats
   */
  #parseValidationError(error) {
    const parsed = {
      message: 'Validation failed',
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
      errors: [],
      source: ValidationErrorHandler.#VALIDATION_SOURCES.BODY
    };

    // Handle Mongoose ValidationError
    if (error.name === 'ValidationError' && error.errors) {
      parsed.errors = this.#parseMongooseErrors(error.errors);
      parsed.source = ValidationErrorHandler.#VALIDATION_SOURCES.DATABASE;
    }
    // Handle Joi/Yup validation errors
    else if (error.details && Array.isArray(error.details)) {
      parsed.errors = this.#parseJoiErrors(error.details);
      parsed.source = ValidationErrorHandler.#VALIDATION_SOURCES.SCHEMA;
    }
    // Handle custom validation errors
    else if (error.data && error.data.errors) {
      parsed.errors = this.#parseCustomErrors(error.data.errors);
      parsed.source = error.data.source || parsed.source;
    }
    // Handle array of errors
    else if (Array.isArray(error.errors)) {
      parsed.errors = this.#parseArrayErrors(error.errors);
    }
    // Single error
    else {
      parsed.errors = [{
        field: error.field || 'general',
        message: error.message,
        value: error.value,
        type: error.type || 'invalid'
      }];
    }

    // Limit errors
    parsed.errors = this.#limitErrors(parsed.errors);

    return parsed;
  }

  /**
   * @private
   * Parses Mongoose validation errors
   */
  #parseMongooseErrors(errors) {
    return Object.entries(errors).map(([field, error]) => ({
      field,
      message: error.message,
      value: this.#sanitizeValue(error.value),
      type: error.kind || error.name || 'invalid',
      path: error.path
    }));
  }

  /**
   * @private
   * Parses Joi validation errors
   */
  #parseJoiErrors(details) {
    return details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: this.#sanitizeValue(detail.context?.value),
      type: detail.type,
      context: detail.context
    }));
  }

  /**
   * @private
   * Parses custom validation errors
   */
  #parseCustomErrors(errors) {
    if (!Array.isArray(errors)) {
      errors = [errors];
    }

    return errors.map(error => ({
      field: error.field || error.path || 'general',
      message: error.message || error.msg || 'Invalid value',
      value: this.#sanitizeValue(error.value),
      type: error.type || error.code || 'invalid',
      context: error.context
    }));
  }

  /**
   * @private
   * Parses array of errors
   */
  #parseArrayErrors(errors) {
    return errors.map(error => {
      if (typeof error === 'string') {
        return {
          field: 'general',
          message: error,
          type: 'invalid'
        };
      }
      return {
        field: error.field || error.param || 'general',
        message: error.message || error.msg || 'Invalid value',
        value: this.#sanitizeValue(error.value),
        type: error.type || 'invalid'
      };
    });
  }

  /**
   * @private
   * Limits number of errors
   */
  #limitErrors(errors) {
    // Group by field
    const fieldErrors = {};
    
    errors.forEach(error => {
      if (!fieldErrors[error.field]) {
        fieldErrors[error.field] = [];
      }
      if (fieldErrors[error.field].length < this.#config.maxErrorsPerField) {
        fieldErrors[error.field].push(error);
      }
    });

    // Flatten and limit total
    const limited = [];
    for (const field in fieldErrors) {
      for (const error of fieldErrors[field]) {
        if (limited.length >= this.#config.maxTotalErrors) {
          break;
        }
        limited.push(error);
      }
    }

    return limited;
  }

  /**
   * @private
   * Enhances validation error with context
   */
  #enhanceValidationError(error, req, correlationId) {
    const enhanced = {
      ...error,
      correlationId,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      ip: req.ip || req.connection.remoteAddress
    };

    // Add user context
    if (req.user) {
      enhanced.userId = req.user._id || req.user.id;
      enhanced.organizationId = req.user.organizationId;
    }

    // Add tenant context
    if (req.tenant) {
      enhanced.tenantId = req.tenant._id || req.tenant.id;
    }

    // Enhance error messages
    enhanced.errors = enhanced.errors.map(error => 
      this.#enhanceErrorMessage(error)
    );

    // Add suggestions
    if (this.#config.enableSuggestions) {
      enhanced.errors = enhanced.errors.map(error => 
        this.#addErrorSuggestions(error)
      );
    }

    return enhanced;
  }

  /**
   * @private
   * Enhances individual error message
   */
  #enhanceErrorMessage(error) {
    // Map field names
    if (this.#config.enableFieldMapping) {
      error.displayField = this.#config.fieldMappings[error.field] || 
        this.#humanizeFieldName(error.field);
    }

    // Use template messages
    const template = this.#config.errorMessages[error.type];
    if (template) {
      error.message = this.#formatErrorMessage(template, error);
    }

    return error;
  }

  /**
   * @private
   * Formats error message with template
   */
  #formatErrorMessage(template, error) {
    return template.replace(/{(\w+)}/g, (match, key) => {
      switch (key) {
        case 'field':
          return error.displayField || error.field;
        case 'value':
          return error.value || 'provided value';
        case 'min':
        case 'max':
        case 'values':
          return error.context?.[key] || key;
        default:
          return match;
      }
    });
  }

  /**
   * @private
   * Adds suggestions to error
   */
  #addErrorSuggestions(error) {
    const fieldSuggestions = this.#config.suggestions[error.field];
    const typeSuggestions = this.#config.suggestions[error.type];

    if (fieldSuggestions || typeSuggestions) {
      error.suggestions = [
        ...(fieldSuggestions || []),
        ...(typeSuggestions || [])
      ].slice(0, 3); // Limit to 3 suggestions
    }

    return error;
  }

  /**
   * @private
   * Humanizes field name
   */
  #humanizeFieldName(field) {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }

  /**
   * @private
   * Sanitizes field value
   */
  #sanitizeValue(value) {
    if (!this.#config.sanitizeValues) {
      return value;
    }

    if (!this.#config.includeFieldValues) {
      return undefined;
    }

    // Sanitize sensitive values
    if (typeof value === 'string') {
      // Check for patterns that might be sensitive
      if (value.length > 50) {
        return value.substring(0, 50) + '...';
      }
      if (/password|secret|token|key/i.test(value)) {
        return '[REDACTED]';
      }
    }

    return value;
  }

  /**
   * @private
   * Logs validation error
   */
  async #logValidationError(error, req) {
    const logData = {
      correlationId: error.correlationId,
      source: error.source,
      errorCount: error.errors.length,
      fields: error.errors.map(e => e.field),
      path: error.path,
      method: error.method,
      ip: error.ip,
      userId: error.userId,
      organizationId: error.organizationId,
      tenantId: error.tenantId
    };

    logger.warn('Validation error occurred', logData);

    // Log individual errors in development
    if (process.env.NODE_ENV === 'development') {
      error.errors.forEach(err => {
        logger.debug('Validation error detail', {
          field: err.field,
          message: err.message,
          type: err.type,
          value: err.value
        });
      });
    }
  }

  /**
   * @private
   * Tracks error metrics
   */
  #trackErrorMetrics(error) {
    error.errors.forEach(err => {
      const key = `${err.field}:${err.type}`;
      const current = this.#errorFrequency.get(key) || 0;
      this.#errorFrequency.set(key, current + 1);
    });

    // Clean old metrics periodically
    if (this.#errorFrequency.size > 500) {
      this.#cleanOldMetrics();
    }
  }

  /**
   * @private
   * Cleans old metrics
   */
  #cleanOldMetrics() {
    // Keep top 250 most frequent errors
    const sorted = Array.from(this.#errorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 250);
    
    this.#errorFrequency.clear();
    sorted.forEach(([key, value]) => this.#errorFrequency.set(key, value));
  }

  /**
   * @private
   * Audits validation error
   */
  async #auditValidationError(error, req) {
    try {
      await this.#auditService.logEvent({
        event: 'validation.error',
        severity: 'info',
        userId: error.userId,
        organizationId: error.organizationId,
        tenantId: error.tenantId,
        ipAddress: error.ip,
        correlationId: error.correlationId,
        metadata: {
          source: error.source,
          errorCount: error.errors.length,
          fields: error.errors.map(e => ({
            field: e.field,
            type: e.type
          })),
          path: error.path,
          method: error.method
        }
      });
    } catch (auditError) {
      logger.error('Failed to audit validation error', {
        error: auditError.message,
        correlationId: error.correlationId
      });
    }
  }

  /**
   * @private
   * Builds error response
   */
  #buildErrorResponse(error) {
    const response = {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        correlationId: error.correlationId
      },
      timestamp: error.timestamp,
      path: error.path,
      method: error.method
    };

    if (this.#config.errorFormats.detailed) {
      response.errors = error.errors.map(err => {
        const errorDetail = {
          field: err.field,
          message: err.message,
          type: err.type
        };

        if (err.displayField) {
          errorDetail.displayField = err.displayField;
        }

        if (this.#config.includeFieldValues && err.value !== undefined) {
          errorDetail.value = err.value;
        }

        if (err.suggestions) {
          errorDetail.suggestions = err.suggestions;
        }

        return errorDetail;
      });

      response.summary = {
        total: error.errors.length,
        fields: [...new Set(error.errors.map(e => e.field))]
      };
    } else {
      // Simple format - just messages
      response.errors = error.errors.map(err => err.message);
    }

    return response;
  }

  /**
   * @private
   * Gets request data based on source
   */
  #getRequestData(req, source) {
    switch (source) {
      case 'body':
        return req.body;
      case 'query':
        return req.query;
      case 'params':
        return req.params;
      case 'headers':
        return req.headers;
      default:
        return req[source] || {};
    }
  }

  /**
   * @private
   * Validates data against schema
   */
  async #validateData(data, schema, source) {
    const result = {
      isValid: true,
      data: {},
      errors: []
    };

    try {
      // Handle function schemas
      if (typeof schema === 'function') {
        const validation = await schema(data);
        if (validation.error) {
          result.isValid = false;
          result.errors = this.#parseValidationError(validation.error).errors;
        } else {
          result.data = validation.value || data;
        }
      }
      // Handle object schemas (basic validation)
      else if (typeof schema === 'object') {
        result.data = await this.#validateObjectSchema(data, schema, result.errors);
        result.isValid = result.errors.length === 0;
      }
      else {
        throw new Error('Invalid validation schema');
      }
    } catch (error) {
      result.isValid = false;
      result.errors = [{
        field: 'general',
        message: error.message,
        type: 'schema_error'
      }];
    }

    return result;
  }

  /**
   * @private
   * Basic object schema validation
   */
  async #validateObjectSchema(data, schema, errors) {
    const validated = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Required check
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field,
          message: `${field} is required`,
          type: 'required'
        });
        continue;
      }

      // Skip optional empty fields
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }

      // Type check
      if (rules.type) {
        const typeValid = this.#checkType(value, rules.type);
        if (!typeValid) {
          errors.push({
            field,
            message: `${field} must be a valid ${rules.type}`,
            type: 'type',
            value: this.#sanitizeValue(value)
          });
          continue;
        }
      }

      // Pattern check
      if (rules.pattern && typeof value === 'string') {
        const pattern = rules.pattern instanceof RegExp ? 
          rules.pattern : 
          this.#validationPatterns.get(rules.pattern)?.pattern;
        
        if (pattern && !pattern.test(value)) {
          errors.push({
            field,
            message: rules.message || `${field} has an invalid format`,
            type: 'pattern',
            value: this.#sanitizeValue(value)
          });
          continue;
        }
      }

      // Length checks
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({
          field,
          message: `${field} must be at least ${rules.minLength} characters`,
          type: 'minLength',
          context: { min: rules.minLength }
        });
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({
          field,
          message: `${field} must not exceed ${rules.maxLength} characters`,
          type: 'maxLength',
          context: { max: rules.maxLength }
        });
      }

      // Numeric range checks
      if (rules.min !== undefined && value < rules.min) {
        errors.push({
          field,
          message: `${field} must be at least ${rules.min}`,
          type: 'min',
          context: { min: rules.min }
        });
      }

      if (rules.max !== undefined && value > rules.max) {
        errors.push({
          field,
          message: `${field} must not exceed ${rules.max}`,
          type: 'max',
          context: { max: rules.max }
        });
      }

      // Enum check
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({
          field,
          message: `${field} must be one of: ${rules.enum.join(', ')}`,
          type: 'enum',
          context: { values: rules.enum.join(', ') }
        });
      }

      // Custom validator
      if (rules.validator && typeof rules.validator === 'function') {
        try {
          const isValid = await rules.validator(value, data);
          if (!isValid) {
            errors.push({
              field,
              message: rules.message || `${field} is invalid`,
              type: 'custom'
            });
          }
        } catch (error) {
          errors.push({
            field,
            message: error.message || `${field} validation failed`,
            type: 'custom'
          });
        }
      }

      // Add to validated data if no errors
      if (!errors.find(e => e.field === field)) {
        validated[field] = value;
      }
    }

    return validated;
  }

  /**
   * @private
   * Checks value type
   */
  #checkType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      case 'email':
        return this.#config.commonPatterns.email.pattern.test(value);
      case 'url':
        return this.#config.commonPatterns.url.pattern.test(value);
      default:
        return true;
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
   * Adds custom validation pattern
   * @param {string} name - Pattern name
   * @param {Object} config - Pattern configuration
   */
  addValidationPattern(name, config) {
    this.#validationPatterns.set(name, config);
  }

  /**
   * Adds field mapping
   * @param {string} field - Field name
   * @param {string} displayName - Display name
   */
  addFieldMapping(field, displayName) {
    this.#config.fieldMappings[field] = displayName;
  }

  /**
   * Gets validation metrics
   * @returns {Object} Validation metrics
   */
  getMetrics() {
    const metrics = {
      total: 0,
      byField: {},
      byType: {},
      topErrors: []
    };

    for (const [key, count] of this.#errorFrequency.entries()) {
      const [field, type] = key.split(':');
      
      metrics.total += count;
      
      metrics.byField[field] = (metrics.byField[field] || 0) + count;
      metrics.byType[type] = (metrics.byType[type] || 0) + count;
    }

    // Get top 10 errors
    metrics.topErrors = Array.from(this.#errorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [field, type] = key.split(':');
        return { field, type, count };
      });

    return metrics;
  }

  /**
   * Clears metrics
   */
  clearMetrics() {
    this.#errorFrequency.clear();
    logger.info('Validation metrics cleared');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates ValidationErrorHandler instance
 * @param {Object} [options] - Configuration options
 * @returns {ValidationErrorHandler} ValidationErrorHandler instance
 */
const getValidationErrorHandler = (options) => {
  if (!instance) {
    instance = new ValidationErrorHandler(options);
  }
  return instance;
};

module.exports = {
  ValidationErrorHandler,
  getValidationErrorHandler,
  // Export convenience methods
  handle: (error, req, res, next) => getValidationErrorHandler().handle(error, req, res, next),
  validateRequest: (schema, source) => getValidationErrorHandler().validateRequest(schema, source)
};