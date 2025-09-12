'use strict';

/**
 * @fileoverview Enterprise user settings routes for comprehensive account management, security, and system configuration
 * @module servers/api/modules/user-management/routes/user-settings-routes
 * @requires express
 * @requires module:servers/api/modules/user-management/controllers/user-settings-controller
 * @requires module:shared/middleware/auth/authenticate
 * @requires module:shared/middleware/auth/authorize
 * @requires module:shared/middleware/validation/request-validator
 * @requires module:shared/middleware/security/rate-limiter
 * @requires module:shared/middleware/logging/operation-logger
 * @requires module:shared/middleware/validation/settings-validator
 * @requires module:shared/middleware/upload/file-upload
 * @requires module:shared/middleware/cache/cache-manager
 * @requires module:shared/middleware/compliance/audit-logger
 * @requires module:shared/middleware/security/csrf-protection
 * @requires module:shared/middleware/validation/sanitizer
 * @requires module:shared/middleware/encryption/data-encryption
 */

const express = require('express');
const router = express.Router();
const UserSettingsController = require('../controllers/user-settings-controller');

// Authentication and authorization middleware
// const authenticate = require('../../../../shared/middleware/auth/authenticate');
// const authorize = require('../../../../shared/middleware/auth/authorize');

// Validation middleware
// const RequestValidator = require('../../../../shared/middleware/validation/request-validator');
// const SettingsValidator = require('../../../../shared/middleware/validation/settings-validator');
// const sanitizer = require('../../../../shared/middleware/validation/sanitizer');

// Security middleware
// const rateLimiter = require('../../../../shared/middleware/security/rate-limiter');
// const csrfProtection = require('../../../../shared/middleware/security/csrf-protection');
// const dataEncryption = require('../../../../shared/middleware/encryption/data-encryption');

// Operational middleware
// const operationLogger = require('../../../../shared/middleware/logging/operation-logger');
// const auditLogger = require('../../../../shared/middleware/compliance/audit-logger');
// const cacheManager = require('../../../../shared/middleware/cache/cache-manager');

// File upload middleware
// const fileUpload = require('../../../../shared/middleware/upload/file-upload');

/**
 * Rate limiting configuration for settings operations
 * @constant {Object} RATE_LIMITS
 */
const RATE_LIMITS = {
    default: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 60, // conservative limit for settings
        message: 'Too many settings requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    read: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // higher limit for reading settings
        message: 'Too many settings read requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    write: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 30, // lower limit for writing settings
        message: 'Too many settings write requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    critical: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5, // very low limit for critical operations
        message: 'Too many critical settings operations, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    bulk: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 2, // very limited bulk operations
        message: 'Too many bulk settings operations, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    security: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // limited security configuration changes
        message: 'Too many security settings requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    analytics: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 15, // limited analytics requests
        message: 'Too many settings analytics requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    export: {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        max: 3, // very limited export operations
        message: 'Too many settings export requests, please try again tomorrow.',
        standardHeaders: true,
        legacyHeaders: false
    },
    import: {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        max: 2, // very limited import operations
        message: 'Too many settings import requests, please try again tomorrow.',
        standardHeaders: true,
        legacyHeaders: false
    },
    compliance: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20, // moderate limit for compliance operations
        message: 'Too many compliance settings requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    integration: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 8, // limited integration setup attempts
        message: 'Too many integration setup requests, please try again later.',
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
        'update': 4,
        'delete': 5,
        'security': 6,
        'compliance': 5,
        'integration': 7,
        'bulk': 9,
        'analytics': 4,
        'export': 6,
        'import': 8,
        'reset': 7,
        'validate': 3,
        'clone': 8
    };

    let cost = baseCosts[operation] || 1;

    // Adjust cost based on parameters
    if (params.includeSecrets) {
        cost += 3;
    }

    if (params.encryptionRequired) {
        cost += 2;
    }

    if (params.complianceValidation) {
        cost += 2;
    }

    if (params.bulkOperation && params.itemCount) {
        cost += Math.min(params.itemCount / 10, 4);
    }

    if (params.crossOrganization) {
        cost += 2;
    }

    if (params.requiresApproval) {
        cost += 1;
    }

    if (params.integrationComplexity === 'high') {
        cost += 3;
    }

    return Math.min(Math.ceil(cost), 10);
}

/**
 * Operation logger middleware for settings routes
 * @param {string} operation - Operation name
 * @returns {Function} Middleware function
 */
function operationLogger(operation) {
    return (req, res, next) => {
        const startTime = Date.now();
        const cost = calculateOperationCost(operation, {
            includeSecrets: req.query?.includeSecrets === 'true',
            encryptionRequired: req.body?.encrypted === true,
            complianceValidation: req.query?.checkCompliance === 'true',
            bulkOperation: operation.includes('bulk'),
            itemCount: req.body?.updates?.length || 1,
            crossOrganization: req.body?.organizationId !== req.user?.organizationId,
            requiresApproval: req.query?.requireApproval === 'true',
            integrationComplexity: req.body?.complexity || 'medium'
        });

        // Log operation start
        req.operationContext = {
            operation,
            startTime,
            cost,
            userId: req.user?.id || 'anonymous',
            targetUserId: req.params?.userId || req.body?.userId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            correlationId: req.headers['x-correlation-id'] || require('crypto').randomUUID(),
            sensitiveOperation: operation.includes('security') || operation.includes('compliance')
        };

        // Override res.json to log completion
        const originalJson = res.json;
        res.json = function(body) {
            const duration = Date.now() - startTime;
            
            // Log operation completion (mask sensitive data)
            const logData = {
                ...req.operationContext,
                duration,
                statusCode: res.statusCode,
                success: res.statusCode < 400,
                responseSize: JSON.stringify(body).length
            };

            // Mask sensitive response data for security operations
            if (req.operationContext.sensitiveOperation) {
                logData.responsePreview = '[SENSITIVE_DATA_MASKED]';
            }

            console.log(`Settings Operation: ${operation}`, logData);

            return originalJson.call(this, body);
        };

        next();
    };
}

/**
 * Access validation middleware for settings operations
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

            // Settings admin validation
            if (options.requireSettingsAdmin && !userRoles.includes('settings_admin')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Settings administrator role required',
                    code: 'SETTINGS_ADMIN_REQUIRED'
                });
            }

            // Security admin validation for security settings
            if (options.requireSecurityAdmin && !userRoles.includes('security_admin')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Security administrator role required',
                    code: 'SECURITY_ADMIN_REQUIRED'
                });
            }

            // Compliance admin validation for compliance settings
            if (options.requireComplianceAdmin && !userRoles.includes('compliance_admin')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Compliance administrator role required',
                    code: 'COMPLIANCE_ADMIN_REQUIRED'
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
 * Data validation middleware for settings operations
 * @param {string} validationType - Type of validation to perform
 * @returns {Function} Middleware function
 */
function validateSettingsData(validationType) {
    return (req, res, next) => {
        try {
            switch (validationType) {
                case 'create':
                    validateSettingsCreation(req.body);
                    break;
                case 'update':
                    validateSettingsUpdate(req.body);
                    break;
                case 'security':
                    validateSecuritySettings(req.body);
                    break;
                case 'integration':
                    validateIntegrationSettings(req.body, req.params.integrationType);
                    break;
                case 'compliance':
                    validateComplianceSettings(req.body);
                    break;
                case 'bulk':
                    validateBulkOperation(req.body);
                    break;
                case 'export':
                    validateExportParams(req.query);
                    break;
                case 'import':
                    validateImportData(req.body);
                    break;
                case 'clone':
                    validateCloneParams(req.params, req.query);
                    break;
                default:
                    break;
            }
            next();
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Settings validation failed',
                error: error.message,
                validationType
            });
        }
    };
}

/**
 * Validate settings creation data
 * @param {Object} data - Settings creation data
 */
function validateSettingsCreation(data) {
    if (!data.organizationId || typeof data.organizationId !== 'string') {
        throw new Error('Valid organization ID is required');
    }

    if (data.template && !['standard', 'enterprise', 'developer'].includes(data.template)) {
        throw new Error('Invalid template type');
    }

    if (data.inheritFromOrg !== undefined && typeof data.inheritFromOrg !== 'boolean') {
        throw new Error('inheritFromOrg must be a boolean value');
    }
}

/**
 * Validate settings update data
 * @param {Object} data - Settings update data
 */
function validateSettingsUpdate(data) {
    if (!data || Object.keys(data).length === 0) {
        throw new Error('No update data provided');
    }

    const validCategories = [
        'security', 'privacy', 'notifications', 'integrations', 
        'billing', 'api', 'compliance', 'data', 'features'
    ];

    for (const [key, value] of Object.entries(data)) {
        if (!validCategories.includes(key)) {
            throw new Error(`Invalid settings category: ${key}`);
        }

        if (value && typeof value !== 'object') {
            throw new Error(`Settings category ${key} must be an object`);
        }
    }
}

/**
 * Validate security settings
 * @param {Object} data - Security settings data
 */
function validateSecuritySettings(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Security configuration must be an object');
    }

    const validSecurityCategories = ['password', 'twoFactor', 'sessions', 'access', 'monitoring'];
    const invalidCategories = Object.keys(data).filter(cat => !validSecurityCategories.includes(cat));

    if (invalidCategories.length > 0) {
        throw new Error(`Invalid security categories: ${invalidCategories.join(', ')}`);
    }

    // Validate password policy
    if (data.password) {
        if (data.password.minLength && (data.password.minLength < 6 || data.password.minLength > 128)) {
            throw new Error('Password minimum length must be between 6 and 128 characters');
        }
        
        if (data.password.changeFrequency && (data.password.changeFrequency < 30 || data.password.changeFrequency > 365)) {
            throw new Error('Password change frequency must be between 30 and 365 days');
        }
    }

    // Validate MFA settings
    if (data.twoFactor) {
        const validMfaMethods = ['totp', 'sms', 'email', 'hardware_key', 'backup_codes'];
        if (data.twoFactor.methods && Array.isArray(data.twoFactor.methods)) {
            const invalidMethods = data.twoFactor.methods.filter(method => !validMfaMethods.includes(method));
            if (invalidMethods.length > 0) {
                throw new Error(`Invalid MFA methods: ${invalidMethods.join(', ')}`);
            }
        }
    }

    // Validate session settings
    if (data.sessions) {
        if (data.sessions.maxConcurrentSessions && (data.sessions.maxConcurrentSessions < 1 || data.sessions.maxConcurrentSessions > 20)) {
            throw new Error('Max concurrent sessions must be between 1 and 20');
        }

        if (data.sessions.maxDuration && (data.sessions.maxDuration < 1 || data.sessions.maxDuration > 24)) {
            throw new Error('Session max duration must be between 1 and 24 hours');
        }
    }
}

/**
 * Validate integration settings
 * @param {Object} data - Integration settings data
 * @param {string} integrationType - Type of integration
 */
function validateIntegrationSettings(data, integrationType) {
    const validIntegrationTypes = ['oauth', 'sso', 'ldap', 'api', 'webhook', 'smtp'];
    if (integrationType && !validIntegrationTypes.includes(integrationType)) {
        throw new Error('Invalid integration type');
    }

    if (!data || typeof data !== 'object') {
        throw new Error('Integration configuration must be an object');
    }

    // Type-specific validations
    if (integrationType === 'oauth') {
        const requiredFields = ['provider', 'clientId'];
        const missingFields = requiredFields.filter(field => !data[field]);
        if (missingFields.length > 0) {
            throw new Error(`Missing OAuth fields: ${missingFields.join(', ')}`);
        }
    }

    if (integrationType === 'smtp') {
        const requiredFields = ['host', 'port', 'username'];
        const missingFields = requiredFields.filter(field => !data[field]);
        if (missingFields.length > 0) {
            throw new Error(`Missing SMTP fields: ${missingFields.join(', ')}`);
        }

        if (data.port < 1 || data.port > 65535) {
            throw new Error('Invalid SMTP port');
        }
    }

    if (integrationType === 'webhook') {
        if (!data.url || typeof data.url !== 'string') {
            throw new Error('Valid webhook URL is required');
        }

        if (data.timeout && (data.timeout < 1000 || data.timeout > 30000)) {
            throw new Error('Webhook timeout must be between 1000ms and 30000ms');
        }
    }
}

/**
 * Validate compliance settings
 * @param {Object} data - Compliance settings data
 */
function validateComplianceSettings(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Compliance configuration must be an object');
    }

    const validComplianceTypes = ['gdpr', 'ccpa', 'hipaa', 'sox', 'pci', 'marketing'];
    const invalidTypes = Object.keys(data).filter(type => !validComplianceTypes.includes(type));

    if (invalidTypes.length > 0) {
        throw new Error(`Invalid compliance types: ${invalidTypes.join(', ')}`);
    }

    // Validate GDPR configuration
    if (data.gdpr) {
        if (typeof data.gdpr.consentGiven !== 'boolean') {
            throw new Error('GDPR consent must be explicitly boolean');
        }

        if (data.gdpr.dataRetentionPeriod) {
            const retention = parseInt(data.gdpr.dataRetentionPeriod, 10);
            if (isNaN(retention) || retention < 1 || retention > 2555) {
                throw new Error('GDPR data retention period must be between 1 and 2555 days');
            }
        }
    }

    // Validate CCPA configuration
    if (data.ccpa && typeof data.ccpa.optOut !== 'boolean') {
        throw new Error('CCPA opt-out must be boolean');
    }
}

/**
 * Validate bulk operation data
 * @param {Object} data - Bulk operation data
 */
function validateBulkOperation(data) {
    if (!data.updates || !Array.isArray(data.updates)) {
        throw new Error('Updates array is required for bulk operations');
    }

    if (data.updates.length === 0) {
        throw new Error('Bulk operation requires non-empty updates array');
    }

    if (data.updates.length > 500) {
        throw new Error('Bulk operation exceeds maximum limit of 500 updates');
    }

    // Validate each update item structure
    for (let i = 0; i < Math.min(data.updates.length, 10); i++) {
        const update = data.updates[i];
        if (!update.userId) {
            throw new Error(`Update item at index ${i} missing userId`);
        }
        if (!update.settings || Object.keys(update.settings).length === 0) {
            throw new Error(`Update item at index ${i} missing settings data`);
        }
    }
}

/**
 * Validate export parameters
 * @param {Object} query - Export query parameters
 */
function validateExportParams(query) {
    if (query.format) {
        const validFormats = ['json', 'yaml', 'xml', 'csv'];
        if (!validFormats.includes(query.format)) {
            throw new Error('Invalid export format');
        }
    }

    if (query.categories) {
        const categories = typeof query.categories === 'string' 
            ? query.categories.split(',') 
            : query.categories;
        
        const validCategories = [
            'security', 'privacy', 'notifications', 'integrations', 
            'billing', 'api', 'compliance', 'data', 'features'
        ];
        
        const invalidCategories = categories.filter(cat => !validCategories.includes(cat.trim()));
        if (invalidCategories.length > 0) {
            throw new Error(`Invalid export categories: ${invalidCategories.join(', ')}`);
        }
    }
}

/**
 * Validate import data
 * @param {Object} data - Import data
 */
function validateImportData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid import data format');
    }

    if (!data.data && !data.settings) {
        throw new Error('Import data must contain data or settings field');
    }

    const validStrategies = ['merge', 'replace', 'append'];
    const mergeStrategy = data.mergeStrategy || 'merge';
    if (!validStrategies.includes(mergeStrategy)) {
        throw new Error(`Invalid merge strategy. Must be one of: ${validStrategies.join(', ')}`);
    }
}

/**
 * Validate clone parameters
 * @param {Object} params - Route parameters
 * @param {Object} query - Query parameters
 */
function validateCloneParams(params, query) {
    const { sourceUserId, targetUserId } = params;

    if (!sourceUserId || !targetUserId) {
        throw new Error('Source and target user IDs are required');
    }

    if (sourceUserId === targetUserId) {
        throw new Error('Source and target users cannot be the same');
    }

    if (query.categories) {
        const categories = typeof query.categories === 'string' 
            ? query.categories.split(',') 
            : query.categories;
        
        const validCategories = [
            'security', 'privacy', 'notifications', 'integrations', 
            'billing', 'api', 'compliance', 'data', 'features'
        ];
        
        const invalidCategories = categories.filter(cat => !validCategories.includes(cat.trim()));
        if (invalidCategories.length > 0) {
            throw new Error(`Invalid clone categories: ${invalidCategories.join(', ')}`);
        }
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
// router.use(auditLogger('settings-management'));

// Apply data encryption for sensitive operations
// router.use(dataEncryption.encryptSensitiveData);

// ================== GENERAL SETTINGS ROUTES ==================

/**
 * Create default user settings
 * POST /settings/defaults
 */
router.post(
    '/settings/defaults',
    // authenticate,
    // authorize(['admin', 'settings_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validateDefaultCreation,
    validateAccess('settings.create_defaults', { roles: ['admin', 'settings_admin'] }),
    validateSettingsData('create'),
    operationLogger('settings_create_defaults'),
    UserSettingsController.createDefaultSettings
);

/**
 * Create default settings for specific user
 * POST /settings/:userId/defaults
 */
router.post(
    '/settings/:userId/defaults',
    // authenticate,
    // authorize(['admin', 'settings_admin']),
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.create_user_defaults', { allowSelfAccess: true, roles: ['admin', 'settings_admin'] }),
    validateSettingsData('create'),
    operationLogger('settings_create_user_defaults'),
    UserSettingsController.createDefaultSettings
);

/**
 * Get user settings with optional filtering and population
 * GET /settings/:userId
 */
router.get(
    '/settings/:userId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('user_settings', 300), // 5 minute cache
    validateAccess('settings.read', { allowSelfAccess: true }),
    operationLogger('settings_read'),
    UserSettingsController.getSettings
);

/**
 * Get current user settings
 * GET /settings/me
 */
router.get(
    '/settings/me',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('my_settings', 180), // 3 minute cache
    validateAccess('settings.read_self', { allowSelfAccess: true }),
    operationLogger('settings_read_self'),
    UserSettingsController.getSettings
);

/**
 * Update user settings with comprehensive validation
 * PUT /settings/:userId
 */
router.put(
    '/settings/:userId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validateSettingsUpdate,
    // auditLogger('settings_update'),
    validateAccess('settings.update', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_update'),
    UserSettingsController.updateSettings
);

/**
 * Update current user settings
 * PUT /settings/me
 */
router.put(
    '/settings/me',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validateSettingsUpdate,
    validateAccess('settings.update_self', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_update_self'),
    UserSettingsController.updateSettings
);

// ================== SECURITY SETTINGS ROUTES ==================

/**
 * Configure security settings with advanced validation
 * POST /settings/:userId/security
 */
router.post(
    '/settings/:userId/security',
    // authenticate,
    // authorize(['admin', 'security_admin']),
    // rateLimiter(RATE_LIMITS.security),
    // SettingsValidator.validateSecuritySettings,
    // auditLogger('security_settings_change'),
    validateAccess('settings.configure_security', { allowSelfAccess: true, requireSecurityAdmin: true }),
    validateSettingsData('security'),
    operationLogger('settings_configure_security'),
    UserSettingsController.configureSecuritySettings
);

/**
 * Update password policy
 * PUT /settings/:userId/security/password
 */
router.put(
    '/settings/:userId/security/password',
    // authenticate,
    // rateLimiter(RATE_LIMITS.security),
    // auditLogger('password_policy_update'),
    validateAccess('settings.update_password_policy', { allowSelfAccess: true, requireSecurityAdmin: true }),
    validateSettingsData('security'),
    operationLogger('settings_update_password_policy'),
    UserSettingsController.configureSecuritySettings
);

/**
 * Configure MFA settings
 * PUT /settings/:userId/security/mfa
 */
router.put(
    '/settings/:userId/security/mfa',
    // authenticate,
    // rateLimiter(RATE_LIMITS.security),
    // auditLogger('mfa_settings_update'),
    validateAccess('settings.configure_mfa', { allowSelfAccess: true }),
    validateSettingsData('security'),
    operationLogger('settings_configure_mfa'),
    UserSettingsController.configureSecuritySettings
);

/**
 * Configure session settings
 * PUT /settings/:userId/security/sessions
 */
router.put(
    '/settings/:userId/security/sessions',
    // authenticate,
    // rateLimiter(RATE_LIMITS.security),
    // auditLogger('session_settings_update'),
    validateAccess('settings.configure_sessions', { allowSelfAccess: true, requireSecurityAdmin: true }),
    validateSettingsData('security'),
    operationLogger('settings_configure_sessions'),
    UserSettingsController.configureSecuritySettings
);

/**
 * Configure access controls
 * PUT /settings/:userId/security/access
 */
router.put(
    '/settings/:userId/security/access',
    // authenticate,
    // authorize(['admin', 'security_admin']),
    // rateLimiter(RATE_LIMITS.security),
    // auditLogger('access_control_update'),
    validateAccess('settings.configure_access', { requireSecurityAdmin: true }),
    validateSettingsData('security'),
    operationLogger('settings_configure_access'),
    UserSettingsController.configureSecuritySettings
);

// ================== PRIVACY SETTINGS ROUTES ==================

/**
 * Configure privacy settings
 * PUT /settings/:userId/privacy
 */
router.put(
    '/settings/:userId/privacy',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validatePrivacySettings,
    validateAccess('settings.configure_privacy', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_privacy'),
    UserSettingsController.updateSettings
);

/**
 * Update data sharing preferences
 * PUT /settings/:userId/privacy/data-sharing
 */
router.put(
    '/settings/:userId/privacy/data-sharing',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('data_sharing_update'),
    validateAccess('settings.update_data_sharing', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_update_data_sharing'),
    UserSettingsController.updateSettings
);

/**
 * Configure profile visibility
 * PUT /settings/:userId/privacy/visibility
 */
router.put(
    '/settings/:userId/privacy/visibility',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.configure_visibility', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_visibility'),
    UserSettingsController.updateSettings
);

// ================== NOTIFICATION SETTINGS ROUTES ==================

/**
 * Configure notification settings
 * PUT /settings/:userId/notifications
 */
router.put(
    '/settings/:userId/notifications',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validateNotificationSettings,
    validateAccess('settings.configure_notifications', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_notifications'),
    UserSettingsController.updateSettings
);

/**
 * Update email notification preferences
 * PUT /settings/:userId/notifications/email
 */
router.put(
    '/settings/:userId/notifications/email',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.update_email_notifications', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_update_email_notifications'),
    UserSettingsController.updateSettings
);

/**
 * Update push notification preferences
 * PUT /settings/:userId/notifications/push
 */
router.put(
    '/settings/:userId/notifications/push',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.update_push_notifications', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_update_push_notifications'),
    UserSettingsController.updateSettings
);

/**
 * Configure notification devices
 * PUT /settings/:userId/notifications/devices
 */
router.put(
    '/settings/:userId/notifications/devices',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.configure_notification_devices', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_notification_devices'),
    UserSettingsController.updateSettings
);

// ================== INTEGRATION ROUTES ==================

/**
 * Setup and configure integrations with external services
 * POST /settings/:userId/integrations/:integrationType
 */
router.post(
    '/settings/:userId/integrations/:integrationType',
    // authenticate,
    // rateLimiter(RATE_LIMITS.integration),
    // SettingsValidator.validateIntegrationSetup,
    // auditLogger('integration_setup'),
    validateAccess('settings.setup_integration', { allowSelfAccess: true }),
    validateSettingsData('integration'),
    operationLogger('settings_setup_integration'),
    UserSettingsController.setupIntegration
);

/**
 * Update integration configuration
 * PUT /settings/:userId/integrations/:integrationType
 */
router.put(
    '/settings/:userId/integrations/:integrationType',
    // authenticate,
    // rateLimiter(RATE_LIMITS.integration),
    // auditLogger('integration_update'),
    validateAccess('settings.update_integration', { allowSelfAccess: true }),
    validateSettingsData('integration'),
    operationLogger('settings_update_integration'),
    UserSettingsController.setupIntegration
);

/**
 * Delete integration
 * DELETE /settings/:userId/integrations/:integrationType
 */
router.delete(
    '/settings/:userId/integrations/:integrationType',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('integration_deletion'),
    validateAccess('settings.delete_integration', { allowSelfAccess: true }),
    operationLogger('settings_delete_integration'),
    UserSettingsController.updateSettings
);

/**
 * Test integration connection
 * POST /settings/:userId/integrations/:integrationType/test
 */
router.post(
    '/settings/:userId/integrations/:integrationType/test',
    // authenticate,
    // rateLimiter(RATE_LIMITS.integration),
    validateAccess('settings.test_integration', { allowSelfAccess: true }),
    operationLogger('settings_test_integration'),
    UserSettingsController.setupIntegration
);

/**
 * Get integration status
 * GET /settings/:userId/integrations/:integrationType/status
 */
router.get(
    '/settings/:userId/integrations/:integrationType/status',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('settings.get_integration_status', { allowSelfAccess: true }),
    operationLogger('settings_get_integration_status'),
    UserSettingsController.getSettings
);

// ================== API MANAGEMENT ROUTES ==================

/**
 * Configure API settings
 * PUT /settings/:userId/api
 */
router.put(
    '/settings/:userId/api',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validateAPISettings,
    validateAccess('settings.configure_api', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_api'),
    UserSettingsController.updateSettings
);

/**
 * Generate API key
 * POST /settings/:userId/api/keys
 */
router.post(
    '/settings/:userId/api/keys',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('api_key_generation'),
    validateAccess('settings.generate_api_key', { allowSelfAccess: true }),
    operationLogger('settings_generate_api_key'),
    UserSettingsController.updateSettings
);

/**
 * Revoke API key
 * DELETE /settings/:userId/api/keys/:keyId
 */
router.delete(
    '/settings/:userId/api/keys/:keyId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('api_key_revocation'),
    validateAccess('settings.revoke_api_key', { allowSelfAccess: true }),
    operationLogger('settings_revoke_api_key'),
    UserSettingsController.updateSettings
);

/**
 * Configure API rate limits
 * PUT /settings/:userId/api/rate-limits
 */
router.put(
    '/settings/:userId/api/rate-limits',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.configure_api_rate_limits', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_api_rate_limits'),
    UserSettingsController.updateSettings
);

// ================== DATA MANAGEMENT ROUTES ==================

/**
 * Configure data retention settings
 * PUT /settings/:userId/data/retention
 */
router.put(
    '/settings/:userId/data/retention',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // SettingsValidator.validateDataRetention,
    // auditLogger('data_retention_update'),
    validateAccess('settings.configure_data_retention', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_data_retention'),
    UserSettingsController.updateSettings
);

/**
 * Configure backup settings
 * PUT /settings/:userId/data/backup
 */
router.put(
    '/settings/:userId/data/backup',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('settings.configure_backup', { allowSelfAccess: true }),
    validateSettingsData('update'),
    operationLogger('settings_configure_backup'),
    UserSettingsController.updateSettings
);

/**
 * Request data export
 * POST /settings/:userId/data/export
 */
router.post(
    '/settings/:userId/data/export',
    // authenticate,
    // rateLimiter(RATE_LIMITS.export),
    // auditLogger('data_export_request'),
    validateAccess('settings.request_data_export', { allowSelfAccess: true }),
    operationLogger('settings_request_data_export'),
    UserSettingsController.exportSettings
);

/**
 * Request data deletion
 * POST /settings/:userId/data/delete
 */
router.post(
    '/settings/:userId/data/delete',
    // authenticate,
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('data_deletion_request'),
    validateAccess('settings.request_data_deletion', { allowSelfAccess: true }),
    operationLogger('settings_request_data_deletion'),
    UserSettingsController.updateSettings
);

// ================== COMPLIANCE ROUTES ==================

/**
 * Configure compliance settings for regulatory requirements
 * POST /settings/:userId/compliance
 */
router.post(
    '/settings/:userId/compliance',
    // authenticate,
    // rateLimiter(RATE_LIMITS.compliance),
    // SettingsValidator.validateComplianceSettings,
    // auditLogger('compliance_configuration'),
    validateAccess('settings.configure_compliance', { allowSelfAccess: true, requireComplianceAdmin: true }),
    validateSettingsData('compliance'),
    operationLogger('settings_configure_compliance'),
    UserSettingsController.configureCompliance
);

/**
 * Update GDPR settings
 * PUT /settings/:userId/compliance/gdpr
 */
router.put(
    '/settings/:userId/compliance/gdpr',
    // authenticate,
    // rateLimiter(RATE_LIMITS.compliance),
    // auditLogger('gdpr_settings_update'),
    validateAccess('settings.update_gdpr', { allowSelfAccess: true }),
    validateSettingsData('compliance'),
    operationLogger('settings_update_gdpr'),
    UserSettingsController.configureCompliance
);

/**
 * Update CCPA settings
 * PUT /settings/:userId/compliance/ccpa
 */
router.put(
    '/settings/:userId/compliance/ccpa',
    // authenticate,
    // rateLimiter(RATE_LIMITS.compliance),
    // auditLogger('ccpa_settings_update'),
    validateAccess('settings.update_ccpa', { allowSelfAccess: true }),
    validateSettingsData('compliance'),
    operationLogger('settings_update_ccpa'),
    UserSettingsController.configureCompliance
);

/**
 * Configure marketing consent
 * PUT /settings/:userId/compliance/marketing
 */
router.put(
    '/settings/:userId/compliance/marketing',
    // authenticate,
    // rateLimiter(RATE_LIMITS.compliance),
    // auditLogger('marketing_consent_update'),
    validateAccess('settings.configure_marketing_consent', { allowSelfAccess: true }),
    validateSettingsData('compliance'),
    operationLogger('settings_configure_marketing_consent'),
    UserSettingsController.configureCompliance
);

// ================== SETTINGS EXPORT/IMPORT ROUTES ==================

/**
 * Export user settings for backup or migration
 * GET /settings/:userId/export
 */
router.get(
    '/settings/:userId/export',
    // authenticate,
    // rateLimiter(RATE_LIMITS.export),
    // auditLogger('settings_export'),
    validateAccess('settings.export', { allowSelfAccess: true, roles: ['admin', 'settings_admin'] }),
    validateSettingsData('export'),
    operationLogger('settings_export'),
    UserSettingsController.exportSettings
);

/**
 * Import settings from backup or migration data
 * POST /settings/:userId/import
 */
router.post(
    '/settings/:userId/import',
    // authenticate,
    // rateLimiter(RATE_LIMITS.import),
    // SettingsValidator.validateSettingsImport,
    // auditLogger('settings_import'),
    validateAccess('settings.import', { allowSelfAccess: true, roles: ['admin', 'settings_admin'] }),
    validateSettingsData('import'),
    operationLogger('settings_import'),
    UserSettingsController.importSettings
);

// ================== SETTINGS ANALYTICS ROUTES ==================

/**
 * Get comprehensive settings analytics and reports
 * GET /settings/:userId/analytics
 */
router.get(
    '/settings/:userId/analytics',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    // cacheManager.getFromCache('settings_analytics', 900), // 15 minute cache
    validateAccess('settings.analytics', { allowSelfAccess: true, roles: ['admin', 'settings_admin'] }),
    operationLogger('settings_analytics'),
    UserSettingsController.getSettingsAnalytics
);

/**
 * Get settings compliance report
 * GET /settings/:userId/compliance/report
 */
router.get(
    '/settings/:userId/compliance/report',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('settings.compliance_report', { allowSelfAccess: true, requireComplianceAdmin: true }),
    operationLogger('settings_compliance_report'),
    UserSettingsController.getSettingsAnalytics
);

/**
 * Get security settings audit
 * GET /settings/:userId/security/audit
 */
router.get(
    '/settings/:userId/security/audit',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('settings.security_audit', { allowSelfAccess: true, requireSecurityAdmin: true }),
    operationLogger('settings_security_audit'),
    UserSettingsController.getSettingsAnalytics
);

// ================== BULK OPERATIONS ROUTES ==================

/**
 * Perform bulk settings updates across multiple users
 * POST /settings/bulk/update
 */
router.post(
    '/settings/bulk/update',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    // SettingsValidator.validateBulkUpdate,
    // auditLogger('bulk_settings_update'),
    validateAccess('settings.bulk_update', { roles: ['admin', 'super_admin'] }),
    validateSettingsData('bulk'),
    operationLogger('settings_bulk_update'),
    UserSettingsController.bulkUpdateSettings
);

/**
 * Bulk export settings for multiple users
 * POST /settings/bulk/export
 */
router.post(
    '/settings/bulk/export',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.export),
    // auditLogger('bulk_settings_export'),
    validateAccess('settings.bulk_export', { roles: ['admin', 'super_admin'] }),
    operationLogger('settings_bulk_export'),
    UserSettingsController.exportSettings
);

// ================== SETTINGS MANAGEMENT ROUTES ==================

/**
 * Reset user settings to default values
 * POST /settings/:userId/reset
 */
router.post(
    '/settings/:userId/reset',
    // authenticate,
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('settings_reset'),
    validateAccess('settings.reset', { allowSelfAccess: true, roles: ['admin'] }),
    operationLogger('settings_reset'),
    UserSettingsController.resetSettings
);

/**
 * Validate settings configuration and compliance
 * POST /settings/:userId/validate
 */
router.post(
    '/settings/:userId/validate',
    // authenticate,
    // rateLimiter(RATE_LIMITS.default),
    validateAccess('settings.validate', { allowSelfAccess: true }),
    operationLogger('settings_validate'),
    UserSettingsController.validateSettings
);

/**
 * Clone settings from one user to another
 * POST /settings/clone/:sourceUserId/:targetUserId
 */
router.post(
    '/settings/clone/:sourceUserId/:targetUserId',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // auditLogger('settings_clone'),
    validateAccess('settings.clone', { roles: ['admin', 'super_admin'] }),
    validateSettingsData('clone'),
    operationLogger('settings_clone'),
    UserSettingsController.cloneSettings
);

/**
 * Get settings version history
 * GET /settings/:userId/history
 */
router.get(
    '/settings/:userId/history',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('settings.history', { allowSelfAccess: true, roles: ['admin'] }),
    operationLogger('settings_history'),
    UserSettingsController.getSettingsAnalytics
);

/**
 * Restore settings from version
 * POST /settings/:userId/restore/:versionId
 */
router.post(
    '/settings/:userId/restore/:versionId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.critical),
    // auditLogger('settings_restore'),
    validateAccess('settings.restore', { allowSelfAccess: true, roles: ['admin'] }),
    operationLogger('settings_restore'),
    UserSettingsController.importSettings
);

module.exports = router;