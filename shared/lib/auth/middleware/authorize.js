/**
 * @fileoverview Enterprise Authorization Middleware
 * @module shared/lib/auth/middleware/authorize
 * @description Comprehensive role-based and permission-based authorization with hierarchical roles
 * @version 2.0.0
 */

const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger');
const database = require('../../database');

/**
 * Role Hierarchy Definition
 * Higher index = higher privilege level
 * @type {Array<string>}
 */
const ROLE_HIERARCHY = [
    'guest',
    'candidate',
    'vendor',
    'partner',
    'client',
    'consultant',
    'employee',
    'team_lead',
    'manager',
    'admin',
    'super_admin'
];

/**
 * Permission Categories
 * @enum {string}
 */
const PERMISSION_CATEGORIES = {
    USER: 'user',
    CLIENT: 'client',
    PROJECT: 'project',
    DOCUMENT: 'document',
    REPORT: 'report',
    FINANCE: 'finance',
    SETTINGS: 'settings',
    SYSTEM: 'system'
};

/**
 * Permission Actions
 * @enum {string}
 */
const PERMISSION_ACTIONS = {
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    EXPORT: 'export',
    IMPORT: 'import',
    APPROVE: 'approve',
    REJECT: 'reject',
    ARCHIVE: 'archive',
    RESTORE: 'restore',
    SHARE: 'share',
    MANAGE: 'manage',
    ALL: '*'
};

/**
 * Authorization Statistics
 * @type {Object}
 */
const authzStats = {
    totalChecks: 0,
    authorized: 0,
    denied: 0,
    roleChecks: 0,
    permissionChecks: 0,
    hierarchyChecks: 0,
    ownershipChecks: 0
};

/**
 * Get role level from hierarchy
 * @param {string} role - Role name
 * @returns {number} Role level (-1 if not found)
 * @private
 */
function getRoleLevel(role) {
    return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Check if user has sufficient role level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role
 * @returns {boolean} True if user role is sufficient
 * @private
 */
function hasRoleLevel(userRole, requiredRole) {
    const userLevel = getRoleLevel(userRole);
    const requiredLevel = getRoleLevel(requiredRole);

    if (userLevel === -1 || requiredLevel === -1) {
        return false;
    }

    return userLevel >= requiredLevel;
}

/**
 * Check if user has any of the required roles
 * @param {Array<string>} userRoles - User's roles
 * @param {Array<string>} requiredRoles - Required roles
 * @param {Object} options - Check options
 * @returns {Object} Check result
 * @private
 */
function checkRoles(userRoles, requiredRoles, options = {}) {
    authzStats.roleChecks++;

    if (!userRoles || userRoles.length === 0) {
        return {
            authorized: false,
            reason: 'User has no roles assigned',
            code: 'NO_ROLES'
        };
    }

    if (!requiredRoles || requiredRoles.length === 0) {
        return { authorized: true };
    }

    // Check if user has any of the required roles
    const matchingRoles = userRoles.filter(role => 
        requiredRoles.includes(role)
    );

    if (matchingRoles.length > 0) {
        return {
            authorized: true,
            matchedRole: matchingRoles[0],
            allMatches: matchingRoles
        };
    }

    // Check hierarchy if enabled
    if (options.checkHierarchy) {
        authzStats.hierarchyChecks++;
        
        for (const userRole of userRoles) {
            for (const requiredRole of requiredRoles) {
                if (hasRoleLevel(userRole, requiredRole)) {
                    return {
                        authorized: true,
                        matchedRole: userRole,
                        hierarchyMatch: true,
                        requiredRole: requiredRole
                    };
                }
            }
        }
    }

    return {
        authorized: false,
        reason: `User does not have required role. Required: ${requiredRoles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLE',
        userRoles: userRoles,
        requiredRoles: requiredRoles
    };
}

/**
 * Parse permission string format (resource:action)
 * @param {string} permission - Permission string
 * @returns {Object} Parsed permission
 * @private
 */
function parsePermission(permission) {
    if (permission === '*') {
        return { resource: '*', action: '*' };
    }

    const parts = permission.split(':');
    if (parts.length !== 2) {
        logger.warn('Invalid permission format', { permission });
        return { resource: permission, action: '*' };
    }

    return {
        resource: parts[0],
        action: parts[1]
    };
}

/**
 * Check if user has required permissions
 * @param {Array<string|Object>} userPermissions - User's permissions
 * @param {Array<string>} requiredPermissions - Required permissions
 * @param {Object} options - Check options
 * @returns {Object} Check result
 * @private
 */
function checkPermissions(userPermissions, requiredPermissions, options = {}) {
    authzStats.permissionChecks++;

    if (!userPermissions || userPermissions.length === 0) {
        return {
            authorized: false,
            reason: 'User has no permissions assigned',
            code: 'NO_PERMISSIONS'
        };
    }

    if (!requiredPermissions || requiredPermissions.length === 0) {
        return { authorized: true };
    }

    // Normalize user permissions
    const normalizedUserPerms = userPermissions.map(perm => {
        if (typeof perm === 'string') {
            return parsePermission(perm);
        }
        return perm;
    });

    // Check for super permission (*)
    const hasSuperPermission = normalizedUserPerms.some(
        perm => perm.resource === '*' && perm.action === '*'
    );

    if (hasSuperPermission) {
        return {
            authorized: true,
            matchedPermission: '*',
            superPermission: true
        };
    }

    const matchedPermissions = [];
    const missingPermissions = [];

    for (const required of requiredPermissions) {
        const reqPerm = parsePermission(required);
        
        const hasPermission = normalizedUserPerms.some(userPerm => {
            // Check for resource wildcard
            if (userPerm.resource === '*' || userPerm.resource === reqPerm.resource) {
                // Check for action wildcard or exact match
                if (userPerm.action === '*' || userPerm.action === reqPerm.action) {
                    return true;
                }
            }
            return false;
        });

        if (hasPermission) {
            matchedPermissions.push(required);
        } else {
            missingPermissions.push(required);
        }
    }

    // Determine if authorization should pass based on mode
    const requireAll = options.requireAll !== false;
    const authorized = requireAll
        ? missingPermissions.length === 0
        : matchedPermissions.length > 0;

    if (authorized) {
        return {
            authorized: true,
            matchedPermissions: matchedPermissions,
            allMatched: missingPermissions.length === 0
        };
    }

    return {
        authorized: false,
        reason: `Missing required permissions: ${missingPermissions.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS',
        missingPermissions: missingPermissions,
        matchedPermissions: matchedPermissions
    };
}

/**
 * Check resource ownership
 * @param {Object} req - Express request object
 * @param {Object} resource - Resource to check ownership
 * @param {Object} options - Ownership check options
 * @returns {Object} Ownership check result
 * @private
 */
async function checkOwnership(req, resource, options = {}) {
    authzStats.ownershipChecks++;

    if (!req.user || !resource) {
        return {
            authorized: false,
            reason: 'Missing user or resource',
            code: 'MISSING_DATA'
        };
    }

    const userId = req.user.id;
    const ownerField = options.ownerField || 'userId';

    // Handle different resource structures
    let resourceOwnerId;

    if (typeof resource[ownerField] === 'object' && resource[ownerField]._id) {
        resourceOwnerId = resource[ownerField]._id.toString();
    } else if (resource[ownerField]) {
        resourceOwnerId = resource[ownerField].toString();
    } else if (resource.createdBy) {
        resourceOwnerId = resource.createdBy.toString();
    }

    if (!resourceOwnerId) {
        logger.warn('Could not determine resource owner', {
            resourceId: resource._id,
            ownerField: ownerField
        });
        return {
            authorized: false,
            reason: 'Could not determine resource ownership',
            code: 'OWNERSHIP_UNKNOWN'
        };
    }

    const isOwner = resourceOwnerId === userId;

    if (isOwner) {
        return {
            authorized: true,
            isOwner: true
        };
    }

    // Check if user has manage permissions that override ownership
    if (options.allowManagePermission) {
        const resourceType = options.resourceType || 'resource';
        const managePermission = `${resourceType}:manage`;
        
        const permCheck = checkPermissions(
            req.user.permissions || [],
            [managePermission],
            { requireAll: false }
        );

        if (permCheck.authorized) {
            return {
                authorized: true,
                isOwner: false,
                bypassReason: 'manage_permission'
            };
        }
    }

    return {
        authorized: false,
        reason: 'User is not the resource owner',
        code: 'NOT_OWNER',
        isOwner: false,
        resourceOwnerId: resourceOwnerId
    };
}

/**
 * Main authorization middleware factory
 * @param {Object|Array<string>} rolesOrOptions - Required roles or options object
 * @param {Array<string>} [permissions] - Required permissions
 * @param {Object} [options] - Additional options
 * @returns {Function} Express middleware function
 */
function authorize(rolesOrOptions = [], permissions = [], options = {}) {
    // Handle different parameter formats
    let config = {};
    
    if (Array.isArray(rolesOrOptions)) {
        config = {
            roles: rolesOrOptions,
            permissions: permissions,
            ...options
        };
    } else if (typeof rolesOrOptions === 'object') {
        config = rolesOrOptions;
    }

    // Default configuration
    const defaultConfig = {
        roles: [],
        permissions: [],
        requireAll: false, // For permissions: require all or any
        checkHierarchy: true, // Check role hierarchy
        checkOwnership: false, // Check resource ownership
        ownerField: 'userId', // Field to check for ownership
        resourceType: null, // Resource type for permission checks
        allowSelfAccess: false, // Allow access to own resources
        customCheck: null // Custom authorization function
    };

    config = { ...defaultConfig, ...config };

    return async (req, res, next) => {
        try {
            authzStats.totalChecks++;

            // Ensure user is authenticated
            if (!req.user || !req.authenticated) {
                authzStats.denied++;
                return next(new AppError(
                    'Authentication required for authorization check',
                    401,
                    'NOT_AUTHENTICATED'
                ));
            }

            // Get user roles and permissions
            const userRoles = req.user.roles || [req.user.role];
            const userPermissions = req.user.permissions || [];

            // Check self-access if enabled
            if (config.allowSelfAccess) {
                const targetUserId = req.params.id || req.params.userId || req.body.userId;
                if (targetUserId && targetUserId === req.user.id) {
                    authzStats.authorized++;
                    return next();
                }
            }

            // Perform role check
            if (config.roles && config.roles.length > 0) {
                const roleCheck = checkRoles(userRoles, config.roles, {
                    checkHierarchy: config.checkHierarchy
                });

                if (!roleCheck.authorized) {
                    authzStats.denied++;
                    logger.warn('Authorization failed: Insufficient role', {
                        userId: req.user.id,
                        userRoles: roleCheck.userRoles,
                        requiredRoles: roleCheck.requiredRoles,
                        path: req.path
                    });

                    return next(new AppError(
                        roleCheck.reason,
                        403,
                        roleCheck.code,
                        {
                            requiredRoles: roleCheck.requiredRoles,
                            userRoles: roleCheck.userRoles
                        }
                    ));
                }

                // Log role authorization success
                if (roleCheck.hierarchyMatch) {
                    logger.debug('Authorization via role hierarchy', {
                        userId: req.user.id,
                        userRole: roleCheck.matchedRole,
                        requiredRole: roleCheck.requiredRole
                    });
                }
            }

            // Perform permission check
            if (config.permissions && config.permissions.length > 0) {
                const permCheck = checkPermissions(userPermissions, config.permissions, {
                    requireAll: config.requireAll
                });

                if (!permCheck.authorized) {
                    authzStats.denied++;
                    logger.warn('Authorization failed: Insufficient permissions', {
                        userId: req.user.id,
                        missingPermissions: permCheck.missingPermissions,
                        path: req.path
                    });

                    return next(new AppError(
                        permCheck.reason,
                        403,
                        permCheck.code,
                        {
                            missingPermissions: permCheck.missingPermissions,
                            requiredPermissions: config.permissions
                        }
                    ));
                }

                // Log permission authorization success
                if (permCheck.superPermission) {
                    logger.debug('Authorization via super permission', {
                        userId: req.user.id
                    });
                }
            }

            // Perform ownership check if enabled
            if (config.checkOwnership) {
                // Resource must be loaded before this middleware
                if (!req.resource) {
                    logger.error('Ownership check requested but no resource loaded', {
                        path: req.path,
                        method: req.method
                    });
                    authzStats.denied++;
                    return next(new AppError(
                        'Resource not loaded for ownership check',
                        500,
                        'RESOURCE_NOT_LOADED'
                    ));
                }

                const ownershipCheck = await checkOwnership(req, req.resource, {
                    ownerField: config.ownerField,
                    resourceType: config.resourceType,
                    allowManagePermission: config.allowManagePermission !== false
                });

                if (!ownershipCheck.authorized) {
                    authzStats.denied++;
                    logger.warn('Authorization failed: Not resource owner', {
                        userId: req.user.id,
                        resourceId: req.resource._id,
                        resourceOwnerId: ownershipCheck.resourceOwnerId,
                        path: req.path
                    });

                    return next(new AppError(
                        ownershipCheck.reason,
                        403,
                        ownershipCheck.code
                    ));
                }
            }

            // Perform custom authorization check if provided
            if (config.customCheck && typeof config.customCheck === 'function') {
                try {
                    const customResult = await config.customCheck(req, res);
                    
                    if (!customResult || customResult.authorized === false) {
                        authzStats.denied++;
                        const reason = customResult?.reason || 'Custom authorization check failed';
                        const code = customResult?.code || 'CUSTOM_AUTH_FAILED';
                        
                        logger.warn('Custom authorization check failed', {
                            userId: req.user.id,
                            reason: reason,
                            path: req.path
                        });

                        return next(new AppError(reason, 403, code));
                    }
                } catch (error) {
                    authzStats.denied++;
                    logger.error('Custom authorization check error', {
                        error: error.message,
                        userId: req.user.id,
                        path: req.path
                    });
                    return next(new AppError(
                        'Authorization check failed',
                        500,
                        'CUSTOM_AUTH_ERROR'
                    ));
                }
            }

            // Authorization successful
            authzStats.authorized++;
            next();

        } catch (error) {
            authzStats.denied++;
            logger.error('Authorization middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                userId: req.user?.id
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError(
                'Authorization processing failed',
                500,
                'AUTHORIZATION_ERROR'
            ));
        }
    };
}

/**
 * Middleware to require specific roles (shorthand)
 * @param {Array<string>} roles - Required roles
 * @returns {Function} Express middleware
 */
function requireRoles(roles) {
    return authorize({ roles: roles });
}

/**
 * Middleware to require specific permissions (shorthand)
 * @param {Array<string>} permissions - Required permissions
 * @returns {Function} Express middleware
 */
function requirePermissions(permissions) {
    return authorize({ permissions: permissions });
}

/**
 * Middleware to check resource ownership
 * @param {Object} options - Ownership options
 * @returns {Function} Express middleware
 */
function requireOwnership(options = {}) {
    return authorize({
        checkOwnership: true,
        ...options
    });
}

/**
 * Middleware to allow admin or owner access
 * @param {string} resourceType - Resource type
 * @returns {Function} Express middleware
 */
function requireAdminOrOwner(resourceType = 'resource') {
    return authorize({
        roles: ['admin', 'super_admin'],
        checkOwnership: true,
        resourceType: resourceType,
        allowManagePermission: true
    });
}

/**
 * Get authorization statistics
 * @returns {Object} Authorization statistics
 */
function getAuthzStats() {
    return {
        ...authzStats,
        authorizationRate: authzStats.totalChecks > 0
            ? ((authzStats.authorized / authzStats.totalChecks) * 100).toFixed(2) + '%'
            : '0%',
        timestamp: new Date()
    };
}

/**
 * Reset authorization statistics
 */
function resetAuthzStats() {
    authzStats.totalChecks = 0;
    authzStats.authorized = 0;
    authzStats.denied = 0;
    authzStats.roleChecks = 0;
    authzStats.permissionChecks = 0;
    authzStats.hierarchyChecks = 0;
    authzStats.ownershipChecks = 0;
    
    logger.info('Authorization statistics reset');
}

module.exports = authorize;
module.exports.authorize = authorize;
module.exports.requireRoles = requireRoles;
module.exports.requirePermissions = requirePermissions;
module.exports.requireOwnership = requireOwnership;
module.exports.requireAdminOrOwner = requireAdminOrOwner;
module.exports.checkRoles = checkRoles;
module.exports.checkPermissions = checkPermissions;
module.exports.checkOwnership = checkOwnership;
module.exports.getAuthzStats = getAuthzStats;
module.exports.resetAuthzStats = resetAuthzStats;
module.exports.ROLE_HIERARCHY = ROLE_HIERARCHY;
module.exports.PERMISSION_CATEGORIES = PERMISSION_CATEGORIES;
module.exports.PERMISSION_ACTIONS = PERMISSION_ACTIONS;