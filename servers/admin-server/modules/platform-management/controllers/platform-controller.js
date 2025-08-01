'use strict';

/**
 * @fileoverview Platform management controller
 * @module servers/admin-server/modules/platform-management/controllers/platform-controller
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:servers/admin-server/modules/platform-management/services/platform-service
 * @requires module:servers/admin-server/modules/platform-management/validators/platform-validators
 */

const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
console.log('AsyncHandler module:', typeof require('../../../../../shared/lib/utils/async-handler'));
console.log('asyncHandler function:', typeof asyncHandler);
console.log('Available exports:', Object.keys(require('../../../../../shared/lib/utils/async-handler')));
const PlatformService = require('../services/platform-service');
const { validatePlatformUpdate, validateVersionUpdate, validateFeatureFlag, validateIntegration } = require('../validators/platform-validators');

/**
 * Controller for platform management operations
 * @class PlatformController
 */
class PlatformController {
  /**
   * Get platform configuration
   * @route GET /api/admin/platform
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformConfig = asyncHandler(async (req, res) => {
    const { includeSecrets = false } = req.query;
    
    const config = await PlatformService.getPlatformConfig({
      includeSecrets: includeSecrets === 'true' && req.user.permissions.includes('platform.secrets.view'),
      skipCache: req.query.skipCache === 'true'
    });

    logger.info('Platform configuration retrieved', {
      userId: req.user.id,
      includeSecrets
    });

    return ResponseFormatter.success(res, config, 'Platform configuration retrieved successfully');
  });

  /**
   * Update platform configuration
   * @route PATCH /api/admin/platform
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePlatformConfig = asyncHandler(async (req, res) => {
    const validatedData = validatePlatformUpdate(req.body);
    
    const updatedConfig = await PlatformService.updatePlatformConfig(
      validatedData,
      req.user.id
    );

    logger.info('Platform configuration updated', {
      userId: req.user.id,
      updatedFields: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res, 
      updatedConfig, 
      'Platform configuration updated successfully'
    );
  });

  /**
   * Update platform version
   * @route POST /api/admin/platform/version
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateVersion = asyncHandler(async (req, res) => {
    const { version, force = false } = validateVersionUpdate(req.body);
    
    if (!force && !req.user.permissions.includes('platform.version.force')) {
      throw new AppError(
        'Force update requires special permissions',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const platform = await PlatformService.updateVersion(version, req.user.id);

    logger.info('Platform version updated', {
      userId: req.user.id,
      previousVersion: platform.version.previous[platform.version.previous.length - 1].version,
      newVersion: version
    });

    return ResponseFormatter.success(
      res,
      {
        previousVersion: platform.version.previous[platform.version.previous.length - 1].version,
        currentVersion: platform.version.current,
        upgradedAt: new Date()
      },
      'Platform version updated successfully'
    );
  });

  /**
   * Enable maintenance mode
   * @route POST /api/admin/platform/maintenance/enable
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  enableMaintenanceMode = asyncHandler(async (req, res) => {
    const {
      message = 'System maintenance in progress',
      duration = 3600000,
      allowedIps = []
    } = req.body;

    const platform = await PlatformService.enableMaintenanceMode(
      { message, duration, allowedIps },
      req.user.id
    );

    logger.warn('Maintenance mode enabled', {
      userId: req.user.id,
      duration,
      endTime: platform.api.maintenanceMode.endTime
    });

    return ResponseFormatter.success(
      res,
      {
        enabled: true,
        message: platform.api.maintenanceMode.message,
        startTime: platform.api.maintenanceMode.startTime,
        endTime: platform.api.maintenanceMode.endTime,
        allowedIps: platform.api.maintenanceMode.allowedIps
      },
      'Maintenance mode enabled successfully'
    );
  });

  /**
   * Disable maintenance mode
   * @route POST /api/admin/platform/maintenance/disable
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  disableMaintenanceMode = asyncHandler(async (req, res) => {
    const platform = await PlatformService.disableMaintenanceMode(req.user.id);

    logger.info('Maintenance mode disabled', {
      userId: req.user.id
    });

    return ResponseFormatter.success(
      res,
      {
        enabled: false,
        disabledAt: new Date()
      },
      'Maintenance mode disabled successfully'
    );
  });

  /**
   * Get feature flags
   * @route GET /api/admin/platform/features
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getFeatureFlags = asyncHandler(async (req, res) => {
    const features = await PlatformService.getFeatureFlags({
      skipCache: req.query.skipCache === 'true'
    });

    return ResponseFormatter.success(res, features, 'Feature flags retrieved successfully');
  });

  /**
   * Update feature flag
   * @route PUT /api/admin/platform/features/:featureName
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateFeatureFlag = asyncHandler(async (req, res) => {
    const { featureName } = req.params;
    const validatedConfig = validateFeatureFlag(req.body);
    
    const feature = await PlatformService.updateFeatureFlag(
      featureName,
      validatedConfig,
      req.user.id
    );

    logger.info('Feature flag updated', {
      userId: req.user.id,
      feature: featureName,
      enabled: validatedConfig.enabled
    });

    return ResponseFormatter.success(
      res,
      {
        featureName,
        config: feature
      },
      'Feature flag updated successfully'
    );
  });

  /**
   * Check feature flag status
   * @route GET /api/admin/platform/features/:featureName/check
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  checkFeatureFlag = asyncHandler(async (req, res) => {
    const { featureName } = req.params;
    const { userId, organizationId } = req.query;
    
    const enabled = await PlatformService.isFeatureEnabled(featureName, {
      userId,
      organizationId
    });

    return ResponseFormatter.success(
      res,
      {
        featureName,
        enabled,
        context: { userId, organizationId }
      },
      'Feature flag status retrieved'
    );
  });

  /**
   * Get platform integrations
   * @route GET /api/admin/platform/integrations
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getIntegrations = asyncHandler(async (req, res) => {
    const platform = await PlatformService.getPlatformConfig({
      includeSecrets: false
    });

    const integrations = platform.integrations.map(integration => ({
      id: integration._id,
      name: integration.name,
      type: integration.type,
      provider: integration.provider,
      enabled: integration.enabled,
      config: integration.config
    }));

    return ResponseFormatter.success(
      res,
      integrations,
      'Platform integrations retrieved successfully'
    );
  });

  /**
   * Add platform integration
   * @route POST /api/admin/platform/integrations
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  addIntegration = asyncHandler(async (req, res) => {
    const validatedData = validateIntegration(req.body);
    
    const integration = await PlatformService.addIntegration(
      validatedData,
      req.user.id
    );

    logger.info('Platform integration added', {
      userId: req.user.id,
      integration: integration.name,
      type: integration.type
    });

    return ResponseFormatter.success(
      res,
      integration,
      'Integration added successfully',
      201
    );
  });

  /**
   * Update platform integration
   * @route PUT /api/admin/platform/integrations/:integrationId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateIntegration = asyncHandler(async (req, res) => {
    const { integrationId } = req.params;
    const validatedData = validateIntegration(req.body, true);
    
    const integration = await PlatformService.updateIntegration(
      integrationId,
      validatedData,
      req.user.id
    );

    logger.info('Platform integration updated', {
      userId: req.user.id,
      integrationId,
      integration: integration.name
    });

    return ResponseFormatter.success(
      res,
      integration,
      'Integration updated successfully'
    );
  });

  /**
   * Delete platform integration
   * @route DELETE /api/admin/platform/integrations/:integrationId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  deleteIntegration = asyncHandler(async (req, res) => {
    const { integrationId } = req.params;
    
    // Integration deletion is done by disabling it
    const integration = await PlatformService.updateIntegration(
      integrationId,
      { enabled: false },
      req.user.id
    );

    logger.info('Platform integration disabled', {
      userId: req.user.id,
      integrationId,
      integration: integration.name
    });

    return ResponseFormatter.success(
      res,
      { id: integrationId, enabled: false },
      'Integration disabled successfully'
    );
  });

  /**
   * Get platform status
   * @route GET /api/admin/platform/status
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformStatus = asyncHandler(async (req, res) => {
    const status = await PlatformService.getPlatformStatus();

    return ResponseFormatter.success(res, status, 'Platform status retrieved successfully');
  });

  /**
   * Update platform status
   * @route POST /api/admin/platform/status
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePlatformStatus = asyncHandler(async (req, res) => {
    const { services } = req.body;
    
    if (!Array.isArray(services)) {
      throw new AppError('Services must be an array', 400, 'INVALID_SERVICES');
    }

    const status = await PlatformService.updatePlatformStatus(services);

    logger.info('Platform status updated', {
      userId: req.user.id,
      overallStatus: status.overall
    });

    return ResponseFormatter.success(
      res,
      status,
      'Platform status updated successfully'
    );
  });

  /**
   * Record platform incident
   * @route POST /api/admin/platform/incidents
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  recordIncident = asyncHandler(async (req, res) => {
    const { title, severity, description } = req.body;
    
    if (!title || !severity) {
      throw new AppError('Title and severity are required', 400, 'MISSING_REQUIRED_FIELDS');
    }

    const incident = await PlatformService.recordIncident(
      { title, severity, description },
      req.user.id
    );

    logger.error('Platform incident recorded', {
      userId: req.user.id,
      incident: title,
      severity
    });

    return ResponseFormatter.success(
      res,
      incident,
      'Incident recorded successfully',
      201
    );
  });

  /**
   * Check resource limits
   * @route GET /api/admin/platform/limits/:resource
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  checkResourceLimit = asyncHandler(async (req, res) => {
    const { resource } = req.params;
    const { currentUsage } = req.query;
    
    if (!currentUsage || isNaN(currentUsage)) {
      throw new AppError('Current usage must be a valid number', 400, 'INVALID_USAGE');
    }

    const result = await PlatformService.checkResourceLimit(
      resource,
      parseFloat(currentUsage)
    );

    return ResponseFormatter.success(
      res,
      result,
      'Resource limit check completed'
    );
  });

  /**
   * Perform platform health check
   * @route GET /api/admin/platform/health
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  performHealthCheck = asyncHandler(async (req, res) => {
    const health = await PlatformService.performHealthCheck();

    const statusCode = health.healthy ? 200 : 503;
    
    return ResponseFormatter.success(
      res,
      health,
      health.healthy ? 'Platform is healthy' : 'Platform health check failed',
      statusCode
    );
  });

  /**
   * Get public platform configuration
   * @route GET /api/admin/platform/public
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPublicConfig = asyncHandler(async (req, res) => {
    const config = await PlatformService.getPublicConfig();

    return ResponseFormatter.success(
      res,
      config,
      'Public configuration retrieved successfully'
    );
  });

  /**
   * Get platform overview
   * @route GET /api/admin/platform/overview
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformOverview = async (req, res) => {
    try {
      const overview = await PlatformService.getPlatformOverview();

      logger.info('Platform overview retrieved', {
        userId: req.user.id
      });

      return ResponseFormatter.success(res, overview, 'Platform overview retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform overview', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform statistics
   * @route GET /api/admin/platform/statistics
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformStatistics = async (req, res) => {
    try {
      const { timeRange, skipCache } = req.query;
      
      const statistics = await PlatformService.getPlatformStatistics({
        timeRange,
        skipCache: skipCache === 'true'
      });

      logger.info('Platform statistics retrieved', {
        userId: req.user.id,
        timeRange
      });

      return ResponseFormatter.success(res, statistics, 'Platform statistics retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform statistics', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform settings
   * @route GET /api/admin/platform/settings
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformSettings = async (req, res) => {
    try {
      const settings = await PlatformService.getPlatformSettings();

      logger.info('Platform settings retrieved', {
        userId: req.user.id
      });

      return ResponseFormatter.success(res, settings, 'Platform settings retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform settings', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Update platform settings
   * @route PUT /api/admin/platform/settings
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePlatformSettings = async (req, res) => {
    try {
      const updatedSettings = await PlatformService.updatePlatformSettings(
        req.body,
        req.user.id
      );

      logger.info('Platform settings updated', {
        userId: req.user.id,
        settingsUpdated: Object.keys(req.body)
      });

      return ResponseFormatter.success(res, updatedSettings, 'Platform settings updated successfully');
    } catch (error) {
      logger.error('Failed to update platform settings', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Reset platform settings to defaults
   * @route POST /api/admin/platform/settings/reset
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  resetPlatformSettings = async (req, res) => {
    try {
      const resetSettings = await PlatformService.resetPlatformSettings(req.user.id);

      logger.warn('Platform settings reset to defaults', {
        userId: req.user.id
      });

      return ResponseFormatter.success(res, resetSettings, 'Platform settings reset successfully');
    } catch (error) {
      logger.error('Failed to reset platform settings', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform modules
   * @route GET /api/admin/platform/modules
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformModules = async (req, res) => {
    try {
      const modules = await PlatformService.getPlatformModules();

      logger.info('Platform modules retrieved', {
        userId: req.user.id,
        moduleCount: modules.length
      });

      return ResponseFormatter.success(res, modules, 'Platform modules retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform modules', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Update platform module
   * @route PUT /api/admin/platform/modules/:moduleId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePlatformModule = async (req, res) => {
    try {
      const { moduleId } = req.params;
      
      const updatedModule = await PlatformService.updatePlatformModule(
        moduleId,
        req.body,
        req.user.id
      );

      logger.info('Platform module updated', {
        userId: req.user.id,
        moduleId,
        updates: Object.keys(req.body)
      });

      return ResponseFormatter.success(res, updatedModule, 'Platform module updated successfully');
    } catch (error) {
      logger.error('Failed to update platform module', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Enable platform module
   * @route POST /api/admin/platform/modules/:moduleId/enable
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  enablePlatformModule = async (req, res) => {
    try {
      const { moduleId } = req.params;
      
      const moduleStatus = await PlatformService.enablePlatformModule(moduleId, req.user.id);

      logger.info('Platform module enabled', {
        userId: req.user.id,
        moduleId
      });

      return ResponseFormatter.success(res, moduleStatus, 'Platform module enabled successfully');
    } catch (error) {
      logger.error('Failed to enable platform module', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Disable platform module
   * @route POST /api/admin/platform/modules/:moduleId/disable
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  disablePlatformModule = async (req, res) => {
    try {
      const { moduleId } = req.params;
      
      const moduleStatus = await PlatformService.disablePlatformModule(moduleId, req.user.id);

      logger.info('Platform module disabled', {
        userId: req.user.id,
        moduleId
      });

      return ResponseFormatter.success(res, moduleStatus, 'Platform module disabled successfully');
    } catch (error) {
      logger.error('Failed to disable platform module', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform deployments
   * @route GET /api/admin/platform/deployments
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformDeployments = async (req, res) => {
    try {
      const { limit, status } = req.query;
      
      const deployments = await PlatformService.getPlatformDeployments({
        limit: limit ? parseInt(limit) : undefined,
        status
      });

      logger.info('Platform deployments retrieved', {
        userId: req.user.id,
        count: deployments.length
      });

      return ResponseFormatter.success(res, deployments, 'Platform deployments retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform deployments', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Create platform deployment
   * @route POST /api/admin/platform/deployments
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  createPlatformDeployment = async (req, res) => {
    try {
      const deployment = await PlatformService.createPlatformDeployment(
        req.body,
        req.user.id
      );

      logger.info('Platform deployment created', {
        userId: req.user.id,
        deploymentId: deployment.id,
        version: deployment.version
      });

      return ResponseFormatter.success(res, deployment, 'Platform deployment created successfully', 201);
    } catch (error) {
      logger.error('Failed to create platform deployment', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform deployment details
   * @route GET /api/admin/platform/deployments/:deploymentId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformDeploymentDetails = async (req, res) => {
    try {
      const { deploymentId } = req.params;
      
      const deployment = await PlatformService.getPlatformDeploymentDetails(deploymentId);

      logger.info('Platform deployment details retrieved', {
        userId: req.user.id,
        deploymentId
      });

      return ResponseFormatter.success(res, deployment, 'Platform deployment details retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform deployment details', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Rollback platform deployment
   * @route POST /api/admin/platform/deployments/:deploymentId/rollback
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  rollbackPlatformDeployment = async (req, res) => {
    try {
      const { deploymentId } = req.params;
      
      const rollback = await PlatformService.rollbackPlatformDeployment(
        deploymentId,
        req.user.id
      );

      logger.warn('Platform deployment rollback initiated', {
        userId: req.user.id,
        deploymentId
      });

      return ResponseFormatter.success(res, rollback, 'Platform deployment rollback initiated successfully');
    } catch (error) {
      logger.error('Failed to rollback platform deployment', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform resources
   * @route GET /api/admin/platform/resources
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformResources = async (req, res) => {
    try {
      const resources = await PlatformService.getPlatformResources();

      logger.info('Platform resources retrieved', {
        userId: req.user.id
      });

      return ResponseFormatter.success(res, resources, 'Platform resources retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform resources', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform resource usage
   * @route GET /api/admin/platform/resources/usage
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformResourceUsage = async (req, res) => {
    try {
      const { timeRange } = req.query;
      
      const usage = await PlatformService.getPlatformResourceUsage({
        timeRange
      });

      logger.info('Platform resource usage retrieved', {
        userId: req.user.id,
        timeRange
      });

      return ResponseFormatter.success(res, usage, 'Platform resource usage retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform resource usage', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Update platform resource limits
   * @route PUT /api/admin/platform/resources/limits
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePlatformResourceLimits = async (req, res) => {
    try {
      const updatedLimits = await PlatformService.updatePlatformResourceLimits(
        req.body,
        req.user.id
      );

      logger.info('Platform resource limits updated', {
        userId: req.user.id,
        limits: Object.keys(req.body)
      });

      return ResponseFormatter.success(res, updatedLimits, 'Platform resource limits updated successfully');
    } catch (error) {
      logger.error('Failed to update platform resource limits', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform API endpoints
   * @route GET /api/admin/platform/api/endpoints
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformAPIEndpoints = async (req, res) => {
    try {
      const endpoints = await PlatformService.getPlatformAPIEndpoints();

      logger.info('Platform API endpoints retrieved', {
        userId: req.user.id,
        endpointCount: endpoints.length
      });

      return ResponseFormatter.success(res, endpoints, 'Platform API endpoints retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform API endpoints', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform API usage
   * @route GET /api/admin/platform/api/usage
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformAPIUsage = async (req, res) => {
    try {
      const { timeRange } = req.query;
      
      const usage = await PlatformService.getPlatformAPIUsage({
        timeRange
      });

      logger.info('Platform API usage retrieved', {
        userId: req.user.id,
        timeRange
      });

      return ResponseFormatter.success(res, usage, 'Platform API usage retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform API usage', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Update platform API rate limits
   * @route PUT /api/admin/platform/api/rate-limits
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePlatformAPIRateLimits = async (req, res) => {
    try {
      const updatedLimits = await PlatformService.updatePlatformAPIRateLimits(
        req.body,
        req.user.id
      );

      logger.info('Platform API rate limits updated', {
        userId: req.user.id,
        limits: Object.keys(req.body)
      });

      return ResponseFormatter.success(res, updatedLimits, 'Platform API rate limits updated successfully');
    } catch (error) {
      logger.error('Failed to update platform API rate limits', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform analytics dashboard
   * @route GET /api/admin/platform/analytics/dashboard
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformAnalyticsDashboard = async (req, res) => {
    try {
      const { timeRange } = req.query;
      
      const dashboard = await PlatformService.getPlatformAnalyticsDashboard({
        timeRange
      });

      logger.info('Platform analytics dashboard retrieved', {
        userId: req.user.id,
        timeRange
      });

      return ResponseFormatter.success(res, dashboard, 'Platform analytics dashboard retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform analytics dashboard', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Get platform trends
   * @route GET /api/admin/platform/analytics/trends
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPlatformTrends = async (req, res) => {
    try {
      const { metric, timeRange } = req.query;
      
      const trends = await PlatformService.getPlatformTrends({
        metric,
        timeRange
      });

      logger.info('Platform trends retrieved', {
        userId: req.user.id,
        metric,
        timeRange
      });

      return ResponseFormatter.success(res, trends, 'Platform trends retrieved successfully');
    } catch (error) {
      logger.error('Failed to get platform trends', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };

  /**
   * Export platform analytics
   * @route POST /api/admin/platform/analytics/export
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  exportPlatformAnalytics = async (req, res) => {
    try {
      const exportJob = await PlatformService.exportPlatformAnalytics(
        req.body,
        req.user.id
      );

      logger.info('Platform analytics export requested', {
        userId: req.user.id,
        exportId: exportJob.id,
        format: exportJob.format
      });

      return ResponseFormatter.success(res, exportJob, 'Platform analytics export initiated successfully', 202);
    } catch (error) {
      logger.error('Failed to export platform analytics', error);
      return ResponseFormatter.error(res, error.message, error.statusCode || 500);
    }
  };
}

module.exports = new PlatformController();