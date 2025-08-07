'use strict';

/**
 * @fileoverview Maintenance window and operations management routes
 * @module servers/admin-server/modules/platform-management/routes/maintenance-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/maintenance-controller
 * @requires module:servers/admin-server/modules/platform-management/validators/maintenance-validators
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance-controller');
const { maintenanceValidators } = require('../validators');
const authenticate = require('../../../../../shared/lib/auth/middleware/authenticate');
const authorize = require('../../../../../shared/lib/auth/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/auth/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const requestSanitizer = require('../../../../../shared/lib/middleware/security/request-sanitizer');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const logger = require('../../../../../shared/lib/utils/logger');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * Rate limiting configurations for different endpoint types
 */
const RATE_LIMITS = {
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many maintenance requests from this IP, please try again later.'
  },
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Maintenance read rate limit exceeded.'
  },
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: 'Maintenance write rate limit exceeded.'
  },
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Critical maintenance operation rate limit exceeded.'
  },
  status: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120,
    message: 'Status check rate limit exceeded.'
  },
  notification: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    message: 'Notification rate limit exceeded.'
  }
};

/**
 * Maintenance operation logger middleware
 */
const maintenanceOperationLogger = (operation) => {
  return (req, res, next) => {
    logger.info(`Maintenance operation initiated: ${operation}`, {
      operation,
      maintenanceId: req.params.maintenanceId,
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
 * Middleware to validate maintenance window access
 */
const validateMaintenanceAccess = asyncHandler(async (req, res, next) => {
  const { maintenanceId } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  
  // Additional validation for critical maintenance operations
  if (maintenanceId && req.path.includes('/execute') && !['admin', 'platform-manager'].includes(userRole)) {
    logger.warn('Unauthorized maintenance execution attempt', {
      maintenanceId,
      userId,
      userRole
    });
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions for maintenance execution'
    });
  }
  
  logger.debug('Maintenance access validated', { maintenanceId, userId });
  next();
});

/**
 * Middleware to check maintenance window conflicts
 */
const checkMaintenanceConflicts = asyncHandler(async (req, res, next) => {
  if (req.body.startTime && req.body.endTime) {
    req.maintenanceConflictCheck = {
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      checkPerformed: true
    };
  }
  next();
});

/**
 * Middleware to validate maintenance window timing
 */
const validateMaintenanceTiming = (req, res, next) => {
  const { startTime, endTime } = req.body;
  
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();
    
    if (start < now) {
      return res.status(400).json({
        success: false,
        message: 'Maintenance start time cannot be in the past'
      });
    }
    
    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: 'Maintenance end time must be after start time'
      });
    }
    
    const duration = end - start;
    const maxDuration = 24 * 60 * 60 * 1000; // 24 hours
    
    if (duration > maxDuration) {
      return res.status(400).json({
        success: false,
        message: 'Maintenance window cannot exceed 24 hours'
      });
    }
  }
  
  next();
};

/**
 * Apply global middleware to all routes
 */
router.use(authenticate);
router.use(requestSanitizer());
router.use(auditLogger({
  service: 'maintenance-management',
  includeBody: true,
  includeQuery: true,
  sensitiveFields: ['password', 'token', 'apiKey']
}));

/**
 * Maintenance Window Scheduling Routes
 */

// Schedule new maintenance window
router.post(
  '/schedule',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  requestValidator(maintenanceValidators.scheduleMaintenanceWindow),
  maintenanceOperationLogger('maintenance-schedule'),
  asyncHandler(maintenanceController.scheduleMaintenanceWindow)
);

// Schedule recurring maintenance
router.post(
  '/schedule/recurring',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.scheduleRecurringMaintenance),
  maintenanceOperationLogger('maintenance-schedule-recurring'),
  asyncHandler(maintenanceController.scheduleRecurringMaintenance)
);

// Schedule emergency maintenance
router.post(
  '/schedule/emergency',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.scheduleEmergencyMaintenance),
  maintenanceOperationLogger('maintenance-schedule-emergency'),
  asyncHandler(maintenanceController.scheduleEmergencyMaintenance)
);

// Reschedule maintenance window
router.put(
  '/:maintenanceId/reschedule',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  requestValidator(maintenanceValidators.rescheduleMaintenanceWindow),
  maintenanceOperationLogger('maintenance-reschedule'),
  asyncHandler(maintenanceController.rescheduleMaintenanceWindow)
);

// Batch schedule maintenance windows
router.post(
  '/schedule/batch',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.batchScheduleMaintenance),
  maintenanceOperationLogger('maintenance-batch-schedule'),
  asyncHandler(maintenanceController.batchScheduleMaintenance)
);

/**
 * Maintenance Window Query Routes
 */

// Get active maintenance windows
router.get(
  '/active',
  authorize(['admin', 'platform-manager', 'viewer', 'user']),
  rateLimit(RATE_LIMITS.status),
  requestValidator(maintenanceValidators.getActiveMaintenanceWindows),
  asyncHandler(maintenanceController.getActiveMaintenanceWindows)
);

// Get scheduled maintenance windows
router.get(
  '/scheduled',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getScheduledMaintenanceWindows),
  asyncHandler(maintenanceController.getScheduledMaintenanceWindows)
);

// Get upcoming maintenance windows
router.get(
  '/upcoming',
  authorize(['admin', 'platform-manager', 'viewer', 'user']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getUpcomingMaintenanceWindows),
  asyncHandler(maintenanceController.getUpcomingMaintenanceWindows)
);

// Get maintenance history
router.get(
  '/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceHistory),
  asyncHandler(maintenanceController.getMaintenanceHistory)
);

// Get maintenance calendar
router.get(
  '/calendar',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceCalendar),
  asyncHandler(maintenanceController.getMaintenanceCalendar)
);

// Search maintenance windows
router.get(
  '/search',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.searchMaintenanceWindows),
  asyncHandler(maintenanceController.searchMaintenanceWindows)
);

// Get maintenance by type
router.get(
  '/type/:type',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceByType),
  asyncHandler(maintenanceController.getMaintenanceByType)
);

// Get maintenance by status
router.get(
  '/status/:status',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceByStatus),
  asyncHandler(maintenanceController.getMaintenanceByStatus)
);

// Get maintenance by service
router.get(
  '/service/:serviceName',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceByService),
  asyncHandler(maintenanceController.getMaintenanceByService)
);

// Get maintenance by date range
router.get(
  '/range',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceByDateRange),
  asyncHandler(maintenanceController.getMaintenanceByDateRange)
);

/**
 * Maintenance Window Status Routes
 */

// Check maintenance status (public endpoint with lighter auth)
router.get(
  '/status',
  rateLimit(RATE_LIMITS.status),
  requestValidator(maintenanceValidators.checkMaintenanceStatus),
  asyncHandler(maintenanceController.checkMaintenanceStatus)
);

// Get detailed maintenance status
router.get(
  '/status/detailed',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.status),
  requestValidator(maintenanceValidators.getDetailedMaintenanceStatus),
  asyncHandler(maintenanceController.getDetailedMaintenanceStatus)
);

// Get system maintenance readiness
router.get(
  '/readiness',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceReadiness),
  asyncHandler(maintenanceController.getMaintenanceReadiness)
);

// Check service availability during maintenance
router.get(
  '/availability/:serviceName',
  rateLimit(RATE_LIMITS.status),
  requestValidator(maintenanceValidators.checkServiceAvailability),
  asyncHandler(maintenanceController.checkServiceAvailability)
);

/**
 * Maintenance Window Management Routes
 */

// Get specific maintenance window details
router.get(
  '/:maintenanceId',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceWindow),
  asyncHandler(maintenanceController.getMaintenanceWindow)
);

// Update maintenance window
router.put(
  '/:maintenanceId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  validateMaintenanceTiming,
  requestValidator(maintenanceValidators.updateMaintenanceWindow),
  maintenanceOperationLogger('maintenance-update'),
  asyncHandler(maintenanceController.updateMaintenanceWindow)
);

// Update maintenance window metadata
router.patch(
  '/:maintenanceId/metadata',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateMaintenanceMetadata),
  maintenanceOperationLogger('maintenance-metadata-update'),
  asyncHandler(maintenanceController.updateMaintenanceMetadata)
);

// Delete maintenance window
router.delete(
  '/:maintenanceId',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteMaintenanceWindow),
  maintenanceOperationLogger('maintenance-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceWindow)
);

// Clone maintenance window
router.post(
  '/:maintenanceId/clone',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.cloneMaintenanceWindow),
  maintenanceOperationLogger('maintenance-clone'),
  asyncHandler(maintenanceController.cloneMaintenanceWindow)
);

/**
 * Maintenance Window Execution Routes
 */

// Start maintenance window
router.post(
  '/:maintenanceId/start',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.startMaintenanceWindow),
  maintenanceOperationLogger('maintenance-start'),
  asyncHandler(maintenanceController.startMaintenanceWindow)
);

// Complete maintenance window
router.post(
  '/:maintenanceId/complete',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.completeMaintenanceWindow),
  maintenanceOperationLogger('maintenance-complete'),
  asyncHandler(maintenanceController.completeMaintenanceWindow)
);

// Cancel maintenance window
router.post(
  '/:maintenanceId/cancel',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.cancelMaintenanceWindow),
  maintenanceOperationLogger('maintenance-cancel'),
  asyncHandler(maintenanceController.cancelMaintenanceWindow)
);

// Extend maintenance window
router.post(
  '/:maintenanceId/extend',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.extendMaintenanceWindow),
  maintenanceOperationLogger('maintenance-extend'),
  asyncHandler(maintenanceController.extendMaintenanceWindow)
);

// Pause maintenance window
router.post(
  '/:maintenanceId/pause',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.pauseMaintenanceWindow),
  maintenanceOperationLogger('maintenance-pause'),
  asyncHandler(maintenanceController.pauseMaintenanceWindow)
);

// Resume maintenance window
router.post(
  '/:maintenanceId/resume',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.resumeMaintenanceWindow),
  maintenanceOperationLogger('maintenance-resume'),
  asyncHandler(maintenanceController.resumeMaintenanceWindow)
);

// Force complete maintenance window
router.post(
  '/:maintenanceId/force-complete',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.forceCompleteMaintenanceWindow),
  maintenanceOperationLogger('maintenance-force-complete'),
  asyncHandler(maintenanceController.forceCompleteMaintenanceWindow)
);

// Rollback maintenance window
router.post(
  '/:maintenanceId/rollback',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.rollbackMaintenanceWindow),
  maintenanceOperationLogger('maintenance-rollback'),
  asyncHandler(maintenanceController.rollbackMaintenanceWindow)
);

/**
 * Maintenance Tasks and Activities Routes
 */

// Add maintenance task
router.post(
  '/:maintenanceId/tasks',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.addMaintenanceTask),
  maintenanceOperationLogger('task-add'),
  asyncHandler(maintenanceController.addMaintenanceTask)
);

// Get maintenance tasks
router.get(
  '/:maintenanceId/tasks',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceTasks),
  asyncHandler(maintenanceController.getMaintenanceTasks)
);

// Update maintenance task
router.put(
  '/:maintenanceId/tasks/:taskId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateMaintenanceTask),
  maintenanceOperationLogger('task-update'),
  asyncHandler(maintenanceController.updateMaintenanceTask)
);

// Complete maintenance task
router.post(
  '/:maintenanceId/tasks/:taskId/complete',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.completeMaintenanceTask),
  maintenanceOperationLogger('task-complete'),
  asyncHandler(maintenanceController.completeMaintenanceTask)
);

// Delete maintenance task
router.delete(
  '/:maintenanceId/tasks/:taskId',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteMaintenanceTask),
  maintenanceOperationLogger('task-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceTask)
);

// Get maintenance activity log
router.get(
  '/:maintenanceId/activities',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceActivities),
  asyncHandler(maintenanceController.getMaintenanceActivities)
);

// Add maintenance activity
router.post(
  '/:maintenanceId/activities',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.addMaintenanceActivity),
  maintenanceOperationLogger('activity-add'),
  asyncHandler(maintenanceController.addMaintenanceActivity)
);

/**
 * Maintenance Impact Analysis Routes
 */

// Get maintenance impact analysis
router.get(
  '/:maintenanceId/impact',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceImpactAnalysis),
  asyncHandler(maintenanceController.getMaintenanceImpactAnalysis)
);

// Analyze maintenance impact
router.post(
  '/:maintenanceId/impact/analyze',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.analyzeMaintenanceImpact),
  maintenanceOperationLogger('impact-analyze'),
  asyncHandler(maintenanceController.analyzeMaintenanceImpact)
);

// Get affected services
router.get(
  '/:maintenanceId/affected-services',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getAffectedServices),
  asyncHandler(maintenanceController.getAffectedServices)
);

// Get affected users
router.get(
  '/:maintenanceId/affected-users',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getAffectedUsers),
  asyncHandler(maintenanceController.getAffectedUsers)
);

// Get maintenance dependencies
router.get(
  '/:maintenanceId/dependencies',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceDependencies),
  asyncHandler(maintenanceController.getMaintenanceDependencies)
);

// Get maintenance risk assessment
router.get(
  '/:maintenanceId/risk-assessment',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceRiskAssessment),
  asyncHandler(maintenanceController.getMaintenanceRiskAssessment)
);

/**
 * Maintenance Validation Routes
 */

// Validate maintenance window
router.post(
  '/validate',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.validateMaintenanceWindow),
  asyncHandler(maintenanceController.validateMaintenanceWindow)
);

// Check maintenance conflicts
router.post(
  '/conflicts/check',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.checkMaintenanceConflicts),
  asyncHandler(maintenanceController.checkMaintenanceConflicts)
);

// Validate maintenance prerequisites
router.post(
  '/:maintenanceId/prerequisites/validate',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.validatePrerequisites),
  maintenanceOperationLogger('prerequisites-validate'),
  asyncHandler(maintenanceController.validatePrerequisites)
);

// Test maintenance procedures
router.post(
  '/:maintenanceId/test',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.testMaintenanceProcedures),
  maintenanceOperationLogger('maintenance-test'),
  asyncHandler(maintenanceController.testMaintenanceProcedures)
);

// Dry run maintenance
router.post(
  '/:maintenanceId/dry-run',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.dryRunMaintenance),
  maintenanceOperationLogger('maintenance-dry-run'),
  asyncHandler(maintenanceController.dryRunMaintenance)
);

/**
 * Maintenance Notification Routes
 */

// Send maintenance notifications
router.post(
  '/:maintenanceId/notify',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.notification),
  requestValidator(maintenanceValidators.sendMaintenanceNotifications),
  maintenanceOperationLogger('notifications-send'),
  asyncHandler(maintenanceController.sendMaintenanceNotifications)
);

// Schedule maintenance notifications
router.post(
  '/:maintenanceId/notify/schedule',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.notification),
  requestValidator(maintenanceValidators.scheduleNotifications),
  maintenanceOperationLogger('notifications-schedule'),
  asyncHandler(maintenanceController.scheduleNotifications)
);

// Get notification history
router.get(
  '/:maintenanceId/notifications',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getNotificationHistory),
  asyncHandler(maintenanceController.getNotificationHistory)
);

// Cancel scheduled notifications
router.delete(
  '/:maintenanceId/notify/:notificationId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.notification),
  requestValidator(maintenanceValidators.cancelScheduledNotification),
  maintenanceOperationLogger('notification-cancel'),
  asyncHandler(maintenanceController.cancelScheduledNotification)
);

// Get notification templates
router.get(
  '/templates/notifications',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getNotificationTemplates),
  asyncHandler(maintenanceController.getNotificationTemplates)
);

// Create notification template
router.post(
  '/templates/notifications',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.createNotificationTemplate),
  maintenanceOperationLogger('template-create'),
  asyncHandler(maintenanceController.createNotificationTemplate)
);

// Update notification template
router.put(
  '/templates/notifications/:templateId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateNotificationTemplate),
  maintenanceOperationLogger('template-update'),
  asyncHandler(maintenanceController.updateNotificationTemplate)
);

// Delete notification template
router.delete(
  '/templates/notifications/:templateId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteNotificationTemplate),
  maintenanceOperationLogger('template-delete'),
  asyncHandler(maintenanceController.deleteNotificationTemplate)
);

/**
 * Maintenance Reporting Routes
 */

// Get maintenance statistics
router.get(
  '/statistics',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceStatistics),
  asyncHandler(maintenanceController.getMaintenanceStatistics)
);

// Create maintenance report
router.get(
  '/report',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.createMaintenanceReport),
  asyncHandler(maintenanceController.createMaintenanceReport)
);

// Generate maintenance summary
router.get(
  '/:maintenanceId/summary',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.generateMaintenanceSummary),
  asyncHandler(maintenanceController.generateMaintenanceSummary)
);

// Get maintenance metrics
router.get(
  '/:maintenanceId/metrics',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceMetrics),
  asyncHandler(maintenanceController.getMaintenanceMetrics)
);

// Export maintenance schedule
router.get(
  '/export',
  authorize(['admin', 'platform-manager']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.exportMaintenanceSchedule),
  asyncHandler(maintenanceController.exportMaintenanceSchedule)
);

// Export maintenance details
router.get(
  '/:maintenanceId/export',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.exportMaintenanceDetails),
  asyncHandler(maintenanceController.exportMaintenanceDetails)
);

// Get maintenance compliance report
router.get(
  '/:maintenanceId/compliance',
  authorize(['admin', 'platform-manager', 'auditor']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getComplianceReport),
  asyncHandler(maintenanceController.getComplianceReport)
);

// Get maintenance performance report
router.get(
  '/:maintenanceId/performance',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getPerformanceReport),
  asyncHandler(maintenanceController.getPerformanceReport)
);

/**
 * Maintenance Handler Management Routes
 */

// Register maintenance handler
router.post(
  '/handlers',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.registerMaintenanceHandler),
  maintenanceOperationLogger('handler-register'),
  asyncHandler(maintenanceController.registerMaintenanceHandler)
);

// Get registered handlers
router.get(
  '/handlers',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getRegisteredHandlers),
  asyncHandler(maintenanceController.getRegisteredHandlers)
);

// Update maintenance handler
router.put(
  '/handlers/:handlerId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateMaintenanceHandler),
  maintenanceOperationLogger('handler-update'),
  asyncHandler(maintenanceController.updateMaintenanceHandler)
);

// Delete maintenance handler
router.delete(
  '/handlers/:handlerId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteMaintenanceHandler),
  maintenanceOperationLogger('handler-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceHandler)
);

// Test maintenance handler
router.post(
  '/handlers/:handlerId/test',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.testMaintenanceHandler),
  maintenanceOperationLogger('handler-test'),
  asyncHandler(maintenanceController.testMaintenanceHandler)
);

// Execute maintenance handler
router.post(
  '/:maintenanceId/handlers/:handlerId/execute',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.executeMaintenanceHandler),
  maintenanceOperationLogger('handler-execute'),
  asyncHandler(maintenanceController.executeMaintenanceHandler)
);

/**
 * Maintenance Approval Workflow Routes
 */

// Request maintenance approval
router.post(
  '/:maintenanceId/approval/request',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.requestMaintenanceApproval),
  maintenanceOperationLogger('approval-request'),
  asyncHandler(maintenanceController.requestMaintenanceApproval)
);

// Approve maintenance
router.post(
  '/:maintenanceId/approval/approve',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.approveMaintenance),
  maintenanceOperationLogger('maintenance-approve'),
  asyncHandler(maintenanceController.approveMaintenance)
);

// Reject maintenance
router.post(
  '/:maintenanceId/approval/reject',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.rejectMaintenance),
  maintenanceOperationLogger('maintenance-reject'),
  asyncHandler(maintenanceController.rejectMaintenance)
);

// Get approval status
router.get(
  '/:maintenanceId/approval/status',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getApprovalStatus),
  asyncHandler(maintenanceController.getApprovalStatus)
);

// Get pending approvals
router.get(
  '/approvals/pending',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getPendingApprovals),
  asyncHandler(maintenanceController.getPendingApprovals)
);

/**
 * Maintenance Automation Routes
 */

// Configure automation rules
router.post(
  '/automation/rules',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.configureAutomationRules),
  maintenanceOperationLogger('automation-configure'),
  asyncHandler(maintenanceController.configureAutomationRules)
);

// Get automation rules
router.get(
  '/automation/rules',
  authorize(['admin', 'platform-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getAutomationRules),
  asyncHandler(maintenanceController.getAutomationRules)
);

// Update automation rule
router.put(
  '/automation/rules/:ruleId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateAutomationRule),
  maintenanceOperationLogger('automation-rule-update'),
  asyncHandler(maintenanceController.updateAutomationRule)
);

// Delete automation rule
router.delete(
  '/automation/rules/:ruleId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteAutomationRule),
  maintenanceOperationLogger('automation-rule-delete'),
  asyncHandler(maintenanceController.deleteAutomationRule)
);

// Test automation rule
router.post(
  '/automation/rules/:ruleId/test',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.testAutomationRule),
  maintenanceOperationLogger('automation-rule-test'),
  asyncHandler(maintenanceController.testAutomationRule)
);

// Enable/disable automation
router.patch(
  '/automation/rules/:ruleId/toggle',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.toggleAutomationRule),
  maintenanceOperationLogger('automation-toggle'),
  asyncHandler(maintenanceController.toggleAutomationRule)
);

/**
 * Maintenance Recovery and Rollback Routes
 */

// Create recovery point
router.post(
  '/:maintenanceId/recovery/create',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.createRecoveryPoint),
  maintenanceOperationLogger('recovery-point-create'),
  asyncHandler(maintenanceController.createRecoveryPoint)
);

// Get recovery points
router.get(
  '/:maintenanceId/recovery/points',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getRecoveryPoints),
  asyncHandler(maintenanceController.getRecoveryPoints)
);

// Initiate rollback
router.post(
  '/:maintenanceId/recovery/rollback',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.critical),
  requestValidator(maintenanceValidators.initiateRollback),
  maintenanceOperationLogger('rollback-initiate'),
  asyncHandler(maintenanceController.initiateRollback)
);

// Get rollback status
router.get(
  '/:maintenanceId/recovery/rollback/status',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.status),
  requestValidator(maintenanceValidators.getRollbackStatus),
  asyncHandler(maintenanceController.getRollbackStatus)
);

// Validate recovery point
router.post(
  '/:maintenanceId/recovery/points/:pointId/validate',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(maintenanceValidators.validateRecoveryPoint),
  maintenanceOperationLogger('recovery-point-validate'),
  asyncHandler(maintenanceController.validateRecoveryPoint)
);

// Delete recovery point
router.delete(
  '/:maintenanceId/recovery/points/:pointId',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteRecoveryPoint),
  maintenanceOperationLogger('recovery-point-delete'),
  asyncHandler(maintenanceController.deleteRecoveryPoint)
);

/**
 * Maintenance Documentation Routes
 */

// Get maintenance documentation
router.get(
  '/:maintenanceId/documentation',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceDocumentation),
  asyncHandler(maintenanceController.getMaintenanceDocumentation)
);

// Add maintenance documentation
router.post(
  '/:maintenanceId/documentation',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.addMaintenanceDocumentation),
  maintenanceOperationLogger('documentation-add'),
  asyncHandler(maintenanceController.addMaintenanceDocumentation)
);

// Update maintenance documentation
router.put(
  '/:maintenanceId/documentation/:documentId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateMaintenanceDocumentation),
  maintenanceOperationLogger('documentation-update'),
  asyncHandler(maintenanceController.updateMaintenanceDocumentation)
);

// Delete maintenance documentation
router.delete(
  '/:maintenanceId/documentation/:documentId',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.deleteMaintenanceDocumentation),
  maintenanceOperationLogger('documentation-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceDocumentation)
);

// Get maintenance runbook
router.get(
  '/:maintenanceId/runbook',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceRunbook),
  asyncHandler(maintenanceController.getMaintenanceRunbook)
);

// Create/Update maintenance runbook
router.put(
  '/:maintenanceId/runbook',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateMaintenanceRunbook),
  maintenanceOperationLogger('runbook-update'),
  asyncHandler(maintenanceController.updateMaintenanceRunbook)
);

/**
 * Maintenance Coordination Routes
 */

// Get maintenance team assignments
router.get(
  '/:maintenanceId/team',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceTeam),
  asyncHandler(maintenanceController.getMaintenanceTeam)
);

// Assign team member
router.post(
  '/:maintenanceId/team/assign',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.assignTeamMember),
  maintenanceOperationLogger('team-assign'),
  asyncHandler(maintenanceController.assignTeamMember)
);

// Remove team member
router.delete(
  '/:maintenanceId/team/:memberId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.removeTeamMember),
  maintenanceOperationLogger('team-remove'),
  asyncHandler(maintenanceController.removeTeamMember)
);

// Update team member role
router.patch(
  '/:maintenanceId/team/:memberId/role',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateTeamMemberRole),
  maintenanceOperationLogger('team-role-update'),
  asyncHandler(maintenanceController.updateTeamMemberRole)
);

// Get maintenance checklist
router.get(
  '/:maintenanceId/checklist',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getMaintenanceChecklist),
  asyncHandler(maintenanceController.getMaintenanceChecklist)
);

// Update checklist item
router.patch(
  '/:maintenanceId/checklist/:itemId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.updateChecklistItem),
  maintenanceOperationLogger('checklist-update'),
  asyncHandler(maintenanceController.updateChecklistItem)
);

/**
 * Maintenance Integration Routes
 */

// Integrate with external system
router.post(
  '/:maintenanceId/integrate',
  authorize(['admin']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.integrateExternalSystem),
  maintenanceOperationLogger('integration-add'),
  asyncHandler(maintenanceController.integrateExternalSystem)
);

// Get integrations
router.get(
  '/:maintenanceId/integrations',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(maintenanceValidators.getIntegrations),
  asyncHandler(maintenanceController.getIntegrations)
);

// Sync with external calendar
router.post(
  '/:maintenanceId/sync/calendar',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.syncWithCalendar),
  maintenanceOperationLogger('calendar-sync'),
  asyncHandler(maintenanceController.syncWithCalendar)
);

// Export to ticketing system
router.post(
  '/:maintenanceId/export/ticket',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(maintenanceValidators.exportToTicketingSystem),
  maintenanceOperationLogger('ticket-export'),
  asyncHandler(maintenanceController.exportToTicketingSystem)
);

/**
 * Error handling middleware
 */
router.use((err, req, res, next) => {
  logger.error('Maintenance management route error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    maintenanceId: req.params?.maintenanceId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Log to audit trail for critical maintenance errors
  if (err.statusCode >= 500 || err.critical) {
    auditLogger.logError({
      service: 'maintenance-management',
      error: err,
      request: {
        path: req.path,
        method: req.method,
        params: req.params,
        query: req.query,
        body: req.body
      },
      user: req.user,
      maintenanceContext: {
        conflictCheck: req.maintenanceConflictCheck,
        maintenanceId: req.params?.maintenanceId
      }
    });
  }

  // Special handling for maintenance-specific errors
  if (err.code === 'MAINTENANCE_CONFLICT') {
    return res.status(409).json({
      success: false,
      message: 'Maintenance window conflicts with existing schedule',
      conflicts: err.conflicts
    });
  }

  if (err.code === 'MAINTENANCE_IN_PROGRESS') {
    return res.status(423).json({
      success: false,
      message: 'Cannot perform operation while maintenance is in progress',
      maintenanceId: err.maintenanceId
    });
  }

  next(err);
});

// Export router
module.exports = router;