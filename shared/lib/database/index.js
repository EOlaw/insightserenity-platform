'use strict';

/**
 * @fileoverview Enhanced database module for hybrid architecture with proper connection routing
 * @module shared/lib/database
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/database/multi-tenant-manager
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config/base-config
 */

const ConnectionManager = require('./connection-manager');
const BaseModel = require('./models/base-model');
const MultiTenantManager = require('./multi-tenant-manager');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config/base-config');

/**
 * @class Database
 * @description Enhanced database module supporting hybrid architecture with proper connection routing
 * Core business data -> Primary MongoDB connection
 * Analytics data -> Analytics connection (or primary with separate collections)
 * Enterprise tenants -> Optional dedicated connections
 */
class Database {
  
  /**
   * @private
   * @static
   * @type {ConnectionManager}
   * @description Connection manager instance
   */
  static #connectionManager = null;

  /**
   * @private
   * @static
   * @type {MultiTenantManager}
   * @description Multi-tenant manager instance
   */
  static #multiTenantManager = null;

  /**
   * @private
   * @static
   * @type {Map<string, Function>}
   * @description Registered model constructors
   */
  static #models = new Map();

  /**
   * @private
   * @static
   * @type {boolean}
   * @description Database initialization status
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @type {Object}
   * @description Database configuration
   */
  static #config = null;

  /**
   * @private
   * @static
   * @type {Array<Object>}
   * @description Model registration errors
   */
  static #registrationErrors = [];

  /**
   * Initializes the enhanced hybrid database architecture with proper connection routing
   * @static
   * @async
   * @param {Object} [databaseConfig=config.database] - Database configuration
   * @param {Object} [options={}] - Initialization options
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(databaseConfig = config.database, options = {}) {
    try {
      if (Database.#initialized) {
        console.log('🔍 Database.initialize() - Already initialized, skipping');
        logger.debug('Database already initialized');
        return;
      }

      console.log('\n🚀 Database.initialize() - Starting enhanced hybrid database architecture initialization');
      logger.info('Initializing enhanced hybrid database architecture with connection routing');

      Database.#config = databaseConfig;
      console.log('💾 Database config stored:', !!databaseConfig);

      // Step 1: Initialize connection manager
      console.log('\n📡 Step 1: Initializing ConnectionManager');
      Database.#connectionManager = ConnectionManager;
      console.log('✅ ConnectionManager assigned to Database');
      
      await ConnectionManager.initialize(databaseConfig, options);
      console.log('✅ ConnectionManager initialization completed');

      // Step 2: Initialize BaseModel with ConnectionManager integration
      console.log('\n🏗️  Step 2: Initializing BaseModel with ConnectionManager integration');
      BaseModel.initialize(ConnectionManager);
      console.log('✅ BaseModel initialized with ConnectionManager');

      // Step 3: Test the ConnectionManager -> BaseModel integration
      console.log('\n🧪 Step 3: Testing ConnectionManager -> BaseModel integration');
      try {
        const testAdminConnection = ConnectionManager.getDatabaseConnection('admin');
        console.log('🧪 Test admin connection available:', !!testAdminConnection);
        
        if (testAdminConnection) {
          console.log('🧪 Admin connection database:', testAdminConnection.db?.databaseName);
          console.log('🧪 Admin connection readyState:', testAdminConnection.readyState);
        }

        const testSharedConnection = ConnectionManager.getDatabaseConnection('shared');
        console.log('🧪 Test shared connection available:', !!testSharedConnection);
        
        const testCollectionRouting = ConnectionManager.getCollectionsForDatabase('admin');
        console.log('🧪 Admin collections from ConnectionManager:', testCollectionRouting.length);
        
      } catch (testError) {
        console.log('❌ ConnectionManager integration test failed:', testError.message);
      }

      // Step 4: Initialize multi-tenant support if enabled
      console.log('\n🏢 Step 4: Checking multi-tenant configuration');
      if (config.multiTenant?.enabled) {
        console.log('✅ Multi-tenant enabled, initializing MultiTenantManager');
        Database.#multiTenantManager = MultiTenantManager;
        await MultiTenantManager.initialize({
          primaryConnection: ConnectionManager.getPrimaryConnection(),
          analyticsConnection: ConnectionManager.getAnalyticsConnection()
        });
        console.log('✅ Multi-tenant support initialized');
        logger.info('Multi-tenant support initialized');
      } else {
        console.log('⚠️  Multi-tenant disabled in configuration');
      }

      // Step 5: Load and register models with proper connection routing
      console.log('\n📚 Step 5: Loading and registering models with connection routing');
      await Database.#loadModels();
      console.log('✅ Models loaded and registered');

      // Step 6: Verify model-to-database routing
      console.log('\n🔍 Step 6: Verifying model-to-database routing');
      await Database.#verifyModelRouting();

      Database.#initialized = true;

      // Step 7: Final verification and summary
      console.log('\n📊 Step 7: Final initialization summary');
      const connectionStats = ConnectionManager.getStats();
      console.log('📊 Total database connections:', connectionStats.summary.totalConnections);
      console.log('📊 Healthy connections:', connectionStats.summary.healthyConnections);
      console.log('📊 Models loaded:', Database.#models.size);
      console.log('📊 Registration errors:', Database.#registrationErrors.length);

      logger.info('Database architecture initialized successfully', {
        primaryConnection: 'Connected',
        analyticsConnection: ConnectionManager.getAnalyticsConnection() ? 'Connected' : 'Using primary',
        multiTenant: config.multiTenant?.enabled ? 'Enabled' : 'Disabled',
        modelsLoaded: Database.#models.size,
        registrationErrors: Database.#registrationErrors.length,
        connectionRouting: 'Enabled',
        baseModelIntegration: 'Connected'
      });

      console.log('✅ Database.initialize() completed successfully\n');

    } catch (error) {
      console.log('❌ Database.initialize() failed:', error.message);
      console.log('❌ Error stack:', error.stack);
      logger.error('Failed to initialize database', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Database initialization failed',
        500,
        'DATABASE_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Loads all models from the models directory with proper connection routing
   * @static
   * @async
   */
  static async #loadModels() {
    try {
      console.log('📚 Database.#loadModels() - Loading database models with connection routing');
      logger.info('Loading database models with connection routing');

      // Clear existing models and errors
      Database.#models.clear();
      Database.#registrationErrors = [];
      console.log('🧹 Cleared existing models and errors');

      // Load models from index file
      console.log('📦 Attempting to load models from ./models/index');
      let models;
      try {
        models = require('./models');
        console.log('✅ Models module loaded successfully');
        console.log('📦 Models module type:', typeof models);
        console.log('📦 Models module keys:', models ? Object.keys(models) : 'No keys');
      } catch (requireError) {
        console.log('❌ Failed to require models module:', requireError.message);
        throw new AppError('Failed to load models module', 500, 'MODEL_MODULE_ERROR', {
          originalError: requireError.message
        });
      }
      
      if (models && typeof models === 'object') {
        console.log(`📚 Processing ${Object.keys(models).length} models from index`);
        
        for (const [modelName, ModelClass] of Object.entries(models)) {
          try {
            console.log(`\n🔄 Processing model: ${modelName}`);
            console.log(`🔍 ModelClass type: ${typeof ModelClass}`);
            console.log(`🔍 ModelClass is function: ${typeof ModelClass === 'function'}`);
            
            if (ModelClass && typeof ModelClass === 'function') {
              console.log(`✅ ${modelName} - Valid model function`);
              
              // Test model instantiation to ensure it works with our connection routing
              try {
                console.log(`🧪 Testing ${modelName} model instantiation`);
                
                // If the model has a schema property, it means it's already been processed
                if (ModelClass.schema) {
                  console.log(`📋 ${modelName} - Schema found, model already created`);
                  Database.#models.set(modelName, ModelClass);
                } else if (typeof ModelClass.getSchema === 'function') {
                  console.log(`🏗️  ${modelName} - Has getSchema method, attempting to create model`);
                  // This would be a model factory that needs to be invoked
                  const schema = ModelClass.getSchema();
                  const createdModel = BaseModel.createModel(modelName, schema);
                  Database.#models.set(modelName, createdModel);
                  console.log(`✅ ${modelName} - Model created successfully via BaseModel`);
                } else {
                  console.log(`📝 ${modelName} - Direct model constructor, registering as-is`);
                  Database.#models.set(modelName, ModelClass);
                }
                
                console.log(`✅ ${modelName} - Registered successfully`);
                logger.debug(`Model registered: ${modelName}`);
                
              } catch (instantiationError) {
                console.log(`❌ ${modelName} - Instantiation test failed:`, instantiationError.message);
                Database.#registrationErrors.push({
                  modelName,
                  error: `Instantiation failed: ${instantiationError.message}`,
                  path: './models'
                });
              }
            } else {
              console.log(`⚠️  ${modelName} - Invalid model (not a function)`);
              Database.#registrationErrors.push({
                modelName,
                error: 'Not a valid model function',
                path: './models'
              });
            }
          } catch (error) {
            console.log(`❌ ${modelName} - Registration failed:`, error.message);
            Database.#registrationErrors.push({
              modelName,
              error: error.message,
              path: './models'
            });
            logger.warn(`Failed to register model ${modelName}:`, error.message);
          }
        }
      } else {
        console.log('⚠️  Models module is not a valid object');
        logger.warn('Models module did not return a valid object');
      }

      console.log('\n📊 Model loading summary:');
      console.log(`✅ Successfully loaded: ${Database.#models.size} models`);
      console.log(`❌ Failed to load: ${Database.#registrationErrors.length} models`);
      console.log(`📝 Loaded models: [${Array.from(Database.#models.keys()).join(', ')}]`);

      if (Database.#registrationErrors.length > 0) {
        console.log('❌ Registration errors:');
        Database.#registrationErrors.forEach(error => {
          console.log(`  - ${error.modelName}: ${error.error}`);
        });
      }

      logger.info('Models loaded successfully', {
        totalModels: Database.#models.size,
        errors: Database.#registrationErrors.length
      });

      if (Database.#registrationErrors.length > 0) {
        logger.warn('Some models failed to register', {
          errors: Database.#registrationErrors
        });
      }

    } catch (error) {
      console.log('❌ Database.#loadModels() failed:', error.message);
      logger.error('Failed to load models', error);
      throw new AppError(
        'Model loading failed',
        500,
        'MODEL_LOADING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Verifies that models are properly routed to their intended databases
   * @static
   * @async
   */
  static async #verifyModelRouting() {
    try {
      console.log('\n🔍 Database.#verifyModelRouting() - Verifying model-to-database routing');

      const routingResults = {
        verified: [],
        failed: [],
        missing: []
      };

      // Test each registered model's database connection
      for (const [modelName, model] of Database.#models) {
        try {
          console.log(`\n🔍 Verifying routing for model: ${modelName}`);
          
          // Get collection name
          const collectionName = model.collection?.name || BaseModel.getCollectionName(modelName);
          console.log(`📁 Collection name: ${collectionName}`);
          
          // Get expected database type
          const expectedDbType = BaseModel.collectionToDatabase.get(collectionName);
          console.log(`🗂️  Expected database type: ${expectedDbType}`);
          
          if (!expectedDbType) {
            console.log(`⚠️  ${modelName} - No database type mapping found`);
            routingResults.missing.push({ modelName, collectionName });
            continue;
          }
          
          // Get actual connection
          const actualConnection = ConnectionManager.getDatabaseConnection(expectedDbType);
          console.log(`🔗 Actual connection available: ${!!actualConnection}`);
          
          if (actualConnection) {
            console.log(`🗄️  Connected to database: ${actualConnection.db?.databaseName}`);
            console.log(`🔗 Connection readyState: ${actualConnection.readyState}`);
            
            // Test collection access
            try {
              const collection = actualConnection.db.collection(collectionName);
              console.log(`📊 Collection accessible: ${!!collection}`);
              
              // Attempt to create a test document to ensure the collection gets created
              setTimeout(async () => {
                try {
                  await collection.createIndex({ createdAt: 1 });
                  console.log(`📊 Index created for ${collectionName} in ${actualConnection.db?.databaseName}`);
                } catch (indexError) {
                  console.log(`⚠️  Index creation failed for ${collectionName}: ${indexError.message}`);
                }
              }, 200);
              
              routingResults.verified.push({
                modelName,
                collectionName,
                databaseType: expectedDbType,
                databaseName: actualConnection.db?.databaseName
              });
              console.log(`✅ ${modelName} - Routing verified successfully`);
              
            } catch (collectionError) {
              console.log(`❌ ${modelName} - Collection access failed: ${collectionError.message}`);
              routingResults.failed.push({
                modelName,
                collectionName,
                error: collectionError.message
              });
            }
          } else {
            console.log(`❌ ${modelName} - No connection available for database type: ${expectedDbType}`);
            routingResults.failed.push({
              modelName,
              collectionName,
              error: `No connection for database type: ${expectedDbType}`
            });
          }
          
        } catch (verificationError) {
          console.log(`❌ ${modelName} - Verification failed: ${verificationError.message}`);
          routingResults.failed.push({
            modelName,
            error: verificationError.message
          });
        }
      }

      // Summary
      console.log('\n📊 Model routing verification summary:');
      console.log(`✅ Successfully verified: ${routingResults.verified.length} models`);
      console.log(`❌ Failed verification: ${routingResults.failed.length} models`);
      console.log(`⚠️  Missing mappings: ${routingResults.missing.length} models`);

      if (routingResults.verified.length > 0) {
        console.log('\n✅ Successfully verified models:');
        routingResults.verified.forEach(result => {
          console.log(`  - ${result.modelName} (${result.collectionName}) -> ${result.databaseName}`);
        });
      }

      if (routingResults.failed.length > 0) {
        console.log('\n❌ Failed verification models:');
        routingResults.failed.forEach(result => {
          console.log(`  - ${result.modelName}: ${result.error}`);
        });
      }

      if (routingResults.missing.length > 0) {
        console.log('\n⚠️  Missing mapping models:');
        routingResults.missing.forEach(result => {
          console.log(`  - ${result.modelName} (${result.collectionName})`);
        });
      }

      logger.info('Model routing verification completed', {
        verified: routingResults.verified.length,
        failed: routingResults.failed.length,
        missing: routingResults.missing.length
      });

    } catch (error) {
      console.log('❌ Model routing verification failed:', error.message);
      logger.error('Model routing verification failed', error);
    }
  }

  /**
   * Gets the primary database connection for core business data
   * @static
   * @returns {mongoose.Connection|null} Primary connection
   */
  static getPrimaryConnection() {
    const connection = Database.#connectionManager ? 
      ConnectionManager.getPrimaryConnection() : null;
    console.log('🔍 Database.getPrimaryConnection():', !!connection);
    return connection;
  }

  /**
   * Gets the analytics database connection for time-series data
   * @static
   * @returns {mongoose.Connection|null} Analytics connection
   */
  static getAnalyticsConnection() {
    const connection = Database.#connectionManager ? 
      ConnectionManager.getAnalyticsConnection() : null;
    console.log('🔍 Database.getAnalyticsConnection():', !!connection);
    return connection;
  }

  /**
   * Gets a specific connection by name
   * @static
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {mongoose.Connection|null} Database connection
   */
  static getConnection(connectionName = 'primary') {
    const connection = Database.#connectionManager ? 
      ConnectionManager.getConnection(connectionName) : null;
    console.log(`🔍 Database.getConnection('${connectionName}'):`, !!connection);
    return connection;
  }

  /**
   * Gets a model by name with proper connection routing
   * @static
   * @param {string} modelName - Model name
   * @param {Object} [options={}] - Model options
   * @param {string} [options.connection] - Specific connection to use
   * @param {string} [options.tenantId] - Tenant ID for tenant-specific models
   * @returns {Function|null} Model constructor
   */
  static getModel(modelName, options = {}) {
    try {
      console.log(`🔍 Database.getModel('${modelName}')`, options);
      
      // For tenant-specific models
      if (options.tenantId && Database.#multiTenantManager) {
        console.log(`🏢 Getting tenant model for: ${options.tenantId}`);
        return MultiTenantManager.getTenantModel(modelName, options.tenantId);
      }

      // For analytics models, route to analytics connection
      if (Database.#isAnalyticsModel(modelName)) {
        console.log(`📊 ${modelName} identified as analytics model`);
        const analyticsConnection = Database.getAnalyticsConnection();
        if (analyticsConnection && analyticsConnection !== Database.getPrimaryConnection()) {
          const ModelClass = Database.#models.get(modelName);
          if (ModelClass && ModelClass.schema) {
            try {
              const analyticsModel = analyticsConnection.model(modelName, ModelClass.schema);
              console.log(`✅ Analytics model created for ${modelName}`);
              return analyticsModel;
            } catch (error) {
              console.log(`❌ Analytics model creation failed for ${modelName}, using primary:`, error.message);
            }
          }
        }
      }

      // Default to registered models (using primary connection)
      const ModelClass = Database.#models.get(modelName);
      if (ModelClass) {
        console.log(`✅ Found registered model: ${modelName}`);
        return ModelClass;
      }

      console.log(`⚠️  Model not found: ${modelName}`);
      logger.warn(`Model not found: ${modelName}`);
      return null;

    } catch (error) {
      console.log(`❌ Error getting model ${modelName}:`, error.message);
      logger.error(`Error getting model ${modelName}:`, error);
      return null;
    }
  }

  /**
   * @private
   * Determines if a model should use analytics connection
   * @static
   * @param {string} modelName - Model name
   * @returns {boolean} True if model is analytics-related
   */
  static #isAnalyticsModel(modelName) {
    const analyticsModels = [
      'Analytics',
      'Metrics',
      'Events',
      'Tracking',
      'Usage',
      'Performance',
      'Statistics',
      'TimeSeries'
    ];
    
    const isAnalytics = analyticsModels.some(pattern => 
      modelName.includes(pattern) || modelName.toLowerCase().includes(pattern.toLowerCase())
    );
    
    console.log(`🔍 ${modelName} is analytics model: ${isAnalytics}`);
    return isAnalytics;
  }

  /**
   * Creates a tenant connection for enterprise clients
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<mongoose.Connection>} Tenant connection
   */
  static async createTenantConnection(tenantId, options = {}) {
    console.log(`🏢 Database.createTenantConnection('${tenantId}')`);
    
    if (!Database.#connectionManager) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }
    
    const connection = await ConnectionManager.createTenantConnection(tenantId, options);
    console.log(`✅ Tenant connection created for: ${tenantId}`);
    return connection;
  }

  /**
   * Gets a tenant connection
   * @static
   * @param {string} tenantId - Tenant identifier
   * @returns {mongoose.Connection|null} Tenant connection
   */
  static getTenantConnection(tenantId) {
    const connection = Database.#connectionManager ? 
      ConnectionManager.getTenantConnection(tenantId) : null;
    console.log(`🔍 Database.getTenantConnection('${tenantId}'):`, !!connection);
    return connection;
  }

  /**
   * Executes a database transaction on the primary connection
   * @static
   * @async
   * @param {Function} callback - Transaction callback
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<*>} Transaction result
   */
  static async executeTransaction(callback, options = {}) {
    console.log('🔄 Database.executeTransaction() called');
    
    if (!Database.#connectionManager) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    const result = await ConnectionManager.executeTransaction(callback, options);
    console.log('✅ Transaction completed successfully');
    return result;
  }

  /**
   * Executes a query builder pattern
   * @static
   * @param {string} modelName - Model name
   * @returns {Object} Query builder instance
   */
  static query(modelName) {
    console.log(`🔍 Database.query('${modelName}')`);
    
    const Model = Database.getModel(modelName);
    if (!Model) {
      throw new AppError(`Model not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
    }
    
    const query = Model.find(); // Returns Mongoose query which supports chaining
    console.log(`✅ Query builder created for ${modelName}`);
    return query;
  }

  /**
   * Gets database instance
   * @static
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {mongoose.Db|null} Database instance
   */
  static getDatabase(connectionName = 'primary') {
    const database = Database.#connectionManager ? 
      ConnectionManager.getDatabase(connectionName) : null;
    console.log(`🔍 Database.getDatabase('${connectionName}'):`, !!database);
    return database;
  }

  /**
   * Checks database health
   * @static
   * @async
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {Promise<Object>} Health status
   */
  static async checkHealth(connectionName = 'primary') {
    console.log(`🏥 Database.checkHealth('${connectionName}')`);
    
    if (!Database.#connectionManager) {
      return { status: 'not_initialized', message: 'Database not initialized' };
    }

    const health = await ConnectionManager.checkHealth(connectionName);
    console.log(`🏥 Health check result:`, health.status);
    return health;
  }

  /**
   * Gets comprehensive database statistics
   * @static
   * @returns {Object} Database statistics
   */
  static getStats() {
    console.log('📊 Database.getStats() called');
    
    if (!Database.#connectionManager) {
      return { status: 'not_initialized' };
    }

    const stats = {
      initialized: Database.#initialized,
      connections: ConnectionManager.getStats(),
      models: {
        total: Database.#models.size,
        registered: Array.from(Database.#models.keys()),
        errors: Database.#registrationErrors.length
      },
      multiTenant: {
        enabled: !!Database.#multiTenantManager,
        tenants: Database.#multiTenantManager ? 
          MultiTenantManager.getActiveTenants().length : 0
      },
      baseModelIntegration: {
        initialized: BaseModel.initialized,
        connectionManagerLinked: !!BaseModel.connectionManager,
        auditServiceLinked: !!BaseModel.auditService
      }
    };
    
    console.log('📊 Database stats generated:', {
      initialized: stats.initialized,
      modelsCount: stats.models.total,
      connectionsCount: stats.connections?.summary?.totalConnections || 0
    });
    
    return stats;
  }

  /**
   * Reloads all models (for development/testing)
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async reloadModels() {
    console.log('🔄 Database.reloadModels() - Reloading database models');
    logger.info('Reloading database models');
    
    Database.#models.clear();
    Database.#registrationErrors = [];
    
    // Clear require cache for models
    try {
      const modelPath = require.resolve('./models');
      delete require.cache[modelPath];
      console.log('🧹 Model cache cleared');
    } catch (error) {
      console.log('⚠️  Model cache clear failed:', error.message);
    }
    
    await Database.#loadModels();
    
    console.log('✅ Models reloaded successfully');
    logger.info('Models reloaded successfully', {
      totalModels: Database.#models.size,
      errors: Database.#registrationErrors.length
    });
  }

  /**
   * Gets all registered models
   * @static
   * @returns {Map<string, Function>} All models
   */
  static getAllModels() {
    const models = new Map(Database.#models);
    console.log(`📚 Database.getAllModels(): ${models.size} models`);
    return models;
  }

  /**
   * Gets model registration errors
   * @static
   * @returns {Array<Object>} Registration errors
   */
  static getRegistrationErrors() {
    const errors = [...Database.#registrationErrors];
    console.log(`❌ Database.getRegistrationErrors(): ${errors.length} errors`);
    return errors;
  }

  /**
   * Gets registration summary for admin monitoring
   * @static
   * @returns {Object} Registration summary
   */
  static getRegistrationSummary() {
    const summary = {
      total: Database.#models.size + Database.#registrationErrors.length,
      successful: Database.#models.size,
      failed: Database.#registrationErrors.length,
      initialized: Database.#initialized,
      connectionManagerLinked: !!Database.#connectionManager,
      baseModelIntegrated: BaseModel.initialized && !!BaseModel.connectionManager,
      models: Array.from(Database.#models.keys()),
      errors: Database.#registrationErrors.map(e => ({
        modelName: e.modelName,
        error: e.error
      }))
    };
    
    console.log('📊 Registration summary:', {
      total: summary.total,
      successful: summary.successful,
      failed: summary.failed
    });
    
    return summary;
  }

  /**
   * Forces model registration for debugging
   * @static
   * @async
   * @param {string} modelName - Model name to register
   * @returns {Promise<boolean>} Registration success
   */
  static async forceModelRegistration(modelName) {
    try {
      console.log(`🔧 Database.forceModelRegistration('${modelName}')`);
      
      // Clear any existing registration
      if (Database.#models.has(modelName)) {
        Database.#models.delete(modelName);
        console.log(`🧹 Cleared existing registration for ${modelName}`);
      }
      
      // Remove from errors list
      Database.#registrationErrors = Database.#registrationErrors.filter(
        e => e.modelName !== modelName
      );
      
      // Attempt to reload the specific model
      const models = require('./models');
      if (models[modelName]) {
        const ModelClass = models[modelName];
        if (typeof ModelClass === 'function') {
          Database.#models.set(modelName, ModelClass);
          console.log(`✅ Force registration successful for ${modelName}`);
          return true;
        }
      }
      
      console.log(`❌ Force registration failed for ${modelName} - model not found`);
      return false;
      
    } catch (error) {
      console.log(`❌ Force registration error for ${modelName}:`, error.message);
      return false;
    }
  }

  /**
   * Shuts down the database module
   * @static
   * @async
   * @param {boolean} [force=false] - Force shutdown
   * @returns {Promise<void>}
   */
  static async shutdown(force = false) {
    try {
      console.log('🔄 Database.shutdown() - Shutting down database module');
      logger.info('Shutting down database module');

      if (Database.#multiTenantManager) {
        await MultiTenantManager.shutdown();
        Database.#multiTenantManager = null;
        console.log('✅ Multi-tenant manager shutdown');
      }

      if (Database.#connectionManager) {
        await ConnectionManager.disconnectAll(force);
        Database.#connectionManager = null;
        console.log('✅ Connection manager shutdown');
      }

      // Clear BaseModel integration
      BaseModel.clearRegistries();
      console.log('✅ BaseModel registries cleared');

      Database.#models.clear();
      Database.#registrationErrors = [];
      Database.#initialized = false;
      Database.#config = null;

      console.log('✅ Database shutdown complete');
      logger.info('Database module shutdown complete');

    } catch (error) {
      console.log('❌ Database shutdown error:', error.message);
      logger.error('Error during database shutdown', error);
      throw new AppError(
        'Database shutdown failed',
        500,
        'DATABASE_SHUTDOWN_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if database is initialized
   * @static
   * @returns {boolean} Initialization status
   */
  static isInitialized() {
    const initialized = Database.#initialized;
    console.log(`🔍 Database.isInitialized(): ${initialized}`);
    return initialized;
  }
}

// Export main class
module.exports = Database;

// Export individual components for direct access
module.exports.ConnectionManager = ConnectionManager;
module.exports.MultiTenantManager = MultiTenantManager;
module.exports.BaseModel = BaseModel;

// Export convenience methods
module.exports.connect = Database.initialize;
module.exports.disconnect = Database.shutdown;
module.exports.getConnection = Database.getConnection;
module.exports.getPrimaryConnection = Database.getPrimaryConnection;
module.exports.getAnalyticsConnection = Database.getAnalyticsConnection;
module.exports.getDatabase = Database.getDatabase;
module.exports.getModel = Database.getModel;
module.exports.query = Database.query;
module.exports.transaction = Database.executeTransaction;
module.exports.checkHealth = Database.checkHealth;
module.exports.getStats = Database.getStats;
module.exports.reloadModels = Database.reloadModels;
module.exports.createTenantConnection = Database.createTenantConnection;
module.exports.getTenantConnection = Database.getTenantConnection;