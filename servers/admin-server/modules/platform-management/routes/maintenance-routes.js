'use strict';

/**
 * @fileoverview Comprehensive maintenance window and operations management routes
 * @module servers/admin-server/modules/platform-management/routes/maintenance-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/maintenance-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const express = require('express');
const router = express.Router();
const MaintenanceController = require('../controllers/maintenance-controller');
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
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * Advanced rate limiting configurations for comprehensive maintenance operations
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
  
  // Write operations with burst protection and transaction safety
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: 'Maintenance write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Critical maintenance operations requiring combined limiting strategies
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Critical maintenance operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user', 'endpoint'],
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Status check operations with adaptive limiting based on system load
  status: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 120,
    minMax: 30,
    maxMax: 200,
    message: 'Status check rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: true
  },
  
  // Notification operations with cost-based limiting
  notification: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 1000,
    message: 'Notification rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_notifications`
  },
  
  // Analysis and reporting operations with higher cost thresholds
  analysis: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 2000,
    message: 'Analysis operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_analysis`
  },
  
  // Emergency maintenance operations with minimal restrictions but high monitoring
  emergency: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3,
    message: 'Emergency maintenance rate limit exceeded.',
    headers: true,
    onLimitReached: (req, res, options) => {
      logger.warn('Emergency maintenance rate limit reached', {
        ip: req.ip,
        userId: req.user?.id,
        timestamp: new Date()
      });
    }
  },
  
  // Automation and handler operations
  automation: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10,
    message: 'Automation operation rate limit exceeded.',
    headers: true
  },

  // Batch operations with extended windows
  batch: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Batch operation rate limit exceeded.',
    headers: true
  },

  // Export operations with cost-based limiting
  export: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 5000,
    message: 'Export operation cost limit exceeded.',
    headers: true
  }
};

/**
 * Enhanced cost calculator for maintenance operations
 */
const calculateMaintenanceCost = (req) => {
  let cost = 15; // Base cost
  
  // Path-based cost calculation
  const pathCosts = {
    'batch': 100,
    'emergency': 200,
    'impact': 75,
    'analyze': 75,
    'rollback': 150,
    'recovery': 150,
    'report': 50,
    'export': 100,
    'automation': 80,
    'handlers': 60,
    'statistics': 40,
    'validate': 30,
    'clone': 25
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis for additional cost calculation
  if (req.body) {
    // Increase cost based on maintenance window duration
    if (req.body.startTime && req.body.endTime) {
      const duration = new Date(req.body.endTime) - new Date(req.body.startTime);
      const hours = duration / (1000 * 60 * 60);
      if (hours > 4) cost += hours * 10;
    }
    
    // Increase cost for bulk operations
    if (req.body.maintenanceWindows && Array.isArray(req.body.maintenanceWindows)) {
      cost += req.body.maintenanceWindows.length * 25;
    }

    // Increase cost for complex affected services
    if (req.body.affectedServices && Array.isArray(req.body.affectedServices)) {
      cost += req.body.affectedServices.length * 5;
    }

    // Increase cost for recurring maintenance
    if (req.body.pattern && req.body.count) {
      cost += req.body.count * 15;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeAnalytics === 'true') cost += 50;
    if (req.query.includeDetails === 'true') cost += 30;
    if (req.query.includeProjections === 'true') cost += 40;
    if (req.query.includeStatistics === 'true') cost += 35;
    
    // Large date range analysis
    if (req.query.startDate && req.query.endDate) {
      const daysDiff = (new Date(req.query.endDate) - new Date(req.query.startDate)) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) cost += Math.ceil(daysDiff / 30) * 20;
    }

    // Large limit values
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 25;
  }
  
  return Math.min(cost, 10000); // Cap at 10000 to prevent excessive costs
};

/**
 * Enhanced cost calculator for notification operations
 */
const calculateNotificationCost = (req) => {
  let cost = 20; // Base notification cost
  
  // Channel-based cost calculation
  if (req.body && req.body.channels) {
    const channelCosts = {
      'email': 5,
      'sms': 15,
      'webhook': 10,
      'push': 8,
      'slack': 12
    };
    
    req.body.channels.forEach(channel => {
      cost += channelCosts[channel] || 10;
    });
  }
  
  // Recipient-based cost calculation
  if (req.body && req.body.recipients) {
    const recipientCount = Array.isArray(req.body.recipients) ? 
      req.body.recipients.length : 
      (typeof req.body.recipients === 'string' ? req.body.recipients.split(',').length : 1);
    cost += recipientCount * 2;
  }
  
  // Priority-based cost multiplier
  if (req.body && (req.path.includes('emergency') || req.body.priority === 'high' || req.body.priority === 'critical')) {
    cost *= 2;
  }

  // Template complexity cost
  if (req.body && req.body.template && typeof req.body.template === 'object') {
    cost += Object.keys(req.body.template).length * 3;
  }
  
  return Math.min(cost, 5000); // Cap at 5000
};

/**
 * Enhanced maintenance operation logger with comprehensive audit capabilities
 */
const maintenanceOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        maintenanceId: req.params.maintenanceId,
        taskId: req.params.taskId,
        handlerId: req.params.handlerId,
        templateId: req.params.templateId,
        notificationId: req.params.notificationId,
        serviceName: req.params.serviceName,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        userAgent: req.get('user-agent'),
        requestSize: JSON.stringify(req.body || {}).length,
        queryParams: req.query
      };

      logger.info(`Maintenance operation initiated: ${operation}`, operationMetadata);

      // Enhanced audit logging for critical and sensitive maintenance operations
      const criticalOperations = [
        'maintenance-schedule', 'maintenance-schedule-emergency', 'maintenance-schedule-recurring',
        'maintenance-start', 'maintenance-complete', 'maintenance-cancel', 'maintenance-rollback',
        'maintenance-force-complete', 'maintenance-pause', 'maintenance-resume', 'maintenance-extend',
        'recovery-point-create', 'rollback-initiate', 'automation-configure', 'handler-execute',
        'handler-register', 'approval-request', 'emergency-escalate', 'maintenance-delete',
        'batch-schedule', 'system-shutdown', 'service-restart'
      ];

      const sensitiveOperations = [
        'maintenance-rollback', 'maintenance-force-complete', 'handler-execute', 'system-shutdown',
        'emergency-maintenance', 'critical-system-change', 'production-deployment'
      ];

      if (criticalOperations.includes(operation) || sensitiveOperations.includes(operation)) {
        await auditLogEvent({
          event: `maintenance.${operation.replace(/-/g, '_')}`,
          timestamp: operationMetadata.timestamp,
          actor: req.user || { type: 'system', id: 'unknown', role: 'system' },
          resource: {
            type: 'maintenance_window',
            id: req.params.maintenanceId || req.params.handlerId || 'new',
            name: req.params.maintenanceId ? 
              `Maintenance Window ${req.params.maintenanceId}` : 
              `${operation} Operation`
          },
          action: operation,
          result: 'initiated',
          metadata: {
            ...operationMetadata,
            isCritical: criticalOperations.includes(operation),
            isSensitive: sensitiveOperations.includes(operation),
            maintenanceDetails: {
              startTime: req.body?.startTime,
              endTime: req.body?.endTime,
              type: req.body?.type,
              priority: req.body?.priority,
              requiresDowntime: req.body?.requiresDowntime,
              affectedServices: req.body?.affectedServices,
              environment: req.body?.environment
            },
            systemContext: {
              nodeEnv: process.env.NODE_ENV,
              serverTime: new Date(),
              requestId: req.id || req.headers['x-request-id']
            }
          }
        }, req);
      }

      // Store operation context for completion logging
      req.maintenanceOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      logger.error('Failed to log maintenance operation', {
        operation,
        error: error.message,
        stack: error.stack
      });
      next(); // Continue despite logging error
    }
  };
};

/**
 * Enhanced middleware to validate maintenance window access with comprehensive security checks
 */
const validateMaintenanceAccess = async (req, res, next) => {
  try {
    const { maintenanceId, taskId, handlerId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Resource access validation matrix
    const accessValidationRules = {
      'maintenance_execution': {
        allowedRoles: ['admin', 'platform-manager'],
        requiredPermissions: ['maintenance:execute'],
        paths: ['/execute', '/start', '/complete', '/force-complete', '/rollback']
      },
      'maintenance_management': {
        allowedRoles: ['admin', 'platform-manager'],
        requiredPermissions: ['maintenance:manage'],
        paths: ['/schedule', '/update', '/delete', '/cancel', '/extend', '/pause', '/resume']
      },
      'maintenance_handlers': {
        allowedRoles: ['admin'],
        requiredPermissions: ['maintenance:handlers'],
        paths: ['/handlers', '/automation']
      },
      'maintenance_sensitive': {
        allowedRoles: ['admin'],
        requiredPermissions: ['maintenance:sensitive'],
        paths: ['/emergency', '/critical', '/production']
      }
    };

    // Check access rules based on request path
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          logger.warn('Unauthorized maintenance access attempt - insufficient role', {
            maintenanceId,
            taskId,
            handlerId,
            userId,
            userRole,
            requiredRoles: rules.allowedRoles,
            resourceType,
            requestPath: req.path
          });

          await auditLogEvent({
            event: 'authz.access_denied',
            timestamp: new Date().toISOString(),
            actor: req.user,
            resource: {
              type: resourceType,
              id: maintenanceId || taskId || handlerId || 'unknown',
              name: `${resourceType.replace('_', ' ')} - ${req.path}`
            },
            action: 'access_attempt',
            result: 'failure',
            metadata: {
              reason: 'insufficient_role',
              requiredRoles: rules.allowedRoles,
              userRole,
              resourceType,
              requestPath: req.path,
              securityLevel: 'high'
            }
          }, req);
          
          return res.status(403).json({
            success: false,
            message: `Insufficient role permissions for ${resourceType.replace('_', ' ')}`,
            required: rules.allowedRoles
          });
        }

        // Permission-based validation
        const hasRequiredPermissions = rules.requiredPermissions.every(permission =>
          userPermissions.includes(permission)
        );

        if (!hasRequiredPermissions) {
          logger.warn('Unauthorized maintenance access attempt - insufficient permissions', {
            maintenanceId,
            userId,
            userPermissions,
            requiredPermissions: rules.requiredPermissions,
            resourceType
          });

          await auditLogEvent({
            event: 'authz.permission_denied',
            timestamp: new Date().toISOString(),
            actor: req.user,
            resource: {
              type: resourceType,
              id: maintenanceId || taskId || handlerId || 'unknown',
              name: `${resourceType.replace('_', ' ')} - ${req.path}`
            },
            action: 'permission_check',
            result: 'failure',
            metadata: {
              reason: 'insufficient_permissions',
              requiredPermissions: rules.requiredPermissions,
              userPermissions,
              resourceType,
              securityLevel: 'high'
            }
          }, req);
          
          return res.status(403).json({
            success: false,
            message: `Insufficient permissions for ${resourceType.replace('_', ' ')}`,
            required: rules.requiredPermissions
          });
        }
      }
    }

    // Additional validation for specific maintenance operations
    if (req.path.includes('/emergency') && !req.user?.emergencyAccess) {
      logger.warn('Emergency maintenance access denied - no emergency access flag', {
        maintenanceId,
        userId,
        userRole
      });

      return res.status(403).json({
        success: false,
        message: 'Emergency maintenance access requires special authorization'
      });
    }

    // Audit successful access validation
    if (maintenanceId || taskId || handlerId) {
      await auditLogEvent({
        event: 'authz.maintenance_access_validated',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'maintenance_resource',
          id: maintenanceId || taskId || handlerId || 'multiple',
          name: `Maintenance Resource Access - ${req.path}`
        },
        action: 'access_validation',
        result: 'success',
        metadata: {
          maintenanceId,
          taskId,
          handlerId,
          userId,
          userRole,
          requestPath: req.path,
          accessLevel: 'granted',
          validationTime: new Date()
        }
      }, req);
    }
    
    logger.debug('Maintenance access validated successfully', {
      maintenanceId,
      taskId,
      handlerId,
      userId,
      userRole
    });
    
    next();
  } catch (error) {
    logger.error('Failed to validate maintenance access', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      path: req.path
    });
    
    // Fail securely - deny access on validation error
    return res.status(500).json({
      success: false,
      message: 'Access validation failed'
    });
  }
};

/**
 * Enhanced middleware to check maintenance window conflicts with comprehensive analysis
 */
const checkMaintenanceConflicts = async (req, res, next) => {
  try {
    const conflictCheckId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (req.body.startTime && req.body.endTime) {
      const conflictCheckData = {
        conflictCheckId,
        startTime: new Date(req.body.startTime),
        endTime: new Date(req.body.endTime),
        maintenanceType: req.body.type,
        priority: req.body.priority,
        affectedServices: req.body.affectedServices || [],
        environment: req.body.environment,
        requiresDowntime: req.body.requiresDowntime,
        checkPerformed: true,
        checkTimestamp: new Date()
      };

      req.maintenanceConflictCheck = conflictCheckData;

      // Validate time window integrity
      if (conflictCheckData.startTime >= conflictCheckData.endTime) {
        logger.warn('Invalid maintenance time window detected', conflictCheckData);
        
        return res.status(400).json({
          success: false,
          message: 'End time must be after start time',
          conflictCheckId
        });
      }

      // Check for reasonable duration limits
      const duration = conflictCheckData.endTime - conflictCheckData.startTime;
      const maxDuration = 24 * 60 * 60 * 1000; // 24 hours
      
      if (duration > maxDuration) {
        logger.warn('Maintenance window exceeds maximum duration', {
          ...conflictCheckData,
          duration,
          maxDuration
        });
        
        return res.status(400).json({
          success: false,
          message: 'Maintenance window cannot exceed 24 hours',
          conflictCheckId
        });
      }

      // Audit conflict check initiation
      await auditLogEvent({
        event: 'maintenance.conflict_check_started',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'maintenance_conflict_check',
          id: conflictCheckId,
          name: 'Maintenance Window Conflict Check'
        },
        action: 'conflict_check',
        result: 'initiated',
        metadata: {
          conflictCheckId,
          requestedStartTime: req.body.startTime,
          requestedEndTime: req.body.endTime,
          maintenanceType: req.body.type,
          environment: req.body.environment,
          duration,
          affectedServicesCount: (req.body.affectedServices || []).length,
          checksPerformed: ['time_integrity', 'duration_limits']
        }
      }, req);
    }
    
    next();
  } catch (error) {
    logger.error('Failed to check maintenance conflicts', {
      error: error.message,
      stack: error.stack
    });
    next(); // Continue despite conflict check error
  }
};

/**
 * Enhanced middleware to validate maintenance window timing with business rules
 */
const validateMaintenanceTiming = async (req, res, next) => {
  try {
    const { startTime, endTime, type } = req.body;
    
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const now = new Date();
      
      let validationResult = 'success';
      let validationError = null;
      let validationWarnings = [];
      let businessRuleViolations = [];
      
      // Basic time validation
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        validationResult = 'failure';
        validationError = 'Invalid date format provided';
      } else if (start < now && type !== 'emergency') {
        validationResult = 'failure';
        validationError = 'Maintenance start time cannot be in the past (except for emergency maintenance)';
      } else if (end <= start) {
        validationResult = 'failure';
        validationError = 'Maintenance end time must be after start time';
      } else {
        // Advanced validation rules
        const duration = end - start;
        const maxDuration = 24 * 60 * 60 * 1000; // 24 hours
        const minDuration = 15 * 60 * 1000; // 15 minutes
        
        if (duration > maxDuration) {
          validationResult = 'failure';
          validationError = 'Maintenance window cannot exceed 24 hours';
        } else if (duration < minDuration) {
          validationWarnings.push('Maintenance window is less than 15 minutes');
        }

        // Business hours validation
        const startHour = start.getHours();
        const startDay = start.getDay();
        const isWeekend = startDay === 0 || startDay === 6;
        const isBusinessHours = startHour >= 9 && startHour < 17 && !isWeekend;

        if (isBusinessHours && req.body.requiresDowntime && type !== 'emergency') {
          validationWarnings.push('Maintenance requiring downtime scheduled during business hours');
          businessRuleViolations.push('BUSINESS_HOURS_DOWNTIME');
        }

        // Lead time validation
        const leadTime = start - now;
        const minLeadTime = {
          'scheduled': 24 * 60 * 60 * 1000, // 24 hours
          'recurring': 48 * 60 * 60 * 1000, // 48 hours
          'hotfix': 2 * 60 * 60 * 1000, // 2 hours
          'emergency': 0 // No lead time required
        };

        const requiredLeadTime = minLeadTime[type] || minLeadTime['scheduled'];
        if (leadTime < requiredLeadTime && type !== 'emergency') {
          validationWarnings.push(`Insufficient lead time for ${type} maintenance (minimum ${requiredLeadTime / (1000 * 60 * 60)} hours)`);
          businessRuleViolations.push('INSUFFICIENT_LEAD_TIME');
        }

        // Holiday and weekend preferences
        if (isWeekend && type === 'scheduled' && !req.body.weekendApproved) {
          validationWarnings.push('Weekend maintenance should have explicit approval');
        }
      }

      // Store timing validation results
      req.maintenanceTimingValidation = {
        validationResult,
        validationError,
        validationWarnings,
        businessRuleViolations,
        duration: end - start,
        leadTime: start - now,
        businessHours: {
          startsInBusinessHours: start.getHours() >= 9 && start.getHours() < 17 && start.getDay() >= 1 && start.getDay() <= 5,
          isWeekend: start.getDay() === 0 || start.getDay() === 6
        }
      };

      // Audit timing validation
      await auditLogEvent({
        event: 'maintenance.timing_validation',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'maintenance_timing',
          id: 'timing_validation',
          name: 'Maintenance Window Timing Validation'
        },
        action: 'timing_validation',
        result: validationResult,
        metadata: {
          startTime,
          endTime,
          duration: end - start,
          leadTime: start - now,
          maintenanceType: type,
          validationError,
          validationWarnings,
          businessRuleViolations,
          businessHoursAnalysis: req.maintenanceTimingValidation.businessHours
        }
      }, req);
      
      if (validationResult === 'failure') {
        return res.status(400).json({
          success: false,
          message: validationError,
          validationDetails: req.maintenanceTimingValidation
        });
      }

      // Log warnings but continue
      if (validationWarnings.length > 0) {
        logger.warn('Maintenance timing validation warnings', {
          warnings: validationWarnings,
          businessRuleViolations,
          maintenanceType: type
        });
      }
    }
    
    next();
  } catch (error) {
    logger.error('Failed to validate maintenance timing', {
      error: error.message,
      stack: error.stack
    });
    next(); // Continue despite validation error
  }
};

/**
 * Enhanced middleware to audit operation completion with detailed metrics
 */
const auditOperationComplete = (operation) => {
  return async (req, res, next) => {
    try {
      const originalSend = res.send;
      const operationStartTime = req.maintenanceOperationContext?.startTime || Date.now();
      
      res.send = function(body) {
        const operationEndTime = Date.now();
        const operationDuration = operationEndTime - operationStartTime;
        
        // Determine operation result based on response
        const result = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
        const resultCategory = Math.floor(res.statusCode / 100) * 100; // 200, 400, 500, etc.
        
        // Parse response body for additional metrics
        let responseData = null;
        let responseMetrics = {};
        
        try {
          if (body && typeof body === 'string') {
            responseData = JSON.parse(body);
            
            // Extract response metrics based on operation type
            switch (operation) {
              case 'maintenance-schedule':
                responseMetrics = {
                  maintenanceId: responseData.data?.id,
                  scheduledFor: responseData.data?.startTime,
                  duration: responseData.metadata?.estimatedDuration
                };
                break;
              case 'batch-schedule':
                responseMetrics = {
                  batchId: responseData.data?.batchId,
                  successful: responseData.data?.summary?.successful,
                  failed: responseData.data?.summary?.failed
                };
                break;
              case 'maintenance-statistics':
                responseMetrics = {
                  totalMaintenance: responseData.data?.overview?.total,
                  completionRate: responseData.data?.compliance?.completionRate
                };
                break;
            }
          }
        } catch (parseError) {
          logger.debug('Could not parse response body for metrics', {
            operation,
            parseError: parseError.message
          });
        }
        
        // Log operation completion with comprehensive metrics
        const completionData = {
          event: `maintenance.${operation.replace(/-/g, '_')}_complete`,
          timestamp: new Date().toISOString(),
          actor: req.user || { type: 'system', id: 'unknown' },
          resource: {
            type: 'maintenance_operation',
            id: req.params.maintenanceId || req.params.handlerId || 'operation',
            name: req.params.maintenanceId ? 
              `Maintenance Window ${req.params.maintenanceId}` : 
              `${operation} Operation`
          },
          action: `${operation}_complete`,
          result: result,
          metadata: {
            operation,
            statusCode: res.statusCode,
            resultCategory,
            operationDuration,
            responseSize: body ? body.length : 0,
            maintenanceId: req.params.maintenanceId,
            taskId: req.params.taskId,
            handlerId: req.params.handlerId,
            templateId: req.params.templateId,
            conflictCheck: req.maintenanceConflictCheck,
            timingValidation: req.maintenanceTimingValidation,
            responseMetrics,
            performance: {
              operationDurationMs: operationDuration,
              responseTimeCategory: operationDuration < 1000 ? 'fast' : 
                                   operationDuration < 5000 ? 'normal' : 'slow',
              memoryUsage: process.memoryUsage(),
              timestamp: operationEndTime
            },
            request: {
              method: req.method,
              path: req.path,
              queryParams: Object.keys(req.query || {}).length,
              bodySize: JSON.stringify(req.body || {}).length,
              userAgent: req.get('user-agent'),
              contentType: req.get('content-type')
            }
          }
        };

        // Enhanced audit logging for critical operations
        auditLogEvent(completionData, req).catch(error => {
          logger.error('Failed to log maintenance operation completion audit', {
            error: error.message,
            operation,
            operationDuration,
            statusCode: res.statusCode
          });
        });

        // Performance monitoring alerts
        if (operationDuration > 30000) { // 30 seconds
          logger.warn('Slow maintenance operation detected', {
            operation,
            duration: operationDuration,
            statusCode: res.statusCode,
            maintenanceId: req.params.maintenanceId
          });
        }

        // Error rate monitoring
        if (res.statusCode >= 500) {
          logger.error('Maintenance operation server error', {
            operation,
            statusCode: res.statusCode,
            duration: operationDuration,
            error: responseData?.message || 'Unknown server error'
          });
        }
        
        return originalSend.call(this, body);
      };
      
      next();
    } catch (error) {
      logger.error('Failed to setup audit operation complete', {
        error: error.message,
        operation
      });
      next();
    }
  };
};

/**
 * Enhanced custom rate limiter for sensitive maintenance operations
 */
const sensitiveMaintenanceLimit = customLimit('sensitive_maintenance', (req) => {
  // Define sensitive maintenance endpoints with granular controls
  const sensitiveEndpoints = [
    { pattern: '/start', max: 3, window: 30 },
    { pattern: '/complete', max: 3, window: 30 },
    { pattern: '/cancel', max: 2, window: 30 },
    { pattern: '/force-complete', max: 1, window: 60 },
    { pattern: '/rollback', max: 1, window: 60 },
    { pattern: '/emergency', max: 2, window: 15 },
    { pattern: '/execute', max: 2, window: 30 },
    { pattern: '/handlers/execute', max: 1, window: 60 },
    { pattern: '/automation', max: 3, window: 60 },
    { pattern: '/recovery', max: 1, window: 60 }
  ];
  
  // Find matching sensitive endpoint
  const matchedEndpoint = sensitiveEndpoints.find(endpoint => 
    req.path.includes(endpoint.pattern)
  );
  
  if (matchedEndpoint) {
    const config = {
      windowMs: matchedEndpoint.window * 60 * 1000,
      max: matchedEndpoint.max,
      message: `Sensitive maintenance operation rate limit exceeded for ${matchedEndpoint.pattern}`,
      headers: true,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `${req.ip}_${req.user?.id}_sensitive_${matchedEndpoint.pattern}`,
      handler: (req, res) => {
        logger.warn('Sensitive maintenance operation rate limit exceeded', {
          endpoint: matchedEndpoint.pattern,
          ip: req.ip,
          userId: req.user?.id,
          limit: matchedEndpoint.max,
          window: matchedEndpoint.window
        });
        
        res.status(429).json({
          success: false,
          message: `Rate limit exceeded for sensitive operation: ${matchedEndpoint.pattern}`,
          retryAfter: matchedEndpoint.window * 60,
          limit: matchedEndpoint.max
        });
      }
    };
    
    return config;
  }
  
  return null; // Skip if not sensitive
}, {});

/**
 * Apply comprehensive global middleware to all maintenance routes
 */
router.use(authenticate);
router.use(requestSanitizer({
  // Enhanced sanitization for maintenance-specific fields
  sanitizeFields: ['description', 'notes', 'reason', 'summary'],
  removeFields: ['password', 'token', 'apiKey', 'credentials'],
  maxDepth: 10,
  maxKeys: 100
}));
router.use(auditMiddleware({
  service: 'maintenance-management',
  includeBody: true,
  includeQuery: true,
  includeHeaders: ['user-agent', 'x-forwarded-for', 'authorization'],
  sensitiveFields: ['password', 'token', 'apiKey', 'credentials', 'handler', 'webhook'],
  maxBodySize: 50000, // 50KB
  skip: (req) => {
    // Skip audit logging for high-frequency, low-impact status endpoints
    const skipPaths = ['/status', '/readiness', '/availability'];
    return req.method === 'GET' && 
           skipPaths.some(path => req.path.endsWith(path)) &&
           !req.path.includes('detailed') &&
           !req.query.includeDetails;
  },
  onLog: (logData) => {
    // Additional processing for critical maintenance audit logs
    if (logData.metadata?.isCritical) {
      logger.info('Critical maintenance operation audited', {
        event: logData.event,
        actor: logData.actor?.id,
        resource: logData.resource?.id
      });
    }
  }
}));

/**
 * ===============================================================================
 * MAINTENANCE WINDOW SCHEDULING ROUTES
 * Comprehensive routes for scheduling various types of maintenance windows
 * ===============================================================================
 */

// Schedule new standard maintenance window
router.post(
  '/schedule',
  authorize(['admin', 'platform-manager']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  maintenanceOperationLogger('maintenance-schedule'),
  auditOperationComplete('maintenance-schedule'),
  MaintenanceController.scheduleMaintenanceWindow
);

// Schedule recurring maintenance with advanced patterns
router.post(
  '/schedule/recurring',
  authorize(['admin', 'platform-manager']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-schedule-recurring'),
  auditOperationComplete('maintenance-schedule-recurring'),
  MaintenanceController.scheduleRecurringMaintenance
);

// Schedule emergency maintenance with immediate escalation
router.post(
  '/schedule/emergency',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.emergency),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-schedule-emergency'),
  auditOperationComplete('maintenance-schedule-emergency'),
  MaintenanceController.scheduleEmergencyMaintenance
);

// Reschedule existing maintenance window
router.put(
  '/:maintenanceId/reschedule',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  maintenanceOperationLogger('maintenance-reschedule'),
  auditOperationComplete('maintenance-reschedule'),
  MaintenanceController.rescheduleMaintenanceWindow
);

// Batch schedule multiple maintenance windows
router.post(
  '/schedule/batch',
  authorize(['admin']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.batch),
  maintenanceOperationLogger('maintenance-batch-schedule'),
  auditOperationComplete('maintenance-batch-schedule'),
  MaintenanceController.batchScheduleMaintenance
);

/**
 * ===============================================================================
 * MAINTENANCE WINDOW QUERY ROUTES
 * Comprehensive routes for querying and filtering maintenance windows
 * ===============================================================================
 */

// Get active maintenance windows with detailed filtering
router.get(
  '/active',
  authorize(['admin', 'platform-manager', 'viewer', 'user']),
  adaptiveLimit(RATE_LIMITS.status),
  MaintenanceController.getActiveMaintenanceWindows
);

// Get scheduled maintenance windows with pagination and sorting
router.get(
  '/scheduled',
  authorize(['admin', 'platform-manager', 'viewer']),
  adaptiveLimit(RATE_LIMITS.read),
  MaintenanceController.getScheduledMaintenanceWindows
);

// Get upcoming maintenance windows within specified timeframe
router.get(
  '/upcoming',
  authorize(['admin', 'platform-manager', 'viewer', 'user']),
  adaptiveLimit(RATE_LIMITS.read),
  MaintenanceController.getUpcomingMaintenanceWindows
);

// Get comprehensive maintenance history with analytics
router.get(
  '/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceHistory
);

// Get maintenance calendar view by month/year
router.get(
  '/calendar',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceCalendar
);

// Advanced search maintenance windows
router.get(
  '/search',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  MaintenanceController.searchMaintenanceWindows
);

// Get maintenance windows by type
router.get(
  '/type/:type',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByEndpoint(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceByType
);

// Get maintenance windows by status
router.get(
  '/status/:status',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByEndpoint(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceByStatus
);

// Get maintenance windows by affected service
router.get(
  '/service/:serviceName',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByEndpoint(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceByService
);

// Get maintenance windows by date range
router.get(
  '/range',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  MaintenanceController.getMaintenanceByDateRange
);

/**
 * ===============================================================================
 * MAINTENANCE WINDOW STATUS ROUTES
 * Real-time status checking and monitoring routes
 * ===============================================================================
 */

// Check overall maintenance status (public endpoint with lighter auth)
router.get(
  '/status',
  adaptiveLimit(RATE_LIMITS.status),
  MaintenanceController.checkMaintenanceStatus
);

// Get detailed maintenance status with system metrics
router.get(
  '/status/detailed',
  authorize(['admin', 'platform-manager', 'viewer']),
  adaptiveLimit(RATE_LIMITS.status),
  MaintenanceController.getDetailedMaintenanceStatus
);

// Get system maintenance readiness assessment
router.get(
  '/readiness',
  authorize(['admin', 'platform-manager']),
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceReadiness
);

// Check service availability during maintenance
router.get(
  '/availability/:serviceName',
  limitByEndpoint(RATE_LIMITS.status),
  MaintenanceController.checkServiceAvailability
);

/**
 * ===============================================================================
 * MAINTENANCE WINDOW MANAGEMENT ROUTES
 * CRUD operations for individual maintenance windows
 * ===============================================================================
 */

// Get specific maintenance window with comprehensive details
router.get(
  '/:maintenanceId',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceWindow
);

// Update maintenance window with validation and conflict checking
router.put(
  '/:maintenanceId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  maintenanceOperationLogger('maintenance-update'),
  auditOperationComplete('maintenance-update'),
  MaintenanceController.updateMaintenanceWindow
);

// Update maintenance window metadata only
router.patch(
  '/:maintenanceId/metadata',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-metadata-update'),
  auditOperationComplete('maintenance-metadata-update'),
  MaintenanceController.updateMaintenanceMetadata
);

// Delete maintenance window with comprehensive cleanup
router.delete(
  '/:maintenanceId',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-delete'),
  auditOperationComplete('maintenance-delete'),
  MaintenanceController.deleteMaintenanceWindow
);

// Clone maintenance window with customizable parameters
router.post(
  '/:maintenanceId/clone',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  validateMaintenanceTiming,
  checkMaintenanceConflicts,
  maintenanceOperationLogger('maintenance-clone'),
  auditOperationComplete('maintenance-clone'),
  MaintenanceController.cloneMaintenanceWindow
);

/**
 * ===============================================================================
 * MAINTENANCE WINDOW EXECUTION ROUTES
 * Critical routes for executing maintenance operations
 * ===============================================================================
 */

// Start maintenance window with pre-execution checks
router.post(
  '/:maintenanceId/start',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-start'),
  auditOperationComplete('maintenance-start'),
  MaintenanceController.startMaintenanceWindow
);

// Complete maintenance window with post-execution tasks
router.post(
  '/:maintenanceId/complete',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-complete'),
  auditOperationComplete('maintenance-complete'),
  MaintenanceController.completeMaintenanceWindow
);

// Cancel maintenance window with notification and cleanup
router.post(
  '/:maintenanceId/cancel',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-cancel'),
  auditOperationComplete('maintenance-cancel'),
  MaintenanceController.cancelMaintenanceWindow
);

// Extend maintenance window with conflict validation
router.post(
  '/:maintenanceId/extend',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('maintenance-extend'),
  auditOperationComplete('maintenance-extend'),
  MaintenanceController.extendMaintenanceWindow
);

// Pause maintenance window with state preservation
router.post(
  '/:maintenanceId/pause',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-pause'),
  auditOperationComplete('maintenance-pause'),
  MaintenanceController.pauseMaintenanceWindow
);

// Resume paused maintenance window
router.post(
  '/:maintenanceId/resume',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-resume'),
  auditOperationComplete('maintenance-resume'),
  MaintenanceController.resumeMaintenanceWindow
);

// Force complete maintenance window (emergency override)
router.post(
  '/:maintenanceId/force-complete',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-force-complete'),
  auditOperationComplete('maintenance-force-complete'),
  MaintenanceController.forceCompleteMaintenanceWindow
);

// Rollback maintenance window (disaster recovery)
router.post(
  '/:maintenanceId/rollback',
  authorize(['admin']),
  validateMaintenanceAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveMaintenanceLimit,
  maintenanceOperationLogger('maintenance-rollback'),
  auditOperationComplete('maintenance-rollback'),
  MaintenanceController.rollbackMaintenanceWindow
);

/**
 * ===============================================================================
 * MAINTENANCE TASKS AND ACTIVITIES ROUTES
 * Routes for managing maintenance tasks and activity logs
 * ===============================================================================
 */

// Add task to maintenance window
router.post(
  '/:maintenanceId/tasks',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-add'),
  auditOperationComplete('task-add'),
  MaintenanceController.addMaintenanceTask
);

// Get all tasks for maintenance window
router.get(
  '/:maintenanceId/tasks',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceTasks
);

// Update specific maintenance task
router.put(
  '/:maintenanceId/tasks/:taskId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-update'),
  auditOperationComplete('task-update'),
  MaintenanceController.updateMaintenanceTask
);

// Complete maintenance task
router.post(
  '/:maintenanceId/tasks/:taskId/complete',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-complete'),
  auditOperationComplete('task-complete'),
  MaintenanceController.completeMaintenanceTask
);

// Delete maintenance task
router.delete(
  '/:maintenanceId/tasks/:taskId',
  authorize(['admin']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('task-delete'),
  auditOperationComplete('task-delete'),
  MaintenanceController.deleteMaintenanceTask
);

// Get maintenance activity log
router.get(
  '/:maintenanceId/activities',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceActivities
);

// Add maintenance activity entry
router.post(
  '/:maintenanceId/activities',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('activity-add'),
  auditOperationComplete('activity-add'),
  MaintenanceController.addMaintenanceActivity
);

/**
 * ===============================================================================
 * MAINTENANCE IMPACT ANALYSIS ROUTES
 * Advanced routes for analyzing maintenance impact and dependencies
 * ===============================================================================
 */

// Get comprehensive maintenance impact analysis
router.get(
  '/:maintenanceId/impact',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  MaintenanceController.getMaintenanceImpactAnalysis
);

// Analyze maintenance impact with custom parameters
router.post(
  '/:maintenanceId/impact/analyze',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  maintenanceOperationLogger('impact-analyze'),
  auditOperationComplete('impact-analyze'),
  MaintenanceController.analyzeMaintenanceImpact
);

// Get affected services list
router.get(
  '/:maintenanceId/affected-services',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getAffectedServices
);

// Get affected users analysis
router.get(
  '/:maintenanceId/affected-users',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  MaintenanceController.getAffectedUsers
);

// Get maintenance dependencies mapping
router.get(
  '/:maintenanceId/dependencies',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getMaintenanceDependencies
);

// Get comprehensive risk assessment
router.get(
  '/:maintenanceId/risk-assessment',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  MaintenanceController.getMaintenanceRiskAssessment
);

/**
 * ===============================================================================
 * MAINTENANCE VALIDATION ROUTES
 * Routes for validating maintenance configurations and prerequisites
 * ===============================================================================
 */

// Validate maintenance window configuration
router.post(
  '/validate',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  MaintenanceController.validateMaintenanceWindow
);

// Check for maintenance scheduling conflicts
router.post(
  '/conflicts/check',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  MaintenanceController.checkMaintenanceConflicts
);

// Validate maintenance prerequisites
router.post(
  '/:maintenanceId/prerequisites/validate',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  maintenanceOperationLogger('prerequisites-validate'),
  auditOperationComplete('prerequisites-validate'),
  MaintenanceController.validatePrerequisites
);

// Test maintenance procedures
router.post(
  '/:maintenanceId/procedures/test',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  maintenanceOperationLogger('procedures-test'),
  auditOperationComplete('procedures-test'),
  MaintenanceController.testMaintenanceProcedures
);

// Dry run maintenance execution
router.post(
  '/:maintenanceId/dry-run',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.default),
  maintenanceOperationLogger('maintenance-dry-run'),
  auditOperationComplete('maintenance-dry-run'),
  MaintenanceController.dryRunMaintenance
);

/**
 * ===============================================================================
 * MAINTENANCE NOTIFICATION ROUTES
 * Comprehensive notification management for maintenance operations
 * ===============================================================================
 */

// Send immediate maintenance notifications
router.post(
  '/:maintenanceId/notify',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateNotificationCost, RATE_LIMITS.notification),
  maintenanceOperationLogger('notifications-send'),
  async (req, res, next) => {
    try {
      // Enhanced audit logging for notification sending
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
          priority: req.body?.priority || 'normal',
          notificationType: req.body?.type || 'general',
          templateId: req.body?.templateId,
          scheduled: req.body?.scheduled || false,
          cost: calculateNotificationCost(req)
        }
      }, req);
      
      return MaintenanceController.sendMaintenanceNotifications(req, res, next);
    } catch (error) {
      logger.error('Failed to send maintenance notifications', {
        error: error.message,
        maintenanceId: req.params.maintenanceId
      });
      next(error);
    }
  }
);

// Schedule maintenance notifications
router.post(
  '/:maintenanceId/notify/schedule',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  costBasedLimit(calculateNotificationCost, RATE_LIMITS.notification),
  maintenanceOperationLogger('notifications-schedule'),
  auditOperationComplete('notifications-schedule'),
  MaintenanceController.scheduleNotifications
);

// Get notification history for maintenance window
router.get(
  '/:maintenanceId/notifications',
  authorize(['admin', 'platform-manager', 'viewer']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getNotificationHistory
);

// Cancel scheduled notification
router.delete(
  '/:maintenanceId/notify/:notificationId',
  authorize(['admin', 'platform-manager']),
  validateMaintenanceAccess,
  limitByUser(RATE_LIMITS.notification),
  maintenanceOperationLogger('notification-cancel'),
  auditOperationComplete('notification-cancel'),
  MaintenanceController.cancelScheduledNotification
);

// Get available notification templates
router.get(
  '/templates/notifications',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getNotificationTemplates
);

// Create new notification template
router.post(
  '/templates/notifications',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('template-create'),
  auditOperationComplete('template-create'),
  MaintenanceController.createNotificationTemplate
);

// Update notification template
router.put(
  '/templates/notifications/:templateId',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('template-update'),
  auditOperationComplete('template-update'),
  MaintenanceController.updateNotificationTemplate
);

// Delete notification template
router.delete(
  '/templates/notifications/:templateId',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  maintenanceOperationLogger('template-delete'),
  auditOperationComplete('template-delete'),
  MaintenanceController.deleteNotificationTemplate
);

/**
 * ===============================================================================
 * MAINTENANCE REPORTING AND ANALYTICS ROUTES
 * Comprehensive reporting and statistical analysis routes
 * ===============================================================================
 */

// Get comprehensive maintenance statistics
router.get(
  '/statistics',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  MaintenanceController.getMaintenanceStatistics
);

// Generate comprehensive maintenance report
router.get(
  '/report',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.analysis),
  async (req, res, next) => {
    try {
      // Enhanced audit logging for report generation
      await auditLogEvent({
        event: 'maintenance.report_generated',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'maintenance_report',
          id: `report_${Date.now()}`,
          name: 'Comprehensive Maintenance Report'
        },
        action: 'generate_report',
        result: 'initiated',
        metadata: {
          reportType: 'comprehensive_maintenance',
          parameters: req.query,
          requestedFormat: req.query.format || 'json',
          includeStatistics: req.query.includeStatistics !== 'false',
          includeDetails: req.query.includeDetails !== 'false',
          dateRange: {
            startDate: req.query.startDate,
            endDate: req.query.endDate
          },
          cost: calculateMaintenanceCost(req)
        }
      }, req);
      
      return MaintenanceController.createMaintenanceReport(req, res, next);
    } catch (error) {
      logger.error('Failed to create maintenance report', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }
);

// Export maintenance schedule in various formats
router.get(
  '/export',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(calculateMaintenanceCost, RATE_LIMITS.export),
  async (req, res, next) => {
    try {
      // Enhanced audit logging for schedule export
      await auditLogEvent({
        event: 'data.export',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'maintenance_schedule',
          id: 'schedule_export',
          name: 'Maintenance Schedule Export'
        },
        action: 'export',
        result: 'initiated',
        metadata: {
          exportType: 'maintenance_schedule',
          format: req.query.format || 'json',
          environment: req.query.environment || 'all',
          dateRange: {
            startDate: req.query.startDate,
            endDate: req.query.endDate
          },
          cost: calculateMaintenanceCost(req),
          expectedSize: 'varies'
        }
      }, req);
      
      return MaintenanceController.exportMaintenanceSchedule(req, res, next);
    } catch (error) {
      logger.error('Failed to export maintenance schedule', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }
);

/**
 * ===============================================================================
 * MAINTENANCE HANDLER MANAGEMENT ROUTES
 * Routes for managing maintenance automation and handlers
 * ===============================================================================
 */

// Register new maintenance handler
router.post(
  '/handlers',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.automation),
  maintenanceOperationLogger('handler-register'),
  auditOperationComplete('handler-register'),
  MaintenanceController.registerMaintenanceHandler
);

// Get all registered maintenance handlers
router.get(
  '/handlers',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  MaintenanceController.getRegisteredHandlers
);

/**
 * ===============================================================================
 * COMPREHENSIVE ERROR HANDLING MIDDLEWARE
 * Enhanced error handling with detailed logging and user-friendly responses
 * ===============================================================================
 */
router.use((err, req, res, next) => {
  const errorContext = {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    maintenanceId: req.params?.maintenanceId,
    taskId: req.params?.taskId,
    handlerId: req.params?.handlerId,
    userId: req.user?.id,
    userRole: req.user?.role,
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'],
    userAgent: req.get('user-agent'),
    ip: req.ip
  };

  logger.error('Maintenance management route error', errorContext);

  // Enhanced audit logging for maintenance management errors
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
        ...errorContext,
        errorType: err.constructor.name,
        statusCode: err.statusCode || 500,
        maintenanceContext: {
          conflictCheck: req.maintenanceConflictCheck,
          timingValidation: req.maintenanceTimingValidation,
          operationContext: req.maintenanceOperationContext
        },
        critical: err.critical || false,
        severity: err.statusCode >= 500 ? 'high' : 'medium',
        errorCode: err.code,
        systemInfo: {
          nodeEnv: process.env.NODE_ENV,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      }
    }, req).catch(auditError => {
      logger.error('Failed to audit maintenance error', {
        auditError: auditError.message,
        originalError: err.message
      });
    });
  }

  // Enhanced error response based on error type and context
  const errorResponses = {
    // Maintenance-specific error codes
    'MAINTENANCE_CONFLICT': {
      status: 409,
      message: 'Maintenance window conflicts with existing schedule',
      data: { conflicts: err.conflicts }
    },
    'MAINTENANCE_IN_PROGRESS': {
      status: 423,
      message: 'Cannot perform operation while maintenance is in progress',
      data: { maintenanceId: err.maintenanceId, status: err.currentStatus }
    },
    'MAINTENANCE_NOT_FOUND': {
      status: 404,
      message: 'Maintenance window not found',
      data: { maintenanceId: err.maintenanceId }
    },
    'MAINTENANCE_ACCESS_DENIED': {
      status: 403,
      message: 'Access denied for maintenance operation',
      data: { operation: err.operation, required: err.requiredPermissions }
    },
    'MAINTENANCE_VALIDATION_FAILED': {
      status: 400,
      message: 'Maintenance validation failed',
      data: { errors: err.validationErrors, warnings: err.validationWarnings }
    },
    'MAINTENANCE_TIMING_INVALID': {
      status: 400,
      message: 'Invalid maintenance timing configuration',
      data: { timingErrors: err.timingErrors }
    },
    'MAINTENANCE_HANDLER_ERROR': {
      status: 500,
      message: 'Maintenance handler execution failed',
      data: { handler: err.handlerName, task: err.taskName }
    },
    'MAINTENANCE_ROLLBACK_FAILED': {
      status: 500,
      message: 'Maintenance rollback operation failed',
      data: { rollbackSteps: err.rollbackSteps, failedAt: err.failedAt }
    }
  };

  // Check for specific maintenance error codes
  if (err.code && errorResponses[err.code]) {
    const errorResponse = errorResponses[err.code];
    return res.status(errorResponse.status).json({
      success: false,
      error: {
        code: err.code,
        message: errorResponse.message,
        timestamp: new Date().toISOString(),
        requestId: req.id || req.headers['x-request-id'],
        ...errorResponse.data
      }
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.details || err.message,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handle rate limiting errors
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: err.message || 'Rate limit exceeded',
        retryAfter: err.retryAfter,
        limit: err.limit,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handle authentication/authorization errors
  if (err.status === 401 || err.status === 403) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'AUTHORIZATION_FAILED',
        message: err.message || (err.status === 401 ? 'Authentication required' : 'Access denied'),
        timestamp: new Date().toISOString()
      }
    });
  }

  // Generic error handling with environment-specific details
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An internal server error occurred',
      timestamp: new Date().toISOString(),
      requestId: req.id || req.headers['x-request-id'],
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

// Export comprehensive maintenance routes
module.exports = router;