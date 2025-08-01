'use strict';

const express = require('express');
const router = express.Router();
const configurationController = require('../controllers/configuration-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { validateRequest } = require('../../../../../shared/lib/middleware/validation/request-validator');
const { configurationValidators } = require('../validators/configuration-validators');

// Configuration Overview Routes
router.get('/overview',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getConfigurationOverview
);

router.get('/active',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getActiveConfiguration
);

// Environment Configuration Routes
router.get('/environments',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getEnvironments
);

router.get('/environments/:environment',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getEnvironmentConfig
);

router.put('/environments/:environment',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateEnvironment),
  configurationController.updateEnvironmentConfig
);

router.post('/environments/:environment/validate',
  authenticate,
  authorize(['super-admin']),
  configurationController.validateEnvironmentConfig
);

// Application Configuration Routes
router.get('/application',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getApplicationConfig
);

router.put('/application',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateApplication),
  configurationController.updateApplicationConfig
);

router.post('/application/reload',
  authenticate,
  authorize(['super-admin']),
  configurationController.reloadApplicationConfig
);

// Security Configuration Routes
router.get('/security',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getSecurityConfig
);

router.put('/security',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateSecurity),
  configurationController.updateSecurityConfig
);

router.post('/security/rotate-keys',
  authenticate,
  authorize(['super-admin']),
  configurationController.rotateSecurityKeys
);

// Database Configuration Routes
router.get('/database',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getDatabaseConfig
);

router.put('/database',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateDatabase),
  configurationController.updateDatabaseConfig
);

router.post('/database/test-connection',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.testConnection),
  configurationController.testDatabaseConnection
);

// Email Configuration Routes
router.get('/email',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getEmailConfig
);

router.put('/email',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateEmail),
  configurationController.updateEmailConfig
);

router.post('/email/test',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.testEmail),
  configurationController.testEmailConfiguration
);

// Payment Configuration Routes
router.get('/payment',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getPaymentConfig
);

router.put('/payment',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updatePayment),
  configurationController.updatePaymentConfig
);

router.post('/payment/validate',
  authenticate,
  authorize(['super-admin']),
  configurationController.validatePaymentConfig
);

// Storage Configuration Routes
router.get('/storage',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getStorageConfig
);

router.put('/storage',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateStorage),
  configurationController.updateStorageConfig
);

router.post('/storage/test',
  authenticate,
  authorize(['super-admin']),
  configurationController.testStorageConfig
);

// Feature Flags Configuration Routes
router.get('/feature-flags',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getFeatureFlags
);

router.put('/feature-flags/:flagName',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateFeatureFlag),
  configurationController.updateFeatureFlag
);

router.post('/feature-flags/:flagName/toggle',
  authenticate,
  authorize(['super-admin']),
  configurationController.toggleFeatureFlag
);

// API Configuration Routes
router.get('/api',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getAPIConfig
);

router.put('/api',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateAPI),
  configurationController.updateAPIConfig
);

// Cache Configuration Routes
router.get('/cache',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getCacheConfig
);

router.put('/cache',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateCache),
  configurationController.updateCacheConfig
);

// Logging Configuration Routes
router.get('/logging',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getLoggingConfig
);

router.put('/logging',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateLogging),
  configurationController.updateLoggingConfig
);

// Configuration Templates Routes
router.get('/templates',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getConfigTemplates
);

router.post('/templates',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.createTemplate),
  configurationController.createConfigTemplate
);

router.put('/templates/:templateId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.updateTemplate),
  configurationController.updateConfigTemplate
);

router.delete('/templates/:templateId',
  authenticate,
  authorize(['super-admin']),
  configurationController.deleteConfigTemplate
);

// Configuration History Routes
router.get('/history',
  authenticate,
  authorize(['admin', 'super-admin']),
  validateRequest(configurationValidators.getHistory),
  configurationController.getConfigHistory
);

router.get('/history/:historyId',
  authenticate,
  authorize(['admin', 'super-admin']),
  configurationController.getConfigHistoryDetails
);

router.post('/history/:historyId/restore',
  authenticate,
  authorize(['super-admin']),
  configurationController.restoreConfigFromHistory
);

// Configuration Export/Import Routes
router.post('/export',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.exportConfig),
  configurationController.exportConfiguration
);

router.post('/import',
  authenticate,
  authorize(['super-admin']),
  validateRequest(configurationValidators.importConfig),
  configurationController.importConfiguration
);

module.exports = router;