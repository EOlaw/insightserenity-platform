'use strict';

/**
 * @fileoverview Platform management service with business logic
 * @module servers/admin-server/modules/platform-management/services/platform-service
 * @requires module:servers/admin-server/modules/platform-management/models/platform-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const PlatformModel = require('../../../../../shared/lib/database/models/admin-server/platform-management/models/platform-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const TransactionManager = require('../../../../../shared/lib/database/transaction-manager');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');

/**
 * @class PlatformService
 * @description Service class for platform management operations
 */
class PlatformService {
  /**
   * Creates an instance of PlatformService
   * @constructor
   */
  constructor() {
    this.#cacheService = new CacheService({
      prefix: 'platform:',
      ttl: 300 // 5 minutes default TTL
    });
    this.#notificationService = new NotificationService();
    this.#auditService = new AuditService();
    this.#transactionManager = new TransactionManager();
  }

  // Private fields
  #cacheService;
  #notificationService;
  #auditService;
  #transactionManager;

  // Cache keys
  static CACHE_KEYS = {
    PLATFORM_CONFIG: 'config',
    FEATURE_FLAGS: 'features',
    SYSTEM_MODULES: 'modules',
    MAINTENANCE_WINDOWS: 'maintenance',
    PLATFORM_STATUS: 'status'
  };

  // Event types
  static EVENTS = {
    FEATURE_ENABLED: 'platform.feature.enabled',
    FEATURE_DISABLED: 'platform.feature.disabled',
    MAINTENANCE_SCHEDULED: 'platform.maintenance.scheduled',
    MAINTENANCE_STARTED: 'platform.maintenance.started',
    MAINTENANCE_COMPLETED: 'platform.maintenance.completed',
    DEPLOYMENT_RECORDED: 'platform.deployment.recorded',
    MODULE_UPDATED: 'platform.module.updated',
    CONFIGURATION_CHANGED: 'platform.configuration.changed'
  };

  /**
   * Gets platform configuration
   * @async
   * @param {Object} [options={}] - Query options
   * @param {string} [options.environment] - Filter by environment
   * @param {boolean} [options.includeInactive=false] - Include inactive configurations
   * @param {boolean} [options.fromCache=true] - Whether to use cache
   * @returns {Promise<Object>} Platform configuration
   * @throws {AppError} If platform not found
   */
  async getPlatformConfiguration(options = {}) {
    try {
      const { environment, includeInactive = false, fromCache = true } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${PlatformService.CACHE_KEYS.PLATFORM_CONFIG}:${environment || 'all'}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          logger.debug('Platform configuration retrieved from cache', { environment });
          return cached;
        }
      }

      // Build query
      const query = {};
      if (environment) {
        query['deployment.environment'] = environment;
      }
      if (!includeInactive) {
        query['status.operational'] = true;
      }

      // Fetch from database
      const platform = await PlatformModel.findOne(query)
        .populate('metadata.createdBy', 'name email')
        .populate('metadata.lastModifiedBy', 'name email')
        .populate('deployment.deployedBy', 'name email')
        .populate('maintenanceWindows.createdBy', 'name email')
        .lean();

      if (!platform) {
        throw new AppError(`Platform configuration not found${environment ? ` for environment: ${environment}` : ''}`, 404);
      }

      // Process and cache result
      const result = this.#processPlatformData(platform);
      
      if (fromCache) {
        const cacheKey = `${PlatformService.CACHE_KEYS.PLATFORM_CONFIG}:${environment || 'all'}`;
        await this.#cacheService.set(cacheKey, result, 300);
      }

      logger.info('Platform configuration retrieved', {
        platformId: platform.platformId,
        environment: platform.deployment.environment
      });

      return result;
    } catch (error) {
      logger.error('Failed to get platform configuration', {
        options,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get platform configuration: ${error.message}`, 500);
    }
  }

  /**
   * Creates or initializes platform configuration
   * @async
   * @param {Object} platformData - Platform configuration data
   * @param {string} userId - User ID creating the platform
   * @returns {Promise<Object>} Created platform configuration
   * @throws {AppError} If creation fails
   */
  async createPlatformConfiguration(platformData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Check if platform already exists for environment
      const existing = await PlatformModel.findOne({
        'deployment.environment': platformData.deployment.environment
      });

      if (existing) {
        throw new AppError(`Platform already exists for environment: ${platformData.deployment.environment}`, 409);
      }

      // Create platform configuration
      const platform = new PlatformModel({
        ...platformData,
        metadata: {
          ...platformData.metadata,
          createdBy: userId
        }
      });

      // Add default feature flags
      if (!platform.featureFlags || platform.featureFlags.length === 0) {
        platform.featureFlags = this.#getDefaultFeatureFlags();
      }

      // Add default system modules
      if (!platform.systemModules || platform.systemModules.length === 0) {
        platform.systemModules = this.#getDefaultSystemModules();
      }

      // Save platform
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'platform.create',
        resource: 'platform',
        resourceId: platform.platformId,
        details: {
          environment: platform.deployment.environment,
          version: platform.deployment.version
        },
        session
      });

      await session.commitTransaction();

      logger.info('Platform configuration created', {
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        userId
      });

      // Clear cache
      await this.#clearPlatformCache();

      return platform.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create platform configuration', {
        error: error.message,
        userId
      });
      throw error instanceof AppError ? error : new AppError(`Failed to create platform configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates platform configuration
   * @async
   * @param {string} platformId - Platform ID
   * @param {Object} updates - Updates to apply
   * @param {string} userId - User ID performing update
   * @returns {Promise<Object>} Updated platform configuration
   * @throws {AppError} If update fails
   */
  async updatePlatformConfiguration(platformId, updates, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get platform
      const platform = await PlatformModel.findOne({ platformId }).session(session);
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Track changes for audit
      const changes = [];

      // Apply updates
      const allowedUpdates = [
        'platformName', 'platformDescription', 'security', 'performance',
        'notifications', 'api', 'integrations'
      ];

      for (const field of allowedUpdates) {
        if (updates[field] !== undefined) {
          const oldValue = platform[field];
          platform[field] = updates[field];
          changes.push({ field, oldValue, newValue: updates[field] });
        }
      }

      // Update metadata
      platform.metadata.lastModifiedBy = userId;
      platform._lastModifiedBy = userId;

      // Save changes
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'platform.update',
        resource: 'platform',
        resourceId: platformId,
        details: {
          changes,
          fieldsUpdated: changes.map(c => c.field)
        },
        session
      });

      await session.commitTransaction();

      logger.info('Platform configuration updated', {
        platformId,
        fieldsUpdated: changes.map(c => c.field),
        userId
      });

      // Clear cache
      await this.#clearPlatformCache();

      // Send notification for critical changes
      if (changes.some(c => c.field === 'security')) {
        await this.#notificationService.sendToAdmins({
          type: 'platform.security.updated',
          title: 'Platform Security Configuration Updated',
          message: `Security settings have been updated by ${userId}`,
          severity: 'high',
          data: { platformId, changes: changes.filter(c => c.field === 'security') }
        });
      }

      return platform.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update platform configuration', {
        platformId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update platform configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Manages feature flags
   * @async
   * @param {string} platformId - Platform ID
   * @param {string} featureName - Feature name
   * @param {Object} action - Action to perform
   * @param {string} action.type - Action type (enable|disable|rollout)
   * @param {Object} [action.options] - Action options
   * @param {string} userId - User ID performing action
   * @returns {Promise<Object>} Updated feature flag
   * @throws {AppError} If operation fails
   */
  async manageFeatureFlag(platformId, featureName, action, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get platform
      const platform = await PlatformModel.findOne({ platformId }).session(session);
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      let result;
      const eventType = action.type === 'enable' ? 
        PlatformService.EVENTS.FEATURE_ENABLED : 
        PlatformService.EVENTS.FEATURE_DISABLED;

      switch (action.type) {
        case 'enable':
          result = await platform.enableFeature(featureName, {
            ...action.options,
            modifiedBy: userId
          });
          break;

        case 'disable':
          result = await platform.disableFeature(featureName, {
            ...action.options,
            modifiedBy: userId
          });
          break;

        case 'rollout':
          result = await this.#updateFeatureRollout(
            platform,
            featureName,
            action.options.percentage,
            action.options.strategy,
            userId
          );
          break;

        case 'target':
          result = await this.#updateFeatureTargeting(
            platform,
            featureName,
            action.options.enabledTenants,
            action.options.disabledTenants,
            userId
          );
          break;

        default:
          throw new AppError(`Invalid feature flag action: ${action.type}`, 400);
      }

      // Save changes
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: `feature.${action.type}`,
        resource: 'feature_flag',
        resourceId: featureName,
        details: {
          platformId,
          featureName,
          action: action.type,
          options: action.options
        },
        session
      });

      await session.commitTransaction();

      logger.info('Feature flag updated', {
        platformId,
        featureName,
        action: action.type,
        userId
      });

      // Clear feature flags cache
      await this.#cacheService.delete(`${PlatformService.CACHE_KEYS.FEATURE_FLAGS}:*`);

      // Emit event
      await this.#notificationService.emit(eventType, {
        platformId,
        featureName,
        action: action.type,
        userId,
        timestamp: new Date()
      });

      const feature = platform.featureFlags.find(f => f.name === featureName);
      return feature ? feature.toObject() : null;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to manage feature flag', {
        platformId,
        featureName,
        action,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to manage feature flag: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets feature flags for a tenant
   * @async
   * @param {string} tenantId - Tenant ID
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Feature flags for tenant
   */
  async getFeatureFlagsForTenant(tenantId, options = {}) {
    try {
      const { environment = 'production', fromCache = true } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${PlatformService.CACHE_KEYS.FEATURE_FLAGS}:tenant:${tenantId}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Get platform configuration
      const platform = await PlatformModel.findOne({
        'deployment.environment': environment,
        'status.operational': true
      });

      if (!platform) {
        throw new AppError(`Platform not found for environment: ${environment}`, 404);
      }

      // Build feature flags object for tenant
      const features = {};
      
      for (const flag of platform.featureFlags) {
        features[flag.name] = {
          enabled: platform.isFeatureEnabledForTenant(flag.name, tenantId),
          metadata: flag.metadata,
          description: flag.description
        };
      }

      // Cache result
      if (fromCache) {
        const cacheKey = `${PlatformService.CACHE_KEYS.FEATURE_FLAGS}:tenant:${tenantId}`;
        await this.#cacheService.set(cacheKey, features, 600); // 10 minutes
      }

      return features;
    } catch (error) {
      logger.error('Failed to get feature flags for tenant', {
        tenantId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get feature flags: ${error.message}`, 500);
    }
  }

  /**
   * Schedules a maintenance window
   * @async
   * @param {string} platformId - Platform ID
   * @param {Object} maintenanceData - Maintenance window data
   * @param {string} userId - User ID scheduling maintenance
   * @returns {Promise<Object>} Scheduled maintenance window
   * @throws {AppError} If scheduling fails
   */
  async scheduleMaintenanceWindow(platformId, maintenanceData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get platform
      const platform = await PlatformModel.findOne({ platformId }).session(session);
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Add required fields
      maintenanceData.createdBy = userId;

      // Schedule maintenance
      const maintenance = await platform.scheduleMaintenance(maintenanceData);

      // Save changes
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.schedule',
        resource: 'maintenance_window',
        resourceId: maintenance.id,
        details: {
          platformId,
          maintenanceId: maintenance.id,
          startTime: maintenance.startTime,
          endTime: maintenance.endTime,
          type: maintenance.type
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window scheduled', {
        platformId,
        maintenanceId: maintenance.id,
        startTime: maintenance.startTime,
        endTime: maintenance.endTime,
        userId
      });

      // Clear maintenance cache
      await this.#cacheService.delete(`${PlatformService.CACHE_KEYS.MAINTENANCE_WINDOWS}:*`);

      // Emit event
      await this.#notificationService.emit(PlatformService.EVENTS.MAINTENANCE_SCHEDULED, {
        platformId,
        maintenance,
        userId,
        timestamp: new Date()
      });

      // Schedule notifications
      if (maintenance.notifications.enabled) {
        await this.#scheduleMaintenanceNotifications(platform, maintenance);
      }

      return maintenance;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to schedule maintenance window', {
        platformId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to schedule maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates maintenance window status
   * @async
   * @param {string} platformId - Platform ID
   * @param {string} maintenanceId - Maintenance window ID
   * @param {string} status - New status
   * @param {string} userId - User ID updating status
   * @returns {Promise<Object>} Updated maintenance window
   * @throws {AppError} If update fails
   */
  async updateMaintenanceStatus(platformId, maintenanceId, status, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get platform
      const platform = await PlatformModel.findOne({ platformId }).session(session);
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Find maintenance window
      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate status transition
      const validTransitions = {
        'scheduled': ['in-progress', 'cancelled'],
        'in-progress': ['completed', 'cancelled'],
        'completed': [],
        'cancelled': []
      };

      if (!validTransitions[maintenance.status].includes(status)) {
        throw new AppError(`Invalid status transition from ${maintenance.status} to ${status}`, 400);
      }

      // Update status
      const oldStatus = maintenance.status;
      maintenance.status = status;
      
      if (status === 'completed') {
        maintenance.completedAt = new Date();
      }

      // Save changes
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.update_status',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId,
          maintenanceId,
          oldStatus,
          newStatus: status
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window status updated', {
        platformId,
        maintenanceId,
        oldStatus,
        newStatus: status,
        userId
      });

      // Clear cache
      await this.#cacheService.delete(`${PlatformService.CACHE_KEYS.MAINTENANCE_WINDOWS}:*`);
      await this.#cacheService.delete(`${PlatformService.CACHE_KEYS.PLATFORM_STATUS}:*`);

      // Emit appropriate event
      const eventMap = {
        'in-progress': PlatformService.EVENTS.MAINTENANCE_STARTED,
        'completed': PlatformService.EVENTS.MAINTENANCE_COMPLETED,
        'cancelled': 'platform.maintenance.cancelled'
      };

      if (eventMap[status]) {
        await this.#notificationService.emit(eventMap[status], {
          platformId,
          maintenanceId,
          maintenance: maintenance.toObject(),
          userId,
          timestamp: new Date()
        });
      }

      // Send notifications
      if (status === 'in-progress' || status === 'completed') {
        await this.#sendMaintenanceStatusNotification(platform, maintenance, status);
      }

      return maintenance.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update maintenance status', {
        platformId,
        maintenanceId,
        status,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update maintenance status: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets active maintenance windows
   * @async
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Array>} Active maintenance windows
   */
  async getActiveMaintenanceWindows(options = {}) {
    try {
      const { environment, fromCache = true } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${PlatformService.CACHE_KEYS.MAINTENANCE_WINDOWS}:active:${environment || 'all'}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Build query
      const query = {
        'status.operational': true
      };

      if (environment) {
        query['deployment.environment'] = environment;
      }

      // Get platforms with active maintenance
      const platforms = await PlatformModel.getActiveMaintenanceWindows();

      // Extract and format maintenance windows
      const maintenanceWindows = [];
      const now = new Date();

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows) {
          if (
            (window.status === 'scheduled' && window.startTime <= now && window.endTime >= now) ||
            window.status === 'in-progress'
          ) {
            maintenanceWindows.push({
              ...window.toObject(),
              platformId: platform.platformId,
              environment: platform.deployment.environment
            });
          }
        }
      }

      // Sort by start time
      maintenanceWindows.sort((a, b) => a.startTime - b.startTime);

      // Cache result
      if (fromCache) {
        const cacheKey = `${PlatformService.CACHE_KEYS.MAINTENANCE_WINDOWS}:active:${environment || 'all'}`;
        await this.#cacheService.set(cacheKey, maintenanceWindows, 60); // 1 minute
      }

      return maintenanceWindows;
    } catch (error) {
      logger.error('Failed to get active maintenance windows', {
        options,
        error: error.message
      });
      throw new AppError(`Failed to get maintenance windows: ${error.message}`, 500);
    }
  }

  /**
   * Records a deployment
   * @async
   * @param {string} platformId - Platform ID
   * @param {Object} deploymentInfo - Deployment information
   * @param {string} userId - User ID recording deployment
   * @returns {Promise<Object>} Recorded deployment
   * @throws {AppError} If recording fails
   */
  async recordDeployment(platformId, deploymentInfo, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get platform
      const platform = await PlatformModel.findOne({ platformId }).session(session);
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Add deployment info
      deploymentInfo.deployedBy = userId;

      // Record deployment
      const deployment = await platform.recordDeployment(deploymentInfo);

      // Save changes
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'deployment.record',
        resource: 'deployment',
        resourceId: `${platformId}-${deployment.version}`,
        details: {
          platformId,
          version: deployment.version,
          environment: deployment.environment,
          previousVersion: platform.deployment.rollbackHistory[platform.deployment.rollbackHistory.length - 1]?.version
        },
        session
      });

      await session.commitTransaction();

      logger.info('Deployment recorded', {
        platformId,
        version: deployment.version,
        environment: deployment.environment,
        userId
      });

      // Clear cache
      await this.#clearPlatformCache();

      // Emit event
      await this.#notificationService.emit(PlatformService.EVENTS.DEPLOYMENT_RECORDED, {
        platformId,
        deployment,
        userId,
        timestamp: new Date()
      });

      // Send notification
      await this.#notificationService.sendToAdmins({
        type: 'platform.deployment.recorded',
        title: 'New Deployment Recorded',
        message: `Version ${deployment.version} deployed to ${deployment.environment}`,
        severity: 'info',
        data: { platformId, deployment }
      });

      return deployment;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to record deployment', {
        platformId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to record deployment: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates system module
   * @async
   * @param {string} platformId - Platform ID
   * @param {string} moduleName - Module name
   * @param {Object} updates - Module updates
   * @param {string} userId - User ID updating module
   * @returns {Promise<Object>} Updated module
   * @throws {AppError} If update fails
   */
  async updateSystemModule(platformId, moduleName, updates, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get platform
      const platform = await PlatformModel.findOne({ platformId }).session(session);
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Update module
      const module = await platform.updateSystemModule(moduleName, updates);

      // Save changes
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'module.update',
        resource: 'system_module',
        resourceId: moduleName,
        details: {
          platformId,
          moduleName,
          updates: Object.keys(updates)
        },
        session
      });

      await session.commitTransaction();

      logger.info('System module updated', {
        platformId,
        moduleName,
        updates: Object.keys(updates),
        userId
      });

      // Clear cache
      await this.#cacheService.delete(`${PlatformService.CACHE_KEYS.SYSTEM_MODULES}:*`);

      // Emit event
      await this.#notificationService.emit(PlatformService.EVENTS.MODULE_UPDATED, {
        platformId,
        moduleName,
        module: module.toObject(),
        userId,
        timestamp: new Date()
      });

      return module.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update system module', {
        platformId,
        moduleName,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update system module: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Performs platform health check
   * @async
   * @param {string} platformId - Platform ID
   * @returns {Promise<Object>} Health check results
   * @throws {AppError} If health check fails
   */
  async performHealthCheck(platformId) {
    try {
      // Get platform
      const platform = await PlatformModel.findOne({ platformId });
      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Perform health check
      const healthResults = await platform.performHealthCheck();

      // Cache status
      const cacheKey = `${PlatformService.CACHE_KEYS.PLATFORM_STATUS}:${platformId}`;
      await this.#cacheService.set(cacheKey, {
        status: platform.status,
        healthScore: platform.status.healthScore,
        lastCheck: platform.status.lastHealthCheck,
        issues: platform.status.issues.filter(i => !i.resolvedAt)
      }, 60); // 1 minute

      // Send alerts for new critical issues
      const criticalIssues = platform.status.issues.filter(i => 
        i.severity === 'critical' && 
        !i.resolvedAt &&
        !i.acknowledgedBy &&
        (new Date() - i.detectedAt) < 60000 // Detected in last minute
      );

      if (criticalIssues.length > 0) {
        await this.#notificationService.sendToAdmins({
          type: 'platform.health.critical',
          title: 'Critical Platform Health Issues Detected',
          message: `${criticalIssues.length} critical issues detected during health check`,
          severity: 'critical',
          data: {
            platformId,
            issues: criticalIssues,
            healthScore: platform.status.healthScore
          }
        });
      }

      logger.info('Platform health check completed', {
        platformId,
        healthScore: platform.status.healthScore,
        issueCount: platform.status.issues.filter(i => !i.resolvedAt).length
      });

      return healthResults;
    } catch (error) {
      logger.error('Failed to perform platform health check', {
        platformId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to perform health check: ${error.message}`, 500);
    }
  }

  /**
   * Gets platform statistics
   * @async
   * @param {string} platformId - Platform ID
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Platform statistics
   */
  async getPlatformStatistics(platformId, options = {}) {
    try {
      const { timeRange = '24h' } = options;

      // Get platform
      const platform = await PlatformModel.findOne({ platformId })
        .lean();

      if (!platform) {
        throw new AppError('Platform configuration not found', 404);
      }

      // Calculate time boundaries
      const now = new Date();
      const startTime = dateHelper.subtractTime(now, timeRange);

      // Gather statistics
      const stats = {
        overview: {
          platformId: platform.platformId,
          environment: platform.deployment.environment,
          version: platform.deployment.version,
          uptime: this.#calculateUptime(platform.deployment.deployedAt),
          healthScore: platform.status.healthScore,
          operational: platform.status.operational
        },
        features: {
          total: platform.featureFlags.length,
          enabled: platform.featureFlags.filter(f => f.enabled).length,
          rollouts: platform.featureFlags.filter(f => 
            f.rolloutPercentage && f.rolloutPercentage.percentage > 0 && f.rolloutPercentage.percentage < 100
          ).length
        },
        modules: {
          total: platform.systemModules.length,
          enabled: platform.systemModules.filter(m => m.enabled).length,
          healthy: platform.systemModules.filter(m => m.health.status === 'healthy').length,
          degraded: platform.systemModules.filter(m => m.health.status === 'degraded').length,
          unhealthy: platform.systemModules.filter(m => m.health.status === 'unhealthy').length
        },
        maintenance: {
          scheduled: platform.maintenanceWindows.filter(m => 
            m.status === 'scheduled' && m.startTime > now
          ).length,
          inProgress: platform.maintenanceWindows.filter(m => m.status === 'in-progress').length,
          completed: platform.maintenanceWindows.filter(m => 
            m.status === 'completed' && m.completedAt >= startTime
          ).length
        },
        alerts: {
          active: platform.status.issues.filter(i => !i.resolvedAt).length,
          critical: platform.status.issues.filter(i => i.severity === 'critical' && !i.resolvedAt).length,
          acknowledged: platform.status.issues.filter(i => i.acknowledgedBy && !i.resolvedAt).length,
          recent: platform.status.issues.filter(i => i.detectedAt >= startTime).length
        },
        deployments: {
          current: platform.deployment.version,
          totalRollbacks: platform.deployment.rollbackHistory.length,
          recentRollbacks: platform.deployment.rollbackHistory.filter(r => 
            r.rolledBackAt && r.rolledBackAt >= startTime
          ).length
        }
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get platform statistics', {
        platformId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get platform statistics: ${error.message}`, 500);
    }
  }

  /**
   * Searches feature flags
   * @async
   * @param {Object} searchCriteria - Search criteria
   * @returns {Promise<Array>} Matching feature flags
   */
  async searchFeatureFlags(searchCriteria) {
    try {
      const {
        query,
        enabled,
        hasRollout,
        environment = 'production',
        page = 1,
        limit = 20
      } = searchCriteria;

      // Build MongoDB query
      const mongoQuery = {
        'deployment.environment': environment,
        'status.operational': true
      };

      if (query) {
        mongoQuery.$or = [
          { 'featureFlags.name': new RegExp(query, 'i') },
          { 'featureFlags.description': new RegExp(query, 'i') }
        ];
      }

      if (enabled !== undefined) {
        mongoQuery['featureFlags.enabled'] = enabled;
      }

      if (hasRollout) {
        mongoQuery['featureFlags.rolloutPercentage.percentage'] = { $gt: 0, $lt: 100 };
      }

      // Execute search
      const platforms = await PlatformModel.find(mongoQuery)
        .select('platformId deployment.environment featureFlags')
        .lean();

      // Extract and filter feature flags
      const allFlags = [];
      
      for (const platform of platforms) {
        for (const flag of platform.featureFlags) {
          if (
            (!query || flag.name.toLowerCase().includes(query.toLowerCase()) || 
             (flag.description && flag.description.toLowerCase().includes(query.toLowerCase()))) &&
            (enabled === undefined || flag.enabled === enabled) &&
            (!hasRollout || (flag.rolloutPercentage?.percentage > 0 && flag.rolloutPercentage?.percentage < 100))
          ) {
            allFlags.push({
              ...flag,
              platformId: platform.platformId,
              environment: platform.deployment.environment
            });
          }
        }
      }

      // Sort by name
      allFlags.sort((a, b) => a.name.localeCompare(b.name));

      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedFlags = allFlags.slice(startIndex, endIndex);

      return {
        flags: paginatedFlags,
        pagination: {
          total: allFlags.length,
          page,
          limit,
          pages: Math.ceil(allFlags.length / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to search feature flags', {
        searchCriteria,
        error: error.message
      });
      throw new AppError(`Failed to search feature flags: ${error.message}`, 500);
    }
  }

  // Private helper methods

  /**
   * Processes platform data for response
   * @private
   * @param {Object} platform - Raw platform data
   * @returns {Object} Processed platform data
   */
  #processPlatformData(platform) {
    return {
      ...platform,
      isInMaintenance: this.#isInMaintenance(platform.maintenanceWindows),
      activeFeatures: platform.featureFlags.filter(f => f.enabled).map(f => f.name),
      healthStatus: this.#calculateHealthStatus(platform.status),
      modulesSummary: this.#summarizeModules(platform.systemModules)
    };
  }

  /**
   * Checks if platform is in maintenance
   * @private
   * @param {Array} maintenanceWindows - Maintenance windows
   * @returns {boolean} Whether in maintenance
   */
  #isInMaintenance(maintenanceWindows) {
    const now = new Date();
    return maintenanceWindows.some(window => 
      window.status === 'in-progress' ||
      (window.status === 'scheduled' && window.startTime <= now && window.endTime >= now)
    );
  }

  /**
   * Calculates health status
   * @private
   * @param {Object} status - Platform status
   * @returns {string} Health status
   */
  #calculateHealthStatus(status) {
    if (!status.operational) return 'offline';
    if (status.healthScore >= 90) return 'healthy';
    if (status.healthScore >= 70) return 'degraded';
    return 'unhealthy';
  }

  /**
   * Summarizes system modules
   * @private
   * @param {Array} modules - System modules
   * @returns {Object} Modules summary
   */
  #summarizeModules(modules) {
    return {
      total: modules.length,
      enabled: modules.filter(m => m.enabled).length,
      byStatus: {
        healthy: modules.filter(m => m.health.status === 'healthy').length,
        degraded: modules.filter(m => m.health.status === 'degraded').length,
        unhealthy: modules.filter(m => m.health.status === 'unhealthy').length,
        unknown: modules.filter(m => m.health.status === 'unknown').length
      }
    };
  }

  /**
   * Gets default feature flags
   * @private
   * @returns {Array} Default feature flags
   */
  #getDefaultFeatureFlags() {
    return [
      {
        name: 'api-rate-limiting',
        enabled: true,
        description: 'Enable API rate limiting',
        category: 'security'
      },
      {
        name: 'two-factor-auth',
        enabled: false,
        description: 'Enable two-factor authentication',
        category: 'security'
      },
      {
        name: 'advanced-analytics',
        enabled: false,
        description: 'Enable advanced analytics features',
        category: 'features'
      },
      {
        name: 'beta-features',
        enabled: false,
        description: 'Enable beta features',
        category: 'features'
      }
    ];
  }

  /**
   * Gets default system modules
   * @private
   * @returns {Array} Default system modules
   */
  #getDefaultSystemModules() {
    return [
      {
        name: 'core',
        displayName: 'Core System',
        version: '1.0.0',
        enabled: true,
        dependencies: [],
        health: {
          status: 'unknown'
        }
      },
      {
        name: 'authentication',
        displayName: 'Authentication Service',
        version: '1.0.0',
        enabled: true,
        dependencies: ['core'],
        health: {
          status: 'unknown'
        }
      },
      {
        name: 'api',
        displayName: 'API Service',
        version: '1.0.0',
        enabled: true,
        dependencies: ['core', 'authentication'],
        health: {
          status: 'unknown'
        }
      }
    ];
  }

  /**
   * Updates feature rollout configuration
   * @private
   * @param {Object} platform - Platform instance
   * @param {string} featureName - Feature name
   * @param {number} percentage - Rollout percentage
   * @param {string} strategy - Rollout strategy
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated platform
   */
  async #updateFeatureRollout(platform, featureName, percentage, strategy, userId) {
    const feature = platform.featureFlags.find(f => f.name === featureName);
    
    if (!feature) {
      throw new AppError(`Feature '${featureName}' not found`, 404);
    }

    feature.rolloutPercentage = {
      percentage: Math.max(0, Math.min(100, percentage)),
      strategy: strategy || 'random'
    };
    
    feature.lastModified = new Date();
    feature.modifiedBy = userId;

    return platform;
  }

  /**
   * Updates feature targeting
   * @private
   * @param {Object} platform - Platform instance
   * @param {string} featureName - Feature name
   * @param {Array} enabledTenants - Tenants to enable
   * @param {Array} disabledTenants - Tenants to disable
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated platform
   */
  async #updateFeatureTargeting(platform, featureName, enabledTenants, disabledTenants, userId) {
    const feature = platform.featureFlags.find(f => f.name === featureName);
    
    if (!feature) {
      throw new AppError(`Feature '${featureName}' not found`, 404);
    }

    if (enabledTenants) {
      feature.enabledTenants = enabledTenants;
    }
    
    if (disabledTenants) {
      feature.disabledTenants = disabledTenants;
    }
    
    feature.lastModified = new Date();
    feature.modifiedBy = userId;

    return platform;
  }

  /**
   * Schedules maintenance notifications
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @returns {Promise<void>}
   */
  async #scheduleMaintenanceNotifications(platform, maintenance) {
    try {
      for (const advanceMinutes of maintenance.notifications.advanceMinutes) {
        const notifyAt = new Date(maintenance.startTime.getTime() - advanceMinutes * 60 * 1000);
        
        if (notifyAt > new Date()) {
          // In production, use a job scheduler like Bull or Agenda
          setTimeout(async () => {
            await this.#sendMaintenanceNotification(platform, maintenance, advanceMinutes);
          }, notifyAt.getTime() - Date.now());
        }
      }
    } catch (error) {
      logger.error('Failed to schedule maintenance notifications', {
        platformId: platform.platformId,
        maintenanceId: maintenance.id,
        error: error.message
      });
    }
  }

  /**
   * Sends maintenance notification
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @param {number} advanceMinutes - Minutes in advance
   * @returns {Promise<void>}
   */
  async #sendMaintenanceNotification(platform, maintenance, advanceMinutes) {
    try {
      const timeLabel = advanceMinutes >= 60 ? `${advanceMinutes / 60} hour(s)` : `${advanceMinutes} minutes`;
      
      await this.#notificationService.sendToAll({
        type: 'platform.maintenance.reminder',
        title: `Scheduled Maintenance in ${timeLabel}`,
        message: maintenance.description,
        severity: maintenance.requiresDowntime ? 'high' : 'medium',
        data: {
          platformId: platform.platformId,
          maintenance,
          startsIn: advanceMinutes
        }
      });

      // Mark notification as sent
      maintenance.notifications.sentAt.push({
        minutes: advanceMinutes,
        timestamp: new Date()
      });
      
      await platform.save();
    } catch (error) {
      logger.error('Failed to send maintenance notification', {
        platformId: platform.platformId,
        maintenanceId: maintenance.id,
        error: error.message
      });
    }
  }

  /**
   * Sends maintenance status notification
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  async #sendMaintenanceStatusNotification(platform, maintenance, status) {
    try {
      const messages = {
        'in-progress': {
          title: 'Maintenance Started',
          message: `Scheduled maintenance has begun: ${maintenance.description}`,
          severity: 'high'
        },
        'completed': {
          title: 'Maintenance Completed',
          message: `Scheduled maintenance has been completed: ${maintenance.description}`,
          severity: 'info'
        }
      };

      const notification = messages[status];
      if (notification) {
        await this.#notificationService.sendToAll({
          type: `platform.maintenance.${status}`,
          ...notification,
          data: {
            platformId: platform.platformId,
            maintenance
          }
        });
      }
    } catch (error) {
      logger.error('Failed to send maintenance status notification', {
        platformId: platform.platformId,
        maintenanceId: maintenance.id,
        status,
        error: error.message
      });
    }
  }

  /**
   * Calculates uptime percentage
   * @private
   * @param {Date} deployedAt - Deployment timestamp
   * @returns {number} Uptime percentage
   */
  #calculateUptime(deployedAt) {
    const totalTime = Date.now() - deployedAt.getTime();
    const uptimeMs = totalTime; // In production, calculate actual uptime
    return Math.min(100, (uptimeMs / totalTime) * 100);
  }

  /**
   * Clears platform cache
   * @private
   * @returns {Promise<void>}
   */
  async #clearPlatformCache() {
    try {
      await this.#cacheService.delete('platform:*');
    } catch (error) {
      logger.error('Failed to clear platform cache', {
        error: error.message
      });
    }
  }
}

// Export singleton instance
module.exports = new PlatformService();