'use strict';

/**
 * @fileoverview Simplified base model for hybrid database architecture
 * @module shared/lib/database/models/base-model
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const stringHelper = require('../../utils/helpers/string-helper');

/**
 * @class BaseModel
 * @description Simplified abstract base model providing common functionality
 * for all database models in the hybrid architecture
 */
class BaseModel {

  /**
   * @static
   * @private
   * @type {Map<string, Function>}
   * @description Registry of all model constructors
   */
  static modelRegistry = new Map();

  /**
   * @static
   * @private
   * @type {Map<string, mongoose.Schema>}
   * @description Cache of all schemas
   */
  static schemaCache = new Map();

  /**
   * @static
   * @private
   * @type {boolean}
   * @description Initialization status
   */
  static initialized = false;

  /**
   * @static
   * @private
   * @type {Object}
   * @description Audit service instance
   */
  static auditService = null;

  /**
   * Creates a new model with enhanced functionality
   * @static
   * @param {string} modelName - Model name
   * @param {mongoose.Schema} schema - Mongoose schema
   * @param {Object} [options={}] - Model options
   * @param {string} [options.collection] - Collection name
   * @param {boolean} [options.enableAudit=true] - Enable audit logging
   * @param {boolean} [options.enableTimestamps=true] - Enable timestamps
   * @returns {Function} Enhanced Mongoose model
   */
  static createModel(modelName, schema, options = {}) {
    try {
      // Validate inputs
      if (!modelName || typeof modelName !== 'string') {
        throw new AppError('Model name is required and must be a string', 400, 'INVALID_MODEL_NAME');
      }

      if (!schema || !(schema instanceof mongoose.Schema)) {
        throw new AppError('Valid Mongoose schema is required', 400, 'INVALID_SCHEMA');
      }

      // Set collection name
      let collectionName;
      if (options.collection) {
        collectionName = options.collection;
      } else {
        collectionName = BaseModel.getCollectionName(modelName);
      }

      // Ensure schema has the collection name set
      if (!schema.options.collection) {
        schema.options.collection = collectionName;
      }

      // Add timestamps if enabled
      if (options.enableTimestamps !== false) {
        BaseModel.addTimestamps(schema);
      }

      // Add audit fields if enabled
      if (options.enableAudit !== false) {
        BaseModel.addAuditFields(schema);
      }

      // Create the model using primary connection by default
      const model = mongoose.model(modelName, schema, collectionName);

      // Enhance model with base functionality
      BaseModel.enhanceModel(model, options);

      // Register the model
      BaseModel.modelRegistry.set(modelName, model);
      BaseModel.schemaCache.set(modelName, schema);

      logger.info('Model created and registered successfully', {
        modelName,
        collection: collectionName,
        hasTimestamps: options.enableTimestamps !== false,
        hasAudit: options.enableAudit !== false
      });

      return model;

    } catch (error) {
      logger.error(`Failed to create model ${modelName}:`, error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Model creation failed',
        500,
        'MODEL_CREATION_ERROR',
        { modelName, originalError: error.message }
      );
    }
  }

  /**
 * Creates model schema with base functionality
 * @static
 * @param {Object} schemaDefinition - Schema field definitions
 * @param {Object} [options={}] - Schema options
 * @returns {mongoose.Schema} Configured schema
 */
  static createSchema(schemaDefinition, options = {}) {
    try {
      // Default options
      const DEFAULT_OPTIONS = {
        timestamps: true,
        versionKey: '__v',
        collection: null,
        strict: true,
        strictQuery: true,
        runSettersOnQuery: true,
        toJSON: {
          virtuals: true,
          transform: (doc, ret) => {
            delete ret.__v;
            ret.id = ret._id;
            delete ret._id;
            return ret;
          }
        },
        toObject: {
          virtuals: true,
          transform: (doc, ret) => {
            delete ret.__v;
            ret.id = ret._id;
            delete ret._id;
            return ret;
          }
        }
      };

      // Merge options
      const schemaOptions = { ...DEFAULT_OPTIONS, ...options };

      // Create the schema
      const schema = new mongoose.Schema(schemaDefinition, schemaOptions);

      // Add common indexes
      if (schemaDefinition.tenantId) {
        schema.index({ tenantId: 1 });
      }

      if (schemaDefinition.organizationId) {
        schema.index({ organizationId: 1 });
      }

      // Cache the schema
      const collectionName = schemaOptions.collection || 'unknown';
      BaseModel.schemaCache.set(collectionName, schema);

      logger.info('Schema created successfully', {
        collection: collectionName,
        fieldCount: Object.keys(schemaDefinition).length,
        hasTimestamps: schemaOptions.timestamps,
        hasCollection: !!schemaOptions.collection
      });

      return schema;

    } catch (error) {
      logger.error('Failed to create schema:', error);

      throw new AppError(
        'Schema creation failed',
        500,
        'SCHEMA_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Adds common timestamp fields to schema
   * @static
   * @param {mongoose.Schema} schema - Mongoose schema
   */
  static addTimestamps(schema) {
    schema.add({
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      },
      updatedAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    });

    // Update the updatedAt field on save
    schema.pre('save', function (next) {
      if (!this.isNew) {
        this.updatedAt = new Date();
      }
      next();
    });

    // Update the updatedAt field on update operations
    schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
      this.set({ updatedAt: new Date() });
    });
  }

  /**
   * Adds audit fields to schema
   * @static
   * @param {mongoose.Schema} schema - Mongoose schema
   */
  static addAuditFields(schema) {
    schema.add({
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      version: {
        type: Number,
        default: 1
      },
      isDeleted: {
        type: Boolean,
        default: false,
        index: true
      },
      deletedAt: {
        type: Date,
        default: null
      },
      deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    });

    // Increment version on save
    schema.pre('save', function (next) {
      if (!this.isNew) {
        this.increment();
      }
      next();
    });

    // Add soft delete functionality
    schema.methods.softDelete = function (deletedBy) {
      this.isDeleted = true;
      this.deletedAt = new Date();
      if (deletedBy) {
        this.deletedBy = deletedBy;
      }
      return this.save();
    };

    schema.methods.restore = function () {
      this.isDeleted = false;
      this.deletedAt = null;
      this.deletedBy = null;
      return this.save();
    };

    // Filter out soft deleted documents by default
    schema.pre(/^find/, function () {
      if (!this.getOptions().includeSoftDeleted) {
        this.where({ isDeleted: { $ne: true } });
      }
    });
  }

  /**
   * Enhances a model with additional functionality
   * @static
   * @param {Function} model - Mongoose model
   * @param {Object} [options={}] - Enhancement options
   */
  static enhanceModel(model, options = {}) {
    // Add static method for safe creation
    model.createSafely = async function (data, context = {}) {
      try {
        const document = new this(data);

        if (context.user) {
          document.createdBy = context.user;
          document.updatedBy = context.user;
        }

        const result = await document.save();

        if (BaseModel.auditService && options.enableAudit !== false) {
          BaseModel.auditService.logModelAction('CREATE', model.modelName, result._id, context);
        }

        return result;
      } catch (error) {
        logger.error(`Error creating ${model.modelName}:`, error);
        throw error;
      }
    };

    // Add static method for safe updates
    model.updateSafely = async function (id, updates, context = {}) {
      try {
        if (context.user) {
          updates.updatedBy = context.user;
        }

        const result = await this.findByIdAndUpdate(id, updates, {
          new: true,
          runValidators: true
        });

        if (result && BaseModel.auditService && options.enableAudit !== false) {
          BaseModel.auditService.logModelAction('UPDATE', model.modelName, id, context);
        }

        return result;
      } catch (error) {
        logger.error(`Error updating ${model.modelName}:`, error);
        throw error;
      }
    };

    // Add static method for safe deletion
    model.deleteSafely = async function (id, context = {}) {
      try {
        const document = await this.findById(id);
        if (!document) {
          throw new AppError(`${model.modelName} not found`, 404, 'DOCUMENT_NOT_FOUND');
        }

        let result;
        if (document.softDelete) {
          result = await document.softDelete(context.user);
        } else {
          result = await this.findByIdAndDelete(id);
        }

        if (BaseModel.auditService && options.enableAudit !== false) {
          BaseModel.auditService.logModelAction('DELETE', model.modelName, id, context);
        }

        return result;
      } catch (error) {
        logger.error(`Error deleting ${model.modelName}:`, error);
        throw error;
      }
    };

    // Add pagination helper
    model.paginate = async function (query = {}, options = {}) {
      const {
        page = 1,
        limit = 10,
        sort = { createdAt: -1 },
        populate = null
      } = options;

      const skip = (page - 1) * limit;

      let queryBuilder = this.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

      if (populate) {
        if (Array.isArray(populate)) {
          populate.forEach(p => queryBuilder = queryBuilder.populate(p));
        } else {
          queryBuilder = queryBuilder.populate(populate);
        }
      }

      const [documents, totalCount] = await Promise.all([
        queryBuilder.exec(),
        this.countDocuments(query)
      ]);

      return {
        documents,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalDocuments: totalCount,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      };
    };
  }

  /**
   * Generates collection name from model name
   * @static
   * @param {string} modelName - Model name
   * @returns {string} Collection name
   */
  static getCollectionName(modelName) {
    if (!modelName) {
      throw new AppError('Model name is required', 400, 'MODEL_NAME_REQUIRED');
    }

    // Convert PascalCase to snake_case and pluralize
    return stringHelper.pluralize(
      stringHelper.toSnakeCase(modelName)
    );
  }

  /**
   * Gets a registered model by name
   * @static
   * @param {string} modelName - Model name
   * @returns {Function|null} Model constructor or null
   */
  static getModel(modelName) {
    return BaseModel.modelRegistry.get(modelName) || null;
  }

  /**
   * Gets all registered models
   * @static
   * @returns {Map<string, Function>} All registered models
   */
  static getAllModels() {
    return new Map(BaseModel.modelRegistry);
  }

  /**
   * Gets a cached schema by model name
   * @static
   * @param {string} modelName - Model name
   * @returns {mongoose.Schema|null} Cached schema or null
   */
  static getSchema(modelName) {
    return BaseModel.schemaCache.get(modelName) || null;
  }

  /**
   * Sets audit service for model operations
   * @static
   * @param {Object} auditService - Audit service instance
   */
  static setAuditService(auditService) {
    BaseModel.auditService = auditService;
    logger.info('Audit service configured for BaseModel');
  }

  /**
   * Creates index for a model
   * @static
   * @async
   * @param {string} modelName - Model name
   * @param {Object} indexSpec - Index specification
   * @param {Object} [options={}] - Index options
   * @returns {Promise<void>}
   */
  static async createIndex(modelName, indexSpec, options = {}) {
    try {
      const Model = BaseModel.getModel(modelName);
      if (!Model) {
        throw new AppError(`Model not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
      }

      await Model.collection.createIndex(indexSpec, options);

      logger.info('Index created successfully', {
        modelName,
        indexSpec,
        options
      });

    } catch (error) {
      logger.error(`Failed to create index for ${modelName}:`, error);
      throw new AppError(
        'Index creation failed',
        500,
        'INDEX_CREATION_ERROR',
        { modelName, originalError: error.message }
      );
    }
  }

  /**
   * Validates model configuration
   * @static
   * @param {string} modelName - Model name
   * @param {mongoose.Schema} schema - Schema to validate
   * @returns {Object} Validation result
   */
  static validateModel(modelName, schema) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!modelName) {
      validation.isValid = false;
      validation.errors.push('Model name is required');
    }

    if (!schema || !(schema instanceof mongoose.Schema)) {
      validation.isValid = false;
      validation.errors.push('Valid Mongoose schema is required');
    }

    // Check for timestamp fields
    if (schema && !schema.paths.createdAt && !schema.paths.updatedAt) {
      validation.warnings.push('Model does not have timestamp fields');
    }

    // Check for audit fields
    if (schema && !schema.paths.createdBy) {
      validation.warnings.push('Model does not have audit fields');
    }

    return validation;
  }

  /**
   * Clears all registries (for testing)
   * @static
   */
  static clearRegistries() {
    BaseModel.modelRegistry.clear();
    BaseModel.schemaCache.clear();
    BaseModel.initialized = false;
    logger.info('BaseModel registries cleared');
  }

  /**
   * Gets registry statistics
   * @static
   * @returns {Object} Registry statistics
   */
  static getRegistryStats() {
    return {
      totalModels: BaseModel.modelRegistry.size,
      totalSchemas: BaseModel.schemaCache.size,
      initialized: BaseModel.initialized,
      auditEnabled: !!BaseModel.auditService,
      models: Array.from(BaseModel.modelRegistry.keys())
    };
  }
}

module.exports = BaseModel;