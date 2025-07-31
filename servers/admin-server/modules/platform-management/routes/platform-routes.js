'use strict';

const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platform-controller');
const { authenticate, authorize } = require('../../../../shared/lib/auth/middleware');
const { validateRequest } = require('../../../../shared/lib/middleware/validation/request-validator');
const { platformValidators } = require('../validators/platform-validators');

// Platform Overview Routes
router.get('/overview',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformOverview
);

router.get('/statistics',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformStatistics
);

router.get('/health',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformHealth
);

// Platform Settings Management
router.get('/settings',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformSettings
);

router.put('/settings',
  authenticate,
  authorize(['super-admin']),
  validateRequest(platformValidators.updatePlatformSettings),
  platformController.updatePlatformSettings
);

router.post('/settings/reset',
  authenticate,
  authorize(['super-admin']),
  platformController.resetPlatformSettings
);

// Platform Features Management
router.get('/features',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformFeatures
);

router.put('/features/:featureId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(platformValidators.updateFeature),
  platformController.updatePlatformFeature
);

router.post('/features/:featureId/toggle',
  authenticate,
  authorize(['super-admin']),
  platformController.togglePlatformFeature
);

// Platform Modules Management
router.get('/modules',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformModules
);

router.put('/modules/:moduleId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(platformValidators.updateModule),
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

// Platform Deployment Management
router.get('/deployments',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformDeployments
);

router.post('/deployments',
  authenticate,
  authorize(['super-admin']),
  validateRequest(platformValidators.createDeployment),
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

// Platform Resource Management
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
  validateRequest(platformValidators.updateResourceLimits),
  platformController.updatePlatformResourceLimits
);

// Platform API Management
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
  validateRequest(platformValidators.updateAPIRateLimits),
  platformController.updatePlatformAPIRateLimits
);

// Platform Integration Management
router.get('/integrations',
  authenticate,
  authorize(['admin', 'super-admin']),
  platformController.getPlatformIntegrations
);

router.post('/integrations',
  authenticate,
  authorize(['super-admin']),
  validateRequest(platformValidators.createIntegration),
  platformController.createPlatformIntegration
);

router.put('/integrations/:integrationId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(platformValidators.updateIntegration),
  platformController.updatePlatformIntegration
);

router.delete('/integrations/:integrationId',
  authenticate,
  authorize(['super-admin']),
  platformController.deletePlatformIntegration
);

// Platform Analytics
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
  validateRequest(platformValidators.exportAnalytics),
  platformController.exportPlatformAnalytics
);

module.exports = router;