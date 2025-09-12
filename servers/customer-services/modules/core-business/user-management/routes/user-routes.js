'use strict';

/**
 * @fileoverview Enterprise user management routes for authentication, CRUD operations, and user lifecycle management
 * @module servers/api/modules/user-management/routes/user-routes
 * @requires express
 * @requires module:servers/api/modules/user-management/controllers/user-controller
 * @requires module:shared/middleware/auth/authenticate
 * @requires module:shared/middleware/auth/authorize
 * @requires module:shared/middleware/validation/request-validator
 * @requires module:shared/middleware/security/rate-limiter
 * @requires module:shared/middleware/logging/operation-logger
 * @requires module:shared/middleware/validation/user-validator
 * @requires module:shared/middleware/upload/file-upload
 * @requires module:shared/middleware/cache/cache-manager
 * @requires module:shared/middleware/compliance/audit-logger
 * @requires module:shared/middleware/security/csrf-protection
 * @requires module:shared/middleware/validation/sanitizer
 */

const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user-controller');

// Authentication and authorization middleware
// const authenticate = require('../../../../shared/middleware/auth/authenticate');
// const authorize = require('../../../../shared/middleware/auth/authorize');

// Validation middleware
// const RequestValidator = require('../../../../shared/middleware/validation/request-validator');
// const UserValidator = require('../../../../shared/middleware/validation/user-validator');
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
 * Rate limiting configuration for user operations
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
        max: 200, // higher limit for read operations
        message: 'Too many read requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    write: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 50, // lower limit for write operations
        message: 'Too many write requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    critical: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // very low limit for critical operations
        message: 'Too many critical operations, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    bulk: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5, // very low limit for bulk operations
        message: 'Too many bulk operations, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    search: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // moderate limit for search operations
        message: 'Too many search requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    analytics: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20, // limited analytics requests
        message: 'Too many analytics requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20, // limited authentication attempts
        message: 'Too many authentication attempts, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    mfa: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // very limited MFA setup attempts
        message: 'Too many MFA setup attempts, please try again later.',
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
        'create': 3,
        'read': 1,
        'update': 2,
        'delete': 4,
        'search': 2,
        'bulk': 8,
        'analytics': 5,
        'export': 6,
        'import': 7,
        'auth': 2,
        'mfa': 4,
        'security': 5
    };

    let cost = baseCosts[operation] || 1;

    // Adjust cost based on parameters
    if (params.bulk && params.count) {
        cost += Math.min(params.count / 10, 5);
    }

    if (params.includeAnalytics) {
        cost += 2;
    }

    if (params.deepPopulation) {
        cost += 1;
    }

    if (params.complexQuery) {
        cost += 2;
    }

    return Math.min(Math.ceil(cost), 10);
}

/**
 * Operation logger middleware for user routes
 * @param {string} operation - Operation name
 * @returns {Function} Middleware function
 */
function operationLogger(operation) {
    return (req, res, next) => {
        const startTime = Date.now();
        const cost = calculateOperationCost(operation, {
            bulk: req.body?.bulk || false,
            count: req.body?.users?.length || req.body?.updates?.length || 1,
            includeAnalytics: req.query?.includeAnalytics === 'true',
            deepPopulation: req.query?.populate?.length > 2,
            complexQuery: Object.keys(req.query).length > 5
        });

        // Log operation start
        req.operationContext = {
            operation,
            startTime,
            cost,
            userId: req.user?.id || 'anonymous',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            correlationId: req.headers['x-correlation-id'] || require('crypto').randomUUID()
        };

        // Override res.json to log completion
        const originalJson = res.json;
        res.json = function(body) {
            const duration = Date.now() - startTime;
            
            // Log operation completion
            console.log(`User Operation: ${operation}`, {
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
 * Access validation middleware for user operations
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

            // Role-based validation
            const requiredRoles = options.roles || [];
            if (requiredRoles.length > 0 && !requiredRoles.some(role => userRoles.includes(role))) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: Missing required role (${requiredRoles.join(' or ')})`,
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
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
 * Data validation middleware for user operations
 * @param {string} validationType - Type of validation to perform
 * @returns {Function} Middleware function
 */
function validateUserData(validationType) {
    return (req, res, next) => {
        try {
            switch (validationType) {
                case 'create':
                    validateUserCreation(req.body);
                    break;
                case 'update':
                    validateUserUpdate(req.body);
                    break;
                case 'bulk':
                    validateBulkOperation(req.body);
                    break;
                case 'search':
                    validateSearchParams(req.query);
                    break;
                case 'mfa':
                    validateMFAData(req.body);
                    break;
                case 'organization':
                    validateOrganizationData(req.body);
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
 * Validate user creation data
 * @param {Object} data - User creation data
 */
function validateUserCreation(data) {
    if (!data.email || typeof data.email !== 'string') {
        throw new Error('Valid email is required');
    }

    if (!data.profile || !data.profile.firstName || !data.profile.lastName) {
        throw new Error('First name and last name are required');
    }

    if (data.organizations && !Array.isArray(data.organizations)) {
        throw new Error('Organizations must be an array');
    }
}

/**
 * Validate user update data
 * @param {Object} data - User update data
 */
function validateUserUpdate(data) {
    if (data.email && typeof data.email !== 'string') {
        throw new Error('Email must be a string');
    }

    if (data.organizations && !Array.isArray(data.organizations)) {
        throw new Error('Organizations must be an array');
    }
}

/**
 * Validate bulk operation data
 * @param {Object} data - Bulk operation data
 */
function validateBulkOperation(data) {
    if (!data.users && !data.updates) {
        throw new Error('Users or updates array is required for bulk operations');
    }

    const items = data.users || data.updates;
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Bulk operation requires non-empty array');
    }

    if (items.length > 1000) {
        throw new Error('Bulk operation exceeds maximum limit of 1000 items');
    }
}

/**
 * Validate search parameters
 * @param {Object} query - Search query parameters
 */
function validateSearchParams(query) {
    if (query.limit) {
        const limit = parseInt(query.limit);
        if (isNaN(limit) || limit < 1 || limit > 100) {
            throw new Error('Limit must be between 1 and 100');
        }
    }

    if (query.offset) {
        const offset = parseInt(query.offset);
        if (isNaN(offset) || offset < 0) {
            throw new Error('Offset must be non-negative');
        }
    }
}

/**
 * Validate MFA data
 * @param {Object} data - MFA data
 */
function validateMFAData(data) {
    const validMethods = ['totp', 'sms', 'email', 'webauthn', 'backup_codes'];
    
    if (!data.method || !validMethods.includes(data.method)) {
        throw new Error(`Invalid MFA method. Must be one of: ${validMethods.join(', ')}`);
    }
}

/**
 * Validate organization data
 * @param {Object} data - Organization data
 */
function validateOrganizationData(data) {
    if (!data.organizationId || typeof data.organizationId !== 'string') {
        throw new Error('Valid organization ID is required');
    }

    if (!data.roles || !Array.isArray(data.roles) || data.roles.length === 0) {
        throw new Error('At least one role is required');
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
// router.use(auditLogger('user-management'));

// ================== USER AUTHENTICATION ROUTES ==================

/**
 * Authenticate user with multiple strategy support
 * POST /auth/login
 */
router.post(
    '/auth/login',
    // rateLimiter(RATE_LIMITS.auth),
    // UserValidator.validateAuthenticationRequest,
    validateUserData('auth'),
    operationLogger('auth_login'),
    UserController.authenticateUser
);

/**
 * Register new user with comprehensive validation
 * POST /auth/register
 */
router.post(
    '/auth/register',
    // rateLimiter(RATE_LIMITS.write),
    // UserValidator.validateRegistrationRequest,
    // validateUserData('create'),
    // operationLogger('auth_register'),
    UserController.registerUser
);

/**
 * Logout user with comprehensive session cleanup
 * POST /auth/logout
 */
router.post(
    '/auth/logout',
    // authenticate,
    // rateLimiter(RATE_LIMITS.default),
    operationLogger('auth_logout'),
    UserController.logoutUser
);

// ================== USER CRUD ROUTES ==================

/**
 * Create a new user (admin operation)
 * POST /users
 */
router.post(
    '/users',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // UserValidator.validateUserCreation,
    validateAccess('user.create', { roles: ['admin', 'super_admin'] }),
    validateUserData('create'),
    operationLogger('user_create'),
    UserController.createUser
);

/**
 * Get user by ID with comprehensive data
 * GET /users/:userId
 */
router.get(
    '/users/:userId',
    // authenticate,
    // authorize(['admin', 'manager', 'member']),
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('user', 300), // 5 minute cache
    validateAccess('user.read', { allowSelfAccess: true }),
    operationLogger('user_read'),
    UserController.getUserById
);

/**
 * Update user information
 * PUT /users/:userId
 */
router.put(
    '/users/:userId',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.write),
    // UserValidator.validateUserUpdate,
    validateAccess('user.update', { allowSelfAccess: true, roles: ['admin', 'manager'] }),
    validateUserData('update'),
    operationLogger('user_update'),
    UserController.updateUser
);

/**
 * Delete or deactivate user
 * DELETE /users/:userId
 */
router.delete(
    '/users/:userId',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('user_deletion'),
    validateAccess('user.delete', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_delete'),
    UserController.deleteUser
);

// ================== USER MFA ROUTES ==================

/**
 * Setup multi-factor authentication
 * POST /users/:userId/mfa/setup
 */
router.post(
    '/users/:userId/mfa/setup',
    // authenticate,
    // rateLimiter(RATE_LIMITS.mfa),
    // UserValidator.validateMFASetup,
    validateAccess('mfa.setup', { allowSelfAccess: true }),
    validateUserData('mfa'),
    operationLogger('mfa_setup'),
    UserController.setupMFA
);

/**
 * Complete MFA setup with verification
 * POST /users/:userId/mfa/complete
 */
router.post(
    '/users/:userId/mfa/complete',
    // authenticate,
    // rateLimiter(RATE_LIMITS.mfa),
    // UserValidator.validateMFACompletion,
    validateAccess('mfa.complete', { allowSelfAccess: true }),
    validateUserData('mfa'),
    operationLogger('mfa_complete'),
    UserController.completeMFASetup
);

/**
 * Disable MFA method for user
 * DELETE /users/:userId/mfa/:method
 */
router.delete(
    '/users/:userId/mfa/:method',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('mfa_disable'),
    validateAccess('mfa.disable', { allowSelfAccess: true, roles: ['admin'] }),
    operationLogger('mfa_disable'),
    UserController.disableMFA
);

// ================== USER ORGANIZATION ROUTES ==================

/**
 * Add user to organization with role assignment
 * POST /users/:userId/organizations
 */
router.post(
    '/users/:userId/organizations',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.write),
    // UserValidator.validateOrganizationAssignment,
    validateAccess('organization.assign', { roles: ['admin', 'manager'] }),
    validateUserData('organization'),
    operationLogger('user_organization_add'),
    UserController.addUserToOrganization
);

/**
 * Remove user from organization
 * DELETE /users/:userId/organizations/:organizationId
 */
router.delete(
    '/users/:userId/organizations/:organizationId',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('organization_removal'),
    validateAccess('organization.remove', { roles: ['admin', 'manager'] }),
    operationLogger('user_organization_remove'),
    UserController.removeUserFromOrganization
);

// ================== USER SEARCH ROUTES ==================

/**
 * Search users with advanced filtering
 * GET /users/search
 */
router.get(
    '/users/search',
    // authenticate,
    // authorize(['admin', 'manager', 'member']),
    // rateLimiter(RATE_LIMITS.search),
    // cacheManager.getFromCache('user_search', 180), // 3 minute cache
    validateAccess('user.search'),
    validateUserData('search'),
    operationLogger('user_search'),
    UserController.searchUsers
);

/**
 * Advanced user filtering with faceted search
 * POST /users/filter
 */
router.post(
    '/users/filter',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.search),
    validateAccess('user.filter', { roles: ['admin', 'manager'] }),
    validateUserData('search'),
    operationLogger('user_filter'),
    UserController.searchUsers
);

// ================== USER BULK OPERATIONS ==================

/**
 * Bulk create users
 * POST /users/bulk/create
 */
router.post(
    '/users/bulk/create',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    // UserValidator.validateBulkUserCreation,
    validateAccess('user.bulk_create', { roles: ['admin', 'super_admin'] }),
    validateUserData('bulk'),
    operationLogger('user_bulk_create'),
    UserController.createUser
);

/**
 * Bulk update users
 * PUT /users/bulk/update
 */
router.put(
    '/users/bulk/update',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    // UserValidator.validateBulkUserUpdate,
    validateAccess('user.bulk_update', { roles: ['admin', 'super_admin'] }),
    validateUserData('bulk'),
    operationLogger('user_bulk_update'),
    UserController.updateUser
);

/**
 * Bulk delete users
 * DELETE /users/bulk/delete
 */
router.delete(
    '/users/bulk/delete',
    // authenticate,
    // authorize(['super_admin']),
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('bulk_user_deletion'),
    validateAccess('user.bulk_delete', { roles: ['super_admin'] }),
    validateUserData('bulk'),
    operationLogger('user_bulk_delete'),
    UserController.deleteUser
);

// ================== USER IMPORT/EXPORT ROUTES ==================

/**
 * Export user data for backup or migration
 * GET /users/export
 */
router.get(
    '/users/export',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('user.export', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_export'),
    UserController.searchUsers
);

/**
 * Import user data from external sources
 * POST /users/import
 */
router.post(
    '/users/import',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    // fileUpload.single('users_file'),
    validateAccess('user.import', { roles: ['admin', 'super_admin'] }),
    validateUserData('bulk'),
    operationLogger('user_import'),
    UserController.createUser
);

/**
 * Import users from CSV file
 * POST /users/import/csv
 */
router.post(
    '/users/import/csv',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    // fileUpload.single('csv_file'),
    validateAccess('user.import_csv', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_import_csv'),
    UserController.createUser
);

/**
 * Import users from LDAP directory
 * POST /users/import/ldap
 */
router.post(
    '/users/import/ldap',
    // authenticate,
    // authorize(['super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    validateAccess('user.import_ldap', { roles: ['super_admin'] }),
    operationLogger('user_import_ldap'),
    UserController.createUser
);

// ================== USER STATUS MANAGEMENT ==================

/**
 * Archive user account
 * POST /users/:userId/archive
 */
router.post(
    '/users/:userId/archive',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('user_archive'),
    validateAccess('user.archive', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_archive'),
    UserController.updateUser
);

/**
 * Restore archived user account
 * POST /users/:userId/restore
 */
router.post(
    '/users/:userId/restore',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('user_restore'),
    validateAccess('user.restore', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_restore'),
    UserController.updateUser
);

/**
 * Suspend user account
 * POST /users/:userId/suspend
 */
router.post(
    '/users/:userId/suspend',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('user_suspension'),
    validateAccess('user.suspend', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_suspend'),
    UserController.updateUser
);

/**
 * Reactivate suspended user account
 * POST /users/:userId/reactivate
 */
router.post(
    '/users/:userId/reactivate',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('user_reactivation'),
    validateAccess('user.reactivate', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_reactivate'),
    UserController.updateUser
);

/**
 * Transfer user ownership to another user
 * POST /users/:userId/transfer
 */
router.post(
    '/users/:userId/transfer',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('ownership_transfer'),
    validateAccess('user.transfer', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_transfer'),
    UserController.updateUser
);

// ================== USER ANALYTICS ROUTES ==================

/**
 * Get comprehensive user analytics
 * GET /users/analytics
 */
router.get(
    '/users/analytics',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.analytics),
    // cacheManager.getFromCache('user_analytics', 900), // 15 minute cache
    validateAccess('user.analytics', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_analytics'),
    UserController.getUserAnalytics
);

/**
 * Get user activity dashboard
 * GET /users/dashboard
 */
router.get(
    '/users/dashboard',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.analytics),
    // cacheManager.getFromCache('user_dashboard', 300), // 5 minute cache
    validateAccess('user.dashboard', { roles: ['admin', 'manager'] }),
    operationLogger('user_dashboard'),
    UserController.getUserAnalytics
);

/**
 * Get user statistics and metrics
 * GET /users/statistics
 */
router.get(
    '/users/statistics',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.analytics),
    // cacheManager.getFromCache('user_statistics', 600), // 10 minute cache
    validateAccess('user.statistics', { roles: ['admin', 'manager'] }),
    operationLogger('user_statistics'),
    UserController.getUserAnalytics
);

/**
 * Perform security assessment for user
 * GET /users/:userId/security/assessment
 */
router.get(
    '/users/:userId/security/assessment',
    // authenticate,
    // authorize(['admin', 'security_admin']),
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('user.security_assessment', { allowSelfAccess: true, roles: ['admin', 'security_admin'] }),
    operationLogger('user_security_assessment'),
    UserController.performSecurityAssessment
);

/**
 * Get user activity timeline
 * GET /users/:userId/activity
 */
router.get(
    '/users/:userId/activity',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('user_activity', 180), // 3 minute cache
    validateAccess('user.activity', { allowSelfAccess: true, roles: ['admin', 'manager'] }),
    operationLogger('user_activity'),
    UserController.getUserActivityTimeline
);

/**
 * Get user compliance report
 * GET /users/:userId/compliance
 */
router.get(
    '/users/:userId/compliance',
    // authenticate,
    // authorize(['admin', 'compliance_admin']),
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('user.compliance', { roles: ['admin', 'compliance_admin'] }),
    operationLogger('user_compliance'),
    UserController.performSecurityAssessment
);

/**
 * Generate user audit trail
 * GET /users/:userId/audit
 */
router.get(
    '/users/:userId/audit',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('user.audit', { roles: ['admin', 'super_admin'] }),
    operationLogger('user_audit'),
    UserController.getUserActivityTimeline
);

// ================== USER HEALTH CHECK ROUTES ==================

/**
 * Check user account health
 * GET /users/:userId/health
 */
router.get(
    '/users/:userId/health',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('user.health', { allowSelfAccess: true }),
    operationLogger('user_health_check'),
    UserController.performSecurityAssessment
);

/**
 * Validate user data integrity
 * POST /users/:userId/validate
 */
router.post(
    '/users/:userId/validate',
    // authenticate,
    // authorize(['admin']),
    // rateLimiter(RATE_LIMITS.default),
    validateAccess('user.validate', { roles: ['admin'] }),
    operationLogger('user_data_validation'),
    UserController.getUserById
);

/**
 * Get user session information
 * GET /users/:userId/sessions
 */
router.get(
    '/users/:userId/sessions',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('user.sessions', { allowSelfAccess: true }),
    operationLogger('user_sessions'),
    UserController.getUserActivityTimeline
);

/**
 * Terminate user sessions
 * DELETE /users/:userId/sessions
 */
router.delete(
    '/users/:userId/sessions',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('user.terminate_sessions', { allowSelfAccess: true }),
    operationLogger('user_terminate_sessions'),
    UserController.logoutUser
);

module.exports = router;