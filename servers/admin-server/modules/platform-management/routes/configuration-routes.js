'use strict';

/**
 * @fileoverview Comprehensive configuration management routes for platform administration
 * @module servers/admin-server/modules/platform-management/routes/configuration-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/configuration-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/validation/file-validator
 * @requires module:shared/lib/utils/logger
 * @requires multer
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const ConfigurationController = require('../controllers/configuration-controller');
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
const { validate: fileValidator } = require('../../../../../shared/lib/middleware/validation/file-validator');
const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Multer configuration for configuration file uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size for large configurations
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/json', 'text/yaml', 'application/x-yaml', 'text/yml',
      'text/xml', 'application/xml', 'text/plain', 'application/octet-stream'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(json|yaml|yml|xml|env|properties|conf|cfg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, YAML, XML, ENV, and configuration files are allowed.'));
    }
  }
});

/**
 * Advanced rate limiting configurations for comprehensive configuration operations
 */
const RATE_LIMITS = {
  // Default rate limiting for general configuration operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many configuration requests from this IP, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // High-frequency read operations with adaptive limiting
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 80,
    minMax: 30,
    maxMax: 150,
    message: 'Configuration read rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Write operations with burst protection and transaction safety
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 25,
    message: 'Configuration write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Critical configuration operations requiring combined limiting strategies
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 8,
    message: 'Critical configuration operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user', 'endpoint'],
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Import operations with cost-based limiting
  import: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 8000,
    message: 'Configuration import rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_import`
  },
  
  // Export operations with cost-based limiting
  export: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 5000,
    message: 'Configuration export rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_export`
  },
  
  // Sensitive security operations
  security: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 3,
    message: 'Security operation rate limit exceeded.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false,
    onLimitReached: (req, res, options) => {
      logger.warn('Configuration security rate limit reached', {
        ip: req.ip,
        userId: req.user?.id,
        operation: req.path,
        timestamp: new Date()
      });
    }
  },
  
  // Bulk operations with higher cost limits
  bulk: {
    windowMs: 45 * 60 * 1000, // 45 minutes
    maxCost: 15000,
    message: 'Bulk configuration operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_bulk`
  },
  
  // Migration operations with strict limits
  migration: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 2,
    message: 'Configuration migration operation rate limit exceeded.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Template operations
  template: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Configuration template operation rate limit exceeded.',
    headers: true
  },
  
  // Backup and recovery operations
  backup: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10,
    message: 'Configuration backup operation rate limit exceeded.',
    headers: true
  },
  
  // Validation and testing operations
  validation: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 3000,
    message: 'Configuration validation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_validation`
  }
};

/**
 * Enhanced cost calculator for configuration operations
 */
const calculateConfigurationCost = (req) => {
  let cost = 15; // Base cost
  
  // Path-based cost calculation with configuration-specific operations
  const pathCosts = {
    'bulk': 150,
    'import': 100,
    'export': 75,
    'migrate': 300,
    'encrypt': 100,
    'decrypt': 100,
    'rotate-keys': 200,
    'backup': 80,
    'restore': 150,
    'clone': 60,
    'merge': 120,
    'validate': 40,
    'compare': 50,
    'sync': 90,
    'rollback': 100,
    'schema': 60,
    'compliance': 80,
    'analyze': 70,
    'test': 30,
    'template': 40
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis for additional cost calculation
  if (req.body) {
    // Increase cost based on configuration complexity
    if (req.body.configurations && Array.isArray(req.body.configurations)) {
      cost += req.body.configurations.length * 5;
    }
    
    // Increase cost for bulk operations
    if (req.body.updates && typeof req.body.updates === 'object') {
      cost += Object.keys(req.body.updates).length * 3;
    }

    // Increase cost based on environments
    if (req.body.targetEnvironments && Array.isArray(req.body.targetEnvironments)) {
      cost += req.body.targetEnvironments.length * 10;
    }

    // Increase cost for version history operations
    if (req.body.includeVersions === 'true') cost += 30;
    if (req.body.includeEnvironments === 'true') cost += 20;
    if (req.body.includeSensitive === 'true') cost += 40;

    // Large data processing costs
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 100000) { // 100KB
      cost += Math.floor(bodySize / 10000) * 5;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeVersions === 'true') cost += 25;
    if (req.query.includeAnalytics === 'true') cost += 40;
    if (req.query.includeDetails === 'true') cost += 20;
    if (req.query.includeSensitive === 'true') cost += 30;
    
    // Date range analysis for historical data
    if (req.query.startDate && req.query.endDate) {
      const daysDiff = (new Date(req.query.endDate) - new Date(req.query.startDate)) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) cost += Math.ceil(daysDiff / 30) * 15;
    }

    // Large result set costs
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 20;
  }

  // File upload costs
  if (req.file && req.file.size) {
    const sizeMB = req.file.size / (1024 * 1024);
    if (sizeMB > 1) cost += Math.ceil(sizeMB) * 10;
  }
  
  return Math.min(cost, 20000); // Cap at 20000 to prevent excessive costs
};

/**
 * Enhanced cost calculator for export operations
 */
const calculateExportCost = (req) => {
  let cost = 60; // Base export cost
  
  // Increase cost based on export scope and complexity
  if (req.path.includes('/export/all')) cost += 500;
  if (req.path.includes('bulk/export')) cost += 300;
  
  // Format-based cost calculation
  const formatCosts = {
    'xml': 25,
    'yaml': 15,
    'env': 10,
    'json': 5
  };
  
  const format = req.query.format || 'json';
  cost += formatCosts[format] || 10;
  
  // Include options cost calculation
  if (req.query.includeVersionHistory === 'true') cost += 80;
  if (req.query.includeMetadata === 'true') cost += 40;
  if (req.query.includeEnvironments === 'true') cost += 50;
  if (req.query.includeSensitive === 'true') cost += 60;
  
  // Environment-specific exports
  if (req.query.environment && req.query.environment !== 'base') cost += 20;
  
  return Math.min(cost, 8000); // Cap at 8000
};

/**
 * Enhanced cost calculator for import operations
 */
const calculateImportCost = (req) => {
  let cost = 80; // Base import cost
  
  // Data source cost calculation
  if (req.path.includes('import/url')) cost += 50;
  if (req.body?.source === 'external') cost += 30;
  
  // Format complexity cost
  const formatCosts = {
    'xml': 40,
    'yaml': 25,
    'env': 15,
    'json': 10
  };
  
  const format = req.body?.format || 'json';
  cost += formatCosts[format] || 20;
  
  // Merge strategy cost
  const strategyCosts = {
    'replace': 10,
    'merge': 30,
    'append': 20,
    'selective': 50
  };
  
  const strategy = req.body?.mergeStrategy || 'replace';
  cost += strategyCosts[strategy] || 20;
  
  // File size cost calculation
  if (req.file && req.file.size) {
    const sizeMB = req.file.size / (1024 * 1024);
    cost += Math.ceil(sizeMB) * 15;
  } else if (req.body?.data) {
    const dataSize = req.body.data.length / (1024 * 1024);
    if (dataSize > 0.1) cost += Math.ceil(dataSize) * 12;
  }
  
  return Math.min(cost, 12000); // Cap at 12000
};

/**
 * Enhanced configuration operation logger with comprehensive audit capabilities
 */
const configurationOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        configId: req.params.configId,
        key: req.params.key,
        environment: req.params.environment,
        version: req.params.version,
        templateId: req.params.templateId,
        backupId: req.params.backupId,
        watcherId: req.params.watcherId,
        migrationId: req.params.migrationId,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        userAgent: req.get('user-agent'),
        requestSize: JSON.stringify(req.body || {}).length,
        queryParams: req.query,
        fileInfo: req.file ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : null
      };

      logger.info(`Configuration operation initiated: ${operation}`, operationMetadata);

      // Enhanced audit logging for critical and sensitive configuration operations
      const criticalOperations = [
        'configuration-create', 'configuration-update', 'configuration-delete',
        'configuration-import', 'configuration-export', 'configuration-backup',
        'configuration-restore', 'configuration-encrypt', 'configuration-decrypt',
        'configuration-migrate', 'configuration-rollback', 'configuration-lock',
        'configuration-unlock', 'bulk-update', 'bulk-delete', 'schema-update',
        'key-rotation', 'permissions-update', 'template-apply', 'environment-promote'
      ];

      const sensitiveOperations = [
        'configuration-encrypt', 'configuration-decrypt', 'key-rotation',
        'configuration-restore', 'configuration-migrate', 'permissions-update',
        'security-audit', 'compliance-check', 'sensitive-export'
      ];

      if (criticalOperations.includes(operation) || sensitiveOperations.includes(operation)) {
        await auditLogEvent({
          event: `config.${operation.replace(/-/g, '_')}`,
          timestamp: operationMetadata.timestamp,
          actor: req.user || { type: 'system', id: 'unknown', role: 'system' },
          resource: {
            type: 'configuration',
            id: req.params.configId || req.params.templateId || 'new',
            name: req.params.configId ? 
              `Configuration ${req.params.configId}` : 
              `${operation} Operation`
          },
          action: operation,
          result: 'initiated',
          metadata: {
            ...operationMetadata,
            isCritical: criticalOperations.includes(operation),
            isSensitive: sensitiveOperations.includes(operation),
            configurationDetails: {
              configId: req.params.configId,
              key: req.params.key,
              environment: req.params.environment || req.body?.environment,
              includeVersions: req.query?.includeVersions || req.body?.includeVersions,
              includeEnvironments: req.query?.includeEnvironments || req.body?.includeEnvironments,
              includeSensitive: req.query?.includeSensitive || req.body?.includeSensitive,
              format: req.query?.format || req.body?.format,
              targetEnvironments: req.body?.targetEnvironments
            },
            operationContext: {
              bulkOperation: req.path.includes('bulk'),
              importOperation: req.path.includes('import'),
              exportOperation: req.path.includes('export'),
              migrationOperation: req.path.includes('migrate'),
              securityOperation: req.path.includes('encrypt') || req.path.includes('decrypt') || req.path.includes('security'),
              templateOperation: req.path.includes('template')
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
      req.configurationOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      logger.error('Failed to log configuration operation', {
        operation,
        error: error.message,
        stack: error.stack
      });
      next(); // Continue despite logging error
    }
  };
};

/**
 * Enhanced middleware to validate configuration access with comprehensive security checks
 */
const validateConfigurationAccess = async (req, res, next) => {
  try {
    const { configId, key, templateId, backupId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Resource access validation matrix for configurations
    const accessValidationRules = {
      'configuration_read': {
        allowedRoles: ['admin', 'config-manager', 'viewer', 'application'],
        requiredPermissions: ['config:read'],
        paths: ['/values', '/environments', '/versions', '/audit', '/statistics', '/export']
      },
      'configuration_write': {
        allowedRoles: ['admin', 'config-manager'],
        requiredPermissions: ['config:write'],
        paths: ['/values/', '/update', '/clone', '/sync', '/import']
      },
      'configuration_management': {
        allowedRoles: ['admin', 'config-manager'],
        requiredPermissions: ['config:manage'],
        paths: ['/lock', '/unlock', '/rollback', '/backup', '/restore']
      },
      'configuration_security': {
        allowedRoles: ['admin', 'security-admin'],
        requiredPermissions: ['config:security'],
        paths: ['/encrypt', '/decrypt', '/rotate-keys', '/permissions', '/security']
      },
      'configuration_critical': {
        allowedRoles: ['admin'],
        requiredPermissions: ['config:critical'],
        paths: ['/delete', '/migrate', '/bulk', '/compliance']
      },
      'template_management': {
        allowedRoles: ['admin', 'config-manager'],
        requiredPermissions: ['template:manage'],
        paths: ['/templates']
      }
    };

    // Check access rules based on request path and method
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Special handling for DELETE operations - always require admin
        if (req.method === 'DELETE' && !['admin'].includes(userRole)) {
          logger.warn('Unauthorized configuration delete attempt', {
            configId,
            userId,
            userRole,
            requestPath: req.path
          });

          await auditLogEvent({
            event: 'authz.access_denied',
            timestamp: new Date().toISOString(),
            actor: req.user,
            resource: {
              type: resourceType,
              id: configId || templateId || backupId || 'unknown',
              name: `${resourceType.replace('_', ' ')} - ${req.path}`
            },
            action: 'delete_attempt',
            result: 'failure',
            metadata: {
              reason: 'delete_operation_requires_admin',
              userRole,
              resourceType,
              requestPath: req.path,
              securityLevel: 'critical'
            }
          }, req);
          
          return res.status(403).json({
            success: false,
            message: 'Delete operations require admin privileges',
            required: ['admin']
          });
        }

        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          logger.warn('Unauthorized configuration access attempt - insufficient role', {
            configId,
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
              id: configId || templateId || 'unknown',
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
          logger.warn('Unauthorized configuration access attempt - insufficient permissions', {
            configId,
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
              id: configId || templateId || 'unknown',
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

    // Enhanced validation for sensitive configuration operations
    if (req.path.includes('/sensitive') || req.path.includes('/decrypt') || req.path.includes('/security')) {
      if (!req.user?.sensitiveAccess) {
        logger.warn('Sensitive configuration access denied - no sensitive access flag', {
          configId,
          userId,
          userRole
        });

        return res.status(403).json({
          success: false,
          message: 'Sensitive configuration access requires special authorization'
        });
      }
    }

    // Enhanced validation for production environment operations
    if (req.body?.environment === 'production' || req.params.environment === 'production') {
      if (!['admin', 'config-manager'].includes(userRole) || !req.user?.productionAccess) {
        logger.warn('Production configuration access denied', {
          configId,
          userId,
          userRole,
          environment: 'production'
        });

        return res.status(403).json({
          success: false,
          message: 'Production configuration access requires special authorization'
        });
      }
    }

    // Audit successful access validation
    if (configId || templateId) {
      await auditLogEvent({
        event: 'authz.config_access_validated',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'configuration_resource',
          id: configId || templateId || 'multiple',
          name: `Configuration Resource Access - ${req.path}`
        },
        action: 'access_validation',
        result: 'success',
        metadata: {
          configId,
          templateId,
          backupId,
          key,
          userId,
          userRole,
          requestPath: req.path,
          accessLevel: 'granted',
          validationTime: new Date()
        }
      }, req);
    }
    
    logger.debug('Configuration access validated successfully', {
      configId,
      templateId,
      userId,
      userRole,
      requestPath: req.path
    });
    
    next();
  } catch (error) {
    logger.error('Failed to validate configuration access', {
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
 * Enhanced middleware to check configuration conflicts with comprehensive analysis
 */
const checkConfigurationConflicts = async (req, res, next) => {
  try {
    const conflictCheckId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check for configuration naming conflicts
    if (req.body.name && req.method === 'POST') {
      const conflictCheckData = {
        conflictCheckId,
        configurationName: req.body.name,
        displayName: req.body.displayName,
        environment: req.body.environment,
        checkType: 'naming_conflict',
        checkPerformed: true,
        checkTimestamp: new Date()
      };

      req.configurationConflictCheck = conflictCheckData;

      // Validate configuration name format
      if (req.body.name && !/^[a-zA-Z0-9_-]+$/.test(req.body.name)) {
        logger.warn('Invalid configuration name format detected', conflictCheckData);
        
        return res.status(400).json({
          success: false,
          message: 'Configuration name must contain only alphanumeric characters, underscores, and hyphens',
          conflictCheckId
        });
      }

      // Check for reasonable name length
      if (req.body.name && req.body.name.length > 100) {
        logger.warn('Configuration name exceeds maximum length', {
          ...conflictCheckData,
          nameLength: req.body.name.length
        });
        
        return res.status(400).json({
          success: false,
          message: 'Configuration name cannot exceed 100 characters',
          conflictCheckId
        });
      }

      // Audit conflict check initiation
      await auditLogEvent({
        event: 'config.conflict_check_started',
        timestamp: new Date().toISOString(),
        actor: req.user,
        resource: {
          type: 'configuration_conflict_check',
          id: conflictCheckId,
          name: 'Configuration Conflict Check'
        },
        action: 'conflict_check',
        result: 'initiated',
        metadata: {
          conflictCheckId,
          configurationName: req.body.name,
          displayName: req.body.displayName,
          environment: req.body.environment,
          checkType: 'naming_conflict',
          checksPerformed: ['name_format', 'name_length']
        }
      }, req);
    }
    
    next();
  } catch (error) {
    logger.error('Failed to check configuration conflicts', {
      error: error.message,
      stack: error.stack
    });
    next(); // Continue despite conflict check error
  }
};

/**
 * Enhanced middleware to validate configuration data with business rules
 */
const validateConfigurationData = async (req, res, next) => {
  try {
    const { configId } = req.params;
    const validationId = `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let validationResult = 'success';
    let validationErrors = [];
    let validationWarnings = [];
    let businessRuleViolations = [];
    
    // Validate configuration structure for create/update operations
    if (req.body.configurations && Array.isArray(req.body.configurations)) {
      const configurations = req.body.configurations;
      
      // Check for duplicate keys
      const keys = configurations.map(c => c.key);
      const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
      
      if (duplicateKeys.length > 0) {
        validationErrors.push(`Duplicate configuration keys found: ${duplicateKeys.join(', ')}`);
        validationResult = 'failure';
      }

      // Validate individual configuration items
      configurations.forEach((config, index) => {
        if (!config.key) {
          validationErrors.push(`Configuration item at index ${index} is missing a key`);
          validationResult = 'failure';
        }

        if (config.key && config.key.length > 200) {
          validationErrors.push(`Configuration key '${config.key}' exceeds maximum length of 200 characters`);
          validationResult = 'failure';
        }

        if (config.value === undefined || config.value === null) {
          validationWarnings.push(`Configuration key '${config.key}' has null or undefined value`);
        }

        // Check for potentially sensitive data in non-sensitive configurations
        if (!config.sensitive && typeof config.value === 'string') {
          const sensitivePatterns = [
            /password/i, /secret/i, /key/i, /token/i, /credential/i, 
            /api[_-]?key/i, /private[_-]?key/i, /auth[_-]?token/i
          ];
          
          if (sensitivePatterns.some(pattern => pattern.test(config.key))) {
            validationWarnings.push(`Key '${config.key}' appears to contain sensitive data but is not marked as sensitive`);
            businessRuleViolations.push('UNMARKED_SENSITIVE_DATA');
          }
        }
      });
    }

    // Validate environment configurations
    if (req.body.environments && Array.isArray(req.body.environments)) {
      const validEnvironments = ['development', 'staging', 'production', 'testing', 'demo'];
      const invalidEnvironments = req.body.environments
        .map(env => env.environment)
        .filter(envName => !validEnvironments.includes(envName));

      if (invalidEnvironments.length > 0) {
        validationWarnings.push(`Invalid environment names: ${invalidEnvironments.join(', ')}`);
      }
    }

    // Validate bulk update operations
    if (req.body.updates && typeof req.body.updates === 'object') {
      const updateKeys = Object.keys(req.body.updates);
      
      if (updateKeys.length > 500) {
        validationErrors.push('Cannot update more than 500 configuration keys in a single operation');
        validationResult = 'failure';
      }

      if (updateKeys.length > 100) {
        validationWarnings.push('Large bulk update detected. Consider breaking into smaller batches for better performance.');
      }
    }

    // Store validation results
    req.configurationDataValidation = {
      validationId,
      validationResult,
      validationErrors,
      validationWarnings,
      businessRuleViolations,
      validationTime: new Date(),
      validatedItemCount: req.body.configurations?.length || Object.keys(req.body.updates || {}).length
    };

    // Audit configuration data validation
    await auditLogEvent({
      event: 'config.data_validation',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration_data',
        id: configId || 'new',
        name: 'Configuration Data Validation'
      },
      action: 'data_validation',
      result: validationResult,
      metadata: {
        validationId,
        configId,
        validationErrors,
        validationWarnings,
        businessRuleViolations,
        validatedItemCount: req.configurationDataValidation.validatedItemCount,
        validationType: req.method === 'POST' ? 'create' : 'update'
      }
    }, req);
    
    if (validationResult === 'failure') {
      return res.status(400).json({
        success: false,
        message: 'Configuration data validation failed',
        errors: validationErrors,
        warnings: validationWarnings,
        validationDetails: req.configurationDataValidation
      });
    }

    // Log warnings but continue
    if (validationWarnings.length > 0) {
      logger.warn('Configuration data validation warnings', {
        warnings: validationWarnings,
        businessRuleViolations,
        configId
      });
    }
    
    next();
  } catch (error) {
    logger.error('Failed to validate configuration data', {
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
      const operationStartTime = req.configurationOperationContext?.startTime || Date.now();
      
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
              case 'configuration-create':
                responseMetrics = {
                  configId: responseData.data?.configId,
                  itemCount: responseData.metadata?.itemCount,
                  version: responseData.data?.currentVersion
                };
                break;
              case 'bulk-update':
                responseMetrics = {
                  configId: responseData.data?.configId,
                  updatedKeys: responseData.data?.updatedKeys?.length,
                  updateCount: responseData.data?.updateCount
                };
                break;
              case 'configuration-import':
                responseMetrics = {
                  configId: responseData.data?.configId,
                  itemCount: responseData.metadata?.itemCount,
                  format: responseData.metadata?.format
                };
                break;
              case 'configuration-export':
                responseMetrics = {
                  configId: responseData.data?.configId,
                  format: req.query.format,
                  size: body?.length
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
          event: `config.${operation.replace(/-/g, '_')}_complete`,
          timestamp: new Date().toISOString(),
          actor: req.user || { type: 'system', id: 'unknown' },
          resource: {
            type: 'configuration_operation',
            id: req.params.configId || req.params.templateId || 'operation',
            name: req.params.configId ? 
              `Configuration ${req.params.configId}` : 
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
            configId: req.params.configId,
            key: req.params.key,
            environment: req.params.environment,
            version: req.params.version,
            templateId: req.params.templateId,
            conflictCheck: req.configurationConflictCheck,
            dataValidation: req.configurationDataValidation,
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
              contentType: req.get('content-type'),
              fileUpload: req.file ? {
                originalname: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
              } : null
            }
          }
        };

        // Enhanced audit logging for critical operations
        auditLogEvent(completionData, req).catch(error => {
          logger.error('Failed to log configuration operation completion audit', {
            error: error.message,
            operation,
            operationDuration,
            statusCode: res.statusCode
          });
        });

        // Performance monitoring alerts
        if (operationDuration > 45000) { // 45 seconds
          logger.warn('Slow configuration operation detected', {
            operation,
            duration: operationDuration,
            statusCode: res.statusCode,
            configId: req.params.configId
          });
        }

        // Error rate monitoring for configuration operations
        if (res.statusCode >= 500) {
          logger.error('Configuration operation server error', {
            operation,
            statusCode: res.statusCode,
            duration: operationDuration,
            error: responseData?.message || 'Unknown server error',
            configId: req.params.configId
          });
        }

        // Success rate monitoring for critical operations
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info('Configuration operation completed successfully', {
            operation,
            statusCode: res.statusCode,
            duration: operationDuration,
            configId: req.params.configId
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
 * Enhanced custom rate limiter for sensitive configuration operations
 */
const sensitiveConfigLimit = customLimit('sensitive_configuration', (req) => {
  // Define sensitive configuration endpoints with granular controls
  const sensitiveEndpoints = [
    { pattern: '/encrypt', max: 2, window: 30 },
    { pattern: '/decrypt', max: 2, window: 30 },
    { pattern: '/rotate-keys', max: 1, window: 60 },
    { pattern: '/permissions', max: 3, window: 20 },
    { pattern: '/security', max: 3, window: 20 },
    { pattern: '/backup', max: 5, window: 30 },
    { pattern: '/restore', max: 2, window: 60 },
    { pattern: '/migrate', max: 1, window: 120 },
    { pattern: '/rollback', max: 3, window: 30 },
    { pattern: '/bulk/delete', max: 1, window: 60 },
    { pattern: '/compliance', max: 5, window: 30 }
  ];
  
  // Find matching sensitive endpoint
  const matchedEndpoint = sensitiveEndpoints.find(endpoint => 
    req.path.includes(endpoint.pattern)
  );
  
  if (matchedEndpoint) {
    const config = {
      windowMs: matchedEndpoint.window * 60 * 1000,
      max: matchedEndpoint.max,
      message: `Sensitive configuration operation rate limit exceeded for ${matchedEndpoint.pattern}`,
      headers: true,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `${req.ip}_${req.user?.id}_sensitive_${matchedEndpoint.pattern}`,
      handler: (req, res) => {
        logger.warn('Sensitive configuration operation rate limit exceeded', {
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
 * Apply comprehensive global middleware to all configuration routes
 */
router.use(authenticate);
router.use(requestSanitizer({
  // Enhanced sanitization for configuration-specific fields
  sanitizeFields: ['name', 'displayName', 'description', 'comment', 'reason', 'value'],
  removeFields: ['password', 'token', 'apiKey', 'credentials', 'privateKey', 'certificate'],
  maxDepth: 15,
  maxKeys: 200
}));
router.use(auditMiddleware({
  service: 'configuration-management',
  includeBody: true,
  includeQuery: true,
  includeHeaders: ['user-agent', 'x-forwarded-for', 'authorization'],
  sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'privateKey', 'certificate', 'value', 'credentials'],
  maxBodySize: 100000, // 100KB
  skip: (req) => {
    // Skip audit logging for high-frequency, low-impact status endpoints
    const skipPaths = ['/statistics', '/usage', '/status'];
    return req.method === 'GET' && 
           skipPaths.some(path => req.path.endsWith(path)) &&
           !req.path.includes('audit') &&
           !req.query.includeDetails;
  },
  onLog: (logData) => {
    // Additional processing for critical configuration audit logs
    if (logData.metadata?.isCritical || logData.metadata?.isSensitive) {
      logger.info('Critical/sensitive configuration operation audited', {
        event: logData.event,
        actor: logData.actor?.id,
        resource: logData.resource?.id,
        result: logData.result
      });
    }
  }
}));

/**
 * ===============================================================================
 * CONFIGURATION CRUD ROUTES
 * Core configuration management operations
 * ===============================================================================
 */

// Create new configuration
router.post(
  '/',
  authorize(['admin', 'config-manager']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  validateConfigurationData,
  checkConfigurationConflicts,
  configurationOperationLogger('configuration-create'),
  auditOperationComplete('configuration-create'),
  ConfigurationController.createConfiguration
);

// List configurations with filtering and pagination
router.get(
  '/',
  authorize(['admin', 'config-manager', 'viewer']),
  adaptiveLimit(RATE_LIMITS.read),
  ConfigurationController.listConfigurations
);

// Search configuration values across all configurations
router.get(
  '/search',
  authorize(['admin', 'config-manager', 'viewer']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.searchConfigurationValues
);

// Get global configuration statistics
router.get(
  '/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  limitByUser(RATE_LIMITS.default),
  ConfigurationController.getGlobalStatistics
);

// Get configuration by ID or name
router.get(
  '/:identifier',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigurationAccess,
  adaptiveLimit(RATE_LIMITS.read),
  ConfigurationController.getConfiguration
);

// Update configuration metadata
router.put(
  '/:configId',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  validateConfigurationData,
  configurationOperationLogger('configuration-update'),
  auditOperationComplete('configuration-update'),
  ConfigurationController.updateConfiguration
);

// Delete configuration
router.delete(
  '/:configId',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-delete'),
  auditOperationComplete('configuration-delete'),
  ConfigurationController.deleteConfiguration
);

/**
 * ===============================================================================
 * CONFIGURATION VALUE MANAGEMENT ROUTES
 * Routes for managing individual configuration values
 * ===============================================================================
 */

// Get all configuration values
router.get(
  '/:configId/values',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigurationAccess,
  adaptiveLimit(RATE_LIMITS.read),
  ConfigurationController.getAllConfigurationValues
);

// Get specific configuration value by key
router.get(
  '/:configId/values/:key',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigurationAccess,
  limitByEndpoint(RATE_LIMITS.read),
  ConfigurationController.getConfigurationValue
);

// Set configuration value
router.put(
  '/:configId/values/:key',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  configurationOperationLogger('value-set'),
  auditOperationComplete('value-set'),
  ConfigurationController.setConfigurationValue
);

// Update multiple configuration values (batch)
router.patch(
  '/:configId/values',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  validateConfigurationData,
  configurationOperationLogger('values-batch-update'),
  auditOperationComplete('values-batch-update'),
  ConfigurationController.updateConfigurationValues
);

// Delete configuration key
router.delete(
  '/:configId/values/:key',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  configurationOperationLogger('key-delete'),
  auditOperationComplete('key-delete'),
  ConfigurationController.deleteConfigurationKey
);

// Bulk delete configuration keys
router.post(
  '/:configId/values/bulk-delete',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('keys-bulk-delete'),
  auditOperationComplete('keys-bulk-delete'),
  ConfigurationController.bulkDeleteKeys
);

/**
 * ===============================================================================
 * CONFIGURATION VALIDATION AND TESTING ROUTES
 * Routes for validating and testing configurations
 * ===============================================================================
 */

// Validate configuration
router.post(
  '/:configId/validate',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  configurationOperationLogger('configuration-validate'),
  auditOperationComplete('configuration-validate'),
  ConfigurationController.validateConfiguration
);

// Test configuration
router.post(
  '/:configId/test',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.validation),
  configurationOperationLogger('configuration-test'),
  auditOperationComplete('configuration-test'),
  ConfigurationController.testConfiguration
);

// Dry run configuration changes
router.post(
  '/:configId/dry-run',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.validation),
  configurationOperationLogger('configuration-dry-run'),
  auditOperationComplete('configuration-dry-run'),
  ConfigurationController.dryRunConfiguration
);

// Compare configuration with another
router.post(
  '/:configId/compare',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  configurationOperationLogger('configuration-compare'),
  auditOperationComplete('configuration-compare'),
  ConfigurationController.compareConfigurations
);

// Analyze configuration impact
router.post(
  '/:configId/impact-analysis',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  configurationOperationLogger('impact-analysis'),
  auditOperationComplete('impact-analysis'),
  ConfigurationController.analyzeConfigurationImpact
);

/**
 * ===============================================================================
 * CONFIGURATION LOCKING AND ACCESS CONTROL ROUTES
 * Routes for managing configuration locks and permissions
 * ===============================================================================
 */

// Lock configuration
router.post(
  '/:configId/lock',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-lock'),
  auditOperationComplete('configuration-lock'),
  ConfigurationController.lockConfiguration
);

// Unlock configuration
router.post(
  '/:configId/unlock',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-unlock'),
  auditOperationComplete('configuration-unlock'),
  ConfigurationController.unlockConfiguration
);

// Get lock status
router.get(
  '/:configId/lock-status',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getLockStatus
);

// Set configuration permissions
router.put(
  '/:configId/permissions',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  configurationOperationLogger('permissions-set'),
  auditOperationComplete('permissions-set'),
  ConfigurationController.setConfigurationPermissions
);

// Get configuration permissions
router.get(
  '/:configId/permissions',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getConfigurationPermissions
);

/**
 * ===============================================================================
 * CONFIGURATION VERSION MANAGEMENT ROUTES
 * Routes for managing configuration versions and history
 * ===============================================================================
 */

// Get version history
router.get(
  '/:configId/versions',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getVersionHistory
);

// Get specific version
router.get(
  '/:configId/versions/:version',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getVersion
);

// Get version changes/diff
router.get(
  '/:configId/versions/:version/changes',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.getVersionChanges
);

// Compare versions
router.get(
  '/:configId/versions/compare',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.compareVersions
);

// Rollback to specific version
router.post(
  '/:configId/rollback',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-rollback'),
  auditOperationComplete('configuration-rollback'),
  ConfigurationController.rollbackConfiguration
);

// Create version snapshot
router.post(
  '/:configId/versions/snapshot',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  configurationOperationLogger('version-snapshot'),
  auditOperationComplete('version-snapshot'),
  ConfigurationController.createVersionSnapshot
);

// Tag version
router.post(
  '/:configId/versions/:version/tag',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  configurationOperationLogger('version-tag'),
  auditOperationComplete('version-tag'),
  ConfigurationController.tagVersion
);

// Promote version to environment
router.post(
  '/:configId/versions/:version/promote',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  configurationOperationLogger('version-promote'),
  auditOperationComplete('version-promote'),
  ConfigurationController.promoteVersion
);

/**
 * ===============================================================================
 * CONFIGURATION ENVIRONMENT MANAGEMENT ROUTES
 * Routes for managing environment-specific configurations
 * ===============================================================================
 */

// Get configuration environments
router.get(
  '/:configId/environments',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getConfigurationEnvironments
);

// Get environment-specific configuration
router.get(
  '/:configId/environments/:environment',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigurationAccess,
  adaptiveLimit(RATE_LIMITS.read),
  ConfigurationController.getEnvironmentConfiguration
);

// Set environment-specific value
router.put(
  '/:configId/environments/:environment/values/:key',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  configurationOperationLogger('environment-value-set'),
  auditOperationComplete('environment-value-set'),
  ConfigurationController.setEnvironmentValue
);

// Copy configuration to environment
router.post(
  '/:configId/environments/:environment/copy',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  configurationOperationLogger('configuration-copy-to-environment'),
  auditOperationComplete('configuration-copy-to-environment'),
  ConfigurationController.copyToEnvironment
);

// Sync configuration across environments
router.post(
  '/:configId/sync',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  configurationOperationLogger('configuration-sync'),
  auditOperationComplete('configuration-sync'),
  ConfigurationController.syncConfiguration
);

// Get environment differences
router.get(
  '/:configId/environments/diff',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.getEnvironmentDifferences
);

// Promote configuration between environments
router.post(
  '/:configId/environments/promote',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  configurationOperationLogger('configuration-promote'),
  auditOperationComplete('configuration-promote'),
  ConfigurationController.promoteConfiguration
);

/**
 * ===============================================================================
 * CONFIGURATION IMPORT/EXPORT ROUTES
 * Routes for importing and exporting configurations
 * ===============================================================================
 */

// Export configuration
router.get(
  '/:configId/export',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configurationOperationLogger('configuration-export'),
  async (req, res, next) => {
    // Enhanced audit logging for configuration export
    await auditLogEvent({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration',
        id: req.params.configId,
        name: `Configuration ${req.params.configId}`
      },
      action: 'export',
      result: 'initiated',
      metadata: {
        configId: req.params.configId,
        exportType: 'configuration',
        format: req.query.format || 'json',
        environment: req.query.environment,
        includeVersionHistory: req.query.includeVersionHistory === 'true',
        includeMetadata: req.query.includeMetadata === 'true',
        includeSensitive: req.query.includeSensitive === 'true',
        query: req.query,
        cost: calculateExportCost(req)
      }
    }, req);
    
    return ConfigurationController.exportConfiguration(req, res, next);
  }
);

// Export all configurations
router.get(
  '/export/all',
  authorize(['admin']),
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configurationOperationLogger('configurations-export-all'),
  async (req, res, next) => {
    // Enhanced audit logging for all configurations export
    await auditLogEvent({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration',
        id: 'all',
        name: 'All Configurations'
      },
      action: 'export_all',
      result: 'initiated',
      metadata: {
        exportType: 'all_configurations',
        format: req.query.format || 'json',
        environment: req.query.environment,
        query: req.query,
        cost: calculateExportCost(req)
      }
    }, req);
    
    return ConfigurationController.exportAllConfigurations(req, res, next);
  }
);

// Import configuration from file
router.post(
  '/import',
  authorize(['admin']),
  costBasedLimit(calculateImportCost, RATE_LIMITS.import),
  upload.single('file'),
  fileValidator({
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['application/json', 'text/yaml', 'text/xml', 'text/plain']
  }),
  validateConfigurationData,
  configurationOperationLogger('configuration-import'),
  auditOperationComplete('configuration-import'),
  ConfigurationController.importConfiguration
);

// Import configuration from URL
router.post(
  '/import/url',
  authorize(['admin']),
  costBasedLimit(calculateImportCost, RATE_LIMITS.import),
  validateConfigurationData,
  configurationOperationLogger('configuration-import-url'),
  auditOperationComplete('configuration-import-url'),
  ConfigurationController.importConfigurationFromUrl
);

// Clone configuration
router.post(
  '/:configId/clone',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  validateConfigurationData,
  configurationOperationLogger('configuration-clone'),
  auditOperationComplete('configuration-clone'),
  ConfigurationController.cloneConfiguration
);

// Merge configurations
router.post(
  '/merge',
  authorize(['admin']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  validateConfigurationData,
  configurationOperationLogger('configurations-merge'),
  auditOperationComplete('configurations-merge'),
  ConfigurationController.mergeConfigurations
);

/**
 * ===============================================================================
 * CONFIGURATION BACKUP AND RECOVERY ROUTES
 * Routes for backup and restore operations
 * ===============================================================================
 */

// Create configuration backup
router.post(
  '/:configId/backup',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.backup),
  configurationOperationLogger('configuration-backup'),
  auditOperationComplete('configuration-backup'),
  ConfigurationController.backupConfiguration
);

// List configuration backups
router.get(
  '/:configId/backups',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.listBackups
);

// Restore from backup
router.post(
  '/:configId/restore',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-restore'),
  auditOperationComplete('configuration-restore'),
  ConfigurationController.restoreFromBackup
);

// Delete backup
router.delete(
  '/:configId/backups/:backupId',
  authorize(['admin']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.write),
  configurationOperationLogger('backup-delete'),
  auditOperationComplete('backup-delete'),
  ConfigurationController.deleteBackup
);

// Schedule automatic backups
router.post(
  '/:configId/backup/schedule',
  authorize(['admin']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.backup),
  configurationOperationLogger('backup-schedule'),
  auditOperationComplete('backup-schedule'),
  ConfigurationController.scheduleBackup
);

/**
 * ===============================================================================
 * CONFIGURATION WATCH AND NOTIFICATIONS ROUTES
 * Routes for watching configuration changes
 * ===============================================================================
 */

// Watch configuration for changes
router.post(
  '/:configId/watch',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.default),
  configurationOperationLogger('configuration-watch'),
  auditOperationComplete('configuration-watch'),
  ConfigurationController.watchConfiguration
);

// Unwatch configuration
router.delete(
  '/watch/:watcherId',
  authorize(['admin', 'config-manager', 'application']),
  limitByUser(RATE_LIMITS.default),
  configurationOperationLogger('configuration-unwatch'),
  auditOperationComplete('configuration-unwatch'),
  ConfigurationController.unwatchConfiguration
);

// Get active watchers
router.get(
  '/:configId/watchers',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getWatchers
);

// Subscribe to configuration events
router.post(
  '/:configId/subscribe',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.default),
  configurationOperationLogger('configuration-subscribe'),
  auditOperationComplete('configuration-subscribe'),
  ConfigurationController.subscribeToEvents
);

// Unsubscribe from configuration events
router.delete(
  '/:configId/subscribe/:subscriptionId',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.default),
  configurationOperationLogger('configuration-unsubscribe'),
  auditOperationComplete('configuration-unsubscribe'),
  ConfigurationController.unsubscribeFromEvents
);

/**
 * ===============================================================================
 * CONFIGURATION TEMPLATES ROUTES
 * Routes for managing configuration templates
 * ===============================================================================
 */

// Get available templates
router.get(
  '/templates',
  authorize(['admin', 'config-manager', 'viewer']),
  limitByUser(RATE_LIMITS.template),
  ConfigurationController.getTemplates
);

// Get template details
router.get(
  '/templates/:templateId',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.template),
  ConfigurationController.getTemplateDetails
);

// Create configuration from template
router.post(
  '/templates/:templateId/apply',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.template),
  validateConfigurationData,
  configurationOperationLogger('template-apply'),
  auditOperationComplete('template-apply'),
  ConfigurationController.applyTemplate
);

// Create custom template
router.post(
  '/templates',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.template),
  validateConfigurationData,
  configurationOperationLogger('template-create'),
  auditOperationComplete('template-create'),
  ConfigurationController.createTemplate
);

// Update template
router.put(
  '/templates/:templateId',
  authorize(['admin']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.template),
  validateConfigurationData,
  configurationOperationLogger('template-update'),
  auditOperationComplete('template-update'),
  ConfigurationController.updateTemplate
);

// Delete template
router.delete(
  '/templates/:templateId',
  authorize(['admin']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.template),
  configurationOperationLogger('template-delete'),
  auditOperationComplete('template-delete'),
  ConfigurationController.deleteTemplate
);

/**
 * ===============================================================================
 * CONFIGURATION AUDIT AND COMPLIANCE ROUTES
 * Routes for auditing and compliance checking
 * ===============================================================================
 */

// Get configuration audit trail
router.get(
  '/:configId/audit',
  authorize(['admin', 'auditor', 'config-manager']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getConfigurationAuditTrail
);

// Get configuration change log
router.get(
  '/:configId/changelog',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getChangeLog
);

// Get configuration compliance status
router.get(
  '/:configId/compliance',
  authorize(['admin', 'auditor', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.getComplianceStatus
);

// Run compliance check
router.post(
  '/:configId/compliance/check',
  authorize(['admin', 'auditor']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  configurationOperationLogger('compliance-check'),
  auditOperationComplete('compliance-check'),
  ConfigurationController.runComplianceCheck
);

// Generate compliance report
router.post(
  '/:configId/compliance/report',
  authorize(['admin', 'auditor']),
  validateConfigurationAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configurationOperationLogger('compliance-report'),
  async (req, res, next) => {
    // Enhanced audit logging for compliance report generation
    await auditLogEvent({
      event: 'compliance.report_generated',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration',
        id: req.params.configId,
        name: `Configuration ${req.params.configId}`
      },
      action: 'compliance_report',
      result: 'initiated',
      metadata: {
        configId: req.params.configId,
        reportType: 'compliance',
        standards: req.body?.standards || [],
        includeRecommendations: req.body?.includeRecommendations === 'true',
        format: req.body?.format || 'json'
      }
    }, req);
    
    return ConfigurationController.generateComplianceReport(req, res, next);
  }
);

/**
 * ===============================================================================
 * CONFIGURATION ANALYTICS AND INSIGHTS ROUTES
 * Routes for analytics and usage insights
 * ===============================================================================
 */

// Get configuration usage statistics
router.get(
  '/:configId/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getConfigurationStatistics
);

// Get configuration usage patterns
router.get(
  '/:configId/usage',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.getUsagePatterns
);

// Get configuration dependencies
router.get(
  '/:configId/dependencies',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getDependencies
);

// Get configuration dependents
router.get(
  '/:configId/dependents',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getDependents
);

// Analyze configuration relationships
router.get(
  '/:configId/relationships',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.analyzeRelationships
);

// Get configuration recommendations
router.get(
  '/:configId/recommendations',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  ConfigurationController.getRecommendations
);

/**
 * ===============================================================================
 * CONFIGURATION SCHEMA MANAGEMENT ROUTES
 * Routes for managing configuration schemas
 * ===============================================================================
 */

// Get configuration schema
router.get(
  '/:configId/schema',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getConfigurationSchema
);

// Update configuration schema
router.put(
  '/:configId/schema',
  authorize(['admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  validateConfigurationData,
  configurationOperationLogger('schema-update'),
  auditOperationComplete('schema-update'),
  ConfigurationController.updateConfigurationSchema
);

// Validate against schema
router.post(
  '/:configId/schema/validate',
  authorize(['admin', 'config-manager']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  configurationOperationLogger('schema-validation'),
  auditOperationComplete('schema-validation'),
  ConfigurationController.validateAgainstSchema
);

// Generate schema from values
router.post(
  '/:configId/schema/generate',
  authorize(['admin']),
  validateConfigurationAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.validation),
  configurationOperationLogger('schema-generate'),
  auditOperationComplete('schema-generate'),
  ConfigurationController.generateSchema
);

/**
 * ===============================================================================
 * CONFIGURATION MIGRATION ROUTES
 * Routes for configuration migration operations
 * ===============================================================================
 */

// Create migration plan
router.post(
  '/migrate/plan',
  authorize(['admin']),
  createLimiter(RATE_LIMITS.migration),
  configurationOperationLogger('migration-plan'),
  auditOperationComplete('migration-plan'),
  ConfigurationController.createMigrationPlan
);

// Execute migration
router.post(
  '/migrate/execute',
  authorize(['admin']),
  createLimiter(RATE_LIMITS.migration),
  sensitiveConfigLimit,
  configurationOperationLogger('migration-execute'),
  auditOperationComplete('migration-execute'),
  ConfigurationController.executeMigration
);

// Get migration status
router.get(
  '/migrate/:migrationId/status',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getMigrationStatus
);

// Rollback migration
router.post(
  '/migrate/:migrationId/rollback',
  authorize(['admin']),
  createLimiter(RATE_LIMITS.migration),
  sensitiveConfigLimit,
  configurationOperationLogger('migration-rollback'),
  auditOperationComplete('migration-rollback'),
  ConfigurationController.rollbackMigration
);

/**
 * ===============================================================================
 * CONFIGURATION ENCRYPTION AND SECURITY ROUTES
 * Routes for configuration security operations
 * ===============================================================================
 */

// Encrypt configuration values
router.post(
  '/:configId/encrypt',
  authorize(['admin', 'security-admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-encrypt'),
  auditOperationComplete('configuration-encrypt'),
  ConfigurationController.encryptConfiguration
);

// Decrypt configuration values
router.post(
  '/:configId/decrypt',
  authorize(['admin', 'security-admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  configurationOperationLogger('configuration-decrypt'),
  auditOperationComplete('configuration-decrypt'),
  ConfigurationController.decryptConfiguration
);

// Rotate encryption keys
router.post(
  '/:configId/rotate-keys',
  authorize(['admin', 'security-admin']),
  validateConfigurationAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  configurationOperationLogger('key-rotation'),
  auditOperationComplete('key-rotation'),
  ConfigurationController.rotateEncryptionKeys
);

// Get security status
router.get(
  '/:configId/security',
  authorize(['admin', 'security-admin']),
  validateConfigurationAccess,
  limitByUser(RATE_LIMITS.read),
  ConfigurationController.getSecurityStatus
);

/**
 * ===============================================================================
 * BULK OPERATIONS ROUTES
 * Routes for bulk configuration operations
 * ===============================================================================
 */

// Bulk update configurations
router.post(
  '/bulk/update',
  authorize(['admin']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  validateConfigurationData,
  configurationOperationLogger('bulk-update'),
  auditOperationComplete('bulk-update'),
  ConfigurationController.bulkUpdate
);

// Bulk delete configurations
router.post(
  '/bulk/delete',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  configurationOperationLogger('bulk-delete'),
  auditOperationComplete('bulk-delete'),
  ConfigurationController.bulkDelete
);

// Bulk export configurations
router.post(
  '/bulk/export',
  authorize(['admin', 'config-manager']),
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configurationOperationLogger('bulk-export'),
  async (req, res, next) => {
    // Enhanced audit logging for bulk export
    await auditLogEvent({
      event: 'data.export',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration',
        id: 'bulk',
        name: 'Bulk Configuration Export'
      },
      action: 'bulk_export',
      result: 'initiated',
      metadata: {
        exportType: 'bulk_configuration',
        configIds: req.body?.configIds || [],
        configCount: req.body?.configIds?.length || 0,
        format: req.body?.format || 'json',
        includeEnvironments: req.body?.includeEnvironments === 'true',
        includeVersionHistory: req.body?.includeVersionHistory === 'true',
        cost: calculateExportCost(req)
      }
    }, req);
    
    return ConfigurationController.bulkExport(req, res, next);
  }
);

// Bulk validate configurations
router.post(
  '/bulk/validate',
  authorize(['admin', 'config-manager']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  configurationOperationLogger('bulk-validate'),
  auditOperationComplete('bulk-validate'),
  ConfigurationController.bulkValidate
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
    configId: req.params?.configId,
    key: req.params?.key,
    environment: req.params?.environment,
    version: req.params?.version,
    templateId: req.params?.templateId,
    backupId: req.params?.backupId,
    userId: req.user?.id,
    userRole: req.user?.role,
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'],
    userAgent: req.get('user-agent'),
    ip: req.ip,
    fileUpload: req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : null
  };

  logger.error('Configuration management route error', errorContext);

  // Enhanced audit logging for configuration management errors
  if (err.statusCode >= 500 || err.critical) {
    auditLogEvent({
      event: 'config.error',
      timestamp: new Date().toISOString(),
      actor: req.user || { type: 'system', id: 'unknown' },
      resource: {
        type: 'configuration_route',
        id: req.path,
        name: `${req.method} ${req.path}`
      },
      action: 'error',
      result: 'failure',
      metadata: {
        ...errorContext,
        errorType: err.constructor.name,
        statusCode: err.statusCode || 500,
        configurationContext: {
          conflictCheck: req.configurationConflictCheck,
          dataValidation: req.configurationDataValidation,
          operationContext: req.configurationOperationContext
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
      logger.error('Failed to audit configuration error', {
        auditError: auditError.message,
        originalError: err.message
      });
    });
  }

  // Enhanced error response based on error type and context
  const errorResponses = {
    // Configuration-specific error codes
    'CONFIG_CONFLICT': {
      status: 409,
      message: 'Configuration conflicts with existing configuration',
      data: { conflicts: err.conflicts }
    },
    'CONFIG_LOCKED': {
      status: 423,
      message: 'Configuration is locked and cannot be modified',
      data: { configId: err.configId, lockedBy: err.lockedBy, lockedAt: err.lockedAt }
    },
    'CONFIG_NOT_FOUND': {
      status: 404,
      message: 'Configuration not found',
      data: { configId: err.configId }
    },
    'CONFIG_ACCESS_DENIED': {
      status: 403,
      message: 'Access denied for configuration operation',
      data: { operation: err.operation, required: err.requiredPermissions }
    },
    'CONFIG_VALIDATION_FAILED': {
      status: 400,
      message: 'Configuration validation failed',
      data: { errors: err.validationErrors, warnings: err.validationWarnings }
    },
    'CONFIG_IMPORT_FAILED': {
      status: 400,
      message: 'Configuration import failed',
      data: { format: err.format, importErrors: err.importErrors }
    },
    'CONFIG_EXPORT_FAILED': {
      status: 500,
      message: 'Configuration export failed',
      data: { format: err.format, exportErrors: err.exportErrors }
    },
    'CONFIG_ENCRYPTION_FAILED': {
      status: 500,
      message: 'Configuration encryption operation failed',
      data: { operation: err.operation, affectedKeys: err.affectedKeys }
    },
    'CONFIG_MIGRATION_FAILED': {
      status: 500,
      message: 'Configuration migration failed',
      data: { migrationId: err.migrationId, stage: err.stage, migrationErrors: err.migrationErrors }
    },
    'CONFIG_BACKUP_FAILED': {
      status: 500,
      message: 'Configuration backup operation failed',
      data: { backupId: err.backupId, backupErrors: err.backupErrors }
    }
  };

  // Check for specific configuration error codes
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
  if (err.name === 'ValidationError' || err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.details || err.validationErrors || [],
        timestamp: new Date().toISOString(),
        requestId: req.id || req.headers['x-request-id']
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