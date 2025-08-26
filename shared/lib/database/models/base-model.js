'use strict';

/**
 * @fileoverview Enhanced base model class with multi-database routing and common functionality for all models
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
let ConnectionManager;

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
    try {
      QueryBuilder = require('../query-builder');
    } catch (error) {
      // QueryBuilder might not be available in all environments
      QueryBuilder = null;
    }
  }
  return QueryBuilder;
}

function getAuditService() {
  if (!AuditService) {
    try {
      AuditService = require('../../security/audit/audit-service');
    } catch (error) {
      // AuditService might not be available in all environments
      AuditService = null;
    }
  }
  return AuditService;
}

function getConnectionManager() {
  if (!ConnectionManager) {
    try {
      ConnectionManager = require('../connection-manager');
    } catch (error) {
      // ConnectionManager might not be available during initial loading
      ConnectionManager = null;
    }
  }
  return ConnectionManager;
}

/**
 * @class BaseModel
 * @description Enhanced abstract base model with multi-database routing and common functionality
 */
class BaseModel {
  
  /**
   * Static registries and properties for models and schemas with multi-database support
   * @static
   * @private
   */
  static modelRegistry = new Map();
  static schemaCache = new Map();
  static auditService = null;
  static connectionManager = null;
  static multiDatabaseEnabled = false;
  static initialized = false;
  
  /**
   * ENHANCED: Database collection mapping for multi-database architecture
   * @static
   * @private
   */
  static collectionDatabaseMapping = new Map([
    // Admin database collections
    ['users', 'admin'],
    ['user_profiles', 'admin'],
    ['user_activities', 'admin'],
    ['login_history', 'admin'],
    ['roles', 'admin'],
    ['permissions', 'admin'],
    ['organizations', 'admin'],
    ['organization_members', 'admin'],
    ['organization_invitations', 'admin'],
    ['tenants', 'admin'],
    ['system_configurations', 'admin'],
    ['configuration_management', 'admin'], // FIXED: Added explicit mapping for configuration_management
    ['security_incidents', 'admin'],
    ['sessions', 'admin'],
    
    // Shared database collections
    ['subscription_plans', 'shared'],
    ['features', 'shared'],
    ['system_settings', 'shared'],
    ['webhooks', 'shared'],
    ['api_integrations', 'shared'],
    ['notifications', 'shared'],
    ['oauth_providers', 'shared'],
    ['passkeys', 'shared'],
    
    // Audit database collections
    ['audit_logs', 'audit'],
    ['audit_alerts', 'audit'],
    ['audit_exports', 'audit'],
    ['audit_retention_policies', 'audit'],
    ['compliance_mappings', 'audit'],
    ['data_breaches', 'audit'],
    ['erasure_logs', 'audit'],
    ['processing_activities', 'audit'],
    
    // Analytics database collections
    ['api_usage', 'analytics'],
    ['usage_records', 'analytics'],
    ['performance_metrics', 'analytics'],
    ['user_analytics', 'analytics'],
    ['system_metrics', 'analytics']
  ]);

  /**
   * ENHANCED: Initialize BaseModel with multi-database support
   * @static
   * @async
   * @param {Object} [options={}] - Initialization options
   * @param {Object} options.connectionManager - Connection manager instance
   * @param {boolean} options.multiDatabase - Enable multi-database support
   * @param {Object} options.auditService - Audit service instance
   * @returns {Promise<void>}
   */
  static async initialize(options = {}) {
    try {
      const logger = getLogger();
      
      if (BaseModel.initialized) {
        logger.debug('BaseModel already initialized');
        return;
      }

      BaseModel.connectionManager = options.connectionManager || getConnectionManager();
      BaseModel.multiDatabaseEnabled = options.multiDatabase || false;

      // Initialize registries if not already done
      if (!BaseModel.modelRegistry) {
        BaseModel.modelRegistry = new Map();
      }
      if (!BaseModel.schemaCache) {
        BaseModel.schemaCache = new Map();
      }

      // Initialize audit service
      if (options.auditService) {
        BaseModel.auditService = options.auditService;
      } else {
        const AuditService = getAuditService();
        if (AuditService) {
          BaseModel.auditService = new AuditService();
        }
      }

      BaseModel.initialized = true;
      
      logger.info('BaseModel initialized', {
        multiDatabaseEnabled: BaseModel.multiDatabaseEnabled,
        connectionManager: BaseModel.connectionManager ? 'Available' : 'Not Available',
        auditService: BaseModel.auditService ? 'Available' : 'Not Available',
        modelRegistry: BaseModel.modelRegistry.size,
        schemaCache: BaseModel.schemaCache.size
      });

    } catch (error) {
      const logger = getLogger();
      logger.error('BaseModel initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * ENHANCED: Get appropriate database connection for a collection with multi-database routing
   * @static
   * @param {string} collectionName - Name of the collection
   * @returns {mongoose.Connection|null} Database connection
   */
  static getDatabaseConnectionForCollection(collectionName) {
    try {
      if (!BaseModel.multiDatabaseEnabled || !BaseModel.connectionManager) {
        return null;
      }

      const dbType = BaseModel.collectionDatabaseMapping.get(collectionName);
      if (dbType && BaseModel.connectionManager.getDatabaseConnection) {
        return BaseModel.connectionManager.getDatabaseConnection(dbType);
      }

      // Fallback to connection manager's method
      if (BaseModel.connectionManager.getConnectionForCollection) {
        return BaseModel.connectionManager.getConnectionForCollection(collectionName);
      }

      return null;
    } catch (error) {
      const logger = getLogger();
      logger.warn(`Failed to get database connection for collection ${collectionName}`, {
        error: error.message
      });
      return null;
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

      // ENHANCED: Add common fields with improved multi-database support
      const enhancedDefinition = {
        ...schemaDefinition,
        
        // Common audit fields
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
        },
        
        // ENHANCED: Multi-database tracking fields
        _createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          index: true
        },
        
        _updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          index: true
        },
        
        // Enhanced organization tracking
        _organizationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Organization',
          index: true
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

      // Cache the schema
      const collectionName = schemaOptions.collection || 'unknown';
      BaseModel.schemaCache.set(collectionName, schema);

      logger.debug('Schema created', {
        collection: collectionName,
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
   * ENHANCED: Creates and registers a model with multi-database routing
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

      // FIXED: Properly extract collection name from schema options first, then fallback to generated name
      let collectionName;
      if (schema.options && schema.options.collection) {
        // Use explicitly defined collection name from schema options
        collectionName = schema.options.collection;
        logger.debug(`Using explicit collection name from schema: ${collectionName}`);
      } else if (options.collection) {
        // Use collection name from options
        collectionName = options.collection;
      } else {
        // Generate collection name from model name as fallback
        collectionName = BaseModel.getCollectionName(modelName);
      }

      // Ensure schema has the collection name set
      if (!schema.options.collection) {
        schema.options.collection = collectionName;
      }

      let model;

      // ENHANCED: Try to use appropriate database connection for multi-database setup
      if (BaseModel.multiDatabaseEnabled) {
        const connection = BaseModel.getDatabaseConnectionForCollection(collectionName);
        
        if (connection) {
          try {
            model = connection.model(modelName, schema, collectionName);
            const dbType = BaseModel.collectionDatabaseMapping.get(collectionName);
            logger.debug(`Model created with specific database connection`, {
              modelName,
              collection: collectionName,
              database: dbType || 'unknown'
            });
          } catch (connectionError) {
            logger.warn(`Failed to create model with specific connection, falling back to default`, {
              modelName,
              error: connectionError.message
            });
            model = mongoose.model(modelName, schema, collectionName);
          }
        } else {
          model = mongoose.model(modelName, schema, collectionName);
          const dbType = BaseModel.collectionDatabaseMapping.get(collectionName);
          logger.debug(`Model created with default connection`, {
            modelName,
            collection: collectionName,
            database: dbType || 'unmapped - will use admin as fallback'
          });
        }
      } else {
        model = mongoose.model(modelName, schema, collectionName);
      }

      // Enhance model with base functionality
      BaseModel.enhanceModel(model, options);

      // Register the model
      BaseModel.modelRegistry.set(modelName, model);

      // Cache schema
      BaseModel.schemaCache.set(modelName, schema);

      logger.info('Model created and registered', {
        modelName,
        collection: collectionName
      });

      return model;

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
   * Adds default indexes to schema
   * @static
   * @param {mongoose.Schema} schema - Schema instance
   */
  static addDefaultIndexes(schema) {
    // Compound index for multi-tenant queries
    schema.index({ _tenantId: 1, _deleted: 1 });
    
    // Index for soft delete queries
    schema.index({ _deleted: 1, _deletedAt: -1 });
    
    // Enhanced organization-based queries
    schema.index({ _organizationId: 1, _deleted: 1 });
    
    // Audit trail indexes
    schema.index({ _createdBy: 1, createdAt: -1 });
    schema.index({ _updatedBy: 1, updatedAt: -1 });
    
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

    // ENHANCED: Virtual for database type routing
    schema.virtual('databaseType').get(function() {
      const collectionName = this.constructor.collection.name;
      return BaseModel.collectionDatabaseMapping.get(collectionName) || 'unknown';
    });

    // Virtual for audit summary
    schema.virtual('auditSummary').get(function() {
      return {
        createdBy: this._createdBy,
        updatedBy: this._updatedBy,
        version: this._version,
        organizationId: this._organizationId,
        tenantId: this._tenantId
      };
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
              collection: this.constructor.collection.name,
              databaseType: this.databaseType
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

    /**
     * ENHANCED: Sets the user context for audit trail
     * @param {mongoose.Schema.Types.ObjectId} userId - User ID
     * @param {mongoose.Schema.Types.ObjectId} [organizationId] - Organization ID
     * @returns {Object} Document instance for chaining
     */
    schema.methods.setUserContext = function(userId, organizationId = null) {
      if (this.isNew) {
        this._createdBy = userId;
      }
      this._updatedBy = userId;
      
      if (organizationId) {
        this._organizationId = organizationId;
      }
      
      return this;
    };

    /**
     * ENHANCED: Gets the database type for this document
     * @returns {string} Database type
     */
    schema.methods.getDatabaseType = function() {
      const collectionName = this.constructor.collection.name;
      return BaseModel.collectionDatabaseMapping.get(collectionName) || 'unknown';
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

    /**
     * ENHANCED: Finds documents by organization
     * @param {mongoose.Schema.Types.ObjectId} organizationId - Organization ID
     * @param {Object} [conditions={}] - Additional conditions
     * @param {Object} [options={}] - Query options
     * @returns {Promise<Array>} Documents
     */
    schema.statics.findByOrganization = async function(organizationId, conditions = {}, options = {}) {
      return await this.findActive({ ...conditions, _organizationId: organizationId }, options);
    };

    /**
     * ENHANCED: Finds documents by tenant
     * @param {string} tenantId - Tenant ID
     * @param {Object} [conditions={}] - Additional conditions
     * @param {Object} [options={}] - Query options
     * @returns {Promise<Array>} Documents
     */
    schema.statics.findByTenant = async function(tenantId, conditions = {}, options = {}) {
      return await this.findActive({ ...conditions, _tenantId: tenantId }, options);
    };

    /**
     * ENHANCED: Gets the database type for this model
     * @returns {string} Database type
     */
    schema.statics.getDatabaseType = function() {
      const collectionName = this.collection.name;
      return BaseModel.collectionDatabaseMapping.get(collectionName) || 'unknown';
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

    // ENHANCED: Add organization-specific query builder
    Model.forOrganization = function(organizationId) {
      const QueryBuilder = getQueryBuilder();
      return new QueryBuilder(this, { organizationId });
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

  /**
   * ENHANCED: Get database type for a collection
   * @static
   * @param {string} collectionName - Collection name
   * @returns {string|null} Database type
   */
  static getDatabaseTypeForCollection(collectionName) {
    return BaseModel.collectionDatabaseMapping.get(collectionName) || null;
  }

  /**
   * ENHANCED: Add custom collection mapping
   * @static
   * @param {string} collectionName - Collection name
   * @param {string} databaseType - Database type (admin, shared, audit, analytics)
   */
  static addCollectionMapping(collectionName, databaseType) {
    BaseModel.collectionDatabaseMapping.set(collectionName, databaseType);
    
    const logger = getLogger();
    logger.debug(`Collection mapping added: ${collectionName} -> ${databaseType}`);
  }

  /**
   * ENHANCED: Get all collection mappings
   * @static
   * @returns {Map<string, string>} Collection to database mappings
   */
  static getAllCollectionMappings() {
    return new Map(BaseModel.collectionDatabaseMapping);
  }

  /**
   * ENHANCED: Check if multi-database is enabled
   * @static
   * @returns {boolean} Multi-database status
   */
  static isMultiDatabaseEnabled() {
    return BaseModel.multiDatabaseEnabled;
  }

  /**
   * ENHANCED: Get connection manager instance
   * @static
   * @returns {Object|null} Connection manager
   */
  static getConnectionManager() {
    return BaseModel.connectionManager;
  }

  /**
   * ENHANCED: Simple pluralization helper
   * @static
   * @param {string} word - Word to pluralize
   * @returns {string} Pluralized word
   */
  static pluralize(word) {
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    } else if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || 
               word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    } else {
      return word + 's';
    }
  }

  /**
   * ENHANCED: Register a model manually with database routing
   * @static
   * @param {string} modelName - Name of the model
   * @param {mongoose.Model} model - Model instance
   * @param {mongoose.Schema} [schema] - Schema instance
   * @param {string} [databaseType] - Target database type
   */
  static registerModel(modelName, model, schema = null, databaseType = null) {
    BaseModel.modelRegistry.set(modelName, model);
    
    if (schema) {
      BaseModel.schemaCache.set(modelName, schema);
    }
    
    // Add collection mapping if database type provided
    if (databaseType && model.collection) {
      BaseModel.addCollectionMapping(model.collection.name, databaseType);
    }
    
    const logger = getLogger();
    logger.debug(`Model registered: ${modelName}`, {
      databaseType: databaseType || 'default',
      collection: model.collection?.name || 'unknown'
    });
  }

  /**
   * ENHANCED: Get registration statistics
   * @static
   * @returns {Object} Registration stats
   */
  static getRegistrationStats() {
    return {
      models: BaseModel.modelRegistry.size,
      schemas: BaseModel.schemaCache.size,
      multiDatabaseEnabled: BaseModel.multiDatabaseEnabled,
      initialized: BaseModel.initialized,
      connectionManager: BaseModel.connectionManager ? 'Available' : 'Not Available',
      collectionMappings: BaseModel.collectionDatabaseMapping.size
    };
  }
}

// Initialize static properties
BaseModel.modelRegistry = new Map();
BaseModel.schemaCache = new Map();
BaseModel.auditService = null;
BaseModel.connectionManager = null;
BaseModel.multiDatabaseEnabled = false;
BaseModel.initialized = false;

module.exports = BaseModel;