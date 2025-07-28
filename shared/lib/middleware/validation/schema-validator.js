'use strict';

/**
 * @fileoverview Schema validation middleware for centralized schema management
 * @module shared/lib/middleware/validation/schema-validator
 * @requires module:joi
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/schema-definition-model
 * @requires module:shared/lib/database/models/tenant-model
 * @requires module:shared/lib/config
 */

const Joi = require('joi');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const SchemaDefinitionModel = require('../../database/models/schema-definition-model');
const TenantModel = require('../../database/models/tenant-model');
const config = require('../../config');

/**
 * @class SchemaValidator
 * @description Centralized schema validation with multi-tenant support
 */
class SchemaValidator {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #schemaRegistry;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #compiledSchemas;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    schemas: {
      preloadOnInit: true,
      watchForChanges: true,
      validateOnRegistration: true
    },
    cache: {
      enabled: true,
      ttl: 7200, // 2 hours
      prefix: 'schema:'
    },
    multiTenant: {
      enabled: true,
      inheritGlobalSchemas: true,
      allowOverrides: true
    },
    extensions: {
      enabled: true,
      customTypes: {},
      customValidators: {}
    },
    strictMode: process.env.NODE_ENV === 'production'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #SCHEMA_TYPES = {
    GLOBAL: 'global',
    TENANT: 'tenant',
    MODULE: 'module',
    ENDPOINT: 'endpoint',
    CUSTOM: 'custom'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #BUILT_IN_SCHEMAS = {
    // Common schemas
    email: Joi.string().email().lowercase().trim(),
    password: Joi.string().min(12).max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
    uuid: Joi.string().uuid({ version: 'uuidv4' }),
    objectId: Joi.string().hex().length(24),
    url: Joi.string().uri(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    
    // Date schemas
    dateRange: Joi.object({
      start: Joi.date().iso(),
      end: Joi.date().iso().greater(Joi.ref('start'))
    }),
    
    // Pagination schemas
    pagination: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sort: Joi.string(),
      order: Joi.string().valid('asc', 'desc').default('asc')
    }),
    
    // Common field schemas
    name: Joi.object({
      first: Joi.string().min(1).max(50).trim(),
      last: Joi.string().min(1).max(50).trim(),
      middle: Joi.string().max(50).trim().optional()
    }),
    
    address: Joi.object({
      street: Joi.string().max(100),
      city: Joi.string().max(50),
      state: Joi.string().max(50),
      postalCode: Joi.string().max(20),
      country: Joi.string().length(2).uppercase()
    }),
    
    // File schemas
    fileUpload: Joi.object({
      filename: Joi.string().required(),
      mimetype: Joi.string().required(),
      size: Joi.number().integer().min(1).required(),
      path: Joi.string()
    })
  };

  /**
   * Creates SchemaValidator instance
   * @param {Object} [options] - Validator configuration
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = { ...SchemaValidator.#DEFAULT_CONFIG, ...options };
    this.#cacheService = cacheService || new CacheService();
    this.#schemaRegistry = new Map();
    this.#compiledSchemas = new Map();

    // Register built-in schemas
    this.#registerBuiltInSchemas();

    // Register custom extensions
    if (this.#config.extensions.enabled) {
      this.#registerExtensions();
    }

    // Preload schemas if configured
    if (this.#config.schemas.preloadOnInit) {
      this.#preloadSchemas().catch(err => 
        logger.error('Failed to preload schemas', { error: err.message })
      );
    }

    logger.info('SchemaValidator initialized', {
      builtInSchemas: Object.keys(SchemaValidator.#BUILT_IN_SCHEMAS).length,
      strictMode: this.#config.strictMode
    });
  }

  /**
   * Registers a schema
   * @param {string} name - Schema name
   * @param {Object} schema - Joi schema or schema definition
   * @param {Object} [options] - Registration options
   * @returns {Promise<void>}
   */
  async registerSchema(name, schema, options = {}) {
    try {
      logger.debug('Registering schema', { name, type: options.type });

      // Validate schema if configured
      if (this.#config.schemas.validateOnRegistration) {
        await this.#validateSchemaDefinition(schema);
      }

      // Compile schema
      const compiled = await this.#compileSchema(schema, options);

      // Store in registry
      const registryEntry = {
        name,
        schema: compiled,
        type: options.type || SchemaValidator.#SCHEMA_TYPES.CUSTOM,
        tenantId: options.tenantId,
        metadata: options.metadata || {},
        registeredAt: new Date(),
        version: options.version || '1.0.0'
      };

      this.#schemaRegistry.set(name, registryEntry);

      // Store compiled version
      const cacheKey = this.#getSchemaCacheKey(name, options.tenantId);
      this.#compiledSchemas.set(cacheKey, compiled);

      // Cache if enabled
      if (this.#config.cache.enabled) {
        await this.#cacheSchema(name, registryEntry, options.tenantId);
      }

      logger.info('Schema registered successfully', { name });

    } catch (error) {
      logger.error('Failed to register schema', {
        name,
        error: error.message
      });

      throw new AppError(
        'Schema registration failed',
        500,
        ERROR_CODES.SCHEMA_ERROR,
        { schemaName: name, originalError: error.message }
      );
    }
  }

  /**
   * Gets a schema by name
   * @param {string} name - Schema name
   * @param {Object} [context] - Request context for tenant resolution
   * @returns {Promise<Object>} Compiled Joi schema
   */
  async getSchema(name, context = {}) {
    try {
      // Check compiled schemas cache
      const cacheKey = this.#getSchemaCacheKey(name, context.tenantId);
      const compiled = this.#compiledSchemas.get(cacheKey);
      if (compiled) {
        return compiled;
      }

      // Check registry
      let registryEntry = this.#schemaRegistry.get(name);

      // Check tenant-specific schema
      if (!registryEntry && context.tenantId && this.#config.multiTenant.enabled) {
        registryEntry = await this.#getTenantSchema(name, context.tenantId);
      }

      // Check database
      if (!registryEntry) {
        registryEntry = await this.#getSchemaFromDatabase(name, context.tenantId);
      }

      if (!registryEntry) {
        throw new AppError(
          'Schema not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { schemaName: name }
        );
      }

      // Compile and cache
      const schema = await this.#compileSchema(registryEntry.schema, {
        tenantId: context.tenantId
      });

      this.#compiledSchemas.set(cacheKey, schema);

      return schema;

    } catch (error) {
      logger.error('Failed to get schema', {
        name,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to retrieve schema',
        500,
        ERROR_CODES.SCHEMA_ERROR,
        { schemaName: name, originalError: error.message }
      );
    }
  }

  /**
   * Validates data against a schema
   * @param {string} schemaName - Schema name
   * @param {*} data - Data to validate
   * @param {Object} [options] - Validation options
   * @returns {Promise<Object>} Validated data
   */
  async validateAgainstSchema(schemaName, data, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Get schema
      const schema = await this.getSchema(schemaName, options.context);

      // Perform validation
      const validationOptions = {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
        ...options
      };

      const { error, value } = schema.validate(data, validationOptions);

      if (error) {
        throw this.#createValidationError(error, schemaName, correlationId);
      }

      logger.debug('Schema validation successful', {
        correlationId,
        schemaName,
        dataKeys: Object.keys(value || {})
      });

      return value;

    } catch (error) {
      logger.error('Schema validation failed', {
        correlationId,
        schemaName,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Schema validation failed',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { 
          correlationId, 
          schemaName,
          originalError: error.message 
        }
      );
    }
  }

  /**
   * Creates middleware for schema validation
   * @param {string} schemaName - Schema name
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware
   */
  middleware(schemaName, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Determine validation target
        const target = options.target || 'body';
        const dataToValidate = req[target];

        if (!dataToValidate && options.required !== false) {
          throw new AppError(
            `No ${target} data provided`,
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { correlationId, target }
          );
        }

        // Get context
        const context = {
          tenantId: req.auth?.user?.organizationId || req.tenantId,
          userId: req.auth?.user?._id,
          ...options.context
        };

        // Validate
        const validated = await this.validateAgainstSchema(
          schemaName,
          dataToValidate,
          { ...options, context, correlationId }
        );

        // Apply validated data
        req[target] = validated;
        
        // Store reference
        req.validatedSchema = {
          name: schemaName,
          target,
          timestamp: new Date()
        };

        next();

      } catch (error) {
        logger.error('Schema middleware validation failed', {
          correlationId,
          schemaName,
          error: error.message
        });

        next(error);
      }
    };
  }

  /**
   * Creates a composite schema from multiple schemas
   * @param {Array<string>} schemaNames - Array of schema names
   * @param {Object} [options] - Composition options
   * @returns {Promise<Object>} Composite schema
   */
  async composeSchemas(schemaNames, options = {}) {
    try {
      const schemas = await Promise.all(
        schemaNames.map(name => this.getSchema(name, options.context))
      );

      let composite;

      switch (options.mode) {
        case 'merge':
          // Merge all schemas into one
          composite = schemas.reduce((acc, schema) => 
            acc.concat(schema), Joi.object()
          );
          break;

        case 'alternatives':
          // Any of the schemas can match
          composite = Joi.alternatives().try(...schemas);
          break;

        case 'all':
        default:
          // All schemas must match
          composite = Joi.object().keys(
            schemas.reduce((acc, schema, index) => {
              acc[schemaNames[index]] = schema;
              return acc;
            }, {})
          );
      }

      return composite;

    } catch (error) {
      logger.error('Schema composition failed', {
        schemaNames,
        error: error.message
      });

      throw new AppError(
        'Schema composition failed',
        500,
        ERROR_CODES.SCHEMA_ERROR,
        { schemaNames, originalError: error.message }
      );
    }
  }

  /**
   * Extends an existing schema
   * @param {string} baseName - Base schema name
   * @param {Object} extensions - Schema extensions
   * @param {Object} [options] - Extension options
   * @returns {Promise<Object>} Extended schema
   */
  async extendSchema(baseName, extensions, options = {}) {
    try {
      const baseSchema = await this.getSchema(baseName, options.context);
      
      let extended;

      if (Joi.isSchema(extensions)) {
        extended = baseSchema.concat(extensions);
      } else {
        extended = baseSchema.keys(extensions);
      }

      // Optionally register the extended schema
      if (options.registerAs) {
        await this.registerSchema(options.registerAs, extended, {
          type: SchemaValidator.#SCHEMA_TYPES.CUSTOM,
          metadata: {
            baseSchema: baseName,
            extended: true
          }
        });
      }

      return extended;

    } catch (error) {
      logger.error('Schema extension failed', {
        baseName,
        error: error.message
      });

      throw new AppError(
        'Schema extension failed',
        500,
        ERROR_CODES.SCHEMA_ERROR,
        { baseName, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Registers built-in schemas
   */
  #registerBuiltInSchemas() {
    Object.entries(SchemaValidator.#BUILT_IN_SCHEMAS).forEach(([name, schema]) => {
      this.#schemaRegistry.set(name, {
        name,
        schema,
        type: SchemaValidator.#SCHEMA_TYPES.GLOBAL,
        registeredAt: new Date(),
        version: '1.0.0'
      });
    });
  }

  /**
   * @private
   * Registers custom extensions
   */
  #registerExtensions() {
    // Register custom types
    Object.entries(this.#config.extensions.customTypes).forEach(([name, definition]) => {
      Joi.extend((joi) => ({
        type: name,
        base: definition.base || joi.any(),
        messages: definition.messages || {},
        validate: definition.validate,
        rules: definition.rules || {}
      }));
    });

    // Register custom validators
    Object.entries(this.#config.extensions.customValidators).forEach(([name, validator]) => {
      Joi.extend((joi) => ({
        type: 'any',
        rules: {
          [name]: {
            validate(value, helpers, args, options) {
              const result = validator(value, args, helpers);
              if (result !== true) {
                return helpers.error(`any.${name}`, { value });
              }
              return value;
            }
          }
        }
      }));
    });
  }

  /**
   * @private
   * Preloads schemas from database
   */
  async #preloadSchemas() {
    try {
      const schemas = await SchemaDefinitionModel.find({
        isActive: true,
        preload: true
      });

      for (const schema of schemas) {
        await this.registerSchema(schema.name, schema.definition, {
          type: schema.type,
          tenantId: schema.tenantId,
          metadata: schema.metadata
        });
      }

      logger.info('Schemas preloaded', { count: schemas.length });

    } catch (error) {
      logger.error('Failed to preload schemas', { error: error.message });
    }
  }

  /**
   * @private
   * Validates schema definition
   */
  async #validateSchemaDefinition(schema) {
    if (!schema) {
      throw new Error('Schema definition is required');
    }

    if (Joi.isSchema(schema)) {
      // Already a valid Joi schema
      return;
    }

    if (typeof schema === 'object') {
      // Validate it can be converted to Joi schema
      try {
        Joi.object(schema);
      } catch (error) {
        throw new Error(`Invalid schema definition: ${error.message}`);
      }
    } else {
      throw new Error('Schema must be a Joi schema or object definition');
    }
  }

  /**
   * @private
   * Compiles schema definition
   */
  async #compileSchema(schema, options = {}) {
    if (Joi.isSchema(schema)) {
      return schema;
    }

    if (typeof schema === 'string') {
      // Reference to another schema
      return this.getSchema(schema, { tenantId: options.tenantId });
    }

    if (typeof schema === 'object') {
      // Convert object to Joi schema
      const compiled = {};

      for (const [key, value] of Object.entries(schema)) {
        if (typeof value === 'string' && value.startsWith('$ref:')) {
          // Reference to another schema
          const refName = value.substring(5);
          compiled[key] = await this.getSchema(refName, { tenantId: options.tenantId });
        } else if (Joi.isSchema(value)) {
          compiled[key] = value;
        } else {
          // Nested object
          compiled[key] = await this.#compileSchema(value, options);
        }
      }

      return Joi.object(compiled);
    }

    throw new Error('Invalid schema format');
  }

  /**
   * @private
   * Gets tenant-specific schema
   */
  async #getTenantSchema(name, tenantId) {
    const tenantCacheKey = `${tenantId}:${name}`;
    
    // Check registry
    const existing = this.#schemaRegistry.get(tenantCacheKey);
    if (existing) {
      return existing;
    }

    // Get from database
    const schema = await SchemaDefinitionModel.findOne({
      name,
      tenantId,
      isActive: true
    });

    if (schema) {
      const entry = {
        name: schema.name,
        schema: schema.definition,
        type: SchemaValidator.#SCHEMA_TYPES.TENANT,
        tenantId,
        metadata: schema.metadata,
        registeredAt: schema.createdAt,
        version: schema.version
      };

      this.#schemaRegistry.set(tenantCacheKey, entry);
      return entry;
    }

    // Check if global schema inheritance is allowed
    if (this.#config.multiTenant.inheritGlobalSchemas) {
      return this.#schemaRegistry.get(name);
    }

    return null;
  }

  /**
   * @private
   * Gets schema from database
   */
  async #getSchemaFromDatabase(name, tenantId) {
    const cacheKey = `${this.#config.cache.prefix}${tenantId || 'global'}:${name}`;
    
    // Check cache
    if (this.#config.cache.enabled) {
      const cached = await this.#cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Query database
    const query = { name, isActive: true };
    if (tenantId) {
      query.$or = [
        { tenantId },
        { tenantId: null, type: SchemaValidator.#SCHEMA_TYPES.GLOBAL }
      ];
    } else {
      query.tenantId = null;
    }

    const schema = await SchemaDefinitionModel.findOne(query);

    if (schema) {
      const entry = {
        name: schema.name,
        schema: schema.definition,
        type: schema.type,
        tenantId: schema.tenantId,
        metadata: schema.metadata,
        registeredAt: schema.createdAt,
        version: schema.version
      };

      // Cache result
      if (this.#config.cache.enabled) {
        await this.#cacheService.set(cacheKey, entry, this.#config.cache.ttl);
      }

      return entry;
    }

    return null;
  }

  /**
   * @private
   * Creates validation error
   */
  #createValidationError(joiError, schemaName, correlationId) {
    const details = joiError.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type,
      context: detail.context
    }));

    return new AppError(
      `Validation failed for schema: ${schemaName}`,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      { 
        correlationId,
        schemaName,
        details 
      }
    );
  }

  /**
   * @private
   * Gets schema cache key
   */
  #getSchemaCacheKey(name, tenantId) {
    return tenantId ? `${tenantId}:${name}` : name;
  }

  /**
   * @private
   * Caches schema
   */
  async #cacheSchema(name, entry, tenantId) {
    const cacheKey = `${this.#config.cache.prefix}${tenantId || 'global'}:${name}`;
    await this.#cacheService.set(cacheKey, entry, this.#config.cache.ttl);
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Lists registered schemas
   * @param {Object} [filter] - Filter options
   * @returns {Array<Object>} Schema list
   */
  listSchemas(filter = {}) {
    const schemas = [];

    this.#schemaRegistry.forEach((entry, name) => {
      if (filter.type && entry.type !== filter.type) return;
      if (filter.tenantId && entry.tenantId !== filter.tenantId) return;

      schemas.push({
        name: entry.name,
        type: entry.type,
        tenantId: entry.tenantId,
        version: entry.version,
        registeredAt: entry.registeredAt,
        metadata: entry.metadata
      });
    });

    return schemas;
  }

  /**
   * Removes a schema
   * @param {string} name - Schema name
   * @param {Object} [options] - Removal options
   * @returns {Promise<void>}
   */
  async removeSchema(name, options = {}) {
    const cacheKey = this.#getSchemaCacheKey(name, options.tenantId);
    
    this.#schemaRegistry.delete(name);
    this.#compiledSchemas.delete(cacheKey);

    if (this.#config.cache.enabled) {
      const redisCacheKey = `${this.#config.cache.prefix}${options.tenantId || 'global'}:${name}`;
      await this.#cacheService.delete(redisCacheKey);
    }

    logger.info('Schema removed', { name, tenantId: options.tenantId });
  }

  /**
   * Clears all schemas
   * @returns {Promise<void>}
   */
  async clearSchemas() {
    this.#schemaRegistry.clear();
    this.#compiledSchemas.clear();

    if (this.#config.cache.enabled) {
      await this.#cacheService.clear(`${this.#config.cache.prefix}*`);
    }

    // Re-register built-in schemas
    this.#registerBuiltInSchemas();

    logger.info('All schemas cleared');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates SchemaValidator instance
 * @param {Object} [config] - Validator configuration
 * @returns {SchemaValidator} Validator instance
 */
const getSchemaValidator = (config) => {
  if (!instance) {
    instance = new SchemaValidator(config);
  }
  return instance;
};

module.exports = {
  SchemaValidator,
  getSchemaValidator,
  // Export convenience methods
  registerSchema: (name, schema, options) => getSchemaValidator().registerSchema(name, schema, options),
  getSchema: (name, context) => getSchemaValidator().getSchema(name, context),
  validateAgainstSchema: (name, data, options) => getSchemaValidator().validateAgainstSchema(name, data, options),
  middleware: (name, options) => getSchemaValidator().middleware(name, options),
  composeSchemas: (names, options) => getSchemaValidator().composeSchemas(names, options),
  extendSchema: (base, ext, options) => getSchemaValidator().extendSchema(base, ext, options)
};