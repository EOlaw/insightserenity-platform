'use strict';

/**
 * @fileoverview Configuration management service
 * @module servers/admin-server/modules/platform-management/services/configuration-service
 * @requires module:servers/admin-server/modules/platform-management/models/configuration-model
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
const ConfigurationModel = require('../models/configuration-model');
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
 * @description Service for configuration management operations
 */
class ConfigurationService {
  /**
   * Creates an instance of ConfigurationService
   * @constructor
   */
  constructor() {
    this.#cacheService = new CacheService({
      prefix: 'config:',
      ttl: 600 // 10 minutes default TTL
    });
    this.#notificationService = new NotificationService();
    this.#auditService = new AuditService();
    this.#transactionManager = new TransactionManager();
    this.#encryptionService = new EncryptionService();
    this.#configWatchers = new Map();
    this.#validationCache = new Map();
  }

  // Private fields
  #cacheService;
  #notificationService;
  #auditService;
  #transactionManager;
  #encryptionService;
  #configWatchers;
  #validationCache;

  // Cache keys
  static CACHE_KEYS = {
    CONFIG_BY_ID: 'id',
    CONFIG_BY_NAME: 'name',
    CONFIG_VALUES: 'values',
    CONFIG_LIST: 'list',
    CONFIG_VALIDATION: 'validation'
  };

  // Event types
  static EVENTS = {
    CONFIG_CREATED: 'configuration.created',
    CONFIG_UPDATED: 'configuration.updated',
    CONFIG_DELETED: 'configuration.deleted',
    CONFIG_EXPORTED: 'configuration.exported',
    CONFIG_IMPORTED: 'configuration.imported',
    CONFIG_LOCKED: 'configuration.locked',
    CONFIG_UNLOCKED: 'configuration.unlocked',
    CONFIG_VALIDATED: 'configuration.validated',
    CONFIG_DEPLOYED: 'configuration.deployed',
    CONFIG_ROLLED_BACK: 'configuration.rolled_back'
  };

  // Export formats
  static EXPORT_FORMATS = {
    JSON: 'json',
    YAML: 'yaml',
    XML: 'xml',
    ENV: 'env'
  };

  /**
   * Creates a new configuration set
   * @async
   * @param {Object} configData - Configuration data
   * @param {string} userId - User creating the configuration
   * @returns {Promise<Object>} Created configuration
   * @throws {AppError} If creation fails
   */
  async createConfiguration(configData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Check if configuration name already exists
      const existing = await ConfigurationModel.findOne({ name: configData.name });
      if (existing) {
        throw new AppError(`Configuration with name '${configData.name}' already exists`, 409);
      }

      // Create configuration
      const configuration = new ConfigurationModel({
        ...configData,
        metadata: {
          ...configData.metadata,
          createdBy: userId
        }
      });

      // Add default configurations if none provided
      if (!configuration.configurations || configuration.configurations.length === 0) {
        configuration.configurations = this.#getDefaultConfigurations();
      }

      // Validate configuration
      const validationResult = await configuration.validate();
      if (!validationResult.valid) {
        throw new AppError('Configuration validation failed', 400, { errors: validationResult.errors });
      }

      // Save configuration
      await configuration.save({ session });

      // Create initial version
      configuration.versions.push({
        version: 1,
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
      await this.#auditService.log({
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
      await this.#clearConfigurationCache();

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_CREATED, {
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
   * Gets configuration by ID or name
   * @async
   * @param {string} identifier - Configuration ID or name
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Configuration
   * @throws {AppError} If configuration not found
   */
  async getConfiguration(identifier, options = {}) {
    try {
      const { 
        environment, 
        includeVersions = false, 
        includeSensitive = false,
        fromCache = true 
      } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_BY_ID}:${identifier}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return this.#processConfigurationResponse(cached, { includeSensitive });
        }
      }

      // Find configuration
      const query = identifier.startsWith('CONFIG_') ? 
        { configId: identifier } : 
        { name: identifier };

      const configuration = await ConfigurationModel.findOne(query)
        .populate('metadata.createdBy', 'name email')
        .populate('metadata.lastModifiedBy', 'name email')
        .populate('versions.createdBy', 'name email')
        .lean();

      if (!configuration) {
        throw new AppError(`Configuration '${identifier}' not found`, 404);
      }

      // Apply environment overrides if specified
      if (environment) {
        configuration.configurations = await this.#applyEnvironmentOverrides(
          configuration,
          environment
        );
      }

      // Remove version history if not requested
      if (!includeVersions) {
        delete configuration.versions;
      }

      // Process response
      const result = this.#processConfigurationResponse(configuration, { includeSensitive });

      // Cache result
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_BY_ID}:${identifier}`;
        await this.#cacheService.set(cacheKey, result, 600);
      }

      return result;
    } catch (error) {
      logger.error('Failed to get configuration', {
        identifier,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get configuration: ${error.message}`, 500);
    }
  }

  /**
   * Gets configuration value
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key
   * @param {Object} [options={}] - Query options
   * @returns {Promise<*>} Configuration value
   * @throws {AppError} If key not found
   */
  async getConfigurationValue(configId, key, options = {}) {
    try {
      const { environment, fromCache = true } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:${environment || 'base'}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          return cached;
        }
      }

      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId });
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Get value
      const value = configuration.getValue(key, environment);

      // Cache value
      if (fromCache) {
        const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:${environment || 'base'}`;
        await this.#cacheService.set(cacheKey, value, 300); // 5 minutes
      }

      return value;
    } catch (error) {
      logger.error('Failed to get configuration value', {
        configId,
        key,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get configuration value: ${error.message}`, 500);
    }
  }

  /**
   * Sets configuration value
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key
   * @param {*} value - New value
   * @param {Object} options - Set options
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async setConfigurationValue(configId, key, value, options) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check access control
      if (!await this.#checkWriteAccess(configuration, options.userId)) {
        throw new AppError('Insufficient permissions to modify configuration', 403);
      }

      // Set value
      await configuration.setValue(key, value, options);

      // Save changes
      await configuration.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId: options.userId,
        action: 'configuration.update_value',
        resource: 'configuration',
        resourceId: configId,
        details: {
          key,
          environment: options.environment,
          valueChanged: true
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration value updated', {
        configId,
        key,
        environment: options.environment,
        userId: options.userId
      });

      // Clear cache
      await this.#clearValueCache(configId, key);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_UPDATED, {
        configId,
        key,
        environment: options.environment,
        userId: options.userId,
        timestamp: new Date()
      });

      // Notify watchers
      await this.#notifyWatchers(configId, key, value, options.environment);

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
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async updateConfigurationValues(configId, updates, options) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check access control
      if (!await this.#checkWriteAccess(configuration, options.userId)) {
        throw new AppError('Insufficient permissions to modify configuration', 403);
      }

      // Update values
      const updatedKeys = [];
      for (const [key, value] of Object.entries(updates)) {
        await configuration.setValue(key, value, {
          ...options,
          createIfNotExists: options.createIfNotExists || false
        });
        updatedKeys.push(key);
      }

      // Save changes
      await configuration.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId: options.userId,
        action: 'configuration.batch_update',
        resource: 'configuration',
        resourceId: configId,
        details: {
          keysUpdated: updatedKeys,
          environment: options.environment,
          updateCount: updatedKeys.length
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration values updated', {
        configId,
        keysUpdated: updatedKeys,
        environment: options.environment,
        userId: options.userId
      });

      // Clear cache
      await this.#clearConfigurationCache(configId);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_UPDATED, {
        configId,
        keysUpdated: updatedKeys,
        environment: options.environment,
        userId: options.userId,
        timestamp: new Date()
      });

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
   * Deletes a configuration key
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If deletion fails
   */
  async deleteConfigurationKey(configId, key, options) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check access control
      if (!await this.#checkWriteAccess(configuration, options.userId)) {
        throw new AppError('Insufficient permissions to modify configuration', 403);
      }

      // Delete key
      await configuration.deleteKey(key, options);

      // Save changes
      await configuration.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId: options.userId,
        action: 'configuration.delete_key',
        resource: 'configuration',
        resourceId: configId,
        details: {
          key,
          environment: options.environment
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration key deleted', {
        configId,
        key,
        environment: options.environment,
        userId: options.userId
      });

      // Clear cache
      await this.#clearValueCache(configId, key);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_UPDATED, {
        configId,
        key,
        action: 'delete',
        environment: options.environment,
        userId: options.userId,
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
   * Lists configurations
   * @async
   * @param {Object} [filters={}] - Query filters
   * @returns {Promise<Object>} Configuration list with pagination
   */
  async listConfigurations(filters = {}) {
    try {
      const {
        category,
        environment,
        tag,
        active = true,
        search,
        page = 1,
        limit = 20,
        sort = '-createdAt'
      } = filters;

      // Build query
      const query = {};
      
      if (active !== undefined) {
        query['status.active'] = active;
      }

      if (category) {
        query['metadata.category'] = category;
      }

      if (environment) {
        query['environments.environment'] = environment;
      }

      if (tag) {
        query['metadata.tags'] = tag;
      }

      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { displayName: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ];
      }

      // Execute query with pagination
      const [configurations, total] = await Promise.all([
        ConfigurationModel.find(query)
          .select('-configurations -versions -auditTrail')
          .populate('metadata.createdBy', 'name email')
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ConfigurationModel.countDocuments(query)
      ]);

      return {
        configurations,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to list configurations', {
        filters,
        error: error.message
      });
      throw new AppError(`Failed to list configurations: ${error.message}`, 500);
    }
  }

  /**
   * Searches configuration values
   * @async
   * @param {string} query - Search query
   * @param {Object} [options={}] - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchConfigurationValues(query, options = {}) {
    try {
      const { category, limit = 50 } = options;

      // Search configurations
      const configurations = await ConfigurationModel.searchConfigurations(query, { category });

      // Extract matching configuration items
      const results = [];
      
      for (const config of configurations) {
        for (const item of config.configurations) {
          if (
            item.key.toLowerCase().includes(query.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(query.toLowerCase()))
          ) {
            results.push({
              configId: config.configId,
              configName: config.name,
              key: item.key,
              type: item.type,
              category: item.category,
              description: item.description,
              value: item.sensitive ? '[SENSITIVE]' : item.value
            });

            if (results.length >= limit) break;
          }
        }
        if (results.length >= limit) break;
      }

      return results;
    } catch (error) {
      logger.error('Failed to search configuration values', {
        query,
        error: error.message
      });
      throw new AppError(`Failed to search configuration values: ${error.message}`, 500);
    }
  }

  /**
   * Exports configuration
   * @async
   * @param {string} configId - Configuration ID
   * @param {Object} options - Export options
   * @returns {Promise<string>} Exported configuration
   * @throws {AppError} If export fails
   */
  async exportConfiguration(configId, options) {
    try {
      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId });
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check access control
      if (!await this.#checkReadAccess(configuration, options.userId)) {
        throw new AppError('Insufficient permissions to export configuration', 403);
      }

      // Export configuration
      const exported = await configuration.export(options.format || 'json', options);

      // Create audit entry
      await this.#auditService.log({
        userId: options.userId,
        action: 'configuration.export',
        resource: 'configuration',
        resourceId: configId,
        details: {
          format: options.format,
          environment: options.environment,
          includeSensitive: options.includeSensitive
        }
      });

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_EXPORTED, {
        configId,
        format: options.format,
        userId: options.userId,
        timestamp: new Date()
      });

      logger.info('Configuration exported', {
        configId,
        format: options.format,
        userId: options.userId
      });

      return exported;
    } catch (error) {
      logger.error('Failed to export configuration', {
        configId,
        options,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to export configuration: ${error.message}`, 500);
    }
  }

  /**
   * Imports configuration
   * @async
   * @param {string} data - Configuration data to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Imported configuration
   * @throws {AppError} If import fails
   */
  async importConfiguration(data, options) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Parse imported data
      const parsed = await this.#parseImportData(data, options.format);

      // Check if configuration already exists
      let configuration;
      if (parsed.name) {
        configuration = await ConfigurationModel.findOne({ name: parsed.name }).session(session);
      }

      if (configuration) {
        // Update existing configuration
        if (!await this.#checkWriteAccess(configuration, options.userId)) {
          throw new AppError('Insufficient permissions to update configuration', 403);
        }

        // Update values
        for (const [key, item] of Object.entries(parsed.configurations)) {
          const value = typeof item === 'object' ? item.value : item;
          await configuration.setValue(key, value, {
            userId: options.userId,
            createIfNotExists: true,
            comment: 'Imported from ' + options.format
          });
        }
      } else {
        // Create new configuration
        configuration = new ConfigurationModel({
          name: parsed.name || `imported_${Date.now()}`,
          displayName: parsed.displayName || 'Imported Configuration',
          description: parsed.description || 'Configuration imported from ' + options.format,
          configurations: [],
          metadata: {
            createdBy: options.userId
          }
        });

        // Add configurations
        for (const [key, item] of Object.entries(parsed.configurations)) {
          if (typeof item === 'object' && item.value !== undefined) {
            configuration.configurations.push({
              key,
              value: item.value,
              type: item.type || this.#detectValueType(item.value),
              category: item.category || 'imported',
              description: item.description
            });
          } else {
            configuration.configurations.push({
              key,
              value: item,
              type: this.#detectValueType(item),
              category: 'imported'
            });
          }
        }

        await configuration.save({ session });
      }

      // Update import tracking
      configuration.importExport.lastImport = {
        timestamp: new Date(),
        source: options.source || 'manual',
        importedBy: options.userId
      };

      await configuration.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId: options.userId,
        action: 'configuration.import',
        resource: 'configuration',
        resourceId: configuration.configId,
        details: {
          format: options.format,
          source: options.source,
          itemCount: Object.keys(parsed.configurations).length
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration imported', {
        configId: configuration.configId,
        format: options.format,
        itemCount: Object.keys(parsed.configurations).length,
        userId: options.userId
      });

      // Clear cache
      await this.#clearConfigurationCache(configuration.configId);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_IMPORTED, {
        configuration: configuration.toObject(),
        format: options.format,
        userId: options.userId,
        timestamp: new Date()
      });

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to import configuration', {
        format: options.format,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to import configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Validates configuration
   * @async
   * @param {string} configId - Configuration ID
   * @returns {Promise<Object>} Validation results
   * @throws {AppError} If validation fails
   */
  async validateConfiguration(configId) {
    try {
      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId });
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Perform validation
      const validationResult = await configuration.validate();

      // Cache validation result
      const cacheKey = `${ConfigurationService.CACHE_KEYS.CONFIG_VALIDATION}:${configId}`;
      await this.#cacheService.set(cacheKey, validationResult, 300); // 5 minutes

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_VALIDATED, {
        configId,
        validationResult,
        timestamp: new Date()
      });

      logger.info('Configuration validated', {
        configId,
        valid: validationResult.valid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      });

      return validationResult;
    } catch (error) {
      logger.error('Failed to validate configuration', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to validate configuration: ${error.message}`, 500);
    }
  }

  /**
   * Locks configuration
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} userId - User locking the configuration
   * @param {string} reason - Lock reason
   * @returns {Promise<Object>} Locked configuration
   * @throws {AppError} If locking fails
   */
  async lockConfiguration(configId, userId, reason) {
    try {
      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId });
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check permissions
      if (!await this.#checkWriteAccess(configuration, userId)) {
        throw new AppError('Insufficient permissions to lock configuration', 403);
      }

      // Lock configuration
      await configuration.lock(userId, reason);

      // Clear cache
      await this.#clearConfigurationCache(configId);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_LOCKED, {
        configId,
        userId,
        reason,
        timestamp: new Date()
      });

      // Send notification
      await this.#notificationService.sendToAdmins({
        type: 'configuration.locked',
        title: 'Configuration Locked',
        message: `Configuration '${configuration.displayName}' has been locked by ${userId}`,
        severity: 'medium',
        data: { configId, reason }
      });

      return configuration.toObject();
    } catch (error) {
      logger.error('Failed to lock configuration', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to lock configuration: ${error.message}`, 500);
    }
  }

  /**
   * Unlocks configuration
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} userId - User unlocking the configuration
   * @returns {Promise<Object>} Unlocked configuration
   * @throws {AppError} If unlocking fails
   */
  async unlockConfiguration(configId, userId) {
    try {
      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId });
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check permissions
      if (!await this.#checkWriteAccess(configuration, userId)) {
        throw new AppError('Insufficient permissions to unlock configuration', 403);
      }

      // Unlock configuration
      await configuration.unlock(userId);

      // Clear cache
      await this.#clearConfigurationCache(configId);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_UNLOCKED, {
        configId,
        userId,
        timestamp: new Date()
      });

      return configuration.toObject();
    } catch (error) {
      logger.error('Failed to unlock configuration', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to unlock configuration: ${error.message}`, 500);
    }
  }

  /**
   * Rolls back configuration to a specific version
   * @async
   * @param {string} configId - Configuration ID
   * @param {number} targetVersion - Target version number
   * @param {string} userId - User performing rollback
   * @returns {Promise<Object>} Rolled back configuration
   * @throws {AppError} If rollback fails
   */
  async rollbackConfiguration(configId, targetVersion, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get configuration
      const configuration = await ConfigurationModel.findOne({ configId }).session(session);
      if (!configuration) {
        throw new AppError('Configuration not found', 404);
      }

      // Check permissions
      if (!await this.#checkWriteAccess(configuration, userId)) {
        throw new AppError('Insufficient permissions to rollback configuration', 403);
      }

      // Perform rollback
      await configuration.rollbackToVersion(targetVersion, userId);

      // Save changes
      await configuration.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'configuration.rollback',
        resource: 'configuration',
        resourceId: configId,
        details: {
          fromVersion: configuration.currentVersion - 1,
          toVersion: targetVersion
        },
        session
      });

      await session.commitTransaction();

      logger.info('Configuration rolled back', {
        configId,
        targetVersion,
        userId
      });

      // Clear cache
      await this.#clearConfigurationCache(configId);

      // Emit event
      await this.#notificationService.emit(ConfigurationService.EVENTS.CONFIG_ROLLED_BACK, {
        configId,
        targetVersion,
        userId,
        timestamp: new Date()
      });

      // Send notification
      await this.#notificationService.sendToAdmins({
        type: 'configuration.rolled_back',
        title: 'Configuration Rolled Back',
        message: `Configuration '${configuration.displayName}' rolled back to version ${targetVersion}`,
        severity: 'high',
        data: { configId, targetVersion }
      });

      return configuration.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to rollback configuration', {
        configId,
        targetVersion,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to rollback configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Watches configuration for changes
   * @async
   * @param {string} configId - Configuration ID
   * @param {string} key - Configuration key to watch
   * @param {Function} callback - Callback function
   * @returns {string} Watcher ID
   */
  watchConfiguration(configId, key, callback) {
    const watcherId = `${configId}:${key}:${Date.now()}`;
    
    if (!this.#configWatchers.has(configId)) {
      this.#configWatchers.set(configId, new Map());
    }
    
    const configWatchers = this.#configWatchers.get(configId);
    
    if (!configWatchers.has(key)) {
      configWatchers.set(key, new Map());
    }
    
    configWatchers.get(key).set(watcherId, callback);
    
    logger.debug('Configuration watcher added', {
      configId,
      key,
      watcherId
    });
    
    return watcherId;
  }

  /**
   * Stops watching configuration
   * @param {string} watcherId - Watcher ID
   */
  unwatchConfiguration(watcherId) {
    const [configId, key] = watcherId.split(':');
    
    if (this.#configWatchers.has(configId)) {
      const configWatchers = this.#configWatchers.get(configId);
      
      if (configWatchers.has(key)) {
        configWatchers.get(key).delete(watcherId);
        
        if (configWatchers.get(key).size === 0) {
          configWatchers.delete(key);
        }
      }
      
      if (configWatchers.size === 0) {
        this.#configWatchers.delete(configId);
      }
    }
    
    logger.debug('Configuration watcher removed', { watcherId });
  }

  /**
   * Gets configuration statistics
   * @async
   * @param {string} [configId] - Optional configuration ID
   * @returns {Promise<Object>} Configuration statistics
   */
  async getConfigurationStatistics(configId) {
    try {
      if (configId) {
        // Get statistics for specific configuration
        const configuration = await ConfigurationModel.findOne({ configId });
        if (!configuration) {
          throw new AppError('Configuration not found', 404);
        }

        return {
          configId,
          name: configuration.name,
          itemCount: configuration.configurations.length,
          environmentCount: configuration.environments.length,
          versionCount: configuration.versions.length,
          lastModified: configuration.updatedAt,
          validationStatus: configuration.status.validationStatus,
          locked: configuration.status.locked,
          categories: [...new Set(configuration.configurations.map(c => c.category))],
          sensitiveCount: configuration.configurations.filter(c => c.sensitive).length,
          encryptedCount: configuration.configurations.filter(c => c.encrypted).length
        };
      } else {
        // Get overall statistics
        const [total, active, locked, invalid] = await Promise.all([
          ConfigurationModel.countDocuments(),
          ConfigurationModel.countDocuments({ 'status.active': true }),
          ConfigurationModel.countDocuments({ 'status.locked': true }),
          ConfigurationModel.countDocuments({ 'status.validationStatus': 'invalid' })
        ]);

        return {
          total,
          active,
          inactive: total - active,
          locked,
          invalid,
          categories: await ConfigurationModel.distinct('configurations.category'),
          environments: await ConfigurationModel.distinct('environments.environment')
        };
      }
    } catch (error) {
      logger.error('Failed to get configuration statistics', {
        configId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get configuration statistics: ${error.message}`, 500);
    }
  }

  // Private helper methods

  /**
   * Applies environment overrides to configuration
   * @private
   * @param {Object} configuration - Configuration object
   * @param {string} environment - Environment name
   * @returns {Array} Configurations with overrides applied
   */
  #applyEnvironmentOverrides(configuration, environment) {
    const env = configuration.environments.find(e => e.environment === environment);
    if (!env) {
      return configuration.configurations;
    }

    const result = [...configuration.configurations];
    
    for (const override of env.overrides) {
      const configIndex = result.findIndex(c => c.key === override.key);
      if (configIndex !== -1) {
        result[configIndex] = {
          ...result[configIndex],
          value: override.value,
          encrypted: override.encrypted
        };
      }
    }

    return result;
  }

  /**
   * Processes configuration response
   * @private
   * @param {Object} configuration - Raw configuration
   * @param {Object} options - Processing options
   * @returns {Object} Processed configuration
   */
  #processConfigurationResponse(configuration, options = {}) {
    const processed = { ...configuration };

    // Handle sensitive values
    if (!options.includeSensitive) {
      if (processed.configurations) {
        processed.configurations = processed.configurations.map(config => {
          if (config.sensitive) {
            return {
              ...config,
              value: '[REDACTED]'
            };
          }
          return config;
        });
      }
    }

    // Add computed properties
    processed.statistics = {
      itemCount: processed.configurations?.length || 0,
      environmentCount: processed.environments?.length || 0,
      versionCount: processed.versions?.length || 0
    };

    return processed;
  }

  /**
   * Checks read access for configuration
   * @private
   * @param {Object} configuration - Configuration instance
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Whether user has read access
   */
  async #checkReadAccess(configuration, userId) {
    // In production, implement proper access control
    // For now, check basic visibility
    if (configuration.accessControl.visibility === 'public') {
      return true;
    }

    // Check if user is creator
    if (configuration.metadata.createdBy.toString() === userId) {
      return true;
    }

    // Check read roles
    // In production, get user roles and check against configuration.accessControl.readRoles
    
    return true; // Placeholder
  }

  /**
   * Checks write access for configuration
   * @private
   * @param {Object} configuration - Configuration instance
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Whether user has write access
   */
  async #checkWriteAccess(configuration, userId) {
    // Check if configuration is locked
    if (configuration.status.locked) {
      // Only the user who locked it can modify
      return configuration.status.lockedBy?.toString() === userId;
    }

    // Check if user is creator
    if (configuration.metadata.createdBy.toString() === userId) {
      return true;
    }

    // Check write roles
    // In production, get user roles and check against configuration.accessControl.writeRoles
    
    return true; // Placeholder
  }

  /**
   * Parses import data based on format
   * @private
   * @param {string} data - Raw import data
   * @param {string} format - Data format
   * @returns {Promise<Object>} Parsed configuration
   */
  async #parseImportData(data, format) {
    try {
      switch (format) {
        case ConfigurationService.EXPORT_FORMATS.JSON:
          return JSON.parse(data);

        case ConfigurationService.EXPORT_FORMATS.YAML:
          return yaml.load(data);

        case ConfigurationService.EXPORT_FORMATS.XML:
          const parser = new xml2js.Parser({ explicitArray: false });
          const result = await parser.parseStringPromise(data);
          return this.#normalizeXMLImport(result.configuration || result);

        case ConfigurationService.EXPORT_FORMATS.ENV:
          return this.#parseEnvFormat(data);

        default:
          throw new AppError(`Unsupported import format: ${format}`, 400);
      }
    } catch (error) {
      logger.error('Failed to parse import data', {
        format,
        error: error.message
      });
      // throw new AppError(`Failed to parse ${format} data: ${error.message}`, 400);
    }
  }

  /**
   * Normalizes XML import data
   * @private
   * @param {Object} xmlData - Parsed XML data
   * @returns {Object} Normalized configuration
   */
  #normalizeXMLImport(xmlData) {
    const normalized = {
      name: xmlData.name || xmlData.$.name,
      displayName: xmlData.displayName,
      description: xmlData.description,
      configurations: {}
    };

    // Extract configurations
    const configs = xmlData.configurations || xmlData.configuration || xmlData;
    
    for (const [key, value] of Object.entries(configs)) {
      if (key !== '$' && key !== 'name' && key !== 'displayName' && key !== 'description') {
        normalized.configurations[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Parses environment variable format
   * @private
   * @param {string} data - ENV format data
   * @returns {Object} Parsed configuration
   */
  #parseEnvFormat(data) {
    const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const configurations = {};

    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        const value = valueParts.join('=').trim();
        configurations[key.trim()] = this.#parseEnvValue(value);
      }
    }

    return {
      name: 'env_import',
      displayName: 'Environment Import',
      configurations
    };
  }

  /**
   * Parses environment variable value
   * @private
   * @param {string} value - Raw value
   * @returns {*} Parsed value
   */
  #parseEnvValue(value) {
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      // Check for boolean
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;

      // Check for number
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        return parseFloat(value);
      }

      // Return as string
      return value;
    }
  }

  /**
   * Detects value type
   * @private
   * @param {*} value - Value to check
   * @returns {string} Detected type
   */
  #detectValueType(value) {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') {
      if (/^https?:\/\//.test(value)) return 'url';
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    }
    return 'string';
  }

  /**
   * Gets default configurations
   * @private
   * @returns {Array} Default configuration items
   */
  #getDefaultConfigurations() {
    return [
      {
        key: 'app.name',
        value: 'InsightSerenity Platform',
        type: 'string',
        category: 'application',
        description: 'Application name'
      },
      {
        key: 'app.environment',
        value: 'development',
        type: 'string',
        category: 'application',
        description: 'Application environment',
        allowedValues: ['development', 'staging', 'production']
      },
      {
        key: 'app.debug',
        value: false,
        type: 'boolean',
        category: 'application',
        description: 'Debug mode'
      },
      {
        key: 'api.timeout',
        value: 30000,
        type: 'number',
        category: 'api',
        description: 'API request timeout in milliseconds'
      }
    ];
  }

  /**
   * Notifies configuration watchers
   * @private
   * @param {string} configId - Configuration ID
   * @param {string} key - Changed key
   * @param {*} value - New value
   * @param {string} environment - Environment
   * @returns {Promise<void>}
   */
  async #notifyWatchers(configId, key, value, environment) {
    if (!this.#configWatchers.has(configId)) {
      return;
    }

    const configWatchers = this.#configWatchers.get(configId);
    
    // Notify exact key watchers
    if (configWatchers.has(key)) {
      const watchers = configWatchers.get(key);
      for (const [watcherId, callback] of watchers) {
        try {
          await callback({
            configId,
            key,
            value,
            environment,
            timestamp: new Date()
          });
        } catch (error) {
          logger.error('Error in configuration watcher callback', {
            watcherId,
            error: error.message
          });
        }
      }
    }

    // Notify wildcard watchers
    if (configWatchers.has('*')) {
      const wildcardWatchers = configWatchers.get('*');
      for (const [watcherId, callback] of wildcardWatchers) {
        try {
          await callback({
            configId,
            key,
            value,
            environment,
            timestamp: new Date()
          });
        } catch (error) {
          logger.error('Error in configuration wildcard watcher callback', {
            watcherId,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Clears configuration cache
   * @private
   * @param {string} [configId] - Optional configuration ID
   * @returns {Promise<void>}
   */
  async #clearConfigurationCache(configId) {
    try {
      if (configId) {
        await this.#cacheService.delete(`config:*${configId}*`);
      } else {
        await this.#cacheService.delete('config:*');
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
  async #clearValueCache(configId, key) {
    try {
      await this.#cacheService.delete(`${ConfigurationService.CACHE_KEYS.CONFIG_VALUES}:${configId}:${key}:*`);
      await this.#cacheService.delete(`${ConfigurationService.CACHE_KEYS.CONFIG_BY_ID}:${configId}`);
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