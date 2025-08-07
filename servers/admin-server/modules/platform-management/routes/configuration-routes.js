'use strict';

/**
 * @fileoverview Configuration management routes for platform administration
 * @module servers/admin-server/modules/platform-management/routes/configuration-routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/controllers/configuration-controller
 * @requires module:servers/admin-server/modules/platform-management/validators/configuration-validators
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
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
const { configurationValidators } = require('../validators');
const authenticate = require('../../../../../shared/lib/auth/middleware/authenticate');
const authorize = require('../../../../../shared/lib/auth/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/auth/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const requestSanitizer = require('../../../../../shared/lib/middleware/security/request-sanitizer');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const fileValidator = require('../../../../../shared/lib/middleware/validation/file-validator');
const logger = require('../../../../../shared/lib/utils/logger');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');

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
 * Rate limiting configurations for different endpoint types
 */
const RATE_LIMITS = {
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many configuration requests from this IP, please try again later.'
  },
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Configuration read rate limit exceeded.'
  },
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    message: 'Configuration write rate limit exceeded.'
  },
  import: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Configuration import rate limit exceeded.'
  },
  export: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10,
    message: 'Configuration export rate limit exceeded.'
  },
  sensitive: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Sensitive configuration operation rate limit exceeded.'
  }
};

/**
 * Configuration operation logger middleware
 */
const configOperationLogger = (operation) => {
  return (req, res, next) => {
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
    next();
  };
};

/**
 * Middleware to track configuration changes
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
    next();
  });
};

/**
 * Middleware to validate configuration access permissions
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
    return res.status(403).json({
      success: false,
      message: 'Access denied to secure configuration'
    });
  }
  
  next();
});

/**
 * Apply global middleware to all routes
 */
router.use(authenticate);
router.use(requestSanitizer());
router.use(auditLogger({
  service: 'configuration-management',
  includeBody: true,
  includeQuery: true,
  sensitiveFields: ['password', 'apiKey', 'secret', 'token', 'privateKey', 'certificate']
}));

/**
 * Configuration CRUD Operations
 */

// Create new configuration
router.post(
  '/',
  authorize(['admin', 'config-manager']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.createConfiguration),
  trackConfigurationChange('create'),
  configOperationLogger('configuration-create'),
  asyncHandler(configurationController.createConfiguration)
);

// List all configurations
router.get(
  '/',
  authorize(['admin', 'config-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.listConfigurations),
  asyncHandler(configurationController.listConfigurations)
);

// Search configuration values
router.get(
  '/search',
  authorize(['admin', 'config-manager']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.searchConfigurationValues),
  asyncHandler(configurationController.searchConfigurationValues)
);

// Get configuration statistics (global)
router.get(
  '/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.getGlobalStatistics),
  asyncHandler(configurationController.getGlobalStatistics)
);

// Get configuration by ID or name
router.get(
  '/:identifier',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfiguration),
  asyncHandler(configurationController.getConfiguration)
);

// Update configuration metadata
router.put(
  '/:configId',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.updateConfiguration),
  trackConfigurationChange('update'),
  configOperationLogger('configuration-update'),
  asyncHandler(configurationController.updateConfiguration)
);

// Delete configuration
router.delete(
  '/:configId',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.deleteConfiguration),
  trackConfigurationChange('delete'),
  configOperationLogger('configuration-delete'),
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
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfigurationValue),
  asyncHandler(configurationController.getConfigurationValue)
);

// Get all configuration values
router.get(
  '/:configId/values',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getAllConfigurationValues),
  asyncHandler(configurationController.getAllConfigurationValues)
);

// Set configuration value
router.put(
  '/:configId/values/:key',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.setConfigurationValue),
  trackConfigurationChange('value-update'),
  configOperationLogger('value-set'),
  asyncHandler(configurationController.setConfigurationValue)
);

// Update multiple configuration values (batch)
router.patch(
  '/:configId/values',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.updateConfigurationValues),
  trackConfigurationChange('batch-update'),
  configOperationLogger('values-batch-update'),
  asyncHandler(configurationController.updateConfigurationValues)
);

// Delete configuration key
router.delete(
  '/:configId/values/:key',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.deleteConfigurationKey),
  trackConfigurationChange('key-delete'),
  configOperationLogger('key-delete'),
  asyncHandler(configurationController.deleteConfigurationKey)
);

// Bulk delete configuration keys
router.post(
  '/:configId/values/bulk-delete',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.bulkDeleteKeys),
  trackConfigurationChange('bulk-delete'),
  configOperationLogger('keys-bulk-delete'),
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
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.validateConfiguration),
  configOperationLogger('configuration-validate'),
  asyncHandler(configurationController.validateConfiguration)
);

// Test configuration
router.post(
  '/:configId/test',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.testConfiguration),
  configOperationLogger('configuration-test'),
  asyncHandler(configurationController.testConfiguration)
);

// Dry run configuration changes
router.post(
  '/:configId/dry-run',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.dryRunConfiguration),
  configOperationLogger('configuration-dry-run'),
  asyncHandler(configurationController.dryRunConfiguration)
);

// Compare configuration with another
router.post(
  '/:configId/compare',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.compareConfigurations),
  asyncHandler(configurationController.compareConfigurations)
);

// Analyze configuration impact
router.post(
  '/:configId/impact-analysis',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.analyzeConfigurationImpact),
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
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.lockConfiguration),
  trackConfigurationChange('lock'),
  configOperationLogger('configuration-lock'),
  asyncHandler(configurationController.lockConfiguration)
);

// Unlock configuration
router.post(
  '/:configId/unlock',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.unlockConfiguration),
  trackConfigurationChange('unlock'),
  configOperationLogger('configuration-unlock'),
  asyncHandler(configurationController.unlockConfiguration)
);

// Get lock status
router.get(
  '/:configId/lock-status',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getLockStatus),
  asyncHandler(configurationController.getLockStatus)
);

// Set configuration permissions
router.put(
  '/:configId/permissions',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.setConfigurationPermissions),
  trackConfigurationChange('permissions-update'),
  configOperationLogger('permissions-set'),
  asyncHandler(configurationController.setConfigurationPermissions)
);

// Get configuration permissions
router.get(
  '/:configId/permissions',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfigurationPermissions),
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
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getVersionHistory),
  asyncHandler(configurationController.getVersionHistory)
);

// Get specific version
router.get(
  '/:configId/versions/:version',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getVersion),
  asyncHandler(configurationController.getVersion)
);

// Get version changes/diff
router.get(
  '/:configId/versions/:version/changes',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getVersionChanges),
  asyncHandler(configurationController.getVersionChanges)
);

// Compare versions
router.get(
  '/:configId/versions/compare',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.compareVersions),
  asyncHandler(configurationController.compareVersions)
);

// Rollback to specific version
router.post(
  '/:configId/rollback',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.rollbackConfiguration),
  trackConfigurationChange('rollback'),
  configOperationLogger('configuration-rollback'),
  asyncHandler(configurationController.rollbackConfiguration)
);

// Create version snapshot
router.post(
  '/:configId/versions/snapshot',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.createVersionSnapshot),
  trackConfigurationChange('snapshot-create'),
  configOperationLogger('version-snapshot'),
  asyncHandler(configurationController.createVersionSnapshot)
);

// Tag version
router.post(
  '/:configId/versions/:version/tag',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.tagVersion),
  configOperationLogger('version-tag'),
  asyncHandler(configurationController.tagVersion)
);

// Promote version to environment
router.post(
  '/:configId/versions/:version/promote',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.promoteVersion),
  trackConfigurationChange('version-promote'),
  configOperationLogger('version-promote'),
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
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfigurationEnvironments),
  asyncHandler(configurationController.getConfigurationEnvironments)
);

// Get environment-specific configuration
router.get(
  '/:configId/environments/:environment',
  authorize(['admin', 'config-manager', 'viewer', 'application']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getEnvironmentConfiguration),
  asyncHandler(configurationController.getEnvironmentConfiguration)
);

// Set environment-specific value
router.put(
  '/:configId/environments/:environment/values/:key',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.setEnvironmentValue),
  trackConfigurationChange('environment-value-update'),
  configOperationLogger('environment-value-set'),
  asyncHandler(configurationController.setEnvironmentValue)
);

// Copy configuration to environment
router.post(
  '/:configId/environments/:environment/copy',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.copyToEnvironment),
  trackConfigurationChange('environment-copy'),
  configOperationLogger('configuration-copy-to-environment'),
  asyncHandler(configurationController.copyToEnvironment)
);

// Sync configuration across environments
router.post(
  '/:configId/sync',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.syncConfiguration),
  trackConfigurationChange('sync'),
  configOperationLogger('configuration-sync'),
  asyncHandler(configurationController.syncConfiguration)
);

// Get environment differences
router.get(
  '/:configId/environments/diff',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getEnvironmentDifferences),
  asyncHandler(configurationController.getEnvironmentDifferences)
);

// Promote configuration between environments
router.post(
  '/:configId/environments/promote',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.promoteConfiguration),
  trackConfigurationChange('environment-promote'),
  configOperationLogger('configuration-promote'),
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
  rateLimit(RATE_LIMITS.export),
  requestValidator(configurationValidators.exportConfiguration),
  configOperationLogger('configuration-export'),
  asyncHandler(configurationController.exportConfiguration)
);

// Export all configurations
router.get(
  '/export/all',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.export),
  requestValidator(configurationValidators.exportAllConfigurations),
  configOperationLogger('configurations-export-all'),
  asyncHandler(configurationController.exportAllConfigurations)
);

// Import configuration
router.post(
  '/import',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.import),
  upload.single('file'),
  fileValidator({
    maxSize: 10 * 1024 * 1024,
    allowedTypes: ['application/json', 'text/yaml', 'text/xml', 'text/plain']
  }),
  requestValidator(configurationValidators.importConfiguration),
  trackConfigurationChange('import'),
  configOperationLogger('configuration-import'),
  asyncHandler(configurationController.importConfiguration)
);

// Import configuration from URL
router.post(
  '/import/url',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.import),
  requestValidator(configurationValidators.importConfigurationFromUrl),
  trackConfigurationChange('import-url'),
  configOperationLogger('configuration-import-url'),
  asyncHandler(configurationController.importConfigurationFromUrl)
);

// Clone configuration
router.post(
  '/:configId/clone',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.cloneConfiguration),
  trackConfigurationChange('clone'),
  configOperationLogger('configuration-clone'),
  asyncHandler(configurationController.cloneConfiguration)
);

// Merge configurations
router.post(
  '/merge',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.mergeConfigurations),
  trackConfigurationChange('merge'),
  configOperationLogger('configurations-merge'),
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
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.backupConfiguration),
  trackConfigurationChange('backup'),
  configOperationLogger('configuration-backup'),
  asyncHandler(configurationController.backupConfiguration)
);

// List configuration backups
router.get(
  '/:configId/backups',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.listBackups),
  asyncHandler(configurationController.listBackups)
);

// Restore from backup
router.post(
  '/:configId/restore',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.restoreFromBackup),
  trackConfigurationChange('restore'),
  configOperationLogger('configuration-restore'),
  asyncHandler(configurationController.restoreFromBackup)
);

// Delete backup
router.delete(
  '/:configId/backups/:backupId',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.deleteBackup),
  configOperationLogger('backup-delete'),
  asyncHandler(configurationController.deleteBackup)
);

// Schedule automatic backups
router.post(
  '/:configId/backup/schedule',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.scheduleBackup),
  configOperationLogger('backup-schedule'),
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
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.watchConfiguration),
  configOperationLogger('configuration-watch'),
  asyncHandler(configurationController.watchConfiguration)
);

// Unwatch configuration
router.delete(
  '/watch/:watcherId',
  authorize(['admin', 'config-manager', 'application']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.unwatchConfiguration),
  configOperationLogger('configuration-unwatch'),
  asyncHandler(configurationController.unwatchConfiguration)
);

// Get active watchers
router.get(
  '/:configId/watchers',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getWatchers),
  asyncHandler(configurationController.getWatchers)
);

// Subscribe to configuration events
router.post(
  '/:configId/subscribe',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.subscribeToEvents),
  configOperationLogger('configuration-subscribe'),
  asyncHandler(configurationController.subscribeToEvents)
);

// Unsubscribe from configuration events
router.delete(
  '/:configId/subscribe/:subscriptionId',
  authorize(['admin', 'config-manager', 'application']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.unsubscribeFromEvents),
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
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getTemplates),
  asyncHandler(configurationController.getTemplates)
);

// Get template details
router.get(
  '/templates/:templateId',
  authorize(['admin', 'config-manager', 'viewer']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getTemplateDetails),
  asyncHandler(configurationController.getTemplateDetails)
);

// Create configuration from template
router.post(
  '/templates/:templateId/apply',
  authorize(['admin', 'config-manager']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.applyTemplate),
  trackConfigurationChange('template-apply'),
  configOperationLogger('template-apply'),
  asyncHandler(configurationController.applyTemplate)
);

// Create custom template
router.post(
  '/templates',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.createTemplate),
  configOperationLogger('template-create'),
  asyncHandler(configurationController.createTemplate)
);

// Update template
router.put(
  '/templates/:templateId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.updateTemplate),
  configOperationLogger('template-update'),
  asyncHandler(configurationController.updateTemplate)
);

// Delete template
router.delete(
  '/templates/:templateId',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.deleteTemplate),
  configOperationLogger('template-delete'),
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
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfigurationAuditTrail),
  asyncHandler(configurationController.getConfigurationAuditTrail)
);

// Get configuration change log
router.get(
  '/:configId/changelog',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getChangeLog),
  asyncHandler(configurationController.getChangeLog)
);

// Get configuration compliance status
router.get(
  '/:configId/compliance',
  authorize(['admin', 'auditor', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getComplianceStatus),
  asyncHandler(configurationController.getComplianceStatus)
);

// Run compliance check
router.post(
  '/:configId/compliance/check',
  authorize(['admin', 'auditor']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.runComplianceCheck),
  configOperationLogger('compliance-check'),
  asyncHandler(configurationController.runComplianceCheck)
);

// Generate compliance report
router.post(
  '/:configId/compliance/report',
  authorize(['admin', 'auditor']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.generateComplianceReport),
  configOperationLogger('compliance-report'),
  asyncHandler(configurationController.generateComplianceReport)
);

/**
 * Configuration Analytics and Insights
 */

// Get configuration usage statistics
router.get(
  '/:configId/statistics',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfigurationStatistics),
  asyncHandler(configurationController.getConfigurationStatistics)
);

// Get configuration usage patterns
router.get(
  '/:configId/usage',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getUsagePatterns),
  asyncHandler(configurationController.getUsagePatterns)
);

// Get configuration dependencies
router.get(
  '/:configId/dependencies',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getDependencies),
  asyncHandler(configurationController.getDependencies)
);

// Get configuration dependents
router.get(
  '/:configId/dependents',
  authorize(['admin', 'config-manager', 'viewer']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getDependents),
  asyncHandler(configurationController.getDependents)
);

// Analyze configuration relationships
router.get(
  '/:configId/relationships',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.analyzeRelationships),
  asyncHandler(configurationController.analyzeRelationships)
);

// Get configuration recommendations
router.get(
  '/:configId/recommendations',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.getRecommendations),
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
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getConfigurationSchema),
  asyncHandler(configurationController.getConfigurationSchema)
);

// Update configuration schema
router.put(
  '/:configId/schema',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.updateConfigurationSchema),
  trackConfigurationChange('schema-update'),
  configOperationLogger('schema-update'),
  asyncHandler(configurationController.updateConfigurationSchema)
);

// Validate against schema
router.post(
  '/:configId/schema/validate',
  authorize(['admin', 'config-manager']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.validateAgainstSchema),
  asyncHandler(configurationController.validateAgainstSchema)
);

// Generate schema from values
router.post(
  '/:configId/schema/generate',
  authorize(['admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.generateSchema),
  configOperationLogger('schema-generate'),
  asyncHandler(configurationController.generateSchema)
);

/**
 * Configuration Migration
 */

// Create migration plan
router.post(
  '/migrate/plan',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.createMigrationPlan),
  configOperationLogger('migration-plan'),
  asyncHandler(configurationController.createMigrationPlan)
);

// Execute migration
router.post(
  '/migrate/execute',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.executeMigration),
  trackConfigurationChange('migration'),
  configOperationLogger('migration-execute'),
  asyncHandler(configurationController.executeMigration)
);

// Get migration status
router.get(
  '/migrate/:migrationId/status',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getMigrationStatus),
  asyncHandler(configurationController.getMigrationStatus)
);

// Rollback migration
router.post(
  '/migrate/:migrationId/rollback',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.rollbackMigration),
  trackConfigurationChange('migration-rollback'),
  configOperationLogger('migration-rollback'),
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
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.encryptConfiguration),
  trackConfigurationChange('encrypt'),
  configOperationLogger('configuration-encrypt'),
  asyncHandler(configurationController.encryptConfiguration)
);

// Decrypt configuration values
router.post(
  '/:configId/decrypt',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.decryptConfiguration),
  configOperationLogger('configuration-decrypt'),
  asyncHandler(configurationController.decryptConfiguration)
);

// Rotate encryption keys
router.post(
  '/:configId/rotate-keys',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.sensitive),
  requestValidator(configurationValidators.rotateEncryptionKeys),
  trackConfigurationChange('key-rotation'),
  configOperationLogger('key-rotation'),
  asyncHandler(configurationController.rotateEncryptionKeys)
);

// Get security status
router.get(
  '/:configId/security',
  authorize(['admin', 'security-admin']),
  validateConfigAccess,
  rateLimit(RATE_LIMITS.read),
  requestValidator(configurationValidators.getSecurityStatus),
  asyncHandler(configurationController.getSecurityStatus)
);

/**
 * Bulk Operations
 */

// Bulk update configurations
router.post(
  '/bulk/update',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.bulkUpdate),
  trackConfigurationChange('bulk-update'),
  configOperationLogger('bulk-update'),
  asyncHandler(configurationController.bulkUpdate)
);

// Bulk delete configurations
router.post(
  '/bulk/delete',
  authorize(['admin']),
  rateLimit(RATE_LIMITS.write),
  requestValidator(configurationValidators.bulkDelete),
  trackConfigurationChange('bulk-delete'),
  configOperationLogger('bulk-delete'),
  asyncHandler(configurationController.bulkDelete)
);

// Bulk export configurations
router.post(
  '/bulk/export',
  authorize(['admin', 'config-manager']),
  rateLimit(RATE_LIMITS.export),
  requestValidator(configurationValidators.bulkExport),
  configOperationLogger('bulk-export'),
  asyncHandler(configurationController.bulkExport)
);

// Bulk validate configurations
router.post(
  '/bulk/validate',
  authorize(['admin', 'config-manager']),
  rateLimit(RATE_LIMITS.default),
  requestValidator(configurationValidators.bulkValidate),
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

  // Log to audit trail for critical configuration errors
  if (err.statusCode >= 500 || err.critical) {
    auditLogger.logError({
      service: 'configuration-management',
      error: err,
      request: {
        path: req.path,
        method: req.method,
        params: req.params,
        query: req.query,
        body: req.body
      },
      user: req.user,
      configTracking: req.configChangeTracking
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