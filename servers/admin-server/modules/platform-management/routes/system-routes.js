'use strict';

/**
 * @fileoverview System monitoring and health management routes
 * @module servers/admin-server/modules/platform-management/routes/system-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/system-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/async-handler
 */

const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
const {
  createLimiter,
  limitByIP,
  limitByUser,
  limitByEndpoint,
  combinedLimit,
  customLimit,
  costBasedLimit,
  adaptiveLimit
} = require('../../../../../shared/lib/auth/middleware/rate-limit');
const { requestSanitizer } = require('../../../../../shared/lib/middleware/security/request-sanitizer');
const { middleware: auditMiddleware, logEvent: auditLogEvent } = require('../../../../../shared/lib/middleware/logging/audit-logger');
const logger = require('../../../../../shared/lib/utils/logger');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');

/**
 * Rate limiting configurations for different endpoint types using advanced strategies
 */
const RATE_LIMITS = {
  // Default rate limiting for general system operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    headers: true
  },
  
  // High-frequency monitoring endpoints with adaptive limiting
  monitoring: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 60,
    minMax: 20,
    maxMax: 120,
    message: 'Monitoring rate limit exceeded. Please reduce polling frequency.',
    headers: true
  },
  
  // Alert management with burst protection
  alerts: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    message: 'Alert submission rate limit exceeded.',
    headers: true,
    burstProtection: true
  },
  
  // Metrics operations with cost-based limiting
  metrics: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxCost: 1000,
    message: 'Metrics collection rate limit exceeded.',
    headers: true
  },
  
  // Health check endpoints with endpoint-based limiting
  health: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: 'Health check rate limit exceeded.',
    headers: true
  },
  
  // Critical system operations requiring combined limiting
  critical: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10,
    message: 'Critical operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user']
  },
  
  // Data export operations with cost-based limiting
  export: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 5000,
    message: 'Export operation cost limit exceeded.',
    headers: true
  },
  
  // Service management operations
  service: {
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 20,
    message: 'Service operation rate limit exceeded.',
    headers: true
  }
};

/**
 * Cost calculator for metrics operations
 */
const calculateMetricsCost = (req) => {
  let cost = 10; // Base cost
  
  // Increase cost based on query parameters
  if (req.query.detailed) cost += 20;
  if (req.query.historical) cost += 30;
  if (req.query.aggregated) cost += 40;
  if (req.query.export) cost += 50;
  
  // Batch operations are more expensive
  if (req.path.includes('batch')) cost *= 2;
  
  return cost;
};

/**
 * Cost calculator for export operations
 */
const calculateExportCost = (req) => {
  let cost = 100; // Base export cost
  
  // Increase cost based on data type
  if (req.path.includes('logs')) cost += 200;
  if (req.path.includes('metrics')) cost += 150;
  if (req.path.includes('reports')) cost += 300;
  
  // Increase cost based on time range
  if (req.query.days && parseInt(req.query.days) > 7) {
    cost += parseInt(req.query.days) * 10;
  }
  
  return cost;
};

/**
 * Middleware to log system operations with audit trail
 */
const systemOperationLogger = (operation) => {
  return asyncHandler(async (req, res, next) => {
    logger.info(`System operation initiated: ${operation}`, {
      operation,
      systemId: req.params.systemId,
      userId: req.user?.id,
      ip: req.ip,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    // Enhanced audit logging for critical operations
    const criticalOperations = [
      'system-initialize', 'system-provision', 'system-reset', 'system-bootstrap',
      'service-restart', 'service-stop', 'service-start', 'service-scale',
      'backup-create', 'backup-restore', 'backup-delete',
      'alert-rules-configure', 'monitoring-config-update'
    ];

    if (criticalOperations.includes(operation)) {
      await auditLogEvent({
        event: `system.${operation.replace('-', '_')}`,
        timestamp: new Date().toISOString(),
        actor: req.user || { type: 'system', id: 'unknown' },
        resource: {
          type: 'system',
          id: req.params.systemId || 'global',
          name: `System ${req.params.systemId || 'Global'}`
        },
        action: operation,
        result: 'initiated',
        metadata: {
          operation,
          systemId: req.params.systemId,
          serviceName: req.params.serviceName,
          requestPath: req.path,
          requestMethod: req.method,
          userAgent: req.get('user-agent')
        }
      }, req);
    }

    next();
  });
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
    
    // Audit system access validation
    await auditLogEvent({
      event: 'authz.system_access_check',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'system',
        id: systemId,
        name: `System ${systemId}`
      },
      action: 'access_validation',
      result: 'success',
      metadata: {
        systemId,
        userId,
        requestPath: req.path
      }
    }, req);
  }
  
  next();
});

/**
 * Middleware to handle audit logging for operation completion
 */
const auditOperationComplete = (operation) => {
  return asyncHandler(async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(body) {
      // Determine operation result based on response
      const result = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
      
      // Log operation completion
      auditLogEvent({
        event: `system.${operation.replace('-', '_')}_complete`,
        timestamp: new Date().toISOString(),
        actor: req.user || { type: 'system', id: 'unknown' },
        resource: {
          type: 'system',
          id: req.params.systemId || 'global',
          name: `System ${req.params.systemId || 'Global'}`
        },
        action: `${operation}_complete`,
        result: result,
        metadata: {
          operation,
          statusCode: res.statusCode,
          systemId: req.params.systemId,
          serviceName: req.params.serviceName,
          responseSize: body ? body.length : 0
        }
      }, req).catch(error => {
        logger.error('Failed to log operation completion audit', {
          error: error.message,
          operation
        });
      });
      
      return originalSend.call(this, body);
    };
    
    next();
  });
};

/**
 * Custom rate limiter for sensitive system operations
 */
const sensitiveOperationLimit = customLimit('sensitive_operations', (req) => {
  // Apply stricter limits for sensitive operations
  const sensitiveEndpoints = [
    '/reset', '/provision', '/backup', '/restore', 
    '/rules', '/config', '/scale', '/stop', '/start'
  ];
  
  const isSensitive = sensitiveEndpoints.some(endpoint => req.path.includes(endpoint));
  
  if (isSensitive) {
    return {
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: 5,
      message: 'Sensitive operation rate limit exceeded',
      headers: true
    };
  }
  
  return null; // Skip if not sensitive
}, {});

/**
 * Apply global middleware to all routes
 */
router.use(authenticate);
router.use(requestSanitizer());
router.use(auditMiddleware({
  service: 'system-management',
  includeBody: true,
  includeQuery: true,
  sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'credential'],
  skip: (req) => {
    // Skip audit logging for high-frequency health check endpoints
    return req.path.includes('/health') && req.method === 'GET' && 
           !req.path.includes('/detailed') && !req.path.includes('/history');
  }
}));

/**
 * System Initialization and Setup Routes
 */

// Initialize system monitoring
router.post(
  '/initialize',
  authorize(['admin', 'system-admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('system-initialize'),
  auditOperationComplete('system-initialize'),
  asyncHandler(systemController.initializeSystem)
);

// Provision new system instance
router.post(
  '/provision',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveOperationLimit,
  systemOperationLogger('system-provision'),
  auditOperationComplete('system-provision'),
  asyncHandler(systemController.provisionSystem)
);

// Bootstrap system components
router.post(
  '/:systemId/bootstrap',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('system-bootstrap'),
  auditOperationComplete('system-bootstrap'),
  asyncHandler(systemController.bootstrapSystem)
);

// Reset system to default state
router.post(
  '/:systemId/reset',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveOperationLimit,
  systemOperationLogger('system-reset'),
  auditOperationComplete('system-reset'),
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
  limitByEndpoint(RATE_LIMITS.health),
  asyncHandler(systemController.getSystemHealth)
);

// Get detailed health report
router.get(
  '/:systemId/health/detailed',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getDetailedHealthReport)
);

// Perform health check
router.post(
  '/:systemId/health-check',
  authorize(['admin', 'platform-manager', 'system-admin', 'monitor']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.health),
  systemOperationLogger('health-check'),
  asyncHandler(systemController.performHealthCheck)
);

// Get health history
router.get(
  '/:systemId/health/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getHealthHistory)
);

// Get health trends
router.get(
  '/:systemId/health/trends',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getHealthTrends)
);

// Subscribe to health notifications
router.post(
  '/:systemId/health/subscribe',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
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
  costBasedLimit(calculateMetricsCost, RATE_LIMITS.metrics),
  asyncHandler(systemController.updateSystemMetrics)
);

// Batch update metrics
router.post(
  '/:systemId/metrics/batch',
  authorize(['admin', 'platform-manager', 'agent', 'monitor']),
  validateSystemAccess,
  costBasedLimit(calculateMetricsCost, RATE_LIMITS.metrics),
  asyncHandler(systemController.batchUpdateMetrics)
);

// Get current metrics
router.get(
  '/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getCurrentMetrics)
);

// Get metrics history
router.get(
  '/:systemId/metrics/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getMetricsHistory)
);

// Get real-time metrics stream
router.get(
  '/:systemId/metrics/stream',
  authorize(['admin', 'platform-manager', 'system-admin', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getMetricsStream)
);

// Get performance statistics
router.get(
  '/:systemId/performance',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getPerformanceStats)
);

// Get performance analysis
router.get(
  '/:systemId/performance/analysis',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateMetricsCost, RATE_LIMITS.metrics),
  asyncHandler(systemController.getPerformanceAnalysis)
);

// Get performance recommendations
router.get(
  '/:systemId/performance/recommendations',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getPerformanceRecommendations)
);

// Export metrics
router.get(
  '/:systemId/metrics/export',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  asyncHandler(async (req, res, next) => {
    // Audit metrics export
    await auditLogEvent({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'metrics',
        id: req.params.systemId,
        name: `System ${req.params.systemId} Metrics`
      },
      action: 'export',
      result: 'initiated',
      metadata: {
        systemId: req.params.systemId,
        exportType: 'metrics',
        query: req.query
      }
    }, req);
    
    return systemController.exportMetrics(req, res, next);
  })
);

// Archive metrics
router.post(
  '/:systemId/metrics/archive',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('metrics-archive'),
  auditOperationComplete('metrics-archive'),
  asyncHandler(systemController.archiveMetrics)
);

// Delete old metrics
router.delete(
  '/:systemId/metrics/cleanup',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('metrics-cleanup'),
  auditOperationComplete('metrics-cleanup'),
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
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.updateServiceHealth)
);

// Get all services status
router.get(
  '/:systemId/services',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getServicesStatus)
);

// Get specific service status
router.get(
  '/:systemId/services/:serviceName',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  limitByEndpoint(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getServiceStatus)
);

// Restart service
router.post(
  '/:systemId/services/:serviceName/restart',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveOperationLimit,
  systemOperationLogger('service-restart'),
  auditOperationComplete('service-restart'),
  asyncHandler(systemController.restartService)
);

// Stop service
router.post(
  '/:systemId/services/:serviceName/stop',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveOperationLimit,
  systemOperationLogger('service-stop'),
  auditOperationComplete('service-stop'),
  asyncHandler(systemController.stopService)
);

// Start service
router.post(
  '/:systemId/services/:serviceName/start',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveOperationLimit,
  systemOperationLogger('service-start'),
  auditOperationComplete('service-start'),
  asyncHandler(systemController.startService)
);

// Get service dependencies
router.get(
  '/:systemId/services/:serviceName/dependencies',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getServiceDependencies)
);

// Get service logs
router.get(
  '/:systemId/services/:serviceName/logs',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getServiceLogs)
);

// Scale service
router.post(
  '/:systemId/services/:serviceName/scale',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveOperationLimit,
  systemOperationLogger('service-scale'),
  auditOperationComplete('service-scale'),
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
  limitByUser(RATE_LIMITS.alerts),
  systemOperationLogger('alert-create'),
  asyncHandler(systemController.createSystemAlert)
);

// Get active alerts
router.get(
  '/alerts/active',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getActiveAlerts)
);

// Get alerts for specific system
router.get(
  '/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getSystemAlerts)
);

// Get alert details
router.get(
  '/:systemId/alerts/:alertId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getAlertDetails)
);

// Acknowledge alert
router.post(
  '/:systemId/alerts/:alertId/acknowledge',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.alerts),
  systemOperationLogger('alert-acknowledge'),
  asyncHandler(systemController.acknowledgeAlert)
);

// Resolve alert
router.post(
  '/:systemId/alerts/:alertId/resolve',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.alerts),
  systemOperationLogger('alert-resolve'),
  asyncHandler(systemController.resolveAlert)
);

// Escalate alert
router.post(
  '/:systemId/alerts/:alertId/escalate',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.alerts),
  systemOperationLogger('alert-escalate'),
  asyncHandler(systemController.escalateAlert)
);

// Suppress alert
router.post(
  '/:systemId/alerts/:alertId/suppress',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.alerts),
  systemOperationLogger('alert-suppress'),
  asyncHandler(systemController.suppressAlert)
);

// Get alert history
router.get(
  '/:systemId/alerts/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getAlertHistory)
);

// Get alert statistics
router.get(
  '/:systemId/alerts/statistics',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getAlertStatistics)
);

// Configure alert rules
router.post(
  '/:systemId/alerts/rules',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveOperationLimit,
  systemOperationLogger('alert-rules-configure'),
  auditOperationComplete('alert-rules-configure'),
  asyncHandler(systemController.configureAlertRules)
);

// Get alert rules
router.get(
  '/:systemId/alerts/rules',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getAlertRules)
);

// Update alert rule
router.put(
  '/:systemId/alerts/rules/:ruleId',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('alert-rule-update'),
  auditOperationComplete('alert-rule-update'),
  asyncHandler(systemController.updateAlertRule)
);

// Delete alert rule
router.delete(
  '/:systemId/alerts/rules/:ruleId',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('alert-rule-delete'),
  auditOperationComplete('alert-rule-delete'),
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
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('monitoring-start'),
  auditOperationComplete('monitoring-start'),
  asyncHandler(systemController.startMonitoring)
);

// Stop monitoring
router.post(
  '/:systemId/monitoring/stop',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  systemOperationLogger('monitoring-stop'),
  auditOperationComplete('monitoring-stop'),
  asyncHandler(systemController.stopMonitoring)
);

// Pause monitoring
router.post(
  '/:systemId/monitoring/pause',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('monitoring-pause'),
  auditOperationComplete('monitoring-pause'),
  asyncHandler(systemController.pauseMonitoring)
);

// Resume monitoring
router.post(
  '/:systemId/monitoring/resume',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('monitoring-resume'),
  auditOperationComplete('monitoring-resume'),
  asyncHandler(systemController.resumeMonitoring)
);

// Update monitoring configuration
router.put(
  '/:systemId/monitoring/config',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveOperationLimit,
  systemOperationLogger('monitoring-config-update'),
  auditOperationComplete('monitoring-config-update'),
  asyncHandler(systemController.updateMonitoringConfig)
);

// Get monitoring configuration
router.get(
  '/:systemId/monitoring/config',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getMonitoringConfig)
);

// Get monitoring status
router.get(
  '/:systemId/monitoring/status',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getMonitoringStatus)
);

// Test monitoring configuration
router.post(
  '/:systemId/monitoring/test',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('monitoring-test'),
  asyncHandler(systemController.testMonitoringConfig)
);

// Set monitoring thresholds
router.put(
  '/:systemId/monitoring/thresholds',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('monitoring-thresholds-update'),
  auditOperationComplete('monitoring-thresholds-update'),
  asyncHandler(systemController.setMonitoringThresholds)
);

// Get monitoring thresholds
router.get(
  '/:systemId/monitoring/thresholds',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
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
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getSystemDashboard)
);

// Get custom dashboard
router.get(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getCustomDashboard)
);

// Create custom dashboard
router.post(
  '/:systemId/dashboard/custom',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('dashboard-create'),
  auditOperationComplete('dashboard-create'),
  asyncHandler(systemController.createCustomDashboard)
);

// Update custom dashboard
router.put(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('dashboard-update'),
  auditOperationComplete('dashboard-update'),
  asyncHandler(systemController.updateCustomDashboard)
);

// Delete custom dashboard
router.delete(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('dashboard-delete'),
  auditOperationComplete('dashboard-delete'),
  asyncHandler(systemController.deleteCustomDashboard)
);

// Generate system report
router.post(
  '/:systemId/reports/generate',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  systemOperationLogger('report-generate'),
  asyncHandler(async (req, res, next) => {
    // Audit report generation
    await auditLogEvent({
      event: 'compliance.audit_report_generated',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'report',
        id: req.params.systemId,
        name: `System ${req.params.systemId} Report`
      },
      action: 'generate',
      result: 'initiated',
      metadata: {
        systemId: req.params.systemId,
        reportType: req.body?.reportType || 'system',
        reportPeriod: req.body?.period
      }
    }, req);
    
    return systemController.generateSystemReport(req, res, next);
  })
);

// Get available reports
router.get(
  '/:systemId/reports',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getAvailableReports)
);

// Get report
router.get(
  '/:systemId/reports/:reportId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getReport)
);

// Schedule report
router.post(
  '/:systemId/reports/schedule',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('report-schedule'),
  auditOperationComplete('report-schedule'),
  asyncHandler(systemController.scheduleReport)
);

/**
 * Aggregated System Routes
 */

// Get aggregated metrics across all systems
router.get(
  '/metrics/aggregated',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMetricsCost, RATE_LIMITS.metrics),
  asyncHandler(systemController.getAggregatedMetrics)
);

// Get system overview
router.get(
  '/overview',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getSystemOverview)
);

// Get all systems status
router.get(
  '/status',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getAllSystemsStatus)
);

// Get system capacity
router.get(
  '/capacity',
  authorize(['admin', 'platform-manager', 'system-admin']),
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getSystemCapacity)
);

// Get system utilization
router.get(
  '/utilization',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getSystemUtilization)
);

// Perform system benchmark
router.post(
  '/benchmark',
  authorize(['admin', 'system-admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('system-benchmark'),
  auditOperationComplete('system-benchmark'),
  asyncHandler(systemController.performBenchmark)
);

// Get benchmark results
router.get(
  '/benchmark/:benchmarkId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  limitByUser(RATE_LIMITS.default),
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
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  systemOperationLogger('diagnostics-run'),
  auditOperationComplete('diagnostics-run'),
  asyncHandler(systemController.runDiagnostics)
);

// Get diagnostics results
router.get(
  '/:systemId/diagnostics/:diagnosticsId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getDiagnosticsResults)
);

// Get recent diagnostics
router.get(
  '/:systemId/diagnostics',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getRecentDiagnostics)
);

// Run connectivity test
router.post(
  '/:systemId/diagnostics/connectivity',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('connectivity-test'),
  auditOperationComplete('connectivity-test'),
  asyncHandler(systemController.runConnectivityTest)
);

// Run performance test
router.post(
  '/:systemId/diagnostics/performance',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('performance-test'),
  auditOperationComplete('performance-test'),
  asyncHandler(systemController.runPerformanceTest)
);

// Run security scan
router.post(
  '/:systemId/diagnostics/security',
  authorize(['admin', 'security-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('security-scan'),
  auditOperationComplete('security-scan'),
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
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getSystemLogs)
);

// Stream system logs
router.get(
  '/:systemId/logs/stream',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.streamSystemLogs)
);

// Search logs
router.post(
  '/:systemId/logs/search',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateMetricsCost, RATE_LIMITS.metrics),
  asyncHandler(systemController.searchLogs)
);

// Export logs
router.get(
  '/:systemId/logs/export',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  systemOperationLogger('logs-export'),
  asyncHandler(async (req, res, next) => {
    // Audit log export
    await auditLogEvent({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'logs',
        id: req.params.systemId,
        name: `System ${req.params.systemId} Logs`
      },
      action: 'export',
      result: 'initiated',
      metadata: {
        systemId: req.params.systemId,
        exportType: 'logs',
        query: req.query
      }
    }, req);
    
    return systemController.exportLogs(req, res, next);
  })
);

// Archive logs
router.post(
  '/:systemId/logs/archive',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('logs-archive'),
  auditOperationComplete('logs-archive'),
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
  adaptiveLimit(RATE_LIMITS.monitoring),
  asyncHandler(systemController.getResourceUsage)
);

// Get resource allocation
router.get(
  '/:systemId/resources/allocation',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.getResourceAllocation)
);

// Update resource limits
router.put(
  '/:systemId/resources/limits',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('resource-limits-update'),
  auditOperationComplete('resource-limits-update'),
  asyncHandler(systemController.updateResourceLimits)
);

// Request resource scaling
router.post(
  '/:systemId/resources/scale',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  systemOperationLogger('resource-scale'),
  auditOperationComplete('resource-scale'),
  asyncHandler(systemController.requestResourceScaling)
);

// Get resource recommendations
router.get(
  '/:systemId/resources/recommendations',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
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
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveOperationLimit,
  systemOperationLogger('backup-create'),
  auditOperationComplete('backup-create'),
  asyncHandler(systemController.createSystemBackup)
);

// List system backups
router.get(
  '/:systemId/backups',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(systemController.listSystemBackups)
);

// Restore from backup
router.post(
  '/:systemId/restore',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveOperationLimit,
  systemOperationLogger('backup-restore'),
  auditOperationComplete('backup-restore'),
  asyncHandler(systemController.restoreFromBackup)
);

// Delete backup
router.delete(
  '/:systemId/backups/:backupId',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('backup-delete'),
  auditOperationComplete('backup-delete'),
  asyncHandler(systemController.deleteBackup)
);

// Verify backup integrity
router.post(
  '/:systemId/backups/:backupId/verify',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('backup-verify'),
  auditOperationComplete('backup-verify'),
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

  // Audit error events
  if (err.statusCode >= 500 || err.critical) {
    auditLogEvent({
      event: 'system.error',
      timestamp: new Date().toISOString(),
      actor: req.user || { type: 'system', id: 'unknown' },
      resource: {
        type: 'route',
        id: req.path,
        name: `${req.method} ${req.path}`
      },
      action: 'error',
      result: 'failure',
      metadata: {
        error: err.message,
        statusCode: err.statusCode,
        systemId: req.params?.systemId,
        critical: err.critical || false
      }
    }, req).catch(auditError => {
      logger.error('Failed to audit system error', {
        auditError: auditError.message
      });
    });
  }

  next(err);
});

// Export router
module.exports = router;