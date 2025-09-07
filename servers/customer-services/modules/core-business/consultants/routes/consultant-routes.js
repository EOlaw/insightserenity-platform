'use strict';

/**
 * @fileoverview Comprehensive consultant management routes for core business operations
 * @module servers/customer-services/modules/core-business/consultants/routes/consultant-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/consultants/controllers/consultant-controller
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
const multer = require('multer');
const ConsultantController = require('../controllers/consultant-controller');
// const ConsultantValidators = require('../validators/consultant-validators');
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
 * Advanced rate limiting configurations for consultant operations
 */
const RATE_LIMITS = {
  // Default rate limiting for general consultant operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many consultant requests from this IP, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // High-frequency read operations with adaptive limiting
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 150,
    minMax: 75,
    maxMax: 300,
    message: 'Consultant read rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Write operations with burst protection
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 40,
    message: 'Consultant write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Critical consultant operations
  critical: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: 'Critical consultant operation rate limit exceeded.',
    headers: true,
    strategies: ['ip', 'user', 'endpoint'],
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Matching operations with cost-based limiting
  matching: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 8000,
    message: 'Consultant matching rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_matching`
  },
  
  // Import/Export operations
  import: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 15000,
    message: 'Consultant import rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_import`
  },
  
  export: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 7500,
    message: 'Consultant export rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_export`
  },
  
  // Bulk operations
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 25000,
    message: 'Bulk consultant operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_bulk`
  },
  
  // Search operations
  search: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Consultant search rate limit exceeded.',
    headers: true
  },
  
  // Analytics operations
  analytics: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 6000,
    message: 'Consultant analytics cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_analytics`
  },

  // File upload operations
  upload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 25,
    message: 'File upload rate limit exceeded.',
    headers: true
  },

  // Performance metrics operations
  performance: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 4000,
    message: 'Performance metrics rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_performance`
  }
};

/**
 * Enhanced cost calculator for consultant operations
 */
const calculateConsultantCost = (req) => {
  let cost = 25; // Base cost for consultant operations
  
  // Path-based cost calculation
  const pathCosts = {
    'match': 300,
    'bulk': 250,
    'import': 200,
    'export': 150,
    'analytics': 100,
    'statistics': 80,
    'performance': 120,
    'skills': 60,
    'availability': 70,
    'profile': 50,
    'report': 150,
    'dashboard': 90,
    'benchmarks': 110,
    'recommendations': 80,
    'transfer': 200,
    'archive': 100,
    'sync': 90,
    'audit': 80
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis
  if (req.body) {
    if (req.body.consultants && Array.isArray(req.body.consultants)) {
      cost += req.body.consultants.length * 15;
    }
    
    if (req.body.includeAnalytics === 'true') cost += 60;
    if (req.body.includePerformance === 'true') cost += 80;
    if (req.body.includeSkills === 'true') cost += 50;
    if (req.body.includeAvailability === 'true') cost += 60;
    if (req.body.includeProfile === 'true') cost += 40;
    if (req.body.includeDocuments === 'true') cost += 45;
    if (req.body.includeHistory === 'true') cost += 35;
    
    // Complex matching criteria
    if (req.body.requiredSkills && Array.isArray(req.body.requiredSkills)) {
      cost += req.body.requiredSkills.length * 10;
    }
    if (req.body.preferredSkills && Array.isArray(req.body.preferredSkills)) {
      cost += req.body.preferredSkills.length * 5;
    }
    
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 150000) { // 150KB
      cost += Math.floor(bodySize / 15000) * 8;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeAnalytics === 'true') cost += 50;
    if (req.query.includeMetrics === 'true') cost += 40;
    if (req.query.includeSkills === 'true') cost += 40;
    if (req.query.includeAvailability === 'true') cost += 50;
    if (req.query.includePerformance === 'true') cost += 70;
    if (req.query.includeProfile === 'true') cost += 30;
    
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 25;
    
    // Complex search parameters
    if (req.query.skills) cost += req.query.skills.split(',').length * 8;
    if (req.query.fuzzyMatch === 'true') cost += 50;
    if (req.query.skillMatchThreshold) cost += 30;
  }
  
  return Math.min(cost, 30000); // Cap at 30000
};

/**
 * Configure multer for file uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 
                         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

/**
 * Enhanced consultant operation logger
 */
const consultantOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        consultantId: req.params.consultantId,
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

      // logger.info(`Consultant operation initiated: ${operation}`, operationMetadata);

      // Store operation context
      req.consultantOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log consultant operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Enhanced middleware to validate consultant access
 */
const validateConsultantAccess = async (req, res, next) => {
  try {
    const { consultantId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Access validation rules for consultants
    const accessValidationRules = {
      'consultant_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer', 'hr'],
        requiredPermissions: ['consultants.read'],
        paths: ['/dashboard', '/summary', '/metrics', '/profile', '/skills']
      },
      'consultant_write': {
        allowedRoles: ['admin', 'manager', 'hr'],
        requiredPermissions: ['consultants.update'],
        paths: ['/update', '/status', '/level', '/rates']
      },
      'consultant_delete': {
        allowedRoles: ['admin'],
        requiredPermissions: ['consultants.delete'],
        paths: ['/delete', '/archive']
      },
      'consultant_analytics': {
        allowedRoles: ['admin', 'manager', 'analyst', 'hr'],
        requiredPermissions: ['consultants.analytics'],
        paths: ['/analytics', '/statistics', '/performance', '/benchmarks']
      },
      'consultant_management': {
        allowedRoles: ['admin', 'manager', 'hr'],
        requiredPermissions: ['consultants.manage'],
        paths: ['/transfer', '/level', '/rates', '/assign']
      },
      'consultant_sensitive': {
        allowedRoles: ['admin', 'hr'],
        requiredPermissions: ['consultants.viewSensitive'],
        paths: ['/compensation', '/reviews', '/audit']
      }
    };

    // Validate based on request path and method
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Special handling for DELETE operations
        if (req.method === 'DELETE' && !['admin'].includes(userRole)) {
          // logger.warn('Unauthorized consultant delete attempt', {
          //   consultantId,
          //   userId,
          //   userRole
          // });
          
          return res.status(403).json({
            success: false,
            message: 'Delete operations require admin privileges'
          });
        }

        // Self-access validation for consultants
        if (consultantId === userId && ['read', 'update'].some(action => req.path.includes(action))) {
          // Consultants can access their own data
          return next();
        }

        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          // logger.warn('Unauthorized consultant access attempt', {
          //   consultantId,
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
          // logger.warn('Insufficient permissions for consultant access', {
          //   consultantId,
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
    
    // logger.debug('Consultant access validated successfully', {
    //   consultantId,
    //   userId,
    //   userRole
    // });
    
    next();
  } catch (error) {
    // logger.error('Failed to validate consultant access', {
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
 * Enhanced middleware to validate consultant data
 */
const validateConsultantData = async (req, res, next) => {
  try {
    const validationErrors = [];
    
    // Validate required fields for create/update
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!req.body.personalInfo?.firstName && req.method === 'POST') {
        validationErrors.push('First name is required');
      }
      
      if (!req.body.personalInfo?.lastName && req.method === 'POST') {
        validationErrors.push('Last name is required');
      }
      
      if (!req.body.contact?.email && req.method === 'POST') {
        validationErrors.push('Email is required');
      }
      
      if (req.body.contact?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.contact.email)) {
        validationErrors.push('Invalid email format');
      }
      
      if (req.body.profile?.level) {
        const validLevels = ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'partner'];
        if (!validLevels.includes(req.body.profile.level)) {
          validationErrors.push(`Invalid level. Valid options: ${validLevels.join(', ')}`);
        }
      }
      
      if (req.body.profile?.status) {
        const validStatuses = ['active', 'inactive', 'on_leave', 'terminated'];
        if (!validStatuses.includes(req.body.profile.status)) {
          validationErrors.push(`Invalid status. Valid options: ${validStatuses.join(', ')}`);
        }
      }

      if (req.body.billing?.standardRate?.amount && req.body.billing.standardRate.amount <= 0) {
        validationErrors.push('Billing rate must be greater than zero');
      }

      if (req.body.profile?.yearsOfExperience !== undefined) {
        const years = parseInt(req.body.profile.yearsOfExperience);
        if (isNaN(years) || years < 0 || years > 50) {
          validationErrors.push('Years of experience must be between 0 and 50');
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
    // logger.error('Failed to validate consultant data', {
    //   error: error.message
    // });
    next();
  }
};

/**
 * Middleware to handle consultant search parameters
 */
const processSearchParams = (req, res, next) => {
  try {
    // Process and validate search parameters
    if (req.query.startDate) {
      req.query.startDate = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      req.query.endDate = new Date(req.query.endDate);
    }
    if (req.query.minRate) {
      req.query.minRate = parseFloat(req.query.minRate);
    }
    if (req.query.maxRate) {
      req.query.maxRate = parseFloat(req.query.maxRate);
    }
    if (req.query.minExperience) {
      req.query.minExperience = parseInt(req.query.minExperience);
    }
    if (req.query.maxExperience) {
      req.query.maxExperience = parseInt(req.query.maxExperience);
    }
    if (req.query.allocation) {
      req.query.allocation = parseInt(req.query.allocation);
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
 * Parameter validation middleware
 */
router.param('consultantId', (req, res, next, consultantId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(consultantId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid consultant ID format'
    });
  }
  req.params.consultantId = consultantId;
  next();
});

/**
 * Apply global middleware to all consultant routes
 */
// router.use(authenticate);
// router.use(requestSanitizer({
//   sanitizeFields: ['personalInfo.firstName', 'personalInfo.lastName', 'profile.jobTitle', 'contact.email'],
//   removeFields: ['password', 'token', 'apiKey', 'personalInfo.nationalId'],
//   maxDepth: 15,
//   maxKeys: 200
// }));
// router.use(auditMiddleware({
//   service: 'consultant-management',
//   includeBody: true,
//   includeQuery: true,
//   sensitiveFields: ['personalInfo.nationalId', 'billing', 'compensation', 'performance']
// }));

/**
 * ===============================================================================
 * CONSULTANT CRUD ROUTES
 * Core consultant management operations
 * ===============================================================================
 */

// Create new consultant
router.post(
  '/',
  // authorize(['admin', 'manager', 'hr']),
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  // ConsultantValidators.validateCreate,
  validateConsultantData,
  consultantOperationLogger('consultant-create'),
  ConsultantController.createConsultant
);

// List consultants with pagination and filtering
router.get(
  '/',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  // adaptiveLimit(RATE_LIMITS.read),
  processSearchParams,
  ConsultantController.searchConsultants
);

// Search consultants with advanced filtering
router.get(
  '/search',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  // limitByEndpoint(RATE_LIMITS.search),
  // ConsultantValidators.validateSearch,
  processSearchParams,
  ConsultantController.searchConsultants
);

// Advanced skill-based consultant search
router.post(
  '/search/skills',
  // authorize(['admin', 'manager', 'user', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.search),
  // ConsultantValidators.validateSkillSearch,
  consultantOperationLogger('skill-search'),
  ConsultantController.searchConsultants
);

// Find available consultants for project requirements
router.post(
  '/available',
  // authorize(['admin', 'manager', 'user']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.matching),
  // ConsultantValidators.validateAvailabilitySearch,
  consultantOperationLogger('availability-search'),
  ConsultantController.findAvailableConsultants
);

// Match consultants to project requirements
router.post(
  '/match',
  // authorize(['admin', 'manager', 'user']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.matching),
  // ConsultantValidators.validateMatchingCriteria,
  consultantOperationLogger('consultant-matching'),
  ConsultantController.matchConsultantsToProject
);

// Get consultant statistics
router.get(
  '/statistics',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  consultantOperationLogger('statistics-access'),
  ConsultantController.getConsultantStatistics
);

// Get consultant by ID
router.get(
  '/:consultantId',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateConsultantAccess,
  // adaptiveLimit(RATE_LIMITS.read),
  ConsultantController.getConsultantById
);

// Update consultant
router.put(
  '/:consultantId',
  // authorize(['admin', 'manager', 'hr']),
  validateConsultantAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.write),
  // ConsultantValidators.validateUpdate,
  validateConsultantData,
  consultantOperationLogger('consultant-update'),
  ConsultantController.updateConsultant
);

// Delete consultant (soft delete)
router.delete(
  '/:consultantId',
  // authorize(['admin']),
  validateConsultantAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  consultantOperationLogger('consultant-delete'),
  ConsultantController.deleteConsultant
);

/**
 * ===============================================================================
 * CONSULTANT ANALYTICS AND PERFORMANCE ROUTES
 * ===============================================================================
 */

// Calculate performance metrics
router.post(
  '/:consultantId/performance/calculate',
  // authorize(['admin', 'manager', 'hr']),
  validateConsultantAccess,
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.performance),
  consultantOperationLogger('performance-calculation'),
  ConsultantController.calculatePerformanceMetrics
);

// Get consultant dashboard
router.get(
  '/:consultantId/dashboard',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateConsultantAccess,
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  ConsultantController.getConsultantDashboard
);

// Generate skill gap analysis
router.post(
  '/skill-gap-analysis',
  // authorize(['admin', 'manager', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  // ConsultantValidators.validateSkillGapAnalysis,
  consultantOperationLogger('skill-gap-analysis'),
  ConsultantController.generateSkillGapAnalysis
);

// Benchmark consultant performance
router.post(
  '/:consultantId/benchmark',
  // authorize(['admin', 'manager', 'hr']),
  validateConsultantAccess,
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  consultantOperationLogger('consultant-benchmark'),
  ConsultantController.benchmarkConsultant
);

/**
 * ===============================================================================
 * CONSULTANT BILLING AND RATES ROUTES
 * ===============================================================================
 */

// Update billing rates
router.patch(
  '/:consultantId/rates',
  // authorize(['admin', 'manager', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.write),
  // ConsultantValidators.validateRatesUpdate,
  consultantOperationLogger('rates-update'),
  ConsultantController.updateBillingRates
);

/**
 * ===============================================================================
 * CONSULTANT LEVEL AND CAREER PROGRESSION ROUTES
 * ===============================================================================
 */

// Update consultant level
router.patch(
  '/:consultantId/level',
  // authorize(['admin', 'manager', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.write),
  // ConsultantValidators.validateLevelUpdate,
  consultantOperationLogger('level-update'),
  ConsultantController.updateConsultantLevel
);

/**
 * ===============================================================================
 * CONSULTANT BULK OPERATIONS ROUTES
 * ===============================================================================
 */

// Bulk create consultants
router.post(
  '/bulk/create',
  // authorize(['admin', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.bulk),
  // ConsultantValidators.validateBulkCreate,
  validateConsultantData,
  consultantOperationLogger('bulk-create'),
  ConsultantController.bulkCreateConsultants
);

// Bulk update consultants
router.patch(
  '/bulk/update',
  // authorize(['admin', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.bulk),
  // ConsultantValidators.validateBulkUpdate,
  consultantOperationLogger('bulk-update'),
  ConsultantController.bulkUpdateConsultants
);

// Bulk update skills
router.patch(
  '/bulk/skills',
  // authorize(['admin', 'manager', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.bulk),
  // ConsultantValidators.validateBulkSkillsUpdate,
  consultantOperationLogger('bulk-skills-update'),
  ConsultantController.bulkUpdateSkills
);

/**
 * ===============================================================================
 * CONSULTANT IMPORT/EXPORT ROUTES
 * ===============================================================================
 */

// Export consultants
router.get(
  '/export/:format',
  // authorize(['admin', 'manager', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.export),
  // ConsultantValidators.validateExport,
  consultantOperationLogger('consultants-export'),
  ConsultantController.exportConsultants
);

// Import consultants
router.post(
  '/import',
  // authorize(['admin', 'hr']),
  upload.single('file'),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.import),
  // ConsultantValidators.validateImport,
  consultantOperationLogger('consultants-import'),
  ConsultantController.importConsultants
);

/**
 * ===============================================================================
 * CONSULTANT ARCHIVE AND TRANSFER ROUTES
 * ===============================================================================
 */

// Archive consultant
router.post(
  '/:consultantId/archive',
  // authorize(['admin', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.write),
  consultantOperationLogger('consultant-archive'),
  ConsultantController.archiveConsultant
);

// Unarchive consultant
router.post(
  '/:consultantId/unarchive',
  // authorize(['admin', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.write),
  consultantOperationLogger('consultant-unarchive'),
  ConsultantController.unarchiveConsultant
);

// Transfer consultant
router.post(
  '/:consultantId/transfer',
  // authorize(['admin', 'hr']),
  validateConsultantAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.critical),
  // ConsultantValidators.validateTransfer,
  consultantOperationLogger('consultant-transfer'),
  ConsultantController.transferConsultant
);

/**
 * ===============================================================================
 * CONSULTANT DOCUMENT MANAGEMENT ROUTES
 * ===============================================================================
 */

// Upload consultant document
router.post(
  '/:consultantId/documents',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateConsultantAccess,
  upload.single('document'),
  // limitByUser(RATE_LIMITS.upload),
  consultantOperationLogger('document-upload'),
  ConsultantController.uploadConsultantDocument
);

// Get consultant documents
router.get(
  '/:consultantId/documents',
  // authorize(['admin', 'manager', 'hr', 'user', 'viewer']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.read),
  ConsultantController.getConsultantDocuments
);

/**
 * ===============================================================================
 * CONSULTANT DATA MANAGEMENT ROUTES
 * ===============================================================================
 */

// Validate consultant data
router.post(
  '/:consultantId/validate',
  // authorize(['admin', 'manager', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.default),
  ConsultantController.validateConsultantData
);

// Sync consultant data
router.post(
  '/:consultantId/sync',
  // authorize(['admin', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.write),
  consultantOperationLogger('consultant-sync'),
  ConsultantController.syncConsultantData
);

/**
 * ===============================================================================
 * CONSULTANT AUDIT AND REPORTING ROUTES
 * ===============================================================================
 */

// Get consultant audit trail
router.get(
  '/:consultantId/audit',
  // authorize(['admin', 'auditor', 'hr']),
  validateConsultantAccess,
  // limitByUser(RATE_LIMITS.read),
  ConsultantController.auditConsultant
);

// Generate consultant report
router.post(
  '/:consultantId/report',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateConsultantAccess,
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  // ConsultantValidators.validateReportGeneration,
  consultantOperationLogger('consultant-report'),
  ConsultantController.generateConsultantReport
);

/**
 * ===============================================================================
 * NESTED RESOURCE ROUTES
 * Routes to sub-resources (handled by separate route files)
 * ===============================================================================
 */

// Mount nested profile routes
router.use('/:consultantId/profile', 
  validateConsultantAccess,
  (req, res, next) => {
    req.consultantContext = { consultantId: req.params.consultantId };
    next();
  },
  require('./consultant-profile-routes')
);

// Mount nested skills routes
router.use('/:consultantId/skills',
  validateConsultantAccess,
  (req, res, next) => {
    req.consultantContext = { consultantId: req.params.consultantId };
    next();
  },
  require('./consultant-skills-routes')
);

// Mount nested availability routes
router.use('/:consultantId/availability',
  validateConsultantAccess,
  (req, res, next) => {
    req.consultantContext = { consultantId: req.params.consultantId };
    next();
  },
  require('./consultant-availability-routes')
);

/**
 * ===============================================================================
 * RECOMMENDATION AND INTELLIGENCE ROUTES
 * ===============================================================================
 */

// Get skill recommendations
router.get(
  '/recommendations/skills',
  // authorize(['admin', 'manager', 'hr']),
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  ConsultantController.getSkillRecommendations
);

// Get training recommendations
router.get(
  '/:consultantId/recommendations/training',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateConsultantAccess,
  // costBasedLimit(calculateConsultantCost, RATE_LIMITS.analytics),
  ConsultantController.getSkillRecommendations
);

/**
 * ===============================================================================
 * HEALTH CHECK AND MONITORING ROUTES
 * ===============================================================================
 */

// Consultant service health check
router.get(
  '/health',
  (req, res) => {
    res.status(200).json({
      success: true,
      service: 'consultant-management',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.SERVICE_VERSION || '1.0.0'
    });
  }
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
    consultantId: req.params?.consultantId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Consultant route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Handle specific error types
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An internal server error occurred';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry found';
  }
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

module.exports = router;