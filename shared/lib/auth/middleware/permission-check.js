/**
 * @fileoverview Enterprise Permission Check Middleware
 * @module shared/lib/auth/middleware/permission-check
 * @description Advanced permission validation with caching, conditional logic, and scope-based permissions
 * @version 2.0.0
 */

const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger');
const database = require('../../database');

/**
 * Permission Match Strategies
 * @enum {string}
 */
const MATCH_STRATEGY = {
    EXACT: 'exact',           // Exact resource:action match
    WILDCARD: 'wildcard',     // Supports * wildcards
    HIERARCHICAL: 'hierarchical', // Supports parent resource permissions
    SCOPE_BASED: 'scope_based'    // Scope-based permissions (OAuth-style)
};

/**
 * Permission Scope Types
 * @enum {string}
 */
const SCOPE_TYPE = {
    READ: 'read',
    WRITE: 'write',
    DELETE: 'delete',
    ADMIN: 'admin',
    ALL: 'all'
};

/**
 * Permission check statistics
 * @type {Object}
 */
const permissionStats = {
    totalChecks: 0,
    granted: 0,
    denied: 0,
    cacheHits: 0,
    cacheMisses: 0,
    wildcardMatches: 0,
    exactMatches: 0,
    scopeMatches: 0,
    dynamicChecks: 0
};

/**
 * Permission cache for performance
 * Key: userId:resource:action
 * Value: { granted: boolean, timestamp: number }
 * @type {Map}
 */
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Parse permission string
 * Supports formats: resource:action, scope:resource:action
 * @param {string|Object} permission - Permission string or object
 * @returns {Object} Parsed permission
 * @private
 */
function parsePermission(permission) {
    if (typeof permission === 'object') {
        return {
            scope: permission.scope || null,
            resource: permission.resource,
            action: permission.action || permission.actions?.[0] || '*',
            actions: permission.actions || [permission.action || '*']
        };
    }

    // Handle wildcard
    if (permission === '*' || permission === '*:*') {
        return {
            scope: null,
            resource: '*',
            action: '*',
            actions: ['*']
        };
    }

    const parts = permission.split(':');

    // Format: resource:action
    if (parts.length === 2) {
        return {
            scope: null,
            resource: parts[0],
            action: parts[1],
            actions: [parts[1]]
        };
    }

    // Format: scope:resource:action
    if (parts.length === 3) {
        return {
            scope: parts[0],
            resource: parts[1],
            action: parts[2],
            actions: [parts[2]]
        };
    }

    // Invalid format, treat as resource
    logger.warn('Invalid permission format', { permission });
    return {
        scope: null,
        resource: permission,
        action: '*',
        actions: ['*']
    };
}

/**
 * Normalize user permissions
 * @param {Array<string|Object>} permissions - User permissions
 * @returns {Array<Object>} Normalized permissions
 * @private
 */
function normalizePermissions(permissions) {
    if (!permissions || !Array.isArray(permissions)) {
        return [];
    }

    return permissions.map(perm => parsePermission(perm));
}

/**
 * Check if permission matches with wildcard support
 * @param {Object} userPerm - User permission
 * @param {Object} requiredPerm - Required permission
 * @param {string} strategy - Match strategy
 * @returns {boolean} True if matches
 * @private
 */
function matchesPermission(userPerm, requiredPerm, strategy = MATCH_STRATEGY.WILDCARD) {
    switch (strategy) {
        case MATCH_STRATEGY.EXACT:
            return userPerm.resource === requiredPerm.resource &&
                   userPerm.action === requiredPerm.action;

        case MATCH_STRATEGY.WILDCARD:
            // Check resource match
            const resourceMatch = userPerm.resource === '*' ||
                                 userPerm.resource === requiredPerm.resource;

            // Check action match
            const actionMatch = userPerm.action === '*' ||
                               userPerm.action === requiredPerm.action ||
                               userPerm.actions?.includes(requiredPerm.action);

            return resourceMatch && actionMatch;

        case MATCH_STRATEGY.HIERARCHICAL:
            // Support hierarchical resources (e.g., 'project' includes 'project:task')
            const resourceHierarchyMatch = 
                userPerm.resource === '*' ||
                userPerm.resource === requiredPerm.resource ||
                requiredPerm.resource.startsWith(userPerm.resource + ':');

            const actionHierarchyMatch = 
                userPerm.action === '*' ||
                userPerm.action === requiredPerm.action;

            return resourceHierarchyMatch && actionHierarchyMatch;

        case MATCH_STRATEGY.SCOPE_BASED:
            // OAuth-style scope matching
            if (!userPerm.scope || !requiredPerm.scope) {
                return false;
            }

            const scopeMatch = userPerm.scope === requiredPerm.scope ||
                              userPerm.scope === SCOPE_TYPE.ALL;

            return scopeMatch && matchesPermission(userPerm, requiredPerm, MATCH_STRATEGY.WILDCARD);

        default:
            return false;
    }
}

/**
 * Check if user has required permissions
 * @param {Array<Object>} userPermissions - User's normalized permissions
 * @param {Array<Object>} requiredPermissions - Required normalized permissions
 * @param {Object} options - Check options
 * @returns {Object} Check result
 * @private
 */
function checkUserPermissions(userPermissions, requiredPermissions, options = {}) {
    const strategy = options.strategy || MATCH_STRATEGY.WILDCARD;
    const requireAll = options.requireAll !== false;

    // Check for super permission
    const hasSuperPermission = userPermissions.some(
        perm => perm.resource === '*' && perm.action === '*'
    );

    if (hasSuperPermission) {
        permissionStats.exactMatches++;
        return {
            granted: true,
            matched: ['*:*'],
            matchType: 'super_permission'
        };
    }

    const matched = [];
    const missing = [];

    for (const requiredPerm of requiredPermissions) {
        const hasPermission = userPermissions.some(userPerm => {
            const matches = matchesPermission(userPerm, requiredPerm, strategy);
            
            if (matches) {
                // Track match type
                if (userPerm.resource === '*' || userPerm.action === '*') {
                    permissionStats.wildcardMatches++;
                } else if (userPerm.scope) {
                    permissionStats.scopeMatches++;
                } else {
                    permissionStats.exactMatches++;
                }
            }

            return matches;
        });

        const permString = requiredPerm.scope
            ? `${requiredPerm.scope}:${requiredPerm.resource}:${requiredPerm.action}`
            : `${requiredPerm.resource}:${requiredPerm.action}`;

        if (hasPermission) {
            matched.push(permString);
        } else {
            missing.push(permString);
        }
    }

    // Determine if check passes
    const granted = requireAll
        ? missing.length === 0
        : matched.length > 0;

    return {
        granted: granted,
        matched: matched,
        missing: missing,
        matchType: strategy
    };
}

/**
 * Get cached permission check result
 * @param {string} cacheKey - Cache key
 * @returns {boolean|null} Cached result or null
 * @private
 */
function getCachedPermission(cacheKey) {
    const cached = permissionCache.get(cacheKey);
    
    if (!cached) {
        return null;
    }

    // Check if cache expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        permissionCache.delete(cacheKey);
        return null;
    }

    permissionStats.cacheHits++;
    return cached.granted;
}

/**
 * Cache permission check result
 * @param {string} cacheKey - Cache key
 * @param {boolean} granted - Whether permission was granted
 * @private
 */
function cachePermission(cacheKey, granted) {
    permissionCache.set(cacheKey, {
        granted: granted,
        timestamp: Date.now()
    });

    // Limit cache size to prevent memory issues
    if (permissionCache.size > 10000) {
        // Remove oldest entries
        const entriesToRemove = Array.from(permissionCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(0, 1000);

        entriesToRemove.forEach(([key]) => permissionCache.delete(key));
    }
}

/**
 * Generate cache key for permission check
 * @param {string} userId - User ID
 * @param {string} resource - Resource
 * @param {string} action - Action
 * @returns {string} Cache key
 * @private
 */
function generateCacheKey(userId, resource, action) {
    return `${userId}:${resource}:${action}`;
}

/**
 * Dynamic permission check using custom function
 * @param {Object} req - Express request object
 * @param {Function} checkFn - Custom check function
 * @returns {Promise<Object>} Check result
 * @private
 */
async function performDynamicCheck(req, checkFn) {
    permissionStats.dynamicChecks++;

    try {
        const result = await checkFn(req);
        
        if (typeof result === 'boolean') {
            return {
                granted: result,
                dynamic: true
            };
        }

        if (typeof result === 'object') {
            return {
                granted: result.granted !== false,
                dynamic: true,
                reason: result.reason,
                metadata: result.metadata
            };
        }

        return {
            granted: false,
            dynamic: true,
            reason: 'Invalid dynamic check result'
        };

    } catch (error) {
        logger.error('Dynamic permission check error', {
            error: error.message,
            userId: req.user?.id
        });

        return {
            granted: false,
            dynamic: true,
            error: error.message
        };
    }
}

/**
 * Load fresh permissions from database
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array<Object>>} User permissions
 * @private
 */
async function loadUserPermissions(userId, tenantId) {
    try {
        const User = database.getModel('User');
        
        if (!User) {
            logger.warn('User model not available for permission loading');
            return [];
        }

        const user = await User.findById(userId)
            .select('permissions organizations')
            .lean();

        if (!user) {
            return [];
        }

        // Get base permissions
        let permissions = user.permissions || [];

        // Get organization-specific permissions if tenant specified
        if (tenantId && user.organizations) {
            const org = user.organizations.find(
                o => o.organizationId.toString() === tenantId.toString()
            );

            if (org && org.permissions) {
                permissions = [...permissions, ...org.permissions];
            }
        }

        return normalizePermissions(permissions);

    } catch (error) {
        logger.error('Failed to load user permissions', {
            error: error.message,
            userId: userId
        });
        return [];
    }
}

/**
 * Main permission check middleware factory
 * @param {string|Array<string>|Object} resourceOrOptions - Resource name or options
 * @param {string|Array<string>} [action] - Action(s) required
 * @param {Object} [options] - Additional options
 * @returns {Function} Express middleware function
 */
function checkPermission(resourceOrOptions, action, options = {}) {
    // Handle different parameter formats
    let config = {};

    if (typeof resourceOrOptions === 'object' && !Array.isArray(resourceOrOptions)) {
        // Options object provided
        config = resourceOrOptions;
    } else {
        // Resource and action provided
        const resources = Array.isArray(resourceOrOptions) 
            ? resourceOrOptions 
            : [resourceOrOptions];
        const actions = Array.isArray(action) 
            ? action 
            : [action];

        // Generate permissions array
        const permissions = [];
        for (const resource of resources) {
            for (const act of actions) {
                permissions.push(`${resource}:${act}`);
            }
        }

        config = {
            permissions: permissions,
            ...options
        };
    }

    // Default configuration
    const defaultConfig = {
        permissions: [],
        requireAll: false,
        strategy: MATCH_STRATEGY.WILDCARD,
        useCache: true,
        refreshPermissions: false,
        dynamicCheck: null,
        onDenied: null,
        allowSuperUser: true,
        requireAuthentication: true
    };

    config = { ...defaultConfig, ...config };

    return async (req, res, next) => {
        try {
            permissionStats.totalChecks++;

            // Ensure user is authenticated
            if (config.requireAuthentication && (!req.user || !req.authenticated)) {
                permissionStats.denied++;
                return next(new AppError(
                    'Authentication required for permission check',
                    401,
                    'NOT_AUTHENTICATED'
                ));
            }

            const userId = req.user?.id;
            const tenantId = req.tenantId || req.user?.tenantId;

            // Check if permissions are required
            if (!config.permissions || config.permissions.length === 0) {
                // No permissions required, allow access
                permissionStats.granted++;
                return next();
            }

            // Normalize required permissions
            const requiredPermissions = normalizePermissions(config.permissions);

            // Get user permissions
            let userPermissions;

            if (config.refreshPermissions) {
                // Load fresh from database
                userPermissions = await loadUserPermissions(userId, tenantId);
                permissionStats.cacheMisses++;
            } else {
                // Use permissions from request object
                userPermissions = normalizePermissions(req.user?.permissions || []);
            }

            // Check cache if enabled
            let cacheKey = null;
            if (config.useCache && !config.refreshPermissions) {
                cacheKey = generateCacheKey(
                    userId,
                    config.permissions[0],
                    'check'
                );

                const cachedResult = getCachedPermission(cacheKey);
                if (cachedResult !== null) {
                    if (cachedResult) {
                        permissionStats.granted++;
                        return next();
                    } else {
                        permissionStats.denied++;
                        return next(new AppError(
                            'Permission denied (cached)',
                            403,
                            'PERMISSION_DENIED'
                        ));
                    }
                }

                permissionStats.cacheMisses++;
            }

            // Perform permission check
            const checkResult = checkUserPermissions(
                userPermissions,
                requiredPermissions,
                {
                    requireAll: config.requireAll,
                    strategy: config.strategy
                }
            );

            // Perform dynamic check if provided
            if (config.dynamicCheck && typeof config.dynamicCheck === 'function') {
                const dynamicResult = await performDynamicCheck(req, config.dynamicCheck);
                
                if (!dynamicResult.granted) {
                    permissionStats.denied++;
                    
                    logger.warn('Dynamic permission check failed', {
                        userId: userId,
                        reason: dynamicResult.reason,
                        path: req.path
                    });

                    return next(new AppError(
                        dynamicResult.reason || 'Permission denied by dynamic check',
                        403,
                        'PERMISSION_DENIED_DYNAMIC',
                        dynamicResult.metadata
                    ));
                }

                // Merge dynamic result with static check
                checkResult.dynamicCheck = true;
            }

            // Handle denied permission
            if (!checkResult.granted) {
                permissionStats.denied++;

                // Cache denial if enabled
                if (cacheKey && config.useCache) {
                    cachePermission(cacheKey, false);
                }

                logger.warn('Permission check failed', {
                    userId: userId,
                    required: config.permissions,
                    missing: checkResult.missing,
                    path: req.path
                });

                // Call custom denied handler if provided
                if (config.onDenied && typeof config.onDenied === 'function') {
                    try {
                        await config.onDenied(req, res, checkResult);
                        return; // Handler took control
                    } catch (error) {
                        logger.error('Custom denied handler error', {
                            error: error.message
                        });
                    }
                }

                return next(new AppError(
                    `Permission denied. Required: ${checkResult.missing.join(', ')}`,
                    403,
                    'PERMISSION_DENIED',
                    {
                        required: config.permissions,
                        missing: checkResult.missing,
                        matched: checkResult.matched
                    }
                ));
            }

            // Permission granted
            permissionStats.granted++;

            // Cache result if enabled
            if (cacheKey && config.useCache) {
                cachePermission(cacheKey, true);
            }

            // Attach permission check result to request
            req.permissionCheck = {
                granted: true,
                matched: checkResult.matched,
                matchType: checkResult.matchType,
                cached: false
            };

            logger.debug('Permission check passed', {
                userId: userId,
                matched: checkResult.matched,
                matchType: checkResult.matchType
            });

            next();

        } catch (error) {
            permissionStats.denied++;
            
            logger.error('Permission check middleware error', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                path: req.path
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError(
                'Permission check failed',
                500,
                'PERMISSION_CHECK_ERROR'
            ));
        }
    };
}

/**
 * Check single permission (shorthand)
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {Function} Express middleware
 */
function requirePermission(resource, action) {
    return checkPermission(resource, action, { requireAll: true });
}

/**
 * Check if user has any of the permissions (OR logic)
 * @param {Array<string>} permissions - Permissions array
 * @returns {Function} Express middleware
 */
function requireAnyPermission(permissions) {
    return checkPermission({ permissions: permissions, requireAll: false });
}

/**
 * Check if user has all permissions (AND logic)
 * @param {Array<string>} permissions - Permissions array
 * @returns {Function} Express middleware
 */
function requireAllPermissions(permissions) {
    return checkPermission({ permissions: permissions, requireAll: true });
}

/**
 * Clear permission cache
 * @param {string} [userId] - Specific user ID to clear
 */
function clearPermissionCache(userId = null) {
    if (userId) {
        // Clear all entries for specific user
        for (const [key] of permissionCache) {
            if (key.startsWith(`${userId}:`)) {
                permissionCache.delete(key);
            }
        }
        logger.debug('Permission cache cleared for user', { userId });
    } else {
        permissionCache.clear();
        logger.info('All permission cache cleared');
    }
}

/**
 * Get permission check statistics
 * @returns {Object} Permission statistics
 */
function getPermissionStats() {
    return {
        ...permissionStats,
        grantRate: permissionStats.totalChecks > 0
            ? ((permissionStats.granted / permissionStats.totalChecks) * 100).toFixed(2) + '%'
            : '0%',
        cacheHitRate: (permissionStats.cacheHits + permissionStats.cacheMisses) > 0
            ? ((permissionStats.cacheHits / (permissionStats.cacheHits + permissionStats.cacheMisses)) * 100).toFixed(2) + '%'
            : '0%',
        cacheSize: permissionCache.size,
        timestamp: new Date()
    };
}

/**
 * Reset permission check statistics
 */
function resetPermissionStats() {
    permissionStats.totalChecks = 0;
    permissionStats.granted = 0;
    permissionStats.denied = 0;
    permissionStats.cacheHits = 0;
    permissionStats.cacheMisses = 0;
    permissionStats.wildcardMatches = 0;
    permissionStats.exactMatches = 0;
    permissionStats.scopeMatches = 0;
    permissionStats.dynamicChecks = 0;
    
    logger.info('Permission check statistics reset');
}

module.exports = checkPermission;
module.exports.checkPermission = checkPermission;
module.exports.requirePermission = requirePermission;
module.exports.requireAnyPermission = requireAnyPermission;
module.exports.requireAllPermissions = requireAllPermissions;
module.exports.clearPermissionCache = clearPermissionCache;
module.exports.getPermissionStats = getPermissionStats;
module.exports.resetPermissionStats = resetPermissionStats;
module.exports.MATCH_STRATEGY = MATCH_STRATEGY;
module.exports.SCOPE_TYPE = SCOPE_TYPE;