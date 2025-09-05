'use strict';

/**
 * @fileoverview Comprehensive client contact management routes with hierarchical operations
 * @module servers/customer-services/modules/core-business/clients/routes/client-contacts-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/clients/controllers/client-contacts-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/validation/file-validator
 * @requires module:shared/lib/utils/logger
 * @requires multer
 */

const express = require('express');
const multer = require('multer');
const router = express.Router({ mergeParams: true }); // Important: mergeParams to access parent route params
const ClientContactsController = require('../controllers/client-contacts-controller');
// const ClientContactsValidators = require('../validators/client-contacts-validators');
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
// const { validate: fileValidator } = require('../../../../../shared/lib/middleware/validation/file-validator');
// const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Multer configuration for contact photo/document uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/vcard', 'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, vCards, and spreadsheets are allowed.'));
    }
  }
});

/**
 * Advanced rate limiting configurations for contact operations
 */
const RATE_LIMITS = {
  // Default rate limiting
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150,
    message: 'Too many contact requests, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Contact read operations
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: 'Contact read rate limit exceeded.',
    headers: true
  },
  
  // Contact write operations
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: 'Contact write rate limit exceeded.',
    headers: true
  },
  
  // Communication operations
  communication: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30,
    message: 'Communication rate limit exceeded.',
    headers: true
  },
  
  // Bulk operations
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 10000,
    message: 'Bulk contact operation limit exceeded.',
    headers: true
  },
  
  // Import/Export operations
  import: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 5,
    message: 'Contact import rate limit exceeded.',
    headers: true
  },
  
  export: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Contact export rate limit exceeded.',
    headers: true
  },
  
  // Search operations
  search: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Contact search rate limit exceeded.',
    headers: true
  },
  
  // Engagement operations
  engagement: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 50,
    message: 'Engagement operation rate limit exceeded.',
    headers: true
  }
};

/**
 * Cost calculator for contact operations
 */
const calculateContactCost = (req) => {
  let cost = 15; // Base cost
  
  // Path-based cost calculation
  const pathCosts = {
    'bulk': 150,
    'import': 100,
    'export': 80,
    'hierarchy': 60,
    'communication': 50,
    'engagement': 40,
    'merge': 80,
    'analytics': 70,
    'report': 90
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis
  if (req.body) {
    if (req.body.contacts && Array.isArray(req.body.contacts)) {
      cost += req.body.contacts.length * 5;
    }
    
    if (req.body.includeEngagementData === 'true') cost += 30;
    if (req.body.includeInteractionHistory === 'true') cost += 40;
    if (req.body.includeRelationships === 'true') cost += 25;
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeEngagementData === 'true') cost += 25;
    if (req.query.includeInteractionHistory === 'true') cost += 35;
    
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 15;
  }
  
  // File upload costs
  if (req.file || req.files) {
    const fileCount = req.files?.length || 1;
    cost += fileCount * 20;
  }
  
  return Math.min(cost, 20000); // Cap at 20000
};

/**
 * Contact operation logger
 */
const contactOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        clientId: req.params.clientId || req.clientContext?.clientId,
        contactId: req.params.contactId,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString()
      };

      // logger.info(`Contact operation initiated: ${operation}`, operationMetadata);

      req.contactOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log contact operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Middleware to validate contact access
 */
const validateContactAccess = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Contact-specific access rules
    const accessRules = {
      'contact_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer'],
        requiredPermissions: ['contacts.read']
      },
      'contact_write': {
        allowedRoles: ['admin', 'manager', 'user'],
        requiredPermissions: ['contacts.update']
      },
      'contact_delete': {
        allowedRoles: ['admin', 'manager'],
        requiredPermissions: ['contacts.delete']
      },
      'contact_communicate': {
        allowedRoles: ['admin', 'manager', 'user'],
        requiredPermissions: ['contacts.communicate']
      }
    };

    // Determine required access level based on method
    let requiredAccess = 'contact_read';
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      requiredAccess = 'contact_write';
    } else if (req.method === 'DELETE') {
      requiredAccess = 'contact_delete';
    } else if (req.path.includes('communication') || req.path.includes('send')) {
      requiredAccess = 'contact_communicate';
    }

    const rules = accessRules[requiredAccess];
    
    if (!rules.allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient role for contact operation',
        required: rules.allowedRoles
      });
    }
    
    next();
  } catch (error) {
    // logger.error('Failed to validate contact access', {
    //   error: error.message
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Access validation failed'
    });
  }
};

/**
 * Middleware to process contact search parameters
 */
const processContactSearchParams = (req, res, next) => {
  try {
    // Process boolean parameters
    if (req.query.isPrimaryContact) {
      req.query.isPrimaryContact = req.query.isPrimaryContact === 'true';
    }
    if (req.query.isDecisionMaker) {
      req.query.isDecisionMaker = req.query.isDecisionMaker === 'true';
    }
    
    // Process date parameters
    if (req.query.lastInteractionAfter) {
      req.query.lastInteractionAfter = new Date(req.query.lastInteractionAfter);
    }
    if (req.query.lastInteractionBefore) {
      req.query.lastInteractionBefore = new Date(req.query.lastInteractionBefore);
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
 * ===============================================================================
 * CONTACT CRUD ROUTES
 * Core contact management operations
 * ===============================================================================
 */

// Create new contact
router.post(
  '/',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  // ClientContactsValidators.validateCreate,
  contactOperationLogger('contact-create'),
  ClientContactsController.createContact
);

// Get all contacts for client
router.get(
  '/',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // adaptiveLimit(RATE_LIMITS.read),
  processContactSearchParams,
  ClientContactsController.getClientContacts
);

// Search contacts
router.get(
  '/search',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // limitByEndpoint(RATE_LIMITS.search),
  processContactSearchParams,
  ClientContactsController.searchContacts
);

// Get contact by ID
router.get(
  '/:contactId',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientContactsController.getContactById
);

// Update contact
router.put(
  '/:contactId',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  // ClientContactsValidators.validateUpdate,
  contactOperationLogger('contact-update'),
  ClientContactsController.updateContact
);

// Delete contact
router.delete(
  '/:contactId',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  contactOperationLogger('contact-delete'),
  ClientContactsController.deleteContact
);

/**
 * ===============================================================================
 * CONTACT HIERARCHY AND RELATIONSHIPS ROUTES
 * ===============================================================================
 */

// Get contact hierarchy
router.get(
  '/hierarchy',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientContactsController.getContactHierarchy
);

// Map contact relationships
router.get(
  '/relationships/map',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.default),
  ClientContactsController.mapContactRelationships
);

// Set primary contact
router.post(
  '/:contactId/primary',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('set-primary-contact'),
  ClientContactsController.setPrimaryContact
);

// Transfer contact ownership
router.post(
  '/:contactId/transfer',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  contactOperationLogger('contact-transfer'),
  ClientContactsController.transferContactOwnership
);

/**
 * ===============================================================================
 * CONTACT COMMUNICATION ROUTES
 * ===============================================================================
 */

// Send communication to contact
router.post(
  '/:contactId/communicate',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.communication),
  // ClientContactsValidators.validateCommunication,
  contactOperationLogger('send-communication'),
  ClientContactsController.sendCommunication
);

// Record interaction with contact
router.post(
  '/:contactId/interactions',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  // ClientContactsValidators.validateInteraction,
  contactOperationLogger('record-interaction'),
  ClientContactsController.recordInteraction
);

// Update communication preferences
router.put(
  '/:contactId/preferences',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('update-preferences'),
  ClientContactsController.updateCommunicationPreferences
);

// Schedule follow-up
router.post(
  '/:contactId/follow-up',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('schedule-followup'),
  ClientContactsController.scheduleFollowUp
);

// Get contact notifications
router.get(
  '/:contactId/notifications',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientContactsController.getContactNotifications
);

/**
 * ===============================================================================
 * CONTACT ENGAGEMENT ROUTES
 * ===============================================================================
 */

// Calculate engagement score
router.post(
  '/:contactId/engagement/calculate',
  // authorize(['admin', 'manager', 'analyst']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.engagement),
  contactOperationLogger('calculate-engagement'),
  ClientContactsController.calculateEngagementScore
);

// Get contact activity timeline
router.get(
  '/:contactId/timeline',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientContactsController.getContactActivityTimeline
);

// Get contact insights
router.get(
  '/:contactId/insights',
  // authorize(['admin', 'manager', 'analyst']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.engagement),
  ClientContactsController.getContactInsights
);

// Get contact metrics
router.get(
  '/:contactId/metrics',
  // authorize(['admin', 'manager', 'analyst']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientContactsController.getContactMetrics
);

// Get contact analytics
router.get(
  '/:contactId/analytics',
  // authorize(['admin', 'manager', 'analyst']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.engagement),
  ClientContactsController.getContactAnalytics
);

/**
 * ===============================================================================
 * CONTACT STATUS AND TAGGING ROUTES
 * ===============================================================================
 */

// Update contact status
router.patch(
  '/:contactId/status',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('update-status'),
  ClientContactsController.updateContactStatus
);

// Archive contact
router.post(
  '/:contactId/archive',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('archive-contact'),
  ClientContactsController.archiveContact
);

// Unarchive contact
router.post(
  '/:contactId/unarchive',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('unarchive-contact'),
  ClientContactsController.unarchiveContact
);

// Tag contact
router.post(
  '/:contactId/tags',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('tag-contact'),
  ClientContactsController.tagContact
);

// Untag contact
router.delete(
  '/:contactId/tags/:tag',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('untag-contact'),
  ClientContactsController.untagContact
);

/**
 * ===============================================================================
 * CONTACT GROUP MANAGEMENT ROUTES
 * ===============================================================================
 */

// Add contact to group
router.post(
  '/:contactId/groups',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('add-to-group'),
  ClientContactsController.addContactToGroup
);

// Remove contact from group
router.delete(
  '/:contactId/groups/:groupId',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('remove-from-group'),
  ClientContactsController.removeContactFromGroup
);

// Get contacts by role
router.get(
  '/by-role/:role',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientContactsController.getContactsByRole
);

/**
 * ===============================================================================
 * BULK CONTACT OPERATIONS ROUTES
 * ===============================================================================
 */

// Bulk create contacts
router.post(
  '/bulk/create',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.bulk),
  // ClientContactsValidators.validateBulkCreate,
  contactOperationLogger('bulk-create'),
  ClientContactsController.bulkCreateContacts
);

// Bulk update contacts
router.patch(
  '/bulk/update',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.bulk),
  contactOperationLogger('bulk-update'),
  ClientContactsController.bulkUpdateContacts
);

// Bulk delete contacts
router.post(
  '/bulk/delete',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.bulk),
  contactOperationLogger('bulk-delete'),
  ClientContactsController.bulkDeleteContacts
);

/**
 * ===============================================================================
 * CONTACT IMPORT/EXPORT ROUTES
 * ===============================================================================
 */

// Export contacts
router.get(
  '/export',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.export),
  contactOperationLogger('export-contacts'),
  ClientContactsController.exportContacts
);

// Import contacts
router.post(
  '/import',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.import),
  upload.single('file'),
  // fileValidator({
  //   maxSize: 10 * 1024 * 1024, // 10MB
  //   allowedTypes: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/vcard']
  // }),
  contactOperationLogger('import-contacts'),
  ClientContactsController.importContacts
);

/**
 * ===============================================================================
 * CONTACT MERGE AND DUPLICATE MANAGEMENT ROUTES
 * ===============================================================================
 */

// Merge contacts
router.post(
  '/merge',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  // ClientContactsValidators.validateMerge,
  contactOperationLogger('merge-contacts'),
  ClientContactsController.mergeContacts
);

// Duplicate contact
router.post(
  '/:contactId/duplicate',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('duplicate-contact'),
  ClientContactsController.duplicateContact
);

/**
 * ===============================================================================
 * CONTACT REPORTING ROUTES
 * ===============================================================================
 */

// Generate contact report
router.post(
  '/report',
  // authorize(['admin', 'manager', 'analyst']),
  validateContactAccess,
  // costBasedLimit(calculateContactCost, RATE_LIMITS.default),
  contactOperationLogger('generate-report'),
  ClientContactsController.generateContactReport
);

/**
 * ===============================================================================
 * CONTACT DATA MANAGEMENT ROUTES
 * ===============================================================================
 */

// Validate contact data
router.post(
  '/:contactId/validate',
  // authorize(['admin', 'manager', 'user']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.default),
  ClientContactsController.validateContactData
);

// Sync contact data
router.post(
  '/:contactId/sync',
  // authorize(['admin', 'manager']),
  validateContactAccess,
  // limitByUser(RATE_LIMITS.write),
  contactOperationLogger('sync-contact'),
  ClientContactsController.syncContactData
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
    clientId: req.params?.clientId || req.clientContext?.clientId,
    contactId: req.params?.contactId,
    contactOperation: req.contactOperationContext?.operation,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Contact route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'CONTACT_ERROR',
      message: err.message || 'Contact operation failed',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

module.exports = router;