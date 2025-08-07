'use strict';

/**
 * @fileoverview Database model structure and inheritance validator
 * @module shared/lib/database/validators/model-validator
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/database/models/base-model
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const BaseModel = require('../models/base-model');

/**
 * @class ModelValidator
 * @description Validates database model structure, inheritance, and required methods
 * to ensure consistency across all models in the system
 */
class ModelValidator {
  /**
   * @private
   * @static
   * @readonly
   * @type {Array<string>}
   * @description Required methods that all models must implement
   */
  static #REQUIRED_METHODS = [
    'create',
    'findById',
    'findOne',
    'find',
    'updateById',
    'deleteById',
    'count',
    'exists'
  ];

  /**
   * @private
   * @static
   * @readonly
   * @type {Array<string>}
   * @description Required static properties for model metadata
   */
  static #REQUIRED_PROPERTIES = [
    'collectionName',
    'schema',
    'indexes'
  ];

  /**
   * @private
   * @static
   * @readonly
   * @type {Array<string>}
   * @description Base fields required in all model schemas
   */
  static #BASE_FIELDS = [
    '_id',
    'createdAt',
    'updatedAt'
  ];

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Validation cache to improve performance
   */
  static #validationCache = new Map();

  /**
   * Validates a model class structure and inheritance
   * @static
   * @param {Function} ModelClass - The model class to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.skipCache=false] - Skip validation cache
   * @param {boolean} [options.validateSchema=true] - Validate schema structure
   * @param {boolean} [options.validateMethods=true] - Validate required methods
   * @param {boolean} [options.strict=true] - Strict validation mode
   * @returns {Object} Validation result with details
   * @throws {AppError} If validation fails in strict mode
   */
  static validate(ModelClass, options = {}) {
    const {
      skipCache = false,
      validateSchema = true,
      validateMethods = true,
      strict = true
    } = options;

    try {
      // Check cache
      const cacheKey = ModelClass.name;
      if (!skipCache && ModelValidator.#validationCache.has(cacheKey)) {
        logger.debug(`Using cached validation for model: ${cacheKey}`);
        return ModelValidator.#validationCache.get(cacheKey);
      }

      logger.info(`Validating model: ${ModelClass.name}`, { options });

      const validationResult = {
        valid: true,
        model: ModelClass.name,
        errors: [],
        warnings: [],
        metadata: {}
      };

      // Validate class type
      if (typeof ModelClass !== 'function') {
        validationResult.valid = false;
        validationResult.errors.push({
          type: 'TYPE_ERROR',
          message: 'Model must be a class or constructor function',
          field: 'ModelClass'
        });
      }

      // Validate inheritance from BaseModel
      if (!ModelValidator.#validateInheritance(ModelClass)) {
        validationResult.valid = false;
        validationResult.errors.push({
          type: 'INHERITANCE_ERROR',
          message: 'Model must extend BaseModel',
          field: 'prototype'
        });
      }

      // Validate required properties
      const propertyValidation = ModelValidator.#validateProperties(ModelClass);
      if (!propertyValidation.valid) {
        validationResult.valid = false;
        validationResult.errors.push(...propertyValidation.errors);
      }
      validationResult.metadata.properties = propertyValidation.metadata;

      // Validate required methods
      if (validateMethods) {
        const methodValidation = ModelValidator.#validateMethods(ModelClass);
        if (!methodValidation.valid) {
          validationResult.valid = false;
          validationResult.errors.push(...methodValidation.errors);
        }
        validationResult.metadata.methods = methodValidation.metadata;
      }

      // Validate schema structure
      if (validateSchema && ModelClass.schema) {
        const schemaValidation = ModelValidator.#validateSchemaStructure(ModelClass);
        if (!schemaValidation.valid) {
          validationResult.valid = false;
          validationResult.errors.push(...schemaValidation.errors);
        }
        validationResult.warnings.push(...schemaValidation.warnings);
        validationResult.metadata.schema = schemaValidation.metadata;
      }

      // Validate indexes
      const indexValidation = ModelValidator.#validateIndexes(ModelClass);
      if (!indexValidation.valid) {
        validationResult.warnings.push(...indexValidation.warnings);
      }
      validationResult.metadata.indexes = indexValidation.metadata;

      // Cache successful validation
      if (validationResult.valid && !skipCache) {
        ModelValidator.#validationCache.set(cacheKey, validationResult);
      }

      // Handle strict mode
      if (strict && !validationResult.valid) {
        const errorDetails = validationResult.errors.map(e => e.message).join('; ');
        throw new AppError(
          `Model validation failed: ${errorDetails}`,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { model: ModelClass.name, errors: validationResult.errors }
        );
      }

      logger.info(`Model validation completed: ${ModelClass.name}`, {
        valid: validationResult.valid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      });

      return validationResult;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error(`Model validation error: ${ModelClass.name}`, error);
      throw new AppError(
        'Model validation failed',
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { model: ModelClass.name, originalError: error.message }
      );
    }
  }

  /**
   * Validates multiple models at once
   * @static
   * @param {Array<Function>} modelClasses - Array of model classes to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Aggregated validation results
   * @throws {AppError} If any validation fails in strict mode
   */
  static validateMultiple(modelClasses, options = {}) {
    try {
      logger.info(`Validating ${modelClasses.length} models`);

      const results = {
        valid: true,
        totalModels: modelClasses.length,
        validModels: 0,
        invalidModels: 0,
        models: {}
      };

      for (const ModelClass of modelClasses) {
        const result = ModelValidator.validate(ModelClass, { ...options, strict: false });
        results.models[ModelClass.name] = result;

        if (result.valid) {
          results.validModels++;
        } else {
          results.invalidModels++;
          results.valid = false;
        }
      }

      if (options.strict && !results.valid) {
        throw new AppError(
          `Model validation failed for ${results.invalidModels} models`,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { results }
        );
      }

      return results;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Multiple model validation error', error);
      throw new AppError(
        'Multiple model validation failed',
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Clears the validation cache
   * @static
   * @param {string} [modelName] - Specific model to clear, or all if not provided
   */
  static clearCache(modelName) {
    if (modelName) {
      ModelValidator.#validationCache.delete(modelName);
      logger.debug(`Cleared validation cache for model: ${modelName}`);
    } else {
      ModelValidator.#validationCache.clear();
      logger.debug('Cleared all validation cache');
    }
  }

  /**
   * @private
   * Validates model inheritance from BaseModel
   * @static
   * @param {Function} ModelClass - Model class to validate
   * @returns {boolean} True if properly inherits from BaseModel
   */
  static #validateInheritance(ModelClass) {
    try {
      // Check prototype chain
      let proto = Object.getPrototypeOf(ModelClass);
      while (proto) {
        if (proto === BaseModel) {
          return true;
        }
        proto = Object.getPrototypeOf(proto);
      }
      return false;
    } catch (error) {
      logger.error('Inheritance validation error', error);
      return false;
    }
  }

  /**
   * @private
   * Validates required properties on model class
   * @static
   * @param {Function} ModelClass - Model class to validate
   * @returns {Object} Validation result with metadata
   */
  static #validateProperties(ModelClass) {
    const result = {
      valid: true,
      errors: [],
      metadata: {
        present: [],
        missing: []
      }
    };

    for (const property of ModelValidator.#REQUIRED_PROPERTIES) {
      if (ModelClass.hasOwnProperty(property)) {
        result.metadata.present.push(property);
        
        // Additional property-specific validation
        switch (property) {
          case 'collectionName':
            if (typeof ModelClass.collectionName !== 'string' || !ModelClass.collectionName.trim()) {
              result.valid = false;
              result.errors.push({
                type: 'PROPERTY_ERROR',
                message: 'collectionName must be a non-empty string',
                field: property
              });
            }
            break;
          
          case 'schema':
            if (!ModelClass.schema || typeof ModelClass.schema !== 'object') {
              result.valid = false;
              result.errors.push({
                type: 'PROPERTY_ERROR',
                message: 'schema must be a valid object',
                field: property
              });
            }
            break;
          
          case 'indexes':
            if (!Array.isArray(ModelClass.indexes)) {
              result.valid = false;
              result.errors.push({
                type: 'PROPERTY_ERROR',
                message: 'indexes must be an array',
                field: property
              });
            }
            break;
        }
      } else {
        result.valid = false;
        result.metadata.missing.push(property);
        result.errors.push({
          type: 'MISSING_PROPERTY',
          message: `Required property '${property}' is missing`,
          field: property
        });
      }
    }

    return result;
  }

  /**
   * @private
   * Validates required methods on model class
   * @static
   * @param {Function} ModelClass - Model class to validate
   * @returns {Object} Validation result with metadata
   */
  static #validateMethods(ModelClass) {
    const result = {
      valid: true,
      errors: [],
      metadata: {
        present: [],
        missing: [],
        overridden: []
      }
    };

    for (const method of ModelValidator.#REQUIRED_METHODS) {
      if (typeof ModelClass[method] === 'function') {
        result.metadata.present.push(method);
        
        // Check if method is overridden from BaseModel
        if (ModelClass[method] !== BaseModel[method]) {
          result.metadata.overridden.push(method);
        }
      } else {
        result.valid = false;
        result.metadata.missing.push(method);
        result.errors.push({
          type: 'MISSING_METHOD',
          message: `Required method '${method}' is missing or not a function`,
          field: method
        });
      }
    }

    return result;
  }

  /**
   * @private
   * Validates schema structure and base fields
   * @static
   * @param {Function} ModelClass - Model class to validate
   * @returns {Object} Validation result with metadata
   */
  static #validateSchemaStructure(ModelClass) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        fields: [],
        baseFields: {
          present: [],
          missing: []
        },
        fieldTypes: {}
      }
    };

    const schema = ModelClass.schema;

    // Validate base fields
    for (const baseField of ModelValidator.#BASE_FIELDS) {
      if (baseField in schema) {
        result.metadata.baseFields.present.push(baseField);
      } else {
        result.metadata.baseFields.missing.push(baseField);
        result.warnings.push({
          type: 'MISSING_BASE_FIELD',
          message: `Base field '${baseField}' is missing from schema`,
          field: baseField
        });
      }
    }

    // Validate field definitions
    for (const [fieldName, fieldDefinition] of Object.entries(schema)) {
      result.metadata.fields.push(fieldName);
      
      // Validate field definition structure
      if (fieldDefinition === null || fieldDefinition === undefined) {
        result.valid = false;
        result.errors.push({
          type: 'INVALID_FIELD_DEFINITION',
          message: `Field '${fieldName}' has null or undefined definition`,
          field: fieldName
        });
        continue;
      }

      // Store field type information
      if (fieldDefinition.type) {
        result.metadata.fieldTypes[fieldName] = fieldDefinition.type.name || 'Unknown';
      }

      // Validate required fields have proper configuration
      if (fieldDefinition.required && fieldDefinition.default !== undefined) {
        result.warnings.push({
          type: 'FIELD_CONFIGURATION_WARNING',
          message: `Field '${fieldName}' is required but has a default value`,
          field: fieldName
        });
      }
    }

    return result;
  }

  /**
   * @private
   * Validates index definitions
   * @static
   * @param {Function} ModelClass - Model class to validate
   * @returns {Object} Validation result with metadata
   */
  static #validateIndexes(ModelClass) {
    const result = {
      valid: true,
      warnings: [],
      metadata: {
        count: 0,
        types: [],
        fields: []
      }
    };

    if (!ModelClass.indexes || !Array.isArray(ModelClass.indexes)) {
      return result;
    }

    result.metadata.count = ModelClass.indexes.length;

    for (const [index, indexDef] of ModelClass.indexes.entries()) {
      if (!indexDef || typeof indexDef !== 'object') {
        result.valid = false;
        result.warnings.push({
          type: 'INVALID_INDEX',
          message: `Index at position ${index} is not a valid object`,
          field: `indexes[${index}]`
        });
        continue;
      }

      // Extract index type
      if (indexDef.unique) result.metadata.types.push('unique');
      if (indexDef.sparse) result.metadata.types.push('sparse');
      if (indexDef.text) result.metadata.types.push('text');
      if (indexDef['2dsphere']) result.metadata.types.push('2dsphere');

      // Extract indexed fields
      if (indexDef.fields) {
        result.metadata.fields.push(...Object.keys(indexDef.fields));
      }
    }

    // Remove duplicates
    result.metadata.types = [...new Set(result.metadata.types)];
    result.metadata.fields = [...new Set(result.metadata.fields)];

    return result;
  }
}

module.exports = ModelValidator;