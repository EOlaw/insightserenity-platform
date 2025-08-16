'use strict';

/**
 * @fileoverview Enterprise security logs routes for comprehensive audit and monitoring
 * @module servers/admin-server/modules/security-administration/routes/security-logs-routes
 * @requires express
 * @requires module:servers/admin-server/modules/security-administration/controllers/security-logs-controller
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 * @requires module:shared/lib/middleware/cache-middleware
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const express = require('express');
const router = express.Router();
const SecurityLogsController = require('../controllers/security-logs-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');
const cacheMiddleware = require('../../../../../shared/lib/middleware/cache-middleware');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const logger = require('../../../../../shared/lib/utils/logger');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');

// Initialize controller
const securityLogsController = new SecurityLogsController();

// Initialize controller asynchronously
(async () => {
  try {
    await securityLogsController.initialize();
    logger.info('Security Logs Controller initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Security Logs Controller:', error);
  }
})();

// ==================== Middleware Configuration ====================

/**
 * Apply global middleware to all security logs routes
 */
router.use(securityHeaders());
router.use(auditLogger({ module: 'security-logs-routes' }));
router.use(authenticate());

/**
 * Rate limiting configurations for different operation types
 */
const rateLimitConfigs = {
  ingestion: rateLimit({
    windowMs: 60000, // 1 minute
    max: 1000,
    message: 'Log ingestion rate limit exceeded'
  }),
  search: rateLimit({
    windowMs: 60000,
    max: 100,
    message: 'Log search rate limit exceeded'
  }),
  export: rateLimit({
    windowMs: 300000, // 5 minutes
    max: 10,
    message: 'Log export rate limit exceeded'
  }),
  analytics: rateLimit({
    windowMs: 60000,
    max: 50,
    message: 'Analytics rate limit exceeded'
  })
};

// ==================== Validation Schemas ====================

const validationSchemas = {
  // Log Ingestion Schemas
  logIngestion: {
    body: {
      log: { type: 'object', required: true },
      source: { type: 'string', required: true },
      severity: { type: 'string', enum: ['debug', 'info', 'warning', 'error', 'critical'] },
      timestamp: { type: 'date' },
      metadata: { type: 'object' },
      tags: { type: 'array' }
    }
  },
  
  // Log Search Schemas
  logSearch: {
    body: {
      query: { type: 'string', required: true },
      filters: { type: 'object' },
      from: { type: 'date' },
      to: { type: 'date' },
      size: { type: 'number', min: 1, max: 10000 },
      page: { type: 'number', min: 1 },
      sort: { type: 'object' }
    }
  },
  
  // Threat Detection Schemas
  threatDetection: {
    body: {
      content: { type: 'string', required: true },
      patterns: { type: 'array' },
      threshold: { type: 'number', min: 0, max: 100 },
      timeWindow: { type: 'number', min: 60, max: 86400 },
      correlationRules: { type: 'array' }
    }
  },
  
  // Log Analytics Schemas
  logAnalytics: {
    query: {
      metric: { type: 'string', required: true },
      aggregation: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] },
      groupBy: { type: 'string' },
      interval: { type: 'string' },
      from: { type: 'date' },
      to: { type: 'date' }
    }
  },
  
  // Log Retention Schemas
  logRetention: {
    body: {
      logType: { type: 'string', required: true },
      retentionDays: { type: 'number', min: 1, max: 2555 },
      archiveEnabled: { type: 'boolean' },
      compressionEnabled: { type: 'boolean' },
      encryptionEnabled: { type: 'boolean' }
    }
  },
  
  // Alert Configuration Schemas
  alertConfiguration: {
    body: {
      ruleName: { type: 'string', required: true },
      condition: { type: 'object', required: true },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      channels: { type: 'array', required: true },
      cooldown: { type: 'number', min: 0, max: 3600 }
    }
  }
};

// ==================== Log Ingestion Routes ====================

/**
 * @route POST /api/admin/security/logs/ingest/:operation
 * @description Handle log ingestion operations
 * @access System/Service Account
 */
router.post(
  '/ingest/:operation',
  rateLimitConfigs.ingestion,
  authorize([ROLES.SYSTEM, ROLES.LOG_COLLECTOR]),
  requestValidator(validationSchemas.logIngestion),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/ingest/single
 * @description Ingest single log entry
 * @access System/Service Account
 */
router.post(
  '/ingest/single',
  rateLimitConfigs.ingestion,
  authorize([ROLES.SYSTEM, ROLES.LOG_COLLECTOR]),
  requestValidator(validationSchemas.logIngestion),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/ingest/batch
 * @description Ingest batch of logs
 * @access System/Service Account
 */
router.post(
  '/ingest/batch',
  rateLimitConfigs.ingestion,
  authorize([ROLES.SYSTEM, ROLES.LOG_COLLECTOR]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/ingest/stream
 * @description Stream logs for ingestion
 * @access System/Service Account
 */
router.post(
  '/ingest/stream',
  rateLimitConfigs.ingestion,
  authorize([ROLES.SYSTEM, ROLES.LOG_COLLECTOR]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

// ==================== Log Search and Retrieval Routes ====================

/**
 * @route POST /api/admin/security/logs/search/:operation
 * @description Log search operations
 * @access Security Administrator
 */
router.post(
  '/search/:operation',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.AUDIT_VIEWER]),
  requestValidator(validationSchemas.logSearch),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

/**
 * @route POST /api/admin/security/logs/search
 * @description Search security logs
 * @access Security Administrator
 */
router.post(
  '/search',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.AUDIT_VIEWER]),
  requestValidator(validationSchemas.logSearch),
  cacheMiddleware({ ttl: 300 }),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

/**
 * @route GET /api/admin/security/logs/:logId
 * @description Get specific log entry
 * @access Security Administrator
 */
router.get(
  '/:logId',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.AUDIT_VIEWER]),
  cacheMiddleware({ ttl: 3600 }),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

/**
 * @route GET /api/admin/security/logs
 * @description Get logs with filters
 * @access Security Administrator
 */
router.get(
  '/',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.AUDIT_VIEWER]),
  cacheMiddleware({ ttl: 300 }),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

/**
 * @route POST /api/admin/security/logs/export/:operation
 * @description Export logs
 * @access Security Administrator
 */
router.post(
  '/export/:operation',
  rateLimitConfigs.export,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

// ==================== Threat Detection Routes ====================

/**
 * @route POST /api/admin/security/logs/threats/:operation
 * @description Threat detection operations
 * @access Security Administrator
 */
router.post(
  '/threats/:operation',
  rateLimitConfigs.analytics,
  authorize([ROLES.SECURITY_ADMIN, ROLES.THREAT_ANALYST]),
  requestValidator(validationSchemas.threatDetection),
  asyncErrorHandler(securityLogsController.handleThreatDetection)
);

/**
 * @route POST /api/admin/security/logs/threats/detect
 * @description Detect threats in logs
 * @access Threat Analyst
 */
router.post(
  '/threats/detect',
  rateLimitConfigs.analytics,
  authorize([ROLES.THREAT_ANALYST]),
  requestValidator(validationSchemas.threatDetection),
  asyncErrorHandler(securityLogsController.handleThreatDetection)
);

/**
 * @route POST /api/admin/security/logs/threats/analyze
 * @description Analyze threat patterns
 * @access Threat Analyst
 */
router.post(
  '/threats/analyze',
  rateLimitConfigs.analytics,
  authorize([ROLES.THREAT_ANALYST]),
  asyncErrorHandler(securityLogsController.handleThreatDetection)
);

/**
 * @route GET /api/admin/security/logs/threats/patterns
 * @description Get threat patterns
 * @access Security Administrator
 */
router.get(
  '/threats/patterns',
  rateLimitConfigs.analytics,
  authorize([ROLES.SECURITY_ADMIN, ROLES.THREAT_ANALYST]),
  cacheMiddleware({ ttl: 600 }),
  asyncErrorHandler(securityLogsController.handleThreatDetection)
);

/**
 * @route POST /api/admin/security/logs/threats/correlate
 * @description Correlate security events
 * @access Threat Analyst
 */
router.post(
  '/threats/correlate',
  rateLimitConfigs.analytics,
  authorize([ROLES.THREAT_ANALYST]),
  asyncErrorHandler(securityLogsController.handleThreatDetection)
);

/**
 * @route POST /api/admin/security/logs/threats/incident
 * @description Create incident from threat
 * @access Security Administrator
 */
router.post(
  '/threats/incident',
  rateLimitConfigs.analytics,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleThreatDetection)
);

// ==================== Log Analytics Routes ====================

/**
 * @route GET /api/admin/security/logs/analytics/:operation
 * @description Log analytics operations
 * @access Security Administrator
 */
router.get(
  '/analytics/:operation',
  rateLimitConfigs.analytics,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ANALYST]),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route GET /api/admin/security/logs/analytics/dashboard
 * @description Get analytics dashboard
 * @access Analyst
 */
router.get(
  '/analytics/dashboard',
  rateLimitConfigs.analytics,
  authorize([ROLES.ANALYST]),
  cacheMiddleware({ ttl: 300 }),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route GET /api/admin/security/logs/analytics/metrics
 * @description Get log metrics
 * @access Analyst
 */
router.get(
  '/analytics/metrics',
  rateLimitConfigs.analytics,
  authorize([ROLES.ANALYST]),
  cacheMiddleware({ ttl: 60 }),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route GET /api/admin/security/logs/analytics/trends
 * @description Get log trends
 * @access Analyst
 */
router.get(
  '/analytics/trends',
  rateLimitConfigs.analytics,
  authorize([ROLES.ANALYST]),
  cacheMiddleware({ ttl: 300 }),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route GET /api/admin/security/logs/analytics/statistics
 * @description Get log statistics
 * @access Analyst
 */
router.get(
  '/analytics/statistics',
  rateLimitConfigs.analytics,
  authorize([ROLES.ANALYST]),
  cacheMiddleware({ ttl: 300 }),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route POST /api/admin/security/logs/analytics/custom-query
 * @description Execute custom analytics query
 * @access Security Administrator
 */
router.post(
  '/analytics/custom-query',
  rateLimitConfigs.analytics,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

// ==================== Log Retention Routes ====================

/**
 * @route GET /api/admin/security/logs/retention/policies
 * @description Get retention policies
 * @access Security Administrator
 */
router.get(
  '/retention/policies',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.COMPLIANCE_OFFICER]),
  cacheMiddleware({ ttl: 3600 }),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route POST /api/admin/security/logs/retention/:operation
 * @description Retention management operations
 * @access Security Administrator
 */
router.post(
  '/retention/:operation',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.logRetention),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route PUT /api/admin/security/logs/retention/policy/:policyId
 * @description Update retention policy
 * @access Security Administrator
 */
router.put(
  '/retention/policy/:policyId',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.logRetention),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route POST /api/admin/security/logs/retention/archive
 * @description Archive logs
 * @access Security Administrator
 */
router.post(
  '/retention/archive',
  rateLimitConfigs.export,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route POST /api/admin/security/logs/retention/purge
 * @description Purge old logs
 * @access Platform Administrator
 */
router.post(
  '/retention/purge',
  rateLimitConfigs.export,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route GET /api/admin/security/logs/retention/storage
 * @description Get storage usage
 * @access Security Administrator
 */
router.get(
  '/retention/storage',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  cacheMiddleware({ ttl: 600 }),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

// ==================== Alert Management Routes ====================

/**
 * @route GET /api/admin/security/logs/alerts
 * @description Get active alerts
 * @access Security Administrator
 */
router.get(
  '/alerts',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.SOC_ANALYST]),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

/**
 * @route POST /api/admin/security/logs/alerts/:operation
 * @description Alert management operations
 * @access Security Administrator
 */
router.post(
  '/alerts/:operation',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.alertConfiguration),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

/**
 * @route POST /api/admin/security/logs/alerts/create-rule
 * @description Create alert rule
 * @access Security Administrator
 */
router.post(
  '/alerts/create-rule',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.alertConfiguration),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

/**
 * @route PUT /api/admin/security/logs/alerts/rule/:ruleId
 * @description Update alert rule
 * @access Security Administrator
 */
router.put(
  '/alerts/rule/:ruleId',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.alertConfiguration),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

/**
 * @route DELETE /api/admin/security/logs/alerts/rule/:ruleId
 * @description Delete alert rule
 * @access Security Administrator
 */
router.delete(
  '/alerts/rule/:ruleId',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

/**
 * @route POST /api/admin/security/logs/alerts/:alertId/acknowledge
 * @description Acknowledge alert
 * @access SOC Analyst
 */
router.post(
  '/alerts/:alertId/acknowledge',
  rateLimitConfigs.search,
  authorize([ROLES.SOC_ANALYST]),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

/**
 * @route POST /api/admin/security/logs/alerts/:alertId/resolve
 * @description Resolve alert
 * @access SOC Analyst
 */
router.post(
  '/alerts/:alertId/resolve',
  rateLimitConfigs.search,
  authorize([ROLES.SOC_ANALYST]),
  asyncErrorHandler(securityLogsController.handleAlerts)
);

// ==================== Log Source Management Routes ====================

/**
 * @route GET /api/admin/security/logs/sources
 * @description List log sources
 * @access Security Administrator
 */
router.get(
  '/sources',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.LOG_ADMIN]),
  cacheMiddleware({ ttl: 600 }),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/sources/configure
 * @description Configure log source
 * @access Log Administrator
 */
router.post(
  '/sources/configure',
  rateLimitConfigs.search,
  authorize([ROLES.LOG_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route PUT /api/admin/security/logs/sources/:sourceId
 * @description Update log source
 * @access Log Administrator
 */
router.put(
  '/sources/:sourceId',
  rateLimitConfigs.search,
  authorize([ROLES.LOG_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/sources/:sourceId/enable
 * @description Enable log source
 * @access Log Administrator
 */
router.post(
  '/sources/:sourceId/enable',
  rateLimitConfigs.search,
  authorize([ROLES.LOG_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/sources/:sourceId/disable
 * @description Disable log source
 * @access Log Administrator
 */
router.post(
  '/sources/:sourceId/disable',
  rateLimitConfigs.search,
  authorize([ROLES.LOG_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

// ==================== Real-time Streaming Routes ====================

/**
 * @route GET /api/admin/security/logs/stream
 * @description Stream real-time logs (WebSocket upgrade)
 * @access Security Administrator
 */
router.get(
  '/stream',
  authorize([ROLES.SECURITY_ADMIN, ROLES.SOC_ANALYST]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/stream/subscribe
 * @description Subscribe to log stream
 * @access SOC Analyst
 */
router.post(
  '/stream/subscribe',
  rateLimitConfigs.search,
  authorize([ROLES.SOC_ANALYST]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/stream/unsubscribe
 * @description Unsubscribe from log stream
 * @access SOC Analyst
 */
router.post(
  '/stream/unsubscribe',
  rateLimitConfigs.search,
  authorize([ROLES.SOC_ANALYST]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

// ==================== Compliance and Audit Reports Routes ====================

/**
 * @route GET /api/admin/security/logs/compliance/reports
 * @description Get compliance reports
 * @access Compliance Officer
 */
router.get(
  '/compliance/reports',
  rateLimitConfigs.search,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  cacheMiddleware({ ttl: 1800 }),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route POST /api/admin/security/logs/compliance/generate-report
 * @description Generate compliance report
 * @access Compliance Officer
 */
router.post(
  '/compliance/generate-report',
  rateLimitConfigs.export,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(securityLogsController.handleLogAnalytics)
);

/**
 * @route GET /api/admin/security/logs/audit-trail
 * @description Get audit trail
 * @access Auditor
 */
router.get(
  '/audit-trail',
  rateLimitConfigs.search,
  authorize([ROLES.AUDITOR]),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

/**
 * @route POST /api/admin/security/logs/audit-trail/export
 * @description Export audit trail
 * @access Auditor
 */
router.post(
  '/audit-trail/export',
  rateLimitConfigs.export,
  authorize([ROLES.AUDITOR]),
  asyncErrorHandler(securityLogsController.handleLogSearch)
);

// ==================== Log Integrity Routes ====================

/**
 * @route POST /api/admin/security/logs/integrity/verify
 * @description Verify log integrity
 * @access Security Administrator
 */
router.post(
  '/integrity/verify',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route GET /api/admin/security/logs/integrity/chain
 * @description Get integrity chain
 * @access Security Administrator
 */
router.get(
  '/integrity/chain',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  cacheMiddleware({ ttl: 3600 }),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

/**
 * @route POST /api/admin/security/logs/integrity/sign
 * @description Sign logs for integrity
 * @access Security Administrator
 */
router.post(
  '/integrity/sign',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogRetention)
);

// ==================== SIEM Integration Routes ====================

/**
 * @route GET /api/admin/security/logs/siem/integrations
 * @description List SIEM integrations
 * @access Security Administrator
 */
router.get(
  '/siem/integrations',
  rateLimitConfigs.search,
  authorize([ROLES.SECURITY_ADMIN, ROLES.INTEGRATION_ADMIN]),
  cacheMiddleware({ ttl: 600 }),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route POST /api/admin/security/logs/siem/forward
 * @description Forward logs to SIEM
 * @access Integration Administrator
 */
router.post(
  '/siem/forward',
  rateLimitConfigs.ingestion,
  authorize([ROLES.INTEGRATION_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

/**
 * @route PUT /api/admin/security/logs/siem/integration/:integrationId
 * @description Update SIEM integration
 * @access Integration Administrator
 */
router.put(
  '/siem/integration/:integrationId',
  rateLimitConfigs.search,
  authorize([ROLES.INTEGRATION_ADMIN]),
  asyncErrorHandler(securityLogsController.handleLogIngestion)
);

// ==================== Health Check Route ====================

/**
 * @route GET /api/admin/security/logs/health
 * @description Security logs service health check
 * @access Public (Internal only)
 */
router.get(
  '/health',
  asyncErrorHandler(async (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'security-logs',
      timestamp: new Date().toISOString()
    });
  })
);

// ==================== Error Handling Middleware ====================

/**
 * Handle 404 errors for unmatched routes
 */
router.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Security logs route not found',
    path: req.originalUrl,
    method: req.method
  });
});

/**
 * Global error handler for security logs routes
 */
router.use((error, req, res, next) => {
  logger.error('Security logs route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

module.exports = router;