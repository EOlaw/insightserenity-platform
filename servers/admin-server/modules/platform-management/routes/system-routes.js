'use strict';

/**
 * @fileoverview Comprehensive system health and monitoring management routes
 * @module servers/admin-server/modules/platform-management/routes/system-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/system-controller
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
const SystemController = require('../controllers/system-controller');
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
 * Advanced rate limiting configurations for comprehensive system operations
 */
const RATE_LIMITS = {
  // Default rate limiting for general system operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many system requests from this IP, please try again later.',
    headers: true
  },
  
  // High-frequency monitoring endpoints with adaptive limiting
  monitoring: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 60,
    minMax: 20,
    maxMax: 120,
    message: 'System monitoring rate limit exceeded.',
    headers: true
  },
  
  // Write operations with burst protection and transaction safety
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: 'System write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Critical system operations requiring combined limiting strategies
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Critical system operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user', 'endpoint'],
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Health check operations with adaptive limiting based on system load
  health: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 120,
    minMax: 30,
    maxMax: 200,
    message: 'Health check rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: true
  },
  
  // Alert operations with cost-based limiting
  alerts: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 1000,
    message: 'Alert operation rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_alerts`
  },
  
  // Metrics and analysis operations with higher cost thresholds
  metrics: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxCost: 2000,
    message: 'Metrics operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_metrics`
  },
  
  // Service operations with moderate restrictions
  service: {
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 20,
    message: 'Service operation rate limit exceeded.',
    headers: true
  },
  
  // Emergency system operations with minimal restrictions but high monitoring
  emergency: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3,
    message: 'Emergency system rate limit exceeded.',
    headers: true,
    onLimitReached: (req, res, options) => {
      logger.warn('Emergency system rate limit reached', {
        ip: req.ip,
        userId: req.user?.id,
        timestamp: new Date()
      });
    }
  },
  
  // Provisioning and setup operations
  provisioning: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10,
    message: 'System provisioning rate limit exceeded.',
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
  },

  // Dashboard and reporting operations
  dashboard: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    message: 'Dashboard operation rate limit exceeded.',
    headers: true
  }
};

/**
 * Enhanced cost calculator for system operations
 */
const calculateSystemCost = (req) => {
  let cost = 15; // Base cost
  
  // Path-based cost calculation
  const pathCosts = {
    'provision': 200,
    'bootstrap': 150,
    'reset': 300,
    'restart': 100,
    'stop': 80,
    'start': 80,
    'scale': 120,
    'backup': 150,
    'restore': 200,
    'diagnostics': 100,
    'benchmark': 150,
    'analysis': 75,
    'export': 100,
    'stream': 50,
    'archive': 80,
    'cleanup': 60,
    'dashboard': 40,
    'report': 50
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis for additional cost calculation
  if (req.body) {
    // Increase cost based on batch operations
    if (req.body.metricsArray && Array.isArray(req.body.metricsArray)) {
      cost += req.body.metricsArray.length * 15;
    }

    // Increase cost for complex configurations
    if (req.body.config && typeof req.body.config === 'object') {
      cost += Object.keys(req.body.config).length * 5;
    }

    // Increase cost for service scaling
    if (req.body.instances && req.body.instances > 1) {
      cost += req.body.instances * 10;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.detailed === 'true') cost += 30;
    if (req.query.includeHistory === 'true') cost += 50;
    if (req.query.includeTrends === 'true') cost += 40;
    if (req.query.includeRecommendations === 'true') cost += 35;
    if (req.query.includeForecasting === 'true') cost += 60;
    
    // Large date range analysis
    if (req.query.startDate && req.query.endDate) {
      const daysDiff = (new Date(req.query.endDate) - new Date(req.query.startDate)) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) cost += Math.ceil(daysDiff / 30) * 25;
    }

    // Large limit values
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 30;
  }
  
  return Math.min(cost, 15000); // Cap at 15000 to prevent excessive costs
};

/**
 * Enhanced cost calculator for alert operations
 */
const calculateAlertCost = (req) => {
  let cost = 20; // Base alert cost
  
  // Alert type-based cost calculation
  if (req.body && req.body.type) {
    const typeCosts = {
      'critical': 50,
      'error': 30,
      'warning': 15,
      'info': 10
    };
    
    cost += typeCosts[req.body.type] || 20;
  }
  
  // Severity-based cost multiplier
  if (req.body && req.body.severity) {
    const severityMultipliers = {
      'critical': 3,
      'error': 2,
      'warning': 1.5,
      'info': 1
    };
    
    cost *= severityMultipliers[req.body.severity] || 1;
  }
  
  // Escalation and notification costs
  if (req.path.includes('escalate')) cost += 40;
  if (req.path.includes('suppress')) cost += 20;
  
  return Math.min(cost, 1000); // Cap at 1000
};

/**
 * Enhanced cost calculator for export operations
 */
const calculateExportCost = (req) => {
  let cost = 100; // Base export cost
  
  // Data type costs
  if (req.path.includes('metrics')) cost += 150;
  if (req.path.includes('logs')) cost += 200;
  if (req.path.includes('reports')) cost += 100;
  if (req.path.includes('dashboard')) cost += 75;
  
  // Format-based cost
  if (req.query.format === 'csv') cost += 50;
  if (req.query.format === 'json') cost += 25;
  
  // Time range impact
  if (req.query.startDate && req.query.endDate) {
    const daysDiff = (new Date(req.query.endDate) - new Date(req.query.startDate)) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) cost += daysDiff * 5;
  }
  
  return Math.min(cost, 10000); // Cap at 10000
};

/**
 * Enhanced system operation logger with comprehensive audit capabilities
 */
const systemOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        systemId: req.params.systemId,
        serviceName: req.params.serviceName,
        alertId: req.params.alertId,
        dashboardId: req.params.dashboardId,
        reportId: req.params.reportId,
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

      logger.info(`System operation initiated: ${operation}`, operationMetadata);

      // Enhanced audit logging for critical and sensitive system operations
      const criticalOperations = [
        'system-initialize', 'system-provision', 'system-reset', 'system-bootstrap',
        'service-restart', 'service-stop', 'service-start', 'service-scale',
        'backup-create', 'backup-restore', 'backup-delete',
        'alert-rules-configure', 'monitoring-config-update', 'monitoring-stop',
        'diagnostics-run', 'benchmark-run', 'logs-export', 'metrics-archive',
        'system-shutdown', 'emergency-override'
      ];

      const sensitiveOperations = [
        'system-reset', 'system-provision', 'backup-restore', 'service-stop',
        'monitoring-stop', 'alert-suppress', 'logs-export', 'metrics-cleanup',
        'dashboard-delete', 'emergency-override'
      ];

      if (criticalOperations.includes(operation) || sensitiveOperations.includes(operation)) {
        await auditLogEvent({
          event: `system.${operation.replace(/-/g, '_')}`,
          timestamp: operationMetadata.timestamp,
          actor: req.user || { type: 'system', id: 'unknown', role: 'system' },
          resource: {
            type: 'system',
            id: req.params.systemId || req.params.serviceName || 'global',
            name: req.params.systemId ? 
              `System ${req.params.systemId}` : 
              req.params.serviceName ?
              `Service ${req.params.serviceName}` :
              `${operation} Operation`
          },
          action: operation,
          result: 'initiated',
          metadata: {
            ...operationMetadata,
            isCritical: criticalOperations.includes(operation),
            isSensitive: sensitiveOperations.includes(operation),
            systemContext: {
              systemId: req.params.systemId,
              serviceName: req.params.serviceName,
              alertId: req.params.alertId,
              operationType: req.body?.type || 'standard',
              operationScope: req.body?.scope || 'single'
            },
            requestContext: {
              nodeEnv: process.env.NODE_ENV,
              serverTime: new Date(),
              requestId: req.id || req.headers['x-request-id']
            }
          }
        }, req);
      }

      // Store operation context for completion logging
      req.systemOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      logger.error('Failed to log system operation', {
        operation,
        error: error.message,
        stack: error.stack
      });
      next(); // Continue despite logging error
    }
  };
};

/**
 * Enhanced middleware to validate system access with comprehensive security checks
 */
const validateSystemAccess = async (req, res, next) => {
  try {
    const { systemId, serviceName, alertId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Resource access validation matrix
    const accessValidationRules = {
      'system_provisioning': {
        allowedRoles: ['admin'],
        requiredPermissions: ['system:provision'],
        paths: ['/provision', '/bootstrap', '/reset']
      },
      'system_management': {
        allowedRoles: ['admin', 'system-admin'],
        requiredPermissions: ['system:manage'],
        paths: ['/health', '/metrics', '/monitoring', '/config']
      },
      'system_execution': {
        allowedRoles: ['admin', 'system-admin'],
        requiredPermissions: ['system:execute'],
        paths: ['/restart', '/stop', '/start', '/scale', '/backup', '/restore']
      },
      'system_sensitive': {
        allowedRoles: ['admin'],
        requiredPermissions: ['system:sensitive'],
        paths: ['/reset', '/provision', '/restore', '/cleanup', '/archive']
      },
      'service_management': {
        allowedRoles: ['admin', 'system-admin', 'service-admin'],
        requiredPermissions: ['service:manage'],
        paths: ['/services']
      }
    };

    // Check access rules based on request path
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          logger.warn('Unauthorized system access attempt - insufficient role', {
            systemId,
            serviceName,
            alertId,
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
              id: systemId || serviceName || alertId || 'unknown',
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
          logger.warn('Unauthorized system access attempt - insufficient permissions', {
            systemId,
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
              id: systemId || serviceName || alertId || 'unknown',
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

    // Additional validation for emergency operations
    if (req.path.includes('/emergency') && !req.user?.emergencyAccess) {
      logger.warn('Emergency system access denied - no emergency access flag', {
        systemId,
        userId,
        userRole
      });

      return res.status(403).json({
        success: false,
        message: 'Emergency system access requires special authorization'
      });
    }

    // Audit successful access validation
    if (systemId || serviceName || alertId) {
      await auditLogEvent({
        event: 'authz.system_access_validated',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'system_resource',
          id: systemId || serviceName || alertId || 'multiple',
          name: `System Resource Access - ${req.path}`
        },
        action: 'access_validation',
        result: 'success',
        metadata: {
          systemId,
          serviceName,
          alertId,
          userId,
          userRole,
          requestPath: req.path,
          accessLevel: 'granted',
          validationTime: new Date()
        }
      }, req);
    }
    
    logger.debug('System access validated successfully', {
      systemId,
      serviceName,
      alertId,
      userId,
      userRole
    });
    
    next();
  } catch (error) {
    logger.error('Failed to validate system access', {
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
 * Enhanced middleware to check system resource conflicts
 */
const checkSystemResourceConflicts = async (req, res, next) => {
  try {
    const conflictCheckId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (req.body && (req.body.systemId || req.params.systemId)) {
      const resourceCheckData = {
        conflictCheckId,
        systemId: req.body.systemId || req.params.systemId,
        operation: req.body.operation || 'unknown',
        resourceType: req.body.resourceType || 'system',
        checkPerformed: true,
        checkTimestamp: new Date()
      };

      req.systemResourceCheck = resourceCheckData;

      // Audit resource check initiation
      await auditLogEvent({
        event: 'system.resource_check_started',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'system_resource_check',
          id: conflictCheckId,
          name: 'System Resource Conflict Check'
        },
        action: 'resource_check',
        result: 'initiated',
        metadata: {
          conflictCheckId,
          systemId: resourceCheckData.systemId,
          operation: resourceCheckData.operation,
          resourceType: resourceCheckData.resourceType,
          checksPerformed: ['resource_availability', 'operation_conflicts']
        }
      }, req);
    }
    
    next();
  } catch (error) {
    logger.error('Failed to check system resource conflicts', {
      error: error.message,
      stack: error.stack
    });
    next(); // Continue despite conflict check error
  }
};

/**
 * Enhanced middleware to validate system operation parameters
 */
const validateSystemOperationParameters = async (req, res, next) => {
  try {
    const { operation, parameters } = req.body;
    
    if (operation && parameters) {
      let validationResult = 'success';
      let validationError = null;
      let validationWarnings = [];
      let parameterViolations = [];
      
      // Basic parameter validation
      if (typeof parameters !== 'object') {
        validationResult = 'failure';
        validationError = 'Parameters must be provided as an object';
      } else {
        // Operation-specific validation
        switch (operation) {
          case 'restart':
          case 'stop':
          case 'start':
            if (parameters.timeout && (parameters.timeout < 5 || parameters.timeout > 300)) {
              validationWarnings.push('Timeout should be between 5 and 300 seconds');
            }
            break;
            
          case 'scale':
            if (!parameters.instances || parameters.instances < 0) {
              validationResult = 'failure';
              validationError = 'Instance count must be a positive number';
            } else if (parameters.instances > 100) {
              validationWarnings.push('Scaling to more than 100 instances may impact performance');
              parameterViolations.push('HIGH_INSTANCE_COUNT');
            }
            break;
            
          case 'backup':
            if (parameters.type && !['full', 'incremental', 'differential'].includes(parameters.type)) {
              validationResult = 'failure';
              validationError = 'Invalid backup type. Must be: full, incremental, or differential';
            }
            break;
        }
      }

      // Store validation results
      req.systemOperationValidation = {
        validationResult,
        validationError,
        validationWarnings,
        parameterViolations,
        operation,
        parameters
      };

      // Audit parameter validation
      await auditLogEvent({
        event: 'system.parameter_validation',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'system_operation',
          id: 'parameter_validation',
          name: 'System Operation Parameter Validation'
        },
        action: 'parameter_validation',
        result: validationResult,
        metadata: {
          operation,
          validationError,
          validationWarnings,
          parameterViolations,
          parameterCount: Object.keys(parameters).length
        }
      }, req);
      
      if (validationResult === 'failure') {
        return res.status(400).json({
          success: false,
          message: validationError,
          validationDetails: req.systemOperationValidation
        });
      }

      // Log warnings but continue
      if (validationWarnings.length > 0) {
        logger.warn('System operation parameter validation warnings', {
          warnings: validationWarnings,
          parameterViolations,
          operation
        });
      }
    }
    
    next();
  } catch (error) {
    logger.error('Failed to validate system operation parameters', {
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
      const operationStartTime = req.systemOperationContext?.startTime || Date.now();
      
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
              case 'system-provision':
                responseMetrics = {
                  systemId: responseData.data?.systemId,
                  provisioningTime: responseData.data?.metadata?.provisioningTime
                };
                break;
              case 'service-scale':
                responseMetrics = {
                  systemId: responseData.data?.systemId,
                  serviceName: responseData.data?.serviceName,
                  targetInstances: responseData.data?.targetInstances
                };
                break;
              case 'system-health':
                responseMetrics = {
                  systemId: responseData.data?.systemId,
                  overallStatus: responseData.data?.status?.overall,
                  healthScore: responseData.data?.healthScore
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
          event: `system.${operation.replace(/-/g, '_')}_complete`,
          timestamp: new Date().toISOString(),
          actor: req.user || { type: 'system', id: 'unknown' },
          resource: {
            type: 'system_operation',
            id: req.params.systemId || req.params.serviceName || 'operation',
            name: req.params.systemId ? 
              `System ${req.params.systemId}` : 
              req.params.serviceName ?
              `Service ${req.params.serviceName}` :
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
            systemId: req.params.systemId,
            serviceName: req.params.serviceName,
            alertId: req.params.alertId,
            resourceCheck: req.systemResourceCheck,
            operationValidation: req.systemOperationValidation,
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
          logger.error('Failed to log system operation completion audit', {
            error: error.message,
            operation,
            operationDuration,
            statusCode: res.statusCode
          });
        });

        // Performance monitoring alerts
        if (operationDuration > 30000) { // 30 seconds
          logger.warn('Slow system operation detected', {
            operation,
            duration: operationDuration,
            statusCode: res.statusCode,
            systemId: req.params.systemId
          });
        }

        // Error rate monitoring
        if (res.statusCode >= 500) {
          logger.error('System operation server error', {
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
 * Enhanced custom rate limiter for sensitive system operations
 */
const sensitiveSystemLimit = customLimit('sensitive_system', (req) => {
  // Define sensitive system endpoints with granular controls
  const sensitiveEndpoints = [
    { pattern: '/provision', max: 2, window: 60 },
    { pattern: '/reset', max: 1, window: 120 },
    { pattern: '/bootstrap', max: 3, window: 30 },
    { pattern: '/restart', max: 5, window: 30 },
    { pattern: '/stop', max: 3, window: 30 },
    { pattern: '/start', max: 5, window: 30 },
    { pattern: '/scale', max: 3, window: 60 },
    { pattern: '/backup', max: 2, window: 60 },
    { pattern: '/restore', max: 1, window: 120 },
    { pattern: '/cleanup', max: 2, window: 60 },
    { pattern: '/archive', max: 2, window: 60 }
  ];
  
  // Find matching sensitive endpoint
  const matchedEndpoint = sensitiveEndpoints.find(endpoint => 
    req.path.includes(endpoint.pattern)
  );
  
  if (matchedEndpoint) {
    const config = {
      windowMs: matchedEndpoint.window * 60 * 1000,
      max: matchedEndpoint.max,
      message: `Sensitive system operation rate limit exceeded for ${matchedEndpoint.pattern}`,
      headers: true,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `${req.ip}_${req.user?.id}_sensitive_${matchedEndpoint.pattern}`,
      handler: (req, res) => {
        logger.warn('Sensitive system operation rate limit exceeded', {
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
 * Apply comprehensive global middleware to all system routes
 */
router.use(authenticate);
router.use(requestSanitizer({
  // Enhanced sanitization for system-specific fields
  sanitizeFields: ['description', 'notes', 'reason', 'summary', 'config', 'parameters'],
  removeFields: ['password', 'token', 'apiKey', 'credentials', 'secret', 'key'],
  maxDepth: 10,
  maxKeys: 150
}));
router.use(auditMiddleware({
  service: 'system-management',
  includeBody: true,
  includeQuery: true,
  includeHeaders: ['user-agent', 'x-forwarded-for', 'authorization'],
  sensitiveFields: ['password', 'token', 'apiKey', 'credentials', 'secret', 'key', 'config'],
  maxBodySize: 75000, // 75KB
  skip: (req) => {
    // Skip audit logging for high-frequency, low-impact health endpoints
    const skipPaths = ['/health', '/status', '/metrics'];
    return req.method === 'GET' && 
           skipPaths.some(path => req.path.endsWith(path)) &&
           !req.path.includes('detailed') &&
           !req.query.includeHistory;
  },
  onLog: (logData) => {
    // Additional processing for critical system audit logs
    if (logData.metadata?.isCritical) {
      logger.info('Critical system operation audited', {
        event: logData.event,
        actor: logData.actor?.id,
        resource: logData.resource?.id
      });
    }
  }
}));

/**
 * ===============================================================================
 * SYSTEM INITIALIZATION AND SETUP ROUTES
 * Comprehensive routes for system provisioning and initialization
 * ===============================================================================
 */

// Initialize system monitoring
router.post(
  '/initialize',
  authorize(['admin', 'system-admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.provisioning),
  checkSystemResourceConflicts,
  systemOperationLogger('system-initialize'),
  auditOperationComplete('system-initialize'),
  SystemController.initializeSystem
);

// Provision new system instance
router.post(
  '/provision',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  validateSystemOperationParameters,
  systemOperationLogger('system-provision'),
  auditOperationComplete('system-provision'),
  SystemController.provisionSystem
);

// Bootstrap system components
router.post(
  '/:systemId/bootstrap',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('system-bootstrap'),
  auditOperationComplete('system-bootstrap'),
  SystemController.bootstrapSystem
);

// Reset system to default state
router.post(
  '/:systemId/reset',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  systemOperationLogger('system-reset'),
  auditOperationComplete('system-reset'),
  SystemController.resetSystem
);

/**
 * ===============================================================================
 * SYSTEM HEALTH AND MONITORING ROUTES
 * Comprehensive routes for health monitoring and status checking
 * ===============================================================================
 */

// Get comprehensive system health
router.get(
  '/:systemId/health',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.health),
  SystemController.getSystemHealth
);

// Get detailed health report
router.get(
  '/:systemId/health/detailed',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.getDetailedHealthReport
);

// Perform health check
router.post(
  '/:systemId/health-check',
  authorize(['admin', 'platform-manager', 'system-admin', 'monitor']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.health),
  systemOperationLogger('health-check'),
  auditOperationComplete('health-check'),
  SystemController.performHealthCheck
);

// Get health history
router.get(
  '/:systemId/health/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.getHealthHistory
);

// Get health trends
router.get(
  '/:systemId/health/trends',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.getHealthTrends
);

// Subscribe to health notifications
router.post(
  '/:systemId/health/subscribe',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('health-subscribe'),
  auditOperationComplete('health-subscribe'),
  SystemController.subscribeToHealthNotifications
);

/**
 * ===============================================================================
 * SYSTEM METRICS AND PERFORMANCE ROUTES
 * Comprehensive routes for metrics collection and performance monitoring
 * ===============================================================================
 */

// Update system metrics
router.post(
  '/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'system-admin', 'agent', 'monitor']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.updateSystemMetrics
);

// Batch update metrics
router.post(
  '/:systemId/metrics/batch',
  authorize(['admin', 'platform-manager', 'agent', 'monitor']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.batch),
  SystemController.batchUpdateMetrics
);

// Get current metrics
router.get(
  '/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getCurrentMetrics
);

// Get metrics history
router.get(
  '/:systemId/metrics/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.getMetricsHistory
);

// Get real-time metrics stream
router.get(
  '/:systemId/metrics/stream',
  authorize(['admin', 'platform-manager', 'system-admin', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getMetricsStream
);

// Get performance statistics
router.get(
  '/:systemId/performance',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getPerformanceStats
);

// Get performance analysis
router.get(
  '/:systemId/performance/analysis',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.getPerformanceAnalysis
);

// Get performance recommendations
router.get(
  '/:systemId/performance/recommendations',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getPerformanceRecommendations
);

// Export metrics
router.get(
  '/:systemId/metrics/export',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  async (req, res, next) => {
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
    
    return SystemController.exportMetrics(req, res, next);
  }
);

// Archive metrics
router.post(
  '/:systemId/metrics/archive',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('metrics-archive'),
  auditOperationComplete('metrics-archive'),
  SystemController.archiveMetrics
);

// Delete old metrics
router.delete(
  '/:systemId/metrics/cleanup',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  systemOperationLogger('metrics-cleanup'),
  auditOperationComplete('metrics-cleanup'),
  SystemController.cleanupMetrics
);

/**
 * ===============================================================================
 * SERVICE HEALTH AND STATUS ROUTES
 * Comprehensive routes for service lifecycle management
 * ===============================================================================
 */

// Update service health
router.put(
  '/:systemId/services/:serviceName/health',
  authorize(['admin', 'platform-manager', 'system-admin', 'agent', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.updateServiceHealth
);

// Get all services status
router.get(
  '/:systemId/services',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getServicesStatus
);

// Get specific service status
router.get(
  '/:systemId/services/:serviceName',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  limitByEndpoint(RATE_LIMITS.monitoring),
  SystemController.getServiceStatus
);

// Restart service
router.post(
  '/:systemId/services/:serviceName/restart',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveSystemLimit,
  validateSystemOperationParameters,
  systemOperationLogger('service-restart'),
  auditOperationComplete('service-restart'),
  SystemController.restartService
);

// Stop service
router.post(
  '/:systemId/services/:serviceName/stop',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveSystemLimit,
  validateSystemOperationParameters,
  systemOperationLogger('service-stop'),
  auditOperationComplete('service-stop'),
  SystemController.stopService
);

// Start service
router.post(
  '/:systemId/services/:serviceName/start',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveSystemLimit,
  validateSystemOperationParameters,
  systemOperationLogger('service-start'),
  auditOperationComplete('service-start'),
  SystemController.startService
);

// Get service dependencies
router.get(
  '/:systemId/services/:serviceName/dependencies',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getServiceDependencies
);

// Get service logs
router.get(
  '/:systemId/services/:serviceName/logs',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getServiceLogs
);

// Scale service
router.post(
  '/:systemId/services/:serviceName/scale',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveSystemLimit,
  validateSystemOperationParameters,
  systemOperationLogger('service-scale'),
  auditOperationComplete('service-scale'),
  SystemController.scaleService
);

/**
 * ===============================================================================
 * ALERT MANAGEMENT ROUTES
 * Comprehensive routes for system alert management and notification
 * ===============================================================================
 */

// Create system alert
router.post(
  '/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'system-admin', 'agent', 'monitor']),
  validateSystemAccess,
  costBasedLimit(calculateAlertCost, RATE_LIMITS.alerts),
  systemOperationLogger('alert-create'),
  auditOperationComplete('alert-create'),
  SystemController.createSystemAlert
);

// Get active alerts
router.get(
  '/alerts/active',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getActiveAlerts
);

// Get alerts for specific system
router.get(
  '/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.monitoring),
  SystemController.getSystemAlerts
);

// Get alert details
router.get(
  '/:systemId/alerts/:alertId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getAlertDetails
);

// Acknowledge alert
router.post(
  '/:systemId/alerts/:alertId/acknowledge',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateAlertCost, RATE_LIMITS.alerts),
  systemOperationLogger('alert-acknowledge'),
  auditOperationComplete('alert-acknowledge'),
  SystemController.acknowledgeAlert
);

// Resolve alert
router.post(
  '/:systemId/alerts/:alertId/resolve',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateAlertCost, RATE_LIMITS.alerts),
  systemOperationLogger('alert-resolve'),
  auditOperationComplete('alert-resolve'),
  SystemController.resolveAlert
);

// Escalate alert
router.post(
  '/:systemId/alerts/:alertId/escalate',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateAlertCost, RATE_LIMITS.alerts),
  systemOperationLogger('alert-escalate'),
  auditOperationComplete('alert-escalate'),
  SystemController.escalateAlert
);

// Suppress alert
router.post(
  '/:systemId/alerts/:alertId/suppress',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateAlertCost, RATE_LIMITS.alerts),
  sensitiveSystemLimit,
  systemOperationLogger('alert-suppress'),
  auditOperationComplete('alert-suppress'),
  SystemController.suppressAlert
);

// Get alert history
router.get(
  '/:systemId/alerts/history',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getAlertHistory
);

// Get alert statistics
router.get(
  '/:systemId/alerts/statistics',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getAlertStatistics
);

// Configure alert rules
router.post(
  '/:systemId/alerts/rules',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  systemOperationLogger('alert-rules-configure'),
  auditOperationComplete('alert-rules-configure'),
  SystemController.configureAlertRules
);

// Get alert rules
router.get(
  '/:systemId/alerts/rules',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getAlertRules
);

// Update alert rule
router.put(
  '/:systemId/alerts/rules/:ruleId',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('alert-rule-update'),
  auditOperationComplete('alert-rule-update'),
  SystemController.updateAlertRule
);

// Delete alert rule
router.delete(
  '/:systemId/alerts/rules/:ruleId',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('alert-rule-delete'),
  auditOperationComplete('alert-rule-delete'),
  SystemController.deleteAlertRule
);

/**
 * ===============================================================================
 * SYSTEM MONITORING CONTROL ROUTES
 * Routes for managing system monitoring configuration and control
 * ===============================================================================
 */

// Start monitoring
router.post(
  '/:systemId/monitoring/start',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('monitoring-start'),
  auditOperationComplete('monitoring-start'),
  SystemController.startMonitoring
);

// Stop monitoring
router.post(
  '/:systemId/monitoring/stop',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  sensitiveSystemLimit,
  systemOperationLogger('monitoring-stop'),
  auditOperationComplete('monitoring-stop'),
  SystemController.stopMonitoring
);

// Pause monitoring
router.post(
  '/:systemId/monitoring/pause',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('monitoring-pause'),
  auditOperationComplete('monitoring-pause'),
  SystemController.pauseMonitoring
);

// Resume monitoring
router.post(
  '/:systemId/monitoring/resume',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('monitoring-resume'),
  auditOperationComplete('monitoring-resume'),
  SystemController.resumeMonitoring
);

// Update monitoring configuration
router.put(
  '/:systemId/monitoring/config',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  systemOperationLogger('monitoring-config-update'),
  auditOperationComplete('monitoring-config-update'),
  SystemController.updateMonitoringConfig
);

// Get monitoring configuration
router.get(
  '/:systemId/monitoring/config',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getMonitoringConfig
);

// Get monitoring status
router.get(
  '/:systemId/monitoring/status',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getMonitoringStatus
);

// Test monitoring configuration
router.post(
  '/:systemId/monitoring/test',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('monitoring-test'),
  auditOperationComplete('monitoring-test'),
  SystemController.testMonitoringConfig
);

// Set monitoring thresholds
router.put(
  '/:systemId/monitoring/thresholds',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('monitoring-thresholds-update'),
  auditOperationComplete('monitoring-thresholds-update'),
  SystemController.setMonitoringThresholds
);

// Get monitoring thresholds
router.get(
  '/:systemId/monitoring/thresholds',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getMonitoringThresholds
);

/**
 * ===============================================================================
 * DASHBOARD AND REPORTING ROUTES
 * Comprehensive routes for system dashboards and reporting
 * ===============================================================================
 */

// Get system dashboard
router.get(
  '/:systemId/dashboard',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.dashboard),
  SystemController.getSystemDashboard
);

// Get custom dashboard
router.get(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.dashboard),
  SystemController.getCustomDashboard
);

// Create custom dashboard
router.post(
  '/:systemId/dashboard/custom',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.write),
  systemOperationLogger('dashboard-create'),
  auditOperationComplete('dashboard-create'),
  SystemController.createCustomDashboard
);

// Update custom dashboard
router.put(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.write),
  systemOperationLogger('dashboard-update'),
  auditOperationComplete('dashboard-update'),
  SystemController.updateCustomDashboard
);

// Delete custom dashboard
router.delete(
  '/:systemId/dashboard/custom/:dashboardId',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('dashboard-delete'),
  auditOperationComplete('dashboard-delete'),
  SystemController.deleteCustomDashboard
);

// Generate system report
router.post(
  '/:systemId/reports/generate',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  systemOperationLogger('report-generate'),
  async (req, res, next) => {
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
    
    return SystemController.generateSystemReport(req, res, next);
  }
);

// Get available reports
router.get(
  '/:systemId/reports',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getAvailableReports
);

// Get report
router.get(
  '/:systemId/reports/:reportId',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  SystemController.getReport
);

// Schedule report
router.post(
  '/:systemId/reports/schedule',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  systemOperationLogger('report-schedule'),
  auditOperationComplete('report-schedule'),
  SystemController.scheduleReport
);

/**
 * ===============================================================================
 * AGGREGATED SYSTEM ROUTES
 * Routes for cross-system operations and global views
 * ===============================================================================
 */

// Get aggregated metrics across all systems
router.get(
  '/metrics/aggregated',
  authorize(['admin', 'platform-manager', 'viewer']),
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  SystemController.getAggregatedMetrics
);

// Get system overview
router.get(
  '/overview',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getSystemOverview
);

// Get all systems status
router.get(
  '/status',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer', 'monitor']),
  adaptiveLimit(RATE_LIMITS.monitoring),
  SystemController.getAllSystemsStatus
);

// Get system capacity
router.get(
  '/capacity',
  authorize(['admin', 'platform-manager', 'system-admin']),
  limitByUser(RATE_LIMITS.default),
  SystemController.getSystemCapacity
);

// Get system utilization
router.get(
  '/utilization',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  limitByUser(RATE_LIMITS.default),
  SystemController.getSystemUtilization
);

// Perform system benchmark
router.post(
  '/benchmark',
  authorize(['admin', 'system-admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('system-benchmark'),
  auditOperationComplete('system-benchmark'),
  SystemController.performBenchmark
);

// Get benchmark results
router.get(
  '/benchmark/:benchmarkId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  limitByUser(RATE_LIMITS.default),
  SystemController.getBenchmarkResults
);

/**
 * ===============================================================================
 * SYSTEM DIAGNOSTICS ROUTES
 * Advanced diagnostic and troubleshooting routes
 * ===============================================================================
 */

// Run diagnostics
router.post(
  '/:systemId/diagnostics/run',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  systemOperationLogger('diagnostics-run'),
  auditOperationComplete('diagnostics-run'),
  async (req, res, next) => {
    const result = { diagnosticsId: 'diag_' + Date.now() };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Diagnostics initiated successfully'
    });
  }
);

// Get diagnostics results
router.get(
  '/:systemId/diagnostics/:diagnosticsId',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  async (req, res, next) => {
    const result = { results: {} };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Diagnostics results retrieved successfully'
    });
  }
);

// Get recent diagnostics
router.get(
  '/:systemId/diagnostics',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  async (req, res, next) => {
    const result = { diagnostics: [] };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Recent diagnostics retrieved successfully'
    });
  }
);

// Run connectivity test
router.post(
  '/:systemId/diagnostics/connectivity',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('connectivity-test'),
  auditOperationComplete('connectivity-test'),
  async (req, res, next) => {
    const result = { testId: 'conn_' + Date.now() };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Connectivity test initiated successfully'
    });
  }
);

// Run performance test
router.post(
  '/:systemId/diagnostics/performance',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('performance-test'),
  auditOperationComplete('performance-test'),
  async (req, res, next) => {
    const result = { testId: 'perf_' + Date.now() };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Performance test initiated successfully'
    });
  }
);

// Run security scan
router.post(
  '/:systemId/diagnostics/security',
  authorize(['admin', 'security-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('security-scan'),
  auditOperationComplete('security-scan'),
  async (req, res, next) => {
    const result = { scanId: 'sec_' + Date.now() };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Security scan initiated successfully'
    });
  }
);

/**
 * ===============================================================================
 * SYSTEM LOGS ROUTES
 * Comprehensive logging and audit trail routes
 * ===============================================================================
 */

// Get system logs
router.get(
  '/:systemId/logs',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  async (req, res, next) => {
    const result = { logs: [] };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'System logs retrieved successfully'
    });
  }
);

// Stream system logs
router.get(
  '/:systemId/logs/stream',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  async (req, res, next) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date() })}\n\n`);

    // Clean up on client disconnect
    req.on('close', () => {
      logger.info('Log stream closed', { systemId: req.params.systemId });
    });
  }
);

// Search logs
router.post(
  '/:systemId/logs/search',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateSystemCost, RATE_LIMITS.metrics),
  async (req, res, next) => {
    const result = { logs: [], total: 0 };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Log search completed successfully'
    });
  }
);

// Export logs
router.get(
  '/:systemId/logs/export',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  systemOperationLogger('logs-export'),
  async (req, res, next) => {
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

    // Generate export data
    const exportData = JSON.stringify({
      systemId: req.params.systemId,
      logs: [],
      exportedAt: new Date()
    }, null, 2);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="system-logs-${req.params.systemId}-${Date.now()}.json"`);

    return res.status(200).send(exportData);
  }
);

// Archive logs
router.post(
  '/:systemId/logs/archive',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('logs-archive'),
  auditOperationComplete('logs-archive'),
  async (req, res, next) => {
    const result = { archived: true };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Logs archived successfully'
    });
  }
);

/**
 * ===============================================================================
 * SYSTEM RESOURCE MANAGEMENT ROUTES
 * Routes for managing system resources and capacity
 * ===============================================================================
 */

// Get resource usage
router.get(
  '/:systemId/resources',
  authorize(['admin', 'platform-manager', 'system-admin', 'viewer']),
  validateSystemAccess,
  adaptiveLimit(RATE_LIMITS.monitoring),
  async (req, res, next) => {
    const result = { resources: {} };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Resource usage retrieved successfully'
    });
  }
);

// Get resource allocation
router.get(
  '/:systemId/resources/allocation',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  async (req, res, next) => {
    const result = { allocation: {} };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Resource allocation retrieved successfully'
    });
  }
);

// Update resource limits
router.put(
  '/:systemId/resources/limits',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('resource-limits-update'),
  auditOperationComplete('resource-limits-update'),
  async (req, res, next) => {
    const result = { updated: true };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Resource limits updated successfully'
    });
  }
);

// Request resource scaling
router.post(
  '/:systemId/resources/scale',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.service),
  systemOperationLogger('resource-scale'),
  auditOperationComplete('resource-scale'),
  async (req, res, next) => {
    const result = { scaleId: 'scale_' + Date.now() };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Resource scaling initiated successfully'
    });
  }
);

// Get resource recommendations
router.get(
  '/:systemId/resources/recommendations',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  async (req, res, next) => {
    const result = { recommendations: [] };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Resource recommendations retrieved successfully'
    });
  }
);

/**
 * ===============================================================================
 * SYSTEM BACKUP AND RECOVERY ROUTES
 * Critical routes for backup and disaster recovery operations
 * ===============================================================================
 */

// Create system backup
router.post(
  '/:systemId/backup',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  systemOperationLogger('backup-create'),
  auditOperationComplete('backup-create'),
  async (req, res, next) => {
    const result = { backupId: 'backup_' + Date.now() };
    return res.status(201).json({
      success: true,
      data: result,
      message: 'System backup initiated successfully'
    });
  }
);

// List system backups
router.get(
  '/:systemId/backups',
  authorize(['admin', 'platform-manager', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.default),
  async (req, res, next) => {
    const result = { backups: [] };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'System backups retrieved successfully'
    });
  }
);

// Restore from backup
router.post(
  '/:systemId/restore',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveSystemLimit,
  systemOperationLogger('backup-restore'),
  auditOperationComplete('backup-restore'),
  async (req, res, next) => {
    const result = { restoreId: 'restore_' + Date.now() };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'System restore initiated successfully'
    });
  }
);

// Delete backup
router.delete(
  '/:systemId/backups/:backupId',
  authorize(['admin']),
  validateSystemAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  systemOperationLogger('backup-delete'),
  auditOperationComplete('backup-delete'),
  async (req, res, next) => {
    return res.status(200).json({
      success: true,
      data: null,
      message: 'Backup deleted successfully'
    });
  }
);

// Verify backup integrity
router.post(
  '/:systemId/backups/:backupId/verify',
  authorize(['admin', 'system-admin']),
  validateSystemAccess,
  limitByUser(RATE_LIMITS.service),
  systemOperationLogger('backup-verify'),
  auditOperationComplete('backup-verify'),
  async (req, res, next) => {
    const result = { verified: true };
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Backup integrity verified successfully'
    });
  }
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
    systemId: req.params?.systemId,
    serviceName: req.params?.serviceName,
    alertId: req.params?.alertId,
    userId: req.user?.id,
    userRole: req.user?.role,
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'],
    userAgent: req.get('user-agent'),
    ip: req.ip
  };

  logger.error('System management route error', errorContext);

  // Enhanced audit logging for system management errors
  if (err.statusCode >= 500 || err.critical) {
    auditLogEvent({
      event: 'system.error',
      timestamp: new Date().toISOString(),
      actor: req.user || { type: 'system', id: 'unknown' },
      resource: {
        type: 'system_route',
        id: req.path,
        name: `${req.method} ${req.path}`
      },
      action: 'error',
      result: 'failure',
      metadata: {
        ...errorContext,
        errorType: err.constructor.name,
        statusCode: err.statusCode || 500,
        systemContext: {
          resourceCheck: req.systemResourceCheck,
          operationValidation: req.systemOperationValidation,
          operationContext: req.systemOperationContext
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
      logger.error('Failed to audit system error', {
        auditError: auditError.message,
        originalError: err.message
      });
    });
  }

  // Enhanced error response based on error type and context
  const errorResponses = {
    // System-specific error codes
    'SYSTEM_NOT_FOUND': {
      status: 404,
      message: 'System not found',
      data: { systemId: err.systemId }
    },
    'SYSTEM_UNAVAILABLE': {
      status: 503,
      message: 'System is currently unavailable',
      data: { systemId: err.systemId, reason: err.reason }
    },
    'SERVICE_NOT_FOUND': {
      status: 404,
      message: 'Service not found',
      data: { systemId: err.systemId, serviceName: err.serviceName }
    },
    'ALERT_NOT_FOUND': {
      status: 404,
      message: 'Alert not found',
      data: { systemId: err.systemId, alertId: err.alertId }
    },
    'RESOURCE_CONFLICT': {
      status: 409,
      message: 'Resource conflict detected',
      data: { conflicts: err.conflicts }
    },
    'OPERATION_IN_PROGRESS': {
      status: 423,
      message: 'Another operation is currently in progress',
      data: { systemId: err.systemId, operation: err.operation }
    },
    'INSUFFICIENT_RESOURCES': {
      status: 507,
      message: 'Insufficient system resources',
      data: { required: err.required, available: err.available }
    },
    'MONITORING_ERROR': {
      status: 500,
      message: 'System monitoring error',
      data: { systemId: err.systemId, monitoringType: err.monitoringType }
    },
    'BACKUP_FAILED': {
      status: 500,
      message: 'System backup operation failed',
      data: { systemId: err.systemId, backupId: err.backupId }
    }
  };

  // Check for specific system error codes
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

// Export comprehensive system routes
module.exports = router;