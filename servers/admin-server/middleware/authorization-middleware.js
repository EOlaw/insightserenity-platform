/**
 * @fileoverview Authorization Middleware
 * @module servers/admin-server/middleware/authorization-middleware
 * @description Permission-based access control middleware
 * @version 1.0.0
 */

'use strict';

const { AppError } = require('../../../shared/lib/utils/app-error');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'authorization-middleware' });

/**
 * Authorization Middleware
 * Checks if authenticated user has required permissions
 *
 * @param {Array<string>} requiredPermissions - Array of required permissions (e.g., ['users:read', 'users:write'])
 * @returns {Function} Express middleware function
 *
 * @example
 * // Single permission
 * router.get('/users', authenticate, authorize(['users:read']), UserController.getAllUsers);
 *
 * @example
 * // Multiple permissions (user must have ALL)
 * router.post('/users', authenticate, authorize(['users:create', 'users:write']), UserController.createUser);
 */
function authorize(requiredPermissions = []) {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated first
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
      }

      // If no permissions required, allow access
      if (!requiredPermissions || requiredPermissions.length === 0) {
        return next();
      }

      // Super admin bypasses all permission checks
      if (req.user.role === 'super_admin') {
        logger.debug('Super admin access granted', {
          userId: req.user.id,
          endpoint: req.path
        });
        return next();
      }

      // Get user's permissions
      const userPermissions = req.user.permissions || [];

      // Convert ObjectIds to strings if necessary
      const userPermissionStrings = userPermissions.map(perm =>
        typeof perm === 'object' && perm.name ? perm.name : perm.toString()
      );

      // Check if user has ALL required permissions
      const hasAllPermissions = requiredPermissions.every(requiredPerm =>
        userPermissionStrings.includes(requiredPerm)
      );

      if (!hasAllPermissions) {
        // Log unauthorized access attempt
        logger.warn('Unauthorized access attempt', {
          userId: req.user.id,
          email: req.user.email,
          role: req.user.role,
          requiredPermissions,
          userPermissions: userPermissionStrings,
          endpoint: req.path,
          method: req.method
        });

        throw new AppError(
          'You do not have permission to perform this action',
          403,
          'INSUFFICIENT_PERMISSIONS'
        );
      }

      // Log successful authorization
      logger.debug('Authorization successful', {
        userId: req.user.id,
        requiredPermissions,
        endpoint: req.path
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has ANY of the required permissions (OR logic)
 *
 * @param {Array<string>} requiredPermissions - Array of permissions (user needs at least one)
 * @returns {Function} Express middleware function
 *
 * @example
 * // User needs either users:read OR users:write
 * router.get('/users', authenticate, authorizeAny(['users:read', 'users:write']), UserController.getAllUsers);
 */
function authorizeAny(requiredPermissions = []) {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated first
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
      }

      // If no permissions required, allow access
      if (!requiredPermissions || requiredPermissions.length === 0) {
        return next();
      }

      // Super admin bypasses all permission checks
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Get user's permissions
      const userPermissions = req.user.permissions || [];

      // Convert ObjectIds to strings if necessary
      const userPermissionStrings = userPermissions.map(perm =>
        typeof perm === 'object' && perm.name ? perm.name : perm.toString()
      );

      // Check if user has ANY of the required permissions
      const hasAnyPermission = requiredPermissions.some(requiredPerm =>
        userPermissionStrings.includes(requiredPerm)
      );

      if (!hasAnyPermission) {
        logger.warn('Unauthorized access attempt (authorizeAny)', {
          userId: req.user.id,
          email: req.user.email,
          requiredPermissions,
          userPermissions: userPermissionStrings,
          endpoint: req.path
        });

        throw new AppError(
          'You do not have permission to perform this action',
          403,
          'INSUFFICIENT_PERMISSIONS'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has a specific role
 *
 * @param {Array<string>} allowedRoles - Array of allowed roles
 * @returns {Function} Express middleware function
 *
 * @example
 * // Only super_admin and admin can access
 * router.delete('/users/:id', authenticate, authorizeRole(['super_admin', 'admin']), UserController.deleteUser);
 */
function authorizeRole(allowedRoles = []) {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated first
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
      }

      // If no roles specified, allow access
      if (!allowedRoles || allowedRoles.length === 0) {
        return next();
      }

      // Check if user's role is in allowed roles
      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Unauthorized access attempt (role check)', {
          userId: req.user.id,
          email: req.user.email,
          userRole: req.user.role,
          allowedRoles,
          endpoint: req.path
        });

        throw new AppError(
          'Your role does not have access to this resource',
          403,
          'ROLE_NOT_AUTHORIZED'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user is accessing their own resource
 * Useful for endpoints like /users/:userId where users can only access their own data
 *
 * @param {string} userIdParam - Name of the route parameter containing user ID (default: 'userId')
 * @returns {Function} Express middleware function
 *
 * @example
 * // Users can only access their own profile
 * router.get('/users/:userId/profile', authenticate, authorizeSelf(), UserController.getProfile);
 */
function authorizeSelf(userIdParam = 'userId') {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated first
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
      }

      // Super admin can access any resource
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Get the user ID from route params
      const targetUserId = req.params[userIdParam];

      // Check if user is accessing their own resource
      if (targetUserId !== req.user.id) {
        logger.warn('Unauthorized self-access attempt', {
          userId: req.user.id,
          targetUserId,
          endpoint: req.path
        });

        throw new AppError(
          'You can only access your own resources',
          403,
          'SELF_ACCESS_ONLY'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  authorize,
  authorizeAny,
  authorizeRole,
  authorizeSelf
};
