'use strict';

/**
 * @fileoverview Platform management routes
 * @module servers/admin-server/modules/platform-management/routes/platform-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/platform-controller
 * @requires module:servers/admin-server/modules/platform-management/validators/platform-validators
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platform-controller');
const systemController = require('../controllers/system-controller');
const configurationController = require('../controllers/configuration-controller');
const maintenanceController = require('../controllers/maintenance-controller');
const {
  platformValidators,
  systemValidators,
  configurationValidators,
  maintenanceValidators
} = require('../validators');
const authenticate = require('../../../../../shared/lib/auth/middleware/authenticate');
const authorize = require('../../../../../shared/lib/auth/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/auth/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const logger = require('../../../../../shared/lib/utils/logger');

// Apply authentication to all routes
router.use(authenticate);

// Apply rate limiting
router.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
}));

/**
 * Platform Configuration Routes
 */

// Get platform configuration
router.get(
  '/platform',
  authorize(['admin', 'platform-manager']),
  requestValidator(platformValidators.getPlatformConfiguration),
  platformController.getPlatformConfiguration
);

// Create platform configuration
router.post(
  '/platform',
  authorize(['admin']),
  requestValidator(platformValidators.createPlatformConfiguration),
  platformController.createPlatformConfiguration
);

// Update platform configuration
router.put(
  '/platform/:platformId',
  authorize(['admin']),
  requestValidator(platformValidators.updatePlatformConfiguration),
  platformController.updatePlatformConfiguration
);

// Update platform status
router.patch(
  '/platform/:platformId/status',
  authorize(['admin']),
  requestValidator(platformValidators.updatePlatformStatus),
  platformController.updatePlatformStatus
);

// Get platform statistics
router.get(
  '/platform/:platformId/statistics',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(platformValidators.getPlatformStatistics),
  platformController.getPlatformStatistics
);

// Get platform issues
router.get(
  '/platform/:platformId/issues',
  authorize(['admin', 'platform-manager']),
  requestValidator(platformValidators.getPlatformIssues),
  platformController.getPlatformIssues
);

// Perform health check
router.post(
  '/platform/:platformId/health-check',
  authorize(['admin', 'platform-manager']),
  requestValidator(platformValidators.performHealthCheck),
  platformController.performHealthCheck
);

/**
 * Feature Flag Routes
 */

// Get all feature flags
router.get(
  '/platform/:platformId/features',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(platformValidators.getAllFeatureFlags),
  platformController.getAllFeatureFlags
);

// Manage feature flag
router.post(
  '/platform/:platformId/features/:featureName',
  authorize(['admin']),
  requestValidator(platformValidators.manageFeatureFlag),
  platformController.manageFeatureFlag
);

// Bulk update feature flags
router.post(
  '/platform/:platformId/features/bulk',
  authorize(['admin']),
  requestValidator(platformValidators.bulkUpdateFeatureFlags),
  platformController.bulkUpdateFeatureFlags
);

// Get feature flags for tenant
router.get(
  '/features/tenant/:tenantId',
  authorize(['admin', 'platform-manager', 'tenant-admin']),
  requestValidator(platformValidators.getFeatureFlagsForTenant),
  platformController.getFeatureFlagsForTenant
);

// Search feature flags
router.get(
  '/features/search',
  authorize(['admin', 'platform-manager']),
  requestValidator(platformValidators.searchFeatureFlags),
  platformController.searchFeatureFlags
);

/**
 * System Module Routes
 */

// Get system modules
router.get(
  '/platform/:platformId/modules',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(platformValidators.getSystemModules),
  platformController.getSystemModules
);

// Update system module
router.put(
  '/platform/:platformId/modules/:moduleName',
  authorize(['admin']),
  requestValidator(platformValidators.updateSystemModule),
  platformController.updateSystemModule
);

/**
 * Deployment Routes
 */

// Record deployment
router.post(
  '/platform/:platformId/deployments',
  authorize(['admin', 'deployer']),
  requestValidator(platformValidators.recordDeployment),
  platformController.recordDeployment
);

// Get deployment history
router.get(
  '/platform/:platformId/deployments',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(platformValidators.getDeploymentHistory),
  platformController.getDeploymentHistory
);

/**
 * System Health and Monitoring Routes
 */

// Initialize system monitoring
router.post(
  '/system/initialize',
  authorize(['admin']),
  requestValidator(systemValidators.initializeSystem),
  systemController.initializeSystem
);

// Get system health
router.get(
  '/system/:systemId/health',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getSystemHealth),
  systemController.getSystemHealth
);

// Update system metrics
router.post(
  '/system/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'agent']),
  requestValidator(systemValidators.updateSystemMetrics),
  systemController.updateSystemMetrics
);

// Get metrics history
router.get(
  '/system/:systemId/metrics/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getMetricsHistory),
  systemController.getMetricsHistory
);

// Get performance statistics
router.get(
  '/system/:systemId/performance',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getPerformanceStats),
  systemController.getPerformanceStats
);

// Export metrics
router.get(
  '/system/:systemId/metrics/export',
  authorize(['admin', 'platform-manager']),
  requestValidator(systemValidators.exportMetrics),
  systemController.exportMetrics
);

// Get system dashboard
router.get(
  '/system/:systemId/dashboard',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getSystemDashboard),
  systemController.getSystemDashboard
);

/**
 * Service Health Routes
 */

// Update service health
router.put(
  '/system/:systemId/services/:serviceName/health',
  authorize(['admin', 'platform-manager', 'agent']),
  requestValidator(systemValidators.updateServiceHealth),
  systemController.updateServiceHealth
);

// Get services status
router.get(
  '/system/:systemId/services',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getServicesStatus),
  systemController.getServicesStatus
);

/**
 * Alert Management Routes
 */

// Create system alert
router.post(
  '/system/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'agent']),
  requestValidator(systemValidators.createSystemAlert),
  systemController.createSystemAlert
);

// Acknowledge alert
router.post(
  '/system/:systemId/alerts/:alertId/acknowledge',
  authorize(['admin', 'platform-manager']),
  requestValidator(systemValidators.acknowledgeAlert),
  systemController.acknowledgeAlert
);

// Resolve alert
router.post(
  '/system/:systemId/alerts/:alertId/resolve',
  authorize(['admin', 'platform-manager']),
  requestValidator(systemValidators.resolveAlert),
  systemController.resolveAlert
);

// Get active alerts
router.get(
  '/alerts/active',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getActiveAlerts),
  systemController.getActiveAlerts
);

// Get alert history
router.get(
  '/system/:systemId/alerts/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getAlertHistory),
  systemController.getAlertHistory
);

/**
 * System Monitoring Control Routes
 */

// Start monitoring
router.post(
  '/system/:systemId/monitoring/start',
  authorize(['admin']),
  requestValidator(systemValidators.startMonitoring),
  systemController.startMonitoring
);

// Stop monitoring
router.post(
  '/system/:systemId/monitoring/stop',
  authorize(['admin']),
  requestValidator(systemValidators.stopMonitoring),
  systemController.stopMonitoring
);

// Update monitoring configuration
router.put(
  '/system/:systemId/monitoring/config',
  authorize(['admin']),
  requestValidator(systemValidators.updateMonitoringConfig),
  systemController.updateMonitoringConfig
);

// Perform health check
router.post(
  '/system/:systemId/health-check',
  authorize(['admin', 'platform-manager']),
  requestValidator(systemValidators.performHealthCheck),
  systemController.performHealthCheck
);

/**
 * Aggregated Metrics Routes
 */

// Get aggregated metrics
router.get(
  '/metrics/aggregated',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(systemValidators.getAggregatedMetrics),
  systemController.getAggregatedMetrics
);

/**
 * Configuration Management Routes
 */

// Create configuration
router.post(
  '/configurations',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.createConfiguration),
  configurationController.createConfiguration
);

// List configurations
router.get(
  '/configurations',
  authorize(['admin', 'config-manager', 'viewer']),
  requestValidator(configurationValidators.listConfigurations),
  configurationController.listConfigurations
);

// Search configuration values
router.get(
  '/configurations/search',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.searchConfigurationValues),
  configurationController.searchConfigurationValues
);

// Get configuration statistics
router.get(
  '/configurations/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  configurationController.getConfigurationStatistics
);

// Get configuration
router.get(
  '/configurations/:identifier',
  authorize(['admin', 'config-manager', 'viewer']),
  requestValidator(configurationValidators.getConfiguration),
  configurationController.getConfiguration
);

// Get configuration value
router.get(
  '/configurations/:configId/values/:key',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  requestValidator(configurationValidators.getConfigurationValue),
  configurationController.getConfigurationValue
);

// Set configuration value
router.put(
  '/configurations/:configId/values/:key',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.setConfigurationValue),
  configurationController.setConfigurationValue
);

// Update configuration values (batch)
router.patch(
  '/configurations/:configId/values',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.updateConfigurationValues),
  configurationController.updateConfigurationValues
);

// Delete configuration key
router.delete(
  '/configurations/:configId/values/:key',
  authorize(['admin']),
  requestValidator(configurationValidators.deleteConfigurationKey),
  configurationController.deleteConfigurationKey
);

// Validate configuration
router.post(
  '/configurations/:configId/validate',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.validateConfiguration),
  configurationController.validateConfiguration
);

// Lock configuration
router.post(
  '/configurations/:configId/lock',
  authorize(['admin']),
  requestValidator(configurationValidators.lockConfiguration),
  configurationController.lockConfiguration
);

// Unlock configuration
router.post(
  '/configurations/:configId/unlock',
  authorize(['admin']),
  requestValidator(configurationValidators.unlockConfiguration),
  configurationController.unlockConfiguration
);

// Rollback configuration
router.post(
  '/configurations/:configId/rollback',
  authorize(['admin']),
  requestValidator(configurationValidators.rollbackConfiguration),
  configurationController.rollbackConfiguration
);

// Get configuration statistics (specific)
router.get(
  '/configurations/:configId/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  requestValidator(configurationValidators.getConfigurationStatistics),
  configurationController.getConfigurationStatistics
);

/**
 * Configuration Version Management Routes
 */

// Get version history
router.get(
  '/configurations/:configId/versions',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.getVersionHistory),
  configurationController.getVersionHistory
);

// Get version changes
router.get(
  '/configurations/:configId/versions/:version',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.getVersionChanges),
  configurationController.getVersionChanges
);

// Compare versions
router.get(
  '/configurations/:configId/versions/compare',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.compareVersions),
  configurationController.compareVersions
);

/**
 * Configuration Environment Routes
 */

// Get configuration environments
router.get(
  '/configurations/:configId/environments',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.getConfigurationEnvironments),
  configurationController.getConfigurationEnvironments
);

// Sync configuration across environments
router.post(
  '/configurations/:configId/sync',
  authorize(['admin']),
  requestValidator(configurationValidators.syncConfiguration),
  configurationController.syncConfiguration
);

/**
 * Configuration Import/Export Routes
 */

// Export configuration
router.get(
  '/configurations/:configId/export',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.exportConfiguration),
  configurationController.exportConfiguration
);

// Import configuration
router.post(
  '/configurations/import',
  authorize(['admin']),
  requestValidator(configurationValidators.importConfiguration),
  configurationController.importConfiguration
);

// Clone configuration
router.post(
  '/configurations/:configId/clone',
  authorize(['admin', 'config-manager']),
  requestValidator(configurationValidators.cloneConfiguration),
  configurationController.cloneConfiguration
);

// Backup configuration
router.post(
  '/configurations/:configId/backup',
  authorize(['admin']),
  requestValidator(configurationValidators.backupConfiguration),
  configurationController.backupConfiguration
);

/**
 * Configuration Watch Routes
 */

// Watch configuration
router.post(
  '/configurations/:configId/watch',
  authorize(['admin', 'config-manager', 'application']),
  requestValidator(configurationValidators.watchConfiguration),
  configurationController.watchConfiguration
);

// Unwatch configuration
router.delete(
  '/configurations/watch/:watcherId',
  authorize(['admin', 'config-manager', 'application']),
  requestValidator(configurationValidators.unwatchConfiguration),
  configurationController.unwatchConfiguration
);

/**
 * Configuration Audit Routes
 */

// Get configuration audit trail
router.get(
  '/configurations/:configId/audit',
  authorize(['admin', 'auditor']),
  requestValidator(configurationValidators.getConfigurationAuditTrail),
  configurationController.getConfigurationAuditTrail
);

/**
 * Maintenance Window Routes
 */

// Schedule maintenance window
router.post(
  '/maintenance/schedule',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.scheduleMaintenanceWindow),
  maintenanceController.scheduleMaintenanceWindow
);

// Get active maintenance windows
router.get(
  '/maintenance/active',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getActiveMaintenanceWindows),
  maintenanceController.getActiveMaintenanceWindows
);

// Get scheduled maintenance windows
router.get(
  '/maintenance/scheduled',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getScheduledMaintenanceWindows),
  maintenanceController.getScheduledMaintenanceWindows
);

// Get maintenance history
router.get(
  '/maintenance/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getMaintenanceHistory),
  maintenanceController.getMaintenanceHistory
);

// Get maintenance statistics
router.get(
  '/maintenance/statistics',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getMaintenanceStatistics),
  maintenanceController.getMaintenanceStatistics
);

// Check maintenance status
router.get(
  '/maintenance/status',
  requestValidator(maintenanceValidators.checkMaintenanceStatus),
  maintenanceController.checkMaintenanceStatus
);

// Get upcoming maintenance windows
router.get(
  '/maintenance/upcoming',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getUpcomingMaintenanceWindows),
  maintenanceController.getUpcomingMaintenanceWindows
);

// Get maintenance calendar
router.get(
  '/maintenance/calendar',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getMaintenanceCalendar),
  maintenanceController.getMaintenanceCalendar
);

// Validate maintenance window
router.post(
  '/maintenance/validate',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.validateMaintenanceWindow),
  maintenanceController.validateMaintenanceWindow
);

// Export maintenance schedule
router.get(
  '/maintenance/export',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.exportMaintenanceSchedule),
  maintenanceController.exportMaintenanceSchedule
);

// Create maintenance report
router.get(
  '/maintenance/report',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.createMaintenanceReport),
  maintenanceController.createMaintenanceReport
);

// Register maintenance handler
router.post(
  '/maintenance/handlers',
  authorize(['admin']),
  requestValidator(maintenanceValidators.registerMaintenanceHandler),
  maintenanceController.registerMaintenanceHandler
);

// Get maintenance window details
router.get(
  '/maintenance/:maintenanceId',
  authorize(['admin', 'platform-manager', 'viewer']),
  requestValidator(maintenanceValidators.getMaintenanceWindow),
  maintenanceController.getMaintenanceWindow
);

// Update maintenance window
router.put(
  '/maintenance/:maintenanceId',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.updateMaintenanceWindow),
  maintenanceController.updateMaintenanceWindow
);

// Cancel maintenance window
router.post(
  '/maintenance/:maintenanceId/cancel',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.cancelMaintenanceWindow),
  maintenanceController.cancelMaintenanceWindow
);

// Start maintenance window
router.post(
  '/maintenance/:maintenanceId/start',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.startMaintenanceWindow),
  maintenanceController.startMaintenanceWindow
);

// Complete maintenance window
router.post(
  '/maintenance/:maintenanceId/complete',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.completeMaintenanceWindow),
  maintenanceController.completeMaintenanceWindow
);

// Extend maintenance window
router.post(
  '/maintenance/:maintenanceId/extend',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.extendMaintenanceWindow),
  maintenanceController.extendMaintenanceWindow
);

// Get maintenance impact analysis
router.get(
  '/maintenance/:maintenanceId/impact',
  authorize(['admin', 'platform-manager']),
  requestValidator(maintenanceValidators.getMaintenanceImpactAnalysis),
  maintenanceController.getMaintenanceImpactAnalysis
);

/**
 * Error handling middleware
 */
router.use((err, req, res, next) => {
  logger.error('Platform management route error', {
    error: err.message,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });
  next(err);
});

// Export router
module.exports = router;