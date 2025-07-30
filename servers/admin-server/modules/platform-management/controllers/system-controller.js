'use strict';

/**
 * @fileoverview System management controller for platform-wide operations
 * @module servers/admin-server/modules/platform-management/controllers/system-controller
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:servers/admin-server/modules/platform-management/services/system-service
 * @requires module:servers/admin-server/modules/platform-management/validators/system-validators
 */

const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const SystemService = require('../services/system-service');
const { 
  validateSystemSettings,
  validateResourceAllocation,
  validatePerformanceConfig,
  validateSecurityConfig,
  validateBackupConfig
} = require('../validators/system-validators');

/**
 * Controller for system-wide management operations
 * @class SystemController
 */
class SystemController {
  /**
   * Get system information
   * @route GET /api/admin/system/info
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getSystemInfo = asyncHandler(async (req, res) => {
    const { detailed = false } = req.query;
    
    const systemInfo = await SystemService.getSystemInfo({
      detailed: detailed === 'true',
      userId: req.user.id
    });

    logger.info('System information retrieved', {
      userId: req.user.id,
      detailed
    });

    return ResponseFormatter.success(res, systemInfo, 'System information retrieved successfully');
  });

  /**
   * Get system metrics
   * @route GET /api/admin/system/metrics
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getSystemMetrics = asyncHandler(async (req, res) => {
    const { 
      timeRange = '1h',
      interval = '5m',
      metrics = 'all'
    } = req.query;

    const systemMetrics = await SystemService.getSystemMetrics({
      timeRange,
      interval,
      metrics: metrics.split(','),
      skipCache: req.query.skipCache === 'true'
    });

    return ResponseFormatter.success(res, systemMetrics, 'System metrics retrieved successfully');
  });

  /**
   * Update system settings
   * @route PATCH /api/admin/system/settings
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateSystemSettings = asyncHandler(async (req, res) => {
    const validatedData = validateSystemSettings(req.body);
    
    const updatedSettings = await SystemService.updateSystemSettings(
      validatedData,
      req.user.id
    );

    logger.info('System settings updated', {
      userId: req.user.id,
      updatedFields: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      updatedSettings,
      'System settings updated successfully'
    );
  });

  /**
   * Get resource utilization
   * @route GET /api/admin/system/resources
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getResourceUtilization = asyncHandler(async (req, res) => {
    const resources = await SystemService.getResourceUtilization();

    const warningThreshold = 80;
    const criticalResources = Object.entries(resources)
      .filter(([_, data]) => data.percentage > warningThreshold)
      .map(([resource]) => resource);

    if (criticalResources.length > 0) {
      logger.warn('High resource utilization detected', {
        userId: req.user.id,
        criticalResources
      });
    }

    return ResponseFormatter.success(res, resources, 'Resource utilization retrieved successfully');
  });

  /**
   * Update resource allocation
   * @route PUT /api/admin/system/resources/:resource
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateResourceAllocation = asyncHandler(async (req, res) => {
    const { resource } = req.params;
    const validatedData = validateResourceAllocation(req.body);

    const allocation = await SystemService.updateResourceAllocation(
      resource,
      validatedData,
      req.user.id
    );

    logger.info('Resource allocation updated', {
      userId: req.user.id,
      resource,
      newAllocation: validatedData
    });

    return ResponseFormatter.success(
      res,
      allocation,
      'Resource allocation updated successfully'
    );
  });

  /**
   * Get performance configuration
   * @route GET /api/admin/system/performance
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getPerformanceConfig = asyncHandler(async (req, res) => {
    const config = await SystemService.getPerformanceConfig();

    return ResponseFormatter.success(
      res,
      config,
      'Performance configuration retrieved successfully'
    );
  });

  /**
   * Update performance configuration
   * @route PUT /api/admin/system/performance
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updatePerformanceConfig = asyncHandler(async (req, res) => {
    const validatedData = validatePerformanceConfig(req.body);

    const config = await SystemService.updatePerformanceConfig(
      validatedData,
      req.user.id
    );

    logger.info('Performance configuration updated', {
      userId: req.user.id,
      updatedSettings: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      config,
      'Performance configuration updated successfully'
    );
  });

  /**
   * Get security configuration
   * @route GET /api/admin/system/security
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getSecurityConfig = asyncHandler(async (req, res) => {
    const { includeSecrets = false } = req.query;
    
    const config = await SystemService.getSecurityConfig({
      includeSecrets: includeSecrets === 'true' && req.user.permissions.includes('system.security.secrets')
    });

    logger.info('Security configuration retrieved', {
      userId: req.user.id,
      includeSecrets
    });

    return ResponseFormatter.success(
      res,
      config,
      'Security configuration retrieved successfully'
    );
  });

  /**
   * Update security configuration
   * @route PUT /api/admin/system/security
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateSecurityConfig = asyncHandler(async (req, res) => {
    const validatedData = validateSecurityConfig(req.body);

    const config = await SystemService.updateSecurityConfig(
      validatedData,
      req.user.id
    );

    logger.warn('Security configuration updated', {
      userId: req.user.id,
      updatedSettings: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      config,
      'Security configuration updated successfully'
    );
  });

  /**
   * Get system logs
   * @route GET /api/admin/system/logs
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getSystemLogs = asyncHandler(async (req, res) => {
    const {
      level = 'info',
      service = 'all',
      timeRange = '1h',
      limit = 100,
      offset = 0
    } = req.query;

    const logs = await SystemService.getSystemLogs({
      level,
      service,
      timeRange,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return ResponseFormatter.success(res, logs, 'System logs retrieved successfully');
  });

  /**
   * Perform system diagnostic
   * @route POST /api/admin/system/diagnostic
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  performDiagnostic = asyncHandler(async (req, res) => {
    const { components = ['all'] } = req.body;

    const diagnostic = await SystemService.performDiagnostic({
      components: Array.isArray(components) ? components : [components],
      userId: req.user.id
    });

    logger.info('System diagnostic performed', {
      userId: req.user.id,
      components,
      issues: diagnostic.issues.length
    });

    return ResponseFormatter.success(
      res,
      diagnostic,
      'System diagnostic completed successfully'
    );
  });

  /**
   * Clear system cache
   * @route POST /api/admin/system/cache/clear
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  clearSystemCache = asyncHandler(async (req, res) => {
    const { cacheTypes = ['all'] } = req.body;

    const result = await SystemService.clearSystemCache({
      cacheTypes: Array.isArray(cacheTypes) ? cacheTypes : [cacheTypes],
      userId: req.user.id
    });

    logger.info('System cache cleared', {
      userId: req.user.id,
      cacheTypes,
      itemsCleared: result.totalCleared
    });

    return ResponseFormatter.success(
      res,
      result,
      'System cache cleared successfully'
    );
  });

  /**
   * Get backup configuration
   * @route GET /api/admin/system/backup
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getBackupConfig = asyncHandler(async (req, res) => {
    const config = await SystemService.getBackupConfig();

    return ResponseFormatter.success(
      res,
      config,
      'Backup configuration retrieved successfully'
    );
  });

  /**
   * Update backup configuration
   * @route PUT /api/admin/system/backup
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateBackupConfig = asyncHandler(async (req, res) => {
    const validatedData = validateBackupConfig(req.body);

    const config = await SystemService.updateBackupConfig(
      validatedData,
      req.user.id
    );

    logger.info('Backup configuration updated', {
      userId: req.user.id,
      updatedSettings: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      config,
      'Backup configuration updated successfully'
    );
  });

  /**
   * Trigger manual backup
   * @route POST /api/admin/system/backup/trigger
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  triggerBackup = asyncHandler(async (req, res) => {
    const { 
      backupType = 'full',
      components = ['all']
    } = req.body;

    const backup = await SystemService.triggerBackup({
      backupType,
      components: Array.isArray(components) ? components : [components],
      userId: req.user.id
    });

    logger.info('Manual backup triggered', {
      userId: req.user.id,
      backupType,
      backupId: backup.id
    });

    return ResponseFormatter.success(
      res,
      backup,
      'Backup triggered successfully',
      202
    );
  });

  /**
   * Get system notifications
   * @route GET /api/admin/system/notifications
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getSystemNotifications = asyncHandler(async (req, res) => {
    const {
      status = 'unread',
      priority = 'all',
      limit = 50,
      offset = 0
    } = req.query;

    const notifications = await SystemService.getSystemNotifications({
      status,
      priority,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return ResponseFormatter.success(
      res,
      notifications,
      'System notifications retrieved successfully'
    );
  });

  /**
   * Mark notification as read
   * @route PATCH /api/admin/system/notifications/:notificationId/read
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  markNotificationRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    await SystemService.markNotificationRead(notificationId, req.user.id);

    return ResponseFormatter.success(
      res,
      { notificationId, read: true },
      'Notification marked as read'
    );
  });
}

module.exports = new SystemController();