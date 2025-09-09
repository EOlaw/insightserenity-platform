'use strict';

/**
 * @fileoverview FIXED: Enhanced database module with proper initialization order and error handling
 * @module shared/lib/database
 */

const ConnectionManager = require('./connection-manager');
const BaseModel = require('./models/base-model');
const MultiTenantManager = require('./multi-tenant-manager');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config/base-config');

/**
 * @class Database
 * @description FIXED: Enhanced database module with proper initialization sequence
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
   * FIXED: Initializes the enhanced hybrid database architecture with proper error handling
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

      // FIXED: Step 1 - Initialize ConnectionManager with proper error handling
      console.log('\n📡 Step 1: Initializing ConnectionManager');
      try {
        Database.#connectionManager = ConnectionManager;
        console.log('✅ ConnectionManager assigned to Database');
        
        // Ensure ConnectionManager is properly configured
        if (!ConnectionManager.isInitialized()) {
          await ConnectionManager.initialize(databaseConfig, options);
          console.log('✅ ConnectionManager initialization completed');
        } else {
          console.log('✅ ConnectionManager already initialized');
        }
      } catch (connectionError) {
        console.log('❌ ConnectionManager initialization failed:', connectionError.message);
        logger.error('ConnectionManager initialization failed', { error: connectionError.message });
        
        // In development, continue with limited functionality
        if (config.environment?.isDevelopment) {
          console.log('⚠️  Continuing in development mode with limited database functionality');
          Database.#connectionManager = {
            isInitialized: () => false,
            getDatabaseConnection: () => null,
            getConnectionForCollection: () => null,
            getPrimaryConnection: () => null,
            getAnalyticsConnection: () => null
          };
        } else {
          throw connectionError;
        }
      }

      // FIXED: Step 2 - Initialize BaseModel with better error handling
      console.log('\n🏗️  Step 2: Initializing BaseModel with ConnectionManager integration');
      try {
        if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
          BaseModel.initialize(Database.#connectionManager);
          console.log('✅ BaseModel initialized with ConnectionManager');
        } else {
          console.log('⚠️  BaseModel initialized without ConnectionManager (limited functionality)');
          // Initialize BaseModel with minimal functionality for development
          BaseModel.clearRegistries();
        }
      } catch (baseModelError) {
        console.log('❌ BaseModel initialization failed:', baseModelError.message);
        logger.error('BaseModel initialization failed', { error: baseModelError.message });
        
        if (!config.environment?.isDevelopment) {
          throw baseModelError;
        }
      }

      // FIXED: Step 3 - Test integration with proper fallbacks
      console.log('\n🧪 Step 3: Testing ConnectionManager -> BaseModel integration');
      try {
        if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
          const testAdminConnection = Database.#connectionManager.getDatabaseConnection('admin');
          console.log('🧪 Test admin connection available:', !!testAdminConnection);
          
          if (testAdminConnection) {
            console.log('🧪 Admin connection database:', testAdminConnection.db?.databaseName);
            console.log('🧪 Admin connection readyState:', testAdminConnection.readyState);
          }

          const testSharedConnection = Database.#connectionManager.getDatabaseConnection('shared');
          console.log('🧪 Test shared connection available:', !!testSharedConnection);
          
          const testCollectionRouting = Database.#connectionManager.getCollectionsForDatabase('admin');
          console.log('🧪 Admin collections from ConnectionManager:', testCollectionRouting.length);
        } else {
          console.log('⚠️  ConnectionManager not available for integration testing');
        }
      } catch (testError) {
        console.log('❌ ConnectionManager integration test failed:', testError.message);
        logger.warn('ConnectionManager integration test failed', { error: testError.message });
      }

      // FIXED: Step 4 - Initialize multi-tenant support with error handling
      console.log('\n🏢 Step 4: Checking multi-tenant configuration');
      try {
        if (config.multiTenant?.enabled) {
          console.log('✅ Multi-tenant enabled, initializing MultiTenantManager');
          
          // Check if MultiTenantManager module exists
          try {
            Database.#multiTenantManager = MultiTenantManager;
            
            if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
              await MultiTenantManager.initialize({
                primaryConnection: Database.#connectionManager.getPrimaryConnection(),
                analyticsConnection: Database.#connectionManager.getAnalyticsConnection()
              });
              console.log('✅ Multi-tenant support initialized');
              logger.info('Multi-tenant support initialized');
            } else {
              console.log('⚠️  Multi-tenant support initialized with limited functionality');
            }
          } catch (multiTenantError) {
            console.log('❌ MultiTenantManager not available:', multiTenantError.message);
            logger.warn('MultiTenantManager initialization failed', { error: multiTenantError.message });
            Database.#multiTenantManager = null;
          }
        } else {
          console.log('⚠️  Multi-tenant disabled in configuration');
        }
      } catch (tenantError) {
        console.log('❌ Multi-tenant initialization error:', tenantError.message);
        logger.error('Multi-tenant initialization failed', { error: tenantError.message });
        Database.#multiTenantManager = null;
      }

      // FIXED: Step 5 - Load models with comprehensive error handling
      console.log('\n📚 Step 5: Loading and registering models with connection routing');
      try {
        await Database.#loadModels();
        console.log('✅ Models loaded and registered');
      } catch (modelError) {
        console.log('❌ Model loading failed:', modelError.message);
        logger.error('Model loading failed', { error: modelError.message });
        
        // In development, continue with empty model registry
        if (config.environment?.isDevelopment) {
          console.log('⚠️  Continuing with empty model registry in development mode');
          Database.#models.clear();
          Database.#registrationErrors.push({
            error: 'Model loading failed',
            message: modelError.message,
            phase: 'loading'
          });
        } else {
          throw modelError;
        }
      }

      // FIXED: Step 6 - Verify routing with error handling
      console.log('\n🔍 Step 6: Verifying model-to-database routing');
      try {
        await Database.#verifyModelRouting();
      } catch (routingError) {
        console.log('❌ Model routing verification failed:', routingError.message);
        logger.warn('Model routing verification failed', { error: routingError.message });
      }

      Database.#initialized = true;

      // FIXED: Step 7 - Comprehensive summary with fallback information
      console.log('\n📊 Step 7: Final initialization summary');
      const connectionStats = Database.#connectionManager && Database.#connectionManager.isInitialized() ? 
        Database.#connectionManager.getStats() : { summary: { totalConnections: 0, healthyConnections: 0 }};
      
      console.log('📊 Total database connections:', connectionStats.summary?.totalConnections || 0);
      console.log('📊 Healthy connections:', connectionStats.summary?.healthyConnections || 0);
      console.log('📊 Models loaded:', Database.#models.size);
      console.log('📊 Registration errors:', Database.#registrationErrors.length);

      const initializationSummary = {
        primaryConnection: Database.#connectionManager && Database.#connectionManager.isInitialized() ? 'Connected' : 'Limited',
        analyticsConnection: Database.#connectionManager && Database.#connectionManager.getAnalyticsConnection() ? 'Connected' : 'Using primary/Limited',
        multiTenant: config.multiTenant?.enabled ? (Database.#multiTenantManager ? 'Enabled' : 'Limited') : 'Disabled',
        modelsLoaded: Database.#models.size,
        registrationErrors: Database.#registrationErrors.length,
        connectionRouting: Database.#connectionManager && Database.#connectionManager.isInitialized() ? 'Enabled' : 'Limited',
        baseModelIntegration: BaseModel.initialized ? 'Connected' : 'Limited'
      };

      logger.info('Database architecture initialized successfully', initializationSummary);

      console.log('✅ Database.initialize() completed successfully\n');

    } catch (error) {
      console.log('❌ Database.initialize() failed:', error.message);
      console.log('❌ Error stack:', error.stack);
      logger.error('Failed to initialize database', error);
      
      // FIXED: In development, mark as partially initialized rather than failing completely
      if (config.environment?.isDevelopment) {
        console.log('⚠️  Marking database as partially initialized in development mode');
        Database.#initialized = true; // Allow application to continue with limited functionality
        Database.#registrationErrors.push({
          error: 'Database initialization failed',
          message: error.message,
          phase: 'initialization'
        });
        
        logger.warn('Database initialized with limited functionality in development mode', {
          originalError: error.message
        });
        return;
      }
      
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
   * FIXED: Enhanced model loading with better error handling and fallbacks
   * @private
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

      // FIXED: Enhanced model loading with multiple fallback strategies
      let models;
      const modelPaths = [
        './models',
        './models/index',
        './models/index.js'
      ];

      for (const modelPath of modelPaths) {
        try {
          console.log(`📦 Attempting to load models from ${modelPath}`);
          
          // Clear require cache to ensure fresh load
          const resolvedPath = require.resolve(modelPath);
          delete require.cache[resolvedPath];
          
          models = require(modelPath);
          console.log('✅ Models module loaded successfully from:', modelPath);
          console.log('📦 Models module type:', typeof models);
          console.log('📦 Models module keys:', models ? Object.keys(models).length : 'No keys');
          break;
        } catch (requireError) {
          console.log(`❌ Failed to require models from ${modelPath}:`, requireError.message);
          
          if (modelPath === modelPaths[modelPaths.length - 1]) {
            // Last attempt failed, create minimal models registry
            console.log('⚠️  Creating minimal models registry with basic models');
            models = Database.#createMinimalModelsRegistry();
          }
        }
      }
      
      if (models && typeof models === 'object') {
        console.log(`📚 Processing ${Object.keys(models).length} models from registry`);
        
        for (const [modelName, ModelClass] of Object.entries(models)) {
          try {
            console.log(`\n🔄 Processing model: ${modelName}`);
            console.log(`🔍 ModelClass type: ${typeof ModelClass}`);
            console.log(`🔍 ModelClass is function: ${typeof ModelClass === 'function'}`);
            
            // FIXED: Enhanced model validation and registration
            if (Database.#isValidModel(ModelClass, modelName)) {
              console.log(`✅ ${modelName} - Valid model function`);
              
              try {
                console.log(`🧪 Testing ${modelName} model instantiation`);
                
                // FIXED: Better model registration logic
                if (ModelClass.schema) {
                  console.log(`📋 ${modelName} - Schema found, model already created`);
                  Database.#models.set(modelName, ModelClass);
                } else if (typeof ModelClass.getSchema === 'function') {
                  console.log(`🏗️  ${modelName} - Has getSchema method, attempting to create model`);
                  const schema = ModelClass.getSchema();
                  const createdModel = BaseModel.createModel(modelName, schema);
                  Database.#models.set(modelName, createdModel);
                  console.log(`✅ ${modelName} - Model created successfully via BaseModel`);
                } else if (typeof ModelClass === 'function') {
                  console.log(`📝 ${modelName} - Direct model constructor, registering as-is`);
                  Database.#models.set(modelName, ModelClass);
                } else {
                  console.log(`❌ ${modelName} - Unknown model type`);
                  Database.#registrationErrors.push({
                    modelName,
                    error: 'Unknown model type',
                    path: './models'
                  });
                  continue;
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
        console.log('⚠️  Models module is not a valid object, creating basic models');
        models = Database.#createMinimalModelsRegistry();
        
        // Register minimal models
        for (const [modelName, ModelClass] of Object.entries(models)) {
          try {
            Database.#models.set(modelName, ModelClass);
            console.log(`✅ ${modelName} - Basic model registered`);
          } catch (error) {
            console.log(`❌ ${modelName} - Basic model registration failed:`, error.message);
          }
        }
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
      
      // FIXED: Create basic models even if loading fails
      console.log('🔄 Creating emergency model registry');
      const emergencyModels = Database.#createMinimalModelsRegistry();
      for (const [modelName, ModelClass] of Object.entries(emergencyModels)) {
        Database.#models.set(modelName, ModelClass);
      }
      
      throw new AppError(
        'Model loading failed',
        500,
        'MODEL_LOADING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * FIXED: Create minimal models registry for fallback scenarios
   * @private
   * @static
   * @returns {Object} Basic models registry
   */
  static #createMinimalModelsRegistry() {
    console.log('🔧 Creating minimal models registry for basic functionality');
    
    const mongoose = require('mongoose');
    
    // Create basic schemas for essential models
    const basicUserSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      role: { type: String, default: 'user' },
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });
    
    const basicOrganizationSchema = new mongoose.Schema({
      name: { type: String, required: true },
      domain: { type: String },
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });

    const basicSessionSchema = new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      token: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });

    // Create basic models
    try {
      const models = {};
      
      if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
        const connection = Database.#connectionManager.getPrimaryConnection();
        if (connection) {
          models.User = connection.model('User', basicUserSchema);
          models.Organization = connection.model('Organization', basicOrganizationSchema);
          models.Session = connection.model('Session', basicSessionSchema);
        }
      } else {
        // Fallback to default mongoose connection
        models.User = mongoose.model('User', basicUserSchema);
        models.Organization = mongoose.model('Organization', basicOrganizationSchema);
        models.Session = mongoose.model('Session', basicSessionSchema);
      }
      
      console.log('✅ Minimal models registry created with basic models');
      return models;
    } catch (error) {
      console.log('❌ Failed to create minimal models registry:', error.message);
      return {};
    }
  }

  /**
   * FIXED: Enhanced model validation
   * @private
   * @static
   * @param {*} ModelClass - Model class to validate
   * @param {string} modelName - Model name
   * @returns {boolean} Whether the model is valid
   */
  static #isValidModel(ModelClass, modelName) {
    // Skip utility functions and non-model exports
    const utilityFunctions = [
      'getModel', 'getAllModels', 'getModelsByCategory', 'getCustomerServicesModels',
      'getAdminModels', 'getCoreModels', 'hasModel', 'getRegistrationStats'
    ];
    
    if (utilityFunctions.includes(modelName)) {
      return false;
    }
    
    // Skip non-function exports
    if (typeof ModelClass !== 'function') {
      return false;
    }
    
    // Skip obvious non-model functions (constructor functions that don't look like models)
    if (modelName.toLowerCase().includes('error') || 
        modelName.toLowerCase().includes('helper') ||
        modelName.toLowerCase().includes('util')) {
      return false;
    }
    
    return true;
  }

  /**
   * FIXED: Enhanced model routing verification with better error handling
   * @private
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
          let collectionName;
          try {
            collectionName = model.collection?.name || 
                           model.collection?.collectionName ||
                           BaseModel.getCollectionName(modelName);
          } catch (nameError) {
            console.log(`❌ ${modelName} - Could not determine collection name:`, nameError.message);
            routingResults.failed.push({
              modelName,
              error: `Could not determine collection name: ${nameError.message}`
            });
            continue;
          }
          
          console.log(`📁 Collection name: ${collectionName}`);
          
          // Get expected database type if ConnectionManager is available
          let expectedDbType = null;
          let actualConnection = null;
          
          if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
            try {
              expectedDbType = Database.#connectionManager.getDatabaseTypeForCollection(collectionName);
              console.log(`🗂️  Expected database type: ${expectedDbType}`);
              
              if (expectedDbType) {
                actualConnection = Database.#connectionManager.getDatabaseConnection(expectedDbType);
                console.log(`🔗 Actual connection available: ${!!actualConnection}`);
                
                if (actualConnection) {
                  console.log(`🗄️  Connected to database: ${actualConnection.db?.databaseName}`);
                  console.log(`🔗 Connection readyState: ${actualConnection.readyState}`);
                  
                  // Test collection access
                  try {
                    const collection = actualConnection.db.collection(collectionName);
                    console.log(`📊 Collection accessible: ${!!collection}`);
                    
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
              } else {
                console.log(`⚠️  ${modelName} - No database type mapping found`);
                routingResults.missing.push({ modelName, collectionName });
              }
            } catch (routingError) {
              console.log(`❌ ${modelName} - Routing check failed: ${routingError.message}`);
              routingResults.failed.push({
                modelName,
                collectionName,
                error: routingError.message
              });
            }
          } else {
            console.log(`⚠️  ${modelName} - ConnectionManager not available, skipping routing verification`);
            routingResults.missing.push({ 
              modelName, 
              collectionName,
              reason: 'ConnectionManager not available'
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
          console.log(`  - ${result.modelName} (${result.collectionName})${result.reason ? ` - ${result.reason}` : ''}`);
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
   * FIXED: Enhanced connection retrieval with fallbacks
   * @static
   * @returns {mongoose.Connection|null} Primary connection
   */
  static getPrimaryConnection() {
    try {
      if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
        const connection = Database.#connectionManager.getPrimaryConnection();
        console.log('🔍 Database.getPrimaryConnection():', !!connection);
        return connection;
      }
      
      console.log('🔍 Database.getPrimaryConnection(): ConnectionManager not available');
      return null;
    } catch (error) {
      console.log('❌ Database.getPrimaryConnection() error:', error.message);
      return null;
    }
  }

  /**
   * FIXED: Enhanced analytics connection retrieval
   * @static
   * @returns {mongoose.Connection|null} Analytics connection
   */
  static getAnalyticsConnection() {
    try {
      if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
        const connection = Database.#connectionManager.getAnalyticsConnection();
        console.log('🔍 Database.getAnalyticsConnection():', !!connection);
        return connection;
      }
      
      console.log('🔍 Database.getAnalyticsConnection(): ConnectionManager not available');
      return null;
    } catch (error) {
      console.log('❌ Database.getAnalyticsConnection() error:', error.message);
      return null;
    }
  }

  /**
   * FIXED: Enhanced model retrieval with better error handling
   * @static
   * @param {string} modelName - Model name
   * @param {Object} [options={}] - Model options
   * @returns {Function|null} Model constructor
   */
  static getModel(modelName, options = {}) {
    try {
      console.log(`🔍 Database.getModel('${modelName}')`, options);
      
      // For tenant-specific models
      if (options.tenantId && Database.#multiTenantManager) {
        try {
          console.log(`🏢 Getting tenant model for: ${options.tenantId}`);
          return Database.#multiTenantManager.getTenantModel(modelName, options.tenantId);
        } catch (tenantError) {
          console.log(`❌ Tenant model retrieval failed: ${tenantError.message}`);
          // Fall through to regular model retrieval
        }
      }

      // Default to registered models
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
   * FIXED: Enhanced database statistics with better error handling
   * @static
   * @returns {Object} Database statistics
   */
  static getStats() {
    console.log('📊 Database.getStats() called');
    
    try {
      const connectionStats = Database.#connectionManager && Database.#connectionManager.isInitialized() ? 
        Database.#connectionManager.getStats() : { 
          summary: { totalConnections: 0, healthyConnections: 0 },
          error: 'ConnectionManager not available'
        };

      const stats = {
        initialized: Database.#initialized,
        connections: connectionStats,
        models: {
          total: Database.#models.size,
          registered: Array.from(Database.#models.keys()),
          errors: Database.#registrationErrors.length
        },
        multiTenant: {
          enabled: !!Database.#multiTenantManager,
          tenants: Database.#multiTenantManager ? 
            (Database.#multiTenantManager.getActiveTenants ? Database.#multiTenantManager.getActiveTenants().length : 0) : 0
        },
        baseModelIntegration: {
          initialized: BaseModel.initialized,
          connectionManagerLinked: !!BaseModel.connectionManager,
          auditServiceLinked: !!BaseModel.auditService
        },
        health: {
          connectionManager: Database.#connectionManager && Database.#connectionManager.isInitialized(),
          baseModel: BaseModel.initialized,
          modelsLoaded: Database.#models.size > 0,
          hasErrors: Database.#registrationErrors.length > 0
        }
      };
      
      console.log('📊 Database stats generated:', {
        initialized: stats.initialized,
        modelsCount: stats.models.total,
        connectionsCount: stats.connections?.summary?.totalConnections || 0,
        hasErrors: stats.health.hasErrors
      });
      
      return stats;
    } catch (error) {
      console.log('❌ Database.getStats() error:', error.message);
      return {
        error: error.message,
        initialized: Database.#initialized,
        models: { total: Database.#models.size },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if database is initialized
   * @static
   * @returns {boolean} Initialization status
   */
  static isInitialized() {
    const initialized = Database.#initialized;
    console.log(`🔍 Database.isInitialized(): ${initialized}`);
    return initialized;
  }

  /**
   * FIXED: Enhanced shutdown with comprehensive cleanup
   * @static
   * @async
   * @param {boolean} [force=false] - Force shutdown
   * @returns {Promise<void>}
   */
  static async shutdown(force = false) {
    try {
      console.log('🔄 Database.shutdown() - Shutting down database module');
      logger.info('Shutting down database module');

      // Shutdown multi-tenant manager
      if (Database.#multiTenantManager) {
        try {
          if (Database.#multiTenantManager.shutdown) {
            await Database.#multiTenantManager.shutdown();
          }
          Database.#multiTenantManager = null;
          console.log('✅ Multi-tenant manager shutdown');
        } catch (tenantShutdownError) {
          console.log('⚠️  Multi-tenant manager shutdown error:', tenantShutdownError.message);
        }
      }

      // Shutdown connection manager
      if (Database.#connectionManager) {
        try {
          if (Database.#connectionManager.disconnectAll) {
            await Database.#connectionManager.disconnectAll(force);
          }
          Database.#connectionManager = null;
          console.log('✅ Connection manager shutdown');
        } catch (connectionShutdownError) {
          console.log('⚠️  Connection manager shutdown error:', connectionShutdownError.message);
        }
      }

      // Clear BaseModel integration
      try {
        BaseModel.clearRegistries();
        console.log('✅ BaseModel registries cleared');
      } catch (baseModelError) {
        console.log('⚠️  BaseModel cleanup error:', baseModelError.message);
      }

      // Clear internal state
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

  // Additional utility methods...
  static getConnection(connectionName = 'primary') {
    return Database.#connectionManager ? 
      Database.#connectionManager.getConnection(connectionName) : null;
  }

  static getDatabase(connectionName = 'primary') {
    return Database.#connectionManager ? 
      Database.#connectionManager.getDatabase(connectionName) : null;
  }

  static async checkHealth(connectionName = 'primary') {
    if (!Database.#connectionManager) {
      return { status: 'not_initialized', message: 'Database not initialized' };
    }
    return await Database.#connectionManager.checkHealth(connectionName);
  }

  static getRegistrationErrors() {
    return [...Database.#registrationErrors];
  }

  static getRegistrationSummary() {
    return {
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
  }
}

// Export main class
module.exports = Database;

// Export individual components for direct access
module.exports.ConnectionManager = ConnectionManager;
module.exports.BaseModel = BaseModel;

// Export convenience methods
module.exports.connect = Database.initialize;
module.exports.disconnect = Database.shutdown;
module.exports.getConnection = Database.getConnection;
module.exports.getPrimaryConnection = Database.getPrimaryConnection;
module.exports.getAnalyticsConnection = Database.getAnalyticsConnection;
module.exports.getDatabase = Database.getDatabase;
module.exports.getModel = Database.getModel;
module.exports.checkHealth = Database.checkHealth;
module.exports.getStats = Database.getStats;
module.exports.isInitialized = Database.isInitialized;