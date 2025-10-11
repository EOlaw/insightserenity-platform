/**
 * @fileoverview Authorization and Permission Middleware
 * @module shared/lib/middleware/permissions
 * @description Comprehensive permission checking middleware with role-based and attribute-based access control
 */

const { AppError } = require('../../../shared/lib/utils/app-error');
const logger = require('../../../shared/lib/utils/logger').createLogger({
    serviceName: 'permissions-middleware'
});

/**
 * Permission action types
 */
const PermissionActions = {
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    EXPORT: 'export',
    IMPORT: 'import',
    SHARE: 'share',
    MANAGE: 'manage',
    EXECUTE: 'execute',
    APPROVE: 'approve'
};

/**
 * System roles hierarchy
 */
const SystemRoles = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    USER: 'user',
    GUEST: 'guest'
};

/**
 * Role hierarchy levels (higher number = more privileges)
 */
const RoleHierarchy = {
    [SystemRoles.SUPER_ADMIN]: 1000,
    [SystemRoles.ADMIN]: 800,
    [SystemRoles.MANAGER]: 600,
    [SystemRoles.USER]: 400,
    [SystemRoles.GUEST]: 200
};

/**
 * Permission checker class
 */
class PermissionChecker {
    /**
     * Check if user has required permission
     * @param {Object} user - User object with roles and permissions
     * @param {string|Array} requiredPermission - Required permission(s)
     * @param {Object} options - Check options
     * @returns {boolean} Whether user has permission
     */
    static hasPermission(user, requiredPermission, options = {}) {
        if (!user) {
            logger.warn('Permission check attempted without user');
            return false;
        }

        // Super admins have all permissions
        if (this._isSuperAdmin(user)) {
            logger.debug('Super admin access granted', { userId: user.id });
            return true;
        }

        // Handle array of permissions (user needs at least one)
        if (Array.isArray(requiredPermission)) {
            const hasAny = requiredPermission.some(perm => 
                this._checkSinglePermission(user, perm, options)
            );
            
            if (!hasAny) {
                logger.warn('User lacks required permissions', {
                    userId: user.id,
                    required: requiredPermission,
                    userPermissions: user.permissions
                });
            }
            
            return hasAny;
        }

        // Check single permission
        return this._checkSinglePermission(user, requiredPermission, options);
    }

    /**
     * Check if user has all required permissions
     * @param {Object} user - User object
     * @param {Array} requiredPermissions - Array of required permissions
     * @param {Object} options - Check options
     * @returns {boolean} Whether user has all permissions
     */
    static hasAllPermissions(user, requiredPermissions, options = {}) {
        if (!user) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        return requiredPermissions.every(perm => 
            this._checkSinglePermission(user, perm, options)
        );
    }

    /**
     * Check if user has required role
     * @param {Object} user - User object
     * @param {string|Array} requiredRole - Required role(s)
     * @returns {boolean} Whether user has role
     */
    static hasRole(user, requiredRole) {
        if (!user || !user.roles) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];

        if (Array.isArray(requiredRole)) {
            return requiredRole.some(role => userRoles.includes(role));
        }

        return userRoles.includes(requiredRole);
    }

    /**
     * Check if user has minimum role level
     * @param {Object} user - User object
     * @param {string} minimumRole - Minimum required role
     * @returns {boolean} Whether user meets minimum role level
     */
    static hasMinimumRole(user, minimumRole) {
        if (!user || !user.roles) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
        const minimumLevel = RoleHierarchy[minimumRole] || 0;

        return userRoles.some(role => {
            const roleLevel = RoleHierarchy[role] || 0;
            return roleLevel >= minimumLevel;
        });
    }

    /**
     * Check single permission
     * @private
     */
    static _checkSinglePermission(user, permission, options) {
        // Check direct permissions
        if (user.permissions && Array.isArray(user.permissions)) {
            if (user.permissions.includes(permission)) {
                return true;
            }

            // Check wildcard permissions
            const permissionParts = permission.split(':');
            const wildcardPermission = `${permissionParts[0]}:*`;
            if (user.permissions.includes(wildcardPermission)) {
                return true;
            }

            // Check global wildcard
            if (user.permissions.includes('*:*') || user.permissions.includes('*')) {
                return true;
            }
        }

        // Check role-based permissions
        if (options.rolePermissions && user.roles) {
            const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
            return userRoles.some(role => {
                const rolePerms = options.rolePermissions[role] || [];
                return rolePerms.includes(permission);
            });
        }

        return false;
    }

    /**
     * Check if user is super admin
     * @private
     */
    static _isSuperAdmin(user) {
        if (!user || !user.roles) {
            return false;
        }

        const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
        return userRoles.includes(SystemRoles.SUPER_ADMIN);
    }

    /**
     * Check resource ownership
     * @param {Object} user - User object
     * @param {Object} resource - Resource to check
     * @param {Object} options - Check options
     * @returns {boolean} Whether user owns resource
     */
    static ownsResource(user, resource, options = {}) {
        if (!user || !resource) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        const ownerField = options.ownerField || 'createdBy';
        const userId = user.id || user._id;
        const resourceOwnerId = resource[ownerField]?.toString() || resource[ownerField];

        return userId?.toString() === resourceOwnerId;
    }

    /**
     * Check tenant access
     * @param {Object} user - User object
     * @param {string} tenantId - Tenant ID to check
     * @returns {boolean} Whether user has access to tenant
     */
    static hasTenantAccess(user, tenantId) {
        if (!user || !tenantId) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        return user.tenantId?.toString() === tenantId.toString();
    }

    /**
     * Check organization access
     * @param {Object} user - User object
     * @param {string} organizationId - Organization ID to check
     * @returns {boolean} Whether user has access to organization
     */
    static hasOrganizationAccess(user, organizationId) {
        if (!user || !organizationId) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        return user.organizationId?.toString() === organizationId.toString();
    }
}

/**
 * Permission middleware factory
 * @param {string|Array|Function} permission - Required permission(s) or check function
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function checkPermission(permission, options = {}) {
    const {
        requireAll = false,
        allowOwner = false,
        ownerField = 'createdBy',
        errorMessage = 'Insufficient permissions',
        rolePermissions = null
    } = options;

    return async (req, res, next) => {
        try {
            // Ensure user is authenticated
            if (!req.user) {
                logger.warn('Permission check without authenticated user', {
                    path: req.path,
                    method: req.method
                });
                throw AppError.unauthorized('Authentication required');
            }

            const user = req.user;

            // Handle custom permission check function
            if (typeof permission === 'function') {
                const allowed = await permission(req, user);
                if (!allowed) {
                    logger.warn('Custom permission check failed', {
                        userId: user.id,
                        path: req.path
                    });
                    throw AppError.forbidden(errorMessage);
                }
                return next();
            }

            // Check if user has required permission(s)
            let hasPermission = false;

            if (requireAll && Array.isArray(permission)) {
                hasPermission = PermissionChecker.hasAllPermissions(user, permission, {
                    rolePermissions
                });
            } else {
                hasPermission = PermissionChecker.hasPermission(user, permission, {
                    rolePermissions
                });
            }

            // If user doesn't have permission, check ownership if allowed
            if (!hasPermission && allowOwner) {
                // Try to determine resource from request
                const resourceId = req.params.id || req.params.resourceId;
                if (resourceId) {
                    // In a real implementation, you would fetch the resource
                    // and check ownership. This is a simplified example.
                    logger.debug('Checking resource ownership', {
                        userId: user.id,
                        resourceId
                    });
                    // hasPermission = await checkResourceOwnership(user, resourceId, ownerField);
                }
            }

            if (!hasPermission) {
                logger.warn('Permission denied', {
                    userId: user.id,
                    required: permission,
                    userPermissions: user.permissions,
                    userRoles: user.roles,
                    path: req.path,
                    method: req.method
                });

                throw AppError.forbidden(errorMessage, {
                    context: {
                        required: permission,
                        userId: user.id
                    }
                });
            }

            // Permission granted
            logger.debug('Permission granted', {
                userId: user.id,
                permission,
                path: req.path
            });

            next();

        } catch (error) {
            if (error instanceof AppError) {
                next(error);
            } else {
                logger.error('Permission middleware error', {
                    error: error.message,
                    stack: error.stack
                });
                next(AppError.internal('Permission checking error'));
            }
        }
    };
}

/**
 * Role checking middleware
 * @param {string|Array} role - Required role(s)
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function checkRole(role, options = {}) {
    const {
        requireAll = false,
        errorMessage = 'Insufficient role privileges'
    } = options;

    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.unauthorized('Authentication required');
            }

            const hasRole = Array.isArray(role) && requireAll
                ? role.every(r => PermissionChecker.hasRole(req.user, r))
                : PermissionChecker.hasRole(req.user, role);

            if (!hasRole) {
                logger.warn('Role check failed', {
                    userId: req.user.id,
                    required: role,
                    userRoles: req.user.roles
                });
                throw AppError.forbidden(errorMessage);
            }

            next();

        } catch (error) {
            next(error);
        }
    };
}

/**
 * Minimum role level middleware
 * @param {string} minimumRole - Minimum required role
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function checkMinimumRole(minimumRole, options = {}) {
    const {
        errorMessage = 'Insufficient role level'
    } = options;

    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.unauthorized('Authentication required');
            }

            if (!PermissionChecker.hasMinimumRole(req.user, minimumRole)) {
                logger.warn('Minimum role check failed', {
                    userId: req.user.id,
                    required: minimumRole,
                    userRoles: req.user.roles
                });
                throw AppError.forbidden(errorMessage);
            }

            next();

        } catch (error) {
            next(error);
        }
    };
}

/**
 * Resource ownership middleware
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function checkOwnership(options = {}) {
    const {
        resourceIdParam = 'id',
        ownerField = 'createdBy',
        allowAdmin = true,
        errorMessage = 'Access denied to this resource'
    } = options;

    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.unauthorized('Authentication required');
            }

            // Allow admins to bypass ownership check
            if (allowAdmin && PermissionChecker.hasMinimumRole(req.user, SystemRoles.ADMIN)) {
                return next();
            }

            const resourceId = req.params[resourceIdParam];
            if (!resourceId) {
                throw AppError.validation('Resource ID is required');
            }

            // In a real implementation, fetch the resource and check ownership
            // This is a simplified example
            logger.debug('Checking resource ownership', {
                userId: req.user.id,
                resourceId
            });

            // const resource = await fetchResource(resourceId);
            // if (!PermissionChecker.ownsResource(req.user, resource, { ownerField })) {
            //     throw AppError.forbidden(errorMessage);
            // }

            next();

        } catch (error) {
            next(error);
        }
    };
}

/**
 * Tenant access middleware
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function checkTenantAccess(options = {}) {
    const {
        tenantIdSource = 'params', // 'params', 'body', 'query', 'headers'
        tenantIdField = 'tenantId',
        errorMessage = 'Access denied to this tenant'
    } = options;

    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.unauthorized('Authentication required');
            }

            // Super admins have access to all tenants
            if (PermissionChecker._isSuperAdmin(req.user)) {
                return next();
            }

            let tenantId;
            switch (tenantIdSource) {
                case 'params':
                    tenantId = req.params[tenantIdField];
                    break;
                case 'body':
                    tenantId = req.body[tenantIdField];
                    break;
                case 'query':
                    tenantId = req.query[tenantIdField];
                    break;
                case 'headers':
                    tenantId = req.headers['x-tenant-id'] || req.headers[tenantIdField];
                    break;
                default:
                    tenantId = req.user.tenantId;
            }

            if (!tenantId) {
                // If no tenant ID specified, use user's tenant
                return next();
            }

            if (!PermissionChecker.hasTenantAccess(req.user, tenantId)) {
                logger.warn('Tenant access denied', {
                    userId: req.user.id,
                    userTenantId: req.user.tenantId,
                    requestedTenantId: tenantId
                });
                throw AppError.forbidden(errorMessage);
            }

            next();

        } catch (error) {
            next(error);
        }
    };
}

/**
 * Combine multiple permission checks
 * @param {Array} checks - Array of middleware functions
 * @param {Object} options - Options
 * @returns {Function} Combined middleware
 */
function combinePermissions(checks, options = {}) {
    const { requireAll = true } = options;

    if (requireAll) {
        // All checks must pass
        return (req, res, next) => {
            let index = 0;
            
            const runNext = (err) => {
                if (err) return next(err);
                
                if (index >= checks.length) {
                    return next();
                }
                
                const check = checks[index++];
                check(req, res, runNext);
            };
            
            runNext();
        };
    } else {
        // At least one check must pass
        return async (req, res, next) => {
            let lastError = null;
            
            for (const check of checks) {
                try {
                    await new Promise((resolve, reject) => {
                        check(req, res, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    return next(); // One check passed, continue
                } catch (error) {
                    lastError = error;
                }
            }
            
            // All checks failed
            next(lastError || AppError.forbidden('Permission denied'));
        };
    }
}

/**
 * Permission presets for common scenarios
 */
const PermissionPresets = {
    /**
     * Admin only access
     */
    adminOnly: () => checkMinimumRole(SystemRoles.ADMIN),

    /**
     * Manager or above access
     */
    managerAccess: () => checkMinimumRole(SystemRoles.MANAGER),

    /**
     * Authenticated user access
     */
    authenticatedAccess: () => (req, res, next) => {
        if (!req.user) {
            return next(AppError.unauthorized('Authentication required'));
        }
        next();
    },

    /**
     * Owner or admin access
     */
    ownerOrAdmin: (options = {}) => combinePermissions([
        checkOwnership(options),
        checkMinimumRole(SystemRoles.ADMIN)
    ], { requireAll: false })
};

module.exports = {
    checkPermission,
    checkRole,
    checkMinimumRole,
    checkOwnership,
    checkTenantAccess,
    combinePermissions,
    PermissionChecker,
    PermissionActions,
    SystemRoles,
    RoleHierarchy,
    PermissionPresets
};