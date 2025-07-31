'use strict';

const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system-controller');
const { authenticate, authorize } = require('../../../../shared/lib/auth/middleware');
const { validateRequest } = require('../../../../shared/lib/middleware/validation/request-validator');
const { systemValidators } = require('../validators/system-validators');

// System Information Routes
router.get('/info',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemInfo
);

router.get('/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemStatus
);

router.get('/version',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemVersion
);

// System Monitoring Routes
router.get('/monitoring/metrics',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemMetrics
);

router.get('/monitoring/performance',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemPerformance
);

router.get('/monitoring/resources',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemResources
);

// System Logs Management
router.get('/logs',
  authenticate,
  authorize(['admin', 'super-admin']),
  validateRequest(systemValidators.getSystemLogs),
  systemController.getSystemLogs
);

router.get('/logs/errors',
  authenticate,
  authorize(['admin', 'super-admin']),
  validateRequest(systemValidators.getErrorLogs),
  systemController.getSystemErrorLogs
);

router.get('/logs/audit',
  authenticate,
  authorize(['admin', 'super-admin']),
  validateRequest(systemValidators.getAuditLogs),
  systemController.getSystemAuditLogs
);

router.post('/logs/export',
  authenticate,
  authorize(['super-admin']),
  validateRequest(systemValidators.exportLogs),
  systemController.exportSystemLogs
);

router.delete('/logs/purge',
  authenticate,
  authorize(['super-admin']),
  validateRequest(systemValidators.purgeLogs),
  systemController.purgeSystemLogs
);

// System Cache Management
router.get('/cache/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getCacheStatus
);

router.post('/cache/clear',
  authenticate,
  authorize(['super-admin']),
  validateRequest(systemValidators.clearCache),
  systemController.clearSystemCache
);

router.post('/cache/warm',
  authenticate,
  authorize(['super-admin']),
  systemController.warmSystemCache
);

// System Database Management
router.get('/database/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getDatabaseStatus
);

router.get('/database/connections',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getDatabaseConnections
);

router.post('/database/optimize',
  authenticate,
  authorize(['super-admin']),
  systemController.optimizeDatabase
);

// System Queue Management
router.get('/queues',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemQueues
);

router.get('/queues/:queueName/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getQueueStatus
);

router.post('/queues/:queueName/purge',
  authenticate,
  authorize(['super-admin']),
  systemController.purgeQueue
);

router.post('/queues/:queueName/retry',
  authenticate,
  authorize(['super-admin']),
  systemController.retryFailedJobs
);

// System Services Management
router.get('/services',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemServices
);

router.get('/services/:serviceName/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getServiceStatus
);

router.post('/services/:serviceName/restart',
  authenticate,
  authorize(['super-admin']),
  systemController.restartService
);

router.post('/services/:serviceName/stop',
  authenticate,
  authorize(['super-admin']),
  systemController.stopService
);

router.post('/services/:serviceName/start',
  authenticate,
  authorize(['super-admin']),
  systemController.startService
);

// System Jobs Management
router.get('/jobs',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemJobs
);

router.get('/jobs/:jobId',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getJobDetails
);

router.post('/jobs',
  authenticate,
  authorize(['super-admin']),
  validateRequest(systemValidators.createJob),
  systemController.createSystemJob
);

router.post('/jobs/:jobId/cancel',
  authenticate,
  authorize(['super-admin']),
  systemController.cancelJob
);

// System Notifications
router.get('/notifications',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getSystemNotifications
);

router.post('/notifications',
  authenticate,
  authorize(['super-admin']),
  validateRequest(systemValidators.createNotification),
  systemController.createSystemNotification
);

// System Diagnostics
router.get('/diagnostics/health-check',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.runHealthCheck
);

router.post('/diagnostics/test',
  authenticate,
  authorize(['super-admin']),
  validateRequest(systemValidators.runDiagnostics),
  systemController.runDiagnostics
);

router.get('/diagnostics/report',
  authenticate,
  authorize(['admin', 'super-admin']),
  systemController.getDiagnosticsReport
);

module.exports = router;