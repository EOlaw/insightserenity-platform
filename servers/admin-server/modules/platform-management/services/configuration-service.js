'use strict';

/**
 * @fileoverview Configuration management service
 * @module servers/admin-server/modules/platform-management/services/configuration-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/admin-server/modules/platform-management/models/configuration-model
 */

const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const ConfigurationModel = require('../models/configuration-model');

/**
 * Service for managing system configurations
 * @class ConfigurationService
 */
class ConfigurationService {
  constructor() {
    this.cacheService = new CacheService('configuration');
    this.cacheKeyPrefix = 'config:';
    this.cacheTTL = 3600; // 1 hour
    this.configWatchers = new Map();
  }

  /**
   * Get configuration by key
   * @param {String} key Configuration key
   * @param {Object} options Query options
   * @returns {Promise<Object>} Configuration
   */
  async getConfiguration(key, options = {}) {
    try {
      const { scope = {}, decrypt = false, skipCache = false } = options;
      
      const cacheKey = `${this.cacheKeyPrefix}${key}:${JSON.stringify(scope)}`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached && !skipCache) {
        return cached;
      }

      const config = await ConfigurationModel.getConfiguration(key, { scope, decrypt });

      // Log access for sensitive configurations
      if (config.security.sensitive && options.userId) {
        await config.logAccess(options.userId, 'read', options.ipAddress);
        
        await AuditService.log({
          action: 'configuration.accessed',
          userId: options.userId,
          resourceType: 'configuration',
          resourceId: config._id,
          details: {
            key: config.key,
            namespace: config.namespace,
            sensitive: true
          },
          ipAddress: options.ipAddress
        });
      }

      // Get effective value with context
      const effectiveValue = config.getEffectiveValue(scope);
      
      const result = {
        key: config.key,
        namespace: config.namespace,
        value: decrypt && config.security.encrypted ? await config.decryptValue() : effectiveValue,
        valueType: config.valueType,
        metadata: config.metadata,
        status: config.status,
        flags: config.flags,
        version: config.version.current,
        effectiveDate: config.effectiveDate,
        expirationDate: config.expirationDate
      };

      if (!config.security.sensitive) {
        await this.cacheService.set(cacheKey, result, config.cache.ttl || this.cacheTTL);
      }

      return result;
    } catch (error) {
      logger.error('Failed to get configuration', { key, error });
      throw error;
    }
  }

  /**
   * Get multiple configurations
   * @param {Array<String>} keys Configuration keys
   * @param {Object} options Query options
   * @returns {Promise<Object>} Configurations map
   */
  async getConfigurations(keys, options = {}) {
    try {
      const configurations = {};
      const errors = [];

      await Promise.all(
        keys.map(async (key) => {
          try {
            configurations[key] = await this.getConfiguration(key, options);
          } catch (error) {
            errors.push({ key, error: error.message });
          }
        })
      );

      if (errors.length > 0) {
        logger.warn('Some configurations failed to load', { errors });
      }

      return { configurations, errors };
    } catch (error) {
      logger.error('Failed to get configurations', error);
      throw error;
    }
  }

  /**
   * Get configurations by namespace
   * @param {String} namespace Configuration namespace
   * @param {Object} options Query options
   * @returns {Promise<Array>} Configurations
   */
  async getConfigurationsByNamespace(namespace, options = {}) {
    try {
      const configs = await ConfigurationModel.getConfigurationsByNamespace(namespace, options);
      
      return configs.map(config => ({
        key: config.key,
        namespace: config.namespace,
        value: config.value,
        valueType: config.valueType,
        metadata: config.metadata,
        status: config.status,
        flags: config.flags
      }));
    } catch (error) {
      logger.error('Failed to get configurations by namespace', { namespace, error });
      throw error;
    }
  }

  /**
   * Create or update configuration
   * @param {Object} configData Configuration data
   * @param {String} userId User ID
   * @returns {Promise<Object>} Created/updated configuration
   */
  async setConfiguration(configData, userId) {
    try {
      const { key, namespace, value, metadata = {} } = configData;

      // Validate required fields
      if (!key || !namespace || value === undefined) {
        throw new AppError('Missing required configuration fields', 400, 'INVALID_CONFIG_DATA');
      }

      // Determine value type
      const valueType = this.#determineValueType(value, configData.valueType);

      const config = await ConfigurationModel.setConfiguration({
        ...configData,
        valueType,
        userId
      });

      // Invalidate cache
      await this.#invalidateConfigCache(key);

      // Trigger watchers
      await this.#triggerConfigWatchers(key, value);

      // Send notification for important configurations
      if (metadata.importance === 'high' || config.flags.requiresRestart) {
        await NotificationService.sendSystemNotification({
          type: 'configuration_updated',
          severity: 'info',
          title: 'Configuration Updated',
          message: `Configuration ${key} has been updated`,
          metadata: {
            key,
            namespace,
            requiresRestart: config.flags.requiresRestart,
            updatedBy: userId
          }
        });
      }

      // Audit log
      await AuditService.log({
        action: 'configuration.updated',
        userId,
        resourceType: 'configuration',
        resourceId: config._id,
        details: {
          key: config.key,
          namespace: config.namespace,
          previousVersion: config.version.current - 1,
          newVersion: config.version.current
        }
      });

      logger.info('Configuration updated', {
        key,
        namespace,
        version: config.version.current,
        updatedBy: userId
      });

      return config;
    } catch (error) {
      logger.error('Failed to set configuration', error);
      throw error;
    }
  }

  /**
   * Bulk update configurations
   * @param {Array} configurations Configuration array
   * @param {String} userId User ID
   * @returns {Promise<Object>} Bulk update results
   */
  async bulkUpdateConfigurations(configurations, userId) {
    try {
      const results = await ConfigurationModel.bulkUpdate(configurations, userId);

      // Invalidate all affected caches
      for (const config of configurations) {
        await this.#invalidateConfigCache(config.key);
      }

      // Audit log
      await AuditService.log({
        action: 'configuration.bulk_updated',
        userId,
        resourceType: 'configuration',
        details: {
          totalConfigurations: configurations.length,
          successful: results.successful.length,
          failed: results.failed.length
        }
      });

      logger.info('Bulk configuration update completed', {
        total: configurations.length,
        successful: results.successful.length,
        failed: results.failed.length,
        updatedBy: userId
      });

      return results;
    } catch (error) {
      logger.error('Failed to bulk update configurations', error);
      throw error;
    }
  }

  /**
   * Delete configuration
   * @param {String} key Configuration key
   * @param {String} userId User ID
   * @returns {Promise<Boolean>} Deletion result
   */
  async deleteConfiguration(key, userId) {
    try {
      const config = await ConfigurationModel.findOne({ key });
      
      if (!config) {
        throw new AppError('Configuration not found', 404, 'CONFIG_NOT_FOUND');
      }

      if (config.flags.isSystem) {
        throw new AppError('Cannot delete system configuration', 403, 'SYSTEM_CONFIG_PROTECTED');
      }

      config.status = 'disabled';
      config.audit.lastModifiedBy = userId;
      await config.save();

      // Invalidate cache
      await this.#invalidateConfigCache(key);

      // Audit log
      await AuditService.log({
        action: 'configuration.deleted',
        userId,
        resourceType: 'configuration',
        resourceId: config._id,
        details: {
          key: config.key,
          namespace: config.namespace
        }
      });

      logger.info('Configuration deleted', {
        key,
        deletedBy: userId
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete configuration', error);
      throw error;
    }
  }

  /**
   * Rollback configuration to previous version
   * @param {String} key Configuration key
   * @param {Number} version Target version
   * @param {String} userId User ID
   * @param {String} reason Rollback reason
   * @returns {Promise<Object>} Rolled back configuration
   */
  async rollbackConfiguration(key, version, userId, reason) {
    try {
      const config = await ConfigurationModel.findOne({ key });
      
      if (!config) {
        throw new AppError('Configuration not found', 404, 'CONFIG_NOT_FOUND');
      }

      await config.rollbackToVersion(version, userId, reason);

      // Invalidate cache
      await this.#invalidateConfigCache(key);

      // Trigger watchers
      await this.#triggerConfigWatchers(key, config.value);

      // Send notification
      await NotificationService.sendSystemNotification({
        type: 'configuration_rollback',
        severity: 'warning',
        title: 'Configuration Rolled Back',
        message: `Configuration ${key} rolled back to version ${version}`,
        metadata: {
          key,
          version,
          reason,
          rolledBackBy: userId
        }
      });

      // Audit log
      await AuditService.log({
        action: 'configuration.rollback',
        userId,
        resourceType: 'configuration',
        resourceId: config._id,
        details: {
          key: config.key,
          rolledBackToVersion: version,
          currentVersion: config.version.current,
          reason
        }
      });

      return config;
    } catch (error) {
      logger.error('Failed to rollback configuration', error);
      throw error;
    }
  }

  /**
   * Get configuration history
   * @param {String} key Configuration key
   * @param {Object} options History options
   * @returns {Promise<Array>} Version history
   */
  async getConfigurationHistory(key, options = {}) {
    try {
      const config = await ConfigurationModel.findOne({ key })
        .select('version key namespace')
        .lean();
      
      if (!config) {
        throw new AppError('Configuration not found', 404, 'CONFIG_NOT_FOUND');
      }

      let history = config.version.history || [];

      // Apply pagination
      const { page = 1, limit = 20 } = options;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      history = history
        .sort((a, b) => b.version - a.version)
        .slice(startIndex, endIndex);

      return {
        key: config.key,
        namespace: config.namespace,
        currentVersion: config.version.current,
        history,
        pagination: {
          page,
          limit,
          total: config.version.history.length,
          pages: Math.ceil(config.version.history.length / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get configuration history', error);
      throw error;
    }
  }

  /**
   * Export configurations
   * @param {Object} options Export options
   * @returns {Promise<Object>} Exported configurations
   */
  async exportConfigurations(options = {}) {
    try {
      const exportData = await ConfigurationModel.exportConfigurations(options);

      // Audit log
      await AuditService.log({
        action: 'configuration.exported',
        userId: options.userId,
        resourceType: 'configuration',
        details: {
          totalExported: exportData.totalConfigurations,
          namespace: options.namespace,
          excludeSecrets: options.excludeSecrets
        }
      });

      logger.info('Configurations exported', {
        count: exportData.totalConfigurations,
        exportedBy: options.userId
      });

      return exportData;
    } catch (error) {
      logger.error('Failed to export configurations', error);
      throw error;
    }
  }

  /**
   * Import configurations
   * @param {Object} importData Import data
   * @param {String} userId User ID
   * @returns {Promise<Object>} Import results
   */
  async importConfigurations(importData, userId) {
    try {
      const results = await ConfigurationModel.importConfigurations(importData, userId);

      // Invalidate all caches
      await this.cacheService.flush();

      // Audit log
      await AuditService.log({
        action: 'configuration.imported',
        userId,
        resourceType: 'configuration',
        details: {
          imported: results.imported,
          skipped: results.skipped,
          errors: results.errors.length
        }
      });

      logger.info('Configurations imported', {
        imported: results.imported,
        skipped: results.skipped,
        errors: results.errors.length,
        importedBy: userId
      });

      return results;
    } catch (error) {
      logger.error('Failed to import configurations', error);
      throw error;
    }
  }

  /**
   * Validate configuration dependencies
   * @param {String} key Configuration key
   * @returns {Promise<Object>} Dependency validation result
   */
  async validateDependencies(key) {
    try {
      const config = await ConfigurationModel.findOne({ key });
      
      if (!config) {
        throw new AppError('Configuration not found', 404, 'CONFIG_NOT_FOUND');
      }

      const result = await config.checkDependencies();

      if (!result.satisfied) {
        logger.warn('Configuration dependencies not satisfied', {
          key,
          missing: result.missing
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to validate dependencies', error);
      throw error;
    }
  }

  /**
   * Watch configuration for changes
   * @param {String} key Configuration key
   * @param {Function} callback Callback function
   * @returns {String} Watcher ID
   */
  watchConfiguration(key, callback) {
    const watcherId = `watch_${key}_${Date.now()}`;
    
    if (!this.configWatchers.has(key)) {
      this.configWatchers.set(key, new Map());
    }
    
    this.configWatchers.get(key).set(watcherId, callback);
    
    logger.debug('Configuration watcher added', { key, watcherId });
    
    return watcherId;
  }

  /**
   * Remove configuration watcher
   * @param {String} key Configuration key
   * @param {String} watcherId Watcher ID
   * @returns {Boolean} Removal result
   */
  unwatchConfiguration(key, watcherId) {
    if (!this.configWatchers.has(key)) {
      return false;
    }
    
    const result = this.configWatchers.get(key).delete(watcherId);
    
    if (this.configWatchers.get(key).size === 0) {
      this.configWatchers.delete(key);
    }
    
    logger.debug('Configuration watcher removed', { key, watcherId });
    
    return result;
  }

  /**
   * Search configurations
   * @param {Object} searchCriteria Search criteria
   * @returns {Promise<Array>} Search results
   */
  async searchConfigurations(searchCriteria) {
    try {
      const {
        query,
        namespace,
        tags,
        status = 'active',
        page = 1,
        limit = 20
      } = searchCriteria;

      const filter = { status };

      if (namespace) {
        filter.namespace = namespace;
      }

      if (query) {
        filter.$or = [
          { key: new RegExp(query, 'i') },
          { 'metadata.displayName': new RegExp(query, 'i') },
          { 'metadata.description': new RegExp(query, 'i') }
        ];
      }

      if (tags && tags.length > 0) {
        filter['metadata.tags'] = { $in: tags };
      }

      const configs = await ConfigurationModel
        .find(filter)
        .select('-value -security.accessLog')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ namespace: 1, key: 1 })
        .lean();

      const total = await ConfigurationModel.countDocuments(filter);

      return {
        configurations: configs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to search configurations', error);
      throw error;
    }
  }

  /**
   * Determine value type
   * @private
   * @param {*} value Configuration value
   * @param {String} explicitType Explicit type
   * @returns {String} Value type
   */
  #determineValueType(value, explicitType) {
    if (explicitType) {
      return explicitType;
    }

    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (value !== null && typeof value === 'object') return 'object';
    
    return 'json';
  }

  /**
   * Invalidate configuration cache
   * @private
   * @param {String} key Configuration key
   * @returns {Promise<void>}
   */
  async #invalidateConfigCache(key) {
    const pattern = `${this.cacheKeyPrefix}${key}:*`;
    await this.cacheService.delPattern(pattern);
  }

  /**
   * Trigger configuration watchers
   * @private
   * @param {String} key Configuration key
   * @param {*} value New value
   * @returns {Promise<void>}
   */
  async #triggerConfigWatchers(key, value) {
    if (!this.configWatchers.has(key)) {
      return;
    }

    const watchers = this.configWatchers.get(key);
    
    for (const [watcherId, callback] of watchers) {
      try {
        await callback(key, value);
      } catch (error) {
        logger.error('Configuration watcher callback failed', {
          key,
          watcherId,
          error: error.message
        });
      }
    }
  }
}

module.exports = new ConfigurationService();