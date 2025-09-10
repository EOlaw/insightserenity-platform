'use strict';

/**
 * @fileoverview Comprehensive client management routes for core business operations
 * @module servers/customer-services/modules/core-business/clients/routes/client-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/clients/controllers/client-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router();
const ClientController = require('../controllers/client-controller');
// const ClientValidators = require('../validators/client-validators');
// const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
// const {
//   createLimiter,
//   limitByIP,
//   limitByUser,
//   limitByEndpoint,
//   combinedLimit,
//   customLimit,
//   costBasedLimit,
//   adaptiveLimit
// } = require('../../../../../shared/lib/auth/middleware/rate-limit');
// const { requestSanitizer } = require('../../../../../shared/lib/middleware/security/request-sanitizer');
// const { middleware: auditMiddleware, logEvent: auditLogEvent } = require('../../../../../shared/lib/middleware/logging/audit-logger');
// const { validate: requestValidator } = require('../../../../../shared/lib/middleware/validation/request-validator');
// const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Advanced rate limiting configurations for client operations
 */
const RATE_LIMITS = {
  // Default rate limiting for general client operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many client requests from this IP, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // High-frequency read operations with adaptive limiting
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 100,
    minMax: 50,
    maxMax: 200,
    message: 'Client read rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Write operations with burst protection
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    message: 'Client write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Critical client operations
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Critical client operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user', 'endpoint'],
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Import/Export operations with cost-based limiting
  import: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 10000,
    message: 'Client import rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_import`
  },
  
  export: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 5000,
    message: 'Client export rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_export`
  },
  
  // Bulk operations
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 20000,
    message: 'Bulk client operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_bulk`
  },
  
  // Search operations
  search: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50,
    message: 'Client search rate limit exceeded.',
    headers: true
  },
  
  // Analytics operations
  analytics: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 5000,
    message: 'Client analytics cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_analytics`
  }
};

/**
 * Enhanced cost calculator for client operations
 */
const calculateClientCost = (req) => {
  let cost = 20; // Base cost
  
  // Path-based cost calculation
  const pathCosts = {
    'bulk': 200,
    'import': 150,
    'export': 100,
    'merge': 150,
    'analytics': 80,
    'statistics': 60,
    'relationships': 70,
    'timeline': 50,
    'health': 60,
    'audit': 70,
    'report': 100
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis
  if (req.body) {
    if (req.body.clients && Array.isArray(req.body.clients)) {
      cost += req.body.clients.length * 10;
    }
    
    if (req.body.includeAnalytics === 'true') cost += 50;
    if (req.body.includeDocuments === 'true') cost += 40;
    if (req.body.includeContacts === 'true') cost += 40;
    if (req.body.includeHistory === 'true') cost += 30;
    
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 100000) { // 100KB
      cost += Math.floor(bodySize / 10000) * 5;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeAnalytics === 'true') cost += 40;
    if (req.query.includeMetrics === 'true') cost += 30;
    if (req.query.includeRelationships === 'true') cost += 25;
    if (req.query.includeDocuments === 'true') cost += 30;
    
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 20;
  }
  
  return Math.min(cost, 25000); // Cap at 25000
};

/**
 * Enhanced client operation logger
 */
const clientOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        clientId: req.params.clientId,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        userAgent: req.get('user-agent'),
        requestSize: JSON.stringify(req.body || {}).length,
        queryParams: req.query
      };

      // logger.info(`Client operation initiated: ${operation}`, operationMetadata);

      // Store operation context
      req.clientOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log client operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Enhanced middleware to validate client access
 */
const validateClientAccess = async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Access validation rules for clients
    const accessValidationRules = {
      'client_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer'],
        requiredPermissions: ['clients.read'],
        paths: ['/dashboard', '/summary', '/metrics', '/timeline']
      },
      'client_write': {
        allowedRoles: ['admin', 'manager', 'user'],
        requiredPermissions: ['clients.update'],
        paths: ['/update', '/status', '/tier']
      },
      'client_delete': {
        allowedRoles: ['admin'],
        requiredPermissions: ['clients.delete'],
        paths: ['/delete', '/archive']
      },
      'client_analytics': {
        allowedRoles: ['admin', 'manager', 'analyst'],
        requiredPermissions: ['clients.analytics'],
        paths: ['/analytics', '/statistics', '/health-scores']
      },
      'client_management': {
        allowedRoles: ['admin', 'manager'],
        requiredPermissions: ['clients.manage'],
        paths: ['/transfer', '/merge', '/duplicate']
      }
    };

    // Validate based on request path and method
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Special handling for DELETE operations
        if (req.method === 'DELETE' && !['admin'].includes(userRole)) {
          // logger.warn('Unauthorized client delete attempt', {
          //   clientId,
          //   userId,
          //   userRole
          // });
          
          return res.status(403).json({
            success: false,
            message: 'Delete operations require admin privileges'
          });
        }

        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          // logger.warn('Unauthorized client access attempt', {
          //   clientId,
          //   userId,
          //   userRole,
          //   requiredRoles: rules.allowedRoles
          // });
          
          return res.status(403).json({
            success: false,
            message: `Insufficient role permissions for ${resourceType.replace('_', ' ')}`,
            required: rules.allowedRoles
          });
        }

        // Permission-based validation
        const hasRequiredPermissions = rules.requiredPermissions.every(permission =>
          userPermissions.includes(permission)
        );

        if (!hasRequiredPermissions) {
          // logger.warn('Insufficient permissions for client access', {
          //   clientId,
          //   userId,
          //   userPermissions,
          //   requiredPermissions: rules.requiredPermissions
          // });
          
          return res.status(403).json({
            success: false,
            message: `Insufficient permissions for ${resourceType.replace('_', ' ')}`,
            required: rules.requiredPermissions
          });
        }
      }
    }
    
    // logger.debug('Client access validated successfully', {
    //   clientId,
    //   userId,
    //   userRole
    // });
    
    next();
  } catch (error) {
    // logger.error('Failed to validate client access', {
    //   error: error.message,
    //   userId: req.user?.id
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Access validation failed'
    });
  }
};

/**
 * Enhanced middleware to check client conflicts
 */
const checkClientConflicts = async (req, res, next) => {
  try {
    if (req.body.companyName && req.method === 'POST') {
      // Validate company name format
      if (!/^[a-zA-Z0-9\s&.-]+$/.test(req.body.companyName)) {
        return res.status(400).json({
          success: false,
          message: 'Company name contains invalid characters'
        });
      }

      // Check name length
      if (req.body.companyName.length > 255) {
        return res.status(400).json({
          success: false,
          message: 'Company name cannot exceed 255 characters'
        });
      }
    }
    
    next();
  } catch (error) {
    // logger.error('Failed to check client conflicts', {
    //   error: error.message
    // });
    next();
  }
};

/**
 * Middleware to validate client data
 */
const validateClientData = async (req, res, next) => {
  try {
    const validationErrors = [];
    
    // Validate required fields for create/update
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!req.body.companyName && req.method === 'POST') {
        validationErrors.push('Company name is required');
      }
      
      if (req.body.relationship?.tier) {
        const validTiers = ['startup', 'small_business', 'mid_market', 'enterprise', 'strategic'];
        if (!validTiers.includes(req.body.relationship.tier)) {
          validationErrors.push(`Invalid tier. Valid options: ${validTiers.join(', ')}`);
        }
      }
      
      if (req.body.relationship?.status) {
        const validStatuses = ['prospect', 'active', 'inactive', 'churned'];
        if (!validStatuses.includes(req.body.relationship.status)) {
          validationErrors.push(`Invalid status. Valid options: ${validStatuses.join(', ')}`);
        }
      }
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    next();
  } catch (error) {
    // logger.error('Failed to validate client data', {
    //   error: error.message
    // });
    next();
  }
};

/**
 * Middleware to handle client search parameters
 */
const processSearchParams = (req, res, next) => {
  try {
    // Process and validate search parameters
    if (req.query.createdAfter) {
      req.query.createdAfter = new Date(req.query.createdAfter);
    }
    if (req.query.createdBefore) {
      req.query.createdBefore = new Date(req.query.createdBefore);
    }
    if (req.query.minRevenue) {
      req.query.minRevenue = parseFloat(req.query.minRevenue);
    }
    if (req.query.maxRevenue) {
      req.query.maxRevenue = parseFloat(req.query.maxRevenue);
    }
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid search parameters'
    });
  }
};

/**
 * Apply global middleware to all client routes
 */
// router.use(authenticate);
// router.use(requestSanitizer({
//   sanitizeFields: ['companyName', 'legalName', 'description', 'notes'],
//   removeFields: ['password', 'token', 'apiKey'],
//   maxDepth: 10,
//   maxKeys: 150
// }));
// router.use(auditMiddleware({
//   service: 'client-management',
//   includeBody: true,
//   includeQuery: true,
//   sensitiveFields: ['taxId', 'bankingDetails', 'financials']
// }));

/**
 * ===============================================================================
 * CLIENT CRUD ROUTES
 * Core client management operations
 * ===============================================================================
 */

// Create new client
router.post(
  '/',
  // authorize(['admin', 'manager', 'user']),
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  // ClientValidators.validateCreate,
  validateClientData,
  checkClientConflicts,
  clientOperationLogger('client-create'),
  ClientController.createClient
);

// List clients with pagination and filtering
router.get(
  '/',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  // adaptiveLimit(RATE_LIMITS.read),
  // processSearchParams,
  ClientController.searchClients
);

// Search clients with advanced filtering
router.get(
  '/search',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  // limitByEndpoint(RATE_LIMITS.search),
  // ClientValidators.validateSearch,
  processSearchParams,
  ClientController.searchClients
);

// Get clients by filter criteria
router.get(
  '/filter',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  // limitByUser(RATE_LIMITS.read),
  processSearchParams,
  ClientController.getClientsByFilter
);

// Get client statistics
router.get(
  '/statistics',
  // authorize(['admin', 'manager', 'analyst']),
  // costBasedLimit(calculateClientCost, RATE_LIMITS.analytics),
  ClientController.getClientStatistics
);

// Get client by ID
router.get(
  '/:clientId',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateClientAccess,
  // adaptiveLimit(RATE_LIMITS.read),
  ClientController.getClientById
);

// Update client
router.put(
  '/:clientId',
  // authorize(['admin', 'manager', 'user']),
  validateClientAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  // ClientValidators.validateUpdate,
  validateClientData,
  clientOperationLogger('client-update'),
  ClientController.updateClient
);

// Delete client (soft delete)
router.delete(
  '/:clientId',
  // authorize(['admin']),
  validateClientAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  clientOperationLogger('client-delete'),
  ClientController.deleteClient
);

/**
 * ===============================================================================
 * CLIENT STATUS AND RELATIONSHIP MANAGEMENT ROUTES
 * ===============================================================================
 */

// Update client status
router.patch(
  '/:clientId/status',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.write),
  // ClientValidators.validateStatusUpdate,
  clientOperationLogger('client-status-update'),
  ClientController.updateClientStatus
);

// Update client tier
router.patch(
  '/:clientId/tier',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.write),
  // ClientValidators.validateTierUpdate,
  clientOperationLogger('client-tier-update'),
  ClientController.updateClientTier
);

// Get client relationships
router.get(
  '/:clientId/relationships',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientController.getClientRelationships
);

// Transfer client ownership
router.post(
  '/:clientId/transfer',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  // ClientValidators.validateTransfer,
  clientOperationLogger('client-transfer'),
  ClientController.transferClientOwnership
);

/**
 * ===============================================================================
 * CLIENT ANALYTICS AND METRICS ROUTES
 * ===============================================================================
 */

// Get client metrics
router.get(
  '/:clientId/metrics',
  // authorize(['admin', 'manager', 'analyst', 'viewer']),
  validateClientAccess,
  // costBasedLimit(calculateClientCost, RATE_LIMITS.analytics),
  ClientController.getClientMetrics
);

// Calculate health scores
router.post(
  '/:clientId/health-score',
  // authorize(['admin', 'manager', 'analyst']),
  validateClientAccess,
  // costBasedLimit(calculateClientCost, RATE_LIMITS.analytics),
  clientOperationLogger('health-score-calculate'),
  ClientController.calculateHealthScores
);

// Calculate all health scores
router.post(
  '/health-scores/calculate',
  // authorize(['admin']),
  // costBasedLimit(calculateClientCost, RATE_LIMITS.analytics),
  clientOperationLogger('health-scores-calculate-all'),
  ClientController.calculateHealthScores
);

// Get client timeline
router.get(
  '/:clientId/timeline',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientController.getClientTimeline
);

// Get client dashboard data
router.get(
  '/:clientId/dashboard',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateClientAccess,
  // costBasedLimit(calculateClientCost, RATE_LIMITS.analytics),
  ClientController.getClientDashboard
);

// Get client summary
router.get(
  '/:clientId/summary',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientController.getClientSummary
);

/**
 * ===============================================================================
 * CLIENT BULK OPERATIONS ROUTES
 * ===============================================================================
 */

// Bulk create clients
router.post(
  '/bulk/create',
  // authorize(['admin', 'manager']),
  // costBasedLimit(calculateClientCost, RATE_LIMITS.bulk),
  // ClientValidators.validateBulkCreate,
  validateClientData,
  clientOperationLogger('bulk-create'),
  ClientController.bulkCreateClients
);

// Bulk update clients
router.patch(
  '/bulk/update',
  // authorize(['admin', 'manager']),
  // costBasedLimit(calculateClientCost, RATE_LIMITS.bulk),
  // ClientValidators.validateBulkUpdate,
  clientOperationLogger('bulk-update'),
  ClientController.bulkUpdateClients
);

// Bulk delete clients
router.post(
  '/bulk/delete',
  // authorize(['admin']),
  // combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  // ClientValidators.validateBulkDelete,
  clientOperationLogger('bulk-delete'),
  ClientController.bulkDeleteClients
);

/**
 * ===============================================================================
 * CLIENT IMPORT/EXPORT ROUTES
 * ===============================================================================
 */

// Export clients
router.get(
  '/export/:format',
  // authorize(['admin', 'manager']),
  // costBasedLimit(calculateClientCost, RATE_LIMITS.export),
  clientOperationLogger('clients-export'),
  ClientController.exportClients
);

// Import clients
router.post(
  '/import',
  // authorize(['admin', 'manager']),
  // costBasedLimit(calculateClientCost, RATE_LIMITS.import),
  // ClientValidators.validateImport,
  clientOperationLogger('clients-import'),
  ClientController.importClients
);

/**
 * ===============================================================================
 * CLIENT ARCHIVE AND RECOVERY ROUTES
 * ===============================================================================
 */

// Archive client
router.post(
  '/:clientId/archive',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.write),
  clientOperationLogger('client-archive'),
  ClientController.archiveClient
);

// Unarchive client
router.post(
  '/:clientId/unarchive',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.write),
  clientOperationLogger('client-unarchive'),
  ClientController.unarchiveClient
);

/**
 * ===============================================================================
 * CLIENT DUPLICATION AND MERGING ROUTES
 * ===============================================================================
 */

// Duplicate client
router.post(
  '/:clientId/duplicate',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.write),
  clientOperationLogger('client-duplicate'),
  ClientController.duplicateClient
);

// Merge clients
router.post(
  '/merge',
  // authorize(['admin']),
  // combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  // ClientValidators.validateMerge,
  clientOperationLogger('clients-merge'),
  ClientController.mergeClients
);

/**
 * ===============================================================================
 * CLIENT DATA MANAGEMENT ROUTES
 * ===============================================================================
 */

// Validate client data
router.post(
  '/:clientId/validate',
  // authorize(['admin', 'manager', 'user']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.default),
  ClientController.validateClientData
);

// Sync client data
router.post(
  '/:clientId/sync',
  // authorize(['admin', 'manager']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.write),
  clientOperationLogger('client-sync'),
  ClientController.syncClientData
);

/**
 * ===============================================================================
 * CLIENT AUDIT AND REPORTING ROUTES
 * ===============================================================================
 */

// Get client audit trail
router.get(
  '/:clientId/audit',
  // authorize(['admin', 'auditor']),
  validateClientAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientController.auditClient
);

// Generate client report
router.post(
  '/:clientId/report',
  // authorize(['admin', 'manager', 'analyst']),
  validateClientAccess,
  // costBasedLimit(calculateClientCost, RATE_LIMITS.analytics),
  clientOperationLogger('client-report'),
  ClientController.generateClientReport
);

/**
 * ===============================================================================
 * NESTED RESOURCE ROUTES
 * Routes to sub-resources (handled by separate route files)
 * ===============================================================================
 */

// Mount nested contact routes
router.use('/:clientId/contacts', 
  validateClientAccess,
  (req, res, next) => {
    req.clientContext = { clientId: req.params.clientId };
    next();
  },
  require('./client-contacts-routes')
);

// Mount nested document routes
router.use('/:clientId/documents',
  validateClientAccess,
  (req, res, next) => {
    req.clientContext = { clientId: req.params.clientId };
    next();
  },
  require('./client-documents-routes')
);

// Mount nested analytics routes
router.use('/:clientId/analytics',
  validateClientAccess,
  (req, res, next) => {
    req.clientContext = { clientId: req.params.clientId };
    next();
  },
  require('./client-analytics-routes')
);

/**
 * ===============================================================================
 * ERROR HANDLING MIDDLEWARE
 * ===============================================================================
 */
router.use((err, req, res, next) => {
  const errorContext = {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    clientId: req.params?.clientId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Client route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An internal server error occurred',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

module.exports = router;