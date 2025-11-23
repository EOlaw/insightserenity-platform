/**
 * @fileoverview Authentication Middleware
 * @module servers/admin-server/middleware/auth-middleware
 * @description Handles JWT authentication and user session validation for admin server
 * @version 1.0.0
 */

'use strict';

const { AppError } = require('../../../shared/lib/utils/app-error');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'auth-middleware' });

/**
 * Authenticate incoming requests using JWT tokens
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const authenticate = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('Authentication token required', 401, 'NO_TOKEN');
        }

        const token = authHeader.substring(7);

        if (!token) {
            throw new AppError('Authentication token required', 401, 'NO_TOKEN');
        }

        // TODO: Verify JWT token and extract user information
        // For now, this is a placeholder implementation
        // You will need to implement actual JWT verification here

        // Placeholder: Simulate authenticated user
        req.user = {
            id: 'placeholder-user-id',
            email: 'admin@insightserenity.com',
            role: 'admin',
            permissions: ['admin:read', 'admin:write', 'admin:delete'],
            tenantId: 'placeholder-tenant-id'
        };

        logger.debug('User authenticated', {
            userId: req.user.id,
            requestId: req.requestId
        });

        next();
    } catch (error) {
        logger.warn('Authentication failed', {
            error: error.message,
            requestId: req.requestId,
            ip: req.ip
        });

        if (error instanceof AppError) {
            return next(error);
        }

        next(new AppError('Authentication failed', 401, 'AUTH_FAILED'));
    }
};

/**
 * Optional authentication - authenticates if token present, continues without auth if not
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);

        if (!token) {
            return next();
        }

        // TODO: Verify JWT token and extract user information
        // Placeholder implementation
        req.user = {
            id: 'placeholder-user-id',
            email: 'admin@insightserenity.com',
            role: 'admin',
            permissions: ['admin:read', 'admin:write', 'admin:delete'],
            tenantId: 'placeholder-tenant-id'
        };

        logger.debug('User optionally authenticated', {
            userId: req.user.id,
            requestId: req.requestId
        });

        next();
    } catch (error) {
        logger.debug('Optional authentication skipped', {
            error: error.message,
            requestId: req.requestId
        });
        next();
    }
};

/**
 * Verify user is an administrator
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'NO_AUTH'));
    }

    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        logger.warn('Admin access denied', {
            userId: req.user.id,
            role: req.user.role,
            requestId: req.requestId
        });

        return next(new AppError('Admin access required', 403, 'ADMIN_REQUIRED'));
    }

    next();
};

/**
 * Verify user belongs to specific tenant
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requireTenant = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'NO_AUTH'));
    }

    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId || req.body.tenantId;

    if (!tenantId) {
        return next(new AppError('Tenant ID required', 400, 'NO_TENANT_ID'));
    }

    if (req.user.tenantId !== tenantId && req.user.role !== 'superadmin') {
        logger.warn('Tenant access denied', {
            userId: req.user.id,
            userTenantId: req.user.tenantId,
            requestedTenantId: tenantId,
            requestId: req.requestId
        });

        return next(new AppError('Tenant access denied', 403, 'TENANT_ACCESS_DENIED'));
    }

    req.tenantId = tenantId;
    next();
};

module.exports = {
    authenticate,
    optionalAuthenticate,
    requireAdmin,
    requireTenant
};