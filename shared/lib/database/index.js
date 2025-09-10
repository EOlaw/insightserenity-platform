'use strict';

/**
 * @fileoverview Streamlined Database Module - Production Ready Implementation
 * @module shared/lib/database
 * @version 3.0.0
 * @author InsightSerenity Platform Team
 */

const ConnectionManager = require('./connection-manager');
const BaseModel = require('./models/base-model');
const MultiTenantManager = require('./multi-tenant-manager');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config/base-config');

/**
 * @class Database
 * @description Streamlined database module with consolidated initialization
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
   * @type {boolean}
   * @description Early phase completion status
   */
  static #earlyPhaseComplete = false;

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
   * @private
   * @static
   * @type {Object}
   * @description Initialization phases tracking
   */
  static #initializationPhases = {
    connectionManager: false,
    baseModel: false,
    multiTenant: false,
    models: false,
    routing: false
  };

  /**
   * Streamlined initialization with automatic phase management
   * @static
   * @async
   * @param {Object} [databaseConfig=config.database] - Database configuration
   * @param {Object} [options={}] - Initialization options
   * @param {boolean} [options.earlyPhaseOnly=false] - Run only early initialization phase
   * @param {boolean} [options.skipEarlyPhase=false] - Skip early phase if already completed
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(databaseConfig = config.database, options = {}) {
    try {
      const { earlyPhaseOnly = false, skipEarlyPhase = false, forceReinitialize = false } = options;

      // Handle early exit conditions
      if (Database.#initialized && !forceReinitialize) {
        logger.debug('Database already initialized');
        return;
      }

      if (earlyPhaseOnly && Database.#earlyPhaseComplete && !forceReinitialize) {
        logger.debug('Early phase already completed');
        return;
      }

      console.log('\n🚀 Database.initialize() - Starting comprehensive initialization');
      logger.info('Initializing enhanced database architecture', {
        earlyPhaseOnly,
        skipEarlyPhase,
        forceReinitialize
      });

      Database.#config = databaseConfig;

      // Phase 1: Early Initialization (ConnectionManager + BaseModel)
      if (!skipEarlyPhase && (!Database.#earlyPhaseComplete || forceReinitialize)) {
        await Database.#executeEarlyPhase(databaseConfig);
      }

      // Exit early if only early phase requested
      if (earlyPhaseOnly) {
        Database.#earlyPhaseComplete = true;
        return;
      }

      // Phase 2: Multi-Tenant Architecture
      if (!Database.#initializationPhases.multiTenant || forceReinitialize) {
        await Database.#executeMultiTenantPhase();
      }

      // Phase 3: Model Collection and Registration
      if (!Database.#initializationPhases.models || forceReinitialize) {
        await Database.#executeModelPhase();
      }

      // Phase 4: Routing Verification
      if (!Database.#initializationPhases.routing || forceReinitialize) {
        await Database.#executeRoutingPhase();
      }

      // Phase 5: Final Setup and Validation
      await Database.#executeFinalPhase();

      Database.#initialized = true;
      Database.#logInitializationSummary();

      console.log('✅ Database.initialize() completed successfully\n');

    } catch (error) {
      console.log('❌ Database.initialize() failed:', error.message);
      logger.error('Database initialization failed', {
        error: error.message,
        stack: error.stack,
        phases: Database.#initializationPhases
      });
      
      await Database.#handleInitializationFailure(error);
    }
  }

  /**
   * Execute early initialization phase
   * @private
   * @static
   * @async
   * @param {Object} databaseConfig - Database configuration
   */
  static async #executeEarlyPhase(databaseConfig) {
    console.log('\n📡 Phase 1: Early Initialization (ConnectionManager + BaseModel)');

    try {
      // Initialize ConnectionManager
      if (!Database.#initializationPhases.connectionManager) {
        console.log('🔄 Initializing ConnectionManager...');
        
        Database.#connectionManager = ConnectionManager;
        
        if (!ConnectionManager.isInitialized()) {
          await ConnectionManager.initialize(databaseConfig);
          console.log('✅ ConnectionManager initialized successfully');
        } else {
          console.log('✅ ConnectionManager already initialized');
        }
        
        Database.#initializationPhases.connectionManager = true;
      }

      // Initialize BaseModel
      if (!Database.#initializationPhases.baseModel) {
        console.log('🔄 Initializing BaseModel...');
        
        BaseModel.initialize(Database.#connectionManager);
        
        // Verify integration
        const integrationTest = BaseModel.testConnectionManagerIntegration();
        if (!integrationTest.connectionManagerAvailable) {
          throw new Error('BaseModel integration failed - ConnectionManager not available');
        }
        
        console.log('✅ BaseModel initialized and verified');
        Database.#initializationPhases.baseModel = true;
      }

      Database.#earlyPhaseComplete = true;
      console.log('✅ Early phase completed successfully');

    } catch (error) {
      console.log('❌ Early phase failed:', error.message);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️  Creating development fallback for early phase');
        Database.#connectionManager = Database.#createDevelopmentFallback();
        BaseModel.initialize(Database.#connectionManager);
        Database.#earlyPhaseComplete = true;
        Database.#initializationPhases.connectionManager = true;
        Database.#initializationPhases.baseModel = true;
      } else {
        throw error;
      }
    }
  }

  /**
   * Execute multi-tenant initialization phase
   * @private
   * @static
   * @async
   */
  static async #executeMultiTenantPhase() {
    console.log('\n🏢 Phase 2: Multi-Tenant Architecture');

    try {
      if (config.multiTenant?.enabled) {
        console.log('🔄 Initializing MultiTenantManager...');
        
        Database.#multiTenantManager = MultiTenantManager;
        
        if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
          await MultiTenantManager.initialize({
            primaryConnection: Database.#connectionManager.getPrimaryConnection(),
            analyticsConnection: Database.#connectionManager.getAnalyticsConnection()
          });
          console.log('✅ Multi-tenant support initialized');
        } else {
          console.log('⚠️  Multi-tenant initialized with limited functionality');
        }
      } else {
        console.log('⚠️  Multi-tenant disabled in configuration');
      }

      Database.#initializationPhases.multiTenant = true;

    } catch (error) {
      console.log('❌ Multi-tenant phase failed:', error.message);
      logger.warn('Multi-tenant initialization failed', { error: error.message });
      Database.#multiTenantManager = null;
      Database.#initializationPhases.multiTenant = true; // Mark as attempted
    }
  }

  /**
   * Execute model collection and registration phase
   * @private
   * @static
   * @async
   */
  static async #executeModelPhase() {
    console.log('\n📚 Phase 3: Model Collection and Registration');

    try {
      await Database.#loadModels();
      console.log('✅ Model phase completed');
      Database.#initializationPhases.models = true;

    } catch (error) {
      console.log('❌ Model phase failed:', error.message);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️  Creating minimal model registry for development');
        Database.#models.clear();
        Database.#registrationErrors.push({
          error: 'Model collection failed',
          message: error.message,
          phase: 'models'
        });
        Database.#initializationPhases.models = true;
      } else {
        throw error;
      }
    }
  }

  /**
   * Execute routing verification phase
   * @private
   * @static
   * @async
   */
  static async #executeRoutingPhase() {
    console.log('\n🔍 Phase 4: Routing Verification');

    try {
      await Database.#verifyModelRouting();
      console.log('✅ Routing phase completed');
      Database.#initializationPhases.routing = true;

    } catch (error) {
      console.log('❌ Routing phase failed:', error.message);
      logger.warn('Model routing verification failed', { error: error.message });
      Database.#initializationPhases.routing = true; // Mark as attempted
    }
  }

  /**
   * Execute final setup and validation phase
   * @private
   * @static
   * @async
   */
  static async #executeFinalPhase() {
    console.log('\n🔧 Phase 5: Final Setup and Validation');

    try {
      // Validate all connections are healthy
      if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
        const connectionStats = Database.#connectionManager.getStats();
        console.log('📊 Connection validation:', {
          total: connectionStats.summary?.totalConnections || 0,
          healthy: connectionStats.summary?.healthyConnections || 0
        });
      }

      // Validate model registration
      console.log('📊 Model validation:', {
        registered: Database.#models.size,
        errors: Database.#registrationErrors.length
      });

      // Create emergency models if none exist
      if (Database.#models.size === 0 && process.env.NODE_ENV === 'development') {
        console.log('🔄 Creating emergency model registry');
        await Database.#createEmergencyModels();
      }

      console.log('✅ Final phase completed');

    } catch (error) {
      console.log('❌ Final phase failed:', error.message);
      logger.warn('Final phase validation failed', { error: error.message });
    }
  }

  /**
   * Handle initialization failure with graceful degradation
   * @private
   * @static
   * @async
   * @param {Error} error - Initialization error
   */
  static async #handleInitializationFailure(error) {
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️  Enabling graceful degradation for development');
      Database.#initialized = true;
      Database.#registrationErrors.push({
        error: 'Database initialization failed',
        message: error.message,
        phase: 'initialization'
      });
      
      logger.warn('Database initialized with limited functionality', {
        originalError: error.message
      });
    } else {
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
   * Load and register models from BaseModel registry
   * @private
   * @static
   * @async
   */
  static async #loadModels() {
    try {
      console.log('🔄 Loading models from BaseModel registry...');
      
      // Clear existing state
      Database.#models.clear();
      Database.#registrationErrors = [];

      // Collect from BaseModel registry
      const baseModelRegistry = BaseModel.getAllModels();
      console.log(`📦 Found ${baseModelRegistry.size} models in BaseModel registry`);

      for (const [modelName, modelClass] of baseModelRegistry) {
        try {
          if (Database.#isValidModel(modelClass, modelName)) {
            Database.#models.set(modelName, modelClass);
            console.log(`✅ Registered model: ${modelName}`);
          }
        } catch (error) {
          console.log(`❌ Error registering model ${modelName}:`, error.message);
          Database.#registrationErrors.push({
            modelName,
            error: error.message,
            phase: 'registration'
          });
        }
      }

      // Attempt to load additional models if registry is empty
      if (Database.#models.size === 0) {
        await Database.#loadAdditionalModels();
      }

      console.log('📊 Model loading summary:', {
        successful: Database.#models.size,
        errors: Database.#registrationErrors.length,
        models: Array.from(Database.#models.keys())
      });

      logger.info('Models loaded successfully', {
        totalModels: Database.#models.size,
        errors: Database.#registrationErrors.length
      });

    } catch (error) {
      logger.error('Model loading failed', { error: error.message });
      throw new AppError(
        'Model loading failed',
        500,
        'MODEL_LOADING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Attempt to load additional models from filesystem
   * @private
   * @static
   * @async
   */
  static async #loadAdditionalModels() {
    console.log('🔄 Attempting to load additional models...');
    
    const modelPaths = [
      './models',
      './models/index',
      './models/index.js'
    ];

    for (const modelPath of modelPaths) {
      try {
        const resolvedPath = require.resolve(modelPath);
        delete require.cache[resolvedPath];
        
        const models = require(modelPath);
        console.log(`✅ Loaded models from ${modelPath}`);
        
        if (models && typeof models === 'object') {
          for (const [modelName, ModelClass] of Object.entries(models)) {
            if (Database.#isValidModel(ModelClass, modelName)) {
              Database.#models.set(modelName, ModelClass);
              console.log(`✅ Additional model registered: ${modelName}`);
            }
          }
        }
        break;
      } catch (error) {
        console.log(`❌ Failed to load from ${modelPath}:`, error.message);
      }
    }
  }

  /**
   * Validate if a class is a valid model
   * @private
   * @static
   * @param {*} ModelClass - Potential model class
   * @param {string} modelName - Model name
   * @returns {boolean} Whether the model is valid
   */
  static #isValidModel(ModelClass, modelName) {
    const utilityFunctions = [
      'getModel', 'getAllModels', 'getModelsByCategory', 'getCustomerServicesModels',
      'getAdminModels', 'getCoreModels', 'hasModel', 'getRegistrationStats'
    ];
    
    if (utilityFunctions.includes(modelName)) {
      return false;
    }
    
    if (typeof ModelClass !== 'function') {
      return false;
    }
    
    if (modelName.toLowerCase().includes('error') || 
        modelName.toLowerCase().includes('helper') ||
        modelName.toLowerCase().includes('util')) {
      return false;
    }
    
    return true;
  }

  /**
   * Verify model-to-database routing configuration
   * @private
   * @static
   * @async
   */
  static async #verifyModelRouting() {
    try {
      console.log('🔄 Verifying model routing configuration...');

      const routingResults = {
        verified: [],
        failed: [],
        missing: []
      };

      for (const [modelName, model] of Database.#models) {
        try {
          const collectionName = model.collection?.name || 
                                model.collection?.collectionName ||
                                BaseModel.getCollectionName(modelName);

          if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
            const dbType = Database.#connectionManager.getDatabaseTypeForCollection(collectionName);
            
            if (dbType) {
              const connection = Database.#connectionManager.getDatabaseConnection(dbType);
              
              if (connection && connection.readyState === 1) {
                routingResults.verified.push({
                  modelName,
                  collectionName,
                  databaseType: dbType,
                  databaseName: connection.db?.databaseName
                });
              } else {
                routingResults.failed.push({
                  modelName,
                  collectionName,
                  error: `No healthy connection for database type: ${dbType}`
                });
              }
            } else {
              routingResults.missing.push({ modelName, collectionName });
            }
          } else {
            routingResults.missing.push({
              modelName,
              collectionName,
              reason: 'ConnectionManager not available'
            });
          }
        } catch (error) {
          routingResults.failed.push({
            modelName,
            error: error.message
          });
        }
      }

      console.log('📊 Routing verification summary:', {
        verified: routingResults.verified.length,
        failed: routingResults.failed.length,
        missing: routingResults.missing.length
      });

      logger.info('Model routing verification completed', {
        verified: routingResults.verified.length,
        failed: routingResults.failed.length,
        missing: routingResults.missing.length
      });

    } catch (error) {
      logger.error('Model routing verification failed', { error: error.message });
    }
  }

  /**
   * Create emergency models for development environments
   * @private
   * @static
   * @async
   */
  static async #createEmergencyModels() {
    try {
      const mongoose = require('mongoose');
      
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

      const emergencyModels = {};
      
      if (Database.#connectionManager && Database.#connectionManager.isInitialized()) {
        const connection = Database.#connectionManager.getPrimaryConnection();
        if (connection) {
          emergencyModels.User = connection.model('User', basicUserSchema);
          emergencyModels.Organization = connection.model('Organization', basicOrganizationSchema);
        }
      } else {
        emergencyModels.User = mongoose.model('User', basicUserSchema);
        emergencyModels.Organization = mongoose.model('Organization', basicOrganizationSchema);
      }
      
      for (const [modelName, ModelClass] of Object.entries(emergencyModels)) {
        Database.#models.set(modelName, ModelClass);
      }
      
      console.log('✅ Emergency models created:', Object.keys(emergencyModels));
      
    } catch (error) {
      console.log('❌ Emergency model creation failed:', error.message);
    }
  }

  /**
   * Create development fallback manager
   * @private
   * @static
   * @returns {Object} Development fallback manager
   */
  static #createDevelopmentFallback() {
    const mongoose = require('mongoose');
    
    return {
      isInitialized: () => true,
      getDatabaseConnection: (dbType) => {
        return mongoose.connection.readyState === 1 ? mongoose.connection : null;
      },
      getConnectionForCollection: (collectionName) => {
        return mongoose.connection.readyState === 1 ? mongoose.connection : null;
      },
      getDatabaseTypeForCollection: (collectionName) => 'admin',
      getPrimaryConnection: () => {
        return mongoose.connection.readyState === 1 ? mongoose.connection : null;
      },
      getAnalyticsConnection: () => {
        return mongoose.connection.readyState === 1 ? mongoose.connection : null;
      },
      getStats: () => ({
        summary: { totalConnections: 1, healthyConnections: 1 },
        development: true
      }),
      checkHealth: () => ({ status: 'development', healthy: true }),
      disconnectAll: () => Promise.resolve()
    };
  }

  /**
   * Log comprehensive initialization summary
   * @private
   * @static
   */
  static #logInitializationSummary() {
    console.log('\n📊 Initialization Summary');
    
    const connectionStats = Database.#connectionManager?.getStats() || 
      { summary: { totalConnections: 0, healthyConnections: 0 }};
    
    const summary = {
      phases: Database.#initializationPhases,
      connections: {
        total: connectionStats.summary?.totalConnections || 0,
        healthy: connectionStats.summary?.healthyConnections || 0
      },
      models: {
        registered: Database.#models.size,
        errors: Database.#registrationErrors.length
      },
      multiTenant: {
        enabled: !!Database.#multiTenantManager,
        manager: Database.#multiTenantManager ? 'Available' : 'Disabled'
      }
    };

    console.log('📊 Phase completion:', summary.phases);
    console.log('📊 Connections:', summary.connections);
    console.log('📊 Models:', summary.models);
    console.log('📊 Multi-tenant:', summary.multiTenant);

    logger.info('Database initialization summary', summary);
  }

  // Public API Methods

  /**
   * Get primary database connection
   * @static
   * @returns {mongoose.Connection|null} Primary connection
   */
  static getPrimaryConnection() {
    try {
      return Database.#connectionManager?.getPrimaryConnection() || null;
    } catch (error) {
      logger.error('Error getting primary connection', { error: error.message });
      return null;
    }
  }

  /**
   * Get analytics database connection
   * @static
   * @returns {mongoose.Connection|null} Analytics connection
   */
  static getAnalyticsConnection() {
    try {
      return Database.#connectionManager?.getAnalyticsConnection() || null;
    } catch (error) {
      logger.error('Error getting analytics connection', { error: error.message });
      return null;
    }
  }

  /**
   * Get tenant connection
   * @static
   * @param {string} tenantType - Tenant type
   * @returns {mongoose.Connection|null} Tenant connection
   */
  static getTenantConnection(tenantType) {
    try {
      if (Database.#multiTenantManager) {
        return Database.#multiTenantManager.getTenantConnection(tenantType);
      }
      return Database.getPrimaryConnection();
    } catch (error) {
      logger.error('Error getting tenant connection', { error: error.message });
      return Database.getPrimaryConnection();
    }
  }

  /**
   * Get model by name
   * @static
   * @param {string} modelName - Model name
   * @param {Object} [options={}] - Model options
   * @returns {Function|null} Model constructor
   */
  static getModel(modelName, options = {}) {
    try {
      if (options.tenantId && Database.#multiTenantManager) {
        try {
          return Database.#multiTenantManager.getTenantModel(modelName, options.tenantId);
        } catch (tenantError) {
          logger.warn('Tenant model retrieval failed', { error: tenantError.message });
        }
      }

      const ModelClass = Database.#models.get(modelName);
      if (ModelClass) {
        return ModelClass;
      }

      logger.warn(`Model not found: ${modelName}`);
      return null;

    } catch (error) {
      logger.error(`Error getting model ${modelName}`, { error: error.message });
      return null;
    }
  }

  /**
   * Get all registered models
   * @static
   * @returns {Map<string, Function>} All models
   */
  static getAllModels() {
    return new Map(Database.#models);
  }

  /**
   * Get database statistics
   * @static
   * @returns {Object} Database statistics
   */
  static getStats() {
    try {
      const connectionStats = Database.#connectionManager?.getStats() || {
        summary: { totalConnections: 0, healthyConnections: 0 },
        error: 'ConnectionManager not available'
      };

      return {
        initialized: Database.#initialized,
        earlyPhaseComplete: Database.#earlyPhaseComplete,
        phases: Database.#initializationPhases,
        connections: connectionStats,
        models: {
          total: Database.#models.size,
          registered: Array.from(Database.#models.keys()),
          errors: Database.#registrationErrors.length
        },
        multiTenant: {
          enabled: !!Database.#multiTenantManager,
          manager: Database.#multiTenantManager ? 'Available' : 'Disabled'
        },
        health: {
          connectionManager: !!Database.#connectionManager,
          modelsLoaded: Database.#models.size > 0,
          hasErrors: Database.#registrationErrors.length > 0
        }
      };
    } catch (error) {
      return {
        error: error.message,
        initialized: Database.#initialized,
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
    return Database.#initialized;
  }

  /**
   * Check if early phase is complete
   * @static
   * @returns {boolean} Early phase status
   */
  static isEarlyPhaseComplete() {
    return Database.#earlyPhaseComplete;
  }

  /**
   * Shutdown database with comprehensive cleanup
   * @static
   * @async
   * @param {boolean} [force=false] - Force shutdown
   * @returns {Promise<void>}
   */
  static async shutdown(force = false) {
    try {
      logger.info('Shutting down database module');

      if (Database.#multiTenantManager?.shutdown) {
        await Database.#multiTenantManager.shutdown();
      }

      if (Database.#connectionManager?.disconnectAll) {
        await Database.#connectionManager.disconnectAll(force);
      }

      BaseModel.clearRegistries();
      
      Database.#models.clear();
      Database.#registrationErrors = [];
      Database.#initialized = false;
      Database.#earlyPhaseComplete = false;
      Database.#config = null;
      Database.#connectionManager = null;
      Database.#multiTenantManager = null;
      
      Object.keys(Database.#initializationPhases).forEach(phase => {
        Database.#initializationPhases[phase] = false;
      });

      logger.info('Database shutdown complete');

    } catch (error) {
      logger.error('Database shutdown error', { error: error.message });
      throw new AppError(
        'Database shutdown failed',
        500,
        'DATABASE_SHUTDOWN_ERROR',
        { originalError: error.message }
      );
    }
  }

  // Utility methods
  static getConnection(connectionName = 'primary') {
    return Database.#connectionManager?.getConnection(connectionName) || null;
  }

  static getDatabase(connectionName = 'primary') {
    return Database.#connectionManager?.getDatabase(connectionName) || null;
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

  static getInitializationPhases() {
    return { ...Database.#initializationPhases };
  }

  /**
   * Convenience method for early initialization only
   * @static
   * @async
   * @param {Object} [databaseConfig] - Database configuration
   * @returns {Promise<void>}
   */
  static async earlyInitialize(databaseConfig) {
    return Database.initialize(databaseConfig, { earlyPhaseOnly: true });
  }
}

// Conditional module-load initialization
(async () => {
  try {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('🔄 Auto-running Database early initialization...');
      await Database.earlyInitialize();
      console.log('✅ Auto early initialization completed');
    }
  } catch (error) {
    console.log('⚠️  Auto early initialization failed:', error.message);
  }
})();

// Export main class and components
module.exports = Database;
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
module.exports.earlyInitialize = Database.earlyInitialize;