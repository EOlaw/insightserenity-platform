'use strict';

const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platform-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { validateRequest } = require('../../../../../shared/lib/middleware/validation/request-validator');
const { platformValidators } = require('../validators/platform-validators');

// Platform Configuration Routes
router.get('/',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformConfig
);

router.patch('/',
  authenticate,
  authorize(['super-admin']),
  platformController.updatePlatformConfig
);

// Platform Version Management
router.post('/version',
  authenticate,
  authorize(['super-admin']),
  platformController.updateVersion
);

// Maintenance Mode Routes
router.post('/maintenance/enable',
  authenticate,
  authorize(['super-admin']),
  platformController.enableMaintenanceMode
);

router.post('/maintenance/disable',
  authenticate,
  authorize(['super-admin']),
  platformController.disableMaintenanceMode
);

// Feature Flags Routes
router.get('/features',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getFeatureFlags
);

router.put('/features/:featureName',
  authenticate,
  authorize(['super-admin']),
  platformController.updateFeatureFlag
);

router.get('/features/:featureName/check',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.checkFeatureFlag
);

// Integration Routes
router.get('/integrations',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getIntegrations
);

router.post('/integrations',
  authenticate,
  authorize(['super-admin']),
  platformController.addIntegration
);

router.put('/integrations/:integrationId',
  authenticate,
  authorize(['super-admin']),
  platformController.updateIntegration
);

router.delete('/integrations/:integrationId',
  authenticate,
  authorize(['super-admin']),
  platformController.deleteIntegration
);

// Platform Status Routes
router.get('/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformStatus
);

router.post('/status',
  authenticate,
  authorize(['super-admin']),
  platformController.updatePlatformStatus
);

// Incident Management
router.post('/incidents',
  authenticate,
  authorize(['super-admin']),
  platformController.recordIncident
);

// Resource Limits
router.get('/limits/:resource',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.checkResourceLimit
);

// Health Check
router.get('/health',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.performHealthCheck
);

// Public Configuration
router.get('/public',
  platformController.getPublicConfig
);

// Platform Overview Routes (to be implemented)
router.get('/overview',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformOverview
);

router.get('/statistics',
  authenticate,
  authorize(['admin', 'super-admin']),
  validateRequest(platformValidators.validatePlatformStats),
  platformController.getPlatformStatistics
);

// Platform Settings Management (to be implemented)
router.get('/settings',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformSettings
);

router.put('/settings',
  authenticate,
  authorize(['super-admin']),
  platformController.updatePlatformSettings
);

router.post('/settings/reset',
  authenticate,
  authorize(['super-admin']),
  platformController.resetPlatformSettings
);

// Platform Modules Management (to be implemented)
router.get('/modules',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformModules
);

router.put('/modules/:moduleId',
  authenticate,
  authorize(['super-admin']),
  platformController.updatePlatformModule
);

router.post('/modules/:moduleId/enable',
  authenticate,
  authorize(['super-admin']),
  platformController.enablePlatformModule
);

router.post('/modules/:moduleId/disable',
  authenticate,
  authorize(['super-admin']),
  platformController.disablePlatformModule
);

// Platform Deployment Management (to be implemented)
router.get('/deployments',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformDeployments
);

router.post('/deployments',
  authenticate,
  authorize(['super-admin']),
  platformController.createPlatformDeployment
);

router.get('/deployments/:deploymentId',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformDeploymentDetails
);

router.post('/deployments/:deploymentId/rollback',
  authenticate,
  authorize(['super-admin']),
  platformController.rollbackPlatformDeployment
);

// Platform Resource Management (to be implemented)
router.get('/resources',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformResources
);

router.get('/resources/usage',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformResourceUsage
);

router.put('/resources/limits',
  authenticate,
  authorize(['super-admin']),
  platformController.updatePlatformResourceLimits
);

// Platform API Management (to be implemented)
router.get('/api/endpoints',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformAPIEndpoints
);

router.get('/api/usage',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformAPIUsage
);

router.put('/api/rate-limits',
  authenticate,
  authorize(['super-admin']),
  platformController.updatePlatformAPIRateLimits
);

// Platform Analytics (to be implemented)
router.get('/analytics/dashboard',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformAnalyticsDashboard
);

router.get('/analytics/trends',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformTrends
);

router.post('/analytics/export',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.exportPlatformAnalytics
);

module.exports = router;