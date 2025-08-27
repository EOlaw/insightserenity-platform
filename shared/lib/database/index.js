'use strict';

/**
 * @fileoverview Simplified database module for hybrid architecture
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
 * @description Simplified database module supporting hybrid architecture
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
   * Initializes the simplified hybrid database architecture
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
        logger.debug('Database already initialized');
        return;
      }

      logger.info('Initializing simplified hybrid database architecture');

      Database.#config = databaseConfig;

      // Initialize connection manager
      Database.#connectionManager = ConnectionManager;
      await ConnectionManager.initialize(databaseConfig, options);

      // Initialize multi-tenant support if enabled
      if (config.multiTenant?.enabled) {
        Database.#multiTenantManager = MultiTenantManager;
        await MultiTenantManager.initialize({
          primaryConnection: ConnectionManager.getPrimaryConnection(),
          analyticsConnection: ConnectionManager.getAnalyticsConnection()
        });
        logger.info('Multi-tenant support initialized');
      }

      // Load and register models
      await Database.#loadModels();

      Database.#initialized = true;

      logger.info('Database architecture initialized successfully', {
        primaryConnection: 'Connected',
        analyticsConnection: ConnectionManager.getAnalyticsConnection() ? 'Connected' : 'Using primary',
        multiTenant: config.multiTenant?.enabled ? 'Enabled' : 'Disabled',
        modelsLoaded: Database.#models.size,
        registrationErrors: Database.#registrationErrors.length
      });

    } catch (error) {
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
   * Loads all models from the models directory
   * @static
   * @async
   */
  static async #loadModels() {
    try {
      logger.info('Loading database models');

      // Load models from index file
      const models = require('./models');
      
      if (models && typeof models === 'object') {
        for (const [modelName, ModelClass] of Object.entries(models)) {
          try {
            if (ModelClass && typeof ModelClass === 'function') {
              Database.#models.set(modelName, ModelClass);
              logger.debug(`Model registered: ${modelName}`);
            }
          } catch (error) {
            Database.#registrationErrors.push({
              modelName,
              error: error.message,
              path: './models'
            });
            logger.warn(`Failed to register model ${modelName}:`, error.message);
          }
        }
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
   * Gets the primary database connection for core business data
   * @static
   * @returns {mongoose.Connection|null} Primary connection
   */
  static getPrimaryConnection() {
    return Database.#connectionManager ? 
      ConnectionManager.getPrimaryConnection() : null;
  }

  /**
   * Gets the analytics database connection for time-series data
   * @static
   * @returns {mongoose.Connection|null} Analytics connection
   */
  static getAnalyticsConnection() {
    return Database.#connectionManager ? 
      ConnectionManager.getAnalyticsConnection() : null;
  }

  /**
   * Gets a specific connection by name
   * @static
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {mongoose.Connection|null} Database connection
   */
  static getConnection(connectionName = 'primary') {
    return Database.#connectionManager ? 
      ConnectionManager.getConnection(connectionName) : null;
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
      // For tenant-specific models
      if (options.tenantId && Database.#multiTenantManager) {
        return MultiTenantManager.getTenantModel(modelName, options.tenantId);
      }

      // For analytics models, route to analytics connection
      if (Database.#isAnalyticsModel(modelName)) {
        const analyticsConnection = Database.getAnalyticsConnection();
        if (analyticsConnection && analyticsConnection !== Database.getPrimaryConnection()) {
          const ModelClass = Database.#models.get(modelName);
          if (ModelClass && ModelClass.schema) {
            try {
              return analyticsConnection.model(modelName, ModelClass.schema);
            } catch (error) {
              logger.debug(`Analytics model creation failed, using primary: ${modelName}`, error.message);
            }
          }
        }
      }

      // Default to registered models (using primary connection)
      const ModelClass = Database.#models.get(modelName);
      if (ModelClass) {
        return ModelClass;
      }

      logger.warn(`Model not found: ${modelName}`);
      return null;

    } catch (error) {
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
    
    return analyticsModels.some(pattern => 
      modelName.includes(pattern) || modelName.toLowerCase().includes(pattern.toLowerCase())
    );
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
    if (!Database.#connectionManager) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }
    
    return ConnectionManager.createTenantConnection(tenantId, options);
  }

  /**
   * Gets a tenant connection
   * @static
   * @param {string} tenantId - Tenant identifier
   * @returns {mongoose.Connection|null} Tenant connection
   */
  static getTenantConnection(tenantId) {
    return Database.#connectionManager ? 
      ConnectionManager.getTenantConnection(tenantId) : null;
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
    if (!Database.#connectionManager) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    return ConnectionManager.executeTransaction(callback, options);
  }

  /**
   * Executes a query builder pattern
   * @static
   * @param {string} modelName - Model name
   * @returns {Object} Query builder instance
   */
  static query(modelName) {
    const Model = Database.getModel(modelName);
    if (!Model) {
      throw new AppError(`Model not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
    }
    return Model.find(); // Returns Mongoose query which supports chaining
  }

  /**
   * Gets database instance
   * @static
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {mongoose.Db|null} Database instance
   */
  static getDatabase(connectionName = 'primary') {
    return Database.#connectionManager ? 
      ConnectionManager.getDatabase(connectionName) : null;
  }

  /**
   * Checks database health
   * @static
   * @async
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {Promise<Object>} Health status
   */
  static async checkHealth(connectionName = 'primary') {
    if (!Database.#connectionManager) {
      return { status: 'not_initialized', message: 'Database not initialized' };
    }

    return ConnectionManager.checkHealth(connectionName);
  }

  /**
   * Gets comprehensive database statistics
   * @static
   * @returns {Object} Database statistics
   */
  static getStats() {
    if (!Database.#connectionManager) {
      return { status: 'not_initialized' };
    }

    return {
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
      }
    };
  }

  /**
   * Reloads all models (for development/testing)
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async reloadModels() {
    logger.info('Reloading database models');
    
    Database.#models.clear();
    Database.#registrationErrors = [];
    
    // Clear require cache for models
    const modelPath = require.resolve('./models');
    delete require.cache[modelPath];
    
    await Database.#loadModels();
    
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
    return new Map(Database.#models);
  }

  /**
   * Gets model registration errors
   * @static
   * @returns {Array<Object>} Registration errors
   */
  static getRegistrationErrors() {
    return [...Database.#registrationErrors];
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
      logger.info('Shutting down database module');

      if (Database.#multiTenantManager) {
        await MultiTenantManager.shutdown();
        Database.#multiTenantManager = null;
      }

      if (Database.#connectionManager) {
        await ConnectionManager.disconnectAll(force);
        Database.#connectionManager = null;
      }

      Database.#models.clear();
      Database.#registrationErrors = [];
      Database.#initialized = false;
      Database.#config = null;

      logger.info('Database module shutdown complete');

    } catch (error) {
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
    return Database.#initialized;
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