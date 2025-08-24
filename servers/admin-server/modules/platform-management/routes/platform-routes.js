'use strict';

/**
 * @fileoverview Platform management routes with advanced rate limiting
 * @module servers/admin-server/modules/platform-management/routes/platform-routes
 */

const express = require('express');
const router = express.Router();
const PlatformController = require('../controllers/platform-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');

// Import the advanced rate limiting middleware
const { 
  limitByIP, 
  limitByUser, 
  limitByAPIKey,
  limitByEndpoint,
  limitByTenant,
  combinedLimit,
  customLimit,
  costBasedLimit,
  adaptiveLimit
} = require('../../../../../shared/lib/auth/middleware/rate-limit');

const logger = require('../../../../../shared/lib/utils/logger');

// Apply authentication to all routes
router.use(authenticate);

// ==================== RATE LIMITING STRATEGY ====================

// Global rate limiting - combines multiple strategies for comprehensive protection
const globalLimiter = combinedLimit(
  ['ip', 'user'], // Apply both IP and user-based limiting
  {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Higher limit for authenticated users
    message: 'Rate limit exceeded. Please try again later.',
    headers: true
  }
);

// Apply global rate limiting to all routes
router.use(globalLimiter);

// ==================== PLATFORM CONFIGURATION ROUTES ====================

// Critical platform operations - very restrictive
const criticalPlatformLimiter = customLimit(
  'critical_platform_operations',
  (req) => {
    // Only apply to admin users performing critical operations
    if (req.auth?.user?.role === 'admin') {
      return {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // Only 10 critical operations per hour
        message: 'Critical operation rate limit exceeded. Please wait before retrying.'
      };
    }
    return false; // Skip rate limiting for non-admin users
  }
);

// Get platform configuration
router.get(
  '/platform',
  authorize(['admin', 'platform-manager']),
  limitByUser({ windowMs: 60000, max: 30 }), // 30 requests per minute per user
  PlatformController.getPlatformConfiguration
);

// Create platform configuration - highly restricted
router.post(
  '/platform',
  authorize(['admin']),
  criticalPlatformLimiter,
  PlatformController.createPlatformConfiguration
);

// Update platform configuration - cost-based limiting
router.put(
  '/platform/:platformId',
  authorize(['admin']),
  costBasedLimit(
    (req) => {
      // Calculate cost based on request complexity
      const bodySize = JSON.stringify(req.body).length;
      const baseCost = 10;
      const sizeCost = Math.ceil(bodySize / 1000); // 1 cost per KB
      return baseCost + sizeCost;
    },
    {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxCost: 500, // Total cost budget per hour
      message: 'Update operation cost budget exceeded'
    }
  ),
  PlatformController.updatePlatformConfiguration
);

// Update platform status - tenant-based limiting
router.patch(
  '/platform/:platformId/status',
  authorize(['admin']),
  limitByTenant({ windowMs: 300000, max: 20 }), // 20 status updates per 5 minutes per tenant
  PlatformController.updatePlatformStatus
);

// Statistics and monitoring - adaptive limiting based on system load
router.get(
  '/platform/:platformId/statistics',
  authorize(['admin', 'platform-manager', 'viewer']),
  adaptiveLimit({
    windowMs: 60000, // 1 minute
    baseMax: 60, // Base limit
    minMax: 20,  // Minimum when system is overloaded
    maxMax: 120  // Maximum when system is underloaded
  }),
  PlatformController.getPlatformStatistics
);

// Health check - endpoint-specific limiting
router.post(
  '/platform/:platformId/health-check',
  authorize(['admin', 'platform-manager']),
  limitByEndpoint({ 
    windowMs: 60000, 
    max: 10, // Only 10 health checks per minute for this specific endpoint
    keyGenerator: (req) => `healthcheck:${req.params.platformId}`
  }),
  PlatformController.performHealthCheck
);

// Platform issues
router.get(
  '/platform/:platformId/issues',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser({ windowMs: 60000, max: 50 }),
  PlatformController.getPlatformIssues
);

// ==================== FEATURE FLAG ROUTES ====================

// Feature flag management - user and IP combined with burst protection
const featureFlagLimiter = combinedLimit(
  ['user', 'ip'],
  {
    windowMs: 60000,
    max: 100,
    burstProtection: true,
    message: 'Feature flag operation rate limit exceeded'
  }
);

// Get all feature flags
router.get(
  '/platform/:platformId/features', 
  authorize(['admin', 'platform-manager', 'viewer']),
  featureFlagLimiter,
  PlatformController.getAllFeatureFlags
);

// Search feature flags
router.get(
  '/platform/:platformId/features/search',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser({ windowMs: 60000, max: 40 }),
  PlatformController.searchFeatureFlags
);

// Get feature flags for tenant
router.get(
  '/platform/:platformId/features/tenant/:tenantId',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser({ windowMs: 60000, max: 50 }),
  PlatformController.getFeatureFlagsForTenant
);

// Critical feature flag operations
router.post(
  '/platform/:platformId/features/:featureName',
  authorize(['admin']),
  customLimit(
    'feature_flag_toggle',
    {
      windowMs: 300000, // 5 minutes
      max: 20,
      keyGenerator: (req) => `ff:${req.auth.user._id}:${req.params.platformId}`
    }
  ),
  PlatformController.manageFeatureFlag
);

// Bulk update feature flags
router.patch(
  '/platform/:platformId/features/bulk',
  authorize(['admin']),
  customLimit(
    'bulk_feature_update',
    {
      windowMs: 900000, // 15 minutes
      max: 5, // Only 5 bulk updates per 15 minutes
      keyGenerator: (req) => `bulk_ff:${req.auth.user._id}:${req.params.platformId}`
    }
  ),
  PlatformController.bulkUpdateFeatureFlags
);

// ==================== SYSTEM MODULE ROUTES ====================

// Get system modules
router.get(
  '/platform/:platformId/modules',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser({ windowMs: 60000, max: 50 }),
  PlatformController.getSystemModules
);

// Update system module
router.put(
  '/platform/:platformId/modules/:moduleName',
  authorize(['admin', 'platform-manager']),
  costBasedLimit(
    (req) => {
      const bodySize = JSON.stringify(req.body).length;
      const baseCost = 5;
      const sizeCost = Math.ceil(bodySize / 500); // 1 cost per 500 bytes
      return baseCost + sizeCost;
    },
    {
      windowMs: 300000, // 5 minutes
      maxCost: 100,
      message: 'Module update cost budget exceeded'
    }
  ),
  PlatformController.updateSystemModule
);

// ==================== DEPLOYMENT ROUTES ====================

// Record deployment
router.post(
  '/platform/:platformId/deployments',
  authorize(['admin', 'platform-manager']),
  customLimit(
    'deployment_record',
    {
      windowMs: 600000, // 10 minutes
      max: 15, // 15 deployments per 10 minutes
      keyGenerator: (req) => `deploy:${req.auth.user._id}:${req.params.platformId}`
    }
  ),
  PlatformController.recordDeployment
);

// Get deployment history
router.get(
  '/platform/:platformId/deployments/history',
  authorize(['admin', 'platform-manager', 'viewer']),
  limitByUser({ windowMs: 60000, max: 30 }),
  PlatformController.getDeploymentHistory
);

// ==================== VIEWER ROUTES - RELAXED LIMITS ====================

// Routes for viewers get more lenient rate limiting
const viewerLimiter = limitByUser({
  windowMs: 60000,
  max: 100, // Higher limit for read operations
  skipFailedRequests: true
});

// Apply relaxed limiting for specific viewer routes
const viewerRoutes = [
  { path: '/platform/:platformId/statistics', method: 'get' },
  { path: '/platform/:platformId/issues', method: 'get' },
  { path: '/platform/:platformId/features', method: 'get' },
  { path: '/platform/:platformId/modules', method: 'get' },
  { path: '/platform/:platformId/deployments/history', method: 'get' }
];

viewerRoutes.forEach(route => {
  router[route.method](route.path, viewerLimiter);
});

// ==================== ERROR HANDLING ====================

router.use((err, req, res, next) => {
  // Enhanced error logging for rate limit errors
  if (err.status === 429) {
    logger.warn('Rate limit exceeded', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.auth?.user?._id,
      userAgent: req.get('user-agent'),
      error: err.message
    });
  } else {
    logger.error('Platform management route error', {
      error: err.message,
      path: req.path,
      method: req.method,
      userId: req.auth?.user?.id,
      stack: err.stack
    });
  }
  next(err);
});

module.exports = router;