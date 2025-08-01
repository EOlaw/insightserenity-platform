'use strict';

/**
 * @fileoverview Database module main exports
 * @module shared/lib/database
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/multi-tenant-manager
 * @requires module:shared/lib/database/query-builder
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/database/seeders/seed-manager
 * @requires module:shared/lib/database/migrations/migration-runner
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config
 */

const ConnectionManager = require('./connection-manager');
const MultiTenantManager = require('./multi-tenant-manager');
const QueryBuilder = require('./query-builder');
const TransactionManager = require('./transaction-manager');
const BaseModel = require('./models/base-model');
const SeedManager = require('./seeders/seed-manager');
const MigrationRunner = require('./migrations/migration-runner');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const config = require('../../config');

/**
 * @class Database
 * @description Main database module providing unified access to all database functionality
 */
class Database {
  /**
   * @private
   * @static
   */
  static #initialized = false;
  static #connectionManager = null;
  static #multiTenantManager = null;
  static #transactionManager = null;
  static #seedManager = null;
  static #migrationRunner = null;
  static #models = new Map();
  static #schemas = new Map();

  /**
   * Initializes the database module
   * @static
   * @async
   * @param {Object} [options={}] - Initialization options
   * @param {Object} [options.connection] - Connection options
   * @param {Object} [options.multiTenant] - Multi-tenant options
   * @param {Object} [options.transaction] - Transaction options
   * @param {Object} [options.seed] - Seed options
   * @param {Object} [options.migration] - Migration options
   * @param {boolean} [options.runMigrations=true] - Auto-run migrations
   * @param {boolean} [options.runSeeds=false] - Auto-run seeds
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(options = {}) {
    try {
      if (Database.#initialized) {
        logger.warn('Database already initialized');
        return;
      }

      const {
        connection = {},
        multiTenant = {},
        transaction = {},
        seed = {},
        migration = {},
        runMigrations = true,
        runSeeds = false
      } = options;

      logger.info('Initializing database module');

      // Initialize connection manager
      const connectionOptions = {
        ...config.database,
        ...connection
      };

      await ConnectionManager.connect('default', connectionOptions);
      Database.#connectionManager = ConnectionManager;

      // Initialize multi-tenant manager
      if (config.database.multiTenant?.enabled) {
        await MultiTenantManager.initialize({
          ...config.database.multiTenant,
          ...multiTenant
        });
        Database.#multiTenantManager = MultiTenantManager;
      }

      // Initialize transaction manager
      Database.#transactionManager = new TransactionManager({
        ...config.database.transaction,
        ...transaction
      });

      // Initialize base model
      BaseModel.initialize({
        auditService: options.auditService
      });

      // Initialize migration runner
      Database.#migrationRunner = new MigrationRunner({
        ...config.database.migration,
        ...migration,
        transactionManager: Database.#transactionManager
      });

      await Database.#migrationRunner.initialize();

      // Run migrations if enabled
      if (runMigrations) {
        const migrationResult = await Database.#migrationRunner.migrate();
        logger.info('Migrations completed', {
          successful: migrationResult.successful,
          failed: migrationResult.failed
        });
      }

      // Initialize seed manager
      Database.#seedManager = new SeedManager({
        ...config.database.seed,
        ...seed,
        transactionManager: Database.#transactionManager
      });

      await Database.#seedManager.initialize();

      // Run seeds if enabled
      if (runSeeds && config.env !== 'production') {
        const seedResult = await Database.#seedManager.seed({
          type: config.env
        });
        logger.info('Seeds completed', {
          successful: seedResult.successful,
          failed: seedResult.failed
        });
      }

      // Load models
      await Database.#loadModels();

      Database.#initialized = true;

      logger.info('Database module initialized successfully', {
        connection: connectionOptions.uri ? 'Connected' : 'Not configured',
        multiTenant: config.database.multiTenant?.enabled ? 'Enabled' : 'Disabled',
        modelsLoaded: Database.#models.size
      });

    } catch (error) {
      logger.error('Failed to initialize database module', error);

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
   * Shuts down the database module
   * @static
   * @async
   * @param {Object} [options={}] - Shutdown options
   * @returns {Promise<void>}
   */
  static async shutdown(options = {}) {
    try {
      const { force = false } = options;

      logger.info('Shutting down database module');

      // Clear model registry
      Database.#models.clear();
      Database.#schemas.clear();
      BaseModel.clearRegistry();

      // Close all connections
      await ConnectionManager.disconnectAll(force);

      // Cleanup managers
      if (Database.#multiTenantManager) {
        await MultiTenantManager.cleanup();
      }

      // Clear references
      Database.#connectionManager = null;
      Database.#multiTenantManager = null;
      Database.#transactionManager = null;
      Database.#seedManager = null;
      Database.#migrationRunner = null;
      Database.#initialized = false;

      logger.info('Database module shutdown complete');

    } catch (error) {
      logger.error('Failed to shutdown database module', error);

      throw new AppError(
        'Database shutdown failed',
        500,
        'DATABASE_SHUTDOWN_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets a database connection
   * @static
   * @param {string} [name='default'] - Connection name
   * @returns {Object|null} Database connection
   */
  static getConnection(name = 'default') {
    if (!Database.#initialized) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    return ConnectionManager.getConnection(name);
  }

  /**
   * Gets a model
   * @static
   * @param {string} modelName - Model name
   * @param {string} [tenantId] - Tenant ID for multi-tenant models
   * @returns {Object|null} Model instance
   */
  static async getModel(modelName, tenantId) {
    if (!Database.#initialized) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    // Check if multi-tenant
    if (tenantId && Database.#multiTenantManager) {
      const schema = Database.#schemas.get(modelName);
      
      if (!schema) {
        throw new AppError(`Model schema not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
      }

      return await MultiTenantManager.getTenantModel(tenantId, modelName, schema);
    }

    // Return standard model
    return Database.#models.get(modelName) || null;
  }

  /**
   * Creates a query builder
   * @static
   * @param {string} modelName - Model name
   * @param {Object} [options={}] - Query builder options
   * @returns {QueryBuilder} Query builder instance
   */
  static query(modelName, options = {}) {
    const model = Database.#models.get(modelName);
    
    if (!model) {
      throw new AppError(`Model not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
    }

    return new QueryBuilder(model, options);
  }

  /**
   * Executes a transaction
   * @static
   * @async
   * @param {Function} callback - Transaction callback
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<*>} Transaction result
   */
  static async transaction(callback, options = {}) {
    if (!Database.#initialized) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    return await Database.#transactionManager.withTransaction(callback, options);
  }

  /**
   * Gets tenant manager
   * @static
   * @returns {Object|null} Multi-tenant manager
   */
  static getTenantManager() {
    return Database.#multiTenantManager;
  }

  /**
   * Gets transaction manager
   * @static
   * @returns {Object} Transaction manager
   */
  static getTransactionManager() {
    return Database.#transactionManager;
  }

  /**
   * Gets seed manager
   * @static
   * @returns {Object} Seed manager
   */
  static getSeedManager() {
    return Database.#seedManager;
  }

  /**
   * Gets migration runner
   * @static
   * @returns {Object} Migration runner
   */
  static getMigrationRunner() {
    return Database.#migrationRunner;
  }

  /**
   * Runs migrations
   * @static
   * @async
   * @param {Object} [options={}] - Migration options
   * @returns {Promise<Object>} Migration result
   */
  static async migrate(options = {}) {
    if (!Database.#initialized) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    return await Database.#migrationRunner.migrate(options);
  }

  /**
   * Runs seeds
   * @static
   * @async
   * @param {Object} [options={}] - Seed options
   * @returns {Promise<Object>} Seed result
   */
  static async seed(options = {}) {
    if (!Database.#initialized) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    return await Database.#seedManager.seed(options);
  }

  /**
   * Gets database health status
   * @static
   * @async
   * @returns {Promise<Object>} Health status
   */
  static async getHealth() {
    try {
      const health = {
        status: 'healthy',
        initialized: Database.#initialized,
        connections: {},
        models: Database.#models.size,
        metrics: {}
      };

      if (!Database.#initialized) {
        health.status = 'not_initialized';
        return health;
      }

      // Check connections
      const connections = ConnectionManager.getAllConnections();
      
      for (const [name, connection] of connections) {
        const connectionHealth = await ConnectionManager.checkHealth(name);
        health.connections[name] = connectionHealth;
        
        if (!connectionHealth.healthy) {
          health.status = 'unhealthy';
        }
      }

      // Get transaction metrics
      if (Database.#transactionManager) {
        health.metrics.transactions = Database.#transactionManager.getMetrics();
      }

      // Get migration status
      if (Database.#migrationRunner) {
        health.metrics.migrations = await Database.#migrationRunner.status();
      }

      return health;

    } catch (error) {
      logger.error('Failed to get database health', error);

      return {
        status: 'error',
        error: error.message,
        initialized: Database.#initialized
      };
    }
  }

  /**
   * Registers a custom model
   * @static
   * @param {string} modelName - Model name
   * @param {Object} schema - Mongoose schema
   * @param {Object} [options={}] - Model options
   * @returns {Object} Registered model
   */
  static registerModel(modelName, schema, options = {}) {
    if (!Database.#initialized) {
      throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
    }

    // Store schema for multi-tenant use
    Database.#schemas.set(modelName, schema);

    // Create and register model
    const model = BaseModel.createModel(modelName, schema, options);
    Database.#models.set(modelName, model);

    logger.info('Model registered', { modelName });

    return model;
  }

  /**
   * @private
   * Loads built-in models
   * @static
   * @async
   */
  static async #loadModels() {
    try {
      // Load core models
      const models = [
        { name: 'User', module: require('./models/users/user-model') },
        // { name: 'Organization', module: require('../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model') },
        { name: 'Organization', module: require('./models/organizations/organization-model') },
        { name: 'Tenant', module: require('./models/organizations/tenant-model') },
        { name: 'Session', module: require('./models/session-model') },
        { name: 'AuditLog', module: require('./models/security/audit-log-model') },
        { name: 'Notification', module: require('./models/platform/notification-model') },
        { name: 'Webhook', module: require('./models/platform/webhook-model') }
      ];

      for (const { name, module } of models) {
        if (module.schema) {
          Database.#schemas.set(name, module.schema);
        }
        
        if (module.model) {
          Database.#models.set(name, module.model);
        }
      }

      logger.info('Built-in models loaded', {
        count: Database.#models.size
      });

    } catch (error) {
      logger.error('Failed to load models', error);
      // Continue without models - they can be registered later
    }
  }

  /**
   * Creates indexes for all models
   * @static
   * @async
   * @param {Object} [options={}] - Index creation options
   * @returns {Promise<Object>} Index creation result
   */
  static async createIndexes(options = {}) {
    try {
      const results = {
        successful: 0,
        failed: 0,
        models: []
      };

      for (const [modelName, model] of Database.#models) {
        try {
          await model.createIndexes();
          results.successful++;
          results.models.push({
            name: modelName,
            status: 'success'
          });
        } catch (error) {
          results.failed++;
          results.models.push({
            name: modelName,
            status: 'failed',
            error: error.message
          });
        }
      }

      logger.info('Index creation completed', results);

      return results;

    } catch (error) {
      logger.error('Failed to create indexes', error);

      throw new AppError(
        'Index creation failed',
        500,
        'INDEX_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates database configuration
   * @static
   * @async
   * @returns {Promise<Object>} Validation result
   */
  static async validate() {
    try {
      const validation = {
        valid: true,
        errors: [],
        warnings: []
      };

      // Check connection
      if (!Database.#initialized) {
        validation.valid = false;
        validation.errors.push('Database not initialized');
        return validation;
      }

      // Validate connections
      const connections = ConnectionManager.getAllConnections();
      
      if (connections.size === 0) {
        validation.valid = false;
        validation.errors.push('No database connections');
      }

      // Check connection health
      for (const [name] of connections) {
        const health = await ConnectionManager.checkHealth(name);
        
        if (!health.healthy) {
          validation.errors.push(`Connection '${name}' is unhealthy`);
          validation.valid = false;
        }
      }

      // Validate migrations
      if (Database.#migrationRunner) {
        const migrationValidation = await Database.#migrationRunner.validate();
        
        if (!migrationValidation.valid) {
          validation.errors.push(...migrationValidation.errors);
          validation.valid = false;
        }
        
        validation.warnings.push(...migrationValidation.warnings);
      }

      // Check model count
      if (Database.#models.size === 0) {
        validation.warnings.push('No models registered');
      }

      logger.info('Database validation completed', {
        valid: validation.valid,
        errors: validation.errors.length,
        warnings: validation.warnings.length
      });

      return validation;

    } catch (error) {
      logger.error('Failed to validate database', error);

      return {
        valid: false,
        errors: [error.message],
        warnings: []
      };
    }
  }
}

// Export main class and utilities
module.exports = Database;

// Export individual components for direct access
module.exports.ConnectionManager = ConnectionManager;
module.exports.MultiTenantManager = MultiTenantManager;
module.exports.QueryBuilder = QueryBuilder;
module.exports.TransactionManager = TransactionManager;
module.exports.BaseModel = BaseModel;
module.exports.SeedManager = SeedManager;
module.exports.MigrationRunner = MigrationRunner;

// Export convenience methods
module.exports.connect = Database.initialize;
module.exports.disconnect = Database.shutdown;
module.exports.getConnection = Database.getConnection;
module.exports.getModel = Database.getModel;
module.exports.query = Database.query;
module.exports.transaction = Database.transaction;