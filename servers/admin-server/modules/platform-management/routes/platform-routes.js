'use strict';

/**
 * @fileoverview Platform management routes with advanced rate limiting
 * @module servers/admin-server/modules/platform-management/routes/platform-routes
 */

const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platform-controller');
const systemController = require('../controllers/system-controller');
const configurationController = require('../controllers/configuration-controller');
const maintenanceController = require('../controllers/maintenance-controller');
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
router.use(combinedLimit(
  ['ip', 'user'], // Apply both IP and user-based limiting
  {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Higher limit for authenticated users
    message: 'Rate limit exceeded. Please try again later.',
    headers: true
  }
));

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
  platformController.getPlatformConfiguration
);

// Create platform configuration - highly restricted
router.post(
  '/platform',
  authorize(['admin']),
  criticalPlatformLimiter,
  platformController.createPlatformConfiguration
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
  platformController.updatePlatformConfiguration
);

// Update platform status - tenant-based limiting
router.patch(
  '/platform/:platformId/status',
  authorize(['admin']),
  limitByTenant({ windowMs: 300000, max: 20 }), // 20 status updates per 5 minutes per tenant
  platformController.updatePlatformStatus
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
  platformController.getPlatformStatistics
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
  platformController.performHealthCheck
);

// ==================== FEATURE FLAG ROUTES ====================

// Feature flag management - user and IP combined with burst protection
router.use('/platform/:platformId/features', combinedLimit(
  ['user', 'ip'],
  {
    windowMs: 60000,
    max: 100,
    burstProtection: true,
    message: 'Feature flag operation rate limit exceeded'
  }
));

router.get('/platform/:platformId/features', 
  authorize(['admin', 'platform-manager', 'viewer']),
  platformController.getAllFeatureFlags
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
  platformController.manageFeatureFlag
);

// ==================== SYSTEM MONITORING ROUTES ====================

// System metrics - API key based limiting for monitoring agents
router.post(
  '/system/:systemId/metrics',
  authorize(['admin', 'platform-manager', 'agent']),
  limitByAPIKey({
    windowMs: 60000,
    max: 1000, // High limit for legitimate monitoring agents
    skipIfNotAuthenticated: true
  }),
  systemController.updateSystemMetrics
);

// Alert management - tenant-based with custom rules
router.post(
  '/system/:systemId/alerts',
  authorize(['admin', 'platform-manager', 'agent']),
  customLimit(
    'alert_creation',
    (req) => {
      // Different limits based on alert severity
      const severity = req.body?.severity || 'low';
      const limits = {
        'critical': { max: 50, windowMs: 300000 }, // 5 minutes
        'high': { max: 100, windowMs: 300000 },
        'medium': { max: 200, windowMs: 600000 }, // 10 minutes
        'low': { max: 500, windowMs: 900000 }     // 15 minutes
      };
      
      return {
        ...limits[severity],
        keyGenerator: (req) => `alerts:${severity}:${req.auth.user.organizationId || req.auth.user._id}`
      };
    }
  ),
  systemController.createSystemAlert
);

// ==================== CONFIGURATION MANAGEMENT ROUTES ====================

// Configuration operations - combined user and tenant limiting
router.use('/configurations', combinedLimit(
  ['user', 'tenant'],
  {
    windowMs: 300000, // 5 minutes
    max: 150,
    message: 'Configuration operation rate limit exceeded'
  }
));

// Create configuration - restricted operation
router.post(
  '/configurations',
  authorize(['admin', 'config-manager']),
  limitByUser({
    windowMs: 3600000, // 1 hour
    max: 25, // Only 25 new configurations per hour per user
    message: 'Configuration creation limit exceeded'
  }),
  configurationController.createConfiguration
);

// Configuration value updates - cost-based on payload size
router.put(
  '/configurations/:configId/values/:key',
  authorize(['admin', 'config-manager']),
  costBasedLimit(
    (req) => {
      const value = req.body?.value;
      if (!value) return 1;
      
      // Calculate cost based on value size and type
      const size = typeof value === 'string' ? value.length : JSON.stringify(value).length;
      return Math.max(1, Math.ceil(size / 100)); // 1 cost per 100 characters
    },
    {
      windowMs: 300000, // 5 minutes
      maxCost: 200
    }
  ),
  configurationController.setConfigurationValue
);

// Bulk operations - heavily restricted
router.patch(
  '/configurations/:configId/values',
  authorize(['admin', 'config-manager']),
  customLimit(
    'bulk_config_update',
    {
      windowMs: 900000, // 15 minutes
      max: 5, // Only 5 bulk updates per 15 minutes
      keyGenerator: (req) => `bulk_config:${req.auth.user._id}:${req.params.configId}`
    }
  ),
  configurationController.updateConfigurationValues
);

// ==================== MAINTENANCE WINDOW ROUTES ====================

// Maintenance scheduling - restricted by role and tenant
router.post(
  '/maintenance/schedule',
  authorize(['admin', 'platform-manager']),
  combinedLimit(
    ['user', 'tenant'],
    {
      windowMs: 3600000, // 1 hour
      max: 10, // 10 maintenance windows per hour
      message: 'Maintenance scheduling rate limit exceeded'
    }
  ),
  maintenanceController.scheduleMaintenanceWindow
);

// Maintenance status checks - adaptive limiting
router.get(
  '/maintenance/status',
  adaptiveLimit({
    windowMs: 60000,
    baseMax: 200,
    minMax: 50,
    maxMax: 500
  }),
  maintenanceController.checkMaintenanceStatus
);

// Critical maintenance operations
const criticalMaintenanceLimiter = customLimit(
  'critical_maintenance',
  (req) => {
    const operation = req.path.split('/').pop();
    const criticalOps = ['start', 'complete', 'cancel'];
    
    if (criticalOps.includes(operation)) {
      return {
        windowMs: 300000, // 5 minutes
        max: 5,
        keyGenerator: (req) => `maint:${operation}:${req.auth.user._id}:${req.params.maintenanceId}`
      };
    }
    return false;
  }
);

router.post('/maintenance/:maintenanceId/start',
  authorize(['admin', 'platform-manager']),
  criticalMaintenanceLimiter,
  maintenanceController.startMaintenanceWindow
);

router.post('/maintenance/:maintenanceId/complete',
  authorize(['admin', 'platform-manager']),
  criticalMaintenanceLimiter,
  maintenanceController.completeMaintenanceWindow
);

router.post('/maintenance/:maintenanceId/cancel',
  authorize(['admin', 'platform-manager']),
  criticalMaintenanceLimiter,
  maintenanceController.cancelMaintenanceWindow
);

// ==================== VIEWER ROUTES - RELAXED LIMITS ====================

// Routes for viewers get more lenient rate limiting
const viewerRoutes = [
  '/platform/:platformId/statistics',
  '/system/:systemId/health',
  '/system/:systemId/performance',
  '/configurations',
  '/maintenance/history',
  '/alerts/active'
];

viewerRoutes.forEach(route => {
  // Apply relaxed limiting for GET requests by viewers
  router.get(route, 
    limitByUser({
      windowMs: 60000,
      max: 100, // Higher limit for read operations
      skipFailedRequests: true
    })
  );
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
      userId: req.auth?.user?.id
    });
  }
  next(err);
});

module.exports = router;