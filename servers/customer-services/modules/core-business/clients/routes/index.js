'use strict';

/**
 * @fileoverview Centralized client route management and configuration
 * @module servers/customer-services/modules/core-business/clients/routes/index
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/clients/routes/client-routes
 * @requires module:servers/customer-services/modules/core-business/clients/routes/client-analytics-routes
 * @requires module:servers/customer-services/modules/core-business/clients/routes/client-contacts-routes
 * @requires module:servers/customer-services/modules/core-business/clients/routes/client-documents-routes
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router();

// Import route modules
const clientRoutes = require('./client-routes');
const clientAnalyticsRoutes = require('./client-analytics-routes');
const clientContactsRoutes = require('./client-contacts-routes');
const clientDocumentsRoutes = require('./client-documents-routes');

// Import shared middleware
// const { requestSanitizer } = require('../../../../../shared/lib/middleware/security/request-sanitizer');
// const { middleware: auditMiddleware, logEvent: auditLogEvent } = require('../../../../../shared/lib/middleware/logging/audit-logger');
// const { authenticate } = require('../../../../../shared/lib/auth/middleware/authenticate');
// const { createLimiter } = require('../../../../../shared/lib/auth/middleware/rate-limit');
// const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Global rate limiting configuration for all client routes
 */
const GLOBAL_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Global limit across all client endpoints
  message: 'Too many requests to client services, please try again later.',
  headers: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use a combination of IP and user ID for rate limiting
    return `${req.ip}_${req.user?.id || 'anonymous'}_client_global`;
  }
};

/**
 * Service health check configuration
 */
const SERVICE_INFO = {
  name: 'Client Management Service',
  version: '1.0.0',
  description: 'Comprehensive client lifecycle management with analytics, contacts, and document management',
  endpoints: {
    clients: '/api/v1/clients',
    analytics: '/api/v1/clients/:clientId/analytics',
    contacts: '/api/v1/clients/:clientId/contacts',
    documents: '/api/v1/clients/:clientId/documents'
  },
  features: [
    'Client CRUD operations',
    'Advanced analytics and reporting',
    'Contact relationship management',
    'Document lifecycle management',
    'Bulk operations support',
    'Real-time metrics and insights',
    'Workflow automation',
    'Multi-tenant support'
  ]
};

/**
 * Middleware to inject service context
 */
const injectServiceContext = (req, res, next) => {
  req.serviceContext = {
    service: 'client-management',
    version: SERVICE_INFO.version,
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'] || generateRequestId()
  };
  next();
};

/**
 * Middleware to track route usage metrics
 */
const trackRouteMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const metricData = {
      service: 'client-management',
      path: req.path,
      method: req.method,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      clientId: req.params?.clientId,
      timestamp: new Date().toISOString()
    };
    
    // Log metrics for monitoring
    // logger.debug('Route metrics', metricData);
    
    // Track slow requests
    if (duration > 3000) {
      // logger.warn('Slow client route detected', {
      //   ...metricData,
      //   threshold: 3000
      // });
    }
  });
  
  next();
};

/**
 * Middleware to validate tenant context
 */
const validateTenantContext = (req, res, next) => {
  // Skip tenant validation for health check and service info endpoints
  if (req.path === '/health' || req.path === '/info') {
    return next();
  }
  
  // Ensure tenant context is available for multi-tenant operations
  if (!req.tenant && process.env.MULTI_TENANT_ENABLED === 'true') {
    // logger.warn('Missing tenant context in client routes', {
    //   path: req.path,
    //   userId: req.user?.id
    // });
    
    // In production, you might want to enforce this
    // return res.status(400).json({
    //   success: false,
    //   error: {
    //     code: 'TENANT_CONTEXT_REQUIRED',
    //     message: 'Tenant context is required for this operation'
    //   }
    // });
  }
  
  next();
};

/**
 * Generate request ID if not provided
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Apply global middleware to all client routes
 */

// Service context and metrics
router.use(injectServiceContext);
router.use(trackRouteMetrics);

// Security and validation
// router.use(authenticate); // Uncomment when authentication is configured
// router.use(validateTenantContext);
// router.use(requestSanitizer({
//   sanitizeFields: ['name', 'description', 'notes', 'comments'],
//   removeFields: ['password', 'token', 'apiKey', 'secret'],
//   maxDepth: 10,
//   maxKeys: 200
// }));

// Audit logging
// router.use(auditMiddleware({
//   service: 'client-management',
//   includeBody: true,
//   includeQuery: true,
//   includeHeaders: ['user-agent', 'x-forwarded-for'],
//   sensitiveFields: ['taxId', 'bankingDetails', 'financials', 'ssn', 'creditCard'],
//   maxBodySize: 100000 // 100KB
// }));

// Global rate limiting
// router.use(createLimiter(GLOBAL_RATE_LIMIT));

/**
 * ===============================================================================
 * SERVICE HEALTH AND INFO ROUTES
 * ===============================================================================
 */

// Service health check
router.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    service: SERVICE_INFO.name,
    version: SERVICE_INFO.version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {
      database: 'connected', // In production, perform actual health checks
      cache: 'connected',
      storage: 'connected'
    }
  };
  
  res.status(200).json(health);
});

// Service information
router.get('/info', (req, res) => {
  res.status(200).json({
    ...SERVICE_INFO,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

/**
 * ===============================================================================
 * MOUNT MAIN ROUTE MODULES
 * ===============================================================================
 */

/**
 * Mount client core routes
 * Handles: CRUD operations, status management, bulk operations, import/export
 */
router.use('/', clientRoutes);

/**
 * Note: The following routes are typically mounted as nested routes under specific client IDs
 * They are handled within the main client routes file through the nested routing pattern:
 * - /clients/:clientId/analytics -> client-analytics-routes
 * - /clients/:clientId/contacts -> client-contacts-routes  
 * - /clients/:clientId/documents -> client-documents-routes
 * 
 * These are already configured in client-routes.js with proper parameter inheritance
 */

/**
 * ===============================================================================
 * GLOBAL ERROR HANDLING
 * ===============================================================================
 */

// 404 handler for unmatched client routes
router.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Client service endpoint not found: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString(),
      service: 'client-management'
    }
  });
});

// Global error handler for client routes
router.use((err, req, res, next) => {
  const errorContext = {
    service: 'client-management',
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    clientId: req.params?.clientId,
    userId: req.user?.id,
    tenantId: req.tenant?.id,
    timestamp: new Date().toISOString(),
    requestId: req.serviceContext?.requestId
  };

  // logger.error('Client service error', errorContext);

  // Log critical errors with additional context
  if (err.statusCode >= 500 || err.critical) {
    // auditLogEvent({
    //   event: 'client_service.error',
    //   timestamp: new Date().toISOString(),
    //   actor: req.user || { type: 'system', id: 'unknown' },
    //   resource: {
    //     type: 'client_service',
    //     id: req.path,
    //     name: `${req.method} ${req.path}`
    //   },
    //   action: 'error',
    //   result: 'failure',
    //   metadata: errorContext
    // }, req).catch(auditError => {
    //   logger.error('Failed to audit client service error', {
    //     auditError: auditError.message,
    //     originalError: err.message
    //   });
    // });
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Build error response
  const errorResponse = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isProduction && statusCode === 500 
        ? 'An internal server error occurred' 
        : err.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      service: 'client-management',
      requestId: req.serviceContext?.requestId
    }
  };

  // Add additional details in development
  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details;
    errorResponse.error.context = errorContext;
  }

  // Add retry information for rate limit errors
  if (statusCode === 429) {
    errorResponse.error.retryAfter = err.retryAfter || 60;
  }

  res.status(statusCode).json(errorResponse);
});

/**
 * ===============================================================================
 * MODULE EXPORTS
 * ===============================================================================
 */

/**
 * Export the configured router
 * @type {express.Router}
 */
module.exports = router;

/**
 * Export individual route modules for direct access if needed
 */
module.exports.clientRoutes = clientRoutes;
module.exports.clientAnalyticsRoutes = clientAnalyticsRoutes;
module.exports.clientContactsRoutes = clientContactsRoutes;
module.exports.clientDocumentsRoutes = clientDocumentsRoutes;

/**
 * Export service information for documentation
 */
module.exports.SERVICE_INFO = SERVICE_INFO;