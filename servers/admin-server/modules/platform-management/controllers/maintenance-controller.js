'use strict';

/**
 * @fileoverview Maintenance management controller for platform operations
 * @module servers/admin-server/modules/platform-management/controllers/maintenance-controller
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:servers/admin-server/modules/platform-management/services/maintenance-service
 * @requires module:servers/admin-server/modules/platform-management/validators/maintenance-validators
 */

const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const MaintenanceService = require('../services/maintenance-service');
const {
  validateMaintenanceWindow,
  validateDeployment,
  validateMigration,
  validateSystemUpdate,
  validateHealthCheck
} = require('../validators/maintenance-validators');

/**
 * Controller for maintenance management operations
 * @class MaintenanceController
 */
class MaintenanceController {
  /**
   * Get maintenance status
   * @route GET /api/admin/maintenance/status
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getMaintenanceStatus = asyncHandler(async (req, res) => {
    const status = await MaintenanceService.getMaintenanceStatus();

    logger.info('Maintenance status retrieved', {
      userId: req.user.id,
      isActive: status.active,
      nextWindow: status.nextScheduledWindow
    });

    return ResponseFormatter.success(
      res,
      status,
      'Maintenance status retrieved successfully'
    );
  });

  /**
   * Enable maintenance mode
   * @route POST /api/admin/maintenance/enable
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  enableMaintenanceMode = asyncHandler(async (req, res) => {
    const validatedData = validateMaintenanceWindow(req.body);

    const maintenance = await MaintenanceService.enableMaintenanceMode({
      ...validatedData,
      enabledBy: req.user.id
    });

    logger.warn('Maintenance mode enabled', {
      userId: req.user.id,
      duration: validatedData.duration,
      reason: validatedData.reason
    });

    return ResponseFormatter.success(
      res,
      maintenance,
      'Maintenance mode enabled successfully'
    );
  });

  /**
   * Disable maintenance mode
   * @route POST /api/admin/maintenance/disable
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  disableMaintenanceMode = asyncHandler(async (req, res) => {
    const { reason } = req.body;

    const result = await MaintenanceService.disableMaintenanceMode({
      reason,
      disabledBy: req.user.id
    });

    logger.info('Maintenance mode disabled', {
      userId: req.user.id,
      reason,
      duration: result.duration
    });

    return ResponseFormatter.success(
      res,
      result,
      'Maintenance mode disabled successfully'
    );
  });

  /**
   * Schedule maintenance window
   * @route POST /api/admin/maintenance/schedule
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  scheduleMaintenanceWindow = asyncHandler(async (req, res) => {
    const validatedData = validateMaintenanceWindow(req.body);

    const window = await MaintenanceService.scheduleMaintenanceWindow({
      ...validatedData,
      scheduledBy: req.user.id
    });

    logger.info('Maintenance window scheduled', {
      userId: req.user.id,
      startTime: window.startTime,
      endTime: window.endTime,
      type: window.type
    });

    return ResponseFormatter.success(
      res,
      window,
      'Maintenance window scheduled successfully',
      201
    );
  });

  /**
   * Get maintenance windows
   * @route GET /api/admin/maintenance/windows
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getMaintenanceWindows = asyncHandler(async (req, res) => {
    const {
      status = 'all',
      timeRange = 'future',
      limit = 50,
      offset = 0
    } = req.query;

    const windows = await MaintenanceService.getMaintenanceWindows({
      status,
      timeRange,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return ResponseFormatter.success(
      res,
      windows,
      'Maintenance windows retrieved successfully'
    );
  });

  /**
   * Update maintenance window
   * @route PUT /api/admin/maintenance/windows/:windowId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateMaintenanceWindow = asyncHandler(async (req, res) => {
    const { windowId } = req.params;
    const validatedData = validateMaintenanceWindow(req.body, true);

    const window = await MaintenanceService.updateMaintenanceWindow(
      windowId,
      {
        ...validatedData,
        updatedBy: req.user.id
      }
    );

    logger.info('Maintenance window updated', {
      userId: req.user.id,
      windowId,
      updatedFields: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      window,
      'Maintenance window updated successfully'
    );
  });

  /**
   * Cancel maintenance window
   * @route DELETE /api/admin/maintenance/windows/:windowId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  cancelMaintenanceWindow = asyncHandler(async (req, res) => {
    const { windowId } = req.params;
    const { reason } = req.body;

    await MaintenanceService.cancelMaintenanceWindow(
      windowId,
      {
        reason,
        cancelledBy: req.user.id
      }
    );

    logger.info('Maintenance window cancelled', {
      userId: req.user.id,
      windowId,
      reason
    });

    return ResponseFormatter.success(
      res,
      { windowId, cancelled: true },
      'Maintenance window cancelled successfully'
    );
  });

  /**
   * Initiate deployment
   * @route POST /api/admin/maintenance/deployment
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  initiateDeployment = asyncHandler(async (req, res) => {
    const validatedData = validateDeployment(req.body);

    const deployment = await MaintenanceService.initiateDeployment({
      ...validatedData,
      initiatedBy: req.user.id
    });

    logger.info('Deployment initiated', {
      userId: req.user.id,
      deploymentId: deployment.id,
      version: validatedData.version,
      environment: validatedData.environment
    });

    return ResponseFormatter.success(
      res,
      deployment,
      'Deployment initiated successfully',
      201
    );
  });

  /**
   * Get deployment status
   * @route GET /api/admin/maintenance/deployment/:deploymentId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getDeploymentStatus = asyncHandler(async (req, res) => {
    const { deploymentId } = req.params;

    const deployment = await MaintenanceService.getDeploymentStatus(deploymentId);

    return ResponseFormatter.success(
      res,
      deployment,
      'Deployment status retrieved successfully'
    );
  });

  /**
   * Rollback deployment
   * @route POST /api/admin/maintenance/deployment/:deploymentId/rollback
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  rollbackDeployment = asyncHandler(async (req, res) => {
    const { deploymentId } = req.params;
    const { reason, targetVersion } = req.body;

    const rollback = await MaintenanceService.rollbackDeployment(
      deploymentId,
      {
        reason,
        targetVersion,
        initiatedBy: req.user.id
      }
    );

    logger.warn('Deployment rollback initiated', {
      userId: req.user.id,
      deploymentId,
      targetVersion,
      reason
    });

    return ResponseFormatter.success(
      res,
      rollback,
      'Deployment rollback initiated successfully'
    );
  });

  /**
   * Run database migration
   * @route POST /api/admin/maintenance/migration
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  runDatabaseMigration = asyncHandler(async (req, res) => {
    const validatedData = validateMigration(req.body);

    const migration = await MaintenanceService.runDatabaseMigration({
      ...validatedData,
      executedBy: req.user.id
    });

    logger.info('Database migration started', {
      userId: req.user.id,
      migrationId: migration.id,
      version: validatedData.version,
      direction: validatedData.direction
    });

    return ResponseFormatter.success(
      res,
      migration,
      'Database migration started successfully',
      201
    );
  });

  /**
   * Get migration status
   * @route GET /api/admin/maintenance/migration/:migrationId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getMigrationStatus = asyncHandler(async (req, res) => {
    const { migrationId } = req.params;

    const migration = await MaintenanceService.getMigrationStatus(migrationId);

    return ResponseFormatter.success(
      res,
      migration,
      'Migration status retrieved successfully'
    );
  });

  /**
   * Get migration history
   * @route GET /api/admin/maintenance/migrations
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getMigrationHistory = asyncHandler(async (req, res) => {
    const {
      status,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const history = await MaintenanceService.getMigrationHistory({
      status,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return ResponseFormatter.success(
      res,
      history,
      'Migration history retrieved successfully'
    );
  });

  /**
   * Apply system update
   * @route POST /api/admin/maintenance/system/update
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  applySystemUpdate = asyncHandler(async (req, res) => {
    const validatedData = validateSystemUpdate(req.body);

    const update = await MaintenanceService.applySystemUpdate({
      ...validatedData,
      appliedBy: req.user.id
    });

    logger.info('System update applied', {
      userId: req.user.id,
      updateId: update.id,
      component: validatedData.component,
      version: validatedData.version
    });

    return ResponseFormatter.success(
      res,
      update,
      'System update applied successfully',
      201
    );
  });

  /**
   * Restart service
   * @route POST /api/admin/maintenance/service/restart
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  restartService = asyncHandler(async (req, res) => {
    const { serviceName, graceful = true, reason } = req.body;

    if (!serviceName) {
      throw new AppError('Service name is required', 400);
    }

    const result = await MaintenanceService.restartService({
      serviceName,
      graceful,
      reason,
      restartedBy: req.user.id
    });

    logger.warn('Service restart initiated', {
      userId: req.user.id,
      serviceName,
      graceful,
      reason
    });

    return ResponseFormatter.success(
      res,
      result,
      'Service restart initiated successfully'
    );
  });

  /**
   * Run system health check
   * @route POST /api/admin/maintenance/health-check
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  runHealthCheck = asyncHandler(async (req, res) => {
    const validatedData = validateHealthCheck(req.body);

    const healthCheck = await MaintenanceService.runHealthCheck({
      ...validatedData,
      initiatedBy: req.user.id
    });

    logger.info('Health check initiated', {
      userId: req.user.id,
      checkId: healthCheck.id,
      components: validatedData.components,
      comprehensive: validatedData.comprehensive
    });

    return ResponseFormatter.success(
      res,
      healthCheck,
      'Health check initiated successfully'
    );
  });

  /**
   * Get health check results
   * @route GET /api/admin/maintenance/health-check/:checkId
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getHealthCheckResults = asyncHandler(async (req, res) => {
    const { checkId } = req.params;

    const results = await MaintenanceService.getHealthCheckResults(checkId);

    return ResponseFormatter.success(
      res,
      results,
      'Health check results retrieved successfully'
    );
  });

  /**
   * Get maintenance logs
   * @route GET /api/admin/maintenance/logs
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getMaintenanceLogs = asyncHandler(async (req, res) => {
    const {
      type,
      severity,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const logs = await MaintenanceService.getMaintenanceLogs({
      type,
      severity,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return ResponseFormatter.success(
      res,
      logs,
      'Maintenance logs retrieved successfully'
    );
  });

  /**
   * Get system backup status
   * @route GET /api/admin/maintenance/backup/status
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getBackupStatus = asyncHandler(async (req, res) => {
    const backupStatus = await MaintenanceService.getBackupStatus();

    return ResponseFormatter.success(
      res,
      backupStatus,
      'Backup status retrieved successfully'
    );
  });

  /**
   * Initiate system backup
   * @route POST /api/admin/maintenance/backup
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  initiateBackup = asyncHandler(async (req, res) => {
    const {
      backupType = 'full',
      components = ['all'],
      description
    } = req.body;

    const backup = await MaintenanceService.initiateBackup({
      backupType,
      components,
      description,
      initiatedBy: req.user.id
    });

    logger.info('System backup initiated', {
      userId: req.user.id,
      backupId: backup.id,
      backupType,
      components
    });

    return ResponseFormatter.success(
      res,
      backup,
      'System backup initiated successfully',
      201
    );
  });

  /**
   * Restore from backup
   * @route POST /api/admin/maintenance/restore
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  restoreFromBackup = asyncHandler(async (req, res) => {
    const {
      backupId,
      components = ['all'],
      verifyIntegrity = true,
      reason
    } = req.body;

    if (!backupId) {
      throw new AppError('Backup ID is required', 400);
    }

    const restore = await MaintenanceService.restoreFromBackup({
      backupId,
      components,
      verifyIntegrity,
      reason,
      initiatedBy: req.user.id
    });

    logger.warn('System restore initiated', {
      userId: req.user.id,
      restoreId: restore.id,
      backupId,
      components
    });

    return ResponseFormatter.success(
      res,
      restore,
      'System restore initiated successfully'
    );
  });

  /**
   * Get maintenance recommendations
   * @route GET /api/admin/maintenance/recommendations
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getMaintenanceRecommendations = asyncHandler(async (req, res) => {
    const recommendations = await MaintenanceService.getMaintenanceRecommendations();

    return ResponseFormatter.success(
      res,
      recommendations,
      'Maintenance recommendations retrieved successfully'
    );
  });
}

module.exports = MaintenanceController;