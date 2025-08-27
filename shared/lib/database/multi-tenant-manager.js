'use strict';

/**
 * @fileoverview Simplified multi-tenant manager for hybrid database architecture
 * @module shared/lib/database/multi-tenant-manager
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config/base-config
 */

const ConnectionManager = require('./connection-manager');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config/base-config');

/**
 * @class MultiTenantManager
 * @description Simplified multi-tenant manager supporting:
 * - Shared database with tenant isolation (most tenants)
 * - Dedicated databases for enterprise tenants
 * - Tenant-aware model operations
 */
class MultiTenantManager {
  
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   * @description Active tenant contexts
   */
  static #tenantContexts = new Map();

  /**
   * @private
   * @static
   * @type {Object}
   * @description Primary and analytics connections
   */
  static #connections = {
    primary: null,
    analytics: null
  };

  /**
   * @private
   * @static
   * @type {boolean}
   * @description Manager initialization status
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Tenant isolation strategies
   */
  static #ISOLATION_STRATEGIES = Object.freeze({
    SHARED: 'shared',           // Shared database with tenant field filtering
    DEDICATED: 'dedicated',     // Dedicated database per tenant
    HYBRID: 'hybrid'           // Shared for standard, dedicated for enterprise
  });

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Tenant types
   */
  static #TENANT_TYPES = Object.freeze({
    TRIAL: 'trial',
    STANDARD: 'standard',
    PREMIUM: 'premium',
    ENTERPRISE: 'enterprise'
  });

  /**
   * Initializes the multi-tenant manager
   * @static
   * @async
   * @param {Object} options - Initialization options
   * @param {mongoose.Connection} options.primaryConnection - Primary database connection
   * @param {mongoose.Connection} options.analyticsConnection - Analytics database connection
   * @returns {Promise<void>}
   */
  static async initialize(options = {}) {
    try {
      if (MultiTenantManager.#initialized) {
        logger.debug('Multi-tenant manager already initialized');
        return;
      }

      logger.info('Initializing simplified multi-tenant manager');

      MultiTenantManager.#connections.primary = options.primaryConnection;
      MultiTenantManager.#connections.analytics = options.analyticsConnection;

      if (!MultiTenantManager.#connections.primary) {
        throw new AppError(
          'Primary connection is required for multi-tenant manager',
          500,
          'PRIMARY_CONNECTION_REQUIRED'
        );
      }

      MultiTenantManager.#initialized = true;

      logger.info('Multi-tenant manager initialized successfully', {
        primaryConnection: 'Connected',
        analyticsConnection: MultiTenantManager.#connections.analytics ? 'Connected' : 'Using primary'
      });

    } catch (error) {
      logger.error('Failed to initialize multi-tenant manager', error);
      throw new AppError(
        'Multi-tenant manager initialization failed',
        500,
        'MULTI_TENANT_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a tenant context based on tenant configuration
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [tenantConfig={}] - Tenant configuration
   * @returns {Promise<Object>} Tenant context
   */
  static async createTenantContext(tenantId, tenantConfig = {}) {
    try {
      if (!MultiTenantManager.#initialized) {
        throw new AppError(
          'Multi-tenant manager not initialized',
          500,
          'MULTI_TENANT_NOT_INITIALIZED'
        );
      }

      // Return existing context if available
      if (MultiTenantManager.#tenantContexts.has(tenantId)) {
        return MultiTenantManager.#tenantContexts.get(tenantId);
      }

      logger.info('Creating tenant context', { tenantId, type: tenantConfig.type });

      const strategy = MultiTenantManager.#determineIsolationStrategy(tenantConfig);
      let context;

      switch (strategy) {
        case MultiTenantManager.#ISOLATION_STRATEGIES.SHARED:
          context = await MultiTenantManager.#createSharedContext(tenantId, tenantConfig);
          break;

        case MultiTenantManager.#ISOLATION_STRATEGIES.DEDICATED:
          context = await MultiTenantManager.#createDedicatedContext(tenantId, tenantConfig);
          break;

        case MultiTenantManager.#ISOLATION_STRATEGIES.HYBRID:
          context = await MultiTenantManager.#createHybridContext(tenantId, tenantConfig);
          break;

        default:
          throw new AppError(
            `Unsupported isolation strategy: ${strategy}`,
            400,
            'UNSUPPORTED_ISOLATION_STRATEGY'
          );
      }

      MultiTenantManager.#tenantContexts.set(tenantId, context);

      logger.info('Tenant context created successfully', {
        tenantId,
        strategy,
        type: tenantConfig.type
      });

      return context;

    } catch (error) {
      logger.error(`Failed to create tenant context for ${tenantId}:`, error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant context creation failed',
        500,
        'TENANT_CONTEXT_ERROR',
        { tenantId, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Determines the appropriate isolation strategy for a tenant
   * @static
   * @param {Object} tenantConfig - Tenant configuration
   * @returns {string} Isolation strategy
   */
  static #determineIsolationStrategy(tenantConfig) {
    const tenantType = tenantConfig.type || MultiTenantManager.#TENANT_TYPES.STANDARD;

    // Enterprise tenants get dedicated databases
    if (tenantType === MultiTenantManager.#TENANT_TYPES.ENTERPRISE) {
      return MultiTenantManager.#ISOLATION_STRATEGIES.DEDICATED;
    }

    // All other tenants share the primary database with tenant isolation
    return MultiTenantManager.#ISOLATION_STRATEGIES.SHARED;
  }

  /**
   * @private
   * Creates a shared tenant context
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} tenantConfig - Tenant configuration
   * @returns {Promise<Object>} Shared tenant context
   */
  static async #createSharedContext(tenantId, tenantConfig) {
    return {
      tenantId,
      strategy: MultiTenantManager.#ISOLATION_STRATEGIES.SHARED,
      connection: MultiTenantManager.#connections.primary,
      analyticsConnection: MultiTenantManager.#connections.analytics || 
                          MultiTenantManager.#connections.primary,
      configuration: tenantConfig,
      isolated: false,
      filters: {
        tenantId: tenantId
      }
    };
  }

  /**
   * @private
   * Creates a dedicated tenant context
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} tenantConfig - Tenant configuration
   * @returns {Promise<Object>} Dedicated tenant context
   */
  static async #createDedicatedContext(tenantId, tenantConfig) {
    // Create dedicated connection for this tenant
    const dedicatedConnection = await ConnectionManager.createTenantConnection(tenantId, {
      maxPoolSize: tenantConfig.maxConnections || 10,
      minPoolSize: tenantConfig.minConnections || 2
    });

    return {
      tenantId,
      strategy: MultiTenantManager.#ISOLATION_STRATEGIES.DEDICATED,
      connection: dedicatedConnection,
      analyticsConnection: MultiTenantManager.#connections.analytics || dedicatedConnection,
      configuration: tenantConfig,
      isolated: true,
      filters: {}
    };
  }

  /**
   * @private
   * Creates a hybrid tenant context
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} tenantConfig - Tenant configuration
   * @returns {Promise<Object>} Hybrid tenant context
   */
  static async #createHybridContext(tenantId, tenantConfig) {
    // For now, hybrid is same as shared, but could be extended
    return MultiTenantManager.#createSharedContext(tenantId, tenantConfig);
  }

  /**
   * Gets a tenant context by ID
   * @static
   * @param {string} tenantId - Tenant identifier
   * @returns {Object|null} Tenant context or null
   */
  static getTenantContext(tenantId) {
    return MultiTenantManager.#tenantContexts.get(tenantId) || null;
  }

  /**
   * Gets a tenant-aware model instance
   * @static
   * @param {string} modelName - Model name
   * @param {string} tenantId - Tenant identifier
   * @returns {Function|null} Tenant-aware model or null
   */
  static getTenantModel(modelName, tenantId) {
    try {
      const context = MultiTenantManager.getTenantContext(tenantId);
      if (!context) {
        logger.warn(`Tenant context not found: ${tenantId}`);
        return null;
      }

      const connection = MultiTenantManager.#isAnalyticsModel(modelName) ? 
        context.analyticsConnection : context.connection;

      if (!connection) {
        logger.warn(`No connection available for model ${modelName} and tenant ${tenantId}`);
        return null;
      }

      // For shared databases, we need to add tenant filtering
      if (context.strategy === MultiTenantManager.#ISOLATION_STRATEGIES.SHARED) {
        return MultiTenantManager.#createTenantAwareModel(modelName, connection, tenantId);
      }

      // For dedicated databases, use the model directly
      try {
        return connection.model(modelName);
      } catch (error) {
        // Model might not exist on this connection yet
        logger.debug(`Model ${modelName} not found on tenant connection, will need to be created`);
        return null;
      }

    } catch (error) {
      logger.error(`Error getting tenant model ${modelName} for tenant ${tenantId}:`, error);
      return null;
    }
  }

  /**
   * @private
   * Creates a tenant-aware model with automatic filtering
   * @static
   * @param {string} modelName - Model name
   * @param {mongoose.Connection} connection - Database connection
   * @param {string} tenantId - Tenant identifier
   * @returns {Function|null} Tenant-aware model
   */
  static #createTenantAwareModel(modelName, connection, tenantId) {
    try {
      const Model = connection.model(modelName);
      
      if (!Model) {
        return null;
      }

      // Create a wrapper that automatically adds tenant filtering
      class TenantAwareModel extends Model {
        constructor(doc) {
          super(doc);
          this.tenantId = tenantId;
        }

        static find(filter = {}, ...args) {
          return super.find({ ...filter, tenantId }, ...args);
        }

        static findOne(filter = {}, ...args) {
          return super.findOne({ ...filter, tenantId }, ...args);
        }

        static findById(id, ...args) {
          return super.findById(id, ...args).where({ tenantId });
        }

        static updateOne(filter = {}, ...args) {
          return super.updateOne({ ...filter, tenantId }, ...args);
        }

        static updateMany(filter = {}, ...args) {
          return super.updateMany({ ...filter, tenantId }, ...args);
        }

        static deleteOne(filter = {}, ...args) {
          return super.deleteOne({ ...filter, tenantId }, ...args);
        }

        static deleteMany(filter = {}, ...args) {
          return super.deleteMany({ ...filter, tenantId }, ...args);
        }

        static countDocuments(filter = {}, ...args) {
          return super.countDocuments({ ...filter, tenantId }, ...args);
        }
      }

      // Copy static methods and properties
      Object.setPrototypeOf(TenantAwareModel, Model);
      TenantAwareModel.modelName = Model.modelName;
      TenantAwareModel.schema = Model.schema;
      TenantAwareModel.collection = Model.collection;

      return TenantAwareModel;

    } catch (error) {
      logger.error(`Failed to create tenant-aware model ${modelName}:`, error);
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
      'Analytics', 'Metrics', 'Event', 'Usage', 'Performance',
      'Tracking', 'Statistics', 'TimeSeries'
    ];
    
    return analyticsModels.some(pattern => 
      modelName.includes(pattern) || modelName.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Gets all active tenant IDs
   * @static
   * @returns {Array<string>} Array of active tenant IDs
   */
  static getActiveTenants() {
    return Array.from(MultiTenantManager.#tenantContexts.keys());
  }

  /**
   * Removes a tenant context
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<void>}
   */
  static async removeTenantContext(tenantId) {
    try {
      const context = MultiTenantManager.#tenantContexts.get(tenantId);
      
      if (!context) {
        logger.debug(`Tenant context not found: ${tenantId}`);
        return;
      }

      // Close dedicated connection if it exists
      if (context.strategy === MultiTenantManager.#ISOLATION_STRATEGIES.DEDICATED) {
        const tenantConnection = ConnectionManager.getTenantConnection(tenantId);
        if (tenantConnection) {
          await tenantConnection.close();
        }
      }

      MultiTenantManager.#tenantContexts.delete(tenantId);
      
      logger.info('Tenant context removed', { tenantId });

    } catch (error) {
      logger.error(`Failed to remove tenant context ${tenantId}:`, error);
      throw new AppError(
        'Tenant context removal failed',
        500,
        'TENANT_CONTEXT_REMOVAL_ERROR',
        { tenantId, originalError: error.message }
      );
    }
  }

  /**
   * Gets multi-tenant manager statistics
   * @static
   * @returns {Object} Manager statistics
   */
  static getStats() {
    const contexts = Array.from(MultiTenantManager.#tenantContexts.values());
    
    return {
      initialized: MultiTenantManager.#initialized,
      totalTenants: contexts.length,
      strategies: {
        shared: contexts.filter(c => c.strategy === MultiTenantManager.#ISOLATION_STRATEGIES.SHARED).length,
        dedicated: contexts.filter(c => c.strategy === MultiTenantManager.#ISOLATION_STRATEGIES.DEDICATED).length,
        hybrid: contexts.filter(c => c.strategy === MultiTenantManager.#ISOLATION_STRATEGIES.HYBRID).length
      },
      tenantTypes: {
        trial: contexts.filter(c => c.configuration?.type === MultiTenantManager.#TENANT_TYPES.TRIAL).length,
        standard: contexts.filter(c => c.configuration?.type === MultiTenantManager.#TENANT_TYPES.STANDARD).length,
        premium: contexts.filter(c => c.configuration?.type === MultiTenantManager.#TENANT_TYPES.PREMIUM).length,
        enterprise: contexts.filter(c => c.configuration?.type === MultiTenantManager.#TENANT_TYPES.ENTERPRISE).length
      }
    };
  }

  /**
   * Shuts down the multi-tenant manager
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async shutdown() {
    try {
      logger.info('Shutting down multi-tenant manager');

      // Remove all tenant contexts
      const tenantIds = Array.from(MultiTenantManager.#tenantContexts.keys());
      await Promise.all(
        tenantIds.map(tenantId => MultiTenantManager.removeTenantContext(tenantId))
      );

      MultiTenantManager.#tenantContexts.clear();
      MultiTenantManager.#connections.primary = null;
      MultiTenantManager.#connections.analytics = null;
      MultiTenantManager.#initialized = false;

      logger.info('Multi-tenant manager shutdown complete');

    } catch (error) {
      logger.error('Error during multi-tenant manager shutdown', error);
      throw new AppError(
        'Multi-tenant manager shutdown failed',
        500,
        'MULTI_TENANT_SHUTDOWN_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if the manager is initialized
   * @static
   * @returns {boolean} Initialization status
   */
  static isInitialized() {
    return MultiTenantManager.#initialized;
  }
}

module.exports = MultiTenantManager;