'use strict';

/**
 * @fileoverview Database data object validator for insert/update operations
 * @module shared/lib/database/validators/data-validator
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires mongodb
 */

const { ObjectId } = require('mongodb');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CommonValidators = require('../../utils/validators/common-validators');
const DateHelper = require('../../utils/helpers/date-helper');
const StringHelper = require('../../utils/helpers/string-helper');
const CryptoHelper = require('../../utils/helpers/crypto-helper');

/**
 * @class DataValidator
 * @description Validates actual data objects against schema definitions and business rules
 * before database operations, especially critical for seeding and bulk operations
 */
class DataValidator {
  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Type validators mapping
   */
  static #TYPE_VALIDATORS = {
    String: {
      validator: (value) => typeof value === 'string',
      sanitizer: (value) => String(value).trim(),
      typeName: 'string'
    },
    Number: {
      validator: (value) => typeof value === 'number' && !isNaN(value),
      sanitizer: (value) => Number(value),
      typeName: 'number'
    },
    Boolean: {
      validator: (value) => typeof value === 'boolean',
      sanitizer: (value) => Boolean(value),
      typeName: 'boolean'
    },
    Date: {
      validator: (value) => value instanceof Date || !isNaN(Date.parse(value)),
      sanitizer: (value) => value instanceof Date ? value : new Date(value),
      typeName: 'date'
    },
    ObjectId: {
      validator: (value) => {
        try {
          return ObjectId.isValid(value);
        } catch {
          return false;
        }
      },
      sanitizer: (value) => {
        if (value instanceof ObjectId) return value;
        return new ObjectId(value);
      },
      typeName: 'ObjectId'
    },
    Array: {
      validator: (value) => Array.isArray(value),
      sanitizer: (value) => Array.isArray(value) ? value : [value],
      typeName: 'array'
    },
    Object: {
      validator: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
      sanitizer: (value) => value,
      typeName: 'object'
    },
    Mixed: {
      validator: () => true,
      sanitizer: (value) => value,
      typeName: 'mixed'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Business rule validators for specific field patterns
   */
  static #BUSINESS_RULES = {
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      sanitizer: (value) => value.toLowerCase().trim(),
      message: 'Invalid email format'
    },
    phone: {
      pattern: /^\+?[\d\s-()]+$/,
      sanitizer: (value) => value.replace(/\s/g, ''),
      message: 'Invalid phone number format'
    },
    url: {
      pattern: /^https?:\/\/.+/,
      sanitizer: (value) => value.trim(),
      message: 'Invalid URL format'
    },
    slug: {
      pattern: /^[a-z0-9-]+$/,
      sanitizer: (value) => StringHelper.slugify(value),
      message: 'Invalid slug format'
    },
    username: {
      pattern: /^[a-zA-Z0-9_-]{3,30}$/,
      sanitizer: (value) => value.trim(),
      message: 'Username must be 3-30 characters, alphanumeric with _ or -'
    },
    password: {
      validator: (value) => value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value),
      message: 'Password must be at least 8 characters with uppercase, lowercase, and numbers'
    }
  };

  /**
   * @private
   * @static
   * @type {Map}
   * @description Validation results cache
   */
  static #validationCache = new Map();

  /**
   * Validates data against schema definition
   * @static
   * @param {Object} data - Data object to validate
   * @param {Object} schema - Schema definition
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.partial=false] - Allow partial validation (for updates)
   * @param {boolean} [options.sanitize=true] - Apply sanitization
   * @param {boolean} [options.strict=true] - Strict validation mode
   * @param {boolean} [options.skipRequired=false] - Skip required field validation
   * @param {Array<string>} [options.fields] - Validate only specific fields
   * @param {Array<string>} [options.exclude] - Exclude specific fields
   * @param {string} [options.operation='insert'] - Operation type (insert/update)
   * @returns {Object} Validation result with sanitized data
   * @throws {AppError} If validation fails in strict mode
   */
  static validate(data, schema, options = {}) {
    const {
      partial = false,
      sanitize = true,
      strict = true,
      skipRequired = false,
      fields = null,
      exclude = [],
      operation = 'insert'
    } = options;

    try {
      logger.info(`Validating data for ${operation}`, { 
        fields: fields || 'all',
        partial,
        strict 
      });

      const validationResult = {
        valid: true,
        errors: [],
        warnings: [],
        data: {},
        metadata: {
          fieldsValidated: 0,
          fieldsSkipped: 0,
          fieldsSanitized: 0,
          operation
        }
      };

      if (!data || typeof data !== 'object') {
        validationResult.valid = false;
        validationResult.errors.push({
          type: 'INVALID_DATA',
          message: 'Data must be a valid object',
          field: 'data'
        });
        
        if (strict) {
          throw new AppError(
            'Invalid data object',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { operation }
          );
        }
        
        return validationResult;
      }

      // Determine fields to validate
      const fieldsToValidate = DataValidator.#getFieldsToValidate(data, schema, fields, exclude);

      // Validate each field
      for (const fieldName of fieldsToValidate) {
        const fieldSchema = schema[fieldName];
        const fieldValue = data[fieldName];
        
        // Skip undefined fields in partial validation
        if (partial && fieldValue === undefined) {
          validationResult.metadata.fieldsSkipped++;
          continue;
        }

        const fieldValidation = DataValidator.#validateField(
          fieldName,
          fieldValue,
          fieldSchema,
          {
            sanitize,
            skipRequired: skipRequired || partial,
            operation
          }
        );

        if (!fieldValidation.valid) {
          validationResult.valid = false;
          validationResult.errors.push(...fieldValidation.errors);
        }
        
        validationResult.warnings.push(...fieldValidation.warnings);
        
        // Add validated/sanitized value to result
        if (fieldValidation.value !== undefined) {
          validationResult.data[fieldName] = fieldValidation.value;
          if (fieldValidation.sanitized) {
            validationResult.metadata.fieldsSanitized++;
          }
        }
        
        validationResult.metadata.fieldsValidated++;
      }

      // Check for required fields (insert operation)
      if (!partial && !skipRequired && operation === 'insert') {
        const requiredValidation = DataValidator.#validateRequiredFields(data, schema);
        if (!requiredValidation.valid) {
          validationResult.valid = false;
          validationResult.errors.push(...requiredValidation.errors);
        }
      }

      // Check for unknown fields
      const unknownFields = DataValidator.#checkUnknownFields(data, schema, partial);
      if (unknownFields.length > 0) {
        validationResult.warnings.push({
          type: 'UNKNOWN_FIELDS',
          message: `Unknown fields detected: ${unknownFields.join(', ')}`,
          fields: unknownFields
        });
      }

      // Apply business rules validation
      const businessRuleValidation = DataValidator.#validateBusinessRules(validationResult.data, schema);
      if (!businessRuleValidation.valid) {
        validationResult.valid = false;
        validationResult.errors.push(...businessRuleValidation.errors);
      }
      validationResult.warnings.push(...businessRuleValidation.warnings);

      if (strict && !validationResult.valid) {
        const errorDetails = validationResult.errors.map(e => e.message).join('; ');
        throw new AppError(
          `Data validation failed: ${errorDetails}`,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { operation, errors: validationResult.errors }
        );
      }

      logger.info('Data validation completed', {
        valid: validationResult.valid,
        fieldsValidated: validationResult.metadata.fieldsValidated,
        errorCount: validationResult.errors.length
      });

      return validationResult;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Data validation error', error);
      throw new AppError(
        'Data validation failed',
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { operation, originalError: error.message }
      );
    }
  }

  /**
   * Validates multiple data objects in batch
   * @static
   * @param {Array<Object>} dataArray - Array of data objects
   * @param {Object} schema - Schema definition
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.stopOnError=false] - Stop validation on first error
   * @param {boolean} [options.returnValid=true] - Return valid items even if some fail
   * @returns {Object} Batch validation results
   * @throws {AppError} If validation fails
   */
  static validateBatch(dataArray, schema, options = {}) {
    const {
      stopOnError = false,
      returnValid = true,
      ...validationOptions
    } = options;

    try {
      logger.info(`Validating batch of ${dataArray.length} items`);

      const results = {
        valid: true,
        totalItems: dataArray.length,
        validItems: [],
        invalidItems: [],
        errors: [],
        metadata: {
          processed: 0,
          succeeded: 0,
          failed: 0
        }
      };

      if (!Array.isArray(dataArray)) {
        throw new AppError(
          'Data must be an array for batch validation',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      for (let index = 0; index < dataArray.length; index++) {
        try {
          const itemValidation = DataValidator.validate(
            dataArray[index],
            schema,
            { ...validationOptions, strict: false }
          );

          results.metadata.processed++;

          if (itemValidation.valid) {
            results.metadata.succeeded++;
            if (returnValid) {
              results.validItems.push({
                index,
                data: itemValidation.data
              });
            }
          } else {
            results.metadata.failed++;
            results.valid = false;
            results.invalidItems.push({
              index,
              data: dataArray[index],
              errors: itemValidation.errors
            });
            results.errors.push({
              index,
              errors: itemValidation.errors
            });

            if (stopOnError) {
              break;
            }
          }

        } catch (error) {
          results.metadata.failed++;
          results.valid = false;
          results.errors.push({
            index,
            error: error.message
          });

          if (stopOnError) {
            break;
          }
        }
      }

      logger.info('Batch validation completed', {
        succeeded: results.metadata.succeeded,
        failed: results.metadata.failed
      });

      return results;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Batch validation error', error);
      throw new AppError(
        'Batch validation failed',
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates data for specific operation context
   * @static
   * @param {Object} data - Data to validate
   * @param {Object} schema - Schema definition
   * @param {string} context - Operation context (e.g., 'seed', 'migration', 'import')
   * @param {Object} [options={}] - Additional options
   * @returns {Object} Context-specific validation result
   * @throws {AppError} If validation fails
   */
  static validateForContext(data, schema, context, options = {}) {
    try {
      logger.info(`Validating data for context: ${context}`);

      // Context-specific validation rules
      const contextRules = {
        seed: {
          skipRequired: false,
          sanitize: true,
          strict: true,
          validateReferences: false
        },
        migration: {
          skipRequired: true,
          sanitize: false,
          strict: false,
          allowUnknownFields: true
        },
        import: {
          skipRequired: false,
          sanitize: true,
          strict: false,
          validateReferences: true
        },
        bulk: {
          skipRequired: false,
          sanitize: true,
          strict: true,
          batchMode: true
        }
      };

      const contextOptions = {
        ...contextRules[context] || {},
        ...options
      };

      // Add context-specific validations
      const baseValidation = DataValidator.validate(data, schema, contextOptions);

      // Additional context-specific checks
      switch (context) {
        case 'seed':
          // Ensure all required relationships are valid
          DataValidator.#validateSeedDataIntegrity(data, schema, baseValidation);
          break;
        
        case 'migration':
          // Check for data transformation requirements
          DataValidator.#validateMigrationData(data, schema, baseValidation);
          break;
        
        case 'import':
          // Validate external data format
          DataValidator.#validateImportData(data, schema, baseValidation);
          break;
      }

      return baseValidation;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error(`Context validation error for ${context}`, error);
      throw new AppError(
        `Data validation failed for ${context}`,
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { context, originalError: error.message }
      );
    }
  }

  /**
   * Clears validation cache
   * @static
   * @param {string} [cacheKey] - Specific cache entry to clear
   */
  static clearCache(cacheKey) {
    if (cacheKey) {
      DataValidator.#validationCache.delete(cacheKey);
      logger.debug(`Cleared validation cache for: ${cacheKey}`);
    } else {
      DataValidator.#validationCache.clear();
      logger.debug('Cleared all validation cache');
    }
  }

  /**
   * @private
   * Gets fields to validate based on options
   * @static
   * @param {Object} data - Data object
   * @param {Object} schema - Schema definition
   * @param {Array<string>|null} fields - Specific fields to validate
   * @param {Array<string>} exclude - Fields to exclude
   * @returns {Array<string>} Fields to validate
   */
  static #getFieldsToValidate(data, schema, fields, exclude) {
    let fieldsToValidate;

    if (fields && Array.isArray(fields)) {
      fieldsToValidate = fields.filter(f => f in schema);
    } else {
      // Validate all fields present in data that are also in schema
      fieldsToValidate = Object.keys(data).filter(f => f in schema);
    }

    // Remove excluded fields
    if (exclude.length > 0) {
      fieldsToValidate = fieldsToValidate.filter(f => !exclude.includes(f));
    }

    return fieldsToValidate;
  }

  /**
   * @private
   * Validates a single field
   * @static
   * @param {string} fieldName - Field name
   * @param {*} value - Field value
   * @param {Object} fieldSchema - Field schema definition
   * @param {Object} options - Validation options
   * @returns {Object} Field validation result
   */
  static #validateField(fieldName, value, fieldSchema, options) {
    const result = {
      valid: true,
      value: value,
      sanitized: false,
      errors: [],
      warnings: []
    };

    if (!fieldSchema) {
      return result;
    }

    // Normalize field schema
    const normalizedSchema = DataValidator.#normalizeFieldSchema(fieldSchema);

    // Check required
    if (!options.skipRequired && normalizedSchema.required && (value === undefined || value === null || value === '')) {
      result.valid = false;
      result.errors.push({
        type: 'REQUIRED_FIELD',
        message: `Field '${fieldName}' is required`,
        field: fieldName
      });
      return result;
    }

    // Skip further validation if value is undefined/null and not required
    if (value === undefined || value === null) {
      if (normalizedSchema.default !== undefined) {
        result.value = typeof normalizedSchema.default === 'function' 
          ? normalizedSchema.default() 
          : normalizedSchema.default;
        result.sanitized = true;
      }
      return result;
    }

    // Validate type
    const typeValidation = DataValidator.#validateType(fieldName, value, normalizedSchema.type);
    if (!typeValidation.valid) {
      result.valid = false;
      result.errors.push(...typeValidation.errors);
      return result;
    }

    // Apply sanitization
    if (options.sanitize && typeValidation.sanitizedValue !== undefined) {
      result.value = typeValidation.sanitizedValue;
      result.sanitized = true;
    }

    // Validate constraints
    const constraintValidation = DataValidator.#validateConstraints(
      fieldName,
      result.value,
      normalizedSchema
    );
    if (!constraintValidation.valid) {
      result.valid = false;
      result.errors.push(...constraintValidation.errors);
    }
    result.warnings.push(...constraintValidation.warnings);

    // Apply field-specific business rules
    const businessRule = DataValidator.#getBusinessRuleForField(fieldName);
    if (businessRule) {
      const ruleValidation = DataValidator.#applyBusinessRule(
        fieldName,
        result.value,
        businessRule
      );
      if (!ruleValidation.valid) {
        result.valid = false;
        result.errors.push(...ruleValidation.errors);
      }
      if (options.sanitize && ruleValidation.sanitizedValue !== undefined) {
        result.value = ruleValidation.sanitizedValue;
        result.sanitized = true;
      }
    }

    return result;
  }

  /**
   * @private
   * Normalizes field schema definition
   * @static
   * @param {*} fieldSchema - Field schema
   * @returns {Object} Normalized schema
   */
  static #normalizeFieldSchema(fieldSchema) {
    if (typeof fieldSchema === 'function') {
      return { type: fieldSchema };
    }
    
    if (Array.isArray(fieldSchema)) {
      return { type: Array, of: fieldSchema[0] };
    }
    
    return fieldSchema || {};
  }

  /**
   * @private
   * Validates field type
   * @static
   * @param {string} fieldName - Field name
   * @param {*} value - Field value
   * @param {*} type - Expected type
   * @returns {Object} Type validation result
   */
  static #validateType(fieldName, value, type) {
    const result = {
      valid: true,
      sanitizedValue: undefined,
      errors: []
    };

    if (!type) {
      return result;
    }

    const typeName = typeof type === 'function' ? type.name : String(type);
    const typeValidator = DataValidator.#TYPE_VALIDATORS[typeName];

    if (!typeValidator) {
      result.errors.push({
        type: 'UNSUPPORTED_TYPE',
        message: `Unsupported type '${typeName}' for field '${fieldName}'`,
        field: fieldName
      });
      result.valid = false;
      return result;
    }

    if (!typeValidator.validator(value)) {
      // Try sanitization
      try {
        const sanitized = typeValidator.sanitizer(value);
        if (typeValidator.validator(sanitized)) {
          result.sanitizedValue = sanitized;
          return result;
        }
      } catch (error) {
        // Sanitization failed
      }

      result.valid = false;
      result.errors.push({
        type: 'TYPE_ERROR',
        message: `Field '${fieldName}' must be of type ${typeValidator.typeName}`,
        field: fieldName,
        expectedType: typeValidator.typeName,
        actualType: typeof value
      });
    }

    return result;
  }

  /**
   * @private
   * Validates field constraints
   * @static
   * @param {string} fieldName - Field name
   * @param {*} value - Field value
   * @param {Object} schema - Field schema
   * @returns {Object} Constraint validation result
   */
  static #validateConstraints(fieldName, value, schema) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // String constraints
    if (typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        result.valid = false;
        result.errors.push({
          type: 'MIN_LENGTH',
          message: `Field '${fieldName}' must be at least ${schema.minLength} characters`,
          field: fieldName,
          constraint: 'minLength',
          expected: schema.minLength,
          actual: value.length
        });
      }

      if (schema.maxLength && value.length > schema.maxLength) {
        result.valid = false;
        result.errors.push({
          type: 'MAX_LENGTH',
          message: `Field '${fieldName}' must not exceed ${schema.maxLength} characters`,
          field: fieldName,
          constraint: 'maxLength',
          expected: schema.maxLength,
          actual: value.length
        });
      }

      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        result.valid = false;
        result.errors.push({
          type: 'PATTERN_MISMATCH',
          message: `Field '${fieldName}' does not match required pattern`,
          field: fieldName,
          constraint: 'pattern',
          pattern: schema.pattern
        });
      }
    }

    // Number constraints
    if (typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        result.valid = false;
        result.errors.push({
          type: 'MIN_VALUE',
          message: `Field '${fieldName}' must be at least ${schema.min}`,
          field: fieldName,
          constraint: 'min',
          expected: schema.min,
          actual: value
        });
      }

      if (schema.max !== undefined && value > schema.max) {
        result.valid = false;
        result.errors.push({
          type: 'MAX_VALUE',
          message: `Field '${fieldName}' must not exceed ${schema.max}`,
          field: fieldName,
          constraint: 'max',
          expected: schema.max,
          actual: value
        });
      }
    }

    // Array constraints
    if (Array.isArray(value)) {
      if (schema.minItems && value.length < schema.minItems) {
        result.valid = false;
        result.errors.push({
          type: 'MIN_ITEMS',
          message: `Field '${fieldName}' must have at least ${schema.minItems} items`,
          field: fieldName,
          constraint: 'minItems',
          expected: schema.minItems,
          actual: value.length
        });
      }

      if (schema.maxItems && value.length > schema.maxItems) {
        result.valid = false;
        result.errors.push({
          type: 'MAX_ITEMS',
          message: `Field '${fieldName}' must not exceed ${schema.maxItems} items`,
          field: fieldName,
          constraint: 'maxItems',
          expected: schema.maxItems,
          actual: value.length
        });
      }
    }

    // Enum constraint
    if (schema.enum && !schema.enum.includes(value)) {
      result.valid = false;
      result.errors.push({
        type: 'ENUM_MISMATCH',
        message: `Field '${fieldName}' must be one of: ${schema.enum.join(', ')}`,
        field: fieldName,
        constraint: 'enum',
        expected: schema.enum,
        actual: value
      });
    }

    // Custom validator
    if (schema.validate) {
      try {
        const validators = Array.isArray(schema.validate) ? schema.validate : [schema.validate];
        
        for (const validator of validators) {
          if (typeof validator === 'function') {
            const isValid = validator(value);
            if (!isValid) {
              result.valid = false;
              result.errors.push({
                type: 'CUSTOM_VALIDATION',
                message: `Field '${fieldName}' failed custom validation`,
                field: fieldName,
                constraint: 'validate'
              });
            }
          }
        }
      } catch (error) {
        result.warnings.push({
          type: 'VALIDATOR_ERROR',
          message: `Custom validator error for field '${fieldName}': ${error.message}`,
          field: fieldName
        });
      }
    }

    return result;
  }

  /**
   * @private
   * Validates required fields
   * @static
   * @param {Object} data - Data object
   * @param {Object} schema - Schema definition
   * @returns {Object} Required fields validation result
   */
  static #validateRequiredFields(data, schema) {
    const result = {
      valid: true,
      errors: []
    };

    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const normalizedSchema = DataValidator.#normalizeFieldSchema(fieldSchema);
      
      if (normalizedSchema.required) {
        const value = data[fieldName];
        
        if (value === undefined || value === null || 
            (typeof value === 'string' && value.trim() === '') ||
            (Array.isArray(value) && value.length === 0)) {
          
          result.valid = false;
          result.errors.push({
            type: 'MISSING_REQUIRED_FIELD',
            message: `Required field '${fieldName}' is missing or empty`,
            field: fieldName
          });
        }
      }
    }

    return result;
  }

  /**
   * @private
   * Checks for unknown fields not in schema
   * @static
   * @param {Object} data - Data object
   * @param {Object} schema - Schema definition
   * @param {boolean} partial - Whether partial validation
   * @returns {Array<string>} Unknown field names
   */
  static #checkUnknownFields(data, schema, partial) {
    const dataFields = Object.keys(data);
    const schemaFields = Object.keys(schema);
    
    // In partial mode, only check fields that are present
    return dataFields.filter(field => !schemaFields.includes(field));
  }

  /**
   * @private
   * Gets business rule for field based on name patterns
   * @static
   * @param {string} fieldName - Field name
   * @returns {Object|null} Business rule or null
   */
  static #getBusinessRuleForField(fieldName) {
    const lowerFieldName = fieldName.toLowerCase();
    
    for (const [ruleName, rule] of Object.entries(DataValidator.#BUSINESS_RULES)) {
      if (lowerFieldName.includes(ruleName) || lowerFieldName === ruleName) {
        return rule;
      }
    }
    
    return null;
  }

  /**
   * @private
   * Applies business rule to field value
   * @static
   * @param {string} fieldName - Field name
   * @param {*} value - Field value
   * @param {Object} rule - Business rule
   * @returns {Object} Rule validation result
   */
  static #applyBusinessRule(fieldName, value, rule) {
    const result = {
      valid: true,
      sanitizedValue: undefined,
      errors: []
    };

    if (rule.pattern && !rule.pattern.test(value)) {
      result.valid = false;
      result.errors.push({
        type: 'BUSINESS_RULE_VIOLATION',
        message: rule.message || `Field '${fieldName}' violates business rule`,
        field: fieldName,
        rule: rule.pattern.toString()
      });
    }

    if (rule.validator && !rule.validator(value)) {
      result.valid = false;
      result.errors.push({
        type: 'BUSINESS_RULE_VIOLATION',
        message: rule.message || `Field '${fieldName}' violates business rule`,
        field: fieldName
      });
    }

    if (rule.sanitizer) {
      try {
        result.sanitizedValue = rule.sanitizer(value);
      } catch (error) {
        // Sanitization failed, keep original value
      }
    }

    return result;
  }

  /**
   * @private
   * Validates business rules across multiple fields
   * @static
   * @param {Object} data - Complete data object
   * @param {Object} schema - Schema definition
   * @returns {Object} Business rules validation result
   */
  static #validateBusinessRules(data, schema) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Cross-field validations
    
    // Password confirmation
    if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
      result.valid = false;
      result.errors.push({
        type: 'PASSWORD_MISMATCH',
        message: 'Password and confirmation do not match',
        fields: ['password', 'confirmPassword']
      });
    }

    // Date range validations
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      
      if (start > end) {
        result.valid = false;
        result.errors.push({
          type: 'INVALID_DATE_RANGE',
          message: 'Start date must be before end date',
          fields: ['startDate', 'endDate']
        });
      }
    }

    // Email uniqueness warning (would need actual DB check)
    if (data.email && schema.email?.unique) {
      result.warnings.push({
        type: 'UNIQUENESS_CHECK_NEEDED',
        message: 'Email uniqueness must be verified at database level',
        field: 'email'
      });
    }

    return result;
  }

  /**
   * @private
   * Validates seed data integrity
   * @static
   * @param {Object} data - Data object
   * @param {Object} schema - Schema definition
   * @param {Object} validationResult - Base validation result
   */
  static #validateSeedDataIntegrity(data, schema, validationResult) {
    // Ensure all references use valid ObjectIds
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      if (fieldSchema.ref && data[fieldName]) {
        if (!ObjectId.isValid(data[fieldName])) {
          validationResult.warnings.push({
            type: 'SEED_REFERENCE_WARNING',
            message: `Field '${fieldName}' references '${fieldSchema.ref}' but may not be a valid ObjectId`,
            field: fieldName
          });
        }
      }
    }
  }

  /**
   * @private
   * Validates migration data transformations
   * @static
   * @param {Object} data - Data object
   * @param {Object} schema - Schema definition
   * @param {Object} validationResult - Base validation result
   */
  static #validateMigrationData(data, schema, validationResult) {
    // Check for fields that might need transformation
    for (const fieldName of Object.keys(data)) {
      if (!schema[fieldName]) {
        validationResult.warnings.push({
          type: 'MIGRATION_FIELD_WARNING',
          message: `Field '${fieldName}' not in current schema, may need transformation`,
          field: fieldName
        });
      }
    }
  }

  /**
   * @private
   * Validates import data format
   * @static
   * @param {Object} data - Data object
   * @param {Object} schema - Schema definition
   * @param {Object} validationResult - Base validation result
   */
  static #validateImportData(data, schema, validationResult) {
    // Check for common import issues
    if (data._id && typeof data._id === 'string') {
      try {
        new ObjectId(data._id);
      } catch (error) {
        validationResult.warnings.push({
          type: 'IMPORT_ID_WARNING',
          message: 'Imported _id may need conversion to ObjectId',
          field: '_id'
        });
      }
    }

    // Check for date string formats
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      if (fieldSchema.type === Date && data[fieldName] && typeof data[fieldName] === 'string') {
        validationResult.warnings.push({
          type: 'IMPORT_DATE_WARNING',
          message: `Field '${fieldName}' is a date string, ensure proper parsing`,
          field: fieldName
        });
      }
    }
  }
}

module.exports = DataValidator;