'use strict';

/**
 * @fileoverview Central routing hub for organization management module
 * @module servers/admin-server/modules/organization-management/routes
 * @description Aggregates and exports all organization management routes including
 * organization administration, subscription management, settings configuration, and tenant management
 * @requires express
 * @requires module:servers/admin-server/modules/organization-management/routes/organization-admin-routes
 * @requires module:servers/admin-server/modules/organization-management/routes/subscription-management-routes
 * @requires module:servers/admin-server/modules/organization-management/routes/organization-settings-routes
 * @requires module:servers/admin-server/modules/organization-management/routes/tenant-management-routes
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/error-handlers/not-found-handler
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');

// Import route modules
const organizationAdminRoutes = require('./organization-admin-routes');
const subscriptionManagementRoutes = require('./subscription-management-routes');
const organizationSettingsRoutes = require('./organization-settings-routes');
const tenantManagementRoutes = require('./tenant-management-routes');

// Import shared middleware
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const errorHandler = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const notFoundHandler = require('../../../../../shared/lib/middleware/error-handlers/not-found-handler');
const logger = require('../../../../../shared/lib/utils/logger');

/**
 * @class OrganizationManagementRouter
 * @description Central router for organization management module
 */
class OrganizationManagementRouter {
  #router;
  #initialized;
  #routeStats;
  #moduleMetadata;

  /**
   * @constructor
   * @description Initialize the organization management router
   */
  constructor() {
    this.#router = express.Router();
    this.#initialized = false;
    this.#routeStats = {
      totalRequests: 0,
      routeHits: new Map(),
      errors: new Map(),
      lastReset: new Date()
    };
    this.#moduleMetadata = {
      version: '1.0.0',
      module: 'organization-management',
      description: 'Enterprise organization and tenant management routes',
      capabilities: [
        'organization-administration',
        'subscription-management',
        'settings-configuration',
        'tenant-management',
        'multi-tenant-support',
        'billing-operations',
        'compliance-management',
        'resource-optimization'
      ]
    };
  }

  /**
   * Initialize the router with all sub-routes and middleware
   * @returns {express.Router} Configured router instance
   */
  initialize() {
    if (this.#initialized) {
      logger.warn('OrganizationManagementRouter already initialized');
      return this.#router;
    }

    try {
      // Apply global middleware for all organization management routes
      this.#applyGlobalMiddleware();

      // Mount route modules with appropriate prefixes
      this.#mountRouteModules();

      // Apply route-level middleware
      this.#applyRouteMiddleware();

      // Setup error handling
      this.#setupErrorHandling();

      // Setup route monitoring
      this.#setupRouteMonitoring();

      this.#initialized = true;
      logger.info('OrganizationManagementRouter initialized successfully', {
        module: this.#moduleMetadata.module,
        version: this.#moduleMetadata.version,
        capabilities: this.#moduleMetadata.capabilities
      });

      return this.#router;
    } catch (error) {
      logger.error('Failed to initialize OrganizationManagementRouter:', error);
      throw error;
    }
  }

  /**
   * Apply global middleware to all routes
   * @private
   */
  #applyGlobalMiddleware() {
    // Request logging
    this.#router.use(requestLogger({
      module: 'organization-management',
      includeBody: true,
      includeHeaders: false,
      sensitiveFields: ['password', 'token', 'apiKey', 'secret']
    }));

    // Security headers
    this.#router.use(securityHeaders({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
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

    // Parse JSON bodies for POST/PUT/PATCH requests
    this.#router.use(express.json({
      limit: '10mb',
      strict: true,
      type: 'application/json'
    }));

    // Parse URL-encoded bodies
    this.#router.use(express.urlencoded({
      extended: true,
      limit: '10mb'
    }));

    logger.debug('Global middleware applied to organization management routes');
  }

  /**
   * Mount all route modules with their respective prefixes
   * @private
   */
  #mountRouteModules() {
    // Organization Administration Routes
    this.#router.use('/organizations', organizationAdminRoutes);
    logger.info('Mounted organization administration routes at /organizations');

    // Subscription Management Routes
    this.#router.use('/subscriptions', subscriptionManagementRoutes);
    logger.info('Mounted subscription management routes at /subscriptions');

    // Organization Settings Routes
    this.#router.use('/settings', organizationSettingsRoutes);
    logger.info('Mounted organization settings routes at /settings');

    // Tenant Management Routes
    this.#router.use('/tenants', tenantManagementRoutes);
    logger.info('Mounted tenant management routes at /tenants');

    // Additional route aliases for convenience
    this.#setupRouteAliases();
  }

  /**
   * Setup route aliases for common operations
   * @private
   */
  #setupRouteAliases() {
    // Alias for organization billing dashboard
    this.#router.get('/billing/:organizationId/dashboard', (req, res) => {
      req.url = `/subscriptions/organizations/${req.params.organizationId}/billing-dashboard`;
      subscriptionManagementRoutes.handle(req, res);
    });

    // Alias for organization health check
    this.#router.get('/health/:organizationId', (req, res) => {
      req.url = `/organizations/${req.params.organizationId}/dashboard`;
      organizationAdminRoutes.handle(req, res);
    });

    // Alias for quick tenant provisioning
    this.#router.post('/quick-provision/tenant', (req, res) => {
      req.url = '/tenants/action/provision';
      tenantManagementRoutes.handle(req, res);
    });

    logger.debug('Route aliases configured for common operations');
  }

  /**
   * Apply route-specific middleware
   * @private
   */
  #applyRouteMiddleware() {
    // Add request ID to all requests
    this.#router.use((req, res, next) => {
      req.id = req.headers['x-request-id'] || this.#generateRequestId();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Add response time tracking
    this.#router.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
        
        // Log slow requests
        if (duration > 3000) {
          logger.warn('Slow request detected', {
            path: req.path,
            method: req.method,
            duration,
            requestId: req.id
          });
        }
      });
      
      next();
    });

    // Add module context to requests
    this.#router.use((req, res, next) => {
      req.moduleContext = {
        module: 'organization-management',
        version: this.#moduleMetadata.version,
        capabilities: this.#moduleMetadata.capabilities
      };
      next();
    });
  }

  /**
   * Setup comprehensive error handling
   * @private
   */
  #setupErrorHandling() {
    // Handle 404 errors for unmatched routes
    this.#router.use('*', notFoundHandler({
      message: 'The requested organization management endpoint does not exist',
      suggestions: [
        '/organizations - Organization administration',
        '/subscriptions - Subscription and billing management',
        '/settings - Organization settings and configuration',
        '/tenants - Tenant management and operations'
      ]
    }));

    // Global error handler for organization management routes
    this.#router.use(errorHandler({
      includeStack: process.env.NODE_ENV === 'development',
      logErrors: true,
      customHandlers: {
        ValidationError: (err, req, res) => {
          res.status(400).json({
            success: false,
            error: {
              type: 'VALIDATION_ERROR',
              message: err.message,
              details: err.details || [],
              path: req.path,
              timestamp: new Date().toISOString()
            }
          });
        },
        UnauthorizedError: (err, req, res) => {
          res.status(401).json({
            success: false,
            error: {
              type: 'UNAUTHORIZED',
              message: 'Authentication required for this operation',
              path: req.path,
              timestamp: new Date().toISOString()
            }
          });
        },
        ForbiddenError: (err, req, res) => {
          res.status(403).json({
            success: false,
            error: {
              type: 'FORBIDDEN',
              message: 'Insufficient permissions for this operation',
              required: err.requiredPermissions || [],
              path: req.path,
              timestamp: new Date().toISOString()
            }
          });
        },
        ConflictError: (err, req, res) => {
          res.status(409).json({
            success: false,
            error: {
              type: 'CONFLICT',
              message: err.message,
              conflictingResource: err.resource,
              path: req.path,
              timestamp: new Date().toISOString()
            }
          });
        },
        TenantError: (err, req, res) => {
          res.status(400).json({
            success: false,
            error: {
              type: 'TENANT_ERROR',
              message: err.message,
              tenantId: err.tenantId,
              operation: err.operation,
              path: req.path,
              timestamp: new Date().toISOString()
            }
          });
        },
        BillingError: (err, req, res) => {
          res.status(402).json({
            success: false,
            error: {
              type: 'BILLING_ERROR',
              message: err.message,
              subscriptionId: err.subscriptionId,
              requiredAction: err.requiredAction,
              path: req.path,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    }));

    logger.info('Error handling configured for organization management routes');
  }

  /**
   * Setup route monitoring and statistics
   * @private
   */
  #setupRouteMonitoring() {
    // Track route usage
    this.#router.use((req, res, next) => {
      this.#routeStats.totalRequests++;
      
      const routeKey = `${req.method}:${req.baseUrl}${req.path}`;
      const currentHits = this.#routeStats.routeHits.get(routeKey) || 0;
      this.#routeStats.routeHits.set(routeKey, currentHits + 1);
      
      // Track errors
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          const errorKey = `${res.statusCode}:${routeKey}`;
          const currentErrors = this.#routeStats.errors.get(errorKey) || 0;
          this.#routeStats.errors.set(errorKey, currentErrors + 1);
        }
      });
      
      next();
    });

    // Expose statistics endpoint (for internal monitoring)
    this.#router.get('/_stats', (req, res) => {
      // Only allow from internal IPs or with special header
      const isInternal = req.ip === '127.0.0.1' || 
                        req.headers['x-internal-monitoring'] === process.env.MONITORING_KEY;
      
      if (!isInternal) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.json({
        module: this.#moduleMetadata,
        statistics: {
          totalRequests: this.#routeStats.totalRequests,
          routeHits: Array.from(this.#routeStats.routeHits.entries()).map(([route, hits]) => ({
            route,
            hits
          })),
          errors: Array.from(this.#routeStats.errors.entries()).map(([error, count]) => ({
            error,
            count
          })),
          lastReset: this.#routeStats.lastReset,
          uptime: process.uptime()
        }
      });
    });

    // Reset statistics periodically (every 24 hours)
    setInterval(() => {
      this.#resetStatistics();
    }, 24 * 60 * 60 * 1000);

    logger.info('Route monitoring configured for organization management module');
  }

  /**
   * Generate unique request ID
   * @private
   * @returns {string} Generated request ID
   */
  #generateRequestId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `org-mgmt-${timestamp}-${randomPart}`;
  }

  /**
   * Reset route statistics
   * @private
   */
  #resetStatistics() {
    const previousStats = {
      totalRequests: this.#routeStats.totalRequests,
      topRoutes: Array.from(this.#routeStats.routeHits.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };

    logger.info('Resetting route statistics', previousStats);

    this.#routeStats = {
      totalRequests: 0,
      routeHits: new Map(),
      errors: new Map(),
      lastReset: new Date()
    };
  }

  /**
   * Get router instance
   * @returns {express.Router} Configured router
   */
  getRouter() {
    if (!this.#initialized) {
      return this.initialize();
    }
    return this.#router;
  }

  /**
   * Get module metadata
   * @returns {Object} Module metadata
   */
  getMetadata() {
    return { ...this.#moduleMetadata };
  }

  /**
   * Get current statistics
   * @returns {Object} Current route statistics
   */
  getStatistics() {
    return {
      ...this.#routeStats,
      routeHits: Array.from(this.#routeStats.routeHits.entries()),
      errors: Array.from(this.#routeStats.errors.entries())
    };
  }
}

// Create and initialize router instance
const organizationManagementRouter = new OrganizationManagementRouter();
const router = organizationManagementRouter.initialize();

// Export configured router and utilities
module.exports = router;
module.exports.OrganizationManagementRouter = OrganizationManagementRouter;
module.exports.getMetadata = () => organizationManagementRouter.getMetadata();
module.exports.getStatistics = () => organizationManagementRouter.getStatistics();

// Export individual route modules for direct access if needed
module.exports.routes = {
  organizations: organizationAdminRoutes,
  subscriptions: subscriptionManagementRoutes,
  settings: organizationSettingsRoutes,
  tenants: tenantManagementRoutes
};

// Log successful module export
logger.info('Organization Management Routes module exported successfully', {
  module: 'organization-management',
  routes: [
    'organizations',
    'subscriptions',
    'settings',
    'tenants'
  ],
  initialized: true
});