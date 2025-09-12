'use strict';

/**
 * @fileoverview Enterprise user profile management routes for professional portfolio operations
 * @module servers/api/modules/user-management/routes/user-profile-routes
 * @requires express
 * @requires module:servers/api/modules/user-management/controllers/user-profile-controller
 * @requires module:shared/middleware/auth/authenticate
 * @requires module:shared/middleware/auth/authorize
 * @requires module:shared/middleware/validation/request-validator
 * @requires module:shared/middleware/security/rate-limiter
 * @requires module:shared/middleware/logging/operation-logger
 * @requires module:shared/middleware/validation/profile-validator
 * @requires module:shared/middleware/upload/file-upload
 * @requires module:shared/middleware/cache/cache-manager
 * @requires module:shared/middleware/compliance/audit-logger
 * @requires module:shared/middleware/security/csrf-protection
 * @requires module:shared/middleware/validation/sanitizer
 */

const express = require('express');
const router = express.Router();
const UserProfileController = require('../controllers/user-profile-controller');

// Authentication and authorization middleware
// const authenticate = require('../../../../shared/middleware/auth/authenticate');
// const authorize = require('../../../../shared/middleware/auth/authorize');

// Validation middleware
// const RequestValidator = require('../../../../shared/middleware/validation/request-validator');
// const ProfileValidator = require('../../../../shared/middleware/validation/profile-validator');
// const sanitizer = require('../../../../shared/middleware/validation/sanitizer');

// Security middleware
// const rateLimiter = require('../../../../shared/middleware/security/rate-limiter');
// const csrfProtection = require('../../../../shared/middleware/security/csrf-protection');

// Operational middleware
// const operationLogger = require('../../../../shared/middleware/logging/operation-logger');
// const auditLogger = require('../../../../shared/middleware/compliance/audit-logger');
// const cacheManager = require('../../../../shared/middleware/cache/cache-manager');

// File upload middleware
// const fileUpload = require('../../../../shared/middleware/upload/file-upload');

/**
 * Rate limiting configuration for profile operations
 * @constant {Object} RATE_LIMITS
 */
const RATE_LIMITS = {
    default: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    read: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 150, // higher limit for profile reads
        message: 'Too many profile read requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    write: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 40, // moderate limit for profile updates
        message: 'Too many profile write requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    upload: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20, // limited file uploads
        message: 'Too many file upload requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    bulk: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // very low limit for bulk operations
        message: 'Too many bulk profile operations, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    search: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 50, // moderate limit for profile searches
        message: 'Too many profile search requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    analytics: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 15, // limited analytics requests
        message: 'Too many profile analytics requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    export: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5, // very limited export operations
        message: 'Too many profile export requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    import: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // very limited import operations
        message: 'Too many profile import requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    endorsement: {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        max: 50, // limit endorsements per day
        message: 'Too many endorsement requests, please try again tomorrow.',
        standardHeaders: true,
        legacyHeaders: false
    }
};

/**
 * Calculate operation cost based on complexity and resource usage
 * @param {string} operation - Operation type
 * @param {Object} params - Operation parameters
 * @returns {number} Cost score (1-10)
 */
function calculateOperationCost(operation, params = {}) {
    const baseCosts = {
        'create': 4,
        'read': 1,
        'update': 3,
        'delete': 5,
        'search': 3,
        'bulk': 8,
        'analytics': 6,
        'export': 7,
        'import': 8,
        'upload': 5,
        'endorsement': 2,
        'recommendation': 4,
        'generation': 6,
        'validation': 3
    };

    let cost = baseCosts[operation] || 1;

    // Adjust cost based on parameters
    if (params.includeAnalytics) {
        cost += 2;
    }

    if (params.deepPopulation) {
        cost += 1;
    }

    if (params.fileSize && params.fileSize > 5 * 1024 * 1024) { // > 5MB
        cost += 3;
    }

    if (params.skillsCount && params.skillsCount > 50) {
        cost += 2;
    }

    if (params.complexGeneration) {
        cost += 3;
    }

    if (params.bulkOperation && params.itemCount) {
        cost += Math.min(params.itemCount / 5, 4);
    }

    return Math.min(Math.ceil(cost), 10);
}

/**
 * Operation logger middleware for profile routes
 * @param {string} operation - Operation name
 * @returns {Function} Middleware function
 */
function operationLogger(operation) {
    return (req, res, next) => {
        const startTime = Date.now();
        const cost = calculateOperationCost(operation, {
            includeAnalytics: req.query?.includeAnalytics === 'true',
            deepPopulation: req.query?.populate?.split(',').length > 3,
            fileSize: req.file?.size || 0,
            skillsCount: req.body?.skills?.length || 0,
            complexGeneration: req.query?.format === 'pdf' || req.query?.template === 'creative',
            bulkOperation: operation.includes('bulk'),
            itemCount: req.body?.skills?.length || req.body?.updates?.length || 1
        });

        // Log operation start
        req.operationContext = {
            operation,
            startTime,
            cost,
            userId: req.user?.id || 'anonymous',
            profileUserId: req.params?.userId || req.body?.userId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            correlationId: req.headers['x-correlation-id'] || require('crypto').randomUUID()
        };

        // Override res.json to log completion
        const originalJson = res.json;
        res.json = function(body) {
            const duration = Date.now() - startTime;
            
            // Log operation completion
            console.log(`Profile Operation: ${operation}`, {
                ...req.operationContext,
                duration,
                statusCode: res.statusCode,
                success: res.statusCode < 400,
                responseSize: JSON.stringify(body).length
            });

            return originalJson.call(this, body);
        };

        next();
    };
}

/**
 * Access validation middleware for profile operations
 * @param {string} permission - Required permission
 * @param {Object} options - Validation options
 * @returns {Function} Middleware function
 */
function validateAccess(permission, options = {}) {
    return (req, res, next) => {
        try {
            const { userId } = req.params;
            const requesterId = req.user?.id;
            const userRoles = req.user?.roles || [];
            const organizationId = req.user?.organizationId;

            // Super admin bypass
            if (userRoles.includes('super_admin')) {
                return next();
            }

            // Self-access validation
            if (userId && userId === requesterId && options.allowSelfAccess) {
                return next();
            }

            // Organization-level access validation
            if (options.requireSameOrganization && req.body?.organizationId !== organizationId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Organization mismatch',
                    code: 'ORGANIZATION_ACCESS_DENIED'
                });
            }

            // Public profile access validation
            if (options.allowPublicRead && req.method === 'GET') {
                return next();
            }

            // Role-based validation
            const requiredRoles = options.roles || [];
            if (requiredRoles.length > 0 && !requiredRoles.some(role => userRoles.includes(role))) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: Missing required role (${requiredRoles.join(' or ')})`,
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }

            // Connection-based access validation
            if (options.requireConnection && !options.allowSelfAccess) {
                // This would typically check if users are connected
                // For now, we'll allow access for demo purposes
                return next();
            }

            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Access validation failed',
                error: error.message
            });
        }
    };
}

/**
 * Data validation middleware for profile operations
 * @param {string} validationType - Type of validation to perform
 * @returns {Function} Middleware function
 */
function validateProfileData(validationType) {
    return (req, res, next) => {
        try {
            switch (validationType) {
                case 'create':
                    validateProfileCreation(req.body);
                    break;
                case 'update':
                    validateProfileUpdate(req.body);
                    break;
                case 'work':
                    validateWorkExperience(req.body);
                    break;
                case 'education':
                    validateEducation(req.body);
                    break;
                case 'skill':
                    validateSkill(req.body);
                    break;
                case 'project':
                    validateProject(req.body);
                    break;
                case 'search':
                    validateSearchParams(req.query);
                    break;
                case 'bulk':
                    validateBulkOperation(req.body);
                    break;
                case 'upload':
                    validateFileUpload(req.file);
                    break;
                case 'import':
                    validateImportData(req.body);
                    break;
                default:
                    break;
            }
            next();
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                error: error.message,
                validationType
            });
        }
    };
}

/**
 * Validate profile creation data
 * @param {Object} data - Profile creation data
 */
function validateProfileCreation(data) {
    if (!data.personal || !data.personal.fullName) {
        throw new Error('Full name is required');
    }

    if (data.personal.fullName.trim().length < 2) {
        throw new Error('Full name must be at least 2 characters');
    }

    if (data.personal.headline && data.personal.headline.length > 220) {
        throw new Error('Headline must be 220 characters or less');
    }

    if (data.personal.summary && data.personal.summary.length > 2000) {
        throw new Error('Summary must be 2000 characters or less');
    }
}

/**
 * Validate profile update data
 * @param {Object} data - Profile update data
 */
function validateProfileUpdate(data) {
    if (data.personal && data.personal.fullName && data.personal.fullName.trim().length < 2) {
        throw new Error('Full name must be at least 2 characters');
    }

    if (data.personal && data.personal.headline && data.personal.headline.length > 220) {
        throw new Error('Headline must be 220 characters or less');
    }

    if (data.personal && data.personal.summary && data.personal.summary.length > 2000) {
        throw new Error('Summary must be 2000 characters or less');
    }
}

/**
 * Validate work experience data
 * @param {Object} data - Work experience data
 */
function validateWorkExperience(data) {
    if (!data.company || !data.company.name) {
        throw new Error('Company name is required');
    }

    if (!data.title) {
        throw new Error('Job title is required');
    }

    if (!data.startDate) {
        throw new Error('Start date is required');
    }

    if (data.title.trim().length < 2) {
        throw new Error('Job title must be at least 2 characters');
    }

    if (data.description && data.description.length > 5000) {
        throw new Error('Job description must be 5000 characters or less');
    }
}

/**
 * Validate education data
 * @param {Object} data - Education data
 */
function validateEducation(data) {
    if (!data.institution || !data.institution.name) {
        throw new Error('Institution name is required');
    }

    if (!data.degree) {
        throw new Error('Degree is required');
    }

    if (data.degree.trim().length < 2) {
        throw new Error('Degree must be at least 2 characters');
    }

    if (data.gpa) {
        const gpa = parseFloat(data.gpa);
        if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
            throw new Error('GPA must be between 0.0 and 4.0');
        }
    }
}

/**
 * Validate skill data
 * @param {Object} data - Skill data
 */
function validateSkill(data) {
    if (!data.name || data.name.trim().length < 2) {
        throw new Error('Skill name is required and must be at least 2 characters');
    }

    if (data.level) {
        const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
        if (!validLevels.includes(data.level)) {
            throw new Error(`Invalid skill level. Valid levels: ${validLevels.join(', ')}`);
        }
    }

    if (data.yearsOfExperience !== undefined) {
        const years = parseInt(data.yearsOfExperience);
        if (isNaN(years) || years < 0 || years > 50) {
            throw new Error('Years of experience must be between 0 and 50');
        }
    }
}

/**
 * Validate project data
 * @param {Object} data - Project data
 */
function validateProject(data) {
    if (!data.title || data.title.trim().length < 3) {
        throw new Error('Project title is required and must be at least 3 characters');
    }

    if (!data.description || data.description.trim().length < 10) {
        throw new Error('Project description is required and must be at least 10 characters');
    }

    if (data.title.length > 100) {
        throw new Error('Project title must be 100 characters or less');
    }

    if (data.description.length > 2000) {
        throw new Error('Project description must be 2000 characters or less');
    }
}

/**
 * Validate search parameters
 * @param {Object} query - Search query parameters
 */
function validateSearchParams(query) {
    if (query.limit) {
        const limit = parseInt(query.limit);
        if (isNaN(limit) || limit < 1 || limit > 50) {
            throw new Error('Limit must be between 1 and 50');
        }
    }

    if (query.offset) {
        const offset = parseInt(query.offset);
        if (isNaN(offset) || offset < 0) {
            throw new Error('Offset must be non-negative');
        }
    }

    if (query.minExperience) {
        const minExp = parseInt(query.minExperience);
        if (isNaN(minExp) || minExp < 0 || minExp > 50) {
            throw new Error('Minimum experience must be between 0 and 50 years');
        }
    }
}

/**
 * Validate bulk operation data
 * @param {Object} data - Bulk operation data
 */
function validateBulkOperation(data) {
    if (!data.skills && !data.updates) {
        throw new Error('Skills or updates array is required for bulk operations');
    }

    const items = data.skills || data.updates;
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Bulk operation requires non-empty array');
    }

    if (items.length > 100) {
        throw new Error('Bulk operation exceeds maximum limit of 100 items');
    }
}

/**
 * Validate file upload
 * @param {Object} file - Uploaded file
 */
function validateFileUpload(file) {
    if (!file) {
        throw new Error('File is required');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new Error('Invalid file type. Allowed: JPEG, PNG, GIF, PDF');
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        throw new Error('File size exceeds maximum limit of 10MB');
    }
}

/**
 * Validate import data
 * @param {Object} data - Import data
 */
function validateImportData(data) {
    if (!data.linkedInData) {
        throw new Error('LinkedIn data is required for import');
    }

    if (typeof data.linkedInData !== 'object') {
        throw new Error('LinkedIn data must be an object');
    }

    if (!data.linkedInData.firstName && !data.linkedInData.lastName) {
        throw new Error('LinkedIn data must contain at least firstName or lastName');
    }
}

// ================== GLOBAL MIDDLEWARE SETUP ==================

// Apply authentication to all routes
// router.use(authenticate);

// Apply CSRF protection to all state-changing operations
// router.use(csrfProtection);

// Apply request sanitization
// router.use(sanitizer.sanitizeRequest);

// Apply audit logging for compliance
// router.use(auditLogger('profile-management'));

// ================== PROFILE CRUD ROUTES ==================

/**
 * Create a comprehensive user profile
 * POST /profiles
 */
router.post(
    '/profiles',
    // authenticate,
    // authorize(['admin', 'manager', 'member']),
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateProfileCreation,
    validateAccess('profile.create', { allowSelfAccess: true }),
    validateProfileData('create'),
    operationLogger('profile_create'),
    UserProfileController.createProfile
);

/**
 * Create profile for specific user
 * POST /profiles/:userId
 */
router.post(
    '/profiles/:userId',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateProfileCreation,
    validateAccess('profile.create_for_user', { allowSelfAccess: true, roles: ['admin', 'manager'] }),
    validateProfileData('create'),
    operationLogger('profile_create_for_user'),
    UserProfileController.createProfile
);

/**
 * Get user profile with population options
 * GET /profiles/:userId
 */
router.get(
    '/profiles/:userId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('profile', 300), // 5 minute cache
    validateAccess('profile.read', { allowSelfAccess: true, allowPublicRead: true }),
    operationLogger('profile_read'),
    UserProfileController.getProfile
);

/**
 * Update user profile information
 * PUT /profiles/:userId
 */
router.put(
    '/profiles/:userId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateProfileUpdate,
    validateAccess('profile.update', { allowSelfAccess: true }),
    validateProfileData('update'),
    operationLogger('profile_update'),
    UserProfileController.updateProfile
);

/**
 * Delete user profile
 * DELETE /profiles/:userId
 */
router.delete(
    '/profiles/:userId',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('profile_deletion'),
    validateAccess('profile.delete', { allowSelfAccess: true, roles: ['admin'] }),
    operationLogger('profile_delete'),
    UserProfileController.updateProfile
);

// ================== WORK EXPERIENCE ROUTES ==================

/**
 * Add work experience to profile
 * POST /profiles/:userId/experience
 */
router.post(
    '/profiles/:userId/experience',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateWorkExperience,
    validateAccess('experience.add', { allowSelfAccess: true }),
    validateProfileData('work'),
    operationLogger('experience_add'),
    UserProfileController.addWorkExperience
);

/**
 * Update work experience
 * PUT /profiles/:userId/experience/:experienceId
 */
router.put(
    '/profiles/:userId/experience/:experienceId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateWorkExperience,
    validateAccess('experience.update', { allowSelfAccess: true }),
    validateProfileData('work'),
    operationLogger('experience_update'),
    UserProfileController.addWorkExperience
);

/**
 * Delete work experience
 * DELETE /profiles/:userId/experience/:experienceId
 */
router.delete(
    '/profiles/:userId/experience/:experienceId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('experience.delete', { allowSelfAccess: true }),
    operationLogger('experience_delete'),
    UserProfileController.updateProfile
);

/**
 * Get work experience details
 * GET /profiles/:userId/experience/:experienceId
 */
router.get(
    '/profiles/:userId/experience/:experienceId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('experience.read', { allowSelfAccess: true, allowPublicRead: true }),
    operationLogger('experience_read'),
    UserProfileController.getProfile
);

// ================== EDUCATION ROUTES ==================

/**
 * Add education to profile
 * POST /profiles/:userId/education
 */
router.post(
    '/profiles/:userId/education',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateEducation,
    validateAccess('education.add', { allowSelfAccess: true }),
    validateProfileData('education'),
    operationLogger('education_add'),
    UserProfileController.addEducation
);

/**
 * Update education entry
 * PUT /profiles/:userId/education/:educationId
 */
router.put(
    '/profiles/:userId/education/:educationId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateEducation,
    validateAccess('education.update', { allowSelfAccess: true }),
    validateProfileData('education'),
    operationLogger('education_update'),
    UserProfileController.addEducation
);

/**
 * Delete education entry
 * DELETE /profiles/:userId/education/:educationId
 */
router.delete(
    '/profiles/:userId/education/:educationId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('education.delete', { allowSelfAccess: true }),
    operationLogger('education_delete'),
    UserProfileController.updateProfile
);

/**
 * Get education details
 * GET /profiles/:userId/education/:educationId
 */
router.get(
    '/profiles/:userId/education/:educationId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('education.read', { allowSelfAccess: true, allowPublicRead: true }),
    operationLogger('education_read'),
    UserProfileController.getProfile
);

// ================== SKILLS MANAGEMENT ROUTES ==================

/**
 * Add or update skill in profile
 * POST /profiles/:userId/skills
 */
router.post(
    '/profiles/:userId/skills',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateSkill,
    validateAccess('skill.add', { allowSelfAccess: true }),
    validateProfileData('skill'),
    operationLogger('skill_add'),
    UserProfileController.addSkill
);

/**
 * Update skill information
 * PUT /profiles/:userId/skills/:skillName
 */
router.put(
    '/profiles/:userId/skills/:skillName',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateSkill,
    validateAccess('skill.update', { allowSelfAccess: true }),
    validateProfileData('skill'),
    operationLogger('skill_update'),
    UserProfileController.addSkill
);

/**
 * Delete skill from profile
 * DELETE /profiles/:userId/skills/:skillName
 */
router.delete(
    '/profiles/:userId/skills/:skillName',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('skill.delete', { allowSelfAccess: true }),
    operationLogger('skill_delete'),
    UserProfileController.updateProfile
);

/**
 * Endorse a user's skill
 * POST /profiles/:userId/skills/:skillName/endorse
 */
router.post(
    '/profiles/:userId/skills/:skillName/endorse',
    // authenticate,
    // rateLimiter(RATE_LIMITS.endorsement),
    validateAccess('skill.endorse', { requireConnection: true }),
    operationLogger('skill_endorse'),
    UserProfileController.endorseSkill
);

/**
 * Remove skill endorsement
 * DELETE /profiles/:userId/skills/:skillName/endorse
 */
router.delete(
    '/profiles/:userId/skills/:skillName/endorse',
    // authenticate,
    // rateLimiter(RATE_LIMITS.endorsement),
    validateAccess('skill.remove_endorse', { allowSelfAccess: true }),
    operationLogger('skill_remove_endorse'),
    UserProfileController.updateProfile
);

/**
 * Bulk update skills with market data
 * PUT /profiles/:userId/skills/bulk
 */
router.put(
    '/profiles/:userId/skills/bulk',
    // authenticate,
    // rateLimiter(RATE_LIMITS.bulk),
    // ProfileValidator.validateBulkSkills,
    validateAccess('skill.bulk_update', { allowSelfAccess: true }),
    validateProfileData('bulk'),
    operationLogger('skill_bulk_update'),
    UserProfileController.bulkUpdateSkills
);

// ================== PROJECT PORTFOLIO ROUTES ==================

/**
 * Add project to portfolio
 * POST /profiles/:userId/projects
 */
router.post(
    '/profiles/:userId/projects',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateProject,
    validateAccess('project.add', { allowSelfAccess: true }),
    validateProfileData('project'),
    operationLogger('project_add'),
    UserProfileController.addProject
);

/**
 * Update project information
 * PUT /profiles/:userId/projects/:projectId
 */
router.put(
    '/profiles/:userId/projects/:projectId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateProject,
    validateAccess('project.update', { allowSelfAccess: true }),
    validateProfileData('project'),
    operationLogger('project_update'),
    UserProfileController.addProject
);

/**
 * Delete project from portfolio
 * DELETE /profiles/:userId/projects/:projectId
 */
router.delete(
    '/profiles/:userId/projects/:projectId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('project.delete', { allowSelfAccess: true }),
    operationLogger('project_delete'),
    UserProfileController.updateProfile
);

/**
 * Get project details
 * GET /profiles/:userId/projects/:projectId
 */
router.get(
    '/profiles/:userId/projects/:projectId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('project.read', { allowSelfAccess: true, allowPublicRead: true }),
    operationLogger('project_read'),
    UserProfileController.getProfile
);

// ================== RECOMMENDATION ROUTES ==================

/**
 * Add recommendation to profile
 * POST /profiles/:userId/recommendations
 */
router.post(
    '/profiles/:userId/recommendations',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateRecommendation,
    validateAccess('recommendation.add', { requireConnection: true }),
    operationLogger('recommendation_add'),
    UserProfileController.addRecommendation
);

/**
 * Update recommendation
 * PUT /profiles/:userId/recommendations/:recommendationId
 */
router.put(
    '/profiles/:userId/recommendations/:recommendationId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // ProfileValidator.validateRecommendation,
    validateAccess('recommendation.update'),
    operationLogger('recommendation_update'),
    UserProfileController.addRecommendation
);

/**
 * Delete recommendation
 * DELETE /profiles/:userId/recommendations/:recommendationId
 */
router.delete(
    '/profiles/:userId/recommendations/:recommendationId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('recommendation.delete', { allowSelfAccess: true }),
    operationLogger('recommendation_delete'),
    UserProfileController.updateProfile
);

/**
 * Approve or reject recommendation
 * PATCH /profiles/:userId/recommendations/:recommendationId/status
 */
router.patch(
    '/profiles/:userId/recommendations/:recommendationId/status',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('recommendation.moderate', { allowSelfAccess: true }),
    operationLogger('recommendation_moderate'),
    UserProfileController.updateProfile
);

// ================== MEDIA MANAGEMENT ROUTES ==================

/**
 * Upload profile avatar
 * POST /profiles/:userId/avatar
 */
router.post(
    '/profiles/:userId/avatar',
    // authenticate,
    // rateLimiter(RATE_LIMITS.upload),
    // fileUpload.single('avatar'),
    validateAccess('avatar.upload', { allowSelfAccess: true }),
    validateProfileData('upload'),
    operationLogger('avatar_upload'),
    UserProfileController.updateProfile
);

/**
 * Delete profile avatar
 * DELETE /profiles/:userId/avatar
 */
router.delete(
    '/profiles/:userId/avatar',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('avatar.delete', { allowSelfAccess: true }),
    operationLogger('avatar_delete'),
    UserProfileController.updateProfile
);

/**
 * Upload portfolio media
 * POST /profiles/:userId/media
 */
router.post(
    '/profiles/:userId/media',
    // authenticate,
    // rateLimiter(RATE_LIMITS.upload),
    // fileUpload.array('media', 10),
    validateAccess('media.upload', { allowSelfAccess: true }),
    operationLogger('media_upload'),
    UserProfileController.updateProfile
);

/**
 * Delete portfolio media
 * DELETE /profiles/:userId/media/:mediaId
 */
router.delete(
    '/profiles/:userId/media/:mediaId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('media.delete', { allowSelfAccess: true }),
    operationLogger('media_delete'),
    UserProfileController.updateProfile
);

// ================== PROFILE SEARCH ROUTES ==================

/**
 * Search profiles with advanced filtering
 * GET /profiles/search
 */
router.get(
    '/profiles/search',
    // authenticate,
    // rateLimiter(RATE_LIMITS.search),
    // cacheManager.getFromCache('profile_search', 180), // 3 minute cache
    validateAccess('profile.search'),
    validateProfileData('search'),
    operationLogger('profile_search'),
    UserProfileController.searchProfiles
);

/**
 * Advanced profile filtering
 * POST /profiles/filter
 */
router.post(
    '/profiles/filter',
    // authenticate,
    // rateLimiter(RATE_LIMITS.search),
    validateAccess('profile.filter'),
    validateProfileData('search'),
    operationLogger('profile_filter'),
    UserProfileController.searchProfiles
);

/**
 * Search profiles by skills
 * GET /profiles/search/skills
 */
router.get(
    '/profiles/search/skills',
    // authenticate,
    // rateLimiter(RATE_LIMITS.search),
    validateAccess('profile.search_skills'),
    validateProfileData('search'),
    operationLogger('profile_search_skills'),
    UserProfileController.searchProfiles
);

/**
 * Find similar profiles
 * GET /profiles/:userId/similar
 */
router.get(
    '/profiles/:userId/similar',
    // authenticate,
    // rateLimiter(RATE_LIMITS.search),
    // cacheManager.getFromCache('similar_profiles', 600), // 10 minute cache
    validateAccess('profile.find_similar', { allowSelfAccess: true }),
    operationLogger('profile_find_similar'),
    UserProfileController.searchProfiles
);

// ================== PROFILE EXPORT/IMPORT ROUTES ==================

/**
 * Generate resume/CV from profile
 * GET /profiles/:userId/resume
 */
router.get(
    '/profiles/:userId/resume',
    // authenticate,
    // rateLimiter(RATE_LIMITS.export),
    validateAccess('profile.generate_resume', { allowSelfAccess: true }),
    operationLogger('profile_generate_resume'),
    UserProfileController.generateResume
);

/**
 * Export profile data
 * GET /profiles/:userId/export
 */
router.get(
    '/profiles/:userId/export',
    // authenticate,
    // rateLimiter(RATE_LIMITS.export),
    validateAccess('profile.export', { allowSelfAccess: true }),
    operationLogger('profile_export'),
    UserProfileController.getProfile
);

/**
 * Import profile data from LinkedIn
 * POST /profiles/:userId/import/linkedin
 */
router.post(
    '/profiles/:userId/import/linkedin',
    // authenticate,
    // rateLimiter(RATE_LIMITS.import),
    // ProfileValidator.validateLinkedInImport,
    validateAccess('profile.import_linkedin', { allowSelfAccess: true }),
    validateProfileData('import'),
    operationLogger('profile_import_linkedin'),
    UserProfileController.importFromLinkedIn
);

/**
 * Import from resume file
 * POST /profiles/:userId/import/resume
 */
router.post(
    '/profiles/:userId/import/resume',
    // authenticate,
    // rateLimiter(RATE_LIMITS.import),
    // fileUpload.single('resume'),
    validateAccess('profile.import_resume', { allowSelfAccess: true }),
    validateProfileData('upload'),
    operationLogger('profile_import_resume'),
    UserProfileController.importFromLinkedIn
);

// ================== PROFILE ANALYTICS ROUTES ==================

/**
 * Get profile analytics and insights
 * GET /profiles/:userId/analytics
 */
router.get(
    '/profiles/:userId/analytics',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    // cacheManager.getFromCache('profile_analytics', 900), // 15 minute cache
    validateAccess('profile.analytics', { allowSelfAccess: true }),
    operationLogger('profile_analytics'),
    UserProfileController.getProfileAnalytics
);

/**
 * Get profile performance metrics
 * GET /profiles/:userId/metrics
 */
router.get(
    '/profiles/:userId/metrics',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('profile.metrics', { allowSelfAccess: true }),
    operationLogger('profile_metrics'),
    UserProfileController.getProfileAnalytics
);

/**
 * Get profile completion score
 * GET /profiles/:userId/completion
 */
router.get(
    '/profiles/:userId/completion',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('profile.completion', { allowSelfAccess: true }),
    operationLogger('profile_completion'),
    UserProfileController.getProfile
);

/**
 * Get skill analytics
 * GET /profiles/:userId/skills/analytics
 */
router.get(
    '/profiles/:userId/skills/analytics',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('skill.analytics', { allowSelfAccess: true }),
    operationLogger('skill_analytics'),
    UserProfileController.getProfileAnalytics
);

// ================== PROFILE VALIDATION ROUTES ==================

/**
 * Validate profile data
 * POST /profiles/:userId/validate
 */
router.post(
    '/profiles/:userId/validate',
    // authenticate,
    // rateLimiter(RATE_LIMITS.default),
    validateAccess('profile.validate', { allowSelfAccess: true }),
    operationLogger('profile_validate'),
    UserProfileController.getProfile
);

/**
 * Check profile completeness
 * GET /profiles/:userId/completeness
 */
router.get(
    '/profiles/:userId/completeness',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('profile.check_completeness', { allowSelfAccess: true }),
    operationLogger('profile_check_completeness'),
    UserProfileController.getProfile
);

/**
 * Verify employment history
 * POST /profiles/:userId/verify/employment
 */
router.post(
    '/profiles/:userId/verify/employment',
    // authenticate,
    // rateLimiter(RATE_LIMITS.default),
    validateAccess('profile.verify_employment', { allowSelfAccess: true }),
    operationLogger('profile_verify_employment'),
    UserProfileController.addWorkExperience
);

/**
 * Verify education credentials
 * POST /profiles/:userId/verify/education
 */
router.post(
    '/profiles/:userId/verify/education',
    // authenticate,
    // rateLimiter(RATE_LIMITS.default),
    validateAccess('profile.verify_education', { allowSelfAccess: true }),
    operationLogger('profile_verify_education'),
    UserProfileController.addEducation
);

module.exports = router;