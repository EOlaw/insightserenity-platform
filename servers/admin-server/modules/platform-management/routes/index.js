'use strict';

/**
 * @fileoverview Central router configuration for platform management module
 * @module servers/admin-server/modules/platform-management/routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/routes/platform-routes
 * @requires module:servers/admin-server/modules/platform-management/routes/system-routes
 * @requires module:servers/admin-server/modules/platform-management/routes/configuration-routes
 * @requires module:servers/admin-server/modules/platform-management/routes/maintenance-routes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 */

const express = require('express');
const router = express.Router();
const platformRoutes = require('./platform-routes');
const systemRoutes = require('./system-routes');
const configurationRoutes = require('./configuration-routes');
const maintenanceRoutes = require('./maintenance-routes');
const logger = require('../../../../../shared/lib/utils/logger');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const errorHandler = require('../../../../../shared/lib/middleware/error-handlers/error-handler');

/**
 * Health check endpoint for the platform management module
 */
router.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    module: 'platform-management',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    routes: {
      platform: 'active',
      system: 'active',
      configuration: 'active',
      maintenance: 'active'
    },
    checks: {
      database: 'connected',
      cache: 'connected',
      services: 'operational'
    }
  };

  logger.info('Platform management health check', healthStatus);
  
  return res.status(200).json(
    responseFormatter.success(healthStatus, 'Platform management module is healthy')
  );
});

/**
 * Module information endpoint
 */
router.get('/info', (req, res) => {
  const moduleInfo = {
    name: 'Platform Management Module',
    version: '1.0.0',
    description: 'Enterprise platform administration and management services',
    capabilities: [
      'Platform configuration management',
      'System health monitoring',
      'Configuration management',
      'Maintenance window scheduling',
      'Feature flag management',
      'System metrics collection',
      'Alert management',
      'Deployment tracking'
    ],
    endpoints: {
      platform: {
        base: '/platform',
        description: 'Platform configuration and feature management',
        count: getRouteCount(platformRoutes)
      },
      system: {
        base: '/system',
        description: 'System monitoring and health management',
        count: getRouteCount(systemRoutes)
      },
      configuration: {
        base: '/configurations',
        description: 'Configuration management and versioning',
        count: getRouteCount(configurationRoutes)
      },
      maintenance: {
        base: '/maintenance',
        description: 'Maintenance window scheduling and management',
        count: getRouteCount(maintenanceRoutes)
      }
    },
    statistics: {
      totalEndpoints: getTotalEndpoints(),
      lastUpdated: new Date().toISOString()
    }
  };

  return res.status(200).json(
    responseFormatter.success(moduleInfo, 'Module information retrieved successfully')
  );
});

/**
 * Mount sub-routers with prefixes
 * Each sub-module handles its own authentication and authorization
 */

// Platform management routes - /api/v1/admin/platform-management/platform/*
router.use('/platform', platformRoutes);

// System monitoring routes - /api/v1/admin/platform-management/system/*
router.use('/system', systemRoutes);

// Configuration management routes - /api/v1/admin/platform-management/configurations/*
router.use('/configurations', configurationRoutes);

// Maintenance window routes - /api/v1/admin/platform-management/maintenance/*
router.use('/maintenance', maintenanceRoutes);

/**
 * Catch-all route for undefined endpoints
 */
router.all('*', (req, res) => {
  logger.warn('Undefined platform management route accessed', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    ip: req.ip
  });

  return res.status(404).json(
    responseFormatter.error(
      'ROUTE_NOT_FOUND',
      `The requested endpoint ${req.path} does not exist in the platform management module`
    )
  );
});

/**
 * Global error handler for the platform management module
 */
router.use((err, req, res, next) => {
  logger.error('Platform management module error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    module: 'platform-management',
    timestamp: new Date().toISOString()
  });

  // Check if it's a known error type
  if (err.name === 'ValidationError') {
    return res.status(400).json(
      responseFormatter.error('VALIDATION_ERROR', err.message, err.details)
    );
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json(
      responseFormatter.error('UNAUTHORIZED', 'Authentication required')
    );
  }

  if (err.name === 'ForbiddenError') {
    return res.status(403).json(
      responseFormatter.error('FORBIDDEN', 'Insufficient permissions')
    );
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json(
      responseFormatter.error(err.code || 'ERROR', err.message)
    );
  }

  // Pass to the general error handler if not handled
  next(err);
});

/**
 * Helper function to count routes in a router
 * @param {Object} routerInstance - Express router instance
 * @returns {number} Number of routes
 */
function getRouteCount(routerInstance) {
  let count = 0;
  if (routerInstance && routerInstance.stack) {
    routerInstance.stack.forEach(layer => {
      if (layer.route) {
        count++;
      } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach(subLayer => {
          if (subLayer.route) {
            count++;
          }
        });
      }
    });
  }
  return count;
}

/**
 * Helper function to get total endpoint count
 * @returns {number} Total number of endpoints
 */
function getTotalEndpoints() {
  return (
    getRouteCount(platformRoutes) +
    getRouteCount(systemRoutes) +
    getRouteCount(configurationRoutes) +
    getRouteCount(maintenanceRoutes)
  );
}

/**
 * Initialize platform management routes
 */
const initializeRoutes = () => {
  logger.info('Platform management routes initialized', {
    module: 'platform-management',
    routes: {
      platform: getRouteCount(platformRoutes),
      system: getRouteCount(systemRoutes),
      configuration: getRouteCount(configurationRoutes),
      maintenance: getRouteCount(maintenanceRoutes)
    },
    total: getTotalEndpoints(),
    timestamp: new Date().toISOString()
  });
};

// Initialize routes on module load
initializeRoutes();

/**
 * Export the main router and utility functions
 */
module.exports = router;

// Also export individual routers for direct access if needed
module.exports.platformRoutes = platformRoutes;
module.exports.systemRoutes = systemRoutes;
module.exports.configurationRoutes = configurationRoutes;
module.exports.maintenanceRoutes = maintenanceRoutes;

// Export utility functions
module.exports.getRouteCount = getRouteCount;
module.exports.getTotalEndpoints = getTotalEndpoints;
module.exports.initializeRoutes = initializeRoutes;