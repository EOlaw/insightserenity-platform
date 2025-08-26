'use strict';

/**
 * @fileoverview Configuration management service with proper database connection handling
 * @module servers/admin-server/modules/platform-management/services/configuration-service
 * @requires module:shared/lib/database - FIXED: Use Database module instead of direct model import
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires js-yaml
 * @requires xml2js
 */

const yaml = require('js-yaml');
const xml2js = require('xml2js');

// FIXED: Import Database module instead of directly importing the model
const Database = require('../../../../../shared/lib/database');

const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const TransactionManager = require('../../../../../shared/lib/database/transaction-manager');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');

/**
 * @class ConfigurationService
 * @description Enhanced configuration management service with proper database connection handling
 */
class ConfigurationService {
  // Static constants
  static EVENTS = {
    CONFIG_CREATED: 'configuration.created',
    CONFIG_UPDATED: 'configuration.updated',
    CONFIG_DELETED: 'configuration.deleted',
    CONFIG_VALUE_CHANGED: 'configuration.value.changed',
    CONFIG_DEPLOYED: 'configuration.deployed',
    CONFIG_VALIDATED: 'configuration.validated',
    CONFIG_LOCKED: 'configuration.locked',
    CONFIG_UNLOCKED: 'configuration.unlocked'
  };

  static CACHE_KEYS = {
    CONFIG_LIST: 'config:list',
    CONFIG_BY_ID: 'config:id',
    CONFIG_BY_NAME: 'config:name',
    CONFIG_VALUES: 'config:values',
    CONFIG_STATS: 'config:stats',
    CONFIG_SEARCH: 'config:search',
    CONFIG_VALIDATION: 'config:validation'
  };

  static CONFIG_TYPES = {
    APPLICATION: 'application',
    SYSTEM: 'system',
    ENVIRONMENT: 'environment',
    FEATURE: 'feature',
    INTEGRATION: 'integration',
    SECURITY: 'security',
    UI: 'ui'
  };

  static VALIDATION_LEVELS = {
    STRICT: 'strict',
    MODERATE: 'moderate',
    LENIENT: 'lenient'
  };

  constructor() {
    // FIXED: Use regular properties instead of private fields
    this.cacheService = CacheService;
    this.auditService = AuditService;
    this.encryptionService = EncryptionService;
    this.notificationService = NotificationService;
    this._configurationModel = null; // Cache for the model
    
    // Debug flag for troubleshooting
    this.debug = process.env.NODE_ENV === 'development';
  }

  /**
   * FIXED: Get Configuration model from Database registry with proper error handling and debugging
   * @private
   * @returns {mongoose.Model} Configuration model
   * @throws {AppError} If model is not available
   */
  async _getConfigurationModel() {
    try {
      // Return cached model if available
      if (this._configurationModel) {
        return this._configurationModel;
      }

      // DEBUGGING: Log database status
      if (this.debug) {
        logger.debug('ConfigurationService: Getting Configuration model from Database registry');
        
        const dbHealth = await Database.getHealthStatus();
        logger.debug('Database health status:', {
          status: dbHealth.status,
          initialized: dbHealth.initialized,
          connections: Object.keys(dbHealth.connections || {}),
          models: dbHealth.models,
          modelsRegistered: dbHealth.modelsRegistered
        });
      }

      // Check if Database is initialized
      if (!Database.getHealthStatus || !(await Database.getHealthStatus()).initialized) {
        throw new AppError(
          'Database module not initialized',
          500,
          'DATABASE_NOT_INITIALIZED',
          { service: 'ConfigurationService' }
        );
      }

      // Get the Configuration model from Database registry
      const ConfigurationModel = await Database.getModel('Configuration');
      
      if (!ConfigurationModel) {
        // DEBUGGING: Log available models
        if (this.debug) {
          try {
            const registrationSummary = Database.getRegistrationSummary();
            logger.error('Configuration model not found in registry', {
              availableModels: registrationSummary.registeredModels || [],
              totalModels: registrationSummary.successful || 0,
              registrationErrors: Database.getRegistrationErrors ? Database.getRegistrationErrors() : []
            });
          } catch (debugError) {
            logger.warn('Failed to get registration debug info:', debugError.message);
          }
        }

        throw new AppError(
          'Configuration model not found in Database registry',
          500,
          'MODEL_NOT_FOUND',
          { 
            modelName: 'Configuration',
            service: 'ConfigurationService',
            suggestion: 'Check that the Configuration model is properly registered in models/index.js'
          }
        );
      }

      // DEBUGGING: Log model details
      if (this.debug) {
        logger.debug('Configuration model retrieved successfully', {
          modelName: ConfigurationModel.modelName,
          collectionName: ConfigurationModel.collection?.name,
          databaseType: ConfigurationModel.getDatabaseType ? ConfigurationModel.getDatabaseType() : 'unknown'
        });
      }

      // FIXED: Verify the model has proper database connection
      if (!ConfigurationModel.collection || !ConfigurationModel.collection.name) {
        throw new AppError(
          'Configuration model has no database collection',
          500,
          'MODEL_NO_COLLECTION',
          { 
            modelName: 'Configuration',
            service: 'ConfigurationService'
          }
        );
      }

      // Test database connectivity by attempting a simple operation
      try {
        await ConfigurationModel.countDocuments().maxTimeMS(5000);
        if (this.debug) {
          logger.debug('Configuration model database connectivity verified');
        }
      } catch (connectivityError) {
        logger.error('Configuration model database connectivity test failed:', {
          error: connectivityError.message,
          modelName: 'Configuration',
          collection: ConfigurationModel.collection.name
        });
        throw new AppError(
          'Database connectivity issue for Configuration model',
          500,
          'DATABASE_CONNECTIVITY_ERROR',
          { 
            originalError: connectivityError.message,
            collection: 'configuration_management',
            service: 'ConfigurationService'
          }
        );
      }

      // Cache the model for future use
      this._configurationModel = ConfigurationModel;
      return ConfigurationModel;

    } catch (error) {
      logger.error('Failed to get Configuration model:', {
        error: error.message,
        stack: error.stack,
        service: 'ConfigurationService'
      });

      // Re-throw AppError as-is, wrap other errors
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to access Configuration model',
        500,
        'MODEL_ACCESS_ERROR',
        { 
          originalError: error.message,
          service: 'ConfigurationService'
        }
      );
    }
  }

  /**
   * Creates a new configuration
   * @async
   * @param {Object} configData - Configuration data
   * @param {string} userId - User ID creating the configuration
   * @returns {Promise<Object>} Created configuration
   * @throws {AppError} If creation fails
   */
  async createConfiguration(configData, userId) {
    const session = await TransactionManager.startSession();
    
    try {
      logger.info('Creating new configuration', {
        name: configData.name,
        type: configData.configType,
        userId
      });

      const ConfigurationModel = await this._getConfigurationModel();

      // Check for duplicate name or configId
      const existingConfig = await ConfigurationModel.findOne({
        $or: [
          { name: configData.name },
          { configId: configData.configId }
        ]
      }).session(session);

      if (existingConfig) {
        throw new AppError(
          'Configuration with this name or ID already exists',
          400,
          'DUPLICATE_CONFIGURATION',
          { 
            existing: existingConfig.configId,
            name: configData.name 
          }
        );
      }

      // Validate and prepare configuration data
      const validatedData = await this.validateConfigurationData(configData);

      // Create configuration
      const configuration = new ConfigurationModel({
        ...validatedData,
        metadata: {
          ...validatedData.metadata,
          createdBy: userId,
          lastModifiedBy: userId
        },
        status: {
          active: true,
          locked: false,
          validationStatus: 'pending'
        }
      });

      // Encrypt sensitive values
      if (configuration.configurations) {
        for (const config of configuration.configurations) {
          if (config.encrypted && config.value) {
            config.value = await this.encryptionService.encrypt(config.value);
          }
        }
      }

      // Create initial version
      configuration.versions.push({
        version: '1.0.0',
        changes: configuration.configurations.map(config => ({
          key: config.key,
          changeType: 'create',
          newValue: config.value,
          encrypted: config.encrypted
        })),
        comment: 'Initial configuration',
        createdBy: userId,
        createdAt: new Date()
      });

      await configuration.save({ session });

      // Create audit entry
      await this.auditService.log({
        userId,
        action: 'configuration.create',
        resource: 'configuration',
        resourceId: configuration.configId,
        details: {
          name: configuration.name,
          configCount: configuration.configurations.length
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration created', {
        configId: configuration.configId,
        name: configuration.name,
        userId
      });

      // Clear cache
      await this.clearConfigurationCache();

      // Emit event
      await this.notificationService.emit(ConfigurationService.EVENTS.CONFIG_CREATED, {
        configuration: configuration.toObject(),
        userId,
        timestamp: new Date()
      });

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create configuration', {
        name: configData.name,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to create configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Lists all configurations with enhanced error handling and debugging
   * @async
   * @param {Object} [options={}] - Query options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=20] - Items per page
   * @param {string} [options.sortBy='createdAt'] - Sort field
   * @param {string} [options.sortOrder='desc'] - Sort order
   * @param {Object} [options.filters={}] - Additional filters
   * @returns {Promise<Object>} Configuration list with pagination
   * @throws {AppError} If listing fails
   */
  async listConfigurations(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        filters = {},
        includeInactive = false,
        category,
        environment,
        tag,
        active = true,
        search,
        sort = '-createdAt'
      } = options;

      // DEBUGGING: Log the request
      if (this.debug) {
        logger.debug('ConfigurationService.listConfigurations called', {
          page,
          limit,
          sortBy,
          sortOrder,
          filters,
          includeInactive
        });
      }

      // FIXED: Get model with proper error handling
      const ConfigurationModel = await this._getConfigurationModel();

      // Build query conditions
      const queryConditions = {
        ...filters
      };

      // Filter active configurations unless explicitly requested
      if (!includeInactive) {
        queryConditions['status.active'] = true;
      }

      if (active !== undefined) {
        queryConditions['status.active'] = active;
      }

      if (category) {
        queryConditions['metadata.category'] = category;
      }

      if (environment) {
        queryConditions['environments.environment'] = environment;
      }

      if (tag) {
        queryConditions['metadata.tags'] = tag;
      }

      if (search) {
        queryConditions.$or = [
          { name: new RegExp(search, 'i') },
          { displayName: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ];
      }

      // DEBUGGING: Log query conditions
      if (this.debug) {
        logger.debug('Query conditions:', queryConditions);
      }

      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Calculate pagination
      const skip = (page - 1) * limit;

      // FIXED: Execute query with proper timeout and error handling
      const startTime = Date.now();
      
      try {
        const [configurations, totalCount] = await Promise.all([
          ConfigurationModel
            .find(queryConditions)
            .select('-configurations -versions -auditTrail')
            .sort(sortObject)
            .limit(Number(limit))
            .skip(Number(skip))
            .populate('metadata.createdBy', 'username email profile.firstName profile.lastName')
            .populate('metadata.lastModifiedBy', 'username email profile.firstName profile.lastName')
            .populate('status.lockedBy', 'username email profile.firstName profile.lastName')
            .maxTimeMS(30000) // 30 second timeout
            .lean(), // Use lean() for better performance

          ConfigurationModel
            .countDocuments(queryConditions)
            .maxTimeMS(10000) // 10 second timeout for count
        ]);

        const queryTime = Date.now() - startTime;

        // DEBUGGING: Log successful query
        if (this.debug) {
          logger.debug('Configurations retrieved successfully', {
            count: configurations.length,
            totalCount,
            queryTime,
            page,
            limit
          });
        }

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        const result = {
          success: true,
          data: {
            configurations,
            pagination: {
              currentPage: page,
              totalPages,
              totalCount,
              limit,
              hasNextPage,
              hasPreviousPage,
              total: totalCount,
              pages: totalPages
            },
            queryMetadata: {
              queryTime,
              sortBy,
              sortOrder,
              filtersApplied: Object.keys(filters).length
            }
          }
        };

        // Cache results if caching is enabled
        if (this.cacheService && Object.keys(filters).length === 0) {
          try {
            const cacheKey = `configurations:list:${page}:${limit}:${sortBy}:${sortOrder}`;
            await this.cacheService.set(cacheKey, result, 300); // Cache for 5 minutes
          } catch (cacheError) {
            logger.warn('Failed to cache configuration list:', cacheError.message);
          }
        }

        return result;

      } catch (queryError) {
        const queryTime = Date.now() - startTime;
        
        logger.error('Database query failed in listConfigurations:', {
          error: queryError.message,
          queryTime,
          queryConditions,
          sortObject,
          page,
          limit,
          stack: queryError.stack
        });

        // Provide specific error based on the type of database error
        if (queryError.message.includes('timed out')) {
          throw new AppError(
            `Database query timed out after ${queryTime}ms. The query may be too complex or the database connection is slow.`,
            408,
            'DATABASE_QUERY_TIMEOUT',
            { 
              queryTime,
              queryConditions,
              sortObject,
              service: 'ConfigurationService'
            }
          );
        }

        if (queryError.message.includes('connection')) {
          throw new AppError(
            'Database connection error occurred during configuration listing',
            503,
            'DATABASE_CONNECTION_ERROR',
            { 
              originalError: queryError.message,
              service: 'ConfigurationService'
            }
          );
        }

        throw new AppError(
          'Database operation failed during configuration listing',
          500,
          'DATABASE_OPERATION_ERROR',
          { 
            originalError: queryError.message,
            queryTime,
            service: 'ConfigurationService'
          }
        );
      }

    } catch (error) {
      // DEBUGGING: Log the complete error context
      if (this.debug) {
        logger.error('ConfigurationService.listConfigurations failed:', {
          error: error.message,
          stack: error.stack,
          options,
          service: 'ConfigurationService'
        });
      }

      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }

      // Wrap unexpected errors
      throw new AppError(
        `Failed to list configurations: ${error.message}`,
        500,
        'CONFIGURATION_LIST_ERROR',
        { 
          originalError: error.message,
          service: 'ConfigurationService'
        }
      );
    }
  }

  /**
   * Gets configuration by ID or name with proper model handling
   * @async
   * @param {string} identifier - Configuration ID or name
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Configuration data
   * @throws {AppError} If configuration not found or retrieval fails
   */
  async getConfiguration(identifier, options = {}) {
    try {
      if (!identifier) {
        throw new AppError('Configuration ID is required', 400, 'INVALID_CONFIG_ID');
      }

      const { 
        environment, 
        includeVersions = false, 
        includeSensitive = false,
        fromCache = true 
      } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_BY_ID}:${identifier}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          return this.processConfigurationResponse(cached, { includeSensitive });
        }
      }

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const query = identifier.startsWith('CONFIG_') ? 
        { configId: identifier } : 
        { name: identifier };

      let configQuery = ConfigurationModel.findOne(query);

      // Add population
      configQuery = configQuery
        .populate('metadata.createdBy', 'username email profile.firstName profile.lastName')
        .populate('metadata.lastModifiedBy', 'username email profile.firstName profile.lastName')
        .populate('status.lockedBy', 'username email profile.firstName profile.lastName');

      // Exclude versions unless requested
      if (!includeVersions) {
        configQuery = configQuery.select('-versions');
      }

      const configuration = await configQuery
        .maxTimeMS(15000)
        .lean();

      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${identifier}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { identifier }
        );
      }

      // Process response
      const processedConfig = this.processConfigurationResponse(configuration, { includeSensitive, environment });

      // Cache the result
      if (fromCache) {
        try {
          const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_BY_ID}:${identifier}`;
          await this.cacheService.set(cacheKey, configuration, 600); // Cache for 10 minutes
        } catch (cacheError) {
          logger.warn('Failed to cache configuration:', cacheError.message);
        }
      }

      return {
        success: true,
        data: processedConfig
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Failed to get configuration: ${error.message}`,
        500,
        'CONFIGURATION_GET_ERROR',
        { 
          identifier,
          originalError: error.message 
        }
      );
    }
  }

  /**
   * Updates an existing configuration
   * @async
   * @param {string} configId - Configuration ID
   * @param {Object} updateData - Update data
   * @param {string} userId - User ID performing update
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async updateConfiguration(configId, updateData, userId) {
    const session = await TransactionManager.startSession();
    
    try {
      logger.info('Updating configuration', {
        configId,
        userId,
        fieldsToUpdate: Object.keys(updateData)
      });

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      
      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${configId}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { configId }
        );
      }

      // Check if configuration is locked
      if (configuration.status.locked && configuration.status.lockedBy.toString() !== userId) {
        throw new AppError(
          'Configuration is locked by another user',
          423,
          'CONFIGURATION_LOCKED',
          { 
            configId,
            lockedBy: configuration.status.lockedBy 
          }
        );
      }

      // Store original data for comparison
      const originalData = configuration.toObject();

      // Apply updates
      Object.assign(configuration, updateData);
      configuration.metadata.lastModifiedBy = userId;

      // Handle configuration value updates
      if (updateData.configurations) {
        const changes = [];
        
        for (const newConfig of updateData.configurations) {
          const existingConfig = configuration.configurations.find(c => c.key === newConfig.key);
          
          if (existingConfig) {
            if (existingConfig.value !== newConfig.value) {
              changes.push({
                key: newConfig.key,
                changeType: 'modify',
                oldValue: existingConfig.value,
                newValue: newConfig.value
              });
              existingConfig.value = newConfig.value;
            }
          } else {
            changes.push({
              key: newConfig.key,
              changeType: 'add',
              newValue: newConfig.value
            });
            configuration.configurations.push(newConfig);
          }

          // Encrypt sensitive values
          if (newConfig.encrypted && newConfig.value) {
            newConfig.value = await this.encryptionService.encrypt(newConfig.value);
          }
        }

        // Add version if there are changes
        if (changes.length > 0) {
          const newVersion = {
            version: this.generateNextVersion(configuration.versions),
            changes,
            comment: updateData.versionComment || 'Configuration update',
            createdBy: userId,
            createdAt: new Date()
          };
          configuration.versions.push(newVersion);
        }
      }

      // Save configuration
      await configuration.save({ session });

      // Create audit entry
      await this.auditService.log({
        userId,
        action: 'configuration.update',
        resource: 'configuration',
        resourceId: configId,
        details: {
          changes: this.detectChanges(originalData, configuration.toObject())
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration updated', {
        configId,
        userId
      });

      // Clear cache
      await this.clearConfigurationCache(configId);

      // Emit event
      await this.notificationService.emit(ConfigurationService.EVENTS.CONFIG_UPDATED, {
        configuration: configuration.toObject(),
        originalData,
        userId,
        timestamp: new Date()
      });

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update configuration', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Deletes a configuration
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} userId - User ID performing deletion
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deleteConfiguration(configId, userId) {
    const session = await TransactionManager.startSession();
    
    try {
      logger.info('Deleting configuration', { configId, userId });

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      
      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${configId}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { configId }
        );
      }

      // Check if configuration is locked
      if (configuration.status.locked && configuration.status.lockedBy.toString() !== userId) {
        throw new AppError(
          'Configuration is locked by another user',
          423,
          'CONFIGURATION_LOCKED',
          { 
            configId,
            lockedBy: configuration.status.lockedBy 
          }
        );
      }

      // Soft delete by default
      configuration.status.active = false;
      configuration.metadata.lastModifiedBy = userId;
      
      await configuration.save({ session });

      // Create audit entry
      await this.auditService.log({
        userId,
        action: 'configuration.delete',
        resource: 'configuration',
        resourceId: configId,
        details: {
          name: configuration.name,
          softDelete: true
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration deleted', { configId, userId });

      // Clear cache
      await this.clearConfigurationCache(configId);

      // Emit event
      await this.notificationService.emit(ConfigurationService.EVENTS.CONFIG_DELETED, {
        configId,
        name: configuration.name,
        userId,
        timestamp: new Date()
      });

      return {
        success: true,
        message: 'Configuration deleted successfully',
        configId
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to delete configuration', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to delete configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets configuration value by key
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key
   * @param {Object} [options={}] - Query options
   * @returns {Promise<*>} Configuration value
   * @throws {AppError} If value not found
   */
  async getConfigurationValue(configId, key, options = {}) {
    try {
      const { environment, decrypt = true, fromCache = true } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:${environment || 'base'}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached !== undefined) {
          return cached;
        }
      }

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const configuration = await ConfigurationModel.findOne({ 
        configId,
        'status.active': true 
      }).lean();

      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${configId}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { configId }
        );
      }

      // Find configuration key
      const configItem = configuration.configurations.find(c => c.key === key);
      
      if (!configItem) {
        // Check environment-specific configurations
        if (environment) {
          const envConfig = configuration.environments.find(e => e.environment === environment);
          if (envConfig && envConfig.configurations && envConfig.configurations[key]) {
            const value = envConfig.configurations[key];
            
            // Cache the result
            if (fromCache) {
              const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:${environment}`;
              await this.cacheService.set(cacheKey, value, 300);
            }
            
            return value;
          }
        }
        
        throw new AppError(
          `Configuration key not found: ${key}`,
          404,
          'CONFIGURATION_KEY_NOT_FOUND',
          { configId, key }
        );
      }

      let value = configItem.value;

      // Decrypt if needed
      if (configItem.encrypted && decrypt && value) {
        try {
          value = await this.encryptionService.decrypt(value);
        } catch (decryptError) {
          logger.error('Failed to decrypt configuration value', {
            configId,
            key,
            error: decryptError.message
          });
          throw new AppError(
            'Failed to decrypt configuration value',
            500,
            'DECRYPTION_ERROR',
            { configId, key }
          );
        }
      }

      // Apply environment override if specified
      if (environment) {
        const envConfig = configuration.environments.find(e => e.environment === environment);
        if (envConfig && envConfig.configurations && envConfig.configurations[key] !== undefined) {
          value = envConfig.configurations[key];
        }
      }

      // Cache the result
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:${environment || 'base'}`;
        await this.cacheService.set(cacheKey, value, 300);
      }

      return value;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Failed to get configuration value: ${error.message}`,
        500,
        'GET_CONFIG_VALUE_ERROR',
        { 
          configId,
          key,
          originalError: error.message 
        }
      );
    }
  }

  /**
   * Sets configuration value
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   * @param {Object} [options={}] - Set options
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async setConfigurationValue(configId, key, value, options = {}) {
    const session = await TransactionManager.startSession();
    
    try {
      const { environment, userId, comment, createIfNotExists = false, encrypt = false } = options;

      logger.info('Setting configuration value', {
        configId,
        key,
        environment,
        hasValue: value !== undefined,
        createIfNotExists,
        userId
      });

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      
      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${configId}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { configId }
        );
      }

      // Check if configuration is locked
      if (configuration.status.locked && configuration.status.lockedBy.toString() !== userId) {
        throw new AppError(
          'Configuration is locked by another user',
          423,
          'CONFIGURATION_LOCKED',
          { 
            configId,
            lockedBy: configuration.status.lockedBy 
          }
        );
      }

      let updated = false;
      let changeType = 'modify';
      let oldValue = undefined;

      if (environment) {
        // Handle environment-specific configuration
        let envConfig = configuration.environments.find(e => e.environment === environment);
        
        if (!envConfig) {
          if (createIfNotExists) {
            envConfig = {
              environment,
              active: true,
              configurations: {}
            };
            configuration.environments.push(envConfig);
            changeType = 'add';
          } else {
            throw new AppError(
              `Environment configuration not found: ${environment}`,
              404,
              'ENVIRONMENT_CONFIG_NOT_FOUND',
              { configId, environment }
            );
          }
        }

        oldValue = envConfig.configurations[key];
        envConfig.configurations[key] = value;
        updated = true;
      } else {
        // Handle base configuration
        const configItem = configuration.configurations.find(c => c.key === key);
        
        if (configItem) {
          oldValue = configItem.value;
          configItem.value = encrypt ? await this.encryptionService.encrypt(value) : value;
          configItem.encrypted = encrypt;
          updated = true;
        } else if (createIfNotExists) {
          configuration.configurations.push({
            key,
            value: encrypt ? await this.encryptionService.encrypt(value) : value,
            dataType: typeof value,
            encrypted: encrypt,
            category: 'general',
            description: `Auto-created configuration key: ${key}`,
            required: false
          });
          changeType = 'add';
          updated = true;
        } else {
          throw new AppError(
            `Configuration key not found: ${key}`,
            404,
            'CONFIGURATION_KEY_NOT_FOUND',
            { configId, key }
          );
        }
      }

      if (updated) {
        // Update metadata
        configuration.metadata.lastModifiedBy = userId;

        // Add version entry
        const versionChange = {
          key,
          changeType,
          oldValue,
          newValue: value,
          environment,
          encrypted: encrypt
        };

        const newVersion = {
          version: this.generateNextVersion(configuration.versions),
          changes: [versionChange],
          comment: comment || `Updated ${key} value`,
          createdBy: userId,
          createdAt: new Date()
        };

        configuration.versions.push(newVersion);

        // Save configuration
        await configuration.save({ session });

        // Create audit entry
        await this.auditService.log({
          userId,
          action: 'configuration.value.update',
          resource: 'configuration',
          resourceId: configId,
          details: {
            key,
            changeType,
            environment,
            hasOldValue: oldValue !== undefined
          },
          session
        });

        await session.commitTransaction();

        logger.info('Configuration value updated', {
          configId,
          key,
          environment,
          userId
        });

        // Clear cache
        await this.clearValueCache(configId, key);

        // Emit event
        await this.notificationService.emit(ConfigurationService.EVENTS.CONFIG_VALUE_CHANGED, {
          configId,
          key,
          oldValue,
          newValue: value,
          environment,
          userId,
          timestamp: new Date()
        });
      }

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to set configuration value', {
        configId,
        key,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to set configuration value: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates multiple configuration values
   * @async
   * @param {string} configId - Configuration ID
   * @param {Object} updates - Key-value pairs to update
   * @param {Object} [options={}] - Update options
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async updateConfigurationValues(configId, updates, options = {}) {
    const session = await TransactionManager.startSession();
    
    try {
      const { environment, userId, comment, createIfNotExists = false } = options;

      logger.info('Updating multiple configuration values', {
        configId,
        updateCount: Object.keys(updates).length,
        environment,
        userId
      });

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      
      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${configId}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { configId }
        );
      }

      // Check if configuration is locked
      if (configuration.status.locked && configuration.status.lockedBy.toString() !== userId) {
        throw new AppError(
          'Configuration is locked by another user',
          423,
          'CONFIGURATION_LOCKED',
          { 
            configId,
            lockedBy: configuration.status.lockedBy 
          }
        );
      }

      const changes = [];
      
      for (const [key, value] of Object.entries(updates)) {
        let changeType = 'modify';
        let oldValue = undefined;
        
        if (environment) {
          // Handle environment-specific configuration
          let envConfig = configuration.environments.find(e => e.environment === environment);
          
          if (!envConfig && createIfNotExists) {
            envConfig = {
              environment,
              active: true,
              configurations: {}
            };
            configuration.environments.push(envConfig);
          }
          
          if (envConfig) {
            oldValue = envConfig.configurations[key];
            envConfig.configurations[key] = value;
            
            changes.push({
              key,
              changeType: oldValue === undefined ? 'add' : 'modify',
              oldValue,
              newValue: value,
              environment
            });
          }
        } else {
          // Handle base configuration
          const configItem = configuration.configurations.find(c => c.key === key);
          
          if (configItem) {
            oldValue = configItem.value;
            
            // Handle encryption
            if (value && typeof value === 'object' && value.__encrypted) {
              configItem.value = await this.encryptionService.encrypt(value.value);
              configItem.encrypted = true;
            } else {
              configItem.value = value;
            }
            
            changes.push({
              key,
              changeType: 'modify',
              oldValue,
              newValue: value
            });
          } else if (createIfNotExists) {
            const newConfigItem = {
              key,
              value,
              dataType: typeof value,
              encrypted: false,
              category: 'general',
              description: `Auto-created configuration key: ${key}`,
              required: false
            };
            
            // Handle encryption for new items
            if (value && typeof value === 'object' && value.__encrypted) {
              newConfigItem.value = await this.encryptionService.encrypt(value.value);
              newConfigItem.encrypted = true;
            }
            
            configuration.configurations.push(newConfigItem);
            
            changes.push({
              key,
              changeType: 'add',
              newValue: value
            });
          }
        }
      }

      if (changes.length > 0) {
        // Update metadata
        configuration.metadata.lastModifiedBy = userId;

        // Add version entry
        const newVersion = {
          version: this.generateNextVersion(configuration.versions),
          changes,
          comment: comment || `Bulk update of ${changes.length} values`,
          createdBy: userId,
          createdAt: new Date()
        };

        configuration.versions.push(newVersion);

        // Save configuration
        await configuration.save({ session });

        // Create audit entry
        await this.auditService.log({
          userId,
          action: 'configuration.bulk.update',
          resource: 'configuration',
          resourceId: configId,
          details: {
            changeCount: changes.length,
            environment,
            keys: changes.map(c => c.key)
          },
          session
        });

        await session.commitTransaction();

        logger.info('Configuration values updated', {
          configId,
          changeCount: changes.length,
          userId
        });

        // Clear cache
        await this.clearConfigurationCache(configId);
        
        // Clear individual value caches
        for (const change of changes) {
          await this.clearValueCache(configId, change.key);
        }

        // Emit event
        await this.notificationService.emit(ConfigurationService.EVENTS.CONFIG_UPDATED, {
          configId,
          changes,
          environment,
          userId,
          timestamp: new Date()
        });
      }

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update configuration values', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update configuration values: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Deletes configuration key
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key to delete
   * @param {Object} [options={}] - Delete options
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If deletion fails
   */
  async deleteConfigurationKey(configId, key, options = {}) {
    const session = await TransactionManager.startSession();
    
    try {
      const { environment, userId, comment } = options;

      logger.info('Deleting configuration key', {
        configId,
        key,
        environment,
        userId
      });

      const ConfigurationModel = await this._getConfigurationModel();

      // Find configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      
      if (!configuration) {
        throw new AppError(
          `Configuration not found: ${configId}`,
          404,
          'CONFIGURATION_NOT_FOUND',
          { configId }
        );
      }

      // Check if configuration is locked
      if (configuration.status.locked && configuration.status.lockedBy.toString() !== userId) {
        throw new AppError(
          'Configuration is locked by another user',
          423,
          'CONFIGURATION_LOCKED',
          { 
            configId,
            lockedBy: configuration.status.lockedBy 
          }
        );
      }

      let deleted = false;
      let oldValue = undefined;

      if (environment) {
        // Handle environment-specific configuration
        const envConfig = configuration.environments.find(e => e.environment === environment);
        
        if (envConfig && envConfig.configurations && envConfig.configurations[key] !== undefined) {
          oldValue = envConfig.configurations[key];
          delete envConfig.configurations[key];
          deleted = true;
        }
      } else {
        // Handle base configuration
        const configIndex = configuration.configurations.findIndex(c => c.key === key);
        
        if (configIndex !== -1) {
          oldValue = configuration.configurations[configIndex].value;
          configuration.configurations.splice(configIndex, 1);
          deleted = true;
        }
      }

      if (!deleted) {
        throw new AppError(
          `Configuration key not found: ${key}`,
          404,
          'CONFIGURATION_KEY_NOT_FOUND',
          { configId, key }
        );
      }

      // Update metadata
      configuration.metadata.lastModifiedBy = userId;

      // Add version entry
      const versionChange = {
        key,
        changeType: 'delete',
        oldValue,
        environment
      };

      const newVersion = {
        version: this.generateNextVersion(configuration.versions),
        changes: [versionChange],
        comment: comment || `Deleted ${key} key`,
        createdBy: userId,
        createdAt: new Date()
      };

      configuration.versions.push(newVersion);

      // Save configuration
      await configuration.save({ session });

      // Create audit entry
      await this.auditService.log({
        userId,
        action: 'configuration.key.delete',
        resource: 'configuration',
        resourceId: configId,
        details: {
          key,
          environment,
          hadValue: oldValue !== undefined
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration key deleted', {
        configId,
        key,
        environment,
        userId
      });

      // Clear cache
      await this.clearValueCache(configId, key);

      // Emit event
      await this.notificationService.emit(ConfigurationService.EVENTS.CONFIG_VALUE_CHANGED, {
        configId,
        key,
        oldValue,
        newValue: undefined,
        environment,
        changeType: 'delete',
        userId,
        timestamp: new Date()
      });

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to delete configuration key', {
        configId,
        key,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to delete configuration key: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Searches configuration values
   * @async
   * @param {string} query - Search query
   * @param {Object} [options={}] - Search options
   * @returns {Promise<Object>} Search results
   * @throws {AppError} If search fails
   */
  async searchConfigurationValues(query, options = {}) {
    try {
      const {
        limit = 50,
        page = 1,
        includeValues = false,
        environment,
        configType,
        category
      } = options;

      logger.info('Searching configuration values', {
        query,
        limit,
        page,
        includeValues,
        environment
      });

      const ConfigurationModel = await this._getConfigurationModel();

      // Build search conditions
      const searchConditions = {
        'status.active': true
      };

      if (configType) {
        searchConditions.configType = configType;
      }

      if (category) {
        searchConditions['metadata.category'] = category;
      }

      // Text search
      if (query) {
        searchConditions.$or = [
          { name: new RegExp(query, 'i') },
          { displayName: new RegExp(query, 'i') },
          { description: new RegExp(query, 'i') },
          { 'configurations.key': new RegExp(query, 'i') },
          { 'configurations.description': new RegExp(query, 'i') },
          { 'metadata.tags': new RegExp(query, 'i') }
        ];
      }

      // Execute search
      const [configurations, total] = await Promise.all([
        ConfigurationModel
          .find(searchConditions)
          .select(includeValues ? '' : '-configurations.value -versions')
          .populate('metadata.createdBy', 'username email')
          .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ConfigurationModel.countDocuments(searchConditions)
      ]);

      // Process results
      const results = configurations.map(config => {
        const result = {
          configId: config.configId,
          name: config.name,
          displayName: config.displayName,
          description: config.description,
          configType: config.configType,
          category: config.metadata.category,
          tags: config.metadata.tags,
          createdBy: config.metadata.createdBy,
          updatedAt: config.updatedAt
        };

        // Add matching keys
        if (config.configurations) {
          result.matchingKeys = config.configurations
            .filter(c => !query || c.key.toLowerCase().includes(query.toLowerCase()) || 
                        (c.description && c.description.toLowerCase().includes(query.toLowerCase())))
            .map(c => ({
              key: c.key,
              description: c.description,
              category: c.category,
              dataType: c.dataType,
              value: includeValues ? (c.encrypted ? '[ENCRYPTED]' : c.value) : undefined
            }));
        }

        return result;
      });

      return {
        success: true,
        data: {
          results,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
          },
          query,
          resultCount: results.length
        }
      };
    } catch (error) {
      logger.error('Failed to search configuration values', {
        query,
        error: error.message
      });
      throw new AppError(`Failed to search configuration values: ${error.message}`, 500);
    }
  }

  /**
   * Gets global configuration statistics
   * @async
   * @returns {Promise<Object>} Configuration statistics
   * @throws {AppError} If retrieval fails
   */
  async getGlobalStatistics() {
    try {
      // Try cache first
      const cacheKey = ConfigurationService.CACHE_KEYS.CONFIG_STATS;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const ConfigurationModel = await this._getConfigurationModel();

      // Aggregate statistics
      const [
        totalConfigs,
        activeConfigs,
        configsByType,
        recentlyUpdated,
        lockedConfigs
      ] = await Promise.all([
        ConfigurationModel.countDocuments(),
        ConfigurationModel.countDocuments({ 'status.active': true }),
        ConfigurationModel.aggregate([
          { $group: { _id: '$configType', count: { $sum: 1 } } }
        ]),
        ConfigurationModel.countDocuments({
          updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }),
        ConfigurationModel.countDocuments({ 'status.locked': true })
      ]);

      const statistics = {
        success: true,
        data: {
          total: totalConfigs,
          active: activeConfigs,
          inactive: totalConfigs - activeConfigs,
          locked: lockedConfigs,
          recentlyUpdated,
          byType: configsByType.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          timestamp: new Date()
        }
      };

      // Cache results
      await this.cacheService.set(cacheKey, statistics, 300); // Cache for 5 minutes

      return statistics;
    } catch (error) {
      logger.error('Failed to get configuration statistics', {
        error: error.message
      });
      throw new AppError(`Failed to get configuration statistics: ${error.message}`, 500);
    }
  }

  /**
   * ADDED: Database connectivity test method
   * @async
   * @returns {Promise<Object>} Connectivity test result
   */
  async testDatabaseConnectivity() {
    try {
      const ConfigurationModel = await this._getConfigurationModel();
      
      const startTime = Date.now();
      const count = await ConfigurationModel.countDocuments().maxTimeMS(5000);
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          connected: true,
          responseTime,
          collection: 'configuration_management',
          documentCount: count,
          modelName: 'Configuration'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: {
          connected: false,
          message: error.message,
          collection: 'configuration_management',
          modelName: 'Configuration'
        }
      };
    }
  }

  /**
   * ADDED: Clear cached model (for testing/debugging)
   */
  clearModelCache() {
    this._configurationModel = null;
    if (this.debug) {
      logger.debug('Configuration model cache cleared');
    }
  }

  // Private helper methods

  /**
   * Validates configuration data
   * @private
   * @param {Object} configData - Configuration data to validate
   * @returns {Promise<Object>} Validated data
   * @throws {AppError} If validation fails
   */
  async validateConfigurationData(configData) {
    // Basic validation
    if (!configData.name) {
      throw new AppError('Configuration name is required', 400, 'MISSING_NAME');
    }

    if (!configData.configId) {
      configData.configId = `CONFIG_${stringHelper.generateId()}`;
    }

    // Set defaults
    configData.configType = configData.configType || ConfigurationService.CONFIG_TYPES.APPLICATION;
    configData.configurations = configData.configurations || [];
    configData.environments = configData.environments || [];
    configData.versions = configData.versions || [];
    configData.metadata = configData.metadata || {};
    
    return configData;
  }

  /**
   * Processes configuration response
   * @private
   * @param {Object} configuration - Raw configuration data
   * @param {Object} options - Processing options
   * @returns {Object} Processed configuration
   */
  processConfigurationResponse(configuration, options = {}) {
    const { includeSensitive = false, environment } = options;

    // Filter sensitive data
    if (!includeSensitive && configuration.configurations) {
      configuration.configurations = configuration.configurations.map(config => ({
        ...config,
        value: config.encrypted ? '[ENCRYPTED]' : config.value
      }));
    }

    // Apply environment filter if specified
    if (environment && configuration.environments) {
      const envConfig = configuration.environments.find(e => e.environment === environment);
      if (envConfig) {
        // Merge environment-specific configurations
        const envConfigs = envConfig.configurations || {};
        
        configuration.configurations = configuration.configurations.map(config => ({
          ...config,
          value: envConfigs[config.key] !== undefined ? envConfigs[config.key] : config.value
        }));
      }
    }

    return configuration;
  }

  /**
   * Generates next version number
   * @private
   * @param {Array} versions - Existing versions
   * @returns {string} Next version number
   */
  generateNextVersion(versions) {
    if (!versions || versions.length === 0) {
      return '1.0.0';
    }

    const latestVersion = versions[versions.length - 1].version;
    const [major, minor, patch] = latestVersion.split('.').map(Number);
    
    return `${major}.${minor}.${patch + 1}`;
  }

  /**
   * Detects changes between objects
   * @private
   * @param {Object} original - Original object
   * @param {Object} updated - Updated object
   * @returns {Array} Array of changes
   */
  detectChanges(original, updated) {
    const changes = [];
    
    // Simple implementation - in production, you might use a more sophisticated diff library
    for (const key in updated) {
      if (original[key] !== updated[key]) {
        changes.push({
          field: key,
          oldValue: original[key],
          newValue: updated[key]
        });
      }
    }
    
    return changes;
  }

  /**
   * Clears configuration cache
   * @private
   * @param {string} [configId] - Optional configuration ID
   * @returns {Promise<void>}
   */
  async clearConfigurationCache(configId) {
    try {
      if (configId) {
        await this.cacheService.delete(`config:*${configId}*`);
      } else {
        await this.cacheService.delete('config:*');
      }
    } catch (error) {
      logger.error('Failed to clear configuration cache', {
        configId,
        error: error.message
      });
    }
  }

  /**
   * Clears value cache
   * @private
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key
   * @returns {Promise<void>}
   */
  async clearValueCache(configId, key) {
    try {
      await this.cacheService.delete(`${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:*`);
      await this.cacheService.delete(`${ConfigurationService.CACHE_KEYS.CONFIG_BY_ID}:${configId}`);
    } catch (error) {
      logger.error('Failed to clear value cache', {
        configId,
        key,
        error: error.message
      });
    }
  }
}

// Export singleton instance
module.exports = new ConfigurationService();