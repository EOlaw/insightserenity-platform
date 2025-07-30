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
const AppError = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
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
}

module.exports = new PlatformController();