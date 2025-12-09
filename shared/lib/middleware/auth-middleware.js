/**
 * @fileoverview Universal Authentication Middleware
 * @module shared/lib/middleware/auth-middleware
 * @description Production-ready JWT authentication middleware with token blacklist and database user loading
 * @version 2.0.0
 * 
 * Features:
 * - JWT token verification with flexible validation
 * - Token blacklist checking (prevents use of logged out tokens)
 * - Database user loading (ensures current permissions)
 * - Account status verification
 * - Support for all user types (client, consultant, candidate, partner)
 * - Organization-scoped permissions support
 */

const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/app-error');
const { createLogger } = require('../utils/logger');

const logger = createLogger({ serviceName: 'auth-middleware' });

// Configuration
const config = {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
    jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    jwtIssuer: process.env.JWT_ISSUER || 'insightserenity',
    jwtAudience: process.env.JWT_AUDIENCE || 'insightserenity-api',
    // Flexible verification - set to false for backward compatibility
    requireIssuer: process.env.JWT_REQUIRE_ISSUER === 'true',
    requireAudience: process.env.JWT_REQUIRE_AUDIENCE === 'true'
};

/**
 * Extract JWT token from request
 * @private
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null
 */
const extractToken = (req) => {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check x-access-token header
    if (req.headers['x-access-token']) {
        return req.headers['x-access-token'];
    }

    // Check cookies
    if (req.cookies && req.cookies.accessToken) {
        return req.cookies.accessToken;
    }

    // Check query parameter (not recommended for production)
    if (req.query && req.query.token) {
        return req.query.token;
    }

    return null;
};

/**
 * Verify JWT token and decode payload
 * @private
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 * @throws {AppError} If token is invalid or expired
 */
const verifyToken = (token) => {
    try {
        // Build verification options
        const verifyOptions = {};
        
        // Only add issuer/audience if required or if environment variables are set
        if (config.requireIssuer || process.env.JWT_ISSUER) {
            verifyOptions.issuer = config.jwtIssuer;
        }
        if (config.requireAudience || process.env.JWT_AUDIENCE) {
            verifyOptions.audience = config.jwtAudience;
        }

        const decoded = jwt.verify(token, config.jwtSecret, verifyOptions);
        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw AppError.expiredToken('Access token has expired');
        }
        if (error.name === 'JsonWebTokenError') {
            throw AppError.invalidToken('Invalid access token');
        }
        throw AppError.authentication('Token verification failed');
    }
};

/**
 * Check if token is blacklisted
 * @private
 * @param {string} token - JWT token
 * @param {Object} database - Database service
 * @returns {Promise<boolean>} True if blacklisted
 */
const isTokenBlacklisted = async (token, database) => {
    try {
        if (!database) {
            logger.warn('Database not available - skipping blacklist check');
            return false;
        }

        const dbService = database.getDatabaseService();
        const TokenBlacklist = dbService.getModel('TokenBlacklist', 'shared');
        
        if (!TokenBlacklist) {
            logger.warn('TokenBlacklist model not available - skipping blacklist check');
            return false;
        }

        const blacklistedToken = await TokenBlacklist.findOne({ token }).lean();
        return !!blacklistedToken;
    } catch (error) {
        logger.error('Error checking token blacklist', {
            error: error.message
        });
        // Fail secure: if we can't check blacklist, assume not blacklisted but log the error
        return false;
    }
};

/**
 * Load user from database
 * @private
 * @param {string} userId - User ID
 * @param {Object} database - Database service
 * @returns {Promise<Object|null>} User object or null
 */
const loadUserFromDatabase = async (userId, database) => {
    try {
        if (!database) {
            logger.warn('Database not available - using token data only', { userId });
            return null;
        }

        const dbService = database.getDatabaseService();
        const User = dbService.getModel('User', 'customer');
        
        if (!User) {
            logger.warn('User model not available - using token data only', { userId });
            return null;
        }

        const user = await User.findById(userId)
            .select('+permissions +roles +organizations')
            .lean();
        
        return user;
    } catch (error) {
        logger.error('Error loading user from database', {
            error: error.message,
            userId
        });
        return null;
    }
};

/**
 * Main authentication middleware
 * Validates JWT token, checks blacklist, loads current user data, and attaches to request
 * 
 * USAGE:
 * - Old pattern (backward compatible): router.get('/path', authenticate, handler)
 * - New pattern with options: router.get('/path', authenticate({ database }), handler)
 * 
 * @param {Object} optionsOrReq - Middleware options OR Express request (for backward compatibility)
 * @param {Object} optionsOrReq.database - Database service (optional, for blacklist and user loading)
 * @param {boolean} optionsOrReq.checkBlacklist - Whether to check token blacklist (default: true if database available)
 * @param {boolean} optionsOrReq.loadUser - Whether to load user from database (default: true if database available)
 * @param {Object} resOrUndefined - Express response (only present in old pattern)
 * @param {Function} nextOrUndefined - Express next function (only present in old pattern)
 * @returns {Function|Promise<void>} Express middleware function or executes directly
 */
const authenticate = (optionsOrReq = {}, resOrUndefined, nextOrUndefined) => {
    // Detect if being called as middleware directly (old pattern) or as factory (new pattern)
    const isDirectMiddlewareCall = optionsOrReq && 
        (optionsOrReq.method || optionsOrReq.url || optionsOrReq.headers);
    
    if (isDirectMiddlewareCall) {
        // OLD PATTERN: Called directly as middleware - authenticate(req, res, next)
        const req = optionsOrReq;
        const res = resOrUndefined;
        const next = nextOrUndefined;
        return executeAuthentication(req, res, next, {});
    }
    
    // NEW PATTERN: Called as factory - authenticate(options)(req, res, next)
    const options = optionsOrReq;
    return async (req, res, next) => {
        return executeAuthentication(req, res, next, options);
    };
};

/**
 * Execute authentication logic
 * @private
 */
const executeAuthentication = async (req, res, next, options = {}) => {
    try {
        // Extract token
        const token = extractToken(req);

        if (!token) {
            throw AppError.authentication('No authentication token provided');
        }

        // Verify token
        const decoded = verifyToken(token);
        const userId = decoded.sub || decoded.userId || decoded.id;

        if (!userId) {
            throw AppError.invalidToken('Token missing user identifier');
        }

        // Step 2: Check if token is blacklisted (if database available)
        if (options.database && options.checkBlacklist !== false) {
            const isBlacklisted = await isTokenBlacklisted(token, options.database);
            
            if (isBlacklisted) {
                logger.warn('Authentication failed - Token blacklisted', {
                    userId,
                    path: req.path,
                    ip: req.ip
                });
                throw AppError.authentication('Token has been revoked. Please login again.');
            }
        }

        // Step 3: Load current user data from database (if database available)
        let dbUser = null;
        if (options.database && options.loadUser !== false) {
            dbUser = await loadUserFromDatabase(userId, options.database);
            
            // Check if user exists in database
            if (dbUser === null && options.requireDatabaseUser === true) {
                logger.warn('Authentication failed - User not found in database', {
                    userId,
                    path: req.path
                });
                throw AppError.authentication('User account not found. Please login again.');
            }

            // Check if user account is active
            if (dbUser && dbUser.accountStatus?.status !== 'active') {
                logger.warn('Authentication failed - User account not active', {
                    userId,
                    accountStatus: dbUser.accountStatus?.status,
                    path: req.path
                });
                throw AppError.authentication(`Account is ${dbUser.accountStatus?.status}. Please contact support.`);
            }
        }

        // Step 4: Build comprehensive req.user object
        // Prioritize database data over token data for permissions and roles
        req.user = {
            // Identity fields
            id: userId,
            _id: userId,
            userId: userId,
            email: dbUser?.email || decoded.email,
            username: dbUser?.username || decoded.username,
            
            // Multi-tenant fields
            tenantId: decoded.tenantId || dbUser?.tenantId,
            organizationId: decoded.organizationId || dbUser?.defaultOrganizationId,
            userType: decoded.userType || decoded.type || dbUser?.metadata?.userType,
            
            // Entity-specific IDs
            clientId: dbUser?.clientId || decoded.clientId,
            consultantId: dbUser?.consultantId || decoded.consultantId,
            candidateId: dbUser?.candidateId || decoded.candidateId,
            partnerId: dbUser?.partnerId || decoded.partnerId,
            
            // Permission fields (PRIORITIZE DATABASE OVER TOKEN)
            roles: dbUser?.roles || (Array.isArray(decoded.roles) ? decoded.roles : []),
            permissions: dbUser?.permissions || (Array.isArray(decoded.permissions) ? decoded.permissions : []),
            organizations: dbUser?.organizations || [], // Critical for organization-scoped permissions
            
            // Profile fields
            firstName: dbUser?.profile?.firstName,
            lastName: dbUser?.profile?.lastName,
            fullName: dbUser?.fullName || (dbUser?.profile ? 
                `${dbUser.profile.firstName || ''} ${dbUser.profile.lastName || ''}`.trim() : 
                undefined),
            
            // Status fields
            emailVerified: dbUser?.verification?.email?.verified || decoded.emailVerified || false,
            phoneVerified: dbUser?.verification?.phone?.verified || false,
            accountStatus: dbUser?.accountStatus?.status || 'active',
            mfaEnabled: dbUser?.mfa?.enabled || false,
            
            // Session fields
            sessionId: decoded.sessionId,
            
            // Preferences
            preferences: dbUser?.preferences || {},
            
            // Metadata
            type: decoded.type || 'user'
        };

        // Also set for convenience and backward compatibility
        req.userId = req.user.id;
        req.tenantId = req.user.tenantId;
        req.organizationId = req.user.organizationId;

        // Log successful authentication with permission statistics
        const permissionStats = {
            userId: req.user.id,
            email: req.user.email,
            userType: req.user.userType,
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
        logger.warn('Authentication failed', {
            error: error.message,
            ip: req.ip,
            path: req.path
        });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({
                success: false,
                error: {
                    message: error.message,
                    code: error.code
                }
            });
        }

        return res.status(401).json({
            success: false,
            error: {
                message: 'Authentication failed',
                code: 'AUTHENTICATION_ERROR'
            }
        });
    }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require authentication
 * 
 * USAGE:
 * - Old pattern (backward compatible): router.get('/path', optionalAuth, handler)
 * - New pattern with options: router.get('/path', optionalAuth({ database }), handler)
 * 
 * @param {Object} optionsOrReq - Middleware options OR Express request (for backward compatibility)
 * @param {Object} optionsOrReq.database - Database service (optional)
 * @param {Object} resOrUndefined - Express response (only present in old pattern)
 * @param {Function} nextOrUndefined - Express next function (only present in old pattern)
 * @returns {Function|Promise<void>} Express middleware function or executes directly
 */
const optionalAuth = (optionsOrReq = {}, resOrUndefined, nextOrUndefined) => {
    // Detect if being called as middleware directly (old pattern) or as factory (new pattern)
    const isDirectMiddlewareCall = optionsOrReq && 
        (optionsOrReq.method || optionsOrReq.url || optionsOrReq.headers);
    
    if (isDirectMiddlewareCall) {
        // OLD PATTERN: Called directly as middleware - optionalAuth(req, res, next)
        const req = optionsOrReq;
        const res = resOrUndefined;
        const next = nextOrUndefined;
        return executeOptionalAuth(req, res, next, {});
    }
    
    // NEW PATTERN: Called as factory - optionalAuth(options)(req, res, next)
    const options = optionsOrReq;
    return async (req, res, next) => {
        return executeOptionalAuth(req, res, next, options);
    };
};

/**
 * Execute optional authentication logic
 * @private
 */
const executeOptionalAuth = async (req, res, next, options = {}) => {
    try {
        const token = extractToken(req);

        if (!token) {
            return next();
        }

        const decoded = verifyToken(token);
        const userId = decoded.sub || decoded.userId || decoded.id;

        if (!userId) {
            return next();
        }

        // Check blacklist if database available
        if (options.database) {
            const isBlacklisted = await isTokenBlacklisted(token, options.database);
            if (isBlacklisted) {
                return next();
            }

            // Load user from database
            const dbUser = await loadUserFromDatabase(userId, options.database);

            // Build req.user object with database data if available
            req.user = {
                id: userId,
                _id: userId,
                userId: userId,
                email: dbUser?.email || decoded.email,
                username: dbUser?.username || decoded.username,
                clientId: dbUser?.clientId || decoded.clientId,
                consultantId: dbUser?.consultantId || decoded.consultantId,
                tenantId: decoded.tenantId || dbUser?.tenantId,
                organizationId: decoded.organizationId || dbUser?.defaultOrganizationId,
                userType: decoded.userType || decoded.type || dbUser?.metadata?.userType,
                roles: dbUser?.roles || (Array.isArray(decoded.roles) ? decoded.roles : []),
                permissions: dbUser?.permissions || (Array.isArray(decoded.permissions) ? decoded.permissions : []),
                organizations: dbUser?.organizations || [],
                emailVerified: dbUser?.verification?.email?.verified || decoded.emailVerified || false,
                sessionId: decoded.sessionId,
                preferences: dbUser?.preferences || {},
                type: decoded.type || 'user'
            };
        } else {
            // Build req.user object from token only
            req.user = {
                id: userId,
                _id: userId,
                userId: userId,
                email: decoded.email,
                username: decoded.username,
                clientId: decoded.clientId,
                consultantId: decoded.consultantId,
                tenantId: decoded.tenantId,
                organizationId: decoded.organizationId,
                userType: decoded.userType || decoded.type,
                roles: Array.isArray(decoded.roles) ? decoded.roles : [],
                permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
                organizations: [],
                emailVerified: decoded.emailVerified || false,
                sessionId: decoded.sessionId,
                type: decoded.type || 'user'
            };
        }

        req.userId = req.user.id;
        req.tenantId = req.user.tenantId;
        req.organizationId = req.user.organizationId;

        next();

    } catch (error) {
        // Token invalid but that's okay for optional auth
        logger.debug('Optional auth - invalid token', { error: error.message });
        next();
    }
};

/**
 * Require specific user type middleware
 * @param {...string} allowedTypes - Allowed user types
 * @returns {Function} Express middleware function
 */
const requireUserType = (...allowedTypes) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Authentication required',
                    code: 'AUTHENTICATION_REQUIRED'
                }
            });
        }

        const userType = req.user.userType || req.user.type;
        if (!allowedTypes.includes(userType)) {
            logger.warn('User type not allowed', {
                userId: req.user.id,
                userType,
                allowedTypes,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Access denied for user type',
                    code: 'USER_TYPE_NOT_ALLOWED'
                }
            });
        }

        next();
    };
};

/**
 * Require specific role middleware
 * @param {...string} allowedRoles - Allowed roles
 * @returns {Function} Express middleware function
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Authentication required',
                    code: 'AUTHENTICATION_REQUIRED'
                }
            });
        }

        const userRoles = req.user.roles || [];
        const hasRole = allowedRoles.some(role => userRoles.includes(role));

        if (!hasRole) {
            logger.warn('Authorization failed - Insufficient role', {
                userId: req.user.id,
                userRoles,
                requiredRoles: allowedRoles,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                error: {
                    message: 'Insufficient role privileges',
                    code: 'INSUFFICIENT_ROLE'
                }
            });
        }

        next();
    };
};

/**
 * Require tenant middleware
 * Ensures request has a valid tenant context
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireTenant = (req, res, next) => {
    const tenantId = req.tenantId || req.headers['x-tenant-id'] || req.user?.tenantId;

    if (!tenantId) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Tenant context required',
                code: 'TENANT_REQUIRED'
            }
        });
    }

    req.tenantId = tenantId;
    next();
};

/**
 * Require email verification middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireEmailVerification = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: {
                message: 'Authentication required',
                code: 'AUTHENTICATION_REQUIRED'
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
                message: 'Email verification required',
                code: 'EMAIL_NOT_VERIFIED'
            }
        });
    }

    next();
};

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.email - User email
 * @param {string} payload.tenantId - Tenant ID
 * @param {string} payload.userType - User type (client, consultant, etc.)
 * @param {Array} payload.roles - User roles
 * @param {Array} payload.permissions - User permissions
 * @param {Object} options - Token options
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload, options = {}) => {
    const tokenPayload = {
        sub: payload.userId,
        email: payload.email,
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        userType: payload.userType || payload.type,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        type: payload.type || 'user',
        sessionId: payload.sessionId
    };

    const signOptions = {
        expiresIn: options.expiresIn || config.jwtAccessExpiry
    };

    // Only add issuer/audience if configured
    if (config.jwtIssuer) {
        signOptions.issuer = config.jwtIssuer;
    }
    if (config.jwtAudience) {
        signOptions.audience = config.jwtAudience;
    }

    return jwt.sign(tokenPayload, config.jwtSecret, signOptions);
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.sessionId - Session ID
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
    const tokenPayload = {
        sub: payload.userId,
        sessionId: payload.sessionId,
        type: 'refresh'
    };

    const signOptions = {
        expiresIn: config.jwtRefreshExpiry
    };

    // Only add issuer/audience if configured
    if (config.jwtIssuer) {
        signOptions.issuer = config.jwtIssuer;
    }
    if (config.jwtAudience) {
        signOptions.audience = config.jwtAudience;
    }

    return jwt.sign(tokenPayload, config.jwtSecret, signOptions);
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
    try {
        const verifyOptions = {};
        
        // Only add issuer/audience if required
        if (config.requireIssuer || process.env.JWT_ISSUER) {
            verifyOptions.issuer = config.jwtIssuer;
        }
        if (config.requireAudience || process.env.JWT_AUDIENCE) {
            verifyOptions.audience = config.jwtAudience;
        }

        const decoded = jwt.verify(token, config.jwtSecret, verifyOptions);

        if (decoded.type !== 'refresh') {
            throw AppError.invalidToken('Invalid refresh token');
        }

        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw AppError.expiredToken('Refresh token has expired');
        }
        throw AppError.invalidToken('Invalid refresh token');
    }
};

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const decodeToken = (token) => {
    return jwt.decode(token);
};

module.exports = {
    authenticate,
    optionalAuth,
    requireUserType,
    requireRole,
    requireTenant,
    requireEmailVerification,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    decodeToken,
    extractToken,
    verifyToken,
    config
};