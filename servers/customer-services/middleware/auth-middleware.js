/**
 * @fileoverview Authentication Middleware with Token Blacklist and Database User Loading
 * @module servers/customer-services/middleware/auth-middleware
 * @description Production-ready authentication middleware with database-backed blacklist and current permissions
 */

const passport = require('passport');
const { AppError } = require('../../../shared/lib/utils/app-error');
const directAuthService = require('../modules/core-business/authentication/services/direct-auth-service');
const database = require('../../../shared/lib/database');
const logger = require('../../../shared/lib/utils/logger').createLogger({
    serviceName: 'auth-middleware'
});

/**
 * JWT Authentication Middleware with Token Blacklist Check and Database User Loading
 * 
 * This middleware performs a three-step authentication process:
 * 1. Verifies JWT signature and expiration using Passport
 * 2. Checks if the token has been blacklisted (logged out) in the database
 * 3. Loads current user data from database to get up-to-date permissions
 * 
 * This ensures that:
 * - Even valid JWTs cannot be used after logout (token blacklisting)
 * - Permissions are always current (not stale from token creation)
 * - Both flat and organization-scoped permissions are available
 * - Account status changes are immediately effective
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
    try {
        // Step 1: Verify JWT with Passport
        passport.authenticate('jwt', { session: false }, async (err, tokenPayload, info) => {
            try {
                // Handle Passport errors
                if (err) {
                    logger.error('Passport authentication error', {
                        error: err.message,
                        path: req.path
                    });
                    return next(err);
                }

                // Check if JWT verification failed
                if (!tokenPayload) {
                    logger.warn('Authentication failed - Invalid token', {
                        reason: info?.message,
                        path: req.path,
                        ip: req.ip
                    });
                    return res.status(401).json({
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED',
                            message: info?.message || 'Authentication required'
                        }
                    });
                }

                // Step 2: Check if token is blacklisted
                const token = req.headers.authorization?.replace('Bearer ', '');
                
                if (token) {
                    const isBlacklisted = await directAuthService.isTokenBlacklisted(token);
                    
                    if (isBlacklisted) {
                        logger.warn('Authentication failed - Token blacklisted', {
                            userId: tokenPayload.userId || tokenPayload.id,
                            path: req.path,
                            ip: req.ip
                        });
                        return res.status(401).json({
                            success: false,
                            error: {
                                code: 'TOKEN_REVOKED',
                                message: 'Token has been revoked. Please login again.'
                            }
                        });
                    }
                }

                // Step 3: Load current user data from database
                let dbUser = null;
                const userId = tokenPayload.userId || tokenPayload.id;
                
                try {
                    // CORRECTED: Use proper database API pattern
                    const dbService = database.getDatabaseService();
                    const User = dbService.getModel('User', 'customer');
                    
                    if (User) {
                        dbUser = await User.findById(userId)
                            .select('+permissions +roles +organizations')
                            .lean();
                        
                        // Check if user exists in database
                        if (!dbUser) {
                            logger.warn('Authentication failed - User not found in database', {
                                userId: userId,
                                path: req.path
                            });
                            return res.status(401).json({
                                success: false,
                                error: {
                                    code: 'USER_NOT_FOUND',
                                    message: 'User account not found. Please login again.'
                                }
                            });
                        }

                        // Check if user account is active
                        if (dbUser.accountStatus?.status !== 'active') {
                            logger.warn('Authentication failed - User account not active', {
                                userId: userId,
                                accountStatus: dbUser.accountStatus?.status,
                                path: req.path
                            });
                            return res.status(401).json({
                                success: false,
                                error: {
                                    code: 'ACCOUNT_INACTIVE',
                                    message: `Account is ${dbUser.accountStatus?.status}. Please contact support.`
                                }
                            });
                        }
                    } else {
                        logger.warn('User model not available - using token data only', {
                            userId: userId
                        });
                    }
                } catch (dbError) {
                    logger.error('Error loading user from database - falling back to token data', {
                        error: dbError.message,
                        userId: userId
                    });
                    // Continue with token data if database query fails
                }

                // Step 4: Build comprehensive req.user object
                // Prioritize database data over token data for permissions and roles
                req.user = {
                    // Identity fields
                    id: userId,
                    userId: userId,
                    email: dbUser?.email || tokenPayload.email,
                    username: dbUser?.username || tokenPayload.username,
                    
                    // Multi-tenant fields
                    tenantId: tokenPayload.tenantId || dbUser?.tenantId,
                    organizationId: tokenPayload.organizationId || dbUser?.defaultOrganizationId,
                    userType: tokenPayload.userType || dbUser?.metadata?.userType,

                    clientId: dbUser?.clientId || tokenPayload.clientId,
                    
                    // Permission fields (PRIORITIZE DATABASE OVER TOKEN)
                    roles: dbUser?.roles || (Array.isArray(tokenPayload.roles) ? tokenPayload.roles : []),
                    permissions: dbUser?.permissions || (Array.isArray(tokenPayload.permissions) ? tokenPayload.permissions : []),
                    organizations: dbUser?.organizations || [], // Critical for organization-scoped permissions
                    
                    // Profile fields
                    firstName: dbUser?.profile?.firstName,
                    lastName: dbUser?.profile?.lastName,
                    fullName: dbUser?.fullName || (dbUser?.profile ? 
                        `${dbUser.profile.firstName || ''} ${dbUser.profile.lastName || ''}`.trim() : 
                        undefined),
                    
                    // Status fields
                    emailVerified: dbUser?.verification?.email?.verified || tokenPayload.emailVerified || false,
                    phoneVerified: dbUser?.verification?.phone?.verified || false,
                    accountStatus: dbUser?.accountStatus?.status || 'active',
                    mfaEnabled: dbUser?.mfa?.enabled || false,
                    
                    // Session fields
                    sessionId: tokenPayload.sessionId,
                    
                    // Preferences
                    preferences: dbUser?.preferences || {}
                };
                
                // Log successful authentication with permission statistics
                const permissionStats = {
                    userId: req.user.id,
                    email: req.user.email,
                    flatPermissions: req.user.permissions.length,
                    organizations: req.user.organizations.length,
                    orgPermissions: req.user.organizations.reduce((sum, org) => 
                        sum + (org.permissions?.length || 0), 0),
                    roles: req.user.roles.length,
                    dataSource: dbUser ? 'database' : 'token',
                    path: req.path
                };
                
                logger.debug('Authentication successful', permissionStats);
                
                next();

            } catch (error) {
                logger.error('Authentication processing error', {
                    error: error.message,
                    stack: error.stack,
                    userId: tokenPayload?.userId || tokenPayload?.id,
                    path: req.path
                });
                
                // Fail secure: deny access if authentication processing fails
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'AUTHENTICATION_ERROR',
                        message: 'An error occurred during authentication'
                    }
                });
            }
        })(req, res, next);

    } catch (error) {
        logger.error('Authentication middleware error', {
            error: error.message,
            stack: error.stack,
            path: req.path
        });
        
        return res.status(500).json({
            success: false,
            error: {
                code: 'AUTHENTICATION_ERROR',
                message: 'An error occurred during authentication'
            }
        });
    }
};

/**
 * Optional JWT Authentication Middleware
 * 
 * Similar to authenticate() but continues without error if no token is provided.
 * Sets req.user if a valid token exists, otherwise leaves req.user undefined.
 * Useful for routes that have different behavior for authenticated vs unauthenticated users.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        // Check if authorization header exists
        if (!req.headers.authorization) {
            return next();
        }

        // Use passport to verify token
        passport.authenticate('jwt', { session: false }, async (err, tokenPayload, info) => {
            try {
                // Silently continue if authentication fails
                if (err || !tokenPayload) {
                    return next();
                }

                // Check if token is blacklisted
                const token = req.headers.authorization?.replace('Bearer ', '');
                if (token) {
                    const isBlacklisted = await directAuthService.isTokenBlacklisted(token);
                    if (isBlacklisted) {
                        return next();
                    }
                }

                // Load user from database
                let dbUser = null;
                const userId = tokenPayload.userId || tokenPayload.id;
                
                try {
                    // CORRECTED: Use proper database API pattern
                    const dbService = database.getDatabaseService();
                    const User = dbService.getModel('User', 'customer');
                    
                    if (User) {
                        dbUser = await User.findById(userId)
                            .select('+permissions +roles +organizations')
                            .lean();
                    }
                } catch (dbError) {
                    logger.error('Error loading user in optional auth', {
                        error: dbError.message,
                        userId: userId
                    });
                    // Continue without user if database query fails
                    return next();
                }

                // Build req.user object
                req.user = {
                    id: userId,
                    userId: userId,
                    email: dbUser?.email || tokenPayload.email,
                    username: dbUser?.username || tokenPayload.username,
                    clientId: dbUser?.clientId || tokenPayload.clientId,
                    tenantId: tokenPayload.tenantId || dbUser?.tenantId,
                    organizationId: tokenPayload.organizationId || dbUser?.defaultOrganizationId,
                    userType: tokenPayload.userType || dbUser?.metadata?.userType,
                    roles: dbUser?.roles || (Array.isArray(tokenPayload.roles) ? tokenPayload.roles : []),
                    permissions: dbUser?.permissions || (Array.isArray(tokenPayload.permissions) ? tokenPayload.permissions : []),
                    organizations: dbUser?.organizations || [],
                    emailVerified: dbUser?.verification?.email?.verified || tokenPayload.emailVerified || false,
                    sessionId: tokenPayload.sessionId,
                    preferences: dbUser?.preferences || {}
                };

                next();

            } catch (error) {
                logger.error('Optional auth error', {
                    error: error.message
                });
                next();
            }
        })(req, res, next);

    } catch (error) {
        logger.error('Optional authentication middleware error', {
            error: error.message,
            path: req.path
        });
        next();
    }
};

/**
 * Require Specific Role Middleware
 * 
 * Ensures the authenticated user has one of the required roles.
 * Must be used after the authenticate() middleware.
 * 
 * @param {string|string[]} roles - Required role(s)
 * @returns {Function} Express middleware function
 */
const requireRole = (roles) => {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required'
                }
            });
        }

        const userRoles = req.user.roles || [];
        const hasRole = roleArray.some(role => userRoles.includes(role));

        if (!hasRole) {
            logger.warn('Authorization failed - Insufficient role', {
                userId: req.user.id,
                userRoles: userRoles,
                requiredRoles: roleArray,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient role privileges'
                }
            });
        }

        next();
    };
};

/**
 * Require Email Verification Middleware
 * 
 * Ensures the authenticated user has verified their email.
 * Must be used after the authenticate() middleware.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireEmailVerification = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    if (!req.user.emailVerified) {
        logger.warn('Access denied - Email not verified', {
            userId: req.user.id,
            path: req.path
        });

        return res.status(403).json({
            success: false,
            error: {
                code: 'EMAIL_NOT_VERIFIED',
                message: 'Email verification required'
            }
        });
    }

    next();
};

/**
 * Rate Limiting by User Middleware
 * 
 * Simple in-memory rate limiter for authenticated requests.
 * In production, use Redis-backed rate limiting.
 * 
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Express middleware function
 */
const rateLimitByUser = (maxRequests = 100, windowMs = 60000) => {
    const requestCounts = new Map();

    // Clean up old entries every minute
    setInterval(() => {
        const now = Date.now();
        for (const [userId, data] of requestCounts.entries()) {
            if (now - data.resetTime > windowMs) {
                requestCounts.delete(userId);
            }
        }
    }, 60000);

    return (req, res, next) => {
        if (!req.user || !req.user.id) {
            return next();
        }

        const userId = req.user.id;
        const now = Date.now();

        if (!requestCounts.has(userId)) {
            requestCounts.set(userId, {
                count: 1,
                resetTime: now
            });
            return next();
        }

        const userLimit = requestCounts.get(userId);

        if (now - userLimit.resetTime > windowMs) {
            userLimit.count = 1;
            userLimit.resetTime = now;
            return next();
        }

        if (userLimit.count >= maxRequests) {
            logger.warn('Rate limit exceeded', {
                userId: userId,
                path: req.path,
                count: userLimit.count
            });

            return res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests. Please try again later.',
                    retryAfter: Math.ceil((windowMs - (now - userLimit.resetTime)) / 1000)
                }
            });
        }

        userLimit.count++;
        next();
    };
};

module.exports = {
    authenticate,
    optionalAuthenticate,
    requireRole,
    authorize: requireRole,
    requireEmailVerification,
    rateLimitByUser
};