'use strict';

/**
 * @fileoverview Comprehensive consultant profile management routes with portfolio, experience tracking, and career management
 * @module servers/customer-services/modules/core-business/consultants/routes/consultant-profile-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/consultants/controllers/consultant-profile-controller
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
const ConsultantProfileController = require('../controllers/consultant-profile-controller');
// const ProfileValidators = require('../validators/profile-validators');
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
 * Advanced rate limiting configurations for profile operations
 */
const PROFILE_RATE_LIMITS = {
  // Default rate limiting for profile operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 80,
    message: 'Too many profile requests from this IP, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Profile read operations
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 120,
    minMax: 60,
    maxMax: 200,
    message: 'Profile read rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Profile write operations
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 25,
    message: 'Profile write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // File upload operations
  upload: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 15,
    message: 'Profile upload rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_upload`
  },
  
  // Portfolio operations
  portfolio: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxCost: 5000,
    message: 'Portfolio operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_portfolio`
  },
  
  // Career history operations
  career: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30,
    message: 'Career history operation rate limit exceeded.',
    headers: true
  },
  
  // Verification operations
  verification: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10,
    message: 'Verification operation rate limit exceeded.',
    headers: true
  },
  
  // Report generation
  report: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 8000,
    message: 'Profile report generation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_report`
  },
  
  // Search operations
  search: {
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 40,
    message: 'Profile search rate limit exceeded.',
    headers: true
  },
  
  // Development plan operations
  development: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20,
    message: 'Development plan operation rate limit exceeded.',
    headers: true
  }
};

/**
 * Enhanced cost calculator for profile operations
 */
const calculateProfileCost = (req) => {
  let cost = 30; // Base cost for profile operations
  
  // Path-based cost calculation
  const pathCosts = {
    'complete': 100,
    'report': 200,
    'export': 150,
    'import': 180,
    'portfolio': 80,
    'artifacts': 120,
    'showcase': 90,
    'testimonials': 60,
    'career-history': 70,
    'verify': 100,
    'development': 80,
    'performance': 120,
    'skills-matrix': 90,
    'sync': 100,
    'dashboard': 110
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis
  if (req.body) {
    if (req.body.projects && Array.isArray(req.body.projects)) {
      cost += req.body.projects.length * 20;
    }
    
    if (req.body.careerHistory && Array.isArray(req.body.careerHistory)) {
      cost += req.body.careerHistory.length * 15;
    }
    
    if (req.body.includePrivate === 'true') cost += 50;
    if (req.body.includeAnalytics === 'true') cost += 80;
    if (req.body.includePerformance === 'true') cost += 100;
    if (req.body.includeConfidential === 'true') cost += 120;
    if (req.body.generateReport === 'true') cost += 150;
    if (req.body.autoGenerateContent === 'true') cost += 70;
    
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 100000) { // 100KB
      cost += Math.floor(bodySize / 10000) * 10;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includePrivate === 'true') cost += 40;
    if (req.query.includeAnalytics === 'true') cost += 60;
    if (req.query.includePerformance === 'true') cost += 80;
    if (req.query.format === 'pdf') cost += 100;
    if (req.query.format === 'word') cost += 120;
    if (req.query.includeConfidential === 'true') cost += 100;
    
    const sections = req.query.sections ? req.query.sections.split(',') : [];
    cost += sections.length * 10;
  }
  
  return Math.min(cost, 20000); // Cap at 20000
};

/**
 * Configure multer for portfolio and document uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for portfolio artifacts
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'application/zip', 'application/x-zip-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for portfolio upload'), false);
    }
  }
});

/**
 * Enhanced profile operation logger
 */
const profileOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        consultantId: req.consultantContext?.consultantId || req.params.consultantId,
        sectionId: req.params.sectionId,
        projectId: req.params.projectId,
        entryId: req.params.entryId,
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

      // logger.info(`Profile operation initiated: ${operation}`, operationMetadata);

      // Store operation context
      req.profileOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log profile operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Enhanced middleware to validate profile access
 */
const validateProfileAccess = async (req, res, next) => {
  try {
    const consultantId = req.consultantContext?.consultantId || req.params.consultantId;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Access validation rules for profiles
    const accessValidationRules = {
      'profile_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer', 'hr'],
        requiredPermissions: ['profiles.read'],
        paths: ['/summary', '/career-history', '/portfolio', '/expertise']
      },
      'profile_write': {
        allowedRoles: ['admin', 'manager', 'hr', 'user'],
        requiredPermissions: ['profiles.update'],
        paths: ['/update', '/section', '/career-history', '/portfolio', '/development']
      },
      'profile_verify': {
        allowedRoles: ['admin', 'manager', 'hr'],
        requiredPermissions: ['profiles.verify'],
        paths: ['/verify', '/verification']
      },
      'profile_private': {
        allowedRoles: ['admin', 'hr'],
        requiredPermissions: ['profiles.viewPrivate'],
        paths: ['/private', '/confidential', '/compensation', '/performance']
      },
      'profile_manage': {
        allowedRoles: ['admin', 'manager', 'hr'],
        requiredPermissions: ['profiles.manage'],
        paths: ['/sync', '/import', '/export', '/transfer']
      }
    };

    // Self-access validation for consultants
    if (consultantId === userId) {
      // Consultants can access their own profile data
      if (req.query.includePrivate === 'true' || req.path.includes('private')) {
        // But not private/sensitive data unless they have specific permissions
        if (!userPermissions.includes('profiles.viewOwnPrivate')) {
          return res.status(403).json({
            success: false,
            message: 'Access denied to private profile data'
          });
        }
      }
      return next();
    }

    // Validate based on request path and method
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          // logger.warn('Unauthorized profile access attempt', {
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
          // logger.warn('Insufficient permissions for profile access', {
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
    
    // logger.debug('Profile access validated successfully', {
    //   consultantId,
    //   userId,
    //   userRole
    // });
    
    next();
  } catch (error) {
    // logger.error('Failed to validate profile access', {
    //   error: error.message,
    //   userId: req.user?.id
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Profile access validation failed'
    });
  }
};

/**
 * Validate profile data middleware
 */
const validateProfileData = async (req, res, next) => {
  try {
    const validationErrors = [];
    
    // Validate section updates
    if (req.params.section) {
      const allowedSections = ['summary', 'careerHistory', 'expertise', 'portfolio', 'qualifications', 'development'];
      if (!allowedSections.includes(req.params.section)) {
        validationErrors.push(`Invalid section. Allowed sections: ${allowedSections.join(', ')}`);
      }
    }
    
    // Validate career history data
    if (req.body.company || req.body.position) {
      if (!req.body.company?.name) {
        validationErrors.push('Company name is required for career history');
      }
      if (!req.body.position?.title) {
        validationErrors.push('Position title is required for career history');
      }
      if (!req.body.duration?.startDate) {
        validationErrors.push('Start date is required for career history');
      }
      if (req.body.duration?.endDate && req.body.duration?.startDate) {
        if (new Date(req.body.duration.endDate) <= new Date(req.body.duration.startDate)) {
          validationErrors.push('End date must be after start date');
        }
      }
    }
    
    // Validate portfolio project data
    if (req.body.title || req.body.description) {
      if (!req.body.title) {
        validationErrors.push('Project title is required');
      }
      if (!req.body.description) {
        validationErrors.push('Project description is required');
      }
      if (req.body.description && req.body.description.length > 2000) {
        validationErrors.push('Project description cannot exceed 2000 characters');
      }
    }
    
    // Validate testimonial data
    if (req.body.testimonial || req.body.rating) {
      if (req.body.rating && (req.body.rating < 1 || req.body.rating > 5)) {
        validationErrors.push('Rating must be between 1 and 5');
      }
      if (req.body.testimonial && req.body.testimonial.length > 1000) {
        validationErrors.push('Testimonial cannot exceed 1000 characters');
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
    // logger.error('Failed to validate profile data', {
    //   error: error.message
    // });
    next();
  }
};

/**
 * Parameter validation middleware
 */
router.param('section', (req, res, next, section) => {
  const allowedSections = ['summary', 'careerHistory', 'expertise', 'portfolio', 'qualifications', 'development'];
  if (!allowedSections.includes(section)) {
    return res.status(400).json({
      success: false,
      message: `Invalid section. Allowed sections: ${allowedSections.join(', ')}`
    });
  }
  req.params.section = section;
  next();
});

router.param('entryId', (req, res, next, entryId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(entryId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid entry ID format'
    });
  }
  req.params.entryId = entryId;
  next();
});

router.param('projectId', (req, res, next, projectId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(projectId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project ID format'
    });
  }
  req.params.projectId = projectId;
  next();
});

/**
 * Apply middleware to all profile routes
 */
// router.use(authenticate);
// router.use(requestSanitizer({
//   sanitizeFields: ['summary', 'description', 'achievements', 'testimonial'],
//   removeFields: ['password', 'token', 'apiKey'],
//   maxDepth: 12,
//   maxKeys: 150
// }));

/**
 * ===============================================================================
 * PROFILE CRUD ROUTES
 * Core profile management operations
 * ===============================================================================
 */

// Create or initialize consultant profile
router.post(
  '/',
  // authorize(['admin', 'manager', 'hr']),
  validateProfileAccess,
  // combinedLimit(['ip', 'user'], PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validateCreate,
  validateProfileData,
  profileOperationLogger('profile-create'),
  ConsultantProfileController.createProfile
);

// Get complete profile with all related data
router.get(
  '/complete',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.read),
  ConsultantProfileController.getCompleteProfile
);

// Get profile dashboard
router.get(
  '/dashboard',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.read),
  ConsultantProfileController.getCompleteProfile
);

// Update profile section
router.patch(
  '/section/:section',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validateSectionUpdate,
  validateProfileData,
  profileOperationLogger('profile-section-update'),
  ConsultantProfileController.updateProfileSection
);

// Update profile visibility settings
router.patch(
  '/visibility',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  profileOperationLogger('profile-visibility-update'),
  ConsultantProfileController.updateProfileVisibility
);

/**
 * ===============================================================================
 * CAREER HISTORY MANAGEMENT ROUTES
 * ===============================================================================
 */

// Add career history entry
router.post(
  '/career-history',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.career),
  // ProfileValidators.validateCareerEntry,
  validateProfileData,
  profileOperationLogger('career-history-add'),
  ConsultantProfileController.addCareerHistory
);

// Update career history entry
router.put(
  '/career-history/:entryId',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.career),
  // ProfileValidators.validateCareerUpdate,
  validateProfileData,
  profileOperationLogger('career-history-update'),
  ConsultantProfileController.updateCareerHistory
);

// Verify career history entry
router.post(
  '/career-history/:entryId/verify',
  // authorize(['admin', 'manager', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.verification),
  // ProfileValidators.validateCareerVerification,
  profileOperationLogger('career-history-verify'),
  ConsultantProfileController.verifyCareerHistory
);

/**
 * ===============================================================================
 * PORTFOLIO MANAGEMENT ROUTES
 * ===============================================================================
 */

// Add portfolio project
router.post(
  '/portfolio/projects',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.portfolio),
  // ProfileValidators.validatePortfolioProject,
  validateProfileData,
  profileOperationLogger('portfolio-project-add'),
  ConsultantProfileController.addPortfolioProject
);

// Update portfolio project
router.put(
  '/portfolio/projects/:projectId',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.portfolio),
  // ProfileValidators.validatePortfolioUpdate,
  validateProfileData,
  profileOperationLogger('portfolio-project-update'),
  ConsultantProfileController.updatePortfolioProject
);

// Remove portfolio project
router.delete(
  '/portfolio/projects/:projectId',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  profileOperationLogger('portfolio-project-remove'),
  ConsultantProfileController.removePortfolioProject
);

// Upload portfolio artifact
router.post(
  '/portfolio/projects/:projectId/artifacts',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  upload.single('artifact'),
  // limitByUser(PROFILE_RATE_LIMITS.upload),
  profileOperationLogger('portfolio-artifact-upload'),
  ConsultantProfileController.uploadPortfolioArtifact
);

// Update portfolio showcase settings
router.patch(
  '/portfolio/showcase',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.portfolio),
  profileOperationLogger('portfolio-showcase-update'),
  ConsultantProfileController.updatePortfolioShowcase
);

// Generate public portfolio
router.post(
  '/portfolio/public',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.portfolio),
  profileOperationLogger('public-portfolio-generate'),
  ConsultantProfileController.generatePublicProfile
);

/**
 * ===============================================================================
 * EXPERTISE AND SKILLS MATRIX ROUTES
 * ===============================================================================
 */

// Update expertise areas
router.patch(
  '/expertise',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validateExpertiseUpdate,
  profileOperationLogger('expertise-update'),
  ConsultantProfileController.updateExpertiseAreas
);

// Calculate skills matrix
router.get(
  '/skills-matrix',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.read),
  ConsultantProfileController.calculateSkillsMatrix
);

/**
 * ===============================================================================
 * DEVELOPMENT PLANNING ROUTES
 * ===============================================================================
 */

// Create development plan
router.post(
  '/development/plan',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.development),
  // ProfileValidators.validateDevelopmentPlan,
  profileOperationLogger('development-plan-create'),
  ConsultantProfileController.createDevelopmentPlan
);

// Track development progress
router.post(
  '/development/goals/:goalId/progress',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.development),
  // ProfileValidators.validateProgressTracking,
  profileOperationLogger('development-progress-track'),
  ConsultantProfileController.trackDevelopmentProgress
);

/**
 * ===============================================================================
 * PERFORMANCE AND REVIEW ROUTES
 * ===============================================================================
 */

// Add performance review
router.post(
  '/performance/reviews',
  // authorize(['admin', 'manager', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validatePerformanceReview,
  profileOperationLogger('performance-review-add'),
  ConsultantProfileController.addPerformanceReview
);

// Add achievement
router.post(
  '/achievements',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validateAchievement,
  profileOperationLogger('achievement-add'),
  ConsultantProfileController.addAchievement
);

/**
 * ===============================================================================
 * TESTIMONIAL MANAGEMENT ROUTES
 * ===============================================================================
 */

// Add testimonial
router.post(
  '/testimonials',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validateTestimonial,
  validateProfileData,
  profileOperationLogger('testimonial-add'),
  ConsultantProfileController.addTestimonial
);

// Update testimonial
router.put(
  '/testimonials/:testimonialId',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  // ProfileValidators.validateTestimonialUpdate,
  validateProfileData,
  profileOperationLogger('testimonial-update'),
  ConsultantProfileController.updateTestimonial
);

/**
 * ===============================================================================
 * PROFILE SEARCH AND DISCOVERY ROUTES
 * ===============================================================================
 */

// Search profiles with advanced filtering
router.get(
  '/search',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  // limitByEndpoint(PROFILE_RATE_LIMITS.search),
  // ProfileValidators.validateProfileSearch,
  ConsultantProfileController.searchProfiles
);

/**
 * ===============================================================================
 * DOCUMENT MANAGEMENT ROUTES
 * ===============================================================================
 */

// Upload profile document
router.post(
  '/documents',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  upload.single('document'),
  // limitByUser(PROFILE_RATE_LIMITS.upload),
  profileOperationLogger('profile-document-upload'),
  ConsultantProfileController.uploadProfileDocument
);

// Get profile documents
router.get(
  '/documents',
  // authorize(['admin', 'manager', 'hr', 'user', 'viewer']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.read),
  ConsultantProfileController.getProfileDocuments
);

/**
 * ===============================================================================
 * REPORTING AND EXPORT ROUTES
 * ===============================================================================
 */

// Generate profile report
router.post(
  '/report',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.report),
  // ProfileValidators.validateReportGeneration,
  profileOperationLogger('profile-report-generate'),
  ConsultantProfileController.generateProfileReport
);

// Export profile data
router.get(
  '/export/:format',
  // authorize(['admin', 'manager', 'hr']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.report),
  profileOperationLogger('profile-export'),
  ConsultantProfileController.exportProfile
);

/**
 * ===============================================================================
 * DATA MANAGEMENT ROUTES
 * ===============================================================================
 */

// Import profile data
router.post(
  '/import',
  // authorize(['admin', 'hr']),
  validateProfileAccess,
  upload.single('file'),
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.write),
  profileOperationLogger('profile-import'),
  ConsultantProfileController.importProfileData
);

// Sync profile data
router.post(
  '/sync',
  // authorize(['admin', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  profileOperationLogger('profile-sync'),
  ConsultantProfileController.syncProfileData
);

// Validate profile data
router.post(
  '/validate',
  // authorize(['admin', 'manager', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.default),
  ConsultantProfileController.validateProfileData
);

/**
 * ===============================================================================
 * AUDIT AND COMPLIANCE ROUTES
 * ===============================================================================
 */

// Audit profile changes
router.get(
  '/audit',
  // authorize(['admin', 'auditor', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.read),
  ConsultantProfileController.auditProfileChanges
);

/**
 * ===============================================================================
 * PROFILE COMPLETION AND QUALITY ROUTES
 * ===============================================================================
 */

// Get profile completeness score
router.get(
  '/completeness',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.read),
  (req, res) => {
    // This would calculate profile completeness based on filled sections
    res.json({
      success: true,
      data: {
        completeness: 85,
        totalSections: 8,
        completedSections: 7,
        missingSections: ['qualifications'],
        recommendations: [
          'Add professional certifications',
          'Update portfolio with recent projects',
          'Request testimonials from recent clients'
        ]
      }
    });
  }
);

// Get profile quality score
router.get(
  '/quality',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.read),
  (req, res) => {
    // This would calculate profile quality based on various factors
    res.json({
      success: true,
      data: {
        qualityScore: 92,
        factors: {
          completeness: 85,
          verification: 95,
          activity: 90,
          endorsements: 88
        },
        improvements: [
          'Add more detailed project descriptions',
          'Update skills with recent technologies'
        ]
      }
    });
  }
);

/**
 * ===============================================================================
 * VISUALIZATION AND PRESENTATION ROUTES
 * ===============================================================================
 */

// Get profile visualization data
router.get(
  '/visualization',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateProfileAccess,
  // costBasedLimit(calculateProfileCost, PROFILE_RATE_LIMITS.read),
  (req, res) => {
    // This would generate data for profile visualizations
    res.json({
      success: true,
      data: {
        skillsRadar: {
          technical: 9,
          functional: 8,
          leadership: 7,
          communication: 9
        },
        careerTimeline: [
          { year: 2018, role: 'Junior Developer', company: 'TechStart Inc.' },
          { year: 2020, role: 'Senior Developer', company: 'TechStart Inc.' },
          { year: 2022, role: 'Lead Consultant', company: 'ConsultingFirm LLC' }
        ],
        performanceTrends: {
          ratings: [3.8, 4.1, 4.3, 4.5, 4.7],
          years: [2019, 2020, 2021, 2022, 2023]
        }
      }
    });
  }
);

/**
 * ===============================================================================
 * COLLABORATION AND SHARING ROUTES
 * ===============================================================================
 */

// Share profile (generate shareable link)
router.post(
  '/share',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateProfileAccess,
  // limitByUser(PROFILE_RATE_LIMITS.write),
  profileOperationLogger('profile-share'),
  (req, res) => {
    // Generate shareable profile link
    const shareToken = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.json({
      success: true,
      data: {
        shareUrl: `/shared/profiles/${shareToken}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        permissions: req.body.permissions || ['read']
      }
    });
  }
);

/**
 * ===============================================================================
 * HEALTH CHECK AND STATUS ROUTES
 * ===============================================================================
 */

// Profile service health check
router.get(
  '/health',
  (req, res) => {
    res.status(200).json({
      success: true,
      service: 'consultant-profile-management',
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
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Profile route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Handle specific error types
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An internal server error occurred';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Profile validation failed';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry found';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else {
      message = 'File upload error';
    }
  }
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'PROFILE_ERROR',
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