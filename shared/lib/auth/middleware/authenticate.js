/**
 * @fileoverview Enterprise Authentication Middleware
 * @module shared/lib/auth/middleware/authenticate
 * @description Comprehensive JWT authentication middleware with session validation, blacklist checking, and security features
 * @version 2.0.0
 */

const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger').createLogger({ serviceName: 'authenticate-middleware' });
const TokenService = require('../services/token-service');
const BlacklistService = require('../services/blacklist-service');
const SessionService = require('../services/session-service');
const database = require('../../database');

/**
 * Token Extraction Strategies
 * @enum {string}
 */
const TOKEN_SOURCES = {
    HEADER: 'header',
    QUERY: 'query',
    COOKIE: 'cookie',
    BODY: 'body'
};

/**
 * Authentication Configuration
 * @type {Object}
 */
const AUTH_CONFIG = {
    enableSessionValidation: process.env.AUTH_ENABLE_SESSION_VALIDATION !== 'false',
    enableBlacklistCheck: process.env.AUTH_ENABLE_BLACKLIST_CHECK !== 'false',
    enableSecurityBindings: process.env.AUTH_ENABLE_SECURITY_BINDINGS !== 'false',
    enableActivityTracking: process.env.AUTH_ENABLE_ACTIVITY_TRACKING !== 'false',
    enableStrictMode: process.env.AUTH_STRICT_MODE === 'true',
    refreshTokenOnActivity: process.env.AUTH_REFRESH_ON_ACTIVITY === 'true',
    tokenSources: [TOKEN_SOURCES.HEADER, TOKEN_SOURCES.COOKIE],
    allowMultipleSessions: process.env.AUTH_ALLOW_MULTIPLE_SESSIONS !== 'false',
    trackDevices: process.env.AUTH_TRACK_DEVICES !== 'false',
    securityHeaders: {
        enableCSRF: process.env.AUTH_ENABLE_CSRF !== 'false',
        enableCORS: process.env.AUTH_ENABLE_CORS !== 'false'
    }
};

/**
 * Statistics tracking for authentication middleware
 * @type {Object}
 */
const authStats = {
    totalRequests: 0,
    successfulAuth: 0,
    failedAuth: 0,
    blacklistedTokens: 0,
    expiredTokens: 0,
    invalidTokens: 0,
    securityViolations: 0,
    sessionValidationFailures: 0
};

/**
 * Extract authentication token from request
 * Supports multiple extraction strategies based on configuration
 * @param {Object} req - Express request object
 * @param {Array<string>} [sources] - Token sources to check
 * @returns {Object} Token and source information
 * @private
 */
function extractToken(req, sources = AUTH_CONFIG.tokenSources) {
    let token = null;
    let source = null;

    for (const sourceType of sources) {
        switch (sourceType) {
            case TOKEN_SOURCES.HEADER:
                // Check Authorization header (Bearer token)
                const authHeader = req.headers.authorization || req.headers.Authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7).trim();
                    source = TOKEN_SOURCES.HEADER;
                }
                
                // Check x-access-token header
                if (!token && req.headers['x-access-token']) {
                    token = req.headers['x-access-token'];
                    source = TOKEN_SOURCES.HEADER;
                }
                break;

            case TOKEN_SOURCES.COOKIE:
                // Check for token in cookies
                if (!token && req.cookies && req.cookies.accessToken) {
                    token = req.cookies.accessToken;
                    source = TOKEN_SOURCES.COOKIE;
                }
                if (!token && req.cookies && req.cookies.token) {
                    token = req.cookies.token;
                    source = TOKEN_SOURCES.COOKIE;
                }
                break;

            case TOKEN_SOURCES.QUERY:
                // Check query parameter (use with caution)
                if (!token && req.query && req.query.token) {
                    token = req.query.token;
                    source = TOKEN_SOURCES.QUERY;
                    
                    // Log warning for query-based auth in production
                    if (process.env.NODE_ENV === 'production') {
                        logger.warn('Token provided in query string', {
                            path: req.path,
                            ip: req.ip
                        });
                    }
                }
                break;

            case TOKEN_SOURCES.BODY:
                // Check request body (POST requests only)
                if (!token && req.body && req.body.token && req.method === 'POST') {
                    token = req.body.token;
                    source = TOKEN_SOURCES.BODY;
                }
                break;

            default:
                logger.warn('Unknown token source type', { sourceType });
        }

        // Break if token found
        if (token) {
            break;
        }
    }

    return { token, source };
}

/**
 * Validate user account status
 * @param {Object} user - User document from database
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 * @private
 */
function validateAccountStatus(user, options = {}) {
    const status = user.accountStatus?.status;

    switch (status) {
        case 'active':
            return { valid: true };

        case 'pending_verification':
            if (options.requireVerified) {
                return {
                    valid: false,
                    code: 'EMAIL_VERIFICATION_REQUIRED',
                    message: 'Please verify your email address to continue.',
                    statusCode: 403
                };
            }
            return { valid: true };

        case 'pending_approval':
            return {
                valid: false,
                code: 'ACCOUNT_PENDING_APPROVAL',
                message: 'Your account is pending approval from an administrator.',
                statusCode: 403
            };

        case 'suspended':
            const suspendedUntil = user.accountStatus?.suspendedUntil;
            const suspensionReason = user.accountStatus?.suspensionReason;
            
            return {
                valid: false,
                code: 'ACCOUNT_SUSPENDED',
                message: `Account suspended${suspensionReason ? ': ' + suspensionReason : ''}`,
                statusCode: 403,
                metadata: {
                    suspendedUntil: suspendedUntil,
                    reason: suspensionReason
                }
            };

        case 'locked':
            const lockInfo = user.security?.loginAttempts;
            if (lockInfo?.lockUntil && new Date() < lockInfo.lockUntil) {
                const remainingTime = Math.ceil((lockInfo.lockUntil - new Date()) / 60000);
                return {
                    valid: false,
                    code: 'ACCOUNT_LOCKED',
                    message: `Account locked due to too many failed login attempts. Try again in ${remainingTime} minutes.`,
                    statusCode: 403,
                    metadata: {
                        lockUntil: lockInfo.lockUntil,
                        remainingMinutes: remainingTime
                    }
                };
            }
            // Lock expired, should be handled by auth service
            return { valid: true };

        case 'deleted':
            return {
                valid: false,
                code: 'ACCOUNT_DELETED',
                message: 'Account has been deleted.',
                statusCode: 404
            };

        case 'banned':
            return {
                valid: false,
                code: 'ACCOUNT_BANNED',
                message: 'Account has been permanently banned.',
                statusCode: 403
            };

        case 'inactive':
            return {
                valid: false,
                code: 'ACCOUNT_INACTIVE',
                message: 'Account is inactive. Please contact support.',
                statusCode: 403
            };

        default:
            logger.error('Unknown account status encountered', {
                userId: user._id,
                status: status
            });
            return {
                valid: false,
                code: 'INVALID_ACCOUNT_STATUS',
                message: 'Account status is invalid.',
                statusCode: 403
            };
    }
}

/**
 * Validate role requirements
 * @param {Object} user - User object with role information
 * @param {Array<string>} requiredRoles - Required roles
 * @param {string} tenantId - Tenant identifier
 * @returns {Object} Validation result
 * @private
 */
function validateRoles(user, requiredRoles, tenantId) {
    if (!requiredRoles || requiredRoles.length === 0) {
        return { valid: true };
    }

    // Get user roles for the specific tenant
    const organization = user.organizations?.find(
        org => org.organizationId.toString() === tenantId.toString()
    );

    if (!organization) {
        return {
            valid: false,
            code: 'NO_ORGANIZATION_ACCESS',
            message: 'User does not have access to this organization.',
            statusCode: 403
        };
    }

    const userRoles = organization.roles?.map(r => r.roleName) || [];

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
        return {
            valid: false,
            code: 'INSUFFICIENT_ROLE',
            message: `Access denied. Required roles: ${requiredRoles.join(' or ')}`,
            statusCode: 403,
            metadata: {
                requiredRoles: requiredRoles,
                userRoles: userRoles
            }
        };
    }

    return { valid: true };
}

/**
 * Perform security validations on the request
 * @param {Object} req - Express request object
 * @param {Object} decoded - Decoded token payload
 * @param {Object} options - Security options
 * @returns {Object} Validation result
 * @private
 */
function performSecurityValidations(req, decoded, options = {}) {
    if (!AUTH_CONFIG.enableSecurityBindings) {
        return { valid: true };
    }

    const violations = [];

    // IP address validation
    if (decoded.ip && options.validateIP !== false) {
        const currentIP = req.ip || req.connection.remoteAddress;
        if (decoded.ip !== currentIP) {
            violations.push({
                type: 'IP_MISMATCH',
                message: 'Token IP address does not match request IP',
                severity: 'high',
                expected: decoded.ip,
                actual: currentIP
            });
        }
    }

    // User-Agent validation
    if (decoded.userAgent && options.validateUserAgent !== false) {
        const currentUA = req.get('user-agent');
        const decodedUA = decoded.userAgent;
        
        // Compare hashed user agents if using hash-based comparison
        if (currentUA && decodedUA) {
            const crypto = require('crypto');
            const hashedCurrentUA = crypto.createHash('sha256')
                .update(currentUA)
                .digest('hex')
                .substring(0, 16);
            
            if (decodedUA !== hashedCurrentUA) {
                violations.push({
                    type: 'USER_AGENT_MISMATCH',
                    message: 'User-Agent has changed',
                    severity: 'medium'
                });
            }
        }
    }

    // Device fingerprint validation
    if (decoded.fingerprint && options.validateFingerprint !== false) {
        const currentFingerprint = req.body?.deviceFingerprint || 
                                  req.headers['x-device-fingerprint'];
        
        if (currentFingerprint && decoded.fingerprint !== currentFingerprint) {
            violations.push({
                type: 'FINGERPRINT_MISMATCH',
                message: 'Device fingerprint has changed',
                severity: 'high'
            });
        }
    }

    // Check if any high-severity violations exist
    const hasHighSeverityViolations = violations.some(v => v.severity === 'high');

    if (AUTH_CONFIG.enableStrictMode && violations.length > 0) {
        authStats.securityViolations++;
        return {
            valid: false,
            code: 'SECURITY_VIOLATION',
            message: 'Security validation failed',
            statusCode: 401,
            violations: violations
        };
    }

    if (hasHighSeverityViolations && !AUTH_CONFIG.enableStrictMode) {
        // Log but don't block in non-strict mode
        logger.warn('Security violations detected (non-strict mode)', {
            violations: violations,
            userId: decoded.id,
            ip: req.ip
        });
    }

    return {
        valid: true,
        warnings: violations.length > 0 ? violations : undefined
    };
}

/**
 * Main authentication middleware factory
 * Creates middleware function with specified options
 * @param {Object} options - Middleware configuration options
 * @param {boolean} [options.optional=false] - Allow unauthenticated requests
 * @param {Array<string>} [options.requireRoles] - Required user roles
 * @param {boolean} [options.requireVerified=false] - Require verified email
 * @param {boolean} [options.validateSession=true] - Validate session
 * @param {boolean} [options.validateIP=true] - Validate IP address
 * @param {boolean} [options.validateUserAgent=true] - Validate User-Agent
 * @param {boolean} [options.validateFingerprint=true] - Validate device fingerprint
 * @param {Array<string>} [options.tokenSources] - Where to look for tokens
 * @param {boolean} [options.trackActivity=true] - Track user activity
 * @param {string} [options.scope] - Required token scope
 * @returns {Function} Express middleware function
 */
function authenticate(options = {}) {
    // Merge options with defaults
    const config = {
        optional: options.optional || false,
        requireRoles: options.requireRoles || null,
        requireVerified: options.requireVerified || false,
        validateSession: options.validateSession !== false && AUTH_CONFIG.enableSessionValidation,
        validateIP: options.validateIP !== false,
        validateUserAgent: options.validateUserAgent !== false,
        validateFingerprint: options.validateFingerprint !== false,
        tokenSources: options.tokenSources || AUTH_CONFIG.tokenSources,
        trackActivity: options.trackActivity !== false && AUTH_CONFIG.enableActivityTracking,
        scope: options.scope || null
    };

    return async (req, res, next) => {
        try {
            console.log('[AUTH MIDDLEWARE] Middleware invoked for path:', req.path);
            authStats.totalRequests++;

            // Extract token from request
            const { token, source } = extractToken(req, config.tokenSources);
            console.log('[AUTH MIDDLEWARE] Token extracted:', token ? 'YES' : 'NO', 'Source:', source);

            // Handle missing token
            if (!token) {
                if (config.optional) {
                    req.user = null;
                    req.authenticated = false;
                    return next();
                }

                authStats.failedAuth++;
                return next(new AppError(
                    'Authentication required. Please provide a valid access token.',
                    401,
                    'MISSING_TOKEN'
                ));
            }

            // Check if token is blacklisted
            if (AUTH_CONFIG.enableBlacklistCheck) {
                const isBlacklisted = await BlacklistService.isTokenBlacklisted(token, {
                    tokenType: 'access'
                });

                if (isBlacklisted) {
                    authStats.blacklistedTokens++;
                    authStats.failedAuth++;
                    
                    logger.warn('Blacklisted token usage attempt', {
                        source: source,
                        ip: req.ip,
                        path: req.path
                    });

                    return next(new AppError(
                        'Token has been revoked. Please login again.',
                        401,
                        'TOKEN_REVOKED'
                    ));
                }
            }

            // Verify and decode token
            let decoded;
            try {
                decoded = TokenService.verifyToken(token, 'access', {
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                    fingerprint: req.body?.deviceFingerprint || req.headers['x-device-fingerprint'],
                    verifyOptions: {
                        // Make audience and issuer optional for universal compatibility
                        audience: undefined,
                        issuer: undefined
                    }
                });
            } catch (error) {
                authStats.failedAuth++;

                // Log full error details for debugging
                console.log('[TOKEN VERIFY ERROR]', {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                });

                // Handle specific token errors
                switch (error.code) {
                    case 'TOKEN_EXPIRED':
                        authStats.expiredTokens++;
                        return next(new AppError(
                            'Access token has expired. Please refresh your token.',
                            401,
                            'TOKEN_EXPIRED'
                        ));

                    case 'INVALID_TOKEN':
                    case 'INVALID_TOKEN_TYPE':
                    case 'VERIFICATION_FAILED':
                        authStats.invalidTokens++;
                        logger.error('Invalid token', {
                            error: error.message,
                            code: error.code,
                            path: req.path
                        });
                        return next(new AppError(
                            'Invalid access token provided.',
                            401,
                            'INVALID_TOKEN'
                        ));

                    case 'TOKEN_NOT_ACTIVE':
                        authStats.invalidTokens++;
                        return next(new AppError(
                            'Token not yet valid.',
                            401,
                            'TOKEN_NOT_ACTIVE'
                        ));

                    case 'IP_MISMATCH':
                    case 'USER_AGENT_MISMATCH':
                    case 'FINGERPRINT_MISMATCH':
                        authStats.securityViolations++;
                        logger.warn('Token security binding violation', {
                            code: error.code,
                            userId: decoded?.id,
                            tokenIP: decoded?.ip,
                            requestIP: req.ip,
                            path: req.path
                        });
                        return next(new AppError(
                            'Token security validation failed.',
                            401,
                            'SECURITY_VIOLATION'
                        ));

                    default:
                        authStats.invalidTokens++;
                        logger.error('Unhandled token verification error', {
                            error: error.message,
                            code: error.code,
                            name: error.name,
                            path: req.path
                        });
                        return next(new AppError(
                            'Token verification failed.',
                            401,
                            'TOKEN_VERIFICATION_FAILED'
                        ));
                }
            }

            // Validate token scope if required
            if (config.scope && decoded.scope !== config.scope) {
                authStats.failedAuth++;
                return next(new AppError(
                    `Insufficient token scope. Required: ${config.scope}`,
                    403,
                    'INSUFFICIENT_SCOPE'
                ));
            }

            // Perform additional security validations
            const securityResult = performSecurityValidations(req, decoded, {
                validateIP: config.validateIP,
                validateUserAgent: config.validateUserAgent,
                validateFingerprint: config.validateFingerprint
            });

            if (!securityResult.valid) {
                authStats.failedAuth++;
                logger.warn('Security validation failed', {
                    userId: decoded.id,
                    violations: securityResult.violations,
                    ip: req.ip,
                    path: req.path
                });
                return next(new AppError(
                    securityResult.message,
                    securityResult.statusCode,
                    securityResult.code
                ));
            }

            // Get user from database for fresh data
            const dbService = database.getDatabaseService();
            const User = dbService.getModel('User', 'customer');

            if (!User) {
                authStats.failedAuth++;
                logger.error('User model not available', {
                    userId: decoded.id
                });
                return next(new AppError(
                    'Database model not available.',
                    500,
                    'MODEL_NOT_AVAILABLE'
                ));
            }

            // Universal user lookup - BYPASS THE MODEL AND USE RAW CONNECTION
            console.log('[AUTH MIDDLEWARE] Looking up user:', decoded.id);
            console.log('[AUTH MIDDLEWARE] Bypassing User model - querying directly via connection');

            // Get the MongoDB native collection directly
            const mongoose = require('mongoose');
            const ObjectId = mongoose.Types.ObjectId;
            const usersCollection = User.db.collection('users');

            console.log('[AUTH MIDDLEWARE] Querying users collection directly...');
            const user = await usersCollection.findOne({ _id: new ObjectId(decoded.id) });
            console.log('[AUTH MIDDLEWARE] Direct query completed! User found:', user ? 'YES' : 'NO');

            if (!user) {
                authStats.failedAuth++;
                logger.warn('User not found for valid token', {
                    userId: decoded.id,
                    tenantId: decoded.tenantId
                });
                return next(new AppError(
                    'User not found or access denied.',
                    404,
                    'USER_NOT_FOUND'
                ));
            }

            // Validate account status
            const statusValidation = validateAccountStatus(user, {
                requireVerified: config.requireVerified
            });

            if (!statusValidation.valid) {
                authStats.failedAuth++;
                return next(new AppError(
                    statusValidation.message,
                    statusValidation.statusCode,
                    statusValidation.code,
                    statusValidation.metadata
                ));
            }

            // Validate roles if required
            if (config.requireRoles) {
                const roleValidation = validateRoles(user, config.requireRoles, decoded.tenantId);
                
                if (!roleValidation.valid) {
                    authStats.failedAuth++;
                    logger.warn('Role validation failed', {
                        userId: user._id,
                        requiredRoles: config.requireRoles,
                        userRoles: roleValidation.metadata?.userRoles
                    });
                    return next(new AppError(
                        roleValidation.message,
                        roleValidation.statusCode,
                        roleValidation.code,
                        roleValidation.metadata
                    ));
                }
            }

            // Validate session if required
            if (config.validateSession && decoded.sessionId) {
                try {
                    const session = await SessionService.getSession(decoded.sessionId, {
                        ip: req.ip,
                        userAgent: req.get('user-agent'),
                        fingerprint: req.body?.deviceFingerprint
                    });

                    if (!session) {
                        authStats.sessionValidationFailures++;
                        authStats.failedAuth++;
                        return next(new AppError(
                            'Session is invalid or expired. Please login again.',
                            401,
                            'INVALID_SESSION'
                        ));
                    }

                    req.session = session;

                    // Track activity in session
                    if (config.trackActivity) {
                        await SessionService.recordActivity(decoded.sessionId, {
                            action: `${req.method} ${req.path}`,
                            pageView: req.path,
                            metadata: {
                                userAgent: req.get('user-agent'),
                                ip: req.ip
                            }
                        }).catch(err => {
                            logger.error('Failed to record session activity', {
                                error: err.message,
                                sessionId: decoded.sessionId
                            });
                        });
                    }
                } catch (error) {
                    authStats.sessionValidationFailures++;
                    logger.error('Session validation error', {
                        error: error.message,
                        sessionId: decoded.sessionId
                    });
                    // Continue without session in non-strict mode
                    if (AUTH_CONFIG.enableStrictMode) {
                        authStats.failedAuth++;
                        return next(new AppError(
                            'Session validation failed.',
                            500,
                            'SESSION_VALIDATION_ERROR'
                        ));
                    }
                }
            }

            // Attach user information to request
            req.user = {
                id: user._id.toString(),
                email: user.email,
                username: user.username,
                firstName: user.profile?.firstName,
                lastName: user.profile?.lastName,
                fullName: user.fullName,
                role: decoded.role,
                roles: decoded.roles,
                tenantId: decoded.tenantId,
                organizationId: decoded.organizationId,
                permissions: user.permissions || [],
                organizations: user.organizations || [],  // ✅ ADD THIS LINE
                clientId: decoded.clientId || user.clientId,
                consultantId: decoded.consultantId || user.consultantId,
                mfaEnabled: user.mfa?.enabled || false,
                emailVerified: user.verification?.email?.verified || false,
                phoneVerified: user.verification?.phone?.verified || false,
                accountStatus: user.accountStatus?.status,
                preferences: user.preferences
            };

            // Attach authentication metadata
            req.auth = {
                type: 'jwt',
                token: token,
                tokenSource: source,
                tokenPayload: decoded,
                authenticated: true,
                sessionValidated: config.validateSession && !!req.session,
                securityWarnings: securityResult.warnings
            };

            req.authenticated = true;

            authStats.successfulAuth++;

            // Log security warnings if present
            if (securityResult.warnings) {
                logger.warn('Authentication succeeded with security warnings', {
                    userId: req.user.id,
                    warnings: securityResult.warnings,
                    ip: req.ip
                });
            }

            console.log('[AUTH MIDDLEWARE] Authentication successful, calling next()');
            next();
            console.log('[AUTH MIDDLEWARE] next() called successfully');

        } catch (error) {
            authStats.failedAuth++;
            logger.error('Authentication middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                ip: req.ip
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError(
                'Authentication processing failed.',
                500,
                'AUTHENTICATION_ERROR'
            ));
        }
    };
}

/**
 * Middleware to require specific roles
 * Shorthand for authenticate({ requireRoles: [...] })
 * @param {Array<string>} roles - Required roles
 * @returns {Function} Express middleware
 */
function requireRoles(roles) {
    return authenticate({ requireRoles: roles });
}

/**
 * Middleware to require email verification
 * Shorthand for authenticate({ requireVerified: true })
 * @returns {Function} Express middleware
 */
function requireVerified() {
    return authenticate({ requireVerified: true });
}

/**
 * Middleware for optional authentication
 * Attaches user if token is present, but doesn't fail if missing
 * @returns {Function} Express middleware
 */
function optionalAuth() {
    return authenticate({ optional: true });
}

/**
 * Middleware that requires authentication with session validation
 * Shorthand for authenticate({ validateSession: true })
 * @returns {Function} Express middleware
 */
function requireSession() {
    return authenticate({ validateSession: true });
}

/**
 * Middleware that requires authentication without session validation
 * Useful for stateless API endpoints
 * @returns {Function} Express middleware
 */
function statelessAuth() {
    return authenticate({ validateSession: false });
}

/**
 * Get authentication statistics
 * @returns {Object} Authentication statistics
 */
function getAuthStats() {
    return {
        ...authStats,
        successRate: authStats.totalRequests > 0
            ? ((authStats.successfulAuth / authStats.totalRequests) * 100).toFixed(2) + '%'
            : '0%',
        timestamp: new Date()
    };
}

/**
 * Reset authentication statistics
 */
function resetAuthStats() {
    authStats.totalRequests = 0;
    authStats.successfulAuth = 0;
    authStats.failedAuth = 0;
    authStats.blacklistedTokens = 0;
    authStats.expiredTokens = 0;
    authStats.invalidTokens = 0;
    authStats.securityViolations = 0;
    authStats.sessionValidationFailures = 0;
    
    logger.info('Authentication statistics reset');
}

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.requireRoles = requireRoles;
module.exports.requireVerified = requireVerified;
module.exports.optionalAuth = optionalAuth;
module.exports.requireSession = requireSession;
module.exports.statelessAuth = statelessAuth;
module.exports.getAuthStats = getAuthStats;
module.exports.resetAuthStats = resetAuthStats;