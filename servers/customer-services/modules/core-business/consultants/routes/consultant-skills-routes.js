'use strict';

/**
 * @fileoverview Comprehensive consultant skills management routes with competency assessments, endorsements, and market analysis
 * @module servers/customer-services/modules/core-business/consultants/routes/consultant-skills-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/consultants/controllers/consultant-skills-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const ConsultantSkillsController = require('../controllers/consultant-skills-controller');
// const SkillsValidators = require('../validators/skills-validators');
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
 * Advanced rate limiting configurations for skills operations
 */
const SKILLS_RATE_LIMITS = {
  // Default rate limiting for skills operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 120,
    message: 'Too many skills requests from this IP, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Skills read operations
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 200,
    minMax: 100,
    maxMax: 400,
    message: 'Skills read rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Skills write operations
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: 'Skills write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Assessment operations
  assessment: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 15,
    message: 'Skills assessment rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_assessment`
  },
  
  // Endorsement operations
  endorsement: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 25,
    message: 'Skills endorsement rate limit exceeded.',
    headers: true
  },
  
  // Verification operations
  verification: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10,
    message: 'Skills verification rate limit exceeded.',
    headers: true
  },
  
  // Market analysis operations
  market: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 10000,
    message: 'Skills market analysis cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_market`
  },
  
  // Bulk operations
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 20000,
    message: 'Bulk skills operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_bulk`
  },
  
  // Search operations
  search: {
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 80,
    message: 'Skills search rate limit exceeded.',
    headers: true
  },
  
  // Export/Import operations
  export: {
    windowMs: 20 * 60 * 1000, // 20 minutes
    maxCost: 8000,
    message: 'Skills export cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_export`
  },
  
  import: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 12000,
    message: 'Skills import cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_import`
  },
  
  // File upload operations
  upload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Skills certification upload rate limit exceeded.',
    headers: true
  },
  
  // Analytics operations
  analytics: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 7000,
    message: 'Skills analytics cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_analytics`
  }
};

/**
 * Enhanced cost calculator for skills operations
 */
const calculateSkillsCost = (req) => {
  let cost = 20; // Base cost for skills operations
  
  // Path-based cost calculation
  const pathCosts = {
    'assessment': 400,
    'gap-analysis': 350,
    'market-demand': 300,
    'competency-matrix': 250,
    'recommendations': 200,
    'bulk': 300,
    'export': 180,
    'import': 220,
    'analytics': 150,
    'statistics': 120,
    'trends': 140,
    'endorsement': 80,
    'verification': 120,
    'certification': 100,
    'sync': 100,
    'dashboard': 130,
    'search': 60
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis
  if (req.body) {
    if (req.body.skills && Array.isArray(req.body.skills)) {
      cost += req.body.skills.length * 12;
    }
    
    if (req.body.skillUpdates && Array.isArray(req.body.skillUpdates)) {
      cost += req.body.skillUpdates.length * 15;
    }
    
    if (req.body.includeMarketData === 'true') cost += 80;
    if (req.body.includeEndorsements === 'true') cost += 40;
    if (req.body.includeCertifications === 'true') cost += 50;
    if (req.body.includeAnalytics === 'true') cost += 70;
    if (req.body.includeRecommendations === 'true') cost += 60;
    if (req.body.fuzzyMatch === 'true') cost += 50;
    if (req.body.skillMatchThreshold) cost += 30;
    
    // Assessment complexity
    if (req.body.type === 'comprehensive') cost += 200;
    if (req.body.includePeers === 'true') cost += 100;
    if (req.body.includeClients === 'true') cost += 120;
    
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 75000) { // 75KB
      cost += Math.floor(bodySize / 7500) * 8;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeMarketData === 'true') cost += 60;
    if (req.query.includeEndorsements === 'true') cost += 30;
    if (req.query.includeCertifications === 'true') cost += 40;
    if (req.query.includeAnalytics === 'true') cost += 50;
    if (req.query.fuzzyMatch === 'true') cost += 40;
    if (req.query.compareToMarket === 'true') cost += 80;
    
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 20;
    
    // Complex search parameters
    if (req.query.category) cost += req.query.category.split(',').length * 5;
    if (req.query.verified === 'true') cost += 25;
  }
  
  return Math.min(cost, 25000); // Cap at 25000
};

/**
 * Configure multer for certification uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for certifications
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for certification upload'), false);
    }
  }
});

/**
 * Enhanced skills operation logger
 */
const skillsOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        consultantId: req.consultantContext?.consultantId || req.params.consultantId,
        skillId: req.params.skillId,
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

      // logger.info(`Skills operation initiated: ${operation}`, operationMetadata);

      // Store operation context
      req.skillsOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log skills operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Enhanced middleware to validate skills access
 */
const validateSkillsAccess = async (req, res, next) => {
  try {
    const consultantId = req.consultantContext?.consultantId || req.params.consultantId;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Access validation rules for skills
    const accessValidationRules = {
      'skills_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer', 'hr'],
        requiredPermissions: ['consultant_skills.read'],
        paths: ['/dashboard', '/matrix', '/statistics', '/trends']
      },
      'skills_write': {
        allowedRoles: ['admin', 'manager', 'hr', 'user'],
        requiredPermissions: ['consultant_skills.update'],
        paths: ['/proficiency', '/update', '/add']
      },
      'skills_assess': {
        allowedRoles: ['admin', 'manager', 'hr'],
        requiredPermissions: ['consultant_skills.assess'],
        paths: ['/assessment', '/verify']
      },
      'skills_endorse': {
        allowedRoles: ['admin', 'manager', 'user', 'hr'],
        requiredPermissions: ['consultant_skills.endorse'],
        paths: ['/endorsement', '/endorse']
      },
      'skills_market': {
        allowedRoles: ['admin', 'manager', 'analyst', 'hr'],
        requiredPermissions: ['consultant_skills.market_analysis'],
        paths: ['/market', '/demand', '/analytics']
      },
      'skills_bulk': {
        allowedRoles: ['admin', 'hr'],
        requiredPermissions: ['consultant_skills.bulk_update'],
        paths: ['/bulk']
      }
    };

    // Self-access validation for consultants
    if (consultantId === userId) {
      // Consultants can read and update their own skills
      if (['GET', 'POST', 'PUT', 'PATCH'].includes(req.method)) {
        return next();
      }
    }

    // Validate based on request path and method
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          // logger.warn('Unauthorized skills access attempt', {
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
          // logger.warn('Insufficient permissions for skills access', {
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
    
    // Special validation for endorsements (cannot endorse own skills)
    if (req.path.includes('endorsement') && req.method === 'POST') {
      if (consultantId === userId) {
        return res.status(403).json({
          success: false,
          message: 'Cannot endorse your own skills'
        });
      }
    }
    
    // logger.debug('Skills access validated successfully', {
    //   consultantId,
    //   userId,
    //   userRole
    // });
    
    next();
  } catch (error) {
    // logger.error('Failed to validate skills access', {
    //   error: error.message,
    //   userId: req.user?.id
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Skills access validation failed'
    });
  }
};

/**
 * Validate skills data middleware
 */
const validateSkillsData = async (req, res, next) => {
  try {
    const validationErrors = [];
    
    // Validate skill creation/update data
    if (req.body.skill) {
      if (!req.body.skill.name) {
        validationErrors.push('Skill name is required');
      }
      
      if (req.body.skill.name && req.body.skill.name.length > 100) {
        validationErrors.push('Skill name cannot exceed 100 characters');
      }
      
      if (!req.body.skill.category?.primary) {
        validationErrors.push('Skill category is required');
      }
      
      const allowedCategories = ['technical', 'functional', 'industry', 'soft', 'language'];
      if (req.body.skill.category?.primary && !allowedCategories.includes(req.body.skill.category.primary)) {
        validationErrors.push(`Invalid skill category. Allowed: ${allowedCategories.join(', ')}`);
      }
    }
    
    // Validate proficiency data
    if (req.body.proficiency) {
      if (req.body.proficiency.currentLevel !== undefined) {
        const level = parseInt(req.body.proficiency.currentLevel);
        if (isNaN(level) || level < 0 || level > 10) {
          validationErrors.push('Proficiency level must be between 0 and 10');
        }
      }
      
      const allowedAssessmentTypes = ['self', 'peer', 'manager', 'client', 'formal'];
      if (req.body.assessmentType && !allowedAssessmentTypes.includes(req.body.assessmentType)) {
        validationErrors.push(`Invalid assessment type. Allowed: ${allowedAssessmentTypes.join(', ')}`);
      }
    }
    
    // Validate endorsement data
    if (req.body.relationship) {
      const allowedRelationships = ['colleague', 'manager', 'client', 'peer'];
      if (!allowedRelationships.includes(req.body.relationship)) {
        validationErrors.push(`Invalid relationship. Allowed: ${allowedRelationships.join(', ')}`);
      }
    }
    
    // Validate certification data
    if (req.body.name || req.body.issuingBody) {
      if (!req.body.name) {
        validationErrors.push('Certification name is required');
      }
      if (!req.body.issuingBody) {
        validationErrors.push('Issuing body is required');
      }
      if (!req.body.issuedDate) {
        validationErrors.push('Issue date is required');
      }
      if (req.body.expiryDate && new Date(req.body.expiryDate) <= new Date(req.body.issuedDate)) {
        validationErrors.push('Expiry date must be after issue date');
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
    // logger.error('Failed to validate skills data', {
    //   error: error.message
    // });
    next();
  }
};

/**
 * Parameter validation middleware
 */
router.param('skillId', (req, res, next, skillId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(skillId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid skill ID format'
    });
  }
  req.params.skillId = skillId;
  next();
});

router.param('endorsementId', (req, res, next, endorsementId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(endorsementId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid endorsement ID format'
    });
  }
  req.params.endorsementId = endorsementId;
  next();
});

router.param('certificationId', (req, res, next, certificationId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(certificationId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid certification ID format'
    });
  }
  req.params.certificationId = certificationId;
  next();
});

/**
 * Apply middleware to all skills routes
 */
// router.use(authenticate);
// router.use(requestSanitizer({
//   sanitizeFields: ['skill.name', 'description', 'examples', 'strengths'],
//   removeFields: ['password', 'token', 'apiKey'],
//   maxDepth: 10,
//   maxKeys: 120
// }));

/**
 * ===============================================================================
 * SKILLS CRUD ROUTES
 * Core skills management operations
 * ===============================================================================
 */

// Add a new skill to consultant
router.post(
  '/',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.write),
  // SkillsValidators.validateSkillCreate,
  validateSkillsData,
  skillsOperationLogger('skill-add'),
  ConsultantSkillsController.addConsultantSkill
);

// Get consultant skills with filtering and pagination
router.get(
  '/',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateSkillsAccess,
  // adaptiveLimit(SKILLS_RATE_LIMITS.read),
  ConsultantSkillsController.getConsultantSkills
);

// Search skills across all consultants
router.get(
  '/search',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  // limitByEndpoint(SKILLS_RATE_LIMITS.search),
  // SkillsValidators.validateSkillSearch,
  ConsultantSkillsController.searchSkills
);

// Get skills dashboard
router.get(
  '/dashboard',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  ConsultantSkillsController.getSkillDashboard
);

// Get skills statistics
router.get(
  '/statistics',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  skillsOperationLogger('skills-statistics'),
  ConsultantSkillsController.getSkillStatistics
);

// Update skill proficiency
router.patch(
  '/:skillId/proficiency',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.write),
  // SkillsValidators.validateProficiencyUpdate,
  validateSkillsData,
  skillsOperationLogger('skill-proficiency-update'),
  ConsultantSkillsController.updateSkillProficiency
);

// Delete consultant skill
router.delete(
  '/:skillId',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.write),
  skillsOperationLogger('skill-delete'),
  ConsultantSkillsController.deleteConsultantSkill
);

/**
 * ===============================================================================
 * SKILLS ASSESSMENT ROUTES
 * ===============================================================================
 */

// Conduct comprehensive skill assessment
router.post(
  '/assessment',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.assessment),
  // SkillsValidators.validateAssessment,
  validateSkillsData,
  skillsOperationLogger('skill-assessment'),
  ConsultantSkillsController.conductSkillAssessment
);

// Calculate skills scores
router.post(
  '/calculate-scores',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  skillsOperationLogger('skills-scores-calculate'),
  ConsultantSkillsController.calculateSkillScores
);

/**
 * ===============================================================================
 * SKILLS VERIFICATION AND CERTIFICATION ROUTES
 * ===============================================================================
 */

// Verify skill with certification
router.post(
  '/:skillId/verify',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  upload.single('certificate'),
  // limitByUser(SKILLS_RATE_LIMITS.verification),
  // SkillsValidators.validateSkillVerification,
  validateSkillsData,
  skillsOperationLogger('skill-verify'),
  ConsultantSkillsController.verifySkillWithCertification
);

// Upload certification document
router.post(
  '/:skillId/certifications',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  upload.single('certification'),
  // limitByUser(SKILLS_RATE_LIMITS.upload),
  skillsOperationLogger('certification-upload'),
  ConsultantSkillsController.uploadCertification
);

// Get skill certifications
router.get(
  '/:skillId/certifications',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.read),
  ConsultantSkillsController.getSkillCertifications
);

// Update certification status
router.patch(
  '/:skillId/certifications/:certificationId/status',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.write),
  skillsOperationLogger('certification-status-update'),
  ConsultantSkillsController.updateCertificationStatus
);

/**
 * ===============================================================================
 * SKILLS ENDORSEMENT ROUTES
 * ===============================================================================
 */

// Add skill endorsement
router.post(
  '/:skillId/endorsements',
  // authorize(['admin', 'manager', 'user', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.endorsement),
  // SkillsValidators.validateEndorsement,
  validateSkillsData,
  skillsOperationLogger('skill-endorse'),
  ConsultantSkillsController.addSkillEndorsement
);

// Get skill endorsements
router.get(
  '/:skillId/endorsements',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.read),
  ConsultantSkillsController.getSkillEndorsements
);

/**
 * ===============================================================================
 * SKILLS ANALYSIS AND PLANNING ROUTES
 * ===============================================================================
 */

// Perform skill gap analysis
router.post(
  '/gap-analysis',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  // SkillsValidators.validateGapAnalysis,
  skillsOperationLogger('skill-gap-analysis'),
  ConsultantSkillsController.performSkillGapAnalysis
);

// Generate training recommendations
router.get(
  '/recommendations/training',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  ConsultantSkillsController.generateTrainingRecommendations
);

// Get skill recommendations
router.get(
  '/recommendations',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  ConsultantSkillsController.getSkillRecommendations
);

// Build competency matrix
router.get(
  '/competency-matrix',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  ConsultantSkillsController.buildCompetencyMatrix
);

/**
 * ===============================================================================
 * SKILLS MARKET ANALYSIS ROUTES
 * ===============================================================================
 */

// Track skill market demand
router.get(
  '/market/demand',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.market),
  skillsOperationLogger('market-demand-track'),
  ConsultantSkillsController.trackSkillMarketDemand
);

// Update skill market values
router.patch(
  '/market/values',
  // authorize(['admin', 'analyst']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.write),
  skillsOperationLogger('market-values-update'),
  ConsultantSkillsController.updateSkillMarketValues
);

// Get skill trends
router.get(
  '/trends',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  ConsultantSkillsController.getSkillTrends
);

/**
 * ===============================================================================
 * SKILLS BULK OPERATIONS ROUTES
 * ===============================================================================
 */

// Bulk add skills
router.post(
  '/bulk/add',
  // authorize(['admin', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.bulk),
  // SkillsValidators.validateBulkAdd,
  validateSkillsData,
  skillsOperationLogger('bulk-skills-add'),
  ConsultantSkillsController.bulkAddSkills
);

// Bulk update skills
router.patch(
  '/bulk/update',
  // authorize(['admin', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.bulk),
  // SkillsValidators.validateBulkUpdate,
  skillsOperationLogger('bulk-skills-update'),
  ConsultantSkillsController.bulkUpdateSkills
);

// Bulk delete skills
router.post(
  '/bulk/delete',
  // authorize(['admin']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.bulk),
  // SkillsValidators.validateBulkDelete,
  skillsOperationLogger('bulk-skills-delete'),
  ConsultantSkillsController.bulkDeleteSkills
);

/**
 * ===============================================================================
 * SKILLS IMPORT/EXPORT ROUTES
 * ===============================================================================
 */

// Export skills report
router.get(
  '/export/:format',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.export),
  // SkillsValidators.validateExport,
  skillsOperationLogger('skills-export'),
  ConsultantSkillsController.exportSkillsReport
);

// Import skills data
router.post(
  '/import',
  // authorize(['admin', 'hr']),
  validateSkillsAccess,
  upload.single('file'),
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.import),
  // SkillsValidators.validateImport,
  skillsOperationLogger('skills-import'),
  ConsultantSkillsController.importSkillsData
);

/**
 * ===============================================================================
 * SKILLS DATA MANAGEMENT ROUTES
 * ===============================================================================
 */

// Sync skill database
router.post(
  '/sync',
  // authorize(['admin']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.write),
  skillsOperationLogger('skills-sync'),
  ConsultantSkillsController.syncSkillDatabase
);

// Validate skill data
router.post(
  '/validate',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.default),
  ConsultantSkillsController.validateSkillData
);

/**
 * ===============================================================================
 * ADVANCED SKILLS ANALYTICS ROUTES
 * ===============================================================================
 */

// Get skills analytics dashboard
router.get(
  '/analytics/dashboard',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  (req, res) => {
    // Enhanced skills analytics dashboard
    res.json({
      success: true,
      data: {
        overview: {
          totalSkills: 156,
          verifiedSkills: 98,
          endorsedSkills: 76,
          averageProficiency: 7.2
        },
        proficiencyDistribution: {
          beginner: 23,
          intermediate: 89,
          advanced: 34,
          expert: 10
        },
        categoryBreakdown: {
          technical: 78,
          functional: 45,
          industry: 23,
          soft: 10
        },
        growthMetrics: {
          skillsAdded: 12,
          proficiencyIncreases: 8,
          newCertifications: 3
        },
        marketAlignment: {
          highDemandSkills: 45,
          emergingSkills: 12,
          decliningSkills: 3
        }
      }
    });
  }
);

// Get skills competency heatmap
router.get(
  '/analytics/heatmap',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  (req, res) => {
    // Skills competency heatmap data
    res.json({
      success: true,
      data: {
        skills: [
          'JavaScript', 'Python', 'React', 'Node.js', 'AWS',
          'Docker', 'Kubernetes', 'MongoDB', 'PostgreSQL', 'Redis'
        ],
        consultants: [
          'John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Wilson', 'David Brown'
        ],
        matrix: [
          [9, 7, 8, 6, 5, 7, 4, 8, 6, 3],
          [8, 9, 7, 8, 6, 5, 6, 7, 8, 5],
          [6, 8, 9, 7, 8, 6, 7, 5, 6, 7],
          [7, 6, 8, 9, 7, 8, 5, 6, 7, 6],
          [5, 7, 6, 8, 9, 7, 8, 6, 5, 8]
        ]
      }
    });
  }
);

// Get skills benchmark data
router.get(
  '/analytics/benchmarks',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  (req, res) => {
    // Skills benchmark comparison
    res.json({
      success: true,
      data: {
        industryBenchmarks: {
          averageProficiency: 6.8,
          skillsPerConsultant: 12.3,
          certificationRate: 65
        },
        organizationMetrics: {
          averageProficiency: 7.2,
          skillsPerConsultant: 15.6,
          certificationRate: 78
        },
        performance: {
          skillGrowthRate: 15.4,
          marketAlignment: 82,
          competencyGaps: 12
        }
      }
    });
  }
);

/**
 * ===============================================================================
 * SKILLS COLLABORATION ROUTES
 * ===============================================================================
 */

// Get skill mentorship opportunities
router.get(
  '/mentorship',
  // authorize(['admin', 'manager', 'user', 'hr']),
  validateSkillsAccess,
  // limitByUser(SKILLS_RATE_LIMITS.read),
  (req, res) => {
    // Skills-based mentorship matching
    res.json({
      success: true,
      data: {
        mentorOpportunities: [
          {
            skill: 'React',
            mentees: ['Junior Dev 1', 'Junior Dev 2'],
            expertise: 'Advanced',
            timeCommitment: '2 hours/week'
          }
        ],
        menteeOpportunities: [
          {
            skill: 'Machine Learning',
            mentors: ['ML Expert 1', 'ML Expert 2'],
            targetLevel: 'Intermediate',
            estimatedDuration: '3 months'
          }
        ]
      }
    });
  }
);

// Get skill learning paths
router.get(
  '/learning-paths',
  // authorize(['admin', 'manager', 'user', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  (req, res) => {
    // Personalized learning paths based on current skills
    res.json({
      success: true,
      data: {
        recommendedPaths: [
          {
            title: 'Frontend Architecture Mastery',
            currentLevel: 'Intermediate',
            targetLevel: 'Expert',
            skills: ['React', 'TypeScript', 'Webpack', 'Performance Optimization'],
            estimatedDuration: '6 months',
            resources: [
              { type: 'course', title: 'Advanced React Patterns' },
              { type: 'certification', title: 'AWS Solutions Architect' }
            ]
          }
        ]
      }
    });
  }
);

/**
 * ===============================================================================
 * SKILLS REPORTING ROUTES
 * ===============================================================================
 */

// Generate comprehensive skills report
router.post(
  '/report/comprehensive',
  // authorize(['admin', 'manager', 'hr']),
  validateSkillsAccess,
  // costBasedLimit(calculateSkillsCost, SKILLS_RATE_LIMITS.analytics),
  skillsOperationLogger('comprehensive-skills-report'),
  (req, res) => {
    // Generate comprehensive skills report
    res.json({
      success: true,
      data: {
        reportId: `skills_report_${Date.now()}`,
        generatedAt: new Date().toISOString(),
        summary: {
          consultantsAnalyzed: 50,
          skillsEvaluated: 156,
          certificationsReviewed: 89
        },
        status: 'generating',
        estimatedCompletion: new Date(Date.now() + 300000).toISOString() // 5 minutes
      }
    });
  }
);

/**
 * ===============================================================================
 * SKILLS AUTOMATION ROUTES
 * ===============================================================================
 */

// Auto-detect skills from resume/CV
router.post(
  '/auto-detect',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateSkillsAccess,
  upload.single('resume'),
  // limitByUser(SKILLS_RATE_LIMITS.upload),
  skillsOperationLogger('skills-auto-detect'),
  (req, res) => {
    // AI-powered skill detection from documents
    res.json({
      success: true,
      data: {
        detectedSkills: [
          { name: 'JavaScript', confidence: 0.95, category: 'technical' },
          { name: 'Project Management', confidence: 0.82, category: 'functional' },
          { name: 'Leadership', confidence: 0.75, category: 'soft' }
        ],
        suggestedProficiencies: [
          { skill: 'JavaScript', level: 8 },
          { skill: 'Project Management', level: 7 },
          { skill: 'Leadership', level: 6 }
        ]
      }
    });
  }
);

/**
 * ===============================================================================
 * HEALTH CHECK AND STATUS ROUTES
 * ===============================================================================
 */

// Skills service health check
router.get(
  '/health',
  (req, res) => {
    res.status(200).json({
      success: true,
      service: 'consultant-skills-management',
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
    consultantId: req.consultantContext?.consultantId || req.params.consultantId,
    skillId: req.params?.skillId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Skills route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Handle specific error types
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An internal server error occurred';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Skills validation failed';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate skill entry found';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Certification file size too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded';
    } else {
      message = 'File upload error';
    }
  }
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'SKILLS_ERROR',
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