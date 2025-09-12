'use strict';

/**
 * @fileoverview Enterprise user preferences routes for UI/UX customization, notifications, localization, and accessibility
 * @module servers/api/modules/user-management/routes/user-preferences-routes
 * @requires express
 * @requires module:servers/api/modules/user-management/controllers/user-preferences-controller
 * @requires module:shared/middleware/auth/authenticate
 * @requires module:shared/middleware/auth/authorize
 * @requires module:shared/middleware/validation/request-validator
 * @requires module:shared/middleware/security/rate-limiter
 * @requires module:shared/middleware/logging/operation-logger
 * @requires module:shared/middleware/validation/preferences-validator
 * @requires module:shared/middleware/upload/file-upload
 * @requires module:shared/middleware/cache/cache-manager
 * @requires module:shared/middleware/compliance/audit-logger
 * @requires module:shared/middleware/security/csrf-protection
 * @requires module:shared/middleware/validation/sanitizer
 * @requires module:shared/middleware/realtime/sync-manager
 */

const express = require('express');
const router = express.Router();
const UserPreferencesController = require('../controllers/user-preferences-controller');

// Authentication and authorization middleware
// const authenticate = require('../../../../shared/middleware/auth/authenticate');
// const authorize = require('../../../../shared/middleware/auth/authorize');

// Validation middleware
// const RequestValidator = require('../../../../shared/middleware/validation/request-validator');
// const PreferencesValidator = require('../../../../shared/middleware/validation/preferences-validator');
// const sanitizer = require('../../../../shared/middleware/validation/sanitizer');

// Security middleware
// const rateLimiter = require('../../../../shared/middleware/security/rate-limiter');
// const csrfProtection = require('../../../../shared/middleware/security/csrf-protection');

// Operational middleware
// const operationLogger = require('../../../../shared/middleware/logging/operation-logger');
// const auditLogger = require('../../../../shared/middleware/compliance/audit-logger');
// const cacheManager = require('../../../../shared/middleware/cache/cache-manager');
// const syncManager = require('../../../../shared/middleware/realtime/sync-manager');

// File upload middleware
// const fileUpload = require('../../../../shared/middleware/upload/file-upload');

/**
 * Rate limiting configuration for preferences operations
 * @constant {Object} RATE_LIMITS
 */
const RATE_LIMITS = {
    default: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 80, // moderate limit for preferences
        message: 'Too many preferences requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    read: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 120, // higher limit for reading preferences
        message: 'Too many preferences read requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    write: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 60, // moderate limit for writing preferences
        message: 'Too many preferences write requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    theme: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 40, // limited theme changes
        message: 'Too many theme change requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    sync: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 30, // limited sync operations
        message: 'Too many sync requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    bulk: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // very limited bulk operations
        message: 'Too many bulk preferences operations, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    analytics: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20, // limited analytics requests
        message: 'Too many preferences analytics requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    export: {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        max: 5, // limited export operations
        message: 'Too many preferences export requests, please try again tomorrow.',
        standardHeaders: true,
        legacyHeaders: false
    },
    import: {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        max: 3, // very limited import operations
        message: 'Too many preferences import requests, please try again tomorrow.',
        standardHeaders: true,
        legacyHeaders: false
    },
    reset: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5, // limited reset operations
        message: 'Too many preferences reset requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
    },
    customization: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 50, // moderate customization changes
        message: 'Too many customization requests, please try again later.',
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
        'theme': 3,
        'notification': 2,
        'accessibility': 4,
        'localization': 3,
        'sync': 5,
        'bulk': 8,
        'analytics': 4,
        'export': 5,
        'import': 6,
        'reset': 6,
        'template': 4,
        'dashboard': 3
    };

    let cost = baseCosts[operation] || 1;

    // Adjust cost based on parameters
    if (params.syncRealtime) {
        cost += 2;
    }

    if (params.crossDevice) {
        cost += 1;
    }

    if (params.complexTheme) {
        cost += 2;
    }

    if (params.bulkOperation && params.itemCount) {
        cost += Math.min(params.itemCount / 20, 3);
    }

    if (params.includeAnalytics) {
        cost += 1;
    }

    if (params.customTemplate) {
        cost += 2;
    }

    if (params.accessibilityFeatures) {
        cost += 1;
    }

    if (params.multiLanguage) {
        cost += 1;
    }

    return Math.min(Math.ceil(cost), 10);
}

/**
 * Operation logger middleware for preferences routes
 * @param {string} operation - Operation name
 * @returns {Function} Middleware function
 */
function operationLogger(operation) {
    return (req, res, next) => {
        const startTime = Date.now();
        const cost = calculateOperationCost(operation, {
            syncRealtime: req.query?.syncRealtime === 'true',
            crossDevice: req.query?.excludeDeviceId || req.body?.devices,
            complexTheme: req.body?.mode === 'custom' || req.body?.colorScheme,
            bulkOperation: operation.includes('bulk'),
            itemCount: req.body?.updates?.length || 1,
            includeAnalytics: req.query?.includeAnalytics === 'true',
            customTemplate: req.body?.customThemeName || req.query?.saveAsCustom === 'true',
            accessibilityFeatures: Object.keys(req.body?.accessibility || {}).length > 0,
            multiLanguage: req.body?.language !== 'en'
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
            deviceId: req.headers['x-device-id'] || 'unknown'
        };

        // Override res.json to log completion
        const originalJson = res.json;
        res.json = function(body) {
            const duration = Date.now() - startTime;
            
            // Log operation completion
            console.log(`Preferences Operation: ${operation}`, {
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
 * Access validation middleware for preferences operations
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

            // Self-access validation (most common for preferences)
            if (userId && userId === requesterId && options.allowSelfAccess !== false) {
                return next();
            }

            // Default to self-access for preferences if no userId in params
            if (!userId && options.allowSelfAccess !== false) {
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

            // Admin access for organization-wide preferences
            if (options.requireAdmin && !userRoles.includes('admin')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Administrator role required',
                    code: 'ADMIN_REQUIRED'
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

            // Template admin validation for template management
            if (options.requireTemplateAdmin && !userRoles.includes('template_admin')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Template administrator role required',
                    code: 'TEMPLATE_ADMIN_REQUIRED'
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
 * Data validation middleware for preferences operations
 * @param {string} validationType - Type of validation to perform
 * @returns {Function} Middleware function
 */
function validatePreferencesData(validationType) {
    return (req, res, next) => {
        try {
            switch (validationType) {
                case 'create':
                    validatePreferencesCreation(req.body);
                    break;
                case 'update':
                    validatePreferencesUpdate(req.body);
                    break;
                case 'theme':
                    validateThemeConfiguration(req.body);
                    break;
                case 'notification':
                    validateNotificationConfiguration(req.body);
                    break;
                case 'accessibility':
                    validateAccessibilityConfiguration(req.body);
                    break;
                case 'localization':
                    validateLocalizationConfiguration(req.body);
                    break;
                case 'sync':
                    validateSyncConfiguration(req.body);
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
                default:
                    break;
            }
            next();
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Preferences validation failed',
                error: error.message,
                validationType
            });
        }
    };
}

/**
 * Validate preferences creation data
 * @param {Object} data - Preferences creation data
 */
function validatePreferencesCreation(data) {
    if (!data.organizationId || typeof data.organizationId !== 'string') {
        throw new Error('Valid organization ID is required');
    }

    if (data.template && !['standard', 'enterprise', 'accessibility', 'minimal'].includes(data.template)) {
        throw new Error('Invalid template type');
    }

    if (data.locale && !/^[a-z]{2}$/.test(data.locale)) {
        throw new Error('Invalid locale format. Must be a 2-letter language code');
    }
}

/**
 * Validate preferences update data
 * @param {Object} data - Preferences update data
 */
function validatePreferencesUpdate(data) {
    if (!data || Object.keys(data).length === 0) {
        throw new Error('No preference data provided for update');
    }

    const validCategories = ['interface', 'notifications', 'localization', 'accessibility'];
    for (const [key, value] of Object.entries(data)) {
        if (!validCategories.includes(key)) {
            throw new Error(`Invalid preference category: ${key}`);
        }

        if (value && typeof value !== 'object') {
            throw new Error(`Preference category ${key} must be an object`);
        }
    }
}

/**
 * Validate theme configuration
 * @param {Object} data - Theme configuration data
 */
function validateThemeConfiguration(data) {
    if (!data.mode || typeof data.mode !== 'string') {
        throw new Error('Theme mode is required');
    }

    const validModes = ['light', 'dark', 'auto', 'high_contrast', 'custom'];
    if (!validModes.includes(data.mode)) {
        throw new Error(`Invalid theme mode. Must be one of: ${validModes.join(', ')}`);
    }

    if (data.colorScheme) {
        for (const [colorName, colorValue] of Object.entries(data.colorScheme)) {
            if (colorValue && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(colorValue)) {
                throw new Error(`Invalid color value for ${colorName}: ${colorValue}`);
            }
        }
    }

    if (data.customThemeName && (data.customThemeName.length < 3 || data.customThemeName.length > 50)) {
        throw new Error('Custom theme name must be between 3 and 50 characters');
    }
}

/**
 * Validate notification configuration
 * @param {Object} data - Notification configuration data
 */
function validateNotificationConfiguration(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Notification configuration must be an object');
    }

    const supportedChannels = ['email', 'push', 'sms', 'inApp', 'webhook'];
    const invalidChannels = Object.keys(data).filter(channel => !supportedChannels.includes(channel));

    if (invalidChannels.length > 0) {
        throw new Error(`Invalid notification channels: ${invalidChannels.join(', ')}`);
    }

    // Validate email configuration
    if (data.email) {
        if (data.email.address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.address)) {
            throw new Error('Invalid email address for notifications');
        }

        const validFrequencies = ['immediate', 'hourly', 'daily', 'weekly', 'never'];
        if (data.email.frequency && !validFrequencies.includes(data.email.frequency)) {
            throw new Error(`Invalid email frequency. Must be one of: ${validFrequencies.join(', ')}`);
        }

        if (data.email.quietHours) {
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (data.email.quietHours.startTime && !timeRegex.test(data.email.quietHours.startTime)) {
                throw new Error('Invalid quiet hours start time format (use HH:MM)');
            }
            if (data.email.quietHours.endTime && !timeRegex.test(data.email.quietHours.endTime)) {
                throw new Error('Invalid quiet hours end time format (use HH:MM)');
            }
        }
    }

    // Validate push configuration
    if (data.push && data.push.devices && Array.isArray(data.push.devices)) {
        for (const device of data.push.devices) {
            if (!device.token || !device.platform) {
                throw new Error('Push device must have token and platform');
            }

            const validPlatforms = ['ios', 'android', 'web', 'macos', 'windows'];
            if (!validPlatforms.includes(device.platform)) {
                throw new Error(`Invalid device platform: ${device.platform}`);
            }
        }
    }

    // Validate SMS configuration
    if (data.sms && data.sms.phoneNumber) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        const cleanPhone = data.sms.phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!phoneRegex.test(cleanPhone)) {
            throw new Error('Invalid phone number format for SMS notifications');
        }
    }
}

/**
 * Validate accessibility configuration
 * @param {Object} data - Accessibility configuration data
 */
function validateAccessibilityConfiguration(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Accessibility configuration must be an object');
    }

    const supportedFeatures = ['screenReader', 'visual', 'motor', 'cognitive', 'keyboard'];
    const invalidFeatures = Object.keys(data).filter(feature => !supportedFeatures.includes(feature));

    if (invalidFeatures.length > 0) {
        throw new Error(`Invalid accessibility features: ${invalidFeatures.join(', ')}`);
    }

    // Validate visual accessibility settings
    if (data.visual) {
        if (data.visual.textScaling && data.visual.textScaling.factor) {
            const factor = parseFloat(data.visual.textScaling.factor);
            if (isNaN(factor) || factor < 0.8 || factor > 2.0) {
                throw new Error('Text scaling factor must be between 0.8 and 2.0');
            }
        }

        if (data.visual.colorBlindness && data.visual.colorBlindness.type) {
            const validTypes = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
            if (!validTypes.includes(data.visual.colorBlindness.type)) {
                throw new Error(`Invalid color blindness type. Must be one of: ${validTypes.join(', ')}`);
            }
        }
    }

    // Validate motor accessibility settings
    if (data.motor) {
        if (data.motor.clickDelay !== undefined) {
            const delay = parseInt(data.motor.clickDelay);
            if (isNaN(delay) || delay < 0 || delay > 1000) {
                throw new Error('Click delay must be between 0 and 1000 milliseconds');
            }
        }

        if (data.motor.targetSize) {
            const validSizes = ['normal', 'large', 'extra-large'];
            if (!validSizes.includes(data.motor.targetSize)) {
                throw new Error(`Invalid target size. Must be one of: ${validSizes.join(', ')}`);
            }
        }
    }

    // Validate cognitive accessibility settings
    if (data.cognitive) {
        if (data.cognitive.timeoutMultiplier !== undefined) {
            const validMultipliers = [1.5, 2.0, 3.0, 5.0];
            const multiplier = parseFloat(data.cognitive.timeoutMultiplier);
            if (!validMultipliers.includes(multiplier)) {
                throw new Error(`Invalid timeout multiplier. Must be one of: ${validMultipliers.join(', ')}`);
            }
        }

        if (data.cognitive.simplificationLevel) {
            const validLevels = ['none', 'moderate', 'high'];
            if (!validLevels.includes(data.cognitive.simplificationLevel)) {
                throw new Error(`Invalid simplification level. Must be one of: ${validLevels.join(', ')}`);
            }
        }
    }
}

/**
 * Validate localization configuration
 * @param {Object} data - Localization configuration data
 */
function validateLocalizationConfiguration(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Localization configuration must be an object');
    }

    // Validate language
    if (data.language && !/^[a-z]{2}$/.test(data.language)) {
        throw new Error('Invalid language code. Must be a 2-letter language code');
    }

    // Validate regional settings
    if (data.regional) {
        if (data.regional.timezone) {
            const timezoneRegex = /^[A-Za-z]+\/[A-Za-z_]+$/;
            if (!timezoneRegex.test(data.regional.timezone)) {
                throw new Error('Invalid timezone format');
            }
        }

        if (data.regional.country && data.regional.country.length !== 2) {
            throw new Error('Country code must be 2 characters (ISO 3166-1 alpha-2)');
        }
    }

    // Validate format preferences
    if (data.formats) {
        if (data.formats.dateFormat) {
            const validDateFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'];
            if (!validDateFormats.includes(data.formats.dateFormat)) {
                throw new Error(`Invalid date format. Must be one of: ${validDateFormats.join(', ')}`);
            }
        }

        if (data.formats.timeFormat) {
            const validTimeFormats = ['12h', '24h'];
            if (!validTimeFormats.includes(data.formats.timeFormat)) {
                throw new Error(`Invalid time format. Must be one of: ${validTimeFormats.join(', ')}`);
            }
        }

        if (data.formats.numberFormat) {
            const validNumberFormats = ['1,234.56', '1.234,56', '1 234,56', '1234.56'];
            if (!validNumberFormats.includes(data.formats.numberFormat)) {
                throw new Error(`Invalid number format. Must be one of: ${validNumberFormats.join(', ')}`);
            }
        }
    }

    // Validate currency preferences
    if (data.currency) {
        if (data.currency.code && !/^[A-Z]{3}$/.test(data.currency.code)) {
            throw new Error('Invalid currency code. Must be 3 uppercase letters (ISO 4217)');
        }

        if (data.currency.position) {
            const validPositions = ['before', 'after'];
            if (!validPositions.includes(data.currency.position)) {
                throw new Error(`Invalid currency position. Must be one of: ${validPositions.join(', ')}`);
            }
        }
    }
}

/**
 * Validate sync configuration
 * @param {Object} data - Sync configuration data
 */
function validateSyncConfiguration(data) {
    if (!data || Object.keys(data).length === 0) {
        throw new Error('No preferences data provided for sync');
    }

    const validResolutions = ['server_wins', 'client_wins', 'merge', 'prompt'];
    if (data.conflictResolution && !validResolutions.includes(data.conflictResolution)) {
        throw new Error(`Invalid conflict resolution. Must be one of: ${validResolutions.join(', ')}`);
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
        throw new Error('Bulk operation requires non-empty array');
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
        if (!update.preferences || Object.keys(update.preferences).length === 0) {
            throw new Error(`Update item at index ${i} missing preferences data`);
        }
    }
}

/**
 * Validate export parameters
 * @param {Object} query - Export query parameters
 */
function validateExportParams(query) {
    if (query.format) {
        const validFormats = ['json', 'xml', 'yaml'];
        if (!validFormats.includes(query.format)) {
            throw new Error(`Invalid export format. Must be one of: ${validFormats.join(', ')}`);
        }
    }

    if (query.categories) {
        const categories = typeof query.categories === 'string' 
            ? query.categories.split(',') 
            : query.categories;
        
        const validCategories = ['interface', 'notifications', 'localization', 'accessibility'];
        const invalidCategories = categories.filter(cat => !validCategories.includes(cat.trim()));
        if (invalidCategories.length > 0) {
            throw new Error(`Invalid categories: ${invalidCategories.join(', ')}`);
        }
    }
}

/**
 * Validate import data
 * @param {Object} data - Import data
 */
function validateImportData(data) {
    if (!data || (!data.data && !data.preferences)) {
        throw new Error('Invalid import data structure. Must contain data or preferences field');
    }

    const validStrategies = ['merge', 'replace', 'append'];
    const mergeStrategy = data.mergeStrategy || 'merge';
    if (!validStrategies.includes(mergeStrategy)) {
        throw new Error(`Invalid merge strategy. Must be one of: ${validStrategies.join(', ')}`);
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
// router.use(auditLogger('preferences-management'));

// Apply real-time sync manager
// router.use(syncManager.trackPreferencesChanges);

// ================== GENERAL PREFERENCES ROUTES ==================

/**
 * Create default user preferences
 * POST /preferences/defaults
 */
router.post(
    '/preferences/defaults',
    // authenticate,
    // authorize(['admin', 'manager']),
    // rateLimiter(RATE_LIMITS.write),
    // PreferencesValidator.validateDefaultCreation,
    validateAccess('preferences.create_defaults', { roles: ['admin', 'manager'] }),
    validatePreferencesData('create'),
    operationLogger('preferences_create_defaults'),
    UserPreferencesController.createDefaultPreferences
);

/**
 * Create default preferences for specific user
 * POST /preferences/:userId/defaults
 */
router.post(
    '/preferences/:userId/defaults',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.create_user_defaults'),
    validatePreferencesData('create'),
    operationLogger('preferences_create_user_defaults'),
    UserPreferencesController.createDefaultPreferences
);

/**
 * Get user preferences with optional filtering
 * GET /preferences/:userId
 */
router.get(
    '/preferences/:userId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('user_preferences', 300), // 5 minute cache
    validateAccess('preferences.read'),
    operationLogger('preferences_read'),
    UserPreferencesController.getPreferences
);

/**
 * Get current user preferences
 * GET /preferences/me
 */
router.get(
    '/preferences/me',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('my_preferences', 180), // 3 minute cache
    validateAccess('preferences.read_self'),
    operationLogger('preferences_read_self'),
    UserPreferencesController.getPreferences
);

/**
 * Update user preferences
 * PUT /preferences/:userId
 */
router.put(
    '/preferences/:userId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // PreferencesValidator.validatePreferencesUpdate,
    // syncManager.broadcastChanges,
    validateAccess('preferences.update'),
    validatePreferencesData('update'),
    operationLogger('preferences_update'),
    UserPreferencesController.updatePreferences
);

/**
 * Update current user preferences
 * PUT /preferences/me
 */
router.put(
    '/preferences/me',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // syncManager.broadcastChanges,
    validateAccess('preferences.update_self'),
    validatePreferencesData('update'),
    operationLogger('preferences_update_self'),
    UserPreferencesController.updatePreferences
);

// ================== THEME MANAGEMENT ROUTES ==================

/**
 * Configure theme preferences
 * POST /preferences/:userId/theme
 */
router.post(
    '/preferences/:userId/theme',
    // authenticate,
    // rateLimiter(RATE_LIMITS.theme),
    // PreferencesValidator.validateThemeConfiguration,
    // syncManager.broadcastThemeChange,
    validateAccess('preferences.configure_theme'),
    validatePreferencesData('theme'),
    operationLogger('preferences_configure_theme'),
    UserPreferencesController.configureTheme
);

/**
 * Configure current user theme
 * POST /preferences/me/theme
 */
router.post(
    '/preferences/me/theme',
    // authenticate,
    // rateLimiter(RATE_LIMITS.theme),
    // syncManager.broadcastThemeChange,
    validateAccess('preferences.configure_self_theme'),
    validatePreferencesData('theme'),
    operationLogger('preferences_configure_self_theme'),
    UserPreferencesController.configureTheme
);

/**
 * Get available themes
 * GET /preferences/themes
 */
router.get(
    '/preferences/themes',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('available_themes', 3600), // 1 hour cache
    validateAccess('preferences.get_themes'),
    operationLogger('preferences_get_themes'),
    UserPreferencesController.getPreferences
);

/**
 * Create custom theme
 * POST /preferences/:userId/theme/custom
 */
router.post(
    '/preferences/:userId/theme/custom',
    // authenticate,
    // rateLimiter(RATE_LIMITS.customization),
    // PreferencesValidator.validateCustomTheme,
    validateAccess('preferences.create_custom_theme'),
    validatePreferencesData('theme'),
    operationLogger('preferences_create_custom_theme'),
    UserPreferencesController.configureTheme
);

/**
 * Update custom theme
 * PUT /preferences/:userId/theme/custom/:themeName
 */
router.put(
    '/preferences/:userId/theme/custom/:themeName',
    // authenticate,
    // rateLimiter(RATE_LIMITS.customization),
    validateAccess('preferences.update_custom_theme'),
    validatePreferencesData('theme'),
    operationLogger('preferences_update_custom_theme'),
    UserPreferencesController.configureTheme
);

/**
 * Delete custom theme
 * DELETE /preferences/:userId/theme/custom/:themeName
 */
router.delete(
    '/preferences/:userId/theme/custom/:themeName',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.delete_custom_theme'),
    operationLogger('preferences_delete_custom_theme'),
    UserPreferencesController.updatePreferences
);

/**
 * Share custom theme
 * POST /preferences/:userId/theme/custom/:themeName/share
 */
router.post(
    '/preferences/:userId/theme/custom/:themeName/share',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.share_custom_theme'),
    operationLogger('preferences_share_custom_theme'),
    UserPreferencesController.updatePreferences
);

// ================== NOTIFICATION PREFERENCES ROUTES ==================

/**
 * Configure notification preferences
 * POST /preferences/:userId/notifications
 */
router.post(
    '/preferences/:userId/notifications',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // PreferencesValidator.validateNotificationConfiguration,
    validateAccess('preferences.configure_notifications'),
    validatePreferencesData('notification'),
    operationLogger('preferences_configure_notifications'),
    UserPreferencesController.configureNotifications
);

/**
 * Configure current user notifications
 * POST /preferences/me/notifications
 */
router.post(
    '/preferences/me/notifications',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.configure_self_notifications'),
    validatePreferencesData('notification'),
    operationLogger('preferences_configure_self_notifications'),
    UserPreferencesController.configureNotifications
);

/**
 * Update email notification preferences
 * PUT /preferences/:userId/notifications/email
 */
router.put(
    '/preferences/:userId/notifications/email',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_email_notifications'),
    validatePreferencesData('notification'),
    operationLogger('preferences_update_email_notifications'),
    UserPreferencesController.configureNotifications
);

/**
 * Update push notification preferences
 * PUT /preferences/:userId/notifications/push
 */
router.put(
    '/preferences/:userId/notifications/push',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_push_notifications'),
    validatePreferencesData('notification'),
    operationLogger('preferences_update_push_notifications'),
    UserPreferencesController.configureNotifications
);

/**
 * Register notification device
 * POST /preferences/:userId/notifications/devices
 */
router.post(
    '/preferences/:userId/notifications/devices',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.register_notification_device'),
    validatePreferencesData('notification'),
    operationLogger('preferences_register_notification_device'),
    UserPreferencesController.configureNotifications
);

/**
 * Remove notification device
 * DELETE /preferences/:userId/notifications/devices/:deviceId
 */
router.delete(
    '/preferences/:userId/notifications/devices/:deviceId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.remove_notification_device'),
    operationLogger('preferences_remove_notification_device'),
    UserPreferencesController.updatePreferences
);

// ================== LANGUAGE SETTINGS ROUTES ==================

/**
 * Configure localization preferences
 * POST /preferences/:userId/localization
 */
router.post(
    '/preferences/:userId/localization',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // PreferencesValidator.validateLocalizationConfiguration,
    validateAccess('preferences.configure_localization'),
    validatePreferencesData('localization'),
    operationLogger('preferences_configure_localization'),
    UserPreferencesController.configureLocalization
);

/**
 * Configure current user localization
 * POST /preferences/me/localization
 */
router.post(
    '/preferences/me/localization',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.configure_self_localization'),
    validatePreferencesData('localization'),
    operationLogger('preferences_configure_self_localization'),
    UserPreferencesController.configureLocalization
);

/**
 * Update language preference
 * PUT /preferences/:userId/localization/language
 */
router.put(
    '/preferences/:userId/localization/language',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // syncManager.broadcastLanguageChange,
    validateAccess('preferences.update_language'),
    validatePreferencesData('localization'),
    operationLogger('preferences_update_language'),
    UserPreferencesController.configureLocalization
);

/**
 * Update timezone preference
 * PUT /preferences/:userId/localization/timezone
 */
router.put(
    '/preferences/:userId/localization/timezone',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_timezone'),
    validatePreferencesData('localization'),
    operationLogger('preferences_update_timezone'),
    UserPreferencesController.configureLocalization
);

/**
 * Update date and time format preferences
 * PUT /preferences/:userId/localization/formats
 */
router.put(
    '/preferences/:userId/localization/formats',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_formats'),
    validatePreferencesData('localization'),
    operationLogger('preferences_update_formats'),
    UserPreferencesController.configureLocalization
);

/**
 * Update currency preferences
 * PUT /preferences/:userId/localization/currency
 */
router.put(
    '/preferences/:userId/localization/currency',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_currency'),
    validatePreferencesData('localization'),
    operationLogger('preferences_update_currency'),
    UserPreferencesController.configureLocalization
);

/**
 * Get supported languages
 * GET /preferences/localization/languages
 */
router.get(
    '/preferences/localization/languages',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('supported_languages', 86400), // 24 hour cache
    validateAccess('preferences.get_languages'),
    operationLogger('preferences_get_languages'),
    UserPreferencesController.getPreferences
);

/**
 * Get supported timezones
 * GET /preferences/localization/timezones
 */
router.get(
    '/preferences/localization/timezones',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('supported_timezones', 86400), // 24 hour cache
    validateAccess('preferences.get_timezones'),
    operationLogger('preferences_get_timezones'),
    UserPreferencesController.getPreferences
);

// ================== ACCESSIBILITY SETTINGS ROUTES ==================

/**
 * Configure accessibility preferences
 * POST /preferences/:userId/accessibility
 */
router.post(
    '/preferences/:userId/accessibility',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // PreferencesValidator.validateAccessibilityConfiguration,
    validateAccess('preferences.configure_accessibility'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_configure_accessibility'),
    UserPreferencesController.configureAccessibility
);

/**
 * Configure current user accessibility
 * POST /preferences/me/accessibility
 */
router.post(
    '/preferences/me/accessibility',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.configure_self_accessibility'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_configure_self_accessibility'),
    UserPreferencesController.configureAccessibility
);

/**
 * Update visual accessibility settings
 * PUT /preferences/:userId/accessibility/visual
 */
router.put(
    '/preferences/:userId/accessibility/visual',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_visual_accessibility'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_update_visual_accessibility'),
    UserPreferencesController.configureAccessibility
);

/**
 * Update motor accessibility settings
 * PUT /preferences/:userId/accessibility/motor
 */
router.put(
    '/preferences/:userId/accessibility/motor',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_motor_accessibility'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_update_motor_accessibility'),
    UserPreferencesController.configureAccessibility
);

/**
 * Update cognitive accessibility settings
 * PUT /preferences/:userId/accessibility/cognitive
 */
router.put(
    '/preferences/:userId/accessibility/cognitive',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_cognitive_accessibility'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_update_cognitive_accessibility'),
    UserPreferencesController.configureAccessibility
);

/**
 * Update keyboard navigation settings
 * PUT /preferences/:userId/accessibility/keyboard
 */
router.put(
    '/preferences/:userId/accessibility/keyboard',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_keyboard_accessibility'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_update_keyboard_accessibility'),
    UserPreferencesController.configureAccessibility
);

/**
 * Enable screen reader support
 * POST /preferences/:userId/accessibility/screen-reader
 */
router.post(
    '/preferences/:userId/accessibility/screen-reader',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.enable_screen_reader'),
    validatePreferencesData('accessibility'),
    operationLogger('preferences_enable_screen_reader'),
    UserPreferencesController.configureAccessibility
);

// ================== DASHBOARD CONFIGURATION ROUTES ==================

/**
 * Configure dashboard layout
 * PUT /preferences/:userId/dashboard/layout
 */
router.put(
    '/preferences/:userId/dashboard/layout',
    // authenticate,
    // rateLimiter(RATE_LIMITS.customization),
    // PreferencesValidator.validateDashboardLayout,
    validateAccess('preferences.configure_dashboard_layout'),
    validatePreferencesData('update'),
    operationLogger('preferences_configure_dashboard_layout'),
    UserPreferencesController.updatePreferences
);

/**
 * Configure dashboard widgets
 * PUT /preferences/:userId/dashboard/widgets
 */
router.put(
    '/preferences/:userId/dashboard/widgets',
    // authenticate,
    // rateLimiter(RATE_LIMITS.customization),
    validateAccess('preferences.configure_dashboard_widgets'),
    validatePreferencesData('update'),
    operationLogger('preferences_configure_dashboard_widgets'),
    UserPreferencesController.updatePreferences
);

/**
 * Save dashboard template
 * POST /preferences/:userId/dashboard/templates
 */
router.post(
    '/preferences/:userId/dashboard/templates',
    // authenticate,
    // rateLimiter(RATE_LIMITS.customization),
    validateAccess('preferences.save_dashboard_template'),
    validatePreferencesData('update'),
    operationLogger('preferences_save_dashboard_template'),
    UserPreferencesController.updatePreferences
);

/**
 * Load dashboard template
 * POST /preferences/:userId/dashboard/templates/:templateId/load
 */
router.post(
    '/preferences/:userId/dashboard/templates/:templateId/load',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.load_dashboard_template'),
    operationLogger('preferences_load_dashboard_template'),
    UserPreferencesController.updatePreferences
);

/**
 * Delete dashboard template
 * DELETE /preferences/:userId/dashboard/templates/:templateId
 */
router.delete(
    '/preferences/:userId/dashboard/templates/:templateId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.delete_dashboard_template'),
    operationLogger('preferences_delete_dashboard_template'),
    UserPreferencesController.updatePreferences
);

// ================== TEMPLATE MANAGEMENT ROUTES ==================

/**
 * Get available preference templates
 * GET /preferences/templates
 */
router.get(
    '/preferences/templates',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    // cacheManager.getFromCache('preference_templates', 3600), // 1 hour cache
    validateAccess('preferences.get_templates'),
    operationLogger('preferences_get_templates'),
    UserPreferencesController.getPreferences
);

/**
 * Create preference template
 * POST /preferences/templates
 */
router.post(
    '/preferences/templates',
    // authenticate,
    // authorize(['admin', 'template_admin']),
    // rateLimiter(RATE_LIMITS.write),
    // PreferencesValidator.validateTemplateCreation,
    validateAccess('preferences.create_template', { requireTemplateAdmin: true }),
    validatePreferencesData('create'),
    operationLogger('preferences_create_template'),
    UserPreferencesController.updatePreferences
);

/**
 * Update preference template
 * PUT /preferences/templates/:templateId
 */
router.put(
    '/preferences/templates/:templateId',
    // authenticate,
    // authorize(['admin', 'template_admin']),
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.update_template', { requireTemplateAdmin: true }),
    validatePreferencesData('update'),
    operationLogger('preferences_update_template'),
    UserPreferencesController.updatePreferences
);

/**
 * Delete preference template
 * DELETE /preferences/templates/:templateId
 */
router.delete(
    '/preferences/templates/:templateId',
    // authenticate,
    // authorize(['admin', 'template_admin']),
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.delete_template', { requireTemplateAdmin: true }),
    operationLogger('preferences_delete_template'),
    UserPreferencesController.updatePreferences
);

/**
 * Apply template to user
 * POST /preferences/:userId/apply-template/:templateId
 */
router.post(
    '/preferences/:userId/apply-template/:templateId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // syncManager.broadcastTemplateChange,
    validateAccess('preferences.apply_template'),
    operationLogger('preferences_apply_template'),
    UserPreferencesController.updatePreferences
);

// ================== SYNC AND DEVICE MANAGEMENT ==================

/**
 * Sync preferences across devices
 * POST /preferences/:userId/sync
 */
router.post(
    '/preferences/:userId/sync',
    // authenticate,
    // rateLimiter(RATE_LIMITS.sync),
    // syncManager.performSync,
    validateAccess('preferences.sync_devices'),
    validatePreferencesData('sync'),
    operationLogger('preferences_sync_devices'),
    UserPreferencesController.syncPreferencesAcrossDevices
);

/**
 * Sync current user preferences
 * POST /preferences/me/sync
 */
router.post(
    '/preferences/me/sync',
    // authenticate,
    // rateLimiter(RATE_LIMITS.sync),
    // syncManager.performSync,
    validateAccess('preferences.sync_self_devices'),
    validatePreferencesData('sync'),
    operationLogger('preferences_sync_self_devices'),
    UserPreferencesController.syncPreferencesAcrossDevices
);

/**
 * Get device sync status
 * GET /preferences/:userId/sync/status
 */
router.get(
    '/preferences/:userId/sync/status',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('preferences.get_sync_status'),
    operationLogger('preferences_get_sync_status'),
    UserPreferencesController.getPreferences
);

/**
 * Configure sync settings
 * PUT /preferences/:userId/sync/settings
 */
router.put(
    '/preferences/:userId/sync/settings',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    validateAccess('preferences.configure_sync_settings'),
    validatePreferencesData('sync'),
    operationLogger('preferences_configure_sync_settings'),
    UserPreferencesController.updatePreferences
);

/**
 * Force sync from specific device
 * POST /preferences/:userId/sync/force/:deviceId
 */
router.post(
    '/preferences/:userId/sync/force/:deviceId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.sync),
    validateAccess('preferences.force_sync_device'),
    operationLogger('preferences_force_sync_device'),
    UserPreferencesController.syncPreferencesAcrossDevices
);

// ================== ANALYTICS ROUTES ==================

/**
 * Get preference analytics
 * GET /preferences/:userId/analytics
 */
router.get(
    '/preferences/:userId/analytics',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    // cacheManager.getFromCache('preference_analytics', 900), // 15 minute cache
    validateAccess('preferences.analytics'),
    operationLogger('preferences_analytics'),
    UserPreferencesController.getPreferenceAnalytics
);

/**
 * Get current user preference analytics
 * GET /preferences/me/analytics
 */
router.get(
    '/preferences/me/analytics',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('preferences.self_analytics'),
    operationLogger('preferences_self_analytics'),
    UserPreferencesController.getPreferenceAnalytics
);

/**
 * Get usage patterns
 * GET /preferences/:userId/analytics/usage
 */
router.get(
    '/preferences/:userId/analytics/usage',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('preferences.usage_analytics'),
    operationLogger('preferences_usage_analytics'),
    UserPreferencesController.getPreferenceAnalytics
);

/**
 * Get recommendation insights
 * GET /preferences/:userId/analytics/recommendations
 */
router.get(
    '/preferences/:userId/analytics/recommendations',
    // authenticate,
    // rateLimiter(RATE_LIMITS.analytics),
    validateAccess('preferences.recommendation_analytics'),
    operationLogger('preferences_recommendation_analytics'),
    UserPreferencesController.getPreferenceAnalytics
);

// ================== BULK OPERATIONS ROUTES ==================

/**
 * Bulk update preferences for multiple users
 * POST /preferences/bulk/update
 */
router.post(
    '/preferences/bulk/update',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    // PreferencesValidator.validateBulkUpdate,
    validateAccess('preferences.bulk_update', { roles: ['admin', 'super_admin'] }),
    validatePreferencesData('bulk'),
    operationLogger('preferences_bulk_update'),
    UserPreferencesController.bulkUpdatePreferences
);

/**
 * Bulk apply template to multiple users
 * POST /preferences/bulk/apply-template
 */
router.post(
    '/preferences/bulk/apply-template',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    validateAccess('preferences.bulk_apply_template', { roles: ['admin', 'super_admin'] }),
    operationLogger('preferences_bulk_apply_template'),
    UserPreferencesController.bulkUpdatePreferences
);

/**
 * Bulk reset preferences for multiple users
 * POST /preferences/bulk/reset
 */
router.post(
    '/preferences/bulk/reset',
    // authenticate,
    // authorize(['admin', 'super_admin']),
    // rateLimiter(RATE_LIMITS.bulk),
    validateAccess('preferences.bulk_reset', { roles: ['admin', 'super_admin'] }),
    operationLogger('preferences_bulk_reset'),
    UserPreferencesController.bulkUpdatePreferences
);

// ================== IMPORT/EXPORT ROUTES ==================

/**
 * Export user preferences
 * GET /preferences/:userId/export
 */
router.get(
    '/preferences/:userId/export',
    // authenticate,
    // rateLimiter(RATE_LIMITS.export),
    validateAccess('preferences.export'),
    validatePreferencesData('export'),
    operationLogger('preferences_export'),
    UserPreferencesController.exportPreferences
);

/**
 * Export current user preferences
 * GET /preferences/me/export
 */
router.get(
    '/preferences/me/export',
    // authenticate,
    // rateLimiter(RATE_LIMITS.export),
    validateAccess('preferences.export_self'),
    validatePreferencesData('export'),
    operationLogger('preferences_export_self'),
    UserPreferencesController.exportPreferences
);

/**
 * Import user preferences
 * POST /preferences/:userId/import
 */
router.post(
    '/preferences/:userId/import',
    // authenticate,
    // rateLimiter(RATE_LIMITS.import),
    // PreferencesValidator.validatePreferencesImport,
    validateAccess('preferences.import'),
    validatePreferencesData('import'),
    operationLogger('preferences_import'),
    UserPreferencesController.importPreferences
);

/**
 * Import current user preferences
 * POST /preferences/me/import
 */
router.post(
    '/preferences/me/import',
    // authenticate,
    // rateLimiter(RATE_LIMITS.import),
    validateAccess('preferences.import_self'),
    validatePreferencesData('import'),
    operationLogger('preferences_import_self'),
    UserPreferencesController.importPreferences
);

// ================== RESET AND MAINTENANCE ROUTES ==================

/**
 * Reset preferences to defaults
 * POST /preferences/:userId/reset
 */
router.post(
    '/preferences/:userId/reset',
    // authenticate,
    // rateLimiter(RATE_LIMITS.reset),
    // syncManager.broadcastReset,
    validateAccess('preferences.reset'),
    operationLogger('preferences_reset'),
    UserPreferencesController.resetPreferences
);

/**
 * Reset current user preferences to defaults
 * POST /preferences/me/reset
 */
router.post(
    '/preferences/me/reset',
    // authenticate,
    // rateLimiter(RATE_LIMITS.reset),
    // syncManager.broadcastReset,
    validateAccess('preferences.reset_self'),
    operationLogger('preferences_reset_self'),
    UserPreferencesController.resetPreferences
);

/**
 * Validate preferences configuration
 * POST /preferences/:userId/validate
 */
router.post(
    '/preferences/:userId/validate',
    // authenticate,
    // rateLimiter(RATE_LIMITS.default),
    validateAccess('preferences.validate'),
    operationLogger('preferences_validate'),
    UserPreferencesController.getPreferences
);

/**
 * Get preferences version history
 * GET /preferences/:userId/history
 */
router.get(
    '/preferences/:userId/history',
    // authenticate,
    // rateLimiter(RATE_LIMITS.read),
    validateAccess('preferences.history'),
    operationLogger('preferences_history'),
    UserPreferencesController.getPreferenceAnalytics
);

/**
 * Restore preferences from version
 * POST /preferences/:userId/restore/:versionId
 */
router.post(
    '/preferences/:userId/restore/:versionId',
    // authenticate,
    // rateLimiter(RATE_LIMITS.write),
    // syncManager.broadcastRestore,
    validateAccess('preferences.restore'),
    operationLogger('preferences_restore'),
    UserPreferencesController.importPreferences
);

module.exports = router;