/**
 * @fileoverview Permission Authorization Middleware
 * @module servers/admin-server/middleware/permission-middleware
 * @description Handles permission-based authorization for admin server resources
 * @version 1.0.0
 */

'use strict';

const { AppError } = require('../../../shared/lib/utils/app-error');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'permission-middleware' });

/**
 * Check if user has required permission
 * @param {string} requiredPermission - Permission required to access resource
 * @returns {Function} Express middleware function
 */
const authorize = (requiredPermission) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError('Authentication required', 401, 'NO_AUTH');
            }

            // Superadmin has access to everything
            if (req.user.role === 'superadmin') {
                logger.debug('Superadmin access granted', {
                    userId: req.user.id,
                    permission: requiredPermission,
                    requestId: req.requestId
                });
                return next();
            }

            // Check if user has the required permission
            const userPermissions = req.user.permissions || [];

            if (!userPermissions.includes(requiredPermission)) {
                logger.warn('Permission denied', {
                    userId: req.user.id,
                    requiredPermission,
                    userPermissions,
                    requestId: req.requestId
                });

                throw new AppError(
                    `Permission denied: ${requiredPermission} required`,
                    403,
                    'PERMISSION_DENIED'
                );
            }

            logger.debug('Permission granted', {
                userId: req.user.id,
                permission: requiredPermission,
                requestId: req.requestId
            });

            next();
        } catch (error) {
            logger.error('Authorization error', {
                error: error.message,
                requestId: req.requestId
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError('Authorization failed', 403, 'AUTH_FAILED'));
        }
    };
};

/**
 * Check if user has any of the required permissions
 * @param {string[]} requiredPermissions - Array of permissions (user needs at least one)
 * @returns {Function} Express middleware function
 */
const authorizeAny = (requiredPermissions) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError('Authentication required', 401, 'NO_AUTH');
            }

            // Superadmin has access to everything
            if (req.user.role === 'superadmin') {
                return next();
            }

            const userPermissions = req.user.permissions || [];

            const hasPermission = requiredPermissions.some(permission =>
                userPermissions.includes(permission)
            );

            if (!hasPermission) {
                logger.warn('Permission denied - no matching permissions', {
                    userId: req.user.id,
                    requiredPermissions,
                    userPermissions,
                    requestId: req.requestId
                });

                throw new AppError(
                    'Permission denied: insufficient permissions',
                    403,
                    'PERMISSION_DENIED'
                );
            }

            logger.debug('Permission granted (any match)', {
                userId: req.user.id,
                requiredPermissions,
                requestId: req.requestId
            });

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError('Authorization failed', 403, 'AUTH_FAILED'));
        }
    };
};

/**
 * Check if user has all of the required permissions
 * @param {string[]} requiredPermissions - Array of permissions (user needs all)
 * @returns {Function} Express middleware function
 */
const authorizeAll = (requiredPermissions) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError('Authentication required', 401, 'NO_AUTH');
            }

            // Superadmin has access to everything
            if (req.user.role === 'superadmin') {
                return next();
            }

            const userPermissions = req.user.permissions || [];

            const hasAllPermissions = requiredPermissions.every(permission =>
                userPermissions.includes(permission)
            );

            if (!hasAllPermissions) {
                logger.warn('Permission denied - missing required permissions', {
                    userId: req.user.id,
                    requiredPermissions,
                    userPermissions,
                    requestId: req.requestId
                });

                throw new AppError(
                    'Permission denied: all permissions required',
                    403,
                    'PERMISSION_DENIED'
                );
            }

            logger.debug('Permission granted (all matched)', {
                userId: req.user.id,
                requiredPermissions,
                requestId: req.requestId
            });

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError('Authorization failed', 403, 'AUTH_FAILED'));
        }
    };
};

/**
 * Check if user owns the resource or has admin permissions
 * @param {Function} ownershipCheck - Function that returns true if user owns resource
 * @returns {Function} Express middleware function
 */
const authorizeOwnerOrAdmin = (ownershipCheck) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError('Authentication required', 401, 'NO_AUTH');
            }

            // Superadmin and admin have access
            if (req.user.role === 'superadmin' || req.user.role === 'admin') {
                return next();
            }

            // Check ownership
            const isOwner = await ownershipCheck(req);

            if (!isOwner) {
                logger.warn('Ownership check failed', {
                    userId: req.user.id,
                    requestId: req.requestId
                });

                throw new AppError(
                    'Access denied: resource ownership required',
                    403,
                    'OWNERSHIP_REQUIRED'
                );
            }

            logger.debug('Ownership verified', {
                userId: req.user.id,
                requestId: req.requestId
            });

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError('Authorization failed', 403, 'AUTH_FAILED'));
        }
    };
};

/**
 * Check if user has permission for specific resource action
 * @param {string} resource - Resource name (e.g., 'users', 'posts')
 * @param {string} action - Action name (e.g., 'read', 'write', 'delete')
 * @returns {Function} Express middleware function
 */
const authorizeResource = (resource, action) => {
    const permission = `${resource}:${action}`;
    return authorize(permission);
};

module.exports = {
    authorize,
    authorizeAny,
    authorizeAll,
    authorizeOwnerOrAdmin,
    authorizeResource
};