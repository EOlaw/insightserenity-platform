'use strict';

/**
 * @fileoverview Platform management service
 * @module servers/admin-server/modules/platform-management/services/platform-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:servers/admin-server/modules/platform-management/models/platform-model
 * @requires module:servers/admin-server/modules/platform-management/models/system-model
 */

const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const PlatformModel = require('../models/platform-model');
const SystemModel = require('../models/system-model');

/**
 * Service for managing platform configuration and operations
 * @class PlatformService
 */
class PlatformService {
  constructor() {
    this.cacheService = new CacheService('platform');
    this.cacheKeyPrefix = 'platform:';
    this.cacheTTL = 3600; // 1 hour
  }

  /**
   * Get platform configuration
   * @param {Object} options Query options
   * @returns {Promise<Object>} Platform configuration
   */
  async getPlatformConfig(options = {}) {
    try {
      const cacheKey = `${this.cacheKeyPrefix}config`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached && !options.skipCache) {
        return cached;
      }

      const platform = await PlatformModel.getInstance();
      
      if (!platform) {
        throw new AppError('Platform configuration not found', 404, 'PLATFORM_NOT_FOUND');
      }

      const config = platform.toObject();
      
      // Remove sensitive data if not admin request
      if (!options.includeSecrets) {
        this.#removeSensitiveData(config);
      }

      await this.cacheService.set(cacheKey, config, this.cacheTTL);
      
      return config;
    } catch (error) {
      logger.error('Failed to get platform configuration', error);
      throw error;
    }
  }

  /**
   * Update platform configuration
   * @param {Object} updates Configuration updates
   * @param {String} userId User making the update
   * @returns {Promise<Object>} Updated platform configuration
   */
  async updatePlatformConfig(updates, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      // Log the update attempt
      logger.info('Platform configuration update requested', {
        userId,
        updates: Object.keys(updates)
      });

      // Validate critical updates
      if (updates.environment?.type && platform.environment.type !== updates.environment.type) {
        throw new AppError('Cannot change environment type', 403, 'ENVIRONMENT_TYPE_IMMUTABLE');
      }

      // Apply updates
      Object.assign(platform, updates);
      platform.lastModifiedBy = userId;

      await platform.save();

      // Invalidate cache
      await this.cacheService.del(`${this.cacheKeyPrefix}config`);

      // Notify about configuration change
      await NotificationService.sendSystemNotification({
        type: 'platform_config_updated',
        severity: 'info',
        title: 'Platform Configuration Updated',
        message: `Platform configuration was updated by admin`,
        metadata: {
          userId,
          updatedFields: Object.keys(updates)
        }
      });

      logger.info('Platform configuration updated successfully', {
        platformId: platform.platformId,
        updatedBy: userId
      });

      return platform;
    } catch (error) {
      logger.error('Failed to update platform configuration', error);
      throw error;
    }
  }

  /**
   * Update platform version
   * @param {String} newVersion New version number
   * @param {String} userId User performing upgrade
   * @returns {Promise<Object>} Updated platform
   */
  async updateVersion(newVersion, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      // Validate version format
      const versionRegex = /^\d+\.\d+\.\d+$/;
      if (!versionRegex.test(newVersion)) {
        throw new AppError('Invalid version format. Use semantic versioning (x.y.z)', 400, 'INVALID_VERSION');
      }

      // Check if version is newer
      const currentParts = platform.version.current.split('.').map(Number);
      const newParts = newVersion.split('.').map(Number);
      
      const isNewer = newParts[0] > currentParts[0] ||
        (newParts[0] === currentParts[0] && newParts[1] > currentParts[1]) ||
        (newParts[0] === currentParts[0] && newParts[1] === currentParts[1] && newParts[2] > currentParts[2]);

      if (!isNewer) {
        throw new AppError('New version must be higher than current version', 400, 'VERSION_NOT_HIGHER');
      }

      // Perform version update
      await platform.updateVersion(newVersion, userId);

      // Clear caches
      await this.cacheService.flush();

      // Notify about version update
      await NotificationService.sendSystemNotification({
        type: 'platform_version_updated',
        severity: 'important',
        title: 'Platform Version Updated',
        message: `Platform version updated from ${platform.version.previous[platform.version.previous.length - 1].version} to ${newVersion}`,
        metadata: {
          previousVersion: platform.version.previous[platform.version.previous.length - 1].version,
          newVersion,
          upgradedBy: userId
        }
      });

      return platform;
    } catch (error) {
      logger.error('Failed to update platform version', error);
      throw error;
    }
  }

  /**
   * Enable maintenance mode
   * @param {Object} options Maintenance mode options
   * @param {String} userId User enabling maintenance
   * @returns {Promise<Object>} Updated platform
   */
  async enableMaintenanceMode(options, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      await platform.enableMaintenanceMode({
        ...options,
        userId
      });

      // Clear all caches
      await this.cacheService.flush();

      // Broadcast maintenance mode
      await NotificationService.broadcastSystemEvent({
        event: 'maintenance_mode_enabled',
        data: {
          message: platform.api.maintenanceMode.message,
          endTime: platform.api.maintenanceMode.endTime
        }
      });

      return platform;
    } catch (error) {
      logger.error('Failed to enable maintenance mode', error);
      throw error;
    }
  }

  /**
   * Disable maintenance mode
   * @param {String} userId User disabling maintenance
   * @returns {Promise<Object>} Updated platform
   */
  async disableMaintenanceMode(userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      await platform.disableMaintenanceMode(userId);

      // Clear caches
      await this.cacheService.flush();

      // Broadcast maintenance mode disabled
      await NotificationService.broadcastSystemEvent({
        event: 'maintenance_mode_disabled',
        data: {}
      });

      return platform;
    } catch (error) {
      logger.error('Failed to disable maintenance mode', error);
      throw error;
    }
  }

  /**
   * Update feature flag
   * @param {String} featureName Feature flag name
   * @param {Object} config Feature configuration
   * @param {String} userId User updating feature
   * @returns {Promise<Object>} Updated feature configuration
   */
  async updateFeatureFlag(featureName, config, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      const feature = await platform.updateFeatureFlag(featureName, config);

      // Invalidate feature flags cache
      await this.cacheService.del(`${this.cacheKeyPrefix}features`);

      logger.info('Feature flag updated', {
        feature: featureName,
        config,
        updatedBy: userId
      });

      return feature;
    } catch (error) {
      logger.error('Failed to update feature flag', error);
      throw error;
    }
  }

  /**
   * Get all feature flags
   * @param {Object} options Query options
   * @returns {Promise<Object>} Feature flags
   */
  async getFeatureFlags(options = {}) {
    try {
      const cacheKey = `${this.cacheKeyPrefix}features`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached && !options.skipCache) {
        return cached;
      }

      const platform = await PlatformModel.getInstance();
      const features = Object.fromEntries(platform.features || []);

      await this.cacheService.set(cacheKey, features, this.cacheTTL);

      return features;
    } catch (error) {
      logger.error('Failed to get feature flags', error);
      throw error;
    }
  }

  /**
   * Check if feature is enabled
   * @param {String} featureName Feature name
   * @param {Object} context Evaluation context
   * @returns {Promise<Boolean>} Feature enabled status
   */
  async isFeatureEnabled(featureName, context = {}) {
    try {
      const features = await this.getFeatureFlags();
      const feature = features[featureName];

      if (!feature) {
        return false;
      }

      if (!feature.enabled) {
        return false;
      }

      // Check rollout percentage
      if (feature.rolloutPercentage < 100) {
        const hash = this.#hashString(context.userId || context.organizationId || '');
        const bucket = hash % 100;
        if (bucket >= feature.rolloutPercentage) {
          return false;
        }
      }

      // Check allowed organizations
      if (feature.allowedOrganizations?.length > 0 && context.organizationId) {
        return feature.allowedOrganizations.includes(context.organizationId);
      }

      return true;
    } catch (error) {
      logger.error('Failed to check feature flag', error);
      return false;
    }
  }

  /**
   * Add integration
   * @param {Object} integrationData Integration configuration
   * @param {String} userId User adding integration
   * @returns {Promise<Object>} Added integration
   */
  async addIntegration(integrationData, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      // Check if integration already exists
      const existing = platform.integrations.find(i => 
        i.name === integrationData.name && i.type === integrationData.type
      );

      if (existing) {
        throw new AppError('Integration already exists', 409, 'INTEGRATION_EXISTS');
      }

      const integration = await platform.addIntegration(integrationData);

      // Test integration connection
      await this.#testIntegration(integration);

      logger.info('Integration added successfully', {
        name: integration.name,
        type: integration.type,
        addedBy: userId
      });

      return integration;
    } catch (error) {
      logger.error('Failed to add integration', error);
      throw error;
    }
  }

  /**
   * Update integration
   * @param {String} integrationId Integration ID
   * @param {Object} updates Integration updates
   * @param {String} userId User updating integration
   * @returns {Promise<Object>} Updated integration
   */
  async updateIntegration(integrationId, updates, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      const integration = platform.integrations.id(integrationId);
      if (!integration) {
        throw new AppError('Integration not found', 404, 'INTEGRATION_NOT_FOUND');
      }

      Object.assign(integration, updates);
      platform.lastModifiedBy = userId;

      await platform.save();

      // Test updated integration
      if (updates.enabled) {
        await this.#testIntegration(integration);
      }

      logger.info('Integration updated', {
        integrationId,
        updatedBy: userId
      });

      return integration;
    } catch (error) {
      logger.error('Failed to update integration', error);
      throw error;
    }
  }

  /**
   * Get platform status
   * @returns {Promise<Object>} Platform status
   */
  async getPlatformStatus() {
    try {
      const [platform, systemHealth] = await Promise.all([
        PlatformModel.getInstance(),
        SystemModel.getClusterHealth()
      ]);

      const status = {
        overall: platform.status.overall,
        services: platform.status.services,
        lastStatusChange: platform.status.lastStatusChange,
        incidents: platform.status.incidents.filter(i => i.status !== 'resolved'),
        systemHealth,
        maintenanceMode: platform.api.maintenanceMode.enabled
      };

      return status;
    } catch (error) {
      logger.error('Failed to get platform status', error);
      throw error;
    }
  }

  /**
   * Update platform status
   * @param {Array} serviceStatuses Service status updates
   * @returns {Promise<Object>} Updated status
   */
  async updatePlatformStatus(serviceStatuses) {
    try {
      const platform = await PlatformModel.getInstance();
      
      const status = await platform.updateSystemStatus(serviceStatuses);

      // Broadcast status change if overall status changed
      if (platform.isModified('status.overall')) {
        await NotificationService.broadcastSystemEvent({
          event: 'platform_status_changed',
          data: {
            status: status.overall,
            services: status.services
          }
        });
      }

      return status;
    } catch (error) {
      logger.error('Failed to update platform status', error);
      throw error;
    }
  }

  /**
   * Record platform incident
   * @param {Object} incidentData Incident details
   * @param {String} userId User recording incident
   * @returns {Promise<Object>} Recorded incident
   */
  async recordIncident(incidentData, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      
      const incident = await platform.recordIncident(incidentData);

      // Notify about incident
      await NotificationService.sendSystemNotification({
        type: 'platform_incident',
        severity: incidentData.severity,
        title: incidentData.title,
        message: `Platform incident: ${incidentData.title}`,
        metadata: {
          incidentId: incident._id,
          severity: incident.severity,
          reportedBy: userId
        }
      });

      return incident;
    } catch (error) {
      logger.error('Failed to record incident', error);
      throw error;
    }
  }

  /**
   * Check resource limits
   * @param {String} resource Resource name
   * @param {Number} currentUsage Current usage value
   * @returns {Promise<Object>} Resource limit check result
   */
  async checkResourceLimit(resource, currentUsage) {
    try {
      const platform = await PlatformModel.getInstance();
      
      const result = platform.checkResourceLimit(resource, currentUsage);

      // Send alert if approaching limit
      if (!result.withinLimit || result.percentageUsed > 90) {
        await NotificationService.sendSystemNotification({
          type: 'resource_limit_warning',
          severity: result.withinLimit ? 'warning' : 'critical',
          title: `Resource Limit ${result.withinLimit ? 'Warning' : 'Exceeded'}`,
          message: `${resource} usage at ${result.percentageUsed.toFixed(1)}% of limit`,
          metadata: {
            resource,
            limit: result.limit,
            usage: result.usage,
            percentageUsed: result.percentageUsed
          }
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to check resource limit', error);
      throw error;
    }
  }

  /**
   * Get platform health check
   * @returns {Promise<Object>} Health check data
   */
  async performHealthCheck() {
    try {
      const healthData = await PlatformModel.performHealthCheck();
      
      // Add additional health checks
      healthData.timestamp = new Date();
      healthData.healthy = healthData.status === 'operational' && 
                          healthData.database.connected &&
                          healthData.cache.connected;

      return healthData;
    } catch (error) {
      logger.error('Failed to perform health check', error);
      throw error;
    }
  }

  /**
   * Get public platform configuration
   * @returns {Promise<Object>} Public configuration
   */
  async getPublicConfig() {
    try {
      const cacheKey = `${this.cacheKeyPrefix}public`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const config = await PlatformModel.getPublicConfig();
      
      await this.cacheService.set(cacheKey, config, this.cacheTTL);

      return config;
    } catch (error) {
      logger.error('Failed to get public configuration', error);
      throw error;
    }
  }

  /**
   * Remove sensitive data from configuration
   * @private
   * @param {Object} config Configuration object
   */
  #removeSensitiveData(config) {
    // Remove integration credentials
    if (config.integrations) {
      config.integrations.forEach(integration => {
        delete integration.credentials;
        delete integration.webhooks;
      });
    }

    // Remove security keys
    if (config.security?.encryption) {
      delete config.security.encryption.key;
    }

    // Remove database credentials
    if (config.systemConfig?.database) {
      delete config.systemConfig.database.connectionString;
    }
  }

  /**
   * Test integration connection
   * @private
   * @param {Object} integration Integration configuration
   * @returns {Promise<Boolean>} Test result
   */
  async #testIntegration(integration) {
    // This would implement actual integration testing
    logger.info('Testing integration connection', {
      name: integration.name,
      type: integration.type
    });

    // Simulate test
    return true;
  }

  /**
   * Simple string hash function
   * @private
   * @param {String} str String to hash
   * @returns {Number} Hash value
   */
  #hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

module.exports = new PlatformService();