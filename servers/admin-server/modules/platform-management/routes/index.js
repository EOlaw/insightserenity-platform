/**
 * @file Platform Management Routes Index
 * @description Aggregates all platform management route modules
 * @version 3.0.0
 */

'use strict';

const express = require('express');
const router = express.Router();

// Import individual route modules
const platformRoutes = require('./platform-routes');
const systemRoutes = require('./system-routes');
const configurationRoutes = require('./configuration-routes');
const maintenanceRoutes = require('./maintenance-routes');

// Mount route modules with appropriate prefixes
router.use('/platform', platformRoutes);
router.use('/system', systemRoutes);
router.use('/configuration', configurationRoutes);
router.use('/maintenance', maintenanceRoutes);

// Platform management root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Platform Management API',
    version: '3.0.0',
    modules: {
      platform: '/platform',
      system: '/system',
      configuration: '/configuration',
      maintenance: '/maintenance'
    },
    endpoints: {
      platform: {
        overview: 'GET /platform/overview',
        settings: 'GET /platform/settings',
        features: 'GET /platform/features',
        statistics: 'GET /platform/statistics'
      },
      system: {
        status: 'GET /system/status',
        metrics: 'GET /system/metrics',
        services: 'GET /system/services',
        logs: 'GET /system/logs'
      },
      configuration: {
        database: 'GET /configuration/database',
        security: 'GET /configuration/security',
        email: 'GET /configuration/email',
        logging: 'GET /configuration/logging'
      },
      maintenance: {
        status: 'GET /maintenance/status',
        windows: 'GET /maintenance/windows',
        database: 'GET /maintenance/database/tasks',
        cleanup: 'GET /maintenance/cleanup/tasks'
      }
    }
  });
});

module.exports = router;