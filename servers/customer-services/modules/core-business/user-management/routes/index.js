'use strict';

/**
 * @fileoverview Enterprise user management module index - Main entry point for user management routes and services
 * @module servers/api/modules/user-management/index
 * @requires express
 * @requires module:servers/api/modules/user-management/routes/user-routes
 * @requires module:servers/api/modules/user-management/routes/user-profile-routes
 * @requires module:servers/api/modules/user-management/routes/user-settings-routes
 * @requires module:servers/api/modules/user-management/routes/user-preferences-routes
 * @requires module:shared/middleware/auth/authenticate
 * @requires module:shared/middleware/auth/authorize
 * @requires module:shared/middleware/validation/request-validator
 * @requires module:shared/middleware/security/rate-limiter
 * @requires module:shared/middleware/logging/operation-logger
 * @requires module:shared/middleware/monitoring/performance-monitor
 * @requires module:shared/middleware/cache/cache-manager
 * @requires module:shared/middleware/compression/response-compression
 * @requires module:shared/middleware/security/helmet-security
 * @requires module:shared/middleware/cors/cors-handler
 * @requires module:shared/middleware/validation/sanitizer
 * @requires module:shared/middleware/error/error-handler
 * @requires module:shared/middleware/compliance/audit-logger
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router();

// Import route modules
const userRoutes = require('./user-routes');
const userProfileRoutes = require('./user-profile-routes');
const userSettingsRoutes = require('./user-settings-routes');
const userPreferencesRoutes = require('./user-preferences-routes');

// Import shared middleware
// const authenticate = require('../../../shared/middleware/auth/authenticate');
// const authorize = require('../../../shared/middleware/auth/authorize');
// const requestValidator = require('../../../shared/middleware/validation/request-validator');
// const rateLimiter = require('../../../shared/middleware/security/rate-limiter');
// const operationLogger = require('../../../shared/middleware/logging/operation-logger');
// const performanceMonitor = require('../../../shared/middleware/monitoring/performance-monitor');
// const cacheManager = require('../../../shared/middleware/cache/cache-manager');
// const responseCompression = require('../../../shared/middleware/compression/response-compression');
// const helmetSecurity = require('../../../shared/middleware/security/helmet-security');
// const corsHandler = require('../../../shared/middleware/cors/cors-handler');
// const sanitizer = require('../../../shared/middleware/validation/sanitizer');
// const errorHandler = require('../../../shared/middleware/error/error-handler');
// const auditLogger = require('../../../shared/middleware/compliance/audit-logger');

// Import utilities
const logger = require('../../../../../../shared/lib/utils/logger');

/**
 * Module-level rate limiting configuration
 * @constant {Object} MODULE_RATE_LIMITS
 */
const MODULE_RATE_LIMITS = {
    global: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 500, // limit each IP to 500 requests per windowMs for the entire module
        message: {
            success: false,
            message: 'Too many requests to user management module, please try again later.',
            code: 'USER_MODULE_RATE_LIMIT_EXCEEDED',
            retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
    },
    authenticated: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 800, // higher limit for authenticated users
        message: {
            success: false,
            message: 'Too many authenticated requests to user management module.',
            code: 'USER_MODULE_AUTH_RATE_LIMIT_EXCEEDED'
        },
        standardHeaders: true,
        legacyHeaders: false
    },
    admin: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1200, // even higher limit for admin users
        message: {
            success: false,
            message: 'Too many admin requests to user management module.',
            code: 'USER_MODULE_ADMIN_RATE_LIMIT_EXCEEDED'
        },
        standardHeaders: true,
        legacyHeaders: false
    }
};

/**
 * Module information and metadata
 * @constant {Object} MODULE_INFO
 */
const MODULE_INFO = {
    name: 'user-management',
    version: '2.1.0',
    description: 'Enterprise user management module with comprehensive CRUD, authentication, profiles, settings, and preferences',
    author: 'Enterprise Development Team',
    endpoints: {
        users: '/users',
        profiles: '/profiles', 
        settings: '/settings',
        preferences: '/preferences'
    },
    features: [
        'User Authentication & Authorization',
        'Multi-Factor Authentication (MFA)',
        'User Profile Management',
        'Professional Portfolio',
        'Skills & Endorsements',
        'Account Settings & Security',
        'Privacy & Compliance Controls',
        'UI/UX Preferences',
        'Theme Customization',
        'Localization & Accessibility',
        'Real-time Synchronization',
        'Analytics & Reporting',
        'Bulk Operations',
        'Import/Export Functionality'
    ],
    supportedAuthStrategies: ['local', 'oauth', 'saml', 'ldap', 'jwt'],
    supportedIntegrations: ['google', 'microsoft', 'github', 'linkedin', 'slack'],
    complianceStandards: ['GDPR', 'CCPA', 'HIPAA', 'SOX', 'PCI-DSS'],
    lastUpdated: new Date().toISOString()
};

/**
 * Health check information for the user management module
 * @constant {Object} HEALTH_CHECK_ENDPOINTS
 */
const HEALTH_CHECK_ENDPOINTS = {
    basic: '/health',
    detailed: '/health/detailed',
    readiness: '/health/ready',
    liveness: '/health/live'
};

/**
 * Module-level performance monitoring middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function modulePerformanceMonitor(req, res, next) {
    const startTime = process.hrtime.bigint();
    const originalJson = res.json;

    // Track module-level metrics
    req.moduleMetrics = {
        moduleName: MODULE_INFO.name,
        moduleVersion: MODULE_INFO.version,
        startTime,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        userId: req.user?.id,
        correlationId: req.headers['x-correlation-id'] || require('crypto').randomUUID()
    };

    // Override response to capture completion metrics
    res.json = function(body) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

        // Log module performance metrics
        logger.info('User Management Module Request', {
            ...req.moduleMetrics,
            duration,
            statusCode: res.statusCode,
            success: res.statusCode < 400,
            responseSize: JSON.stringify(body).length,
            completedAt: new Date().toISOString()
        });

        return originalJson.call(this, body);
    };

    next();
}

/**
 * Module-level error handler
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function moduleErrorHandler(error, req, res, next) {
    // Log module-specific errors
    logger.error('User Management Module Error', {
        error: error.message,
        stack: error.stack,
        module: MODULE_INFO.name,
        endpoint: req.path,
        method: req.method,
        userId: req.user?.id,
        correlationId: req.moduleMetrics?.correlationId,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
    });

    // Handle specific user management errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'User management validation failed',
            error: error.message,
            code: 'USER_VALIDATION_ERROR',
            module: MODULE_INFO.name,
            correlationId: req.moduleMetrics?.correlationId
        });
    }

    if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            message: 'Authentication required for user management operations',
            code: 'USER_AUTH_REQUIRED',
            module: MODULE_INFO.name,
            correlationId: req.moduleMetrics?.correlationId
        });
    }

    if (error.name === 'ForbiddenError') {
        return res.status(403).json({
            success: false,
            message: 'Insufficient permissions for user management operation',
            code: 'USER_INSUFFICIENT_PERMISSIONS',
            module: MODULE_INFO.name,
            correlationId: req.moduleMetrics?.correlationId
        });
    }

    if (error.name === 'NotFoundError') {
        return res.status(404).json({
            success: false,
            message: 'User management resource not found',
            code: 'USER_RESOURCE_NOT_FOUND',
            module: MODULE_INFO.name,
            correlationId: req.moduleMetrics?.correlationId
        });
    }

    if (error.name === 'ConflictError') {
        return res.status(409).json({
            success: false,
            message: 'User management resource conflict',
            error: error.message,
            code: 'USER_RESOURCE_CONFLICT',
            module: MODULE_INFO.name,
            correlationId: req.moduleMetrics?.correlationId
        });
    }

    // Pass to global error handler for unhandled errors
    next(error);
}

/**
 * Module security headers middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function moduleSecurityHeaders(req, res, next) {
    // Set module-specific security headers
    res.setHeader('X-Module-Name', MODULE_INFO.name);
    res.setHeader('X-Module-Version', MODULE_INFO.version);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    next();
}

/**
 * CORS configuration for user management module
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function moduleCorsHandler(req, res, next) {
    // Set CORS headers for user management module
    const allowedOrigins = [
        'https://app.company.com',
        'https://admin.company.com',
        'https://mobile.company.com'
    ];

    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 
        'Content-Type, Authorization, X-Requested-With, X-Correlation-ID, X-Device-ID, X-API-Version'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
}

/**
 * Request tracking middleware for user management operations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function requestTracker(req, res, next) {
    // Add request tracking context
    req.userManagementContext = {
        requestId: require('crypto').randomUUID(),
        module: MODULE_INFO.name,
        timestamp: new Date().toISOString(),
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'],
        apiVersion: req.headers['x-api-version'] || '2.1'
    };

    // Log request start
    logger.info('User Management Request Started', {
        ...req.userManagementContext,
        query: req.query,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        hasAuth: !!req.headers.authorization
    });

    next();
}

// ================== GLOBAL MODULE MIDDLEWARE SETUP ==================

// Apply performance monitoring to all routes
router.use(modulePerformanceMonitor);

// Apply security headers
router.use(moduleSecurityHeaders);

// Apply CORS handling
router.use(moduleCorsHandler);

// Apply request tracking
router.use(requestTracker);

// Apply compression for large responses
// router.use(responseCompression({
//     threshold: 1024, // Compress responses larger than 1KB
//     level: 6, // Compression level (1-9)
//     filter: (req, res) => {
//         // Don't compress responses with this request header
//         if (req.headers['x-no-compression']) {
//             return false;
//         }
//         // Use compression filter
//         return true;
//     }
// }));

// Apply global rate limiting
// router.use(rateLimiter(MODULE_RATE_LIMITS.global));

// Apply request sanitization
// router.use(sanitizer.sanitizeRequest);

// Apply audit logging for compliance
// router.use(auditLogger('user-management-module'));

// ================== MODULE HEALTH CHECK ROUTES ==================

/**
 * Basic health check endpoint
 * GET /health
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'User Management Module is healthy',
        module: MODULE_INFO.name,
        version: MODULE_INFO.version,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        status: 'healthy'
    });
});

/**
 * Detailed health check with module information
 * GET /health/detailed
 */
router.get('/health-detailed', (req, res) => {
    const memoryUsage = process.memoryUsage();
    
    res.status(200).json({
        success: true,
        message: 'User Management Module detailed health check',
        module: MODULE_INFO,
        health: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
            },
            nodeVersion: process.version,
            platform: process.platform,
            environment: process.env.NODE_ENV || 'development'
        },
        endpoints: MODULE_INFO.endpoints,
        rateLimits: MODULE_RATE_LIMITS
    });
});

/**
 * Readiness probe for container orchestration
 * GET /health/ready
 */
router.get('/health-ready', (req, res) => {
    // Add any readiness checks here (database connections, external services, etc.)
    const isReady = true; // Implement actual readiness logic
    
    if (isReady) {
        res.status(200).json({
            success: true,
            status: 'ready',
            module: MODULE_INFO.name,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            success: false,
            status: 'not_ready',
            module: MODULE_INFO.name,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Liveness probe for container orchestration
 * GET /health/live
 */
router.get('/health-live', (req, res) => {
    res.status(200).json({
        success: true,
        status: 'alive',
        module: MODULE_INFO.name,
        timestamp: new Date().toISOString(),
        pid: process.pid
    });
});

// ================== MODULE INFORMATION ROUTES ==================

/**
 * Get module information and capabilities
 * GET /info
 */
router.get('/info', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'User Management Module Information',
        data: MODULE_INFO,
        timestamp: new Date().toISOString()
    });
});

/**
 * Get module API documentation links
 * GET /docs
 */
router.get('/docs', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'User Management Module API Documentation',
        module: MODULE_INFO.name,
        documentation: {
            openapi: '/api/docs/user-management/openapi.json',
            swagger: '/api/docs/user-management/swagger',
            postman: '/api/docs/user-management/postman.json',
            examples: '/api/docs/user-management/examples'
        },
        endpoints: MODULE_INFO.endpoints,
        timestamp: new Date().toISOString()
    });
});

// ================== ROUTE MODULE MOUNTING ==================

/**
 * Mount user management routes
 * Base path: /users
 */
router.use('/users', userRoutes);

/**
 * Mount user profile routes  
 * Base path: /profiles
 */
router.use('/profiles', userProfileRoutes);

/**
 * Mount user settings routes
 * Base path: /settings
 */
router.use('/settings', userSettingsRoutes);

/**
 * Mount user preferences routes
 * Base path: /preferences
 */
router.use('/preferences', userPreferencesRoutes);

// ================== MODULE METRICS AND MONITORING ==================

/**
 * Get module performance metrics
 * GET /metrics
 */
router.get('/metrics', 
    // authenticate,
    // authorize(['admin', 'monitor']),
    (req, res) => {
        // This would typically integrate with monitoring systems like Prometheus
        const metrics = {
            module: MODULE_INFO.name,
            version: MODULE_INFO.version,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            endpoints: {
                users: { mounted: true, path: '/users' },
                profiles: { mounted: true, path: '/profiles' },
                settings: { mounted: true, path: '/settings' },
                preferences: { mounted: true, path: '/preferences' }
            },
            rateLimits: MODULE_RATE_LIMITS,
            timestamp: new Date().toISOString()
        };

        res.status(200).json({
            success: true,
            message: 'User Management Module Metrics',
            data: metrics
        });
    }
);

// ================== MODULE ERROR HANDLING ==================

// Apply module-specific error handler
router.use(moduleErrorHandler);

// ================== MODULE EXPORTS ==================

/**
 * Export the complete user management module router
 * @module user-management
 */
module.exports = {
    router,
    info: MODULE_INFO,
    healthChecks: HEALTH_CHECK_ENDPOINTS,
    rateLimits: MODULE_RATE_LIMITS,
    version: MODULE_INFO.version,
    name: MODULE_INFO.name
};