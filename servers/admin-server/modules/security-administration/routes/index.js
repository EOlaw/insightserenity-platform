'use strict';

/**
 * @fileoverview Security Administration Routes Aggregator
 * @module servers/admin-server/modules/security-administration/routes
 * @description Central export point for all security administration route modules.
 * This module aggregates and exports all security-related routes including
 * security admin, access control, security logs, and compliance routes.
 * @requires express
 * @requires module:servers/admin-server/modules/security-administration/routes/security-admin-routes
 * @requires module:servers/admin-server/modules/security-administration/routes/access-control-routes
 * @requires module:servers/admin-server/modules/security-administration/routes/security-logs-routes
 * @requires module:servers/admin-server/modules/security-administration/routes/compliance-routes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 */

const express = require('express');
const router = express.Router();
const logger = require('../../../../../shared/lib/utils/logger');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const errorHandler = require('../../../../../shared/lib/middleware/error-handlers/error-handler');

// Import all route modules
const securityAdminRoutes = require('./security-admin-routes');
const accessControlRoutes = require('./access-control-routes');
const securityLogsRoutes = require('./security-logs-routes');
const complianceRoutes = require('./compliance-routes');

/**
 * @class SecurityAdministrationRouter
 * @description Main router class that aggregates all security administration routes
 * and provides centralized configuration and middleware application
 */
class SecurityAdministrationRouter {
  #router;
  #routeModules;
  #initialized;
  #config;
  #routeStats;
  #healthCheckInterval;

  /**
   * @constructor
   * @description Initialize the security administration router with configuration
   */
  constructor() {
    this.#router = express.Router();
    this.#initialized = false;
    this.#routeModules = new Map();
    this.#routeStats = new Map();
    this.#config = {
      basePath: '/api/admin/security',
      enableMetrics: true,
      enableHealthChecks: true,
      healthCheckIntervalMs: 60000, // 1 minute
      requestTimeout: 30000, // 30 seconds
      maxRequestSize: '10mb',
      enableCORS: false, // CORS handled at server level
      enableCompression: true,
      routePrefixes: {
        admin: '/admin',
        accessControl: '/access-control',
        logs: '/logs',
        compliance: '/compliance'
      }
    };

    this.#initializeRouteModules();
    this.#setupGlobalMiddleware();
    this.#mountRoutes();
    this.#setupHealthChecks();
    this.#setupMetricsCollection();
    this.#setupErrorHandling();
  }

  /**
   * Initialize route modules with their metadata
   * @private
   */
  #initializeRouteModules() {
    try {
      // Register security admin routes
      this.#routeModules.set('security-admin', {
        path: this.#config.routePrefixes.admin,
        router: securityAdminRoutes,
        description: 'Security administration and platform management routes',
        version: '1.0.0',
        enabled: true,
        endpoints: [
          '/platform/*',
          '/users/*',
          '/organizations/*',
          '/policies/*',
          '/incidents/*',
          '/monitoring/*',
          '/analytics/*',
          '/threats/*',
          '/vulnerabilities/*',
          '/backups/*',
          '/encryption/*',
          '/network/*',
          '/integrations/*',
          '/emergency/*'
        ]
      });

      // Register access control routes
      this.#routeModules.set('access-control', {
        path: this.#config.routePrefixes.accessControl,
        router: accessControlRoutes,
        description: 'Authentication, authorization, and access management routes',
        version: '1.0.0',
        enabled: true,
        endpoints: [
          '/auth/*',
          '/authz/*',
          '/roles/*',
          '/sessions/*',
          '/privileged/*',
          '/reviews/*',
          '/sso/*',
          '/federated/*',
          '/api-keys/*',
          '/oauth/*',
          '/devices/*',
          '/biometric/*'
        ]
      });

      // Register security logs routes
      this.#routeModules.set('security-logs', {
        path: this.#config.routePrefixes.logs,
        router: securityLogsRoutes,
        description: 'Security logging, monitoring, and threat detection routes',
        version: '1.0.0',
        enabled: true,
        endpoints: [
          '/ingest/*',
          '/search/*',
          '/threats/*',
          '/analytics/*',
          '/retention/*',
          '/alerts/*',
          '/sources/*',
          '/stream/*',
          '/compliance/*',
          '/audit-trail/*',
          '/integrity/*',
          '/siem/*'
        ]
      });

      // Register compliance routes
      this.#routeModules.set('compliance', {
        path: this.#config.routePrefixes.compliance,
        router: complianceRoutes,
        description: 'Compliance, audit, and regulatory management routes',
        version: '1.0.0',
        enabled: true,
        endpoints: [
          '/frameworks/*',
          '/policies/*',
          '/assessments/*',
          '/audits/*',
          '/reports/*',
          '/risks/*',
          '/remediation/*',
          '/controls/*',
          '/evidence/*',
          '/certifications/*',
          '/regulatory/*'
        ]
      });

      logger.info('Security administration route modules initialized', {
        modules: Array.from(this.#routeModules.keys()),
        totalModules: this.#routeModules.size
      });

    } catch (error) {
      logger.error('Failed to initialize route modules:', error);
      throw error;
    }
  }

  /**
   * Setup global middleware for all routes
   * @private
   */
  #setupGlobalMiddleware() {
    try {
      // Apply security headers
      this.#router.use(securityHeaders({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
          }
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      }));

      // Apply request logging
      this.#router.use(requestLogger({
        module: 'security-administration',
        logLevel: 'info',
        excludePaths: ['/health', '/metrics'],
        sanitizeHeaders: ['authorization', 'x-api-key', 'cookie'],
        includeResponseTime: true,
        includeRequestId: true
      }));

      // Apply request timeout
      this.#router.use((req, res, next) => {
        req.setTimeout(this.#config.requestTimeout);
        next();
      });

      // Track route access
      if (this.#config.enableMetrics) {
        this.#router.use((req, res, next) => {
          const startTime = Date.now();
          
          res.on('finish', () => {
            const duration = Date.now() - startTime;
            this.#updateRouteStats(req.path, req.method, res.statusCode, duration);
          });
          
          next();
        });
      }

      logger.info('Global middleware configured for security administration routes');

    } catch (error) {
      logger.error('Failed to setup global middleware:', error);
      throw error;
    }
  }

  /**
   * Mount all route modules to the main router
   * @private
   */
  #mountRoutes() {
    try {
      let mountedCount = 0;
      let skippedCount = 0;

      for (const [moduleName, moduleConfig] of this.#routeModules.entries()) {
        if (moduleConfig.enabled) {
          this.#router.use(moduleConfig.path, moduleConfig.router);
          mountedCount++;
          
          logger.info(`Mounted ${moduleName} routes`, {
            path: moduleConfig.path,
            version: moduleConfig.version,
            endpoints: moduleConfig.endpoints.length
          });
        } else {
          skippedCount++;
          logger.warn(`Skipped mounting ${moduleName} routes (disabled)`);
        }
      }

      logger.info('Security administration routes mounted', {
        mounted: mountedCount,
        skipped: skippedCount,
        total: this.#routeModules.size
      });

    } catch (error) {
      logger.error('Failed to mount routes:', error);
      throw error;
    }
  }

  /**
   * Setup health check endpoints for all route modules
   * @private
   */
  #setupHealthChecks() {
    if (!this.#config.enableHealthChecks) {
      return;
    }

    try {
      // Main health check endpoint
      this.#router.get('/health', (req, res) => {
        const health = this.#performHealthCheck();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        
        res.status(statusCode).json(health);
      });

      // Detailed health check endpoint
      this.#router.get('/health/detailed', (req, res) => {
        const detailedHealth = this.#performDetailedHealthCheck();
        const statusCode = detailedHealth.overallStatus === 'healthy' ? 200 : 503;
        
        res.status(statusCode).json(detailedHealth);
      });

      // Readiness check endpoint
      this.#router.get('/ready', (req, res) => {
        const readiness = this.#checkReadiness();
        const statusCode = readiness.ready ? 200 : 503;
        
        res.status(statusCode).json(readiness);
      });

      // Liveness check endpoint
      this.#router.get('/alive', (req, res) => {
        res.status(200).json({
          alive: true,
          timestamp: new Date().toISOString()
        });
      });

      // Start periodic health checks
      if (this.#config.healthCheckIntervalMs > 0) {
        this.#healthCheckInterval = setInterval(() => {
          this.#performHealthCheck();
        }, this.#config.healthCheckIntervalMs);
      }

      logger.info('Health check endpoints configured');

    } catch (error) {
      logger.error('Failed to setup health checks:', error);
    }
  }

  /**
   * Setup metrics collection for routes
   * @private
   */
  #setupMetricsCollection() {
    if (!this.#config.enableMetrics) {
      return;
    }

    try {
      // Metrics endpoint
      this.#router.get('/metrics', (req, res) => {
        const metrics = this.#collectMetrics();
        res.status(200).json(metrics);
      });

      // Route statistics endpoint
      this.#router.get('/stats', (req, res) => {
        const stats = this.#getRouteStatistics();
        res.status(200).json(stats);
      });

      logger.info('Metrics collection configured');

    } catch (error) {
      logger.error('Failed to setup metrics collection:', error);
    }
  }

  /**
   * Setup error handling for all routes
   * @private
   */
  #setupErrorHandling() {
    try {
      // 404 handler for unmatched routes
      this.#router.use((req, res, next) => {
        res.status(404).json({
          success: false,
          error: 'Security administration endpoint not found',
          path: req.originalUrl,
          method: req.method,
          timestamp: new Date().toISOString()
        });
      });

      // Global error handler
      this.#router.use(errorHandler({
        includeStackTrace: process.env.NODE_ENV === 'development',
        logErrors: true,
        customHandlers: {
          ValidationError: (error, req, res) => {
            res.status(400).json({
              success: false,
              error: 'Validation failed',
              details: error.details,
              timestamp: new Date().toISOString()
            });
          },
          UnauthorizedError: (error, req, res) => {
            res.status(401).json({
              success: false,
              error: 'Authentication required',
              timestamp: new Date().toISOString()
            });
          },
          ForbiddenError: (error, req, res) => {
            res.status(403).json({
              success: false,
              error: 'Insufficient permissions',
              timestamp: new Date().toISOString()
            });
          }
        }
      }));

      logger.info('Error handling configured for security administration routes');

    } catch (error) {
      logger.error('Failed to setup error handling:', error);
    }
  }

  /**
   * Perform health check on all route modules
   * @private
   * @returns {Object} Health check result
   */
  #performHealthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      modules: {}
    };

    try {
      for (const [moduleName, moduleConfig] of this.#routeModules.entries()) {
        health.modules[moduleName] = {
          enabled: moduleConfig.enabled,
          status: moduleConfig.enabled ? 'active' : 'inactive',
          path: moduleConfig.path
        };
      }

      const inactiveModules = Object.values(health.modules).filter(m => m.status === 'inactive');
      if (inactiveModules.length > 0) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Perform detailed health check
   * @private
   * @returns {Object} Detailed health check result
   */
  #performDetailedHealthCheck() {
    const detailedHealth = {
      overallStatus: 'healthy',
      timestamp: new Date().toISOString(),
      modules: {},
      metrics: {},
      system: {}
    };

    try {
      // Check each module
      for (const [moduleName, moduleConfig] of this.#routeModules.entries()) {
        detailedHealth.modules[moduleName] = {
          name: moduleName,
          enabled: moduleConfig.enabled,
          status: moduleConfig.enabled ? 'active' : 'inactive',
          path: moduleConfig.path,
          version: moduleConfig.version,
          description: moduleConfig.description,
          endpointCount: moduleConfig.endpoints.length,
          endpoints: moduleConfig.endpoints
        };
      }

      // Add metrics
      detailedHealth.metrics = this.#collectMetrics();

      // Add system info
      detailedHealth.system = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      };

      // Determine overall status
      const inactiveModules = Object.values(detailedHealth.modules).filter(m => m.status === 'inactive');
      if (inactiveModules.length > 0) {
        detailedHealth.overallStatus = 'degraded';
      }

    } catch (error) {
      detailedHealth.overallStatus = 'unhealthy';
      detailedHealth.error = error.message;
    }

    return detailedHealth;
  }

  /**
   * Check service readiness
   * @private
   * @returns {Object} Readiness status
   */
  #checkReadiness() {
    const readiness = {
      ready: true,
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Check if all enabled modules are mounted
      for (const [moduleName, moduleConfig] of this.#routeModules.entries()) {
        if (moduleConfig.enabled) {
          readiness.checks[moduleName] = {
            ready: true,
            message: 'Module is mounted and ready'
          };
        }
      }

      // Check initialization status
      readiness.checks.initialization = {
        ready: this.#initialized,
        message: this.#initialized ? 'Fully initialized' : 'Initialization pending'
      };

      // Determine overall readiness
      const notReady = Object.values(readiness.checks).filter(c => !c.ready);
      if (notReady.length > 0) {
        readiness.ready = false;
      }

    } catch (error) {
      readiness.ready = false;
      readiness.error = error.message;
    }

    return readiness;
  }

  /**
   * Update route statistics
   * @private
   * @param {string} path - Request path
   * @param {string} method - HTTP method
   * @param {number} statusCode - Response status code
   * @param {number} duration - Request duration in ms
   */
  #updateRouteStats(path, method, statusCode, duration) {
    const key = `${method}:${path}`;
    
    if (!this.#routeStats.has(key)) {
      this.#routeStats.set(key, {
        path,
        method,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalDuration: 0,
        averageDuration: 0,
        maxDuration: 0,
        minDuration: Number.MAX_SAFE_INTEGER,
        statusCodes: {}
      });
    }

    const stats = this.#routeStats.get(key);
    
    stats.totalRequests++;
    stats.totalDuration += duration;
    stats.averageDuration = stats.totalDuration / stats.totalRequests;
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.minDuration = Math.min(stats.minDuration, duration);
    
    if (statusCode >= 200 && statusCode < 300) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }
    
    stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
  }

  /**
   * Collect metrics for all routes
   * @private
   * @returns {Object} Collected metrics
   */
  #collectMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      totalModules: this.#routeModules.size,
      activeModules: Array.from(this.#routeModules.values()).filter(m => m.enabled).length,
      totalEndpoints: 0,
      routeStatistics: []
    };

    try {
      // Count total endpoints
      for (const moduleConfig of this.#routeModules.values()) {
        if (moduleConfig.enabled) {
          metrics.totalEndpoints += moduleConfig.endpoints.length;
        }
      }

      // Add route statistics
      for (const [key, stats] of this.#routeStats.entries()) {
        metrics.routeStatistics.push({
          route: key,
          ...stats
        });
      }

      // Sort by total requests
      metrics.routeStatistics.sort((a, b) => b.totalRequests - a.totalRequests);

    } catch (error) {
      logger.error('Error collecting metrics:', error);
    }

    return metrics;
  }

  /**
   * Get route statistics
   * @private
   * @returns {Object} Route statistics
   */
  #getRouteStatistics() {
    const statistics = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRoutes: this.#routeStats.size,
        totalRequests: 0,
        totalSuccessful: 0,
        totalFailed: 0,
        averageResponseTime: 0
      },
      routes: [],
      topRoutes: [],
      slowestRoutes: []
    };

    try {
      const routeArray = Array.from(this.#routeStats.entries()).map(([key, stats]) => ({
        route: key,
        ...stats
      }));

      // Calculate summary
      for (const route of routeArray) {
        statistics.summary.totalRequests += route.totalRequests;
        statistics.summary.totalSuccessful += route.successfulRequests;
        statistics.summary.totalFailed += route.failedRequests;
      }

      if (statistics.summary.totalRequests > 0) {
        const totalDuration = routeArray.reduce((sum, r) => sum + r.totalDuration, 0);
        statistics.summary.averageResponseTime = totalDuration / statistics.summary.totalRequests;
      }

      // All routes
      statistics.routes = routeArray;

      // Top 10 most accessed routes
      statistics.topRoutes = routeArray
        .sort((a, b) => b.totalRequests - a.totalRequests)
        .slice(0, 10);

      // Top 10 slowest routes
      statistics.slowestRoutes = routeArray
        .filter(r => r.totalRequests > 0)
        .sort((a, b) => b.averageDuration - a.averageDuration)
        .slice(0, 10);

    } catch (error) {
      logger.error('Error getting route statistics:', error);
    }

    return statistics;
  }

  /**
   * Get the Express router instance
   * @returns {Router} Express router
   */
  getRouter() {
    return this.#router;
  }

  /**
   * Enable a specific route module
   * @param {string} moduleName - Name of the module to enable
   * @returns {boolean} Success status
   */
  enableModule(moduleName) {
    if (this.#routeModules.has(moduleName)) {
      const module = this.#routeModules.get(moduleName);
      module.enabled = true;
      logger.info(`Enabled module: ${moduleName}`);
      return true;
    }
    return false;
  }

  /**
   * Disable a specific route module
   * @param {string} moduleName - Name of the module to disable
   * @returns {boolean} Success status
   */
  disableModule(moduleName) {
    if (this.#routeModules.has(moduleName)) {
      const module = this.#routeModules.get(moduleName);
      module.enabled = false;
      logger.info(`Disabled module: ${moduleName}`);
      return true;
    }
    return false;
  }

  /**
   * Get information about all route modules
   * @returns {Array} Module information
   */
  getModuleInfo() {
    const modules = [];
    
    for (const [name, config] of this.#routeModules.entries()) {
      modules.push({
        name,
        path: config.path,
        enabled: config.enabled,
        version: config.version,
        description: config.description,
        endpointCount: config.endpoints.length
      });
    }
    
    return modules;
  }

  /**
   * Cleanup resources on shutdown
   */
  cleanup() {
    try {
      if (this.#healthCheckInterval) {
        clearInterval(this.#healthCheckInterval);
      }
      
      this.#routeStats.clear();
      this.#routeModules.clear();
      
      logger.info('Security administration router cleanup completed');
    } catch (error) {
      logger.error('Error during router cleanup:', error);
    }
  }
}

// Create and export router instance
const securityAdminRouter = new SecurityAdministrationRouter();

// Export the router and individual route modules for flexibility
module.exports = {
  // Main router instance
  router: securityAdminRouter.getRouter(),
  
  // Router class for advanced usage
  SecurityAdministrationRouter,
  
  // Individual route modules (for direct access if needed)
  routes: {
    securityAdmin: securityAdminRoutes,
    accessControl: accessControlRoutes,
    securityLogs: securityLogsRoutes,
    compliance: complianceRoutes
  },
  
  // Utility functions
  utils: {
    enableModule: (moduleName) => securityAdminRouter.enableModule(moduleName),
    disableModule: (moduleName) => securityAdminRouter.disableModule(moduleName),
    getModuleInfo: () => securityAdminRouter.getModuleInfo(),
    cleanup: () => securityAdminRouter.cleanup()
  }
};

// Also export default for simpler imports
module.exports.default = securityAdminRouter.getRouter();