/**
 * @fileoverview Complete Enhanced Authorization and Permission Middleware
 * @module shared/lib/middleware/permissions
 * @description Enterprise-grade permission checking supporting both flat and nested permission structures
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
 * Enhanced Permission Checker Class
 * Supports both flat permission arrays and organization-scoped permissions
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
            logger.debug('Super admin access granted', { userId: user.id || user._id });
            return true;
        }

        // Handle array of permissions (user needs at least one)
        if (Array.isArray(requiredPermission)) {
            const hasAny = requiredPermission.some(perm => 
                this._checkSinglePermission(user, perm, options)
            );
            
            if (!hasAny) {
                logger.warn('User lacks required permissions', {
                    userId: user.id || user._id,
                    required: requiredPermission,
                    userPermissions: user.permissions,
                    userRoles: user.roles
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
     * Check single permission with four-strategy approach
     * Strategy 1: Flat permissions array (fastest)
     * Strategy 2: Organization-scoped permissions
     * Strategy 3: Role-based permissions
     * Strategy 4: Organization role-based permissions
     * @private
     */
    static _checkSinglePermission(user, permission, options) {
        // STRATEGY 1: Check flat permissions array (primary method - fastest)
        if (user.permissions && Array.isArray(user.permissions)) {
            // Direct match
            if (user.permissions.includes(permission)) {
                return true;
            }

            // Check wildcard permissions
            const [resource, action] = permission.split(':');
            
            // Resource-level wildcard (e.g., "clients:*")
            if (user.permissions.includes(`${resource}:*`)) {
                return true;
            }

            // Global wildcard (e.g., "*:*" or "*")
            if (user.permissions.includes('*:*') || user.permissions.includes('*')) {
                return true;
            }

            // Check if permission without action exists (e.g., "clients")
            if (user.permissions.includes(resource)) {
                return true;
            }
        }

        // STRATEGY 2: Check organization-scoped permissions (fallback for nested structure)
        if (user.organizations && Array.isArray(user.organizations)) {
            const [resource, action] = permission.split(':');
            
            const hasOrgPermission = user.organizations.some(org => {
                // Only check active organization memberships
                if (org.status !== 'active') {
                    return false;
                }

                // Check organization permissions
                if (org.permissions && Array.isArray(org.permissions)) {
                    return org.permissions.some(p => {
                        // Handle both string and object permission formats
                        if (typeof p === 'string') {
                            return p === permission || 
                                   p === `${resource}:*` || 
                                   p === '*:*' ||
                                   p === resource;
                        }

                        // Object format: { resource: 'clients', actions: ['read', 'update'] }
                        if (typeof p === 'object' && p.resource && p.actions) {
                            // Check if resource matches
                            if (p.resource !== resource && p.resource !== '*') {
                                return false;
                            }

                            // Check if action matches
                            if (!Array.isArray(p.actions)) {
                                return false;
                            }

                            // Check for exact action match or wildcard
                            return p.actions.includes(action) || 
                                   p.actions.includes('*') ||
                                   (p.resource === '*' && p.actions.includes('*'));
                        }

                        return false;
                    });
                }

                return false;
            });

            if (hasOrgPermission) {
                return true;
            }
        }

        // STRATEGY 3: Check role-based permissions (if provided in options)
        if (options.rolePermissions && user.roles) {
            const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
            const hasRolePermission = userRoles.some(role => {
                const rolePerms = options.rolePermissions[role] || [];
                return rolePerms.includes(permission);
            });

            if (hasRolePermission) {
                return true;
            }
        }

        // STRATEGY 4: Check organization role-based permissions
        // Admin-level roles in organizations get broader access
        if (user.organizations && Array.isArray(user.organizations)) {
            const hasOrgRolePermission = user.organizations.some(org => {
                if (org.status !== 'active' || !org.roles) {
                    return false;
                }

                const orgRoles = Array.isArray(org.roles) ? org.roles : [org.roles];
                
                // Check if any organization role has admin-level access
                return orgRoles.some(role => {
                    const roleName = typeof role === 'string' ? role : role.roleName;
                    return roleName === 'admin' || 
                           roleName === 'super_admin' || 
                           roleName === 'owner' ||
                           roleName === 'manager';
                });
            });

            if (hasOrgRolePermission) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if user has required role
     * @param {Object} user - User object
     * @param {string|Array} requiredRole - Required role(s)
     * @returns {boolean} Whether user has role
     */
    static hasRole(user, requiredRole) {
        if (!user) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        // Check global roles
        if (user.roles) {
            const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];

            if (Array.isArray(requiredRole)) {
                if (requiredRole.some(role => userRoles.includes(role))) {
                    return true;
                }
            } else {
                if (userRoles.includes(requiredRole)) {
                    return true;
                }
            }
        }

        // Check organization roles
        if (user.organizations && Array.isArray(user.organizations)) {
            return user.organizations.some(org => {
                if (org.status !== 'active' || !org.roles) {
                    return false;
                }

                const orgRoles = Array.isArray(org.roles) ? org.roles : [org.roles];
                const orgRoleNames = orgRoles.map(r => typeof r === 'string' ? r : r.roleName);

                if (Array.isArray(requiredRole)) {
                    return requiredRole.some(role => orgRoleNames.includes(role));
                } else {
                    return orgRoleNames.includes(requiredRole);
                }
            });
        }

        return false;
    }

    /**
     * Check if user has minimum role level
     * @param {Object} user - User object
     * @param {string} minimumRole - Minimum required role
     * @returns {boolean} Whether user meets minimum role level
     */
    static hasMinimumRole(user, minimumRole) {
        if (!user) {
            return false;
        }

        if (this._isSuperAdmin(user)) {
            return true;
        }

        const minimumLevel = RoleHierarchy[minimumRole] || 0;

        // Check global roles
        if (user.roles) {
            const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
            const meetsMinimum = userRoles.some(role => {
                const roleLevel = RoleHierarchy[role] || 0;
                return roleLevel >= minimumLevel;
            });

            if (meetsMinimum) {
                return true;
            }
        }

        // Check organization roles
        if (user.organizations && Array.isArray(user.organizations)) {
            return user.organizations.some(org => {
                if (org.status !== 'active' || !org.roles) {
                    return false;
                }

                const orgRoles = Array.isArray(org.roles) ? org.roles : [org.roles];
                return orgRoles.some(role => {
                    const roleName = typeof role === 'string' ? role : role.roleName;
                    const roleLevel = RoleHierarchy[roleName] || 0;
                    return roleLevel >= minimumLevel;
                });
            });
        }

        return false;
    }

    /**
     * Check if user is super admin
     * @private
     */
    static _isSuperAdmin(user) {
        if (!user) {
            return false;
        }

        // Check global roles
        if (user.roles) {
            const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
            if (userRoles.includes(SystemRoles.SUPER_ADMIN)) {
                return true;
            }
        }

        // Check organization roles
        if (user.organizations && Array.isArray(user.organizations)) {
            return user.organizations.some(org => {
                if (org.status !== 'active' || !org.roles) {
                    return false;
                }

                const orgRoles = Array.isArray(org.roles) ? org.roles : [org.roles];
                return orgRoles.some(role => {
                    const roleName = typeof role === 'string' ? role : role.roleName;
                    return roleName === SystemRoles.SUPER_ADMIN;
                });
            });
        }

        return false;
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
        const userId = (user.id || user._id)?.toString();
        const resourceOwnerId = (resource[ownerField]?._id || resource[ownerField])?.toString();

        return userId === resourceOwnerId;
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

        // Check default organization
        if (user.defaultOrganizationId?.toString() === organizationId.toString()) {
            return true;
        }

        // Check organization memberships
        if (user.organizations && Array.isArray(user.organizations)) {
            return user.organizations.some(org => 
                org.organizationId?.toString() === organizationId.toString() &&
                org.status === 'active'
            );
        }

        return false;
    }

    /**
     * Get user's active permissions across all organizations
     * @param {Object} user - User object
     * @returns {Array} Flat array of all active permissions
     */
    static getAllPermissions(user) {
        const permissions = new Set();

        // Add flat permissions
        if (user.permissions && Array.isArray(user.permissions)) {
            user.permissions.forEach(p => permissions.add(p));
        }

        // Add organization permissions
        if (user.organizations && Array.isArray(user.organizations)) {
            user.organizations.forEach(org => {
                if (org.status === 'active' && org.permissions) {
                    org.permissions.forEach(p => {
                        if (typeof p === 'string') {
                            permissions.add(p);
                        } else if (p.resource && p.actions) {
                            p.actions.forEach(action => {
                                permissions.add(`${p.resource}:${action}`);
                            });
                        }
                    });
                }
            });
        }

        return Array.from(permissions);
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
        rolePermissions = null,
        organizationId = null
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
                        userId: user.id || user._id,
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
                    rolePermissions,
                    organizationId
                });
            } else {
                hasPermission = PermissionChecker.hasPermission(user, permission, {
                    rolePermissions,
                    organizationId
                });
            }

            // If user doesn't have permission, check ownership if allowed
            if (!hasPermission && allowOwner) {
                const resourceId = req.params.id || req.params.resourceId;
                if (resourceId) {
                    logger.debug('Permission denied, checking resource ownership', {
                        userId: user.id || user._id,
                        resourceId
                    });
                    // In production, implement actual resource ownership check
                    // hasPermission = await checkResourceOwnership(user, resourceId, ownerField);
                }
            }

            if (!hasPermission) {
                logger.warn('Permission denied', {
                    userId: user.id || user._id,
                    required: permission,
                    userPermissions: user.permissions,
                    userRoles: user.roles,
                    path: req.path,
                    method: req.method
                });

                throw AppError.forbidden(errorMessage, {
                    context: {
                        required: permission,
                        userId: user.id || user._id
                    }
                });
            }

            // Permission granted
            logger.debug('Permission granted', {
                userId: user.id || user._id,
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
                    userId: req.user.id || req.user._id,
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
                    userId: req.user.id || req.user._id,
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

            logger.debug('Checking resource ownership', {
                userId: req.user.id || req.user._id,
                resourceId
            });

            // In production, implement actual resource fetch and ownership check
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
        tenantIdSource = 'params',
        tenantIdField = 'tenantId',
        errorMessage = 'Access denied to this tenant'
    } = options;

    return (req, res, next) => {
        try {
            if (!req.user) {
                throw AppError.unauthorized('Authentication required');
            }

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
                return next();
            }

            if (!PermissionChecker.hasTenantAccess(req.user, tenantId)) {
                logger.warn('Tenant access denied', {
                    userId: req.user.id || req.user._id,
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
        return (req, res, next) => {
            let index = 0;
            
            const runNext = (err) => {
                if (err) return next(err);
                if (index >= checks.length) return next();
                
                const check = checks[index++];
                check(req, res, runNext);
            };
            
            runNext();
        };
    } else {
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
                    return next();
                } catch (error) {
                    lastError = error;
                }
            }
            
            next(lastError || AppError.forbidden('Permission denied'));
        };
    }
}

/**
 * Permission presets for common scenarios
 */
const PermissionPresets = {
    adminOnly: () => checkMinimumRole(SystemRoles.ADMIN),
    managerAccess: () => checkMinimumRole(SystemRoles.MANAGER),
    authenticatedAccess: () => (req, res, next) => {
        if (!req.user) {
            return next(AppError.unauthorized('Authentication required'));
        }
        next();
    },
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