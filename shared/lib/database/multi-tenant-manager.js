'use strict';

/**
 * @fileoverview Multi-tenant database management with dynamic tenant resolution
 * @module shared/lib/database/multi-tenant-manager
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config
 */

const ConnectionManager = require('./connection-manager');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const config = require('../../config');

/**
 * @class MultiTenantManager
 * @description Manages multi-tenant database architecture with isolation strategies
 */
class MultiTenantManager {
  /**
   * @private
   * @static
   * @readonly
   */
  static #ISOLATION_STRATEGIES = {
    DATABASE: 'database-per-tenant',
    SCHEMA: 'schema-per-tenant',
    COLLECTION: 'shared-collection',
    HYBRID: 'hybrid-isolation'
  };

  static #TENANT_TYPES = {
    PREMIUM: 'premium',
    STANDARD: 'standard',
    TRIAL: 'trial',
    ENTERPRISE: 'enterprise'
  };

  static #CACHE_DURATION = 300000; // 5 minutes

  static #tenantConnections = new Map();
  static #tenantConfigurations = new Map();
  static #tenantCache = new Map();
  static #tenantModels = new Map();
  static #isolationStrategy = config.database?.multiTenant?.strategy || MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE;

  /**
   * Initializes multi-tenant manager
   * @static
   * @async
   * @param {Object} [options={}] - Initialization options
   * @param {string} [options.strategy] - Isolation strategy
   * @param {Object} [options.sharedConnection] - Shared connection options
   * @param {boolean} [options.enableCache=true] - Enable tenant caching
   * @param {number} [options.cacheDuration] - Cache duration in ms
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(options = {}) {
    try {
      const {
        strategy = MultiTenantManager.#isolationStrategy,
        sharedConnection = {},
        enableCache = true,
        cacheDuration = MultiTenantManager.#CACHE_DURATION
      } = options;

      // Validate strategy
      if (!Object.values(MultiTenantManager.#ISOLATION_STRATEGIES).includes(strategy)) {
        throw new AppError('Invalid isolation strategy', 400, 'INVALID_STRATEGY');
      }

      MultiTenantManager.#isolationStrategy = strategy;
      MultiTenantManager.#CACHE_DURATION = cacheDuration;

      // Initialize shared connection if needed
      if (strategy === MultiTenantManager.#ISOLATION_STRATEGIES.COLLECTION ||
          strategy === MultiTenantManager.#ISOLATION_STRATEGIES.SCHEMA) {
        await ConnectionManager.connect('shared', sharedConnection);
      }

      // Load tenant configurations if available
      await MultiTenantManager.#loadTenantConfigurations();

      logger.info('Multi-tenant manager initialized', {
        strategy,
        enableCache,
        cacheDuration
      });

    } catch (error) {
      logger.error('Failed to initialize multi-tenant manager', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Multi-tenant initialization failed',
        500,
        'INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets or creates tenant-specific database connection
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<Object>} Tenant database context
   * @throws {AppError} If tenant connection fails
   */
  static async getTenantConnection(tenantId, options = {}) {
    try {
      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
      }

      // Check cache first
      const cached = MultiTenantManager.#getCachedTenant(tenantId);
      if (cached && cached.connection) {
        return cached;
      }

      // Get tenant configuration
      const tenantConfig = await MultiTenantManager.#getTenantConfiguration(tenantId);
      
      if (!tenantConfig) {
        throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
      }

      // Create connection based on isolation strategy
      const context = await MultiTenantManager.#createTenantContext(
        tenantId,
        tenantConfig,
        options
      );

      // Cache the connection
      MultiTenantManager.#cacheTenant(tenantId, context);

      logger.info('Tenant connection established', {
        tenantId,
        strategy: MultiTenantManager.#isolationStrategy
      });

      return context;

    } catch (error) {
      logger.error('Failed to get tenant connection', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant connection failed',
        500,
        'TENANT_CONNECTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a new tenant
   * @static
   * @async
   * @param {Object} tenantData - Tenant information
   * @returns {Promise<Object>} Created tenant
   * @throws {AppError} If tenant creation fails
   */
  static async createTenant(tenantData) {
    try {
      const {
        tenantId,
        name,
        type = MultiTenantManager.#TENANT_TYPES.STANDARD,
        configuration = {},
        metadata = {}
      } = tenantData;

      if (!tenantId || !name) {
        throw new AppError('Tenant ID and name are required', 400, 'INVALID_TENANT_DATA');
      }

      // Check if tenant already exists
      const existing = MultiTenantManager.#tenantConfigurations.get(tenantId);
      if (existing) {
        throw new AppError('Tenant already exists', 409, 'TENANT_EXISTS');
      }

      const tenant = {
        tenantId,
        name,
        type,
        createdAt: new Date().toISOString(),
        status: 'active',
        configuration: {
          ...MultiTenantManager.#getDefaultConfiguration(type),
          ...configuration
        },
        metadata,
        isolationStrategy: MultiTenantManager.#isolationStrategy
      };

      // Create tenant resources based on strategy
      await MultiTenantManager.#provisionTenantResources(tenant);

      // Store configuration
      MultiTenantManager.#tenantConfigurations.set(tenantId, tenant);

      // Persist to database if available
      await MultiTenantManager.#persistTenantConfiguration(tenant);

      logger.info('Tenant created successfully', {
        tenantId,
        name,
        type
      });

      return tenant;

    } catch (error) {
      logger.error('Failed to create tenant', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant creation failed',
        500,
        'TENANT_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Updates tenant configuration
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} updates - Configuration updates
   * @returns {Promise<Object>} Updated tenant
   * @throws {AppError} If update fails
   */
  static async updateTenant(tenantId, updates) {
    try {
      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
      }

      const tenant = await MultiTenantManager.#getTenantConfiguration(tenantId);
      
      if (!tenant) {
        throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
      }

      // Update configuration
      const updatedTenant = {
        ...tenant,
        ...updates,
        tenantId, // Prevent ID change
        updatedAt: new Date().toISOString()
      };

      // Update resources if needed
      if (updates.configuration || updates.type) {
        await MultiTenantManager.#updateTenantResources(updatedTenant);
      }

      // Update in memory
      MultiTenantManager.#tenantConfigurations.set(tenantId, updatedTenant);

      // Clear cache
      MultiTenantManager.#clearTenantCache(tenantId);

      // Persist changes
      await MultiTenantManager.#persistTenantConfiguration(updatedTenant);

      logger.info('Tenant updated successfully', { tenantId });

      return updatedTenant;

    } catch (error) {
      logger.error('Failed to update tenant', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant update failed',
        500,
        'TENANT_UPDATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Deletes a tenant and its resources
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [options={}] - Deletion options
   * @returns {Promise<void>}
   * @throws {AppError} If deletion fails
   */
  static async deleteTenant(tenantId, options = {}) {
    try {
      const {
        softDelete = true,
        backupData = true,
        force = false
      } = options;

      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
      }

      const tenant = await MultiTenantManager.#getTenantConfiguration(tenantId);
      
      if (!tenant) {
        throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
      }

      // Backup data if requested
      if (backupData) {
        await MultiTenantManager.#backupTenantData(tenantId);
      }

      // Close connections
      await MultiTenantManager.#closeTenantConnections(tenantId);

      if (softDelete && !force) {
        // Soft delete - mark as deleted
        tenant.status = 'deleted';
        tenant.deletedAt = new Date().toISOString();
        await MultiTenantManager.#persistTenantConfiguration(tenant);
      } else {
        // Hard delete - remove resources
        await MultiTenantManager.#deprovisionTenantResources(tenant);
        MultiTenantManager.#tenantConfigurations.delete(tenantId);
      }

      // Clear cache
      MultiTenantManager.#clearTenantCache(tenantId);

      logger.info('Tenant deleted successfully', {
        tenantId,
        softDelete,
        force
      });

    } catch (error) {
      logger.error('Failed to delete tenant', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant deletion failed',
        500,
        'TENANT_DELETION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets tenant model with isolation applied
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {string} modelName - Model name
   * @param {Object} schema - Mongoose schema
   * @param {Object} [options={}] - Model options
   * @returns {Promise<Object>} Tenant-specific model
   * @throws {AppError} If model creation fails
   */
  static async getTenantModel(tenantId, modelName, schema, options = {}) {
    try {
      if (!tenantId || !modelName || !schema) {
        throw new AppError(
          'Tenant ID, model name, and schema are required',
          400,
          'INVALID_MODEL_PARAMS'
        );
      }

      // Check cache
      const cacheKey = `${tenantId}:${modelName}`;
      const cached = MultiTenantManager.#tenantModels.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get tenant context
      const context = await MultiTenantManager.getTenantConnection(tenantId);

      let model;

      switch (MultiTenantManager.#isolationStrategy) {
        case MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE:
          // Use tenant-specific database
          model = context.connection.model(modelName, schema);
          break;

        case MultiTenantManager.#ISOLATION_STRATEGIES.SCHEMA:
          // Use tenant-specific schema prefix
          const schemaName = `${tenantId}_${modelName}`;
          model = context.connection.model(schemaName, schema);
          break;

        case MultiTenantManager.#ISOLATION_STRATEGIES.COLLECTION:
          // Add tenant discriminator
          const tenantSchema = schema.clone();
          tenantSchema.add({ tenantId: { type: String, required: true, index: true } });
          
          // Apply tenant filter middleware
          tenantSchema.pre(/^find/, function() {
            this.where({ tenantId });
          });
          
          tenantSchema.pre('save', function() {
            this.tenantId = tenantId;
          });

          model = context.connection.model(modelName, tenantSchema);
          break;

        case MultiTenantManager.#ISOLATION_STRATEGIES.HYBRID:
          // Hybrid approach based on tenant type
          model = await MultiTenantManager.#createHybridModel(
            tenantId,
            modelName,
            schema,
            context
          );
          break;
      }

      // Cache model
      MultiTenantManager.#tenantModels.set(cacheKey, model);

      logger.debug('Tenant model created', {
        tenantId,
        modelName,
        strategy: MultiTenantManager.#isolationStrategy
      });

      return model;

    } catch (error) {
      logger.error('Failed to get tenant model', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant model creation failed',
        500,
        'MODEL_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Executes operation in tenant context
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Function} operation - Operation to execute
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<*>} Operation result
   * @throws {AppError} If execution fails
   */
  static async executeInTenantContext(tenantId, operation, options = {}) {
    try {
      if (!tenantId || typeof operation !== 'function') {
        throw new AppError(
          'Tenant ID and operation function are required',
          400,
          'INVALID_CONTEXT_PARAMS'
        );
      }

      // Get tenant context
      const context = await MultiTenantManager.getTenantConnection(tenantId);

      // Create tenant context object
      const tenantContext = {
        tenantId,
        connection: context.connection,
        database: context.database,
        configuration: context.configuration,
        getModel: (modelName, schema) => 
          MultiTenantManager.getTenantModel(tenantId, modelName, schema)
      };

      // Execute operation with tenant context
      const result = await operation(tenantContext);

      logger.debug('Operation executed in tenant context', {
        tenantId,
        operationName: operation.name || 'anonymous'
      });

      return result;

    } catch (error) {
      logger.error('Failed to execute in tenant context', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant context execution failed',
        500,
        'CONTEXT_EXECUTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Lists all active tenants
   * @static
   * @async
   * @param {Object} [filters={}] - Filter criteria
   * @returns {Promise<Array>} List of tenants
   * @throws {AppError} If listing fails
   */
  static async listTenants(filters = {}) {
    try {
      const {
        status = 'active',
        type,
        limit = 100,
        offset = 0
      } = filters;

      let tenants = Array.from(MultiTenantManager.#tenantConfigurations.values());

      // Apply filters
      if (status) {
        tenants = tenants.filter(t => t.status === status);
      }

      if (type) {
        tenants = tenants.filter(t => t.type === type);
      }

      // Apply pagination
      const totalCount = tenants.length;
      tenants = tenants.slice(offset, offset + limit);

      logger.info('Tenants listed', {
        totalCount,
        returned: tenants.length
      });

      return {
        tenants,
        totalCount,
        limit,
        offset,
        hasMore: totalCount > offset + limit
      };

    } catch (error) {
      logger.error('Failed to list tenants', error);

      throw new AppError(
        'Tenant listing failed',
        500,
        'TENANT_LIST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets tenant statistics
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<Object>} Tenant statistics
   * @throws {AppError} If statistics retrieval fails
   */
  static async getTenantStatistics(tenantId) {
    try {
      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
      }

      const tenant = await MultiTenantManager.#getTenantConfiguration(tenantId);
      
      if (!tenant) {
        throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
      }

      const context = await MultiTenantManager.getTenantConnection(tenantId);
      const stats = {
        tenantId,
        name: tenant.name,
        type: tenant.type,
        status: tenant.status,
        createdAt: tenant.createdAt,
        isolationStrategy: tenant.isolationStrategy
      };

      if (context.database) {
        // Get database statistics
        const dbStats = await context.database.stats();
        stats.database = {
          collections: dbStats.collections,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          indexes: dbStats.indexes,
          indexSize: dbStats.indexSize
        };
      }

      // Get connection health
      const connectionName = MultiTenantManager.#getConnectionName(tenantId);
      const health = await ConnectionManager.checkHealth(connectionName);
      stats.connectionHealth = health;

      logger.info('Tenant statistics retrieved', { tenantId });

      return stats;

    } catch (error) {
      logger.error('Failed to get tenant statistics', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Statistics retrieval failed',
        500,
        'TENANT_STATS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Loads tenant configurations from storage
   * @static
   * @async
   */
  static async #loadTenantConfigurations() {
    try {
      // In production, load from database
      // For now, initialize with defaults
      logger.info('Loading tenant configurations');

      // Example: Load from a tenant configuration collection
      const TenantModel = require('./models\organizations\tenant-model');
      if (TenantModel) {
        const tenants = await TenantModel.find({ status: 'active' });
        
        tenants.forEach(tenant => {
          MultiTenantManager.#tenantConfigurations.set(tenant.tenantId, tenant);
        });

        logger.info(`Loaded ${tenants.length} tenant configurations`);
      }

    } catch (error) {
      logger.warn('Failed to load tenant configurations', error);
      // Continue with empty configurations
    }
  }

  /**
   * @private
   * Gets tenant configuration
   * @static
   * @async
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Tenant configuration
   */
  static async #getTenantConfiguration(tenantId) {
    let config = MultiTenantManager.#tenantConfigurations.get(tenantId);

    if (!config) {
      // Try to load from database
      try {
        const TenantModel = require('./models\organizations\tenant-model');
        config = await TenantModel.findOne({ tenantId });
        
        if (config) {
          MultiTenantManager.#tenantConfigurations.set(tenantId, config);
        }
      } catch (error) {
        logger.debug('Could not load tenant from database', error);
      }
    }

    return config;
  }

  /**
   * @private
   * Creates tenant context based on isolation strategy
   * @static
   * @async
   * @param {string} tenantId - Tenant ID
   * @param {Object} tenantConfig - Tenant configuration
   * @param {Object} options - Connection options
   * @returns {Promise<Object>} Tenant context
   */
  static async #createTenantContext(tenantId, tenantConfig, options) {
    const strategy = MultiTenantManager.#isolationStrategy;
    let context = {};

    switch (strategy) {
      case MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE:
        // Create separate database connection
        const dbName = `tenant_${tenantId}`;
        const connectionName = MultiTenantManager.#getConnectionName(tenantId);
        
        const connection = await ConnectionManager.connect(connectionName, {
          ...options,
          uri: `${config.database.uri}/${dbName}`
        });

        context = {
          tenantId,
          connection,
          database: connection.db,
          configuration: tenantConfig
        };
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.SCHEMA:
      case MultiTenantManager.#ISOLATION_STRATEGIES.COLLECTION:
        // Use shared connection
        const sharedConnection = ConnectionManager.getConnection('shared');
        
        context = {
          tenantId,
          connection: sharedConnection,
          database: sharedConnection.db,
          configuration: tenantConfig,
          schemaPrefix: strategy === MultiTenantManager.#ISOLATION_STRATEGIES.SCHEMA ? `${tenantId}_` : ''
        };
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.HYBRID:
        // Determine based on tenant type
        context = await MultiTenantManager.#createHybridContext(
          tenantId,
          tenantConfig,
          options
        );
        break;
    }

    MultiTenantManager.#tenantConnections.set(tenantId, context);
    return context;
  }

  /**
   * @private
   * Gets default configuration for tenant type
   * @static
   * @param {string} type - Tenant type
   * @returns {Object} Default configuration
   */
  static #getDefaultConfiguration(type) {
    const configurations = {
      [MultiTenantManager.#TENANT_TYPES.TRIAL]: {
        maxUsers: 5,
        maxStorage: 1024 * 1024 * 100, // 100MB
        features: ['basic'],
        expirationDays: 30
      },
      [MultiTenantManager.#TENANT_TYPES.STANDARD]: {
        maxUsers: 50,
        maxStorage: 1024 * 1024 * 1024 * 10, // 10GB
        features: ['basic', 'advanced'],
        backupEnabled: true
      },
      [MultiTenantManager.#TENANT_TYPES.PREMIUM]: {
        maxUsers: 200,
        maxStorage: 1024 * 1024 * 1024 * 100, // 100GB
        features: ['basic', 'advanced', 'premium'],
        backupEnabled: true,
        replicationEnabled: true
      },
      [MultiTenantManager.#TENANT_TYPES.ENTERPRISE]: {
        maxUsers: -1, // Unlimited
        maxStorage: -1, // Unlimited
        features: ['all'],
        backupEnabled: true,
        replicationEnabled: true,
        dedicatedResources: true
      }
    };

    return configurations[type] || configurations[MultiTenantManager.#TENANT_TYPES.STANDARD];
  }

  /**
   * @private
   * Provisions tenant resources
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #provisionTenantResources(tenant) {
    const strategy = MultiTenantManager.#isolationStrategy;

    switch (strategy) {
      case MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE:
        // Create tenant database
        const dbName = `tenant_${tenant.tenantId}`;
        const connection = await ConnectionManager.createConnection(
          `${config.database.uri}/${dbName}`
        );
        
        // Initialize collections and indexes
        await MultiTenantManager.#initializeTenantDatabase(connection, tenant);
        
        await connection.close();
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.SCHEMA:
        // Create schema prefix structures
        await MultiTenantManager.#initializeTenantSchema(tenant);
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.COLLECTION:
        // No special provisioning needed
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.HYBRID:
        // Provision based on tenant type
        await MultiTenantManager.#provisionHybridResources(tenant);
        break;
    }

    logger.info('Tenant resources provisioned', {
      tenantId: tenant.tenantId,
      strategy
    });
  }

  /**
   * @private
   * Deprovisions tenant resources
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #deprovisionTenantResources(tenant) {
    const strategy = MultiTenantManager.#isolationStrategy;

    switch (strategy) {
      case MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE:
        // Drop tenant database
        const dbName = `tenant_${tenant.tenantId}`;
        const connection = await ConnectionManager.createConnection(config.database.uri);
        await connection.db.admin().dropDatabase(dbName);
        await connection.close();
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.SCHEMA:
        // Remove tenant collections
        await MultiTenantManager.#removeTenantSchema(tenant);
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.COLLECTION:
        // Remove tenant data
        await MultiTenantManager.#removeTenantData(tenant);
        break;

      case MultiTenantManager.#ISOLATION_STRATEGIES.HYBRID:
        // Deprovision based on tenant type
        await MultiTenantManager.#deprovisionHybridResources(tenant);
        break;
    }

    logger.info('Tenant resources deprovisioned', {
      tenantId: tenant.tenantId,
      strategy
    });
  }

  /**
   * @private
   * Initializes tenant database
   * @static
   * @async
   * @param {Object} connection - Database connection
   * @param {Object} tenant - Tenant data
   */
  static async #initializeTenantDatabase(connection, tenant) {
    // Create default collections and indexes
    const collections = ['users', 'settings', 'audit_logs'];
    
    for (const collectionName of collections) {
      await connection.createCollection(collectionName);
      
      // Add default indexes
      if (collectionName === 'users') {
        await connection.collection(collectionName).createIndex(
          { email: 1 },
          { unique: true }
        );
      }
    }

    // Store tenant metadata
    await connection.collection('_tenant_metadata').insertOne({
      tenantId: tenant.tenantId,
      name: tenant.name,
      type: tenant.type,
      createdAt: tenant.createdAt,
      configuration: tenant.configuration
    });
  }

  /**
   * @private
   * Persists tenant configuration
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #persistTenantConfiguration(tenant) {
    try {
      // In production, save to database
      const TenantModel = require('./models\organizations\tenant-model');
      if (TenantModel) {
        await TenantModel.findOneAndUpdate(
          { tenantId: tenant.tenantId },
          tenant,
          { upsert: true, new: true }
        );
      }
    } catch (error) {
      logger.error('Failed to persist tenant configuration', error);
    }
  }

  /**
   * @private
   * Gets cached tenant
   * @static
   * @param {string} tenantId - Tenant ID
   * @returns {Object|null} Cached tenant context
   */
  static #getCachedTenant(tenantId) {
    const cached = MultiTenantManager.#tenantCache.get(tenantId);
    
    if (cached && cached.timestamp > Date.now() - MultiTenantManager.#CACHE_DURATION) {
      return cached.data;
    }

    return null;
  }

  /**
   * @private
   * Caches tenant context
   * @static
   * @param {string} tenantId - Tenant ID
   * @param {Object} context - Tenant context
   */
  static #cacheTenant(tenantId, context) {
    MultiTenantManager.#tenantCache.set(tenantId, {
      data: context,
      timestamp: Date.now()
    });
  }

  /**
   * @private
   * Clears tenant cache
   * @static
   * @param {string} tenantId - Tenant ID
   */
  static #clearTenantCache(tenantId) {
    MultiTenantManager.#tenantCache.delete(tenantId);
    
    // Clear model cache for tenant
    const modelKeys = Array.from(MultiTenantManager.#tenantModels.keys());
    modelKeys.forEach(key => {
      if (key.startsWith(`${tenantId}:`)) {
        MultiTenantManager.#tenantModels.delete(key);
      }
    });
  }

  /**
   * @private
   * Gets connection name for tenant
   * @static
   * @param {string} tenantId - Tenant ID
   * @returns {string} Connection name
   */
  static #getConnectionName(tenantId) {
    return `tenant_${tenantId}`;
  }

  /**
   * @private
   * Closes tenant connections
   * @static
   * @async
   * @param {string} tenantId - Tenant ID
   */
  static async #closeTenantConnections(tenantId) {
    const connectionName = MultiTenantManager.#getConnectionName(tenantId);
    await ConnectionManager.disconnect(connectionName);
    
    MultiTenantManager.#tenantConnections.delete(tenantId);
  }

  /**
   * @private
   * Backs up tenant data
   * @static
   * @async
   * @param {string} tenantId - Tenant ID
   */
  static async #backupTenantData(tenantId) {
    logger.info('Backing up tenant data', { tenantId });
    // Implementation would perform actual backup
  }

  /**
   * @private
   * Creates hybrid model based on tenant type
   * @static
   * @async
   * @param {string} tenantId - Tenant ID
   * @param {string} modelName - Model name
   * @param {Object} schema - Mongoose schema
   * @param {Object} context - Tenant context
   * @returns {Promise<Object>} Tenant model
   */
  static async #createHybridModel(tenantId, modelName, schema, context) {
    const tenant = await MultiTenantManager.#getTenantConfiguration(tenantId);
    
    if (tenant.type === MultiTenantManager.#TENANT_TYPES.ENTERPRISE) {
      // Use database isolation for enterprise
      return context.connection.model(modelName, schema);
    } else {
      // Use collection isolation for others
      const tenantSchema = schema.clone();
      tenantSchema.add({ tenantId: { type: String, required: true, index: true } });
      
      tenantSchema.pre(/^find/, function() {
        this.where({ tenantId });
      });
      
      tenantSchema.pre('save', function() {
        this.tenantId = tenantId;
      });

      return context.connection.model(modelName, tenantSchema);
    }
  }

  /**
   * @private
   * Creates hybrid context based on tenant type
   * @static
   * @async
   * @param {string} tenantId - Tenant ID
   * @param {Object} tenantConfig - Tenant configuration
   * @param {Object} options - Connection options
   * @returns {Promise<Object>} Tenant context
   */
  static async #createHybridContext(tenantId, tenantConfig, options) {
    if (tenantConfig.type === MultiTenantManager.#TENANT_TYPES.ENTERPRISE) {
      // Enterprise gets dedicated database
      const dbName = `tenant_${tenantId}`;
      const connectionName = MultiTenantManager.#getConnectionName(tenantId);
      
      const connection = await ConnectionManager.connect(connectionName, {
        ...options,
        uri: `${config.database.uri}/${dbName}`
      });

      return {
        tenantId,
        connection,
        database: connection.db,
        configuration: tenantConfig
      };
    } else {
      // Others share connection with collection isolation
      const sharedConnection = ConnectionManager.getConnection('shared');
      
      return {
        tenantId,
        connection: sharedConnection,
        database: sharedConnection.db,
        configuration: tenantConfig
      };
    }
  }

  /**
   * @private
   * Updates tenant resources
   * @static
   * @async
   * @param {Object} tenant - Updated tenant
   */
  static async #updateTenantResources(tenant) {
    // Update resources based on configuration changes
    logger.info('Updating tenant resources', { tenantId: tenant.tenantId });
  }

  /**
   * @private
   * Initializes tenant schema
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #initializeTenantSchema(tenant) {
    logger.info('Initializing tenant schema', { tenantId: tenant.tenantId });
    // Implementation for schema-based isolation
  }

  /**
   * @private
   * Removes tenant schema
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #removeTenantSchema(tenant) {
    logger.info('Removing tenant schema', { tenantId: tenant.tenantId });
    // Implementation for schema removal
  }

  /**
   * @private
   * Removes tenant data
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #removeTenantData(tenant) {
    logger.info('Removing tenant data', { tenantId: tenant.tenantId });
    // Implementation for data removal in shared collections
  }

  /**
   * @private
   * Provisions hybrid resources
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #provisionHybridResources(tenant) {
    if (tenant.type === MultiTenantManager.#TENANT_TYPES.ENTERPRISE) {
      await MultiTenantManager.#provisionTenantResources({
        ...tenant,
        isolationStrategy: MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE
      });
    }
  }

  /**
   * @private
   * Deprovisions hybrid resources
   * @static
   * @async
   * @param {Object} tenant - Tenant data
   */
  static async #deprovisionHybridResources(tenant) {
    if (tenant.type === MultiTenantManager.#TENANT_TYPES.ENTERPRISE) {
      await MultiTenantManager.#deprovisionTenantResources({
        ...tenant,
        isolationStrategy: MultiTenantManager.#ISOLATION_STRATEGIES.DATABASE
      });
    } else {
      await MultiTenantManager.#removeTenantData(tenant);
    }
  }

  /**
   * Cleanup method to close all connections
   * @static
   * @async
   */
  static async cleanup() {
    // Close all tenant connections
    for (const tenantId of MultiTenantManager.#tenantConnections.keys()) {
      await MultiTenantManager.#closeTenantConnections(tenantId);
    }

    // Clear all caches
    MultiTenantManager.#tenantCache.clear();
    MultiTenantManager.#tenantModels.clear();
    MultiTenantManager.#tenantConfigurations.clear();

    logger.info('Multi-tenant manager cleaned up');
  }
}

module.exports = MultiTenantManager;