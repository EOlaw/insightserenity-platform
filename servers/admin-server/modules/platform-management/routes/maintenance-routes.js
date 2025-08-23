'use strict';

/**
 * @fileoverview Maintenance window and operations management routes
 * @module servers/admin-server/modules/platform-management/routes/maintenance-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/maintenance-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance-controller');
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
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * Advanced rate limiting configurations for different maintenance operations
 */
const RATE_LIMITS = {
  // Default rate limiting for general maintenance operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many maintenance requests from this IP, please try again later.',
    headers: true
  },
  
  // High-frequency read operations with adaptive limiting
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 60,
    minMax: 20,
    maxMax: 120,
    message: 'Maintenance read rate limit exceeded.',
    headers: true
  },
  
  // Write operations with burst protection
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: 'Maintenance write rate limit exceeded.',
    headers: true,
    burstProtection: true
  },
  
  // Critical maintenance operations requiring combined limiting
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Critical maintenance operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user']
  },
  
  // Status check operations with adaptive limiting
  status: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 120,
    minMax: 30,
    maxMax: 200,
    message: 'Status check rate limit exceeded.',
    headers: true
  },
  
  // Notification operations with cost-based limiting
  notification: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 1000,
    message: 'Notification rate limit exceeded.',
    headers: true
  },
  
  // Analysis and reporting operations
  analysis: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 2000,
    message: 'Analysis operation cost limit exceeded.',
    headers: true
  },
  
  // Emergency maintenance operations
  emergency: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3,
    message: 'Emergency maintenance rate limit exceeded.',
    headers: true
  },
  
  // Automation operations
  automation: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10,
    message: 'Automation operation rate limit exceeded.',
    headers: true
  }
};

/**
 * Cost calculator for maintenance operations
 */
const calculateMaintenanceCost = (req) => {
  let cost = 15; // Base cost
  
  // Increase cost based on operation complexity
  if (req.path.includes('batch')) cost += 100;
  if (req.path.includes('emergency')) cost += 200;
  if (req.path.includes('impact') || req.path.includes('analyze')) cost += 75;
  if (req.path.includes('rollback') || req.path.includes('recovery')) cost += 150;
  if (req.path.includes('report') || req.path.includes('export')) cost += 50;
  if (req.path.includes('automation')) cost += 80;
  
  // Increase cost based on maintenance window duration
  if (req.body && req.body.startTime && req.body.endTime) {
    const duration = new Date(req.body.endTime) - new Date(req.body.startTime);
    const hours = duration / (1000 * 60 * 60);
    if (hours > 4) cost += hours * 10;
  }
  
  // Increase cost for bulk operations
  if (req.body && req.body.maintenanceWindows && Array.isArray(req.body.maintenanceWindows)) {
    cost += req.body.maintenanceWindows.length * 25;
  }
  
  return cost;
};

/**
 * Cost calculator for notification operations
 */
const calculateNotificationCost = (req) => {
  let cost = 20; // Base notification cost
  
  // Increase cost based on notification scope
  if (req.body && req.body.channels) {
    cost += req.body.channels.length * 10;
  }
  
  if (req.body && req.body.recipients) {
    cost += Array.isArray(req.body.recipients) ? req.body.recipients.length * 2 : 10;
  }
  
  // Emergency notifications are more expensive
  if (req.path.includes('emergency') || req.body?.priority === 'high') {
    cost += 50;
  }
  
  return cost;
};

/**
 * Maintenance operation logger middleware with enhanced audit logging
 */
const maintenanceOperationLogger = (operation) => {
  return asyncHandler(async (req, res, next) => {
    logger.info(`Maintenance operation initiated: ${operation}`, {
      operation,
      maintenanceId: req.params.maintenanceId,
      userId: req.user?.id,
      ip: req.ip,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    // Enhanced audit logging for critical maintenance operations
    const criticalOperations = [
      'maintenance-schedule', 'maintenance-schedule-emergency', 'maintenance-start',
      'maintenance-complete', 'maintenance-cancel', 'maintenance-rollback',
      'maintenance-force-complete', 'recovery-point-create', 'rollback-initiate',
      'automation-configure', 'handler-execute', 'approval-request'
    ];

    if (criticalOperations.includes(operation)) {
      await auditLogEvent({
        event: `maintenance.${operation.replace('-', '_')}`,
        timestamp: new Date().toISOString(),
        actor: req.user || { type: 'system', id: 'unknown' },
        resource: {
          type: 'maintenance_window',
          id: req.params.maintenanceId || 'new',
          name: req.params.maintenanceId ? `Maintenance Window ${req.params.maintenanceId}` : 'New Maintenance Window'
        },
        action: operation,
        result: 'initiated',
        metadata: {
          operation,
          maintenanceId: req.params.maintenanceId,
          taskId: req.params.taskId,
          handlerId: req.params.handlerId,
          requestPath: req.path,
          requestMethod: req.method,
          userAgent: req.get('user-agent'),
          maintenanceDetails: {
            startTime: req.body?.startTime,
            endTime: req.body?.endTime,
            type: req.body?.type,
            priority: req.body?.priority
          }
        }
      }, req);
    }

    next();
  });
};

/**
 * Middleware to validate maintenance window access with enhanced audit logging
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

    // Audit unauthorized execution attempt
    await auditLogEvent({
      event: 'authz.access_denied',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_execution',
        id: maintenanceId,
        name: `Maintenance Window ${maintenanceId} Execution`
      },
      action: 'execution_attempt',
      result: 'failure',
      metadata: {
        reason: 'insufficient_permissions',
        requiredRoles: ['admin', 'platform-manager'],
        userRole,
        maintenanceId
      }
    }, req);
    
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions for maintenance execution'
    });
  }

  // Audit successful access validation
  if (maintenanceId && userId) {
    await auditLogEvent({
      event: 'authz.maintenance_access_validated',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_window',
        id: maintenanceId,
        name: `Maintenance Window ${maintenanceId}`
      },
      action: 'access_validation',
      result: 'success',
      metadata: {
        maintenanceId,
        userId,
        userRole,
        requestPath: req.path
      }
    }, req);
  }
  
  logger.debug('Maintenance access validated', { maintenanceId, userId });
  next();
});

/**
 * Middleware to check maintenance window conflicts with audit logging
 */
const checkMaintenanceConflicts = asyncHandler(async (req, res, next) => {
  if (req.body.startTime && req.body.endTime) {
    req.maintenanceConflictCheck = {
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      checkPerformed: true
    };

    // Audit conflict check initiation
    await auditLogEvent({
      event: 'maintenance.conflict_check_started',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_window',
        id: 'conflict_check',
        name: 'Maintenance Window Conflict Check'
      },
      action: 'conflict_check',
      result: 'initiated',
      metadata: {
        requestedStartTime: req.body.startTime,
        requestedEndTime: req.body.endTime,
        conflictCheckId: `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    }, req);
  }
  next();
});

/**
 * Middleware to validate maintenance window timing with audit logging
 */
const validateMaintenanceTiming = asyncHandler(async (req, res, next) => {
  const { startTime, endTime } = req.body;
  
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();
    
    let validationResult = 'success';
    let validationError = null;
    
    if (start < now) {
      validationResult = 'failure';
      validationError = 'Maintenance start time cannot be in the past';
    } else if (end <= start) {
      validationResult = 'failure';
      validationError = 'Maintenance end time must be after start time';
    } else {
      const duration = end - start;
      const maxDuration = 24 * 60 * 60 * 1000; // 24 hours
      
      if (duration > maxDuration) {
        validationResult = 'failure';
        validationError = 'Maintenance window cannot exceed 24 hours';
      }
    }

    // Audit timing validation
    await auditLogEvent({
      event: 'maintenance.timing_validation',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_window',
        id: 'timing_validation',
        name: 'Maintenance Window Timing Validation'
      },
      action: 'timing_validation',
      result: validationResult,
      metadata: {
        startTime,
        endTime,
        duration: end - start,
        validationError
      }
    }, req);
    
    if (validationResult === 'failure') {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }
  }
  
  next();
});

/**
 * Middleware to audit operation completion
 */
const auditOperationComplete = (operation) => {
  return asyncHandler(async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(body) {
      // Determine operation result based on response
      const result = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
      
      // Log operation completion
      auditLogEvent({
        event: `maintenance.${operation.replace('-', '_')}_complete`,
        timestamp: new Date().toISOString(),
        actor: req.user || { type: 'system', id: 'unknown' },
        resource: {
          type: 'maintenance_window',
          id: req.params.maintenanceId || 'multiple',
          name: req.params.maintenanceId ? `Maintenance Window ${req.params.maintenanceId}` : 'Multiple Maintenance Windows'
        },
        action: `${operation}_complete`,
        result: result,
        metadata: {
          operation,
          statusCode: res.statusCode,
          maintenanceId: req.params.maintenanceId,
          taskId: req.params.taskId,
          handlerId: req.params.handlerId,
          responseSize: body ? body.length : 0,
          conflictCheck: req.maintenanceConflictCheck
        }
      }, req).catch(error => {
        logger.error('Failed to log maintenance operation completion audit', {
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
 * Custom rate limiter for sensitive maintenance operations
 */
const sensitiveMaintenanceLimit = customLimit('sensitive_maintenance', (req) => {
  // Apply stricter limits for sensitive maintenance operations
  const sensitiveEndpoints = [
    '/start', '/complete', '/cancel', '/force-complete', '/rollback',
    '/emergency', '/execute', '/approve', '/reject', '/recovery',
    '/automation', '/handlers'
  ];
  
  const isSensitive = sensitiveEndpoints.some(endpoint => req.path.includes(endpoint));
  
  if (isSensitive) {
    return {
      windowMs: 30 * 60 * 1000, // 30 minutes
      max: 2,
      message: 'Sensitive maintenance operation rate limit exceeded',
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
  service: 'maintenance-management',
  includeBody: true,
  includeQuery: true,
  sensitiveFields: ['password', 'token', 'apiKey', 'credentials', 'handler'],
  skip: (req) => {
    // Skip audit logging for high-frequency status check endpoints
    return req.method === 'GET' && req.path.match(/\/(status|readiness|availability)$/) &&
           !req.path.includes('detailed');
  }
}));

/**
 * Maintenance Window Scheduling Routes
 */

// Schedule new maintenance window
router.post(
  '/schedule',
  authorize(['admin', 'platform-manager']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  maintenanceOperationLogger('maintenance-schedule'),
  auditOperationComplete('maintenance-schedule'),
  asyncHandler(maintenanceController.scheduleMaintenanceWindow)
);

// Schedule recurring maintenance
router.post(
  '/schedule/recurring',
  authorize(['admin', 'platform-manager']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-schedule-recurring'),
  auditOperationComplete('maintenance-schedule-recurring'),
  asyncHandler(maintenanceController.scheduleRecurringMaintenance)
);

// Schedule emergency maintenance
router.post(
  '/schedule/emergency',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.emergency),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-schedule-emergency'),
  auditOperationComplete('maintenance-schedule-emergency'),
  asyncHandler(maintenanceController.scheduleEmergencyMaintenance)
);

// Reschedule maintenance window
router.put(
  '/:maintenanceId/reschedule',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  maintenanceOperationLogger('maintenance-reschedule'),
  auditOperationComplete('maintenance-reschedule'),
  asyncHandler(maintenanceController.rescheduleMaintenanceWindow)
);

// Batch schedule maintenance windows
router.post(
  '/schedule/batch',
  authorize(['admin']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  maintenanceOperationLogger('maintenance-batch-schedule'),
  auditOperationComplete('maintenance-batch-schedule'),
  asyncHandler(maintenanceController.batchScheduleMaintenance)
);

/**
 * Maintenance Window Query Routes
 */

// Get active maintenance windows
router.get(
  '/active',
  authorize(['admin', 'platform-manager', 'viewer', 'user']),
  adaptiveLimit(RATE_LIMITS.status),
  asyncHandler(maintenanceController.getActiveMaintenanceWindows)
);

// Get scheduled maintenance windows
router.get(
  '/scheduled',
  authorize(['admin', 'platform-manager', 'viewer']),
  adaptiveLimit(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getScheduledMaintenanceWindows)
);

// Get upcoming maintenance windows
router.get(
  '/upcoming',
  authorize(['admin', 'platform-manager', 'viewer', 'user']),
  adaptiveLimit(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getUpcomingMaintenanceWindows)
);

// Get maintenance history
router.get(
  '/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceHistory)
);

// Get maintenance calendar
router.get(
  '/calendar',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceCalendar)
);

// Search maintenance windows
router.get(
  '/search',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.searchMaintenanceWindows)
);

// Get maintenance by type
router.get(
  '/type/:type',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByEndpoint(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceByType)
);

// Get maintenance by status
router.get(
  '/status/:status',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByEndpoint(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceByStatus)
);

// Get maintenance by service
router.get(
  '/service/:serviceName',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByEndpoint(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceByService)
);

// Get maintenance by date range
router.get(
  '/range',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getMaintenanceByDateRange)
);

/**
 * Maintenance Window Status Routes
 */

// Check maintenance status (public endpoint with lighter auth)
router.get(
  '/status',
  adaptiveLimit(RATE_LIMITS.status),
  asyncHandler(maintenanceController.checkMaintenanceStatus)
);

// Get detailed maintenance status
router.get(
  '/status/detailed',
  authorize(['admin', 'platform-manager', 'viewer']),
  adaptiveLimit(RATE_LIMITS.status),
  asyncHandler(maintenanceController.getDetailedMaintenanceStatus)
);

// Get system maintenance readiness
router.get(
  '/readiness',
  authorize(['admin', 'platform-manager']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceReadiness)
);

// Check service availability during maintenance
router.get(
  '/availability/:serviceName',
  limitByEndpoint(RATE_LIMITS.status),
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
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceWindow)
);

// Update maintenance window
router.put(
  '/:maintenanceId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  validateMaintenanceTiming,
  maintenanceOperationLogger('maintenance-update'),
  auditOperationComplete('maintenance-update'),
  asyncHandler(maintenanceController.updateMaintenanceWindow)
);

// Update maintenance window metadata
router.patch(
  '/:maintenanceId/metadata',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-metadata-update'),
  auditOperationComplete('maintenance-metadata-update'),
  asyncHandler(maintenanceController.updateMaintenanceMetadata)
);

// Delete maintenance window
router.delete(
  '/:maintenanceId',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-delete'),
  auditOperationComplete('maintenance-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceWindow)
);

// Clone maintenance window
router.post(
  '/:maintenanceId/clone',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-clone'),
  auditOperationComplete('maintenance-clone'),
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
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-start'),
  auditOperationComplete('maintenance-start'),
  asyncHandler(maintenanceController.startMaintenanceWindow)
);

// Complete maintenance window
router.post(
  '/:maintenanceId/complete',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-complete'),
  auditOperationComplete('maintenance-complete'),
  asyncHandler(maintenanceController.completeMaintenanceWindow)
);

// Cancel maintenance window
router.post(
  '/:maintenanceId/cancel',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-cancel'),
  auditOperationComplete('maintenance-cancel'),
  asyncHandler(maintenanceController.cancelMaintenanceWindow)
);

// Extend maintenance window
router.post(
  '/:maintenanceId/extend',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-extend'),
  auditOperationComplete('maintenance-extend'),
  asyncHandler(maintenanceController.extendMaintenanceWindow)
);

// Pause maintenance window
router.post(
  '/:maintenanceId/pause',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  maintenanceOperationLogger('maintenance-pause'),
  auditOperationComplete('maintenance-pause'),
  asyncHandler(maintenanceController.pauseMaintenanceWindow)
);

// Resume maintenance window
router.post(
  '/:maintenanceId/resume',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  maintenanceOperationLogger('maintenance-resume'),
  auditOperationComplete('maintenance-resume'),
  asyncHandler(maintenanceController.resumeMaintenanceWindow)
);

// Force complete maintenance window
router.post(
  '/:maintenanceId/force-complete',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-force-complete'),
  auditOperationComplete('maintenance-force-complete'),
  asyncHandler(maintenanceController.forceCompleteMaintenanceWindow)
);

// Rollback maintenance window
router.post(
  '/:maintenanceId/rollback',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-rollback'),
  auditOperationComplete('maintenance-rollback'),
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
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-add'),
  auditOperationComplete('task-add'),
  asyncHandler(maintenanceController.addMaintenanceTask)
);

// Get maintenance tasks
router.get(
  '/:maintenanceId/tasks',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceTasks)
);

// Update maintenance task
router.put(
  '/:maintenanceId/tasks/:taskId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-update'),
  auditOperationComplete('task-update'),
  asyncHandler(maintenanceController.updateMaintenanceTask)
);

// Complete maintenance task
router.post(
  '/:maintenanceId/tasks/:taskId/complete',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-complete'),
  auditOperationComplete('task-complete'),
  asyncHandler(maintenanceController.completeMaintenanceTask)
);

// Delete maintenance task
router.delete(
  '/:maintenanceId/tasks/:taskId',
  authorize(['admin']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-delete'),
  auditOperationComplete('task-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceTask)
);

// Get maintenance activity log
router.get(
  '/:maintenanceId/activities',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceActivities)
);

// Add maintenance activity
router.post(
  '/:maintenanceId/activities',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('activity-add'),
  auditOperationComplete('activity-add'),
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
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getMaintenanceImpactAnalysis)
);

// Analyze maintenance impact
router.post(
  '/:maintenanceId/impact/analyze',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  maintenanceOperationLogger('impact-analyze'),
  asyncHandler(maintenanceController.analyzeMaintenanceImpact)
);

// Get affected services
router.get(
  '/:maintenanceId/affected-services',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getAffectedServices)
);

// Get affected users
router.get(
  '/:maintenanceId/affected-users',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getAffectedUsers)
);

// Get maintenance dependencies
router.get(
  '/:maintenanceId/dependencies',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceDependencies)
);

// Get maintenance risk assessment
router.get(
  '/:maintenanceId/risk-assessment',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getMaintenanceRiskAssessment)
);

/**
 * Maintenance Validation Routes
 */

// Validate maintenance window
router.post(
  '/validate',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  asyncHandler(maintenanceController.validateMaintenanceWindow)
);

// Check maintenance conflicts
router.post(
  '/conflicts/check',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  asyncHandler(maintenanceController.checkMaintenanceConflicts)
);

// Validate maintenance prerequisites
router.post(
  '/:maintenanceId/prerequisites/validate',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  maintenanceOperationLogger('prerequisites-validate'),
  asyncHandler(maintenanceController.validatePrerequisites)
);

// Test maintenance procedures
router.post(
  '/:maintenanceId/test',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  maintenanceOperationLogger('maintenance-test'),
  asyncHandler(maintenanceController.testMaintenanceProcedures)
);

// Dry run maintenance
router.post(
  '/:maintenanceId/dry-run',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
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
  costBasedLimit(calculateNotificationCost, RATE_LIMITS.notification),
  maintenanceOperationLogger('notifications-send'),
  asyncHandler(async (req, res, next) => {
    // Audit notification sending
    await auditLogEvent({
      event: 'maintenance.notification_sent',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_notification',
        id: req.params.maintenanceId,
        name: `Maintenance ${req.params.maintenanceId} Notification`
      },
      action: 'send_notification',
      result: 'initiated',
      metadata: {
        maintenanceId: req.params.maintenanceId,
        channels: req.body?.channels || [],
        recipientCount: Array.isArray(req.body?.recipients) ? req.body.recipients.length : 0,
        priority: req.body?.priority || 'normal'
      }
    }, req);
    
    return maintenanceController.sendMaintenanceNotifications(req, res, next);
  })
);

// Schedule maintenance notifications
router.post(
  '/:maintenanceId/notify/schedule',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateNotificationCost, RATE_LIMITS.notification),
  maintenanceOperationLogger('notifications-schedule'),
  auditOperationComplete('notifications-schedule'),
  asyncHandler(maintenanceController.scheduleNotifications)
);

// Get notification history
router.get(
  '/:maintenanceId/notifications',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getNotificationHistory)
);

// Cancel scheduled notifications
router.delete(
  '/:maintenanceId/notify/:notificationId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.notification),
  maintenanceOperationLogger('notification-cancel'),
  auditOperationComplete('notification-cancel'),
  asyncHandler(maintenanceController.cancelScheduledNotification)
);

// Get notification templates
router.get(
  '/templates/notifications',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getNotificationTemplates)
);

// Create notification template
router.post(
  '/templates/notifications',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('template-create'),
  auditOperationComplete('template-create'),
  asyncHandler(maintenanceController.createNotificationTemplate)
);

// Update notification template
router.put(
  '/templates/notifications/:templateId',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('template-update'),
  auditOperationComplete('template-update'),
  asyncHandler(maintenanceController.updateNotificationTemplate)
);

// Delete notification template
router.delete(
  '/templates/notifications/:templateId',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('template-delete'),
  auditOperationComplete('template-delete'),
  asyncHandler(maintenanceController.deleteNotificationTemplate)
);

/**
 * Maintenance Reporting Routes
 */

// Get maintenance statistics
router.get(
  '/statistics',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getMaintenanceStatistics)
);

// Create maintenance report
router.get(
  '/report',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(async (req, res, next) => {
    // Audit report generation
    await auditLogEvent({
      event: 'maintenance.report_generated',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_report',
        id: 'general',
        name: 'Maintenance Report'
      },
      action: 'generate_report',
      result: 'initiated',
      metadata: {
        reportType: 'maintenance_summary',
        parameters: req.query
      }
    }, req);
    
    return maintenanceController.createMaintenanceReport(req, res, next);
  })
);

// Generate maintenance summary
router.get(
  '/:maintenanceId/summary',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.generateMaintenanceSummary)
);

// Get maintenance metrics
router.get(
  '/:maintenanceId/metrics',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceMetrics)
);

// Export maintenance schedule
router.get(
  '/export',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(async (req, res, next) => {
    // Audit schedule export
    await auditLogEvent({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'maintenance_schedule',
        id: 'all',
        name: 'Maintenance Schedule'
      },
      action: 'export',
      result: 'initiated',
      metadata: {
        exportType: 'maintenance_schedule',
        format: req.query.format || 'json'
      }
    }, req);
    
    return maintenanceController.exportMaintenanceSchedule(req, res, next);
  })
);

// Export maintenance details
router.get(
  '/:maintenanceId/export',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.default),
  asyncHandler(maintenanceController.exportMaintenanceDetails)
);

// Get maintenance compliance report
router.get(
  '/:maintenanceId/compliance',
  authorize(['admin', 'platform-manager', 'auditor']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getComplianceReport)
);

// Get maintenance performance report
router.get(
  '/:maintenanceId/performance',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  asyncHandler(maintenanceController.getPerformanceReport)
);

/**
 * Maintenance Handler Management Routes
 */

// Register maintenance handler
router.post(
  '/handlers',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('handler-register'),
  auditOperationComplete('handler-register'),
  asyncHandler(maintenanceController.registerMaintenanceHandler)
);

// Get registered handlers
router.get(
  '/handlers',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getRegisteredHandlers)
);

// Update maintenance handler
router.put(
  '/handlers/:handlerId',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('handler-update'),
  auditOperationComplete('handler-update'),
  asyncHandler(maintenanceController.updateMaintenanceHandler)
);

// Delete maintenance handler
router.delete(
  '/handlers/:handlerId',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('handler-delete'),
  auditOperationComplete('handler-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceHandler)
);

// Test maintenance handler
router.post(
  '/handlers/:handlerId/test',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.default),
  maintenanceOperationLogger('handler-test'),
  asyncHandler(maintenanceController.testMaintenanceHandler)
);

// Execute maintenance handler
router.post(
  '/:maintenanceId/handlers/:handlerId/execute',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('handler-execute'),
  auditOperationComplete('handler-execute'),
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
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('approval-request'),
  auditOperationComplete('approval-request'),
  asyncHandler(maintenanceController.requestMaintenanceApproval)
);

// Approve maintenance
router.post(
  '/:maintenanceId/approval/approve',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  maintenanceOperationLogger('maintenance-approve'),
  auditOperationComplete('maintenance-approve'),
  asyncHandler(maintenanceController.approveMaintenance)
);

// Reject maintenance
router.post(
  '/:maintenanceId/approval/reject',
  authorize(['admin']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-reject'),
  auditOperationComplete('maintenance-reject'),
  asyncHandler(maintenanceController.rejectMaintenance)
);

// Get approval status
router.get(
  '/:maintenanceId/approval/status',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getApprovalStatus)
);

// Get pending approvals
router.get(
  '/approvals/pending',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getPendingApprovals)
);

/**
 * Maintenance Automation Routes
 */

// Configure automation rules
router.post(
  '/automation/rules',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('automation-configure'),
  auditOperationComplete('automation-configure'),
  asyncHandler(maintenanceController.configureAutomationRules)
);

// Get automation rules
router.get(
  '/automation/rules',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getAutomationRules)
);

// Update automation rule
router.put(
  '/automation/rules/:ruleId',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('automation-rule-update'),
  auditOperationComplete('automation-rule-update'),
  asyncHandler(maintenanceController.updateAutomationRule)
);

// Delete automation rule
router.delete(
  '/automation/rules/:ruleId',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('automation-rule-delete'),
  auditOperationComplete('automation-rule-delete'),
  asyncHandler(maintenanceController.deleteAutomationRule)
);

// Test automation rule
router.post(
  '/automation/rules/:ruleId/test',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.default),
  maintenanceOperationLogger('automation-rule-test'),
  asyncHandler(maintenanceController.testAutomationRule)
);

// Enable/disable automation
router.patch(
  '/automation/rules/:ruleId/toggle',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.automation),
  maintenanceOperationLogger('automation-toggle'),
  auditOperationComplete('automation-toggle'),
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
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('recovery-point-create'),
  auditOperationComplete('recovery-point-create'),
  asyncHandler(maintenanceController.createRecoveryPoint)
);

// Get recovery points
router.get(
  '/:maintenanceId/recovery/points',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getRecoveryPoints)
);

// Initiate rollback
router.post(
  '/:maintenanceId/recovery/rollback',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('rollback-initiate'),
  auditOperationComplete('rollback-initiate'),
  asyncHandler(maintenanceController.initiateRollback)
);

// Get rollback status
router.get(
  '/:maintenanceId/recovery/rollback/status',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  adaptiveLimit(RATE_LIMITS.status),
  asyncHandler(maintenanceController.getRollbackStatus)
);

// Validate recovery point
router.post(
  '/:maintenanceId/recovery/points/:pointId/validate',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.default),
  maintenanceOperationLogger('recovery-point-validate'),
  asyncHandler(maintenanceController.validateRecoveryPoint)
);

// Delete recovery point
router.delete(
  '/:maintenanceId/recovery/points/:pointId',
  authorize(['admin']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('recovery-point-delete'),
  auditOperationComplete('recovery-point-delete'),
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
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceDocumentation)
);

// Add maintenance documentation
router.post(
  '/:maintenanceId/documentation',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('documentation-add'),
  auditOperationComplete('documentation-add'),
  asyncHandler(maintenanceController.addMaintenanceDocumentation)
);

// Update maintenance documentation
router.put(
  '/:maintenanceId/documentation/:documentId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('documentation-update'),
  auditOperationComplete('documentation-update'),
  asyncHandler(maintenanceController.updateMaintenanceDocumentation)
);

// Delete maintenance documentation
router.delete(
  '/:maintenanceId/documentation/:documentId',
  authorize(['admin']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('documentation-delete'),
  auditOperationComplete('documentation-delete'),
  asyncHandler(maintenanceController.deleteMaintenanceDocumentation)
);

// Get maintenance runbook
router.get(
  '/:maintenanceId/runbook',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceRunbook)
);

// Create/Update maintenance runbook
router.put(
  '/:maintenanceId/runbook',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('runbook-update'),
  auditOperationComplete('runbook-update'),
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
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceTeam)
);

// Assign team member
router.post(
  '/:maintenanceId/team/assign',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('team-assign'),
  auditOperationComplete('team-assign'),
  asyncHandler(maintenanceController.assignTeamMember)
);

// Remove team member
router.delete(
  '/:maintenanceId/team/:memberId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('team-remove'),
  auditOperationComplete('team-remove'),
  asyncHandler(maintenanceController.removeTeamMember)
);

// Update team member role
router.patch(
  '/:maintenanceId/team/:memberId/role',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('team-role-update'),
  auditOperationComplete('team-role-update'),
  asyncHandler(maintenanceController.updateTeamMemberRole)
);

// Get maintenance checklist
router.get(
  '/:maintenanceId/checklist',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getMaintenanceChecklist)
);

// Update checklist item
router.patch(
  '/:maintenanceId/checklist/:itemId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('checklist-update'),
  auditOperationComplete('checklist-update'),
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
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('integration-add'),
  auditOperationComplete('integration-add'),
  asyncHandler(maintenanceController.integrateExternalSystem)
);

// Get integrations
router.get(
  '/:maintenanceId/integrations',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(maintenanceController.getIntegrations)
);

// Sync with external calendar
router.post(
  '/:maintenanceId/sync/calendar',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('calendar-sync'),
  auditOperationComplete('calendar-sync'),
  asyncHandler(maintenanceController.syncWithCalendar)
);

// Export to ticketing system
router.post(
  '/:maintenanceId/export/ticket',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('ticket-export'),
  auditOperationComplete('ticket-export'),
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

  // Audit maintenance management errors
  if (err.statusCode >= 500 || err.critical) {
    auditLogEvent({
      event: 'maintenance.error',
      timestamp: new Date().toISOString(),
      actor: req.user || { type: 'system', id: 'unknown' },
      resource: {
        type: 'maintenance_route',
        id: req.path,
        name: `${req.method} ${req.path}`
      },
      action: 'error',
      result: 'failure',
      metadata: {
        error: err.message,
        statusCode: err.statusCode,
        maintenanceId: req.params?.maintenanceId,
        maintenanceContext: {
          conflictCheck: req.maintenanceConflictCheck,
          maintenanceId: req.params?.maintenanceId
        },
        critical: err.critical || false
      }
    }, req).catch(auditError => {
      logger.error('Failed to audit maintenance error', {
        auditError: auditError.message
      });
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