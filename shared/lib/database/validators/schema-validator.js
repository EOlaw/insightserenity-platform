'use strict';

/**
 * @fileoverview Database schema field definitions and constraint validator
 * @module shared/lib/database/validators/schema-validator
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const { STATUS_CODES } = require('../../utils/constants/status-codes');
const { PERMISSIONS } = require('../../utils/constants/permissions');
const { ROLES } = require('../../utils/constants/roles');

/**
 * @class SchemaValidator
 * @description Validates database schema field definitions, constraints, relationships,
 * and enum values against system constants
 */
class SchemaValidator {
  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description MongoDB supported data types
   */
  static #SUPPORTED_TYPES = {
    String: { validator: 'isString', mongoType: 'string' },
    Number: { validator: 'isNumber', mongoType: 'number' },
    Date: { validator: 'isDate', mongoType: 'date' },
    Boolean: { validator: 'isBoolean', mongoType: 'bool' },
    ObjectId: { validator: 'isObjectId', mongoType: 'objectId' },
    Array: { validator: 'isArray', mongoType: 'array' },
    Object: { validator: 'isObject', mongoType: 'object' },
    Mixed: { validator: 'isMixed', mongoType: 'mixed' },
    Buffer: { validator: 'isBuffer', mongoType: 'binData' },
    Decimal128: { validator: 'isDecimal', mongoType: 'decimal' }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description System-wide enum mappings
   */
  static #SYSTEM_ENUMS = {
    status: Object.values(STATUS_CODES),
    permissions: Object.values(PERMISSIONS),
    roles: Object.values(ROLES),
    userStatus: ['active', 'inactive', 'pending', 'suspended', 'deleted'],
    organizationType: ['enterprise', 'business', 'startup', 'nonprofit', 'government'],
    subscriptionStatus: ['active', 'canceled', 'past_due', 'trialing', 'pending'],
    paymentStatus: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    notificationType: ['email', 'sms', 'push', 'in-app', 'webhook'],
    auditAction: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import']
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Field constraint validators
   */
  static #CONSTRAINT_VALIDATORS = {
    required: (value, constraint) => constraint ? value !== undefined && value !== null : true,
    minLength: (value, constraint) => !value || value.length >= constraint,
    maxLength: (value, constraint) => !value || value.length <= constraint,
    min: (value, constraint) => !value || value >= constraint,
    max: (value, constraint) => !value || value <= constraint,
    pattern: (value, constraint) => !value || new RegExp(constraint).test(value),
    enum: (value, constraint) => !value || constraint.includes(value),
    unique: () => true, // Validated at database level
    sparse: () => true, // Index property
    default: () => true, // Applied at creation
    validate: (value, constraint) => !value || constraint(value),
    ref: () => true, // Relationship validation done separately
    index: () => true // Index property
  };

  /**
   * @private
   * @static
   * @type {Map}
   * @description Schema validation cache
   */
  static #schemaCache = new Map();

  /**
   * Validates a complete schema definition
   * @static
   * @param {Object} schema - Schema object to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.validateEnums=true] - Validate enum values against system constants
   * @param {boolean} [options.validateRelationships=true] - Validate foreign key relationships
   * @param {boolean} [options.validateConstraints=true] - Validate field constraints
   * @param {boolean} [options.strict=true] - Strict validation mode
   * @param {string} [options.modelName='Unknown'] - Model name for context
   * @returns {Object} Validation result with detailed information
   * @throws {AppError} If validation fails in strict mode
   */
  static validate(schema, options = {}) {
    const {
      validateEnums = true,
      validateRelationships = true,
      validateConstraints = true,
      strict = true,
      modelName = 'Unknown'
    } = options;

    try {
      logger.info(`Validating schema for model: ${modelName}`, { options });

      const validationResult = {
        valid: true,
        model: modelName,
        errors: [],
        warnings: [],
        metadata: {
          totalFields: 0,
          requiredFields: [],
          optionalFields: [],
          relationships: [],
          indexes: [],
          enums: []
        }
      };

      if (!schema || typeof schema !== 'object') {
        validationResult.valid = false;
        validationResult.errors.push({
          type: 'INVALID_SCHEMA',
          message: 'Schema must be a valid object',
          field: 'schema'
        });
        
        if (strict) {
          throw new AppError(
            'Invalid schema object',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { model: modelName }
          );
        }
        
        return validationResult;
      }

      // Validate each field in the schema
      for (const [fieldName, fieldDefinition] of Object.entries(schema)) {
        validationResult.metadata.totalFields++;
        
        const fieldValidation = SchemaValidator.#validateField(
          fieldName,
          fieldDefinition,
          {
            validateEnums,
            validateRelationships,
            validateConstraints,
            modelName
          }
        );

        if (!fieldValidation.valid) {
          validationResult.valid = false;
          validationResult.errors.push(...fieldValidation.errors);
        }
        
        validationResult.warnings.push(...fieldValidation.warnings);
        
        // Collect metadata
        if (fieldValidation.metadata.required) {
          validationResult.metadata.requiredFields.push(fieldName);
        } else {
          validationResult.metadata.optionalFields.push(fieldName);
        }
        
        if (fieldValidation.metadata.relationship) {
          validationResult.metadata.relationships.push(fieldValidation.metadata.relationship);
        }
        
        if (fieldValidation.metadata.indexed) {
          validationResult.metadata.indexes.push(fieldName);
        }
        
        if (fieldValidation.metadata.enum) {
          validationResult.metadata.enums.push({
            field: fieldName,
            values: fieldValidation.metadata.enum
          });
        }
      }

      // Additional schema-level validations
      const schemaLevelValidation = SchemaValidator.#validateSchemaLevel(schema, validationResult.metadata);
      validationResult.warnings.push(...schemaLevelValidation.warnings);

      if (strict && !validationResult.valid) {
        const errorDetails = validationResult.errors.map(e => e.message).join('; ');
        throw new AppError(
          `Schema validation failed: ${errorDetails}`,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { model: modelName, errors: validationResult.errors }
        );
      }

      logger.info(`Schema validation completed: ${modelName}`, {
        valid: validationResult.valid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      });

      return validationResult;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error(`Schema validation error: ${modelName}`, error);
      throw new AppError(
        'Schema validation failed',
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { model: modelName, originalError: error.message }
      );
    }
  }

  /**
   * Validates relationships between schemas
   * @static
   * @param {Object} schemas - Object containing multiple schemas keyed by model name
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result for relationships
   * @throws {AppError} If validation fails
   */
  static validateRelationships(schemas, options = {}) {
    try {
      logger.info('Validating schema relationships', { schemaCount: Object.keys(schemas).length });

      const validationResult = {
        valid: true,
        errors: [],
        warnings: [],
        relationships: [],
        metadata: {
          totalRelationships: 0,
          validRelationships: 0,
          invalidRelationships: 0
        }
      };

      // Build relationship map
      const relationshipMap = SchemaValidator.#buildRelationshipMap(schemas);

      // Validate each relationship
      for (const relationship of relationshipMap) {
        validationResult.metadata.totalRelationships++;
        
        const targetSchema = schemas[relationship.targetModel];
        
        if (!targetSchema) {
          validationResult.valid = false;
          validationResult.errors.push({
            type: 'INVALID_RELATIONSHIP',
            message: `Referenced model '${relationship.targetModel}' not found`,
            field: relationship.field,
            model: relationship.sourceModel
          });
          validationResult.metadata.invalidRelationships++;
        } else {
          validationResult.metadata.validRelationships++;
          validationResult.relationships.push({
            source: `${relationship.sourceModel}.${relationship.field}`,
            target: relationship.targetModel,
            type: relationship.type
          });
        }
      }

      // Check for circular dependencies
      const circularDeps = SchemaValidator.#detectCircularDependencies(relationshipMap);
      if (circularDeps.length > 0) {
        validationResult.warnings.push(...circularDeps.map(cycle => ({
          type: 'CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected: ${cycle.join(' -> ')}`,
          models: cycle
        })));
      }

      return validationResult;

    } catch (error) {
      logger.error('Relationship validation error', error);
      throw new AppError(
        'Relationship validation failed',
        500,
        ERROR_CODES.INTERNAL_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Clears the schema validation cache
   * @static
   * @param {string} [schemaKey] - Specific schema to clear, or all if not provided
   */
  static clearCache(schemaKey) {
    if (schemaKey) {
      SchemaValidator.#schemaCache.delete(schemaKey);
      logger.debug(`Cleared schema cache for: ${schemaKey}`);
    } else {
      SchemaValidator.#schemaCache.clear();
      logger.debug('Cleared all schema cache');
    }
  }

  /**
   * @private
   * Validates a single field definition
   * @static
   * @param {string} fieldName - Field name
   * @param {Object} fieldDefinition - Field definition object
   * @param {Object} options - Validation options
   * @returns {Object} Field validation result
   */
  static #validateField(fieldName, fieldDefinition, options) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        required: false,
        indexed: false,
        relationship: null,
        enum: null
      }
    };

    // Handle shorthand definitions (e.g., field: String)
    const normalizedDefinition = SchemaValidator.#normalizeFieldDefinition(fieldDefinition);

    // Validate type
    const typeValidation = SchemaValidator.#validateFieldType(fieldName, normalizedDefinition.type);
    if (!typeValidation.valid) {
      result.valid = false;
      result.errors.push(...typeValidation.errors);
    }

    // Validate constraints
    if (options.validateConstraints) {
      const constraintValidation = SchemaValidator.#validateFieldConstraints(
        fieldName,
        normalizedDefinition,
        options.modelName
      );
      if (!constraintValidation.valid) {
        result.valid = false;
        result.errors.push(...constraintValidation.errors);
      }
      result.warnings.push(...constraintValidation.warnings);
      
      // Update metadata
      result.metadata.required = normalizedDefinition.required === true;
      result.metadata.indexed = normalizedDefinition.index === true || normalizedDefinition.unique === true;
    }

    // Validate enums
    if (options.validateEnums && normalizedDefinition.enum) {
      const enumValidation = SchemaValidator.#validateEnum(fieldName, normalizedDefinition.enum);
      if (!enumValidation.valid) {
        result.valid = false;
        result.errors.push(...enumValidation.errors);
      }
      result.warnings.push(...enumValidation.warnings);
      result.metadata.enum = normalizedDefinition.enum;
    }

    // Validate relationships
    if (options.validateRelationships && normalizedDefinition.ref) {
      result.metadata.relationship = {
        sourceModel: options.modelName,
        targetModel: normalizedDefinition.ref,
        field: fieldName,
        type: normalizedDefinition.type === 'Array' ? 'many' : 'one'
      };
    }

    return result;
  }

  /**
   * @private
   * Normalizes field definition to standard format
   * @static
   * @param {*} fieldDefinition - Field definition (can be shorthand or object)
   * @returns {Object} Normalized field definition
   */
  static #normalizeFieldDefinition(fieldDefinition) {
    // Handle constructor function shorthand (e.g., String, Number)
    if (typeof fieldDefinition === 'function') {
      return { type: fieldDefinition };
    }

    // Handle array shorthand (e.g., [String])
    if (Array.isArray(fieldDefinition)) {
      return {
        type: Array,
        of: fieldDefinition[0]
      };
    }

    // Already an object definition
    return fieldDefinition || {};
  }

  /**
   * @private
   * Validates field type
   * @static
   * @param {string} fieldName - Field name
   * @param {*} type - Field type
   * @returns {Object} Type validation result
   */
  static #validateFieldType(fieldName, type) {
    const result = {
      valid: true,
      errors: []
    };

    if (!type) {
      result.valid = false;
      result.errors.push({
        type: 'MISSING_TYPE',
        message: `Field '${fieldName}' has no type definition`,
        field: fieldName
      });
      return result;
    }

    const typeName = typeof type === 'function' ? type.name : String(type);
    
    if (!SchemaValidator.#SUPPORTED_TYPES[typeName] && typeName !== 'Mixed') {
      result.valid = false;
      result.errors.push({
        type: 'UNSUPPORTED_TYPE',
        message: `Field '${fieldName}' has unsupported type: ${typeName}`,
        field: fieldName,
        supportedTypes: Object.keys(SchemaValidator.#SUPPORTED_TYPES)
      });
    }

    return result;
  }

  /**
   * @private
   * Validates field constraints
   * @static
   * @param {string} fieldName - Field name
   * @param {Object} fieldDefinition - Field definition
   * @param {string} modelName - Model name for context
   * @returns {Object} Constraint validation result
   */
  static #validateFieldConstraints(fieldName, fieldDefinition, modelName) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check constraint compatibility
    for (const [constraint, value] of Object.entries(fieldDefinition)) {
      if (constraint === 'type' || constraint === 'of') continue;

      if (!SchemaValidator.#CONSTRAINT_VALIDATORS[constraint]) {
        result.warnings.push({
          type: 'UNKNOWN_CONSTRAINT',
          message: `Unknown constraint '${constraint}' on field '${fieldName}'`,
          field: fieldName,
          constraint
        });
        continue;
      }

      // Validate constraint values
      switch (constraint) {
        case 'minLength':
        case 'maxLength':
          if (typeof value !== 'number' || value < 0) {
            result.valid = false;
            result.errors.push({
              type: 'INVALID_CONSTRAINT_VALUE',
              message: `Invalid ${constraint} value for field '${fieldName}': must be non-negative number`,
              field: fieldName,
              constraint,
              value
            });
          }
          break;

        case 'min':
        case 'max':
          if (typeof value !== 'number' && !(value instanceof Date)) {
            result.valid = false;
            result.errors.push({
              type: 'INVALID_CONSTRAINT_VALUE',
              message: `Invalid ${constraint} value for field '${fieldName}': must be number or Date`,
              field: fieldName,
              constraint,
              value
            });
          }
          break;

        case 'pattern':
          try {
            new RegExp(value);
          } catch (error) {
            result.valid = false;
            result.errors.push({
              type: 'INVALID_PATTERN',
              message: `Invalid regex pattern for field '${fieldName}': ${error.message}`,
              field: fieldName,
              constraint,
              value
            });
          }
          break;

        case 'validate':
          if (typeof value !== 'function' && !Array.isArray(value)) {
            result.valid = false;
            result.errors.push({
              type: 'INVALID_VALIDATOR',
              message: `Invalid validator for field '${fieldName}': must be function or array`,
              field: fieldName,
              constraint
            });
          }
          break;
      }
    }

    // Check for conflicting constraints
    if (fieldDefinition.minLength > fieldDefinition.maxLength) {
      result.valid = false;
      result.errors.push({
        type: 'CONFLICTING_CONSTRAINTS',
        message: `Field '${fieldName}' has minLength > maxLength`,
        field: fieldName
      });
    }

    if (fieldDefinition.min > fieldDefinition.max) {
      result.valid = false;
      result.errors.push({
        type: 'CONFLICTING_CONSTRAINTS',
        message: `Field '${fieldName}' has min > max`,
        field: fieldName
      });
    }

    return result;
  }

  /**
   * @private
   * Validates enum values against system constants
   * @static
   * @param {string} fieldName - Field name
   * @param {Array} enumValues - Enum values to validate
   * @returns {Object} Enum validation result
   */
  static #validateEnum(fieldName, enumValues) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!Array.isArray(enumValues)) {
      result.valid = false;
      result.errors.push({
        type: 'INVALID_ENUM',
        message: `Enum values for field '${fieldName}' must be an array`,
        field: fieldName
      });
      return result;
    }

    if (enumValues.length === 0) {
      result.valid = false;
      result.errors.push({
        type: 'EMPTY_ENUM',
        message: `Enum values for field '${fieldName}' cannot be empty`,
        field: fieldName
      });
      return result;
    }

    // Check if enum matches any system enum
    const matchingSystemEnum = SchemaValidator.#findMatchingSystemEnum(fieldName, enumValues);
    
    if (matchingSystemEnum) {
      const { name, missing, extra } = matchingSystemEnum;
      
      if (missing.length > 0) {
        result.warnings.push({
          type: 'ENUM_MISMATCH',
          message: `Field '${fieldName}' enum is missing system values: ${missing.join(', ')}`,
          field: fieldName,
          systemEnum: name,
          missing
        });
      }
      
      if (extra.length > 0) {
        result.warnings.push({
          type: 'ENUM_MISMATCH',
          message: `Field '${fieldName}' enum has extra values not in system: ${extra.join(', ')}`,
          field: fieldName,
          systemEnum: name,
          extra
        });
      }
    }

    return result;
  }

  /**
   * @private
   * Finds matching system enum for field
   * @static
   * @param {string} fieldName - Field name
   * @param {Array} enumValues - Enum values
   * @returns {Object|null} Matching system enum info or null
   */
  static #findMatchingSystemEnum(fieldName, enumValues) {
    const fieldNameLower = fieldName.toLowerCase();
    
    for (const [enumName, systemValues] of Object.entries(SchemaValidator.#SYSTEM_ENUMS)) {
      if (fieldNameLower.includes(enumName.toLowerCase())) {
        const enumSet = new Set(enumValues);
        const systemSet = new Set(systemValues);
        
        const missing = systemValues.filter(v => !enumSet.has(v));
        const extra = enumValues.filter(v => !systemSet.has(v));
        
        return {
          name: enumName,
          missing,
          extra
        };
      }
    }
    
    return null;
  }

  /**
   * @private
   * Validates schema-level constraints
   * @static
   * @param {Object} schema - Complete schema
   * @param {Object} metadata - Schema metadata
   * @returns {Object} Schema-level validation result
   */
  static #validateSchemaLevel(schema, metadata) {
    const result = {
      warnings: []
    };

    // Warn if no required fields
    if (metadata.requiredFields.length === 0) {
      result.warnings.push({
        type: 'NO_REQUIRED_FIELDS',
        message: 'Schema has no required fields',
        severity: 'low'
      });
    }

    // Warn if too many indexes
    if (metadata.indexes.length > 10) {
      result.warnings.push({
        type: 'EXCESSIVE_INDEXES',
        message: `Schema has ${metadata.indexes.length} indexes, which may impact write performance`,
        severity: 'medium'
      });
    }

    // Warn if no timestamp fields
    const hasTimestamps = Object.keys(schema).some(field => 
      field.toLowerCase().includes('createdat') || 
      field.toLowerCase().includes('updatedat')
    );
    
    if (!hasTimestamps) {
      result.warnings.push({
        type: 'NO_TIMESTAMPS',
        message: 'Schema has no timestamp fields (createdAt/updatedAt)',
        severity: 'low'
      });
    }

    return result;
  }

  /**
   * @private
   * Builds relationship map from schemas
   * @static
   * @param {Object} schemas - Schemas object
   * @returns {Array} Relationship entries
   */
  static #buildRelationshipMap(schemas) {
    const relationships = [];

    for (const [modelName, schema] of Object.entries(schemas)) {
      for (const [fieldName, fieldDef] of Object.entries(schema)) {
        const normalizedDef = SchemaValidator.#normalizeFieldDefinition(fieldDef);
        
        if (normalizedDef.ref) {
          relationships.push({
            sourceModel: modelName,
            targetModel: normalizedDef.ref,
            field: fieldName,
            type: normalizedDef.type === Array ? 'many' : 'one'
          });
        }
      }
    }

    return relationships;
  }

  /**
   * @private
   * Detects circular dependencies in relationships
   * @static
   * @param {Array} relationships - Relationship map
   * @returns {Array} Circular dependency cycles
   */
  static #detectCircularDependencies(relationships) {
    const graph = {};
    const cycles = [];

    // Build adjacency list
    for (const rel of relationships) {
      if (!graph[rel.sourceModel]) {
        graph[rel.sourceModel] = [];
      }
      graph[rel.sourceModel].push(rel.targetModel);
    }

    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();

    const detectCycle = (node, path = []) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      if (graph[node]) {
        for (const neighbor of graph[node]) {
          if (!visited.has(neighbor)) {
            detectCycle(neighbor, [...path]);
          } else if (recursionStack.has(neighbor)) {
            const cycleStart = path.indexOf(neighbor);
            cycles.push(path.slice(cycleStart).concat(neighbor));
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        detectCycle(node);
      }
    }

    return cycles;
  }
}

module.exports = SchemaValidator;