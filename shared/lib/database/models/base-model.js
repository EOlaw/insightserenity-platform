'use strict';

/**
 * @fileoverview Enhanced base model for hybrid database architecture with multi-database routing
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
 * @description Enhanced abstract base model providing common functionality
 * for all database models in the hybrid architecture with proper connection routing
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
   * @static
   * @private
   * @type {Object}
   * @description Connection manager instance for routing
   */
  static connectionManager = null;

  /**
   * @static
   * @private
   * @type {Map<string, string>}
   * @description Collection to database type mapping for routing
   */
  static collectionToDatabase = new Map([
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
    ['security_incidents', 'admin'],
    ['sessions', 'admin'],
    ['platforms', 'admin'],
    ['platform_configurations', 'admin'],
    ['rate_limits', 'admin'],
    ['system_health', 'admin'],
    ['configuration_management', 'admin'],
    
    // Shared database collections
    ['subscription_plans', 'shared'],
    ['subscriptions', 'shared'],
    ['invoices', 'shared'],
    ['payments', 'shared'],
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
    ['compliance_mappings', 'audit'],
    ['data_breaches', 'audit'],
    ['erasure_logs', 'audit'],
    ['processing_activities', 'audit'],
    ['consents', 'audit'],
    ['anonymized_users', 'audit'],
    
    // Analytics database collections
    ['api_usage', 'analytics'],
    ['usage_records', 'analytics'],
    ['performance_metrics', 'analytics'],
    ['user_analytics', 'analytics'],
    ['system_metrics', 'analytics']
  ]);

  /**
   * Initialize BaseModel with ConnectionManager integration
   * @static
   * @param {Object} connectionManager - Connection manager instance
   */
  static initialize(connectionManager) {
    console.log('🔧 BaseModel.initialize() called');
    console.log('🔍 ConnectionManager provided:', !!connectionManager);
    
    if (connectionManager) {
      BaseModel.connectionManager = connectionManager;
      console.log('✅ BaseModel ConnectionManager set successfully');
      
      // Test ConnectionManager integration
      try {
        const testConnection = connectionManager.getDatabaseConnection('admin');
        console.log('🧪 Test admin connection:', !!testConnection);
        console.log('🧪 Test connection readyState:', testConnection?.readyState);
      } catch (error) {
        console.log('❌ Test connection failed:', error.message);
      }
    } else {
      console.log('⚠️  No ConnectionManager provided to BaseModel.initialize()');
    }
    
    BaseModel.initialized = true;
    console.log('✅ BaseModel initialization completed');
  }

  /**
   * Determine the correct database connection for a collection
   * @static
   * @private
   * @param {string} collectionName - Collection name
   * @returns {mongoose.Connection|null} Database connection
   */
  static #getDatabaseConnectionForCollection(collectionName) {
    console.log(`🔍 BaseModel.#getDatabaseConnectionForCollection('${collectionName}')`);
    
    if (!BaseModel.connectionManager) {
      console.log('❌ No ConnectionManager available');
      return null;
    }

    // Get database type for collection
    const dbType = BaseModel.collectionToDatabase.get(collectionName);
    console.log(`🗂️  Collection '${collectionName}' mapped to database: '${dbType}'`);

    if (!dbType) {
      console.log(`⚠️  Collection '${collectionName}' not mapped, defaulting to admin`);
      const adminConnection = BaseModel.connectionManager.getDatabaseConnection('admin');
      console.log(`🔗 Admin connection found:`, !!adminConnection);
      return adminConnection;
    }

    // Get connection for database type
    const connection = BaseModel.connectionManager.getDatabaseConnection(dbType);
    console.log(`🔗 Connection for '${dbType}' database:`, !!connection);
    console.log(`🔗 Connection readyState:`, connection?.readyState);
    console.log(`🔗 Connection database name:`, connection?.db?.databaseName);

    return connection;
  }

  /**
   * Creates a new model with enhanced functionality and proper connection routing
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
      console.log(`\n🏗️  BaseModel.createModel('${modelName}') started`);
      console.log(`🔍 Options:`, { 
        collection: options.collection, 
        enableAudit: options.enableAudit,
        enableTimestamps: options.enableTimestamps 
      });

      // Validate inputs
      if (!modelName || typeof modelName !== 'string') {
        console.log(`❌ Invalid model name: '${modelName}'`);
        throw new AppError('Model name is required and must be a string', 400, 'INVALID_MODEL_NAME');
      }

      if (!schema || !(schema instanceof mongoose.Schema)) {
        console.log(`❌ Invalid schema for model: '${modelName}'`);
        throw new AppError('Valid Mongoose schema is required', 400, 'INVALID_SCHEMA');
      }

      // Set collection name
      let collectionName;
      if (options.collection) {
        collectionName = options.collection;
        console.log(`📁 Using provided collection name: '${collectionName}'`);
      } else {
        collectionName = BaseModel.getCollectionName(modelName);
        console.log(`📁 Generated collection name: '${collectionName}'`);
      }

      // Ensure schema has the collection name set
      if (!schema.options.collection) {
        schema.options.collection = collectionName;
        console.log(`📁 Set schema collection name: '${collectionName}'`);
      }

      // Add timestamps if enabled
      if (options.enableTimestamps !== false) {
        console.log(`⏰ Adding timestamps to '${modelName}'`);
        BaseModel.addTimestamps(schema);
      }

      // Add audit fields if enabled
      if (options.enableAudit !== false) {
        console.log(`📋 Adding audit fields to '${modelName}'`);
        BaseModel.addAuditFields(schema);
      }

      // Get the correct database connection for this collection
      console.log(`🔗 Getting database connection for collection: '${collectionName}'`);
      const targetConnection = BaseModel.#getDatabaseConnectionForCollection(collectionName);
      
      let model;
      if (targetConnection) {
        console.log(`✅ Creating model '${modelName}' on specific connection`);
        console.log(`🗄️  Target database: '${targetConnection.db?.databaseName}'`);
        console.log(`🔗 Connection readyState: ${targetConnection.readyState}`);
        
        try {
          // Create model on specific connection
          model = targetConnection.model(modelName, schema, collectionName);
          console.log(`✅ Model '${modelName}' created successfully on connection '${targetConnection.db?.databaseName}'`);
        } catch (connectionError) {
          console.log(`❌ Failed to create model on specific connection: ${connectionError.message}`);
          console.log(`🔄 Falling back to default connection`);
          model = mongoose.model(modelName, schema, collectionName);
        }
      } else {
        console.log(`⚠️  No specific connection found, using default connection`);
        model = mongoose.model(modelName, schema, collectionName);
      }

      // Enhance model with base functionality
      console.log(`🔧 Enhancing model '${modelName}' with base functionality`);
      BaseModel.enhanceModel(model, options);

      // Register the model
      BaseModel.modelRegistry.set(modelName, model);
      BaseModel.schemaCache.set(modelName, schema);
      console.log(`📝 Model '${modelName}' registered in BaseModel registry`);

      // Test model creation by attempting to access the collection
      if (targetConnection) {
        console.log(`🧪 Testing model '${modelName}' collection access...`);
        try {
          const collectionExists = targetConnection.db.collection(collectionName);
          console.log(`✅ Collection '${collectionName}' accessible on database '${targetConnection.db?.databaseName}'`);
          
          // Create an index to ensure collection is actually created
          setTimeout(async () => {
            try {
              await collectionExists.createIndex({ createdAt: 1 });
              console.log(`📊 Index created for collection '${collectionName}'`);
            } catch (indexError) {
              console.log(`⚠️  Index creation failed for '${collectionName}': ${indexError.message}`);
            }
          }, 100);
          
        } catch (collectionError) {
          console.log(`❌ Collection access test failed: ${collectionError.message}`);
        }
      }

      logger.info('Model created and registered successfully', {
        modelName,
        collection: collectionName,
        database: targetConnection?.db?.databaseName || 'default',
        hasTimestamps: options.enableTimestamps !== false,
        hasAudit: options.enableAudit !== false
      });

      console.log(`✅ BaseModel.createModel('${modelName}') completed successfully\n`);
      return model;

    } catch (error) {
      console.log(`❌ BaseModel.createModel('${modelName}') failed: ${error.message}`);
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
      console.log(`📋 BaseModel.createSchema() called`);
      console.log(`📋 Schema fields count: ${Object.keys(schemaDefinition).length}`);
      console.log(`📋 Schema options:`, options);

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
      console.log(`📋 Final schema options:`, schemaOptions);

      // Create the schema
      const schema = new mongoose.Schema(schemaDefinition, schemaOptions);
      console.log(`✅ Schema created successfully`);

      // Add common indexes
      if (schemaDefinition.tenantId) {
        schema.index({ tenantId: 1 });
        console.log(`📊 Added tenantId index`);
      }

      if (schemaDefinition.organizationId) {
        schema.index({ organizationId: 1 });
        console.log(`📊 Added organizationId index`);
      }

      // Cache the schema
      const collectionName = schemaOptions.collection || 'unknown';
      BaseModel.schemaCache.set(collectionName, schema);
      console.log(`💾 Schema cached for collection: '${collectionName}'`);

      logger.info('Schema created successfully', {
        collection: collectionName,
        fieldCount: Object.keys(schemaDefinition).length,
        hasTimestamps: schemaOptions.timestamps,
        hasCollection: !!schemaOptions.collection
      });

      return schema;

    } catch (error) {
      console.log(`❌ BaseModel.createSchema() failed: ${error.message}`);
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
    console.log(`⏰ BaseModel.addTimestamps() - Adding timestamp fields`);
    
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

    console.log(`✅ Timestamp fields added successfully`);
  }

  /**
   * Adds audit fields to schema
   * @static
   * @param {mongoose.Schema} schema - Mongoose schema
   */
  static addAuditFields(schema) {
    console.log(`📋 BaseModel.addAuditFields() - Adding audit fields`);
    
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

    console.log(`✅ Audit fields added successfully`);
  }

  /**
   * Enhances a model with additional functionality
   * @static
   * @param {Function} model - Mongoose model
   * @param {Object} [options={}] - Enhancement options
   */
  static enhanceModel(model, options = {}) {
    console.log(`🔧 BaseModel.enhanceModel('${model.modelName}') - Adding enhanced functionality`);

    // Add static method for safe creation
    model.createSafely = async function (data, context = {}) {
      try {
        console.log(`🏗️  ${model.modelName}.createSafely() called`);
        const document = new this(data);

        if (context.user) {
          document.createdBy = context.user;
          document.updatedBy = context.user;
          console.log(`👤 User context added to ${model.modelName}`);
        }

        const result = await document.save();
        console.log(`✅ ${model.modelName} created successfully with ID: ${result._id}`);

        if (BaseModel.auditService && options.enableAudit !== false) {
          BaseModel.auditService.logModelAction('CREATE', model.modelName, result._id, context);
          console.log(`📋 Audit log created for ${model.modelName}`);
        }

        return result;
      } catch (error) {
        console.log(`❌ ${model.modelName}.createSafely() failed: ${error.message}`);
        logger.error(`Error creating ${model.modelName}:`, error);
        throw error;
      }
    };

    // Add static method for safe updates
    model.updateSafely = async function (id, updates, context = {}) {
      try {
        console.log(`🔄 ${model.modelName}.updateSafely() called for ID: ${id}`);
        if (context.user) {
          updates.updatedBy = context.user;
        }

        const result = await this.findByIdAndUpdate(id, updates, {
          new: true,
          runValidators: true
        });

        if (result && BaseModel.auditService && options.enableAudit !== false) {
          BaseModel.auditService.logModelAction('UPDATE', model.modelName, id, context);
          console.log(`📋 Audit log updated for ${model.modelName}`);
        }

        console.log(`✅ ${model.modelName} updated successfully`);
        return result;
      } catch (error) {
        console.log(`❌ ${model.modelName}.updateSafely() failed: ${error.message}`);
        logger.error(`Error updating ${model.modelName}:`, error);
        throw error;
      }
    };

    // Add static method for safe deletion
    model.deleteSafely = async function (id, context = {}) {
      try {
        console.log(`🗑️  ${model.modelName}.deleteSafely() called for ID: ${id}`);
        const document = await this.findById(id);
        if (!document) {
          throw new AppError(`${model.modelName} not found`, 404, 'DOCUMENT_NOT_FOUND');
        }

        let result;
        if (document.softDelete) {
          result = await document.softDelete(context.user);
          console.log(`✅ ${model.modelName} soft deleted successfully`);
        } else {
          result = await this.findByIdAndDelete(id);
          console.log(`✅ ${model.modelName} hard deleted successfully`);
        }

        if (BaseModel.auditService && options.enableAudit !== false) {
          BaseModel.auditService.logModelAction('DELETE', model.modelName, id, context);
          console.log(`📋 Audit log created for ${model.modelName} deletion`);
        }

        return result;
      } catch (error) {
        console.log(`❌ ${model.modelName}.deleteSafely() failed: ${error.message}`);
        logger.error(`Error deleting ${model.modelName}:`, error);
        throw error;
      }
    };

    // Add pagination helper
    model.paginate = async function (query = {}, options = {}) {
      console.log(`📄 ${model.modelName}.paginate() called`);
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

      console.log(`📄 ${model.modelName} pagination: ${documents.length} documents, ${totalCount} total`);

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

    console.log(`✅ Enhanced functionality added to ${model.modelName}`);
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
    const collectionName = stringHelper.pluralize(
      stringHelper.toSnakeCase(modelName)
    );
    
    console.log(`📁 Generated collection name '${collectionName}' from model '${modelName}'`);
    return collectionName;
  }

  /**
   * Gets a registered model by name
   * @static
   * @param {string} modelName - Model name
   * @returns {Function|null} Model constructor or null
   */
  static getModel(modelName) {
    const model = BaseModel.modelRegistry.get(modelName);
    console.log(`🔍 BaseModel.getModel('${modelName}'): ${!!model ? 'Found' : 'Not found'}`);
    return model || null;
  }

  /**
   * Gets all registered models
   * @static
   * @returns {Map<string, Function>} All registered models
   */
  static getAllModels() {
    console.log(`📚 BaseModel.getAllModels(): ${BaseModel.modelRegistry.size} models`);
    return new Map(BaseModel.modelRegistry);
  }

  /**
   * Gets a cached schema by model name
   * @static
   * @param {string} modelName - Model name
   * @returns {mongoose.Schema|null} Cached schema or null
   */
  static getSchema(modelName) {
    const schema = BaseModel.schemaCache.get(modelName);
    console.log(`📋 BaseModel.getSchema('${modelName}'): ${!!schema ? 'Found' : 'Not found'}`);
    return schema || null;
  }

  /**
   * Sets audit service for model operations
   * @static
   * @param {Object} auditService - Audit service instance
   */
  static setAuditService(auditService) {
    BaseModel.auditService = auditService;
    console.log(`📋 BaseModel audit service configured:`, !!auditService);
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
      console.log(`📊 BaseModel.createIndex('${modelName}')`, indexSpec);
      
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

      console.log(`✅ Index created successfully for ${modelName}`);

    } catch (error) {
      console.log(`❌ Failed to create index for ${modelName}: ${error.message}`);
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
    console.log(`🔍 BaseModel.validateModel('${modelName}')`);
    
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

    console.log(`🔍 Validation result for ${modelName}:`, validation);
    return validation;
  }

  /**
   * Clears all registries (for testing)
   * @static
   */
  static clearRegistries() {
    console.log(`🧹 BaseModel.clearRegistries() - Clearing all registries`);
    
    BaseModel.modelRegistry.clear();
    BaseModel.schemaCache.clear();
    BaseModel.initialized = false;
    
    console.log(`✅ BaseModel registries cleared`);
    logger.info('BaseModel registries cleared');
  }

  /**
   * Gets registry statistics
   * @static
   * @returns {Object} Registry statistics
   */
  static getRegistryStats() {
    const stats = {
      totalModels: BaseModel.modelRegistry.size,
      totalSchemas: BaseModel.schemaCache.size,
      initialized: BaseModel.initialized,
      auditEnabled: !!BaseModel.auditService,
      connectionManagerEnabled: !!BaseModel.connectionManager,
      models: Array.from(BaseModel.modelRegistry.keys())
    };
    
    console.log(`📊 BaseModel registry stats:`, stats);
    return stats;
  }
}

module.exports = BaseModel;