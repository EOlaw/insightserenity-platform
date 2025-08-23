'use strict';

/**
 * @fileoverview Configuration management routes for platform administration
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
 * @requires module:shared/lib/utils/async-handler
 * @requires multer
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const configurationController = require('../controllers/configuration-controller');
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
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');

/**
 * Multer configuration for file uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/json', 'text/yaml', 'text/xml', 'application/xml', 'text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, YAML, XML, and plain text files are allowed.'));
    }
  }
});

/**
 * Advanced rate limiting configurations for different configuration operations
 */
const RATE_LIMITS = {
  // Default rate limiting for general configuration operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many configuration requests from this IP, please try again later.',
    headers: true
  },
  
  // High-frequency read operations with adaptive limiting
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 60,
    minMax: 20,
    maxMax: 120,
    message: 'Configuration read rate limit exceeded.',
    headers: true
  },
  
  // Write operations with burst protection
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: 'Configuration write rate limit exceeded.',
    headers: true,
    burstProtection: true
  },
  
  // Import operations with cost-based limiting
  import: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 5000,
    message: 'Configuration import rate limit exceeded.',
    headers: true
  },
  
  // Export operations with cost-based limiting
  export: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 3000,
    message: 'Configuration export rate limit exceeded.',
    headers: true
  },
  
  // Critical configuration operations requiring combined limiting
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Critical configuration operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user']
  },
  
  // Sensitive security operations
  security: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 5,
    message: 'Security operation rate limit exceeded.',
    headers: true
  },
  
  // Bulk operations with higher cost limits
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 10000,
    message: 'Bulk operation cost limit exceeded.',
    headers: true
  },
  
  // Migration operations with strict limits
  migration: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Migration operation rate limit exceeded.',
    headers: true
  }
};

/**
 * Cost calculator for configuration operations
 */
const calculateConfigurationCost = (req) => {
  let cost = 10; // Base cost
  
  // Increase cost based on operation complexity
  if (req.path.includes('bulk')) cost += 100;
  if (req.path.includes('import')) cost += 50;
  if (req.path.includes('export')) cost += 30;
  if (req.path.includes('migrate')) cost += 200;
  if (req.path.includes('encrypt') || req.path.includes('decrypt')) cost += 75;
  if (req.path.includes('validate') || req.path.includes('compliance')) cost += 25;
  
  // Increase cost based on request body size
  if (req.body && JSON.stringify(req.body).length > 10000) {
    cost += Math.floor(JSON.stringify(req.body).length / 1000);
  }
  
  // Increase cost for batch operations
  if (req.body && req.body.items && Array.isArray(req.body.items)) {
    cost += req.body.items.length * 5;
  }
  
  return cost;
};

/**
 * Cost calculator for export operations
 */
const calculateExportCost = (req) => {
  let cost = 50; // Base export cost
  
  // Increase cost based on export scope
  if (req.path.includes('/export/all')) cost += 300;
  if (req.path.includes('bulk/export')) cost += 200;
  
  // Increase cost based on requested format complexity
  if (req.query.format === 'xml') cost += 20;
  if (req.query.includeHistory === 'true') cost += 50;
  if (req.query.includeMetadata === 'true') cost += 30;
  
  return cost;
};

/**
 * Configuration operation logger middleware
 */
const configOperationLogger = (operation) => {
  return asyncHandler(async (req, res, next) => {
    logger.info(`Configuration operation initiated: ${operation}`, {
      operation,
      configId: req.params.configId,
      key: req.params.key,
      userId: req.user?.id,
      ip: req.ip,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    // Enhanced audit logging for critical configuration operations
    const criticalOperations = [
      'configuration-create', 'configuration-update', 'configuration-delete',
      'configuration-import', 'configuration-export', 'configuration-backup',
      'configuration-restore', 'configuration-encrypt', 'configuration-decrypt',
      'migration-execute', 'bulk-update', 'bulk-delete', 'schema-update'
    ];

    if (criticalOperations.includes(operation)) {
      await auditLogEvent({
        event: `config.${operation.replace('-', '_')}`,
        timestamp: new Date().toISOString(),
        actor: req.user || { type: 'system', id: 'unknown' },
        resource: {
          type: 'configuration',
          id: req.params.configId || 'multiple',
          name: req.params.configId ? `Configuration ${req.params.configId}` : 'Multiple Configurations'
        },
        action: operation,
        result: 'initiated',
        metadata: {
          operation,
          configId: req.params.configId,
          key: req.params.key,
          environment: req.params.environment,
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
 * Middleware to track configuration changes with enhanced audit logging
 */
const trackConfigurationChange = (changeType) => {
  return asyncHandler(async (req, res, next) => {
    req.configChangeTracking = {
      changeType,
      timestamp: new Date(),
      userId: req.user?.id,
      previousValue: null, // Will be populated if needed
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        sessionId: req.sessionID
      }
    };

    // Audit configuration change tracking
    await auditLogEvent({
      event: 'config.change_tracking_started',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration',
        id: req.params.configId || 'unknown',
        name: `Configuration ${req.params.configId || 'Unknown'}`
      },
      action: 'change_tracking',
      result: 'initiated',
      metadata: {
        changeType,
        configId: req.params.configId,
        trackingId: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    }, req);

    next();
  });
};

/**
 * Middleware to validate configuration access permissions with audit logging
 */
const validateConfigAccess = asyncHandler(async (req, res, next) => {
  const { configId } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  
  // Check if configuration requires special permissions
  if (configId && configId.startsWith('secure_') && !['admin', 'security-admin'].includes(userRole)) {
    logger.warn('Unauthorized access attempt to secure configuration', {
      configId,
      userId,
      userRole
    });

    // Audit unauthorized access attempt
    await auditLogEvent({
      event: 'authz.access_denied',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'secure_configuration',
        id: configId,
        name: `Secure Configuration ${configId}`
      },
      action: 'access_attempt',
      result: 'failure',
      metadata: {
        reason: 'insufficient_permissions',
        requiredRoles: ['admin', 'security-admin'],
        userRole,
        configId
      }
    }, req);
    
    return res.status(403).json({
      success: false,
      message: 'Access denied to secure configuration'
    });
  }

  // Audit successful access validation
  if (configId && userId) {
    await auditLogEvent({
      event: 'authz.config_access_validated',
      timestamp: new Date().toISOString(),
      actor: req.user,
      resource: {
        type: 'configuration',
        id: configId,
        name: `Configuration ${configId}`
      },
      action: 'access_validation',
      result: 'success',
      metadata: {
        configId,
        userId,
        userRole,
        requestPath: req.path
      }
    }, req);
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
        event: `config.${operation.replace('-', '_')}_complete`,
        timestamp: new Date().toISOString(),
        actor: req.user || { type: 'system', id: 'unknown' },
        resource: {
          type: 'configuration',
          id: req.params.configId || 'multiple',
          name: req.params.configId ? `Configuration ${req.params.configId}` : 'Multiple Configurations'
        },
        action: `${operation}_complete`,
        result: result,
        metadata: {
          operation,
          statusCode: res.statusCode,
          configId: req.params.configId,
          key: req.params.key,
          environment: req.params.environment,
          responseSize: body ? body.length : 0,
          changeTracking: req.configChangeTracking
        }
      }, req).catch(error => {
        logger.error('Failed to log configuration operation completion audit', {
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
 * Custom rate limiter for sensitive configuration operations
 */
const sensitiveConfigLimit = customLimit('sensitive_config', (req) => {
  // Apply stricter limits for sensitive configuration operations
  const sensitiveEndpoints = [
    '/encrypt', '/decrypt', '/rotate-keys', '/permissions',
    '/backup', '/restore', '/migrate', '/security',
    '/lock', '/unlock', '/rollback'
  ];
  
  const isSensitive = sensitiveEndpoints.some(endpoint => req.path.includes(endpoint));
  
  if (isSensitive) {
    return {
      windowMs: 20 * 60 * 1000, // 20 minutes
      max: 3,
      message: 'Sensitive configuration operation rate limit exceeded',
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
  service: 'configuration-management',
  includeBody: true,
  includeQuery: true,
  sensitiveFields: ['password', 'apiKey', 'secret', 'token', 'privateKey', 'certificate', 'value'],
  skip: (req) => {
    // Skip audit logging for high-frequency read-only endpoints
    return req.method === 'GET' && req.path.match(/\/(statistics|usage|status)$/) && 
           !req.path.includes('audit') && !req.path.includes('compliance');
  }
}));

/**
 * Configuration CRUD Operations
 */

// Create new configuration
router.post(
  '/',
  authorize(['admin', 'config-manager']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  trackConfigurationChange('create'),
  configOperationLogger('configuration-create'),
  auditOperationComplete('configuration-create'),
  asyncHandler(configurationController.createConfiguration)
);

// List all configurations
router.get(
  '/',
  authorize(['admin', 'config-manager', 'viewer']),
  adaptiveLimit(RATE_LIMITS.read),
  asyncHandler(configurationController.listConfigurations)
);

// Search configuration values
router.get(
  '/search',
  authorize(['admin', 'config-manager']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.searchConfigurationValues)
);

// Get configuration statistics (global)
router.get(
  '/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  limitByUser(RATE_LIMITS.default),
  asyncHandler(configurationController.getGlobalStatistics)
);

// Get configuration by ID or name
router.get(
  '/:identifier',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  adaptiveLimit(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfiguration)
);

// Update configuration metadata
router.put(
  '/:configId',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  trackConfigurationChange('update'),
  configOperationLogger('configuration-update'),
  auditOperationComplete('configuration-update'),
  asyncHandler(configurationController.updateConfiguration)
);

// Delete configuration
router.delete(
  '/:configId',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  trackConfigurationChange('delete'),
  configOperationLogger('configuration-delete'),
  auditOperationComplete('configuration-delete'),
  asyncHandler(configurationController.deleteConfiguration)
);

/**
 * Configuration Value Management
 */

// Get configuration value by key
router.get(
  '/:configId/values/:key',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  limitByEndpoint(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfigurationValue)
);

// Get all configuration values
router.get(
  '/:configId/values',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  adaptiveLimit(RATE_LIMITS.read),
  asyncHandler(configurationController.getAllConfigurationValues)
);

// Set configuration value
router.put(
  '/:configId/values/:key',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  trackConfigurationChange('value-update'),
  configOperationLogger('value-set'),
  auditOperationComplete('value-set'),
  asyncHandler(configurationController.setConfigurationValue)
);

// Update multiple configuration values (batch)
router.patch(
  '/:configId/values',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  trackConfigurationChange('batch-update'),
  configOperationLogger('values-batch-update'),
  auditOperationComplete('values-batch-update'),
  asyncHandler(configurationController.updateConfigurationValues)
);

// Delete configuration key
router.delete(
  '/:configId/values/:key',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  trackConfigurationChange('key-delete'),
  configOperationLogger('key-delete'),
  auditOperationComplete('key-delete'),
  asyncHandler(configurationController.deleteConfigurationKey)
);

// Bulk delete configuration keys
router.post(
  '/:configId/values/bulk-delete',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  trackConfigurationChange('bulk-delete'),
  configOperationLogger('keys-bulk-delete'),
  auditOperationComplete('keys-bulk-delete'),
  asyncHandler(configurationController.bulkDeleteKeys)
);

/**
 * Configuration Validation and Testing
 */

// Validate configuration
router.post(
  '/:configId/validate',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  configOperationLogger('configuration-validate'),
  asyncHandler(configurationController.validateConfiguration)
);

// Test configuration
router.post(
  '/:configId/test',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.default),
  configOperationLogger('configuration-test'),
  asyncHandler(configurationController.testConfiguration)
);

// Dry run configuration changes
router.post(
  '/:configId/dry-run',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.default),
  configOperationLogger('configuration-dry-run'),
  asyncHandler(configurationController.dryRunConfiguration)
);

// Compare configuration with another
router.post(
  '/:configId/compare',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.compareConfigurations)
);

// Analyze configuration impact
router.post(
  '/:configId/impact-analysis',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  configOperationLogger('impact-analysis'),
  asyncHandler(configurationController.analyzeConfigurationImpact)
);

/**
 * Configuration Locking and Access Control
 */

// Lock configuration
router.post(
  '/:configId/lock',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  trackConfigurationChange('lock'),
  configOperationLogger('configuration-lock'),
  auditOperationComplete('configuration-lock'),
  asyncHandler(configurationController.lockConfiguration)
);

// Unlock configuration
router.post(
  '/:configId/unlock',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  trackConfigurationChange('unlock'),
  configOperationLogger('configuration-unlock'),
  auditOperationComplete('configuration-unlock'),
  asyncHandler(configurationController.unlockConfiguration)
);

// Get lock status
router.get(
  '/:configId/lock-status',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getLockStatus)
);

// Set configuration permissions
router.put(
  '/:configId/permissions',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  trackConfigurationChange('permissions-update'),
  configOperationLogger('permissions-set'),
  auditOperationComplete('permissions-set'),
  asyncHandler(configurationController.setConfigurationPermissions)
);

// Get configuration permissions
router.get(
  '/:configId/permissions',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfigurationPermissions)
);

/**
 * Configuration Version Management
 */

// Get version history
router.get(
  '/:configId/versions',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getVersionHistory)
);

// Get specific version
router.get(
  '/:configId/versions/:version',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getVersion)
);

// Get version changes/diff
router.get(
  '/:configId/versions/:version/changes',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.getVersionChanges)
);

// Compare versions
router.get(
  '/:configId/versions/compare',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.compareVersions)
);

// Rollback to specific version
router.post(
  '/:configId/rollback',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  trackConfigurationChange('rollback'),
  configOperationLogger('configuration-rollback'),
  auditOperationComplete('configuration-rollback'),
  asyncHandler(configurationController.rollbackConfiguration)
);

// Create version snapshot
router.post(
  '/:configId/versions/snapshot',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  trackConfigurationChange('snapshot-create'),
  configOperationLogger('version-snapshot'),
  auditOperationComplete('version-snapshot'),
  asyncHandler(configurationController.createVersionSnapshot)
);

// Tag version
router.post(
  '/:configId/versions/:version/tag',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  configOperationLogger('version-tag'),
  asyncHandler(configurationController.tagVersion)
);

// Promote version to environment
router.post(
  '/:configId/versions/:version/promote',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  trackConfigurationChange('version-promote'),
  configOperationLogger('version-promote'),
  auditOperationComplete('version-promote'),
  asyncHandler(configurationController.promoteVersion)
);

/**
 * Configuration Environment Management
 */

// Get configuration environments
router.get(
  '/:configId/environments',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfigurationEnvironments)
);

// Get environment-specific configuration
router.get(
  '/:configId/environments/:environment',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  adaptiveLimit(RATE_LIMITS.read),
  asyncHandler(configurationController.getEnvironmentConfiguration)
);

// Set environment-specific value
router.put(
  '/:configId/environments/:environment/values/:key',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  trackConfigurationChange('environment-value-update'),
  configOperationLogger('environment-value-set'),
  auditOperationComplete('environment-value-set'),
  asyncHandler(configurationController.setEnvironmentValue)
);

// Copy configuration to environment
router.post(
  '/:configId/environments/:environment/copy',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  trackConfigurationChange('environment-copy'),
  configOperationLogger('configuration-copy-to-environment'),
  auditOperationComplete('configuration-copy-to-environment'),
  asyncHandler(configurationController.copyToEnvironment)
);

// Sync configuration across environments
router.post(
  '/:configId/sync',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  trackConfigurationChange('sync'),
  configOperationLogger('configuration-sync'),
  auditOperationComplete('configuration-sync'),
  asyncHandler(configurationController.syncConfiguration)
);

// Get environment differences
router.get(
  '/:configId/environments/diff',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.getEnvironmentDifferences)
);

// Promote configuration between environments
router.post(
  '/:configId/environments/promote',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  trackConfigurationChange('environment-promote'),
  configOperationLogger('configuration-promote'),
  auditOperationComplete('configuration-promote'),
  asyncHandler(configurationController.promoteConfiguration)
);

/**
 * Configuration Import/Export Routes
 */

// Export configuration
router.get(
  '/:configId/export',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configOperationLogger('configuration-export'),
  asyncHandler(async (req, res, next) => {
    // Audit configuration export
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
        query: req.query
      }
    }, req);
    
    return configurationController.exportConfiguration(req, res, next);
  })
);

// Export all configurations
router.get(
  '/export/all',
  authorize(['admin']),
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configOperationLogger('configurations-export-all'),
  asyncHandler(async (req, res, next) => {
    // Audit all configurations export
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
        query: req.query
      }
    }, req);
    
    return configurationController.exportAllConfigurations(req, res, next);
  })
);

// Import configuration
router.post(
  '/import',
  authorize(['admin']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.import),
  upload.single('file'),
  fileValidator({
    maxSize: 10 * 1024 * 1024,
    allowedTypes: ['application/json', 'text/yaml', 'text/xml', 'text/plain']
  }),
  trackConfigurationChange('import'),
  configOperationLogger('configuration-import'),
  auditOperationComplete('configuration-import'),
  asyncHandler(configurationController.importConfiguration)
);

// Import configuration from URL
router.post(
  '/import/url',
  authorize(['admin']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.import),
  trackConfigurationChange('import-url'),
  configOperationLogger('configuration-import-url'),
  auditOperationComplete('configuration-import-url'),
  asyncHandler(configurationController.importConfigurationFromUrl)
);

// Clone configuration
router.post(
  '/:configId/clone',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  trackConfigurationChange('clone'),
  configOperationLogger('configuration-clone'),
  auditOperationComplete('configuration-clone'),
  asyncHandler(configurationController.cloneConfiguration)
);

// Merge configurations
router.post(
  '/merge',
  authorize(['admin']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  trackConfigurationChange('merge'),
  configOperationLogger('configurations-merge'),
  auditOperationComplete('configurations-merge'),
  asyncHandler(configurationController.mergeConfigurations)
);

/**
 * Configuration Backup and Recovery
 */

// Create configuration backup
router.post(
  '/:configId/backup',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  sensitiveConfigLimit,
  trackConfigurationChange('backup'),
  configOperationLogger('configuration-backup'),
  auditOperationComplete('configuration-backup'),
  asyncHandler(configurationController.backupConfiguration)
);

// List configuration backups
router.get(
  '/:configId/backups',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.listBackups)
);

// Restore from backup
router.post(
  '/:configId/restore',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  sensitiveConfigLimit,
  trackConfigurationChange('restore'),
  configOperationLogger('configuration-restore'),
  auditOperationComplete('configuration-restore'),
  asyncHandler(configurationController.restoreFromBackup)
);

// Delete backup
router.delete(
  '/:configId/backups/:backupId',
  authorize(['admin']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  configOperationLogger('backup-delete'),
  auditOperationComplete('backup-delete'),
  asyncHandler(configurationController.deleteBackup)
);

// Schedule automatic backups
router.post(
  '/:configId/backup/schedule',
  authorize(['admin']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.write),
  configOperationLogger('backup-schedule'),
  auditOperationComplete('backup-schedule'),
  asyncHandler(configurationController.scheduleBackup)
);

/**
 * Configuration Watch and Notifications
 */

// Watch configuration for changes
router.post(
  '/:configId/watch',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.default),
  configOperationLogger('configuration-watch'),
  asyncHandler(configurationController.watchConfiguration)
);

// Unwatch configuration
router.delete(
  '/watch/:watcherId',
  authorize(['admin', 'config-manager', 'application']),
  limitByUser(RATE_LIMITS.default),
  configOperationLogger('configuration-unwatch'),
  asyncHandler(configurationController.unwatchConfiguration)
);

// Get active watchers
router.get(
  '/:configId/watchers',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getWatchers)
);

// Subscribe to configuration events
router.post(
  '/:configId/subscribe',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.default),
  configOperationLogger('configuration-subscribe'),
  asyncHandler(configurationController.subscribeToEvents)
);

// Unsubscribe from configuration events
router.delete(
  '/:configId/subscribe/:subscriptionId',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.default),
  configOperationLogger('configuration-unsubscribe'),
  asyncHandler(configurationController.unsubscribeFromEvents)
);

/**
 * Configuration Templates
 */

// Get available templates
router.get(
  '/templates',
  authorize(['admin', 'config-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getTemplates)
);

// Get template details
router.get(
  '/templates/:templateId',
  authorize(['admin', 'config-manager', 'viewer']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getTemplateDetails)
);

// Create configuration from template
router.post(
  '/templates/:templateId/apply',
  authorize(['admin', 'config-manager']),
  limitByUser(RATE_LIMITS.write),
  trackConfigurationChange('template-apply'),
  configOperationLogger('template-apply'),
  auditOperationComplete('template-apply'),
  asyncHandler(configurationController.applyTemplate)
);

// Create custom template
router.post(
  '/templates',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  configOperationLogger('template-create'),
  auditOperationComplete('template-create'),
  asyncHandler(configurationController.createTemplate)
);

// Update template
router.put(
  '/templates/:templateId',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  configOperationLogger('template-update'),
  auditOperationComplete('template-update'),
  asyncHandler(configurationController.updateTemplate)
);

// Delete template
router.delete(
  '/templates/:templateId',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.write),
  configOperationLogger('template-delete'),
  auditOperationComplete('template-delete'),
  asyncHandler(configurationController.deleteTemplate)
);

/**
 * Configuration Audit and Compliance
 */

// Get configuration audit trail
router.get(
  '/:configId/audit',
  authorize(['admin', 'auditor', 'config-manager']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfigurationAuditTrail)
);

// Get configuration change log
router.get(
  '/:configId/changelog',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getChangeLog)
);

// Get configuration compliance status
router.get(
  '/:configId/compliance',
  authorize(['admin', 'auditor', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.getComplianceStatus)
);

// Run compliance check
router.post(
  '/:configId/compliance/check',
  authorize(['admin', 'auditor']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  configOperationLogger('compliance-check'),
  asyncHandler(configurationController.runComplianceCheck)
);

// Generate compliance report
router.post(
  '/:configId/compliance/report',
  authorize(['admin', 'auditor']),
  validateConfigAccess,
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configOperationLogger('compliance-report'),
  asyncHandler(async (req, res, next) => {
    // Audit compliance report generation
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
        standards: req.body?.standards || []
      }
    }, req);
    
    return configurationController.generateComplianceReport(req, res, next);
  })
);

/**
 * Configuration Analytics and Insights
 */

// Get configuration usage statistics
router.get(
  '/:configId/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfigurationStatistics)
);

// Get configuration usage patterns
router.get(
  '/:configId/usage',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.getUsagePatterns)
);

// Get configuration dependencies
router.get(
  '/:configId/dependencies',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getDependencies)
);

// Get configuration dependents
router.get(
  '/:configId/dependents',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getDependents)
);

// Analyze configuration relationships
router.get(
  '/:configId/relationships',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.analyzeRelationships)
);

// Get configuration recommendations
router.get(
  '/:configId/recommendations',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.getRecommendations)
);

/**
 * Configuration Schema Management
 */

// Get configuration schema
router.get(
  '/:configId/schema',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getConfigurationSchema)
);

// Update configuration schema
router.put(
  '/:configId/schema',
  authorize(['admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  trackConfigurationChange('schema-update'),
  configOperationLogger('schema-update'),
  auditOperationComplete('schema-update'),
  asyncHandler(configurationController.updateConfigurationSchema)
);

// Validate against schema
router.post(
  '/:configId/schema/validate',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  asyncHandler(configurationController.validateAgainstSchema)
);

// Generate schema from values
router.post(
  '/:configId/schema/generate',
  authorize(['admin']),
  validateConfigAccess,
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.default),
  configOperationLogger('schema-generate'),
  auditOperationComplete('schema-generate'),
  asyncHandler(configurationController.generateSchema)
);

/**
 * Configuration Migration
 */

// Create migration plan
router.post(
  '/migrate/plan',
  authorize(['admin']),
  createLimiter(RATE_LIMITS.migration),
  configOperationLogger('migration-plan'),
  asyncHandler(configurationController.createMigrationPlan)
);

// Execute migration
router.post(
  '/migrate/execute',
  authorize(['admin']),
  createLimiter(RATE_LIMITS.migration),
  trackConfigurationChange('migration'),
  configOperationLogger('migration-execute'),
  auditOperationComplete('migration-execute'),
  asyncHandler(configurationController.executeMigration)
);

// Get migration status
router.get(
  '/migrate/:migrationId/status',
  authorize(['admin']),
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getMigrationStatus)
);

// Rollback migration
router.post(
  '/migrate/:migrationId/rollback',
  authorize(['admin']),
  createLimiter(RATE_LIMITS.migration),
  sensitiveConfigLimit,
  trackConfigurationChange('migration-rollback'),
  configOperationLogger('migration-rollback'),
  auditOperationComplete('migration-rollback'),
  asyncHandler(configurationController.rollbackMigration)
);

/**
 * Configuration Encryption and Security
 */

// Encrypt configuration values
router.post(
  '/:configId/encrypt',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  trackConfigurationChange('encrypt'),
  configOperationLogger('configuration-encrypt'),
  auditOperationComplete('configuration-encrypt'),
  asyncHandler(configurationController.encryptConfiguration)
);

// Decrypt configuration values
router.post(
  '/:configId/decrypt',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  configOperationLogger('configuration-decrypt'),
  auditOperationComplete('configuration-decrypt'),
  asyncHandler(configurationController.decryptConfiguration)
);

// Rotate encryption keys
router.post(
  '/:configId/rotate-keys',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  combinedLimit(['ip', 'user'], RATE_LIMITS.security),
  sensitiveConfigLimit,
  trackConfigurationChange('key-rotation'),
  configOperationLogger('key-rotation'),
  auditOperationComplete('key-rotation'),
  asyncHandler(configurationController.rotateEncryptionKeys)
);

// Get security status
router.get(
  '/:configId/security',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  limitByUser(RATE_LIMITS.read),
  asyncHandler(configurationController.getSecurityStatus)
);

/**
 * Bulk Operations
 */

// Bulk update configurations
router.post(
  '/bulk/update',
  authorize(['admin']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  trackConfigurationChange('bulk-update'),
  configOperationLogger('bulk-update'),
  auditOperationComplete('bulk-update'),
  asyncHandler(configurationController.bulkUpdate)
);

// Bulk delete configurations
router.post(
  '/bulk/delete',
  authorize(['admin']),
  combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  trackConfigurationChange('bulk-delete'),
  configOperationLogger('bulk-delete'),
  auditOperationComplete('bulk-delete'),
  asyncHandler(configurationController.bulkDelete)
);

// Bulk export configurations
router.post(
  '/bulk/export',
  authorize(['admin', 'config-manager']),
  costBasedLimit(calculateExportCost, RATE_LIMITS.export),
  configOperationLogger('bulk-export'),
  asyncHandler(async (req, res, next) => {
    // Audit bulk export
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
        format: req.body?.format || 'json'
      }
    }, req);
    
    return configurationController.bulkExport(req, res, next);
  })
);

// Bulk validate configurations
router.post(
  '/bulk/validate',
  authorize(['admin', 'config-manager']),
  costBasedLimit(calculateConfigurationCost, RATE_LIMITS.bulk),
  asyncHandler(configurationController.bulkValidate)
);

/**
 * Error handling middleware
 */
router.use((err, req, res, next) => {
  logger.error('Configuration management route error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    configId: req.params?.configId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Audit configuration management errors
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
        error: err.message,
        statusCode: err.statusCode,
        configId: req.params?.configId,
        configTracking: req.configChangeTracking,
        critical: err.critical || false
      }
    }, req).catch(auditError => {
      logger.error('Failed to audit configuration error', {
        auditError: auditError.message
      });
    });
  }

  // Handle file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File size exceeds maximum allowed size of 10MB'
    });
  }

  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(415).json({
      success: false,
      message: err.message
    });
  }

  next(err);
});

// Export router
module.exports = router;