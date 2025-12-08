/**
 * @fileoverview Permission Middleware
 * @module shared/lib/middleware/permission-middleware
 * @description Authorization middleware for role and permission-based access control
 */

const { AppError } = require('../utils/app-error');
const { createLogger } = require('../utils/logger');

const logger = createLogger({ serviceName: 'permission-middleware' });

/**
 * Default role hierarchy (higher index = more permissions)
 * Can be overridden via configuration
 */
const DEFAULT_ROLE_HIERARCHY = {
    viewer: 0,
    user: 1,
    member: 2,
    consultant: 3,
    editor: 4,
    manager: 5,
    admin: 6,
    superadmin: 7,
    owner: 8
};

/**
 * Default permission mappings for common resources
 * Maps actions to required permission levels
 */
const DEFAULT_PERMISSION_ACTIONS = {
    view: ['view', 'read', 'list'],
    create: ['create', 'add', 'new'],
    update: ['update', 'edit', 'modify'],
    delete: ['delete', 'remove', 'destroy'],
    manage: ['manage', 'admin', 'full'],
    approve: ['approve', 'reject'],
    assign: ['assign', 'unassign'],
    reports: ['reports', 'analytics', 'export'],
    assess: ['assess', 'evaluate'],
    endorse: ['endorse'],
    verify: ['verify', 'certify'],
    'log-time': ['log-time', 'time-entry']
};

/**
 * Check if user has a specific role
 * @param {Object} user - User object
 * @param {string|Array} requiredRoles - Required role(s)
 * @returns {boolean} Whether user has the role
 */
const hasRole = (user, requiredRoles) => {
    if (!user || !user.roles || !Array.isArray(user.roles)) {
        return false;
    }

    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return roles.some(role => user.roles.includes(role));
};

/**
 * Check if user has a specific permission
 * @param {Object} user - User object
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {boolean} Whether user has the permission
 */
const hasPermission = (user, resource, action) => {
    if (!user) {
        return false;
    }

    // Superadmin has all permissions
    if (hasRole(user, ['superadmin', 'owner'])) {
        return true;
    }

    // Check explicit permissions array
    if (user.permissions && Array.isArray(user.permissions)) {
        const permissionString = `${resource}:${action}`;
        const wildcardPermission = `${resource}:*`;
        const globalWildcard = '*:*';

        if (user.permissions.includes(permissionString) ||
            user.permissions.includes(wildcardPermission) ||
            user.permissions.includes(globalWildcard)) {
            return true;
        }

        // Check for action aliases
        const actionAliases = DEFAULT_PERMISSION_ACTIONS[action] || [action];
        for (const alias of actionAliases) {
            if (user.permissions.includes(`${resource}:${alias}`)) {
                return true;
            }
        }
    }

    // Check role-based permissions
    if (user.roles && Array.isArray(user.roles)) {
        // Admin roles get most permissions
        if (hasRole(user, ['admin', 'superadmin', 'owner'])) {
            return true;
        }

        // Manager roles get manage permissions
        if (hasRole(user, ['manager']) && ['view', 'create', 'update', 'manage', 'approve'].includes(action)) {
            return true;
        }

        // Editor roles get edit permissions
        if (hasRole(user, ['editor']) && ['view', 'create', 'update'].includes(action)) {
            return true;
        }

        // Member/User roles get basic permissions
        if (hasRole(user, ['member', 'user', 'consultant']) && ['view'].includes(action)) {
            return true;
        }
    }

    return false;
};

/**
 * Check if user role is at or above required level in hierarchy
 * @param {Object} user - User object
 * @param {string} requiredRole - Minimum required role
 * @param {Object} roleHierarchy - Role hierarchy mapping
 * @returns {boolean} Whether user meets role requirement
 */
const meetsRoleLevel = (user, requiredRole, roleHierarchy = DEFAULT_ROLE_HIERARCHY) => {
    if (!user || !user.roles || !Array.isArray(user.roles)) {
        return false;
    }

    const requiredLevel = roleHierarchy[requiredRole] ?? 0;
    const userMaxLevel = Math.max(...user.roles.map(role => roleHierarchy[role] ?? 0));

    return userMaxLevel >= requiredLevel;
};

/**
 * Authorization middleware - check if user has required roles
 * @param {...string} requiredRoles - Required roles (user must have at least one)
 * @returns {Function} Express middleware function
 */
const authorize = (...requiredRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            if (requiredRoles.length === 0) {
                return next();
            }

            const userHasRole = hasRole(req.user, requiredRoles);

            if (!userHasRole) {
                logger.warn('Authorization failed - missing role', {
                    userId: req.user.id,
                    userRoles: req.user.roles,
                    requiredRoles,
                    path: req.path
                });

                throw AppError.authorization('Insufficient role privileges');
            }

            logger.debug('Authorization successful', {
                userId: req.user.id,
                matchedRole: req.user.roles.find(r => requiredRoles.includes(r))
            });

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Authorization failed',
                    code: 'AUTHORIZATION_ERROR'
                }
            });
        }
    };
};

/**
 * Permission check middleware - check if user has required permission
 * @param {string} resource - Resource name (e.g., 'consultants', 'projects')
 * @param {string} action - Action name (e.g., 'view', 'create', 'update', 'delete')
 * @returns {Function} Express middleware function
 */
const checkPermission = (resource, action) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            const permitted = hasPermission(req.user, resource, action);

            if (!permitted) {
                logger.warn('Permission denied', {
                    userId: req.user.id,
                    resource,
                    action,
                    userPermissions: req.user.permissions,
                    userRoles: req.user.roles,
                    path: req.path
                });

                throw AppError.authorization(`Permission denied: ${resource}:${action}`);
            }

            logger.debug('Permission granted', {
                userId: req.user.id,
                resource,
                action
            });

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Permission check failed',
                    code: 'PERMISSION_ERROR'
                }
            });
        }
    };
};

/**
 * Check multiple permissions (user must have ALL)
 * @param {Array<Object>} permissions - Array of {resource, action} objects
 * @returns {Function} Express middleware function
 */
const checkAllPermissions = (permissions) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            const missingPermissions = permissions.filter(
                ({ resource, action }) => !hasPermission(req.user, resource, action)
            );

            if (missingPermissions.length > 0) {
                logger.warn('Multiple permissions denied', {
                    userId: req.user.id,
                    missingPermissions,
                    path: req.path
                });

                throw AppError.authorization('Insufficient permissions');
            }

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Permission check failed',
                    code: 'PERMISSION_ERROR'
                }
            });
        }
    };
};

/**
 * Check any permission (user must have AT LEAST ONE)
 * @param {Array<Object>} permissions - Array of {resource, action} objects
 * @returns {Function} Express middleware function
 */
const checkAnyPermission = (permissions) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            const hasAny = permissions.some(
                ({ resource, action }) => hasPermission(req.user, resource, action)
            );

            if (!hasAny) {
                logger.warn('No matching permissions found', {
                    userId: req.user.id,
                    requiredPermissions: permissions,
                    path: req.path
                });

                throw AppError.authorization('Insufficient permissions');
            }

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Permission check failed',
                    code: 'PERMISSION_ERROR'
                }
            });
        }
    };
};

/**
 * Role level check middleware - check if user meets minimum role level
 * @param {string} minRole - Minimum required role in hierarchy
 * @param {Object} roleHierarchy - Custom role hierarchy (optional)
 * @returns {Function} Express middleware function
 */
const requireRoleLevel = (minRole, roleHierarchy = DEFAULT_ROLE_HIERARCHY) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            if (!meetsRoleLevel(req.user, minRole, roleHierarchy)) {
                logger.warn('Role level insufficient', {
                    userId: req.user.id,
                    userRoles: req.user.roles,
                    requiredRole: minRole,
                    path: req.path
                });

                throw AppError.authorization(`Minimum role required: ${minRole}`);
            }

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Role check failed',
                    code: 'ROLE_ERROR'
                }
            });
        }
    };
};

/**
 * Resource ownership check middleware
 * Checks if user owns the resource they're trying to access
 * @param {Function} getResourceOwnerId - Function to extract owner ID from request
 * @returns {Function} Express middleware function
 */
const checkOwnership = (getResourceOwnerId) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            // Admins bypass ownership check
            if (hasRole(req.user, ['admin', 'superadmin', 'owner'])) {
                return next();
            }

            const ownerId = await getResourceOwnerId(req);

            if (!ownerId) {
                throw AppError.notFound('Resource');
            }

            const userId = req.user.id || req.user._id;

            if (ownerId.toString() !== userId.toString()) {
                logger.warn('Ownership check failed', {
                    userId,
                    resourceOwnerId: ownerId,
                    path: req.path
                });

                throw AppError.authorization('You do not own this resource');
            }

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Ownership check failed',
                    code: 'OWNERSHIP_ERROR'
                }
            });
        }
    };
};

/**
 * Tenant isolation middleware
 * Ensures user can only access resources within their tenant
 * @param {Function} getResourceTenantId - Function to extract tenant ID from request/resource
 * @returns {Function} Express middleware function
 */
const checkTenantAccess = (getResourceTenantId) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.tenantId) {
                throw AppError.authentication('Authentication and tenant context required');
            }

            // Platform admins can access all tenants
            if (hasRole(req.user, ['platform_admin', 'superadmin'])) {
                return next();
            }

            const resourceTenantId = await getResourceTenantId(req);

            if (!resourceTenantId) {
                return next(); // New resource, will be assigned to user's tenant
            }

            if (resourceTenantId.toString() !== req.tenantId.toString()) {
                logger.warn('Tenant access denied', {
                    userId: req.user.id,
                    userTenantId: req.tenantId,
                    resourceTenantId,
                    path: req.path
                });

                throw AppError.authorization('Access denied to this tenant resource');
            }

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Tenant access check failed',
                    code: 'TENANT_ACCESS_ERROR'
                }
            });
        }
    };
};

/**
 * Combined authorization and permission middleware
 * @param {Object} options - Authorization options
 * @param {Array<string>} options.roles - Required roles (at least one)
 * @param {Array<Object>} options.permissions - Required permissions
 * @param {string} options.minRole - Minimum role level
 * @param {boolean} options.requireAll - Require all permissions (default: false)
 * @returns {Function} Express middleware function
 */
const authorizeWith = (options = {}) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.authentication('Authentication required');
            }

            // Check roles if specified
            if (options.roles && options.roles.length > 0) {
                if (!hasRole(req.user, options.roles)) {
                    throw AppError.authorization('Insufficient role privileges');
                }
            }

            // Check minimum role level if specified
            if (options.minRole) {
                if (!meetsRoleLevel(req.user, options.minRole)) {
                    throw AppError.authorization(`Minimum role required: ${options.minRole}`);
                }
            }

            // Check permissions if specified
            if (options.permissions && options.permissions.length > 0) {
                if (options.requireAll) {
                    const allPermitted = options.permissions.every(
                        ({ resource, action }) => hasPermission(req.user, resource, action)
                    );
                    if (!allPermitted) {
                        throw AppError.authorization('Missing required permissions');
                    }
                } else {
                    const anyPermitted = options.permissions.some(
                        ({ resource, action }) => hasPermission(req.user, resource, action)
                    );
                    if (!anyPermitted) {
                        throw AppError.authorization('Missing required permissions');
                    }
                }
            }

            next();
        } catch (error) {
            if (error instanceof AppError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        message: error.message,
                        code: error.code
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Authorization failed',
                    code: 'AUTHORIZATION_ERROR'
                }
            });
        }
    };
};

module.exports = {
    // Main middleware functions
    authorize,
    checkPermission,
    checkAllPermissions,
    checkAnyPermission,
    requireRoleLevel,
    checkOwnership,
    checkTenantAccess,
    authorizeWith,

    // Helper functions
    hasRole,
    hasPermission,
    meetsRoleLevel,

    // Constants
    DEFAULT_ROLE_HIERARCHY,
    DEFAULT_PERMISSION_ACTIONS
};