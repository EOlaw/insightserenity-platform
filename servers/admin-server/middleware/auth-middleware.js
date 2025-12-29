/**
 * @fileoverview Authentication Middleware
 * @module servers/admin-server/middleware/auth-middleware
 * @description Handles JWT authentication and user session validation for admin server
 * @version 1.0.0
 */

'use strict';

const { AppError } = require('../../../shared/lib/utils/app-error');
const { getLogger } = require('../../../shared/lib/utils/logger');
const { TokenService } = require('../modules/user-management-system/authentication/services');
const { SessionService } = require('../modules/user-management-system/sessions/services');

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

        // Verify JWT token
        const decoded = TokenService.verifyAccessToken(token);

        // Validate session
        const session = await SessionService.validateSession(decoded.sessionId, token);

        if (!session || !session.isActive) {
            throw new AppError('Invalid or expired session', 401, 'INVALID_SESSION');
        }

        // Update session activity
        session.lastActivity = new Date();
        await session.save();

        // Attach user and session information to request
        req.user = {
            id: session.adminUser._id.toString(),
            email: session.adminUser.email,
            firstName: session.adminUser.firstName,
            lastName: session.adminUser.lastName,
            fullName: `${session.adminUser.firstName} ${session.adminUser.lastName}`,
            role: session.adminUser.role,
            permissions: session.adminUser.permissions,
            department: session.adminUser.department,
            isActive: session.adminUser.isActive
        };

        req.session = {
            id: session._id.toString(),
            sessionId: session.sessionId,
            ipAddress: session.ipAddress,
            deviceInfo: session.deviceInfo,
            isMfaVerified: session.isMfaVerified,
            expiresAt: session.expiresAt
        };

        logger.debug('User authenticated successfully', {
            userId: req.user.id,
            email: req.user.email,
            role: req.user.role,
            sessionId: req.session.sessionId,
            requestId: req.requestId
        });

        next();
    } catch (error) {
        logger.warn('Authentication failed', {
            error: error.message,
            errorCode: error.code,
            requestId: req.requestId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        if (error instanceof AppError) {
            return next(error);
        }

        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Token has expired', 401, 'TOKEN_EXPIRED'));
        }

        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
        }

        next(new AppError('Authentication failed', 401, 'AUTH_FAILED'));
    }
};

/**
 * Optional authentication - authenticates if token present, continues without auth if not
 * Useful for endpoints that can work with or without authentication
 *
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // If no auth header, continue without authentication
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);

        if (!token) {
            return next();
        }

        // Try to verify token
        const decoded = TokenService.verifyAccessToken(token);

        // Validate session
        const session = await SessionService.validateSession(decoded.sessionId, token);

        if (session && session.isActive) {
            // Update session activity
            session.lastActivity = new Date();
            await session.save();

            // Attach user info to request
            req.user = {
                id: session.adminUser._id.toString(),
                email: session.adminUser.email,
                firstName: session.adminUser.firstName,
                lastName: session.adminUser.lastName,
                fullName: `${session.adminUser.firstName} ${session.adminUser.lastName}`,
                role: session.adminUser.role,
                permissions: session.adminUser.permissions,
                department: session.adminUser.department,
                isActive: session.adminUser.isActive
            };

            req.session = {
                id: session._id.toString(),
                sessionId: session.sessionId,
                ipAddress: session.ipAddress,
                deviceInfo: session.deviceInfo,
                isMfaVerified: session.isMfaVerified,
                expiresAt: session.expiresAt
            };

            logger.debug('User optionally authenticated', {
                userId: req.user.id,
                requestId: req.requestId
            });
        }

        next();
    } catch (error) {
        // For optional auth, just continue without authentication on error
        logger.debug('Optional authentication skipped', {
            error: error.message,
            requestId: req.requestId
        });
        next();
    }
};

/**
 * Verify user is an administrator (admin or super_admin role)
 * Use this for endpoints that only admins should access
 *
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'NO_AUTH'));
    }

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
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
 * Verify user is a super admin
 * Use this for critical endpoints that only super admins should access
 *
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'NO_AUTH'));
    }

    if (req.user.role !== 'super_admin') {
        logger.warn('Super admin access denied', {
            userId: req.user.id,
            role: req.user.role,
            requestId: req.requestId
        });

        return next(new AppError('Super admin access required', 403, 'SUPER_ADMIN_REQUIRED'));
    }

    next();
};

/**
 * Verify user's account is active
 *
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requireActiveAccount = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'NO_AUTH'));
    }

    if (!req.user.isActive) {
        logger.warn('Inactive account access attempt', {
            userId: req.user.id,
            email: req.user.email,
            requestId: req.requestId
        });

        return next(new AppError('Your account has been deactivated', 403, 'ACCOUNT_DEACTIVATED'));
    }

    next();
};

/**
 * Verify session has MFA verification
 * Use this for endpoints that require MFA-verified sessions
 *
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requireMfaVerified = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'NO_AUTH'));
    }

    if (!req.session || !req.session.isMfaVerified) {
        logger.warn('MFA verification required', {
            userId: req.user.id,
            sessionId: req.session?.sessionId,
            requestId: req.requestId
        });

        return next(new AppError('MFA verification required', 403, 'MFA_REQUIRED'));
    }

    next();
};

module.exports = {
    authenticate,
    optionalAuthenticate,
    requireAdmin,
    requireSuperAdmin,
    requireActiveAccount,
    requireMfaVerified
};
