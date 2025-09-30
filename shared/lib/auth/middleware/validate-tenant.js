/**
 * @fileoverview Tenant Validation Middleware
 * @module shared/lib/auth/middleware/validate-tenant
 * @description Comprehensive multi-tenant validation and context injection middleware
 * @version 2.0.0
 */

const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger');
const database = require('../../database');

/**
 * Tenant Extraction Sources
 * @enum {string}
 */
const TENANT_SOURCES = {
    HEADER: 'header',
    SUBDOMAIN: 'subdomain',
    QUERY: 'query',
    PATH: 'path',
    TOKEN: 'token',
    CUSTOM_DOMAIN: 'custom_domain'
};

/**
 * Tenant Status
 * @enum {string}
 */
const TENANT_STATUS = {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    TRIAL: 'trial',
    EXPIRED: 'expired',
    PENDING: 'pending',
    DISABLED: 'disabled'
};

/**
 * Tenant validation statistics
 * @type {Object}
 */
const tenantStats = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    missingTenant: 0,
    invalidTenant: 0,
    suspendedTenant: 0,
    expiredTenant: 0,
    cacheHits: 0,
    cacheMisses: 0
};

/**
 * Tenant cache for performance
 * In production, use Redis
 * @type {Map}
 */
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extract tenant identifier from request
 * Supports multiple extraction strategies
 * @param {Object} req - Express request object
 * @param {Array<string>} sources - Sources to check for tenant
 * @param {Object} options - Extraction options
 * @returns {Object} Tenant ID and source
 * @private
 */
function extractTenantId(req, sources, options = {}) {
    let tenantId = null;
    let source = null;

    for (const sourceType of sources) {
        switch (sourceType) {
            case TENANT_SOURCES.HEADER:
                // Check various header formats
                tenantId = req.headers['x-tenant-id'] ||
                          req.headers['x-organization-id'] ||
                          req.headers['tenant-id'] ||
                          req.headers['organization-id'];
                
                if (tenantId) {
                    source = TENANT_SOURCES.HEADER;
                }
                break;

            case TENANT_SOURCES.SUBDOMAIN:
                // Extract from subdomain
                const host = req.get('host');
                if (host) {
                    const subdomain = host.split('.')[0];
                    
                    // Ignore common subdomains
                    if (!['www', 'api', 'app', 'admin', 'localhost'].includes(subdomain)) {
                        tenantId = subdomain;
                        source = TENANT_SOURCES.SUBDOMAIN;
                    }
                }
                break;

            case TENANT_SOURCES.QUERY:
                // Check query parameters
                tenantId = req.query.tenantId || 
                          req.query.tenant || 
                          req.query.organizationId;
                
                if (tenantId) {
                    source = TENANT_SOURCES.QUERY;
                }
                break;

            case TENANT_SOURCES.PATH:
                // Extract from path (e.g., /api/tenants/:tenantId/users)
                if (req.params && req.params.tenantId) {
                    tenantId = req.params.tenantId;
                    source = TENANT_SOURCES.PATH;
                } else if (req.params && req.params.organizationId) {
                    tenantId = req.params.organizationId;
                    source = TENANT_SOURCES.PATH;
                }
                break;

            case TENANT_SOURCES.TOKEN:
                // Extract from JWT token (if already authenticated)
                if (req.user && req.user.tenantId) {
                    tenantId = req.user.tenantId;
                    source = TENANT_SOURCES.TOKEN;
                } else if (req.tokenPayload && req.tokenPayload.tenantId) {
                    tenantId = req.tokenPayload.tenantId;
                    source = TENANT_SOURCES.TOKEN;
                }
                break;

            case TENANT_SOURCES.CUSTOM_DOMAIN:
                // Check for custom domain mapping
                // This would require a database lookup
                const customDomain = req.get('host');
                if (customDomain && options.enableCustomDomains) {
                    // TODO: Implement custom domain lookup
                    // tenantId = await lookupCustomDomain(customDomain);
                    // if (tenantId) source = TENANT_SOURCES.CUSTOM_DOMAIN;
                }
                break;

            default:
                logger.warn('Unknown tenant source type', { sourceType });
        }

        // Break if tenant ID found
        if (tenantId) {
            break;
        }
    }

    return { tenantId, source };
}

/**
 * Validate tenant ID format
 * @param {string} tenantId - Tenant ID to validate
 * @returns {boolean} True if valid format
 * @private
 */
function isValidTenantIdFormat(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
        return false;
    }

    // Check for MongoDB ObjectId format (24 hex characters)
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (objectIdRegex.test(tenantId)) {
        return true;
    }

    // Check for UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(tenantId)) {
        return true;
    }

    // Check for slug format (alphanumeric with hyphens/underscores)
    const slugRegex = /^[a-z0-9][a-z0-9-_]{2,49}$/i;
    if (slugRegex.test(tenantId)) {
        return true;
    }

    return false;
}

/**
 * Get tenant from cache
 * @param {string} tenantId - Tenant ID
 * @returns {Object|null} Cached tenant data or null
 * @private
 */
function getTenantFromCache(tenantId) {
    const cached = tenantCache.get(tenantId);
    
    if (!cached) {
        return null;
    }

    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        tenantCache.delete(tenantId);
        return null;
    }

    tenantStats.cacheHits++;
    return cached.data;
}

/**
 * Store tenant in cache
 * @param {string} tenantId - Tenant ID
 * @param {Object} tenantData - Tenant data to cache
 * @private
 */
function cacheTenant(tenantId, tenantData) {
    tenantCache.set(tenantId, {
        data: tenantData,
        timestamp: Date.now()
    });
}

/**
 * Validate tenant exists and is active
 * @param {string} tenantId - Tenant ID to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result with tenant data
 * @private
 */
async function validateTenantExists(tenantId, options = {}) {
    try {
        // Check cache first
        const cached = getTenantFromCache(tenantId);
        if (cached && !options.skipCache) {
            return {
                valid: true,
                tenant: cached,
                fromCache: true
            };
        }

        tenantStats.cacheMisses++;

        // Get Organization model (assuming tenants are organizations)
        const Organization = database.getModel('Organization');
        
        if (!Organization) {
            logger.warn('Organization model not found for tenant validation');
            // Continue without database validation if model not available
            return {
                valid: true,
                tenant: { _id: tenantId, status: TENANT_STATUS.ACTIVE },
                modelNotAvailable: true
            };
        }

        // Query database for tenant
        const tenant = await Organization.findOne({
            $or: [
                { _id: tenantId },
                { slug: tenantId },
                { customDomain: tenantId }
            ]
        }).select('_id name slug status subscription settings customDomain');

        if (!tenant) {
            return {
                valid: false,
                code: 'TENANT_NOT_FOUND',
                message: 'Organization not found',
                statusCode: 404
            };
        }

        // Check tenant status
        switch (tenant.status) {
            case TENANT_STATUS.ACTIVE:
                // All good
                break;

            case TENANT_STATUS.TRIAL:
                // Check if trial expired
                if (tenant.subscription?.trialEndsAt && 
                    new Date() > tenant.subscription.trialEndsAt) {
                    return {
                        valid: false,
                        code: 'TENANT_TRIAL_EXPIRED',
                        message: 'Trial period has expired',
                        statusCode: 403,
                        tenant: tenant
                    };
                }
                break;

            case TENANT_STATUS.SUSPENDED:
                return {
                    valid: false,
                    code: 'TENANT_SUSPENDED',
                    message: 'Organization account is suspended',
                    statusCode: 403,
                    tenant: tenant
                };

            case TENANT_STATUS.EXPIRED:
                return {
                    valid: false,
                    code: 'TENANT_EXPIRED',
                    message: 'Organization subscription has expired',
                    statusCode: 403,
                    tenant: tenant
                };

            case TENANT_STATUS.PENDING:
                if (options.allowPending) {
                    break;
                }
                return {
                    valid: false,
                    code: 'TENANT_PENDING',
                    message: 'Organization account is pending activation',
                    statusCode: 403,
                    tenant: tenant
                };

            case TENANT_STATUS.DISABLED:
                return {
                    valid: false,
                    code: 'TENANT_DISABLED',
                    message: 'Organization account is disabled',
                    statusCode: 403,
                    tenant: tenant
                };

            default:
                logger.warn('Unknown tenant status', {
                    tenantId: tenant._id,
                    status: tenant.status
                });
                return {
                    valid: false,
                    code: 'TENANT_INVALID_STATUS',
                    message: 'Organization account has invalid status',
                    statusCode: 403,
                    tenant: tenant
                };
        }

        // Check subscription if required
        if (options.requireSubscription && tenant.subscription) {
            if (tenant.subscription.status !== 'active') {
                return {
                    valid: false,
                    code: 'TENANT_SUBSCRIPTION_INACTIVE',
                    message: 'Organization subscription is not active',
                    statusCode: 403,
                    tenant: tenant
                };
            }

            // Check subscription expiry
            if (tenant.subscription.expiresAt && 
                new Date() > tenant.subscription.expiresAt) {
                return {
                    valid: false,
                    code: 'TENANT_SUBSCRIPTION_EXPIRED',
                    message: 'Organization subscription has expired',
                    statusCode: 403,
                    tenant: tenant
                };
            }
        }

        // Cache the tenant
        cacheTenant(tenantId, tenant.toObject());

        return {
            valid: true,
            tenant: tenant.toObject()
        };

    } catch (error) {
        logger.error('Tenant validation error', {
            error: error.message,
            tenantId: tenantId
        });

        // Fail open or closed based on configuration
        if (options.failOpen) {
            logger.warn('Tenant validation failed, allowing request (fail-open mode)', {
                tenantId: tenantId
            });
            return {
                valid: true,
                tenant: { _id: tenantId, status: TENANT_STATUS.ACTIVE },
                validationError: error.message
            };
        }

        return {
            valid: false,
            code: 'TENANT_VALIDATION_ERROR',
            message: 'Failed to validate organization',
            statusCode: 500,
            error: error.message
        };
    }
}

/**
 * Validate user has access to tenant
 * @param {Object} user - User object
 * @param {string} tenantId - Tenant ID
 * @returns {Object} Validation result
 * @private
 */
function validateUserTenantAccess(user, tenantId) {
    if (!user || !user.organizations) {
        return {
            valid: false,
            code: 'USER_NO_ORGANIZATIONS',
            message: 'User has no organization memberships'
        };
    }

    const hasAccess = user.organizations.some(org => 
        org.organizationId.toString() === tenantId.toString()
    );

    if (!hasAccess) {
        return {
            valid: false,
            code: 'USER_NO_TENANT_ACCESS',
            message: 'User does not have access to this organization'
        };
    }

    // Get organization-specific info
    const orgMembership = user.organizations.find(org => 
        org.organizationId.toString() === tenantId.toString()
    );

    // Check membership status
    if (orgMembership.status !== 'active') {
        return {
            valid: false,
            code: 'USER_MEMBERSHIP_INACTIVE',
            message: `Organization membership is ${orgMembership.status}`
        };
    }

    return {
        valid: true,
        membership: orgMembership
    };
}

/**
 * Main tenant validation middleware factory
 * @param {Object} options - Middleware configuration options
 * @param {Array<string>} [options.sources] - Where to look for tenant ID
 * @param {boolean} [options.required=true] - Whether tenant is required
 * @param {boolean} [options.validateExists=true] - Validate tenant exists in database
 * @param {boolean} [options.validateUserAccess=false] - Validate user has access to tenant
 * @param {boolean} [options.requireSubscription=false] - Require active subscription
 * @param {boolean} [options.allowPending=false] - Allow pending tenants
 * @param {boolean} [options.enableCustomDomains=false] - Enable custom domain lookup
 * @param {boolean} [options.failOpen=false] - Allow request if validation fails
 * @param {boolean} [options.skipCache=false] - Skip cache lookup
 * @returns {Function} Express middleware function
 */
function validateTenant(options = {}) {
    const config = {
        sources: options.sources || [
            TENANT_SOURCES.HEADER,
            TENANT_SOURCES.TOKEN,
            TENANT_SOURCES.PATH,
            TENANT_SOURCES.SUBDOMAIN,
            TENANT_SOURCES.QUERY
        ],
        required: options.required !== false,
        validateExists: options.validateExists !== false,
        validateUserAccess: options.validateUserAccess || false,
        requireSubscription: options.requireSubscription || false,
        allowPending: options.allowPending || false,
        enableCustomDomains: options.enableCustomDomains || false,
        failOpen: options.failOpen || false,
        skipCache: options.skipCache || false
    };

    return async (req, res, next) => {
        try {
            tenantStats.totalValidations++;

            // Extract tenant ID from request
            const { tenantId, source } = extractTenantId(req, config.sources, config);

            // Handle missing tenant ID
            if (!tenantId) {
                tenantStats.missingTenant++;

                if (!config.required) {
                    // Tenant is optional, continue without it
                    req.tenant = null;
                    req.tenantId = null;
                    return next();
                }

                tenantStats.failedValidations++;
                return next(new AppError(
                    'Organization identifier is required. Please provide a valid organization ID.',
                    400,
                    'MISSING_TENANT_ID'
                ));
            }

            // Validate tenant ID format
            if (!isValidTenantIdFormat(tenantId)) {
                tenantStats.invalidTenant++;
                tenantStats.failedValidations++;
                
                logger.warn('Invalid tenant ID format', {
                    tenantId: tenantId,
                    source: source
                });

                return next(new AppError(
                    'Invalid organization identifier format',
                    400,
                    'INVALID_TENANT_ID_FORMAT'
                ));
            }

            // Validate tenant exists and is active
            if (config.validateExists) {
                const validation = await validateTenantExists(tenantId, {
                    requireSubscription: config.requireSubscription,
                    allowPending: config.allowPending,
                    skipCache: config.skipCache,
                    failOpen: config.failOpen
                });

                if (!validation.valid) {
                    tenantStats.failedValidations++;

                    // Track specific failure types
                    switch (validation.code) {
                        case 'TENANT_SUSPENDED':
                            tenantStats.suspendedTenant++;
                            break;
                        case 'TENANT_EXPIRED':
                        case 'TENANT_TRIAL_EXPIRED':
                            tenantStats.expiredTenant++;
                            break;
                        default:
                            tenantStats.invalidTenant++;
                    }

                    logger.warn('Tenant validation failed', {
                        tenantId: tenantId,
                        code: validation.code,
                        message: validation.message
                    });

                    return next(new AppError(
                        validation.message,
                        validation.statusCode,
                        validation.code,
                        validation.tenant ? { tenantId: validation.tenant._id } : undefined
                    ));
                }

                // Attach tenant data to request
                req.tenant = validation.tenant;
            }

            // Validate user has access to tenant (if user is authenticated)
            if (config.validateUserAccess && req.user) {
                const accessValidation = validateUserTenantAccess(req.user, tenantId);
                
                if (!accessValidation.valid) {
                    tenantStats.failedValidations++;
                    
                    logger.warn('User tenant access validation failed', {
                        userId: req.user.id,
                        tenantId: tenantId,
                        code: accessValidation.code
                    });

                    return next(new AppError(
                        accessValidation.message,
                        403,
                        accessValidation.code
                    ));
                }

                // Attach membership info
                req.tenantMembership = accessValidation.membership;
            }

            // Attach tenant ID to request
            req.tenantId = tenantId;
            req.tenantSource = source;

            tenantStats.successfulValidations++;

            // Log tenant context
            logger.debug('Tenant validated', {
                tenantId: tenantId,
                source: source,
                userId: req.user?.id,
                path: req.path
            });

            next();

        } catch (error) {
            tenantStats.failedValidations++;
            
            logger.error('Tenant validation middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError(
                'Tenant validation failed',
                500,
                'TENANT_VALIDATION_ERROR'
            ));
        }
    };
}

/**
 * Optional tenant validation (doesn't fail if tenant is missing)
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function optionalTenant(options = {}) {
    return validateTenant({ ...options, required: false });
}

/**
 * Require tenant with user access validation
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function requireTenantAccess(options = {}) {
    return validateTenant({
        ...options,
        required: true,
        validateUserAccess: true
    });
}

/**
 * Clear tenant cache
 * @param {string} [tenantId] - Specific tenant ID to clear, or all if not provided
 */
function clearTenantCache(tenantId = null) {
    if (tenantId) {
        tenantCache.delete(tenantId);
        logger.debug('Tenant cache cleared', { tenantId });
    } else {
        tenantCache.clear();
        logger.info('All tenant cache cleared');
    }
}

/**
 * Get tenant validation statistics
 * @returns {Object} Tenant validation statistics
 */
function getTenantStats() {
    return {
        ...tenantStats,
        validationRate: tenantStats.totalValidations > 0
            ? ((tenantStats.successfulValidations / tenantStats.totalValidations) * 100).toFixed(2) + '%'
            : '0%',
        cacheHitRate: (tenantStats.cacheHits + tenantStats.cacheMisses) > 0
            ? ((tenantStats.cacheHits / (tenantStats.cacheHits + tenantStats.cacheMisses)) * 100).toFixed(2) + '%'
            : '0%',
        cacheSize: tenantCache.size,
        timestamp: new Date()
    };
}

/**
 * Reset tenant validation statistics
 */
function resetTenantStats() {
    tenantStats.totalValidations = 0;
    tenantStats.successfulValidations = 0;
    tenantStats.failedValidations = 0;
    tenantStats.missingTenant = 0;
    tenantStats.invalidTenant = 0;
    tenantStats.suspendedTenant = 0;
    tenantStats.expiredTenant = 0;
    tenantStats.cacheHits = 0;
    tenantStats.cacheMisses = 0;
    
    logger.info('Tenant validation statistics reset');
}

module.exports = validateTenant;
module.exports.validateTenant = validateTenant;
module.exports.optionalTenant = optionalTenant;
module.exports.requireTenantAccess = requireTenantAccess;
module.exports.clearTenantCache = clearTenantCache;
module.exports.getTenantStats = getTenantStats;
module.exports.resetTenantStats = resetTenantStats;
module.exports.TENANT_SOURCES = TENANT_SOURCES;
module.exports.TENANT_STATUS = TENANT_STATUS;