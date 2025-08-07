'use strict';

/**
 * @fileoverview System monitoring and health management routes
 * @module servers/admin-server/modules/platform-management/routes/system-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/system-controller
 * @requires module:servers/admin-server/modules/platform-management/validators/system-validators
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/async-handler
 */

const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system-controller');
const { systemValidators } = require('../validators');
const authenticate = require('../../../../../shared/lib/auth/middleware/authenticate');
const authorize = require('../../../../../shared/lib/auth/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/auth/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const requestSanitizer = require('../../../../../shared/lib/middleware/security/request-sanitizer');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const logger = require('../../../../../shared/lib/utils/logger');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');

/**
 * Rate limiting configurations for different endpoint types
 */
const RATE_LIMITS = {
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
  },
  monitoring: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Monitoring rate limit exceeded. Please reduce polling frequency.'
  },
  alerts: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    message: 'Alert submission rate limit exceeded.'
  },
  metrics: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120,
    message: 'Metrics collection rate limit exceeded.'
  },
  health: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: 'Health check rate limit exceeded.'
  }
};

/**
 * Middleware to log system operations
 */
const systemOperationLogger = (operation) => {
  return (req, res, next) => {
    logger.info(`System operation initiated: ${operation}`, {
      operation,
      systemId: req.params.systemId,
      userId: req.user?.id,
      ip: req.ip,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    });
    next();
  };
};

/**
 * Middleware to validate system access permissions
 */
const validateSystemAccess = asyncHandler(async (req, res, next) => {
  const { systemId } = req.params;
  const userId = req.user?.id;
  
  // Additional system-specific access validation
  if (systemId && userId) {
    logger.debug('Validating system access', { systemId, userId });
    // Add custom validation logic here if needed
  }
  
  next();
});

/**
 * Apply global middleware to all routes
 */
router.use(authenticate);
router.use(requestSanitizer());
router.use(auditLogger({
  service: 'system-management',
  includeBody: true,
  includeQuery: true,
  sensitiveFields: ['password', 'token', 'apiKey', 'secret']
}));

/**
 * System Initialization and Setup Routes
 */

// Initialize system monitoring
router.post(
  '/initialize',
  authorize(['admin', 'system-admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.initializeSystem),
  systemOperationLogger('system-initialize'),
  asyncHandler(systemController.initializeSystem)
);

// Provision new system instance
router.post(
  '/provision',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.provisionSystem),
  systemOperationLogger('system-provision'),
  asyncHandler(systemController.provisionSystem)
);

// Bootstrap system components
router.post(
  '/:systemId/bootstrap',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.bootstrapSystem),
  systemOperationLogger('system-bootstrap'),
  asyncHandler(systemController.bootstrapSystem)
);

// Reset system to default state
router.post(
  '/:systemId/reset',
  authorize(['admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.resetSystem),
  systemOperationLogger('system-reset'),
  asyncHandler(systemController.resetSystem)
);

/**
 * System Health and Monitoring Routes
 */

// Get comprehensive system health
router.get(
  '/:systemId/health',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.health),
  requestValidator(systemValidators.getSystemHealth),
  asyncHandler(systemController.getSystemHealth)
);

// Get detailed health report
router.get(
  '/:systemId/health/detailed',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.health),
  requestValidator(systemValidators.getDetailedHealthReport),
  asyncHandler(systemController.getDetailedHealthReport)
);

// Perform health check
router.post(
  '/:systemId/health-check',
  authorize(['admin', 'platform-manager', 'system-admin', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.health),
  requestValidator(systemValidators.performHealthCheck),
  systemOperationLogger('health-check'),
  asyncHandler(systemController.performHealthCheck)
);

// Get health history
router.get(
  '/:systemId/health/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getHealthHistory),
  asyncHandler(systemController.getHealthHistory)
);

// Get health trends
router.get(
  '/:systemId/health/trends',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getHealthTrends),
  asyncHandler(systemController.getHealthTrends)
);

// Subscribe to health notifications
router.post(
  '/:systemId/health/subscribe',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.subscribeToHealthNotifications),
  systemOperationLogger('health-subscribe'),
  asyncHandler(systemController.subscribeToHealthNotifications)
);

/**
 * System Metrics and Performance Routes
 */

// Update system metrics
router.post(
  '/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'system-admin', 'agent', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.metrics),
  requestValidator(systemValidators.updateSystemMetrics),
  asyncHandler(systemController.updateSystemMetrics)
);

// Batch update metrics
router.post(
  '/:systemId/metrics/batch',
  authorize(['admin', 'platform-manager', 'agent', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.metrics),
  requestValidator(systemValidators.batchUpdateMetrics),
  asyncHandler(systemController.batchUpdateMetrics)
);

// Get current metrics
router.get(
  '/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getCurrentMetrics),
  asyncHandler(systemController.getCurrentMetrics)
);

// Get metrics history
router.get(
  '/:systemId/metrics/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getMetricsHistory),
  asyncHandler(systemController.getMetricsHistory)
);

// Get real-time metrics stream
router.get(
  '/:systemId/metrics/stream',
  authorize(['admin', 'platform-manager', 'system-admin', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getMetricsStream),
  asyncHandler(systemController.getMetricsStream)
);

// Get performance statistics
router.get(
  '/:systemId/performance',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getPerformanceStats),
  asyncHandler(systemController.getPerformanceStats)
);

// Get performance analysis
router.get(
  '/:systemId/performance/analysis',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getPerformanceAnalysis),
  asyncHandler(systemController.getPerformanceAnalysis)
);

// Get performance recommendations
router.get(
  '/:systemId/performance/recommendations',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getPerformanceRecommendations),
  asyncHandler(systemController.getPerformanceRecommendations)
);

// Export metrics
router.get(
  '/:systemId/metrics/export',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.exportMetrics),
  asyncHandler(systemController.exportMetrics)
);

// Archive metrics
router.post(
  '/:systemId/metrics/archive',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.archiveMetrics),
  systemOperationLogger('metrics-archive'),
  asyncHandler(systemController.archiveMetrics)
);

// Delete old metrics
router.delete(
  '/:systemId/metrics/cleanup',
  authorize(['admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.cleanupMetrics),
  systemOperationLogger('metrics-cleanup'),
  asyncHandler(systemController.cleanupMetrics)
);

/**
 * Service Health and Status Routes
 */

// Update service health
router.put(
  '/:systemId/services/:serviceName/health',
  authorize(['admin', 'platform-manager', 'system-admin', 'agent', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.updateServiceHealth),
  asyncHandler(systemController.updateServiceHealth)
);

// Get all services status
router.get(
  '/:systemId/services',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getServicesStatus),
  asyncHandler(systemController.getServicesStatus)
);

// Get specific service status
router.get(
  '/:systemId/services/:serviceName',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getServiceStatus),
  asyncHandler(systemController.getServiceStatus)
);

// Restart service
router.post(
  '/:systemId/services/:serviceName/restart',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.restartService),
  systemOperationLogger('service-restart'),
  asyncHandler(systemController.restartService)
);

// Stop service
router.post(
  '/:systemId/services/:serviceName/stop',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.stopService),
  systemOperationLogger('service-stop'),
  asyncHandler(systemController.stopService)
);

// Start service
router.post(
  '/:systemId/services/:serviceName/start',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.startService),
  systemOperationLogger('service-start'),
  asyncHandler(systemController.startService)
);

// Get service dependencies
router.get(
  '/:systemId/services/:serviceName/dependencies',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getServiceDependencies),
  asyncHandler(systemController.getServiceDependencies)
);

// Get service logs
router.get(
  '/:systemId/services/:serviceName/logs',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getServiceLogs),
  asyncHandler(systemController.getServiceLogs)
);

// Scale service
router.post(
  '/:systemId/services/:serviceName/scale',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.scaleService),
  systemOperationLogger('service-scale'),
  asyncHandler(systemController.scaleService)
);

/**
 * Alert Management Routes
 */

// Create system alert
router.post(
  '/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'system-admin', 'agent', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.alerts),
  requestValidator(systemValidators.createSystemAlert),
  systemOperationLogger('alert-create'),
  asyncHandler(systemController.createSystemAlert)
);

// Get active alerts
router.get(
  '/alerts/active',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getActiveAlerts),
  asyncHandler(systemController.getActiveAlerts)
);

// Get alerts for specific system
router.get(
  '/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getSystemAlerts),
  asyncHandler(systemController.getSystemAlerts)
);

// Get alert details
router.get(
  '/:systemId/alerts/:alertId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getAlertDetails),
  asyncHandler(systemController.getAlertDetails)
);

// Acknowledge alert
router.post(
  '/:systemId/alerts/:alertId/acknowledge',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.alerts),
  requestValidator(systemValidators.acknowledgeAlert),
  systemOperationLogger('alert-acknowledge'),
  asyncHandler(systemController.acknowledgeAlert)
);

// Resolve alert
router.post(
  '/:systemId/alerts/:alertId/resolve',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.alerts),
  requestValidator(systemValidators.resolveAlert),
  systemOperationLogger('alert-resolve'),
  asyncHandler(systemController.resolveAlert)
);

// Escalate alert
router.post(
  '/:systemId/alerts/:alertId/escalate',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.alerts),
  requestValidator(systemValidators.escalateAlert),
  systemOperationLogger('alert-escalate'),
  asyncHandler(systemController.escalateAlert)
);

// Suppress alert
router.post(
  '/:systemId/alerts/:alertId/suppress',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.alerts),
  requestValidator(systemValidators.suppressAlert),
  systemOperationLogger('alert-suppress'),
  asyncHandler(systemController.suppressAlert)
);

// Get alert history
router.get(
  '/:systemId/alerts/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getAlertHistory),
  asyncHandler(systemController.getAlertHistory)
);

// Get alert statistics
router.get(
  '/:systemId/alerts/statistics',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getAlertStatistics),
  asyncHandler(systemController.getAlertStatistics)
);

// Configure alert rules
router.post(
  '/:systemId/alerts/rules',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.configureAlertRules),
  systemOperationLogger('alert-rules-configure'),
  asyncHandler(systemController.configureAlertRules)
);

// Get alert rules
router.get(
  '/:systemId/alerts/rules',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getAlertRules),
  asyncHandler(systemController.getAlertRules)
);

// Update alert rule
router.put(
  '/:systemId/alerts/rules/:ruleId',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.updateAlertRule),
  systemOperationLogger('alert-rule-update'),
  asyncHandler(systemController.updateAlertRule)
);

// Delete alert rule
router.delete(
  '/:systemId/alerts/rules/:ruleId',
  authorize(['admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.deleteAlertRule),
  systemOperationLogger('alert-rule-delete'),
  asyncHandler(systemController.deleteAlertRule)
);

/**
 * System Monitoring Control Routes
 */

// Start monitoring
router.post(
  '/:systemId/monitoring/start',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.startMonitoring),
  systemOperationLogger('monitoring-start'),
  asyncHandler(systemController.startMonitoring)
);

// Stop monitoring
router.post(
  '/:systemId/monitoring/stop',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.stopMonitoring),
  systemOperationLogger('monitoring-stop'),
  asyncHandler(systemController.stopMonitoring)
);

// Pause monitoring
router.post(
  '/:systemId/monitoring/pause',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.pauseMonitoring),
  systemOperationLogger('monitoring-pause'),
  asyncHandler(systemController.pauseMonitoring)
);

// Resume monitoring
router.post(
  '/:systemId/monitoring/resume',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.resumeMonitoring),
  systemOperationLogger('monitoring-resume'),
  asyncHandler(systemController.resumeMonitoring)
);

// Update monitoring configuration
router.put(
  '/:systemId/monitoring/config',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.updateMonitoringConfig),
  systemOperationLogger('monitoring-config-update'),
  asyncHandler(systemController.updateMonitoringConfig)
);

// Get monitoring configuration
router.get(
  '/:systemId/monitoring/config',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getMonitoringConfig),
  asyncHandler(systemController.getMonitoringConfig)
);

// Get monitoring status
router.get(
  '/:systemId/monitoring/status',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getMonitoringStatus),
  asyncHandler(systemController.getMonitoringStatus)
);

// Test monitoring configuration
router.post(
  '/:systemId/monitoring/test',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.testMonitoringConfig),
  systemOperationLogger('monitoring-test'),
  asyncHandler(systemController.testMonitoringConfig)
);

// Set monitoring thresholds
router.put(
  '/:systemId/monitoring/thresholds',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.setMonitoringThresholds),
  systemOperationLogger('monitoring-thresholds-update'),
  asyncHandler(systemController.setMonitoringThresholds)
);

// Get monitoring thresholds
router.get(
  '/:systemId/monitoring/thresholds',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getMonitoringThresholds),
  asyncHandler(systemController.getMonitoringThresholds)
);

/**
 * Dashboard and Reporting Routes
 */

// Get system dashboard
router.get(
  '/:systemId/dashboard',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getSystemDashboard),
  asyncHandler(systemController.getSystemDashboard)
);

// Get custom dashboard
router.get(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getCustomDashboard),
  asyncHandler(systemController.getCustomDashboard)
);

// Create custom dashboard
router.post(
  '/:systemId/dashboard/custom',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.createCustomDashboard),
  systemOperationLogger('dashboard-create'),
  asyncHandler(systemController.createCustomDashboard)
);

// Update custom dashboard
router.put(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.updateCustomDashboard),
  systemOperationLogger('dashboard-update'),
  asyncHandler(systemController.updateCustomDashboard)
);

// Delete custom dashboard
router.delete(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.deleteCustomDashboard),
  systemOperationLogger('dashboard-delete'),
  asyncHandler(systemController.deleteCustomDashboard)
);

// Generate system report
router.post(
  '/:systemId/reports/generate',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.generateSystemReport),
  systemOperationLogger('report-generate'),
  asyncHandler(systemController.generateSystemReport)
);

// Get available reports
router.get(
  '/:systemId/reports',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getAvailableReports),
  asyncHandler(systemController.getAvailableReports)
);

// Get report
router.get(
  '/:systemId/reports/:reportId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getReport),
  asyncHandler(systemController.getReport)
);

// Schedule report
router.post(
  '/:systemId/reports/schedule',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.scheduleReport),
  systemOperationLogger('report-schedule'),
  asyncHandler(systemController.scheduleReport)
);

/**
 * Aggregated System Routes
 */

// Get aggregated metrics across all systems
router.get(
  '/metrics/aggregated',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getAggregatedMetrics),
  asyncHandler(systemController.getAggregatedMetrics)
);

// Get system overview
router.get(
  '/overview',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getSystemOverview),
  asyncHandler(systemController.getSystemOverview)
);

// Get all systems status
router.get(
  '/status',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getAllSystemsStatus),
  asyncHandler(systemController.getAllSystemsStatus)
);

// Get system capacity
router.get(
  '/capacity',
  authorize(['admin', 'platform-manager', 'system-admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getSystemCapacity),
  asyncHandler(systemController.getSystemCapacity)
);

// Get system utilization
router.get(
  '/utilization',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getSystemUtilization),
  asyncHandler(systemController.getSystemUtilization)
);

// Perform system benchmark
router.post(
  '/benchmark',
  authorize(['admin', 'system-admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.performBenchmark),
  systemOperationLogger('system-benchmark'),
  asyncHandler(systemController.performBenchmark)
);

// Get benchmark results
router.get(
  '/benchmark/:benchmarkId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getBenchmarkResults),
  asyncHandler(systemController.getBenchmarkResults)
);

/**
 * System Diagnostics Routes
 */

// Run diagnostics
router.post(
  '/:systemId/diagnostics/run',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.runDiagnostics),
  systemOperationLogger('diagnostics-run'),
  asyncHandler(systemController.runDiagnostics)
);

// Get diagnostics results
router.get(
  '/:systemId/diagnostics/:diagnosticsId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getDiagnosticsResults),
  asyncHandler(systemController.getDiagnosticsResults)
);

// Get recent diagnostics
router.get(
  '/:systemId/diagnostics',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getRecentDiagnostics),
  asyncHandler(systemController.getRecentDiagnostics)
);

// Run connectivity test
router.post(
  '/:systemId/diagnostics/connectivity',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.runConnectivityTest),
  systemOperationLogger('connectivity-test'),
  asyncHandler(systemController.runConnectivityTest)
);

// Run performance test
router.post(
  '/:systemId/diagnostics/performance',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.runPerformanceTest),
  systemOperationLogger('performance-test'),
  asyncHandler(systemController.runPerformanceTest)
);

// Run security scan
router.post(
  '/:systemId/diagnostics/security',
  authorize(['admin', 'security-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.runSecurityScan),
  systemOperationLogger('security-scan'),
  asyncHandler(systemController.runSecurityScan)
);

/**
 * System Logs Routes
 */

// Get system logs
router.get(
  '/:systemId/logs',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getSystemLogs),
  asyncHandler(systemController.getSystemLogs)
);

// Stream system logs
router.get(
  '/:systemId/logs/stream',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.streamSystemLogs),
  asyncHandler(systemController.streamSystemLogs)
);

// Search logs
router.post(
  '/:systemId/logs/search',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.searchLogs),
  asyncHandler(systemController.searchLogs)
);

// Export logs
router.get(
  '/:systemId/logs/export',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.exportLogs),
  systemOperationLogger('logs-export'),
  asyncHandler(systemController.exportLogs)
);

// Archive logs
router.post(
  '/:systemId/logs/archive',
  authorize(['admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.archiveLogs),
  systemOperationLogger('logs-archive'),
  asyncHandler(systemController.archiveLogs)
);

/**
 * System Resource Management Routes
 */

// Get resource usage
router.get(
  '/:systemId/resources',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.monitoring),
  requestValidator(systemValidators.getResourceUsage),
  asyncHandler(systemController.getResourceUsage)
);

// Get resource allocation
router.get(
  '/:systemId/resources/allocation',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getResourceAllocation),
  asyncHandler(systemController.getResourceAllocation)
);

// Update resource limits
router.put(
  '/:systemId/resources/limits',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.updateResourceLimits),
  systemOperationLogger('resource-limits-update'),
  asyncHandler(systemController.updateResourceLimits)
);

// Request resource scaling
router.post(
  '/:systemId/resources/scale',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.requestResourceScaling),
  systemOperationLogger('resource-scale'),
  asyncHandler(systemController.requestResourceScaling)
);

// Get resource recommendations
router.get(
  '/:systemId/resources/recommendations',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.getResourceRecommendations),
  asyncHandler(systemController.getResourceRecommendations)
);

/**
 * System Backup and Recovery Routes
 */

// Create system backup
router.post(
  '/:systemId/backup',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.createSystemBackup),
  systemOperationLogger('backup-create'),
  asyncHandler(systemController.createSystemBackup)
);

// List system backups
router.get(
  '/:systemId/backups',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.listSystemBackups),
  asyncHandler(systemController.listSystemBackups)
);

// Restore from backup
router.post(
  '/:systemId/restore',
  authorize(['admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.restoreFromBackup),
  systemOperationLogger('backup-restore'),
  asyncHandler(systemController.restoreFromBackup)
);

// Delete backup
router.delete(
  '/:systemId/backups/:backupId',
  authorize(['admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.deleteBackup),
  systemOperationLogger('backup-delete'),
  asyncHandler(systemController.deleteBackup)
);

// Verify backup integrity
router.post(
  '/:systemId/backups/:backupId/verify',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(systemValidators.verifyBackupIntegrity),
  systemOperationLogger('backup-verify'),
  asyncHandler(systemController.verifyBackupIntegrity)
);

/**
 * Error handling middleware
 */
router.use((err, req, res, next) => {
  logger.error('System management route error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    systemId: req.params?.systemId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Log to audit trail for critical errors
  if (err.statusCode >= 500 || err.critical) {
    auditLogger.logError({
      service: 'system-management',
      error: err,
      request: {
        path: req.path,
        method: req.method,
        params: req.params,
        query: req.query
      },
      user: req.user
    });
  }

  next(err);
});

// Export router
module.exports = router;