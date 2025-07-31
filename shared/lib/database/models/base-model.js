'use strict';

/**
 * @fileoverview Base model class with common functionality for all models
 * @module shared/lib/database/models/base-model
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/query-builder
 * @requires module:shared/lib/security/audit/audit-service
 */

const mongoose = require('mongoose');

// Lazy load dependencies to avoid circular dependency issues
let logger;
let AppError;
let QueryBuilder;
let AuditService;

function getLogger() {
  if (!logger) {
    logger = require('../../utils/logger');
  }
  return logger;
}

function getAppError() {
  if (!AppError) {
    const appErrorModule = require('../../utils/app-error');
    AppError = appErrorModule.AppError || appErrorModule;
  }
  return AppError;
}

function getQueryBuilder() {
  if (!QueryBuilder) {
    QueryBuilder = require('../query-builder');
  }
  return QueryBuilder;
}

function getAuditService() {
  if (!AuditService) {
    AuditService = require('../../security/audit/audit-service');
  }
  return AuditService;
}

/**
 * @class BaseModel
 * @description Abstract base model with common functionality
 */
class BaseModel {
  
  /**
   * Creates model schema with base functionality
   * @static
   * @param {Object} schemaDefinition - Schema field definitions
   * @param {Object} [options={}] - Schema options
   * @returns {mongoose.Schema} Configured schema
   */
  static createSchema(schemaDefinition, options = {}) {
    try {
      const logger = getLogger();
      
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
            return ret;
          }
        },
        toObject: {
          virtuals: true,
          transform: (doc, ret) => {
            delete ret.__v;
            return ret;
          }
        }
      };

      // Merge options with defaults
      const schemaOptions = {
        ...DEFAULT_OPTIONS,
        ...options
      };

      // Add common fields
      const enhancedDefinition = {
        ...schemaDefinition,
        _tenantId: {
          type: String,
          index: true,
          sparse: true
        },
        _deleted: {
          type: Boolean,
          default: false,
          index: true
        },
        _deletedAt: {
          type: Date,
          default: null
        },
        _version: {
          type: Number,
          default: 1
        },
        _metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      };

      // Create schema
      const schema = new mongoose.Schema(enhancedDefinition, schemaOptions);

      // Add indexes
      BaseModel.addDefaultIndexes(schema);

      // Add virtual fields
      BaseModel.addVirtualFields(schema);

      // Add instance methods
      BaseModel.addInstanceMethods(schema);

      // Add static methods
      BaseModel.addStaticMethods(schema);

      // Add middleware
      BaseModel.addMiddleware(schema);

      // Add plugins
      BaseModel.addPlugins(schema, options);

      logger.debug('Schema created', {
        collection: schemaOptions.collection,
        fieldCount: Object.keys(schemaDefinition).length
      });

      return schema;

    } catch (error) {
      const logger = getLogger();
      const AppError = getAppError();
      
      logger.error('Failed to create schema', error);

      throw new AppError(
        'Schema creation failed',
        500,
        'SCHEMA_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates and registers a model
   * @static
   * @param {string} modelName - Model name
   * @param {mongoose.Schema} schema - Model schema
   * @param {Object} [options={}] - Model options
   * @returns {mongoose.Model} Mongoose model
   */
  static createModel(modelName, schema, options = {}) {
    try {
      const logger = getLogger();
      const AppError = getAppError();
      
      if (!modelName || !schema) {
        throw new AppError('Model name and schema are required', 400, 'INVALID_MODEL_PARAMS');
      }

      // Check if model already exists
      if (BaseModel.modelRegistry && BaseModel.modelRegistry.has(modelName)) {
        return BaseModel.modelRegistry.get(modelName);
      }

      // Initialize registries if not exists
      if (!BaseModel.modelRegistry) {
        BaseModel.modelRegistry = new Map();
      }
      if (!BaseModel.schemaCache) {
        BaseModel.schemaCache = new Map();
      }

      // Set collection name if not specified
      if (!schema.options.collection) {
        schema.options.collection = BaseModel.getCollectionName(modelName);
      }

      // Create model
      const Model = mongoose.model(modelName, schema);

      // Enhance model with base functionality
      BaseModel.enhanceModel(Model, options);

      // Register model
      BaseModel.modelRegistry.set(modelName, Model);

      // Cache schema
      BaseModel.schemaCache.set(modelName, schema);

      logger.info('Model created and registered', {
        modelName,
        collection: schema.options.collection
      });

      return Model;

    } catch (error) {
      const logger = getLogger();
      const AppError = getAppError();
      
      logger.error('Failed to create model', error);

      if (error instanceof AppError || (error.constructor && error.constructor.name === 'AppError')) {
        throw error;
      }

      throw new AppError(
        'Model creation failed',
        500,
        'MODEL_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Initializes base model with audit service
   * @static
   * @param {Object} [options={}] - Initialization options
   */
  static initialize(options = {}) {
    const logger = getLogger();
    const AuditService = getAuditService();
    
    const { auditService } = options;

    if (auditService) {
      BaseModel.auditService = auditService;
    } else {
      BaseModel.auditService = new AuditService();
    }

    logger.info('BaseModel initialized');
  }

  /**
   * Adds default indexes to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   */
  static addDefaultIndexes(schema) {
    // Compound index for multi-tenant queries
    schema.index({ _tenantId: 1, _deleted: 1 });
    
    // Index for soft delete queries
    schema.index({ _deleted: 1, _deletedAt: -1 });
    
    // Text search index if searchable fields defined
    const searchableFields = {};
    schema.eachPath((path, schemaType) => {
      if (schemaType.options && schemaType.options.searchable) {
        searchableFields[path] = 'text';
      }
    });

    if (Object.keys(searchableFields).length > 0) {
      schema.index(searchableFields);
    }
  }

  /**
   * Adds virtual fields to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   */
  static addVirtualFields(schema) {
    // Virtual for document age
    schema.virtual('age').get(function() {
      if (this.createdAt) {
        return Date.now() - this.createdAt.getTime();
      }
      return null;
    });

    // Virtual for soft delete status
    schema.virtual('isDeleted').get(function() {
      return this._deleted === true;
    });

    // Virtual for display ID
    schema.virtual('displayId').get(function() {
      return this._id ? this._id.toString() : null;
    });
  }

  /**
   * Adds instance methods to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   */
  static addInstanceMethods(schema) {
    /**
     * Soft deletes the document
     * @param {Object} [options={}] - Delete options
     * @returns {Promise<Object>} Deleted document
     */
    schema.methods.softDelete = async function(options = {}) {
      this._deleted = true;
      this._deletedAt = new Date();
      
      if (options.deletedBy) {
        this._metadata.deletedBy = options.deletedBy;
      }

      return await this.save();
    };

    /**
     * Restores soft deleted document
     * @returns {Promise<Object>} Restored document
     */
    schema.methods.restore = async function() {
      this._deleted = false;
      this._deletedAt = null;
      
      if (this._metadata.deletedBy) {
        delete this._metadata.deletedBy;
      }

      return await this.save();
    };

    /**
     * Increments document version
     * @returns {Promise<Object>} Updated document
     */
    schema.methods.incrementVersion = async function() {
      this._version = (this._version || 0) + 1;
      return await this.save();
    };

    /**
     * Adds metadata to document
     * @param {string} key - Metadata key
     * @param {*} value - Metadata value
     * @returns {Promise<Object>} Updated document
     */
    schema.methods.addMetadata = async function(key, value) {
      if (!this._metadata) {
        this._metadata = {};
      }
      this._metadata[key] = value;
      this.markModified('_metadata');
      return await this.save();
    };

    /**
     * Creates audit log for document
     * @param {string} action - Action performed
     * @param {Object} [details={}] - Additional details
     * @returns {Promise<void>}
     */
    schema.methods.audit = async function(action, details = {}) {
      if (BaseModel.auditService) {
        try {
          await BaseModel.auditService.logActivity({
            action,
            category: 'DATABASE',
            entityType: this.constructor.modelName,
            entityId: this._id,
            details: {
              ...details,
              collection: this.constructor.collection.name
            }
          });
        } catch (error) {
          const logger = getLogger();
          logger.error('Audit logging failed', error);
        }
      }
    };

    /**
     * Converts document to safe JSON
     * @param {Object} [options={}] - Conversion options
     * @returns {Object} Safe JSON representation
     */
    schema.methods.toSafeJSON = function(options = {}) {
      const obj = this.toJSON();
      
      // Remove sensitive fields
      const sensitiveFields = options.sensitiveFields || ['password', '__v', '_deleted'];
      sensitiveFields.forEach(field => {
        delete obj[field];
      });

      // Remove tenant ID if not requested
      if (!options.includeTenant) {
        delete obj._tenantId;
      }

      return obj;
    };

    /**
     * Validates document against custom rules
     * @param {Object} [rules={}] - Validation rules
     * @returns {Promise<Object>} Validation result
     */
    schema.methods.validateCustom = async function(rules = {}) {
      const errors = [];

      for (const [field, rule] of Object.entries(rules)) {
        const value = this.get(field);
        
        if (rule.required && !value) {
          errors.push({ field, message: `${field} is required` });
        }

        if (value && rule.validator) {
          const isValid = await rule.validator(value, this);
          if (!isValid) {
            errors.push({ field, message: rule.message || `${field} validation failed` });
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    };
  }

  /**
   * Adds static methods to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   */
  static addStaticMethods(schema) {
    /**
     * Creates query builder instance
     * @param {Object} [options={}] - Query builder options
     * @returns {QueryBuilder} Query builder instance
     */
    schema.statics.query = function(options = {}) {
      const QueryBuilder = getQueryBuilder();
      return new QueryBuilder(this, options);
    };

    /**
     * Finds documents excluding soft deleted
     * @param {Object} [conditions={}] - Query conditions
     * @param {Object} [options={}] - Query options
     * @returns {Promise<Array>} Documents
     */
    schema.statics.findActive = async function(conditions = {}, options = {}) {
      return await this.find({ ...conditions, _deleted: false }, null, options);
    };

    /**
     * Finds one document excluding soft deleted
     * @param {Object} [conditions={}] - Query conditions
     * @param {Object} [options={}] - Query options
     * @returns {Promise<Object|null>} Document
     */
    schema.statics.findOneActive = async function(conditions = {}, options = {}) {
      return await this.findOne({ ...conditions, _deleted: false }, null, options);
    };

    /**
     * Finds documents including soft deleted
     * @param {Object} [conditions={}] - Query conditions
     * @param {Object} [options={}] - Query options
     * @returns {Promise<Array>} Documents
     */
    schema.statics.findWithDeleted = async function(conditions = {}, options = {}) {
      return await this.find(conditions, null, options);
    };

    /**
     * Finds only soft deleted documents
     * @param {Object} [conditions={}] - Query conditions
     * @param {Object} [options={}] - Query options
     * @returns {Promise<Array>} Documents
     */
    schema.statics.findDeleted = async function(conditions = {}, options = {}) {
      return await this.find({ ...conditions, _deleted: true }, null, options);
    };

    /**
     * Soft deletes multiple documents
     * @param {Object} conditions - Delete conditions
     * @param {Object} [options={}] - Delete options
     * @returns {Promise<Object>} Delete result
     */
    schema.statics.softDeleteMany = async function(conditions, options = {}) {
      const updateData = {
        _deleted: true,
        _deletedAt: new Date()
      };

      if (options.deletedBy) {
        updateData['_metadata.deletedBy'] = options.deletedBy;
      }

      return await this.updateMany(conditions, updateData);
    };

    /**
     * Restores multiple soft deleted documents
     * @param {Object} conditions - Restore conditions
     * @returns {Promise<Object>} Restore result
     */
    schema.statics.restoreMany = async function(conditions) {
      return await this.updateMany(
        { ...conditions, _deleted: true },
        {
          _deleted: false,
          _deletedAt: null,
          $unset: { '_metadata.deletedBy': 1 }
        }
      );
    };

    /**
     * Performs bulk operations
     * @param {Array} operations - Bulk operations
     * @param {Object} [options={}] - Bulk options
     * @returns {Promise<Object>} Bulk result
     */
    schema.statics.bulkOps = async function(operations, options = {}) {
      const AppError = getAppError();
      
      if (!Array.isArray(operations) || operations.length === 0) {
        throw new AppError('Operations array is required', 400, 'INVALID_BULK_OPS');
      }

      const bulkOps = operations.map(op => {
        if (op.insertOne) {
          return { insertOne: { document: { ...op.insertOne.document, _deleted: false } } };
        }
        return op;
      });

      return await this.bulkWrite(bulkOps, options);
    };

    /**
     * Counts active documents
     * @param {Object} [conditions={}] - Count conditions
     * @returns {Promise<number>} Document count
     */
    schema.statics.countActive = async function(conditions = {}) {
      return await this.countDocuments({ ...conditions, _deleted: false });
    };

    /**
     * Finds documents with pagination
     * @param {Object} [conditions={}] - Query conditions
     * @param {Object} [options={}] - Pagination options
     * @returns {Promise<Object>} Paginated results
     */
    schema.statics.paginate = async function(conditions = {}, options = {}) {
      const {
        page = 1,
        limit = 20,
        sort = { createdAt: -1 },
        select,
        populate
      } = options;

      const skip = (page - 1) * limit;

      const [documents, totalCount] = await Promise.all([
        this.find({ ...conditions, _deleted: false })
          .sort(sort)
          .limit(limit)
          .skip(skip)
          .select(select)
          .populate(populate || ''),
        this.countDocuments({ ...conditions, _deleted: false })
      ]);

      return {
        documents,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPreviousPage: page > 1
        }
      };
    };

    /**
     * Searches documents using text search
     * @param {string} searchText - Search text
     * @param {Object} [options={}] - Search options
     * @returns {Promise<Array>} Search results
     */
    schema.statics.search = async function(searchText, options = {}) {
      const {
        filters = {},
        limit = 50,
        scoreThreshold = 0.5
      } = options;

      return await this.find(
        {
          $text: { $search: searchText },
          ...filters,
          _deleted: false
        },
        {
          score: { $meta: 'textScore' }
        }
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .where('score').gte(scoreThreshold);
    };

    /**
     * Gets model statistics
     * @returns {Promise<Object>} Model statistics
     */
    schema.statics.getStatistics = async function() {
      const [
        totalCount,
        activeCount,
        deletedCount,
        recentCount
      ] = await Promise.all([
        this.countDocuments(),
        this.countDocuments({ _deleted: false }),
        this.countDocuments({ _deleted: true }),
        this.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      return {
        total: totalCount,
        active: activeCount,
        deleted: deletedCount,
        recent24h: recentCount,
        deletionRate: totalCount > 0 ? (deletedCount / totalCount) * 100 : 0
      };
    };
  }

  /**
   * Adds middleware to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   */
  static addMiddleware(schema) {
    const logger = getLogger();
    
    // Pre-save middleware
    schema.pre('save', async function(next) {
      try {
        // Update version on modification
        if (this.isModified() && !this.isNew) {
          this._version = (this._version || 0) + 1;
        }

        // Set default metadata
        if (!this._metadata) {
          this._metadata = {};
        }

        next();
      } catch (error) {
        next(error);
      }
    });

    // Post-save middleware
    schema.post('save', async function(doc) {
      try {
        // Audit creation or update
        if (BaseModel.auditService) {
          const action = doc.wasNew ? 'DOCUMENT_CREATED' : 'DOCUMENT_UPDATED';
          await doc.audit(action);
        }
      } catch (error) {
        logger.error('Post-save audit failed', error);
      }
    });

    // Pre-find middleware
    schema.pre(/^find/, function() {
      // Exclude soft deleted by default unless explicitly included
      if (!this.getQuery().hasOwnProperty('_deleted')) {
        this.where({ _deleted: false });
      }
    });

    // Pre-update middleware
    schema.pre(/^update/, function() {
      // Increment version on update
      if (!this.getUpdate().$inc) {
        this.getUpdate().$inc = {};
      }
      this.getUpdate().$inc._version = 1;

      // Set updated timestamp
      this.setUpdate({ updatedAt: new Date() });
    });

    // Pre-remove middleware
    schema.pre('remove', async function(next) {
      try {
        // Audit deletion
        if (BaseModel.auditService) {
          await this.audit('DOCUMENT_DELETED');
        }
        next();
      } catch (error) {
        next(error);
      }
    });

    // Error handling middleware
    schema.post('save', function(error, doc, next) {
      if (error) {
        logger.error('Document save error', {
          model: this.constructor.modelName,
          error: error.message
        });
      }
      next(error);
    });
  }

  /**
   * Adds plugins to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   * @param {Object} options - Schema options
   */
  static addPlugins(schema, options) {
    // Timestamp plugin is handled by mongoose timestamps option
    
    // Add custom plugins if specified
    if (options.plugins && Array.isArray(options.plugins)) {
      options.plugins.forEach(plugin => {
        if (typeof plugin === 'function') {
          schema.plugin(plugin);
        } else if (plugin.fn && typeof plugin.fn === 'function') {
          schema.plugin(plugin.fn, plugin.options || {});
        }
      });
    }
  }

  /**
   * Enhances model with additional functionality
   * @static
   * @param {mongoose.Model} Model - Mongoose model
   * @param {Object} options - Enhancement options
   */
  static enhanceModel(Model, options) {
    // Add model-level query builder
    Model.queryBuilder = function() {
      const QueryBuilder = getQueryBuilder();
      return new QueryBuilder(this);
    };

    // Add tenant-specific query builder
    Model.forTenant = function(tenantId) {
      const QueryBuilder = getQueryBuilder();
      return new QueryBuilder(this, { tenantId });
    };

    // Add model events
    Model.events = new (require('events').EventEmitter)();

    // Override create to emit events
    const originalCreate = Model.create;
    Model.create = async function(...args) {
      const result = await originalCreate.apply(this, args);
      Model.events.emit('created', result);
      return result;
    };

    // Override findOneAndUpdate to emit events
    const originalFindOneAndUpdate = Model.findOneAndUpdate;
    Model.findOneAndUpdate = async function(...args) {
      const result = await originalFindOneAndUpdate.apply(this, args);
      if (result) {
        Model.events.emit('updated', result);
      }
      return result;
    };

    // Override findOneAndDelete to emit events
    const originalFindOneAndDelete = Model.findOneAndDelete;
    Model.findOneAndDelete = async function(...args) {
      const result = await originalFindOneAndDelete.apply(this, args);
      if (result) {
        Model.events.emit('deleted', result);
      }
      return result;
    };
  }

  /**
   * Gets collection name from model name
   * @static
   * @param {string} modelName - Model name
   * @returns {string} Collection name
   */
  static getCollectionName(modelName) {
    // Convert PascalCase to snake_case plural
    return modelName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .substring(1) + 's';
  }

  /**
   * Gets registered model
   * @static
   * @param {string} modelName - Model name
   * @returns {mongoose.Model|null} Registered model
   */
  static getModel(modelName) {
    return (BaseModel.modelRegistry && BaseModel.modelRegistry.get(modelName)) || null;
  }

  /**
   * Gets all registered models
   * @static
   * @returns {Map<string, mongoose.Model>} All registered models
   */
  static getAllModels() {
    return BaseModel.modelRegistry ? new Map(BaseModel.modelRegistry) : new Map();
  }

  /**
   * Clears model registry (for testing)
   * @static
   */
  static clearRegistry() {
    if (BaseModel.modelRegistry) {
      BaseModel.modelRegistry.clear();
    }
    if (BaseModel.schemaCache) {
      BaseModel.schemaCache.clear();
    }
  }
}

// Initialize static properties
BaseModel.modelRegistry = new Map();
BaseModel.schemaCache = new Map();
BaseModel.auditService = null;

module.exports = BaseModel;