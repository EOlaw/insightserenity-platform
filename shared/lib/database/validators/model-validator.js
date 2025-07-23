'use strict';

/**
 * @fileoverview Model validation utilities for database operations
 * @module shared/lib/database/validators/model-validator
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const commonValidators = require('../../utils/validators/common-validators');

/**
 * @class ModelValidator
 * @description Provides validation utilities for database models
 */
class ModelValidator {
  /**
   * @private
   * @static
   * @readonly
   */
  static #VALIDATION_RULES = {
    STRING: {
      minLength: 0,
      maxLength: 1000,
      pattern: null,
      enum: null,
      trim: true,
      lowercase: false,
      uppercase: false
    },
    NUMBER: {
      min: -Infinity,
      max: Infinity,
      integer: false,
      positive: false,
      negative: false
    },
    DATE: {
      min: null,
      max: null,
      future: false,
      past: false
    },
    ARRAY: {
      minLength: 0,
      maxLength: 1000,
      unique: false,
      itemType: null
    },
    OBJECT: {
      schema: null,
      strict: true,
      allowUnknown: false
    }
  };

  static #ERROR_MESSAGES = {
    REQUIRED: 'Field is required',
    TYPE: 'Invalid field type',
    MIN_LENGTH: 'Field is too short',
    MAX_LENGTH: 'Field is too long',
    MIN_VALUE: 'Value is too small',
    MAX_VALUE: 'Value is too large',
    PATTERN: 'Field does not match required pattern',
    ENUM: 'Value is not in allowed list',
    EMAIL: 'Invalid email address',
    URL: 'Invalid URL',
    PHONE: 'Invalid phone number',
    DATE: 'Invalid date',
    UNIQUE: 'Value must be unique',
    CUSTOM: 'Validation failed'
  };

  /**
   * Creates a validation schema
   * @static
   * @param {Object} definition - Schema definition
   * @returns {Object} Validation schema
   */
  static createSchema(definition) {
    const schema = {};

    for (const [field, rules] of Object.entries(definition)) {
      schema[field] = ModelValidator.#processFieldRules(field, rules);
    }

    return schema;
  }

  /**
   * Validates data against schema
   * @static
   * @async
   * @param {Object} data - Data to validate
   * @param {Object} schema - Validation schema
   * @param {Object} [options={}] - Validation options
   * @returns {Promise<Object>} Validation result
   */
  static async validate(data, schema, options = {}) {
    const {
      partial = false,
      stripUnknown = false,
      context = {}
    } = options;

    const errors = [];
    const validated = {};

    try {
      // Check for unknown fields
      if (!stripUnknown) {
        for (const field of Object.keys(data)) {
          if (!schema[field]) {
            errors.push({
              field,
              message: 'Unknown field',
              code: 'UNKNOWN_FIELD'
            });
          }
        }
      }

      // Validate each field
      for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        const fieldContext = { ...context, field, data };

        // Check required
        if (rules.required) {
          const isRequired = typeof rules.required === 'function'
            ? await rules.required(fieldContext)
            : rules.required;

          if (isRequired && (value === undefined || value === null || value === '')) {
            errors.push({
              field,
              message: rules.messages?.required || ModelValidator.#ERROR_MESSAGES.REQUIRED,
              code: 'REQUIRED_FIELD'
            });
            continue;
          }
        }

        // Skip validation if field is not present and not required
        if (value === undefined || value === null) {
          if (!partial) {
            validated[field] = value;
          }
          continue;
        }

        // Validate field
        const fieldResult = await ModelValidator.#validateField(field, value, rules, fieldContext);
        
        if (fieldResult.error) {
          errors.push(fieldResult.error);
        } else {
          validated[field] = fieldResult.value;
        }
      }

      // Run cross-field validations
      if (schema._validate && errors.length === 0) {
        const crossValidation = await schema._validate(validated, context);
        
        if (crossValidation && !crossValidation.valid) {
          errors.push(...crossValidation.errors);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        data: validated
      };

    } catch (error) {
      logger.error('Validation error', error);

      return {
        valid: false,
        errors: [{
          field: '_error',
          message: error.message,
          code: 'VALIDATION_ERROR'
        }],
        data: null
      };
    }
  }

  /**
   * Creates a model validator middleware
   * @static
   * @param {Object} schema - Validation schema
   * @param {Object} [options={}] - Middleware options
   * @returns {Function} Express middleware
   */
  static middleware(schema, options = {}) {
    return async (req, res, next) => {
      const {
        source = 'body',
        onError = null
      } = options;

      const data = req[source];
      const result = await ModelValidator.validate(data, schema, {
        ...options,
        context: { req, res }
      });

      if (!result.valid) {
        if (onError) {
          return onError(result.errors, req, res, next);
        }

        return next(new AppError(
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: result.errors }
        ));
      }

      req.validated = result.data;
      next();
    };
  }

  /**
   * @private
   * Processes field rules
   * @static
   * @param {string} field - Field name
   * @param {Object} rules - Field rules
   * @returns {Object} Processed rules
   */
  static #processFieldRules(field, rules) {
    if (typeof rules === 'string') {
      // Shorthand type definition
      return { type: rules };
    }

    const processed = { ...rules };

    // Add default validators based on type
    if (processed.type) {
      const defaults = ModelValidator.#getTypeDefaults(processed.type);
      Object.assign(processed, { ...defaults, ...processed });
    }

    // Process nested schemas
    if (processed.type === 'object' && processed.schema) {
      processed.schema = ModelValidator.createSchema(processed.schema);
    }

    if (processed.type === 'array' && processed.items?.schema) {
      processed.items.schema = ModelValidator.createSchema(processed.items.schema);
    }

    return processed;
  }

  /**
   * @private
   * Gets default rules for type
   * @static
   * @param {string} type - Field type
   * @returns {Object} Default rules
   */
  static #getTypeDefaults(type) {
    const defaults = {
      string: {
        transform: (value) => {
          if (typeof value !== 'string') {
            value = String(value);
          }
          return value.trim();
        }
      },
      number: {
        transform: (value) => {
          const num = Number(value);
          if (isNaN(num)) {
            throw new Error('Invalid number');
          }
          return num;
        }
      },
      boolean: {
        transform: (value) => {
          if (typeof value === 'string') {
            return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
          }
          return Boolean(value);
        }
      },
      date: {
        transform: (value) => {
          if (value instanceof Date) {
            return value;
          }
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
          }
          return date;
        }
      },
      array: {
        transform: (value) => {
          if (!Array.isArray(value)) {
            return [value];
          }
          return value;
        }
      },
      object: {
        transform: (value) => {
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              throw new Error('Invalid JSON');
            }
          }
          return value;
        }
      }
    };

    return defaults[type] || {};
  }

  /**
   * @private
   * Validates a single field
   * @static
   * @async
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @param {Object} rules - Field rules
   * @param {Object} context - Validation context
   * @returns {Promise<Object>} Validation result
   */
  static async #validateField(field, value, rules, context) {
    try {
      let processedValue = value;

      // Apply transformation
      if (rules.transform) {
        processedValue = await rules.transform(processedValue, context);
      }

      // Type validation
      if (rules.type) {
        const typeValid = await ModelValidator.#validateType(processedValue, rules.type);
        
        if (!typeValid) {
          return {
            error: {
              field,
              message: rules.messages?.type || ModelValidator.#ERROR_MESSAGES.TYPE,
              code: 'INVALID_TYPE',
              expected: rules.type,
              actual: typeof processedValue
            }
          };
        }
      }

      // Apply type-specific validations
      switch (rules.type) {
        case 'string':
          const stringResult = await ModelValidator.#validateString(field, processedValue, rules);
          if (stringResult.error) return stringResult;
          processedValue = stringResult.value;
          break;

        case 'number':
          const numberResult = await ModelValidator.#validateNumber(field, processedValue, rules);
          if (numberResult.error) return numberResult;
          processedValue = numberResult.value;
          break;

        case 'date':
          const dateResult = await ModelValidator.#validateDate(field, processedValue, rules);
          if (dateResult.error) return dateResult;
          processedValue = dateResult.value;
          break;

        case 'array':
          const arrayResult = await ModelValidator.#validateArray(field, processedValue, rules, context);
          if (arrayResult.error) return arrayResult;
          processedValue = arrayResult.value;
          break;

        case 'object':
          const objectResult = await ModelValidator.#validateObject(field, processedValue, rules, context);
          if (objectResult.error) return objectResult;
          processedValue = objectResult.value;
          break;
      }

      // Custom validators
      if (rules.validate) {
        const validators = Array.isArray(rules.validate) ? rules.validate : [rules.validate];
        
        for (const validator of validators) {
          const result = await validator(processedValue, context);
          
          if (result === false || (result && !result.valid)) {
            return {
              error: {
                field,
                message: result.message || rules.messages?.custom || ModelValidator.#ERROR_MESSAGES.CUSTOM,
                code: result.code || 'CUSTOM_VALIDATION_FAILED'
              }
            };
          }
        }
      }

      // Common validators
      if (rules.email && !commonValidators.isEmail(processedValue)) {
        return {
          error: {
            field,
            message: rules.messages?.email || ModelValidator.#ERROR_MESSAGES.EMAIL,
            code: 'INVALID_EMAIL'
          }
        };
      }

      if (rules.url && !commonValidators.isURL(processedValue)) {
        return {
          error: {
            field,
            message: rules.messages?.url || ModelValidator.#ERROR_MESSAGES.URL,
            code: 'INVALID_URL'
          }
        };
      }

      if (rules.phone && !commonValidators.isPhoneNumber(processedValue)) {
        return {
          error: {
            field,
            message: rules.messages?.phone || ModelValidator.#ERROR_MESSAGES.PHONE,
            code: 'INVALID_PHONE'
          }
        };
      }

      return { value: processedValue };

    } catch (error) {
      return {
        error: {
          field,
          message: error.message,
          code: 'VALIDATION_EXCEPTION'
        }
      };
    }
  }

  /**
   * @private
   * Validates value type
   * @static
   * @async
   * @param {*} value - Value to validate
   * @param {string} expectedType - Expected type
   * @returns {Promise<boolean>} Is valid
   */
  static async #validateType(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date && !isNaN(value.getTime());
      case 'array':
        return Array.isArray(value);
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'objectid':
        return /^[0-9a-fA-F]{24}$/.test(value);
      default:
        return true;
    }
  }

  /**
   * @private
   * Validates string value
   * @static
   * @async
   * @param {string} field - Field name
   * @param {string} value - String value
   * @param {Object} rules - Validation rules
   * @returns {Promise<Object>} Validation result
   */
  static async #validateString(field, value, rules) {
    let processedValue = value;

    // Length validation
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return {
        error: {
          field,
          message: rules.messages?.minLength || `${ModelValidator.#ERROR_MESSAGES.MIN_LENGTH} (min: ${rules.minLength})`,
          code: 'MIN_LENGTH',
          min: rules.minLength,
          actual: value.length
        }
      };
    }

    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return {
        error: {
          field,
          message: rules.messages?.maxLength || `${ModelValidator.#ERROR_MESSAGES.MAX_LENGTH} (max: ${rules.maxLength})`,
          code: 'MAX_LENGTH',
          max: rules.maxLength,
          actual: value.length
        }
      };
    }

    // Pattern validation
    if (rules.pattern) {
      const pattern = rules.pattern instanceof RegExp ? rules.pattern : new RegExp(rules.pattern);
      
      if (!pattern.test(value)) {
        return {
          error: {
            field,
            message: rules.messages?.pattern || ModelValidator.#ERROR_MESSAGES.PATTERN,
            code: 'PATTERN_MISMATCH',
            pattern: pattern.toString()
          }
        };
      }
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      return {
        error: {
          field,
          message: rules.messages?.enum || `${ModelValidator.#ERROR_MESSAGES.ENUM}: ${rules.enum.join(', ')}`,
          code: 'ENUM_MISMATCH',
          allowed: rules.enum
        }
      };
    }

    // Transformations
    if (rules.trim) {
      processedValue = processedValue.trim();
    }

    if (rules.lowercase) {
      processedValue = processedValue.toLowerCase();
    }

    if (rules.uppercase) {
      processedValue = processedValue.toUpperCase();
    }

    return { value: processedValue };
  }

  /**
   * @private
   * Validates number value
   * @static
   * @async
   * @param {string} field - Field name
   * @param {number} value - Number value
   * @param {Object} rules - Validation rules
   * @returns {Promise<Object>} Validation result
   */
  static async #validateNumber(field, value, rules) {
    // Range validation
    if (rules.min !== undefined && value < rules.min) {
      return {
        error: {
          field,
          message: rules.messages?.min || `${ModelValidator.#ERROR_MESSAGES.MIN_VALUE} (min: ${rules.min})`,
          code: 'MIN_VALUE',
          min: rules.min,
          actual: value
        }
      };
    }

    if (rules.max !== undefined && value > rules.max) {
      return {
        error: {
          field,
          message: rules.messages?.max || `${ModelValidator.#ERROR_MESSAGES.MAX_VALUE} (max: ${rules.max})`,
          code: 'MAX_VALUE',
          max: rules.max,
          actual: value
        }
      };
    }

    // Integer validation
    if (rules.integer && !Number.isInteger(value)) {
      return {
        error: {
          field,
          message: 'Value must be an integer',
          code: 'NOT_INTEGER'
        }
      };
    }

    // Sign validation
    if (rules.positive && value <= 0) {
      return {
        error: {
          field,
          message: 'Value must be positive',
          code: 'NOT_POSITIVE'
        }
      };
    }

    if (rules.negative && value >= 0) {
      return {
        error: {
          field,
          message: 'Value must be negative',
          code: 'NOT_NEGATIVE'
        }
      };
    }

    return { value };
  }

  /**
   * @private
   * Validates date value
   * @static
   * @async
   * @param {string} field - Field name
   * @param {Date} value - Date value
   * @param {Object} rules - Validation rules
   * @returns {Promise<Object>} Validation result
   */
  static async #validateDate(field, value, rules) {
    const now = new Date();

    // Range validation
    if (rules.min) {
      const minDate = rules.min instanceof Date ? rules.min : new Date(rules.min);
      
      if (value < minDate) {
        return {
          error: {
            field,
            message: rules.messages?.min || `Date must be after ${minDate.toISOString()}`,
            code: 'DATE_TOO_EARLY',
            min: minDate,
            actual: value
          }
        };
      }
    }

    if (rules.max) {
      const maxDate = rules.max instanceof Date ? rules.max : new Date(rules.max);
      
      if (value > maxDate) {
        return {
          error: {
            field,
            message: rules.messages?.max || `Date must be before ${maxDate.toISOString()}`,
            code: 'DATE_TOO_LATE',
            max: maxDate,
            actual: value
          }
        };
      }
    }

    // Time validation
    if (rules.future && value <= now) {
      return {
        error: {
          field,
          message: 'Date must be in the future',
          code: 'NOT_FUTURE'
        }
      };
    }

    if (rules.past && value >= now) {
      return {
        error: {
          field,
          message: 'Date must be in the past',
          code: 'NOT_PAST'
        }
      };
    }

    return { value };
  }

  /**
   * @private
   * Validates array value
   * @static
   * @async
   * @param {string} field - Field name
   * @param {Array} value - Array value
   * @param {Object} rules - Validation rules
   * @param {Object} context - Validation context
   * @returns {Promise<Object>} Validation result
   */
  static async #validateArray(field, value, rules, context) {
    // Length validation
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return {
        error: {
          field,
          message: `Array must have at least ${rules.minLength} items`,
          code: 'ARRAY_TOO_SHORT',
          min: rules.minLength,
          actual: value.length
        }
      };
    }

    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return {
        error: {
          field,
          message: `Array must have at most ${rules.maxLength} items`,
          code: 'ARRAY_TOO_LONG',
          max: rules.maxLength,
          actual: value.length
        }
      };
    }

    // Unique validation
    if (rules.unique) {
      const uniqueValues = new Set(value);
      
      if (uniqueValues.size !== value.length) {
        return {
          error: {
            field,
            message: 'Array must contain unique values',
            code: 'ARRAY_NOT_UNIQUE'
          }
        };
      }
    }

    // Item validation
    if (rules.items) {
      const validatedItems = [];
      
      for (let i = 0; i < value.length; i++) {
        const itemContext = { ...context, index: i };
        const itemResult = await ModelValidator.#validateField(
          `${field}[${i}]`,
          value[i],
          rules.items,
          itemContext
        );
        
        if (itemResult.error) {
          return itemResult;
        }
        
        validatedItems.push(itemResult.value);
      }
      
      return { value: validatedItems };
    }

    return { value };
  }

  /**
   * @private
   * Validates object value
   * @static
   * @async
   * @param {string} field - Field name
   * @param {Object} value - Object value
   * @param {Object} rules - Validation rules
   * @param {Object} context - Validation context
   * @returns {Promise<Object>} Validation result
   */
  static async #validateObject(field, value, rules, context) {
    if (rules.schema) {
      const result = await ModelValidator.validate(value, rules.schema, {
        partial: !rules.strict,
        stripUnknown: !rules.allowUnknown,
        context
      });
      
      if (!result.valid) {
        return {
          error: {
            field,
            message: 'Object validation failed',
            code: 'OBJECT_VALIDATION_FAILED',
            errors: result.errors
          }
        };
      }
      
      return { value: result.data };
    }

    return { value };
  }

  /**
   * Creates a compound validator
   * @static
   * @param {...Function} validators - Validator functions
   * @returns {Function} Compound validator
   */
  static compound(...validators) {
    return async (value, context) => {
      for (const validator of validators) {
        const result = await validator(value, context);
        
        if (result === false || (result && !result.valid)) {
          return result;
        }
      }
      
      return true;
    };
  }

  /**
   * Creates a conditional validator
   * @static
   * @param {Function} condition - Condition function
   * @param {Function} validator - Validator function
   * @returns {Function} Conditional validator
   */
  static conditional(condition, validator) {
    return async (value, context) => {
      const shouldValidate = await condition(value, context);
      
      if (!shouldValidate) {
        return true;
      }
      
      return await validator(value, context);
    };
  }

  /**
   * Creates a sanitizer
   * @static
   * @param {Object} rules - Sanitization rules
   * @returns {Function} Sanitizer function
   */
  static sanitizer(rules) {
    return (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      let sanitized = value;

      if (rules.trim) {
        sanitized = sanitized.trim();
      }

      if (rules.lowercase) {
        sanitized = sanitized.toLowerCase();
      }

      if (rules.uppercase) {
        sanitized = sanitized.toUpperCase();
      }

      if (rules.escape) {
        sanitized = sanitized
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      if (rules.stripHtml) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
      }

      if (rules.normalizeWhitespace) {
        sanitized = sanitized.replace(/\s+/g, ' ');
      }

      return sanitized;
    };
  }
}

module.exports = ModelValidator;