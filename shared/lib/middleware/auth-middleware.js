/**
 * @fileoverview Authentication Middleware
 * @module shared/lib/middleware/auth-middleware
 * @description JWT authentication middleware for protecting routes
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
    jwtAudience: process.env.JWT_AUDIENCE || 'insightserenity-api'
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
        const decoded = jwt.verify(token, config.jwtSecret, {
            issuer: config.jwtIssuer,
            audience: config.jwtAudience
        });
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
 * Main authentication middleware
 * Validates JWT token and attaches user to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
    try {
        // Extract token
        const token = extractToken(req);

        if (!token) {
            throw AppError.authentication('No authentication token provided');
        }

        // Verify token
        const decoded = verifyToken(token);

        // Attach user info to request
        req.user = {
            id: decoded.sub || decoded.userId || decoded.id,
            _id: decoded.sub || decoded.userId || decoded.id,
            email: decoded.email,
            tenantId: decoded.tenantId,
            organizationId: decoded.organizationId,
            roles: decoded.roles || [],
            permissions: decoded.permissions || [],
            type: decoded.type || 'user',
            sessionId: decoded.sessionId
        };

        // Also set for convenience
        req.userId = req.user.id;
        req.tenantId = decoded.tenantId;
        req.organizationId = decoded.organizationId;

        // Log successful authentication
        logger.debug('Authentication successful', {
            userId: req.user.id,
            tenantId: req.tenantId
        });

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
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = extractToken(req);

        if (token) {
            const decoded = verifyToken(token);
            req.user = {
                id: decoded.sub || decoded.userId || decoded.id,
                _id: decoded.sub || decoded.userId || decoded.id,
                email: decoded.email,
                tenantId: decoded.tenantId,
                organizationId: decoded.organizationId,
                roles: decoded.roles || [],
                permissions: decoded.permissions || [],
                type: decoded.type || 'user'
            };
            req.userId = req.user.id;
            req.tenantId = decoded.tenantId;
        }

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
                    code: 'AUTHENTICATION_ERROR'
                }
            });
        }

        if (!allowedTypes.includes(req.user.type)) {
            logger.warn('User type not allowed', {
                userId: req.user.id,
                userType: req.user.type,
                allowedTypes
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
 * Generate JWT access token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.email - User email
 * @param {string} payload.tenantId - Tenant ID
 * @param {Array} payload.roles - User roles
 * @param {Array} payload.permissions - User permissions
 * @param {Object} options - Token options
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload, options = {}) => {
    return jwt.sign(
        {
            sub: payload.userId,
            email: payload.email,
            tenantId: payload.tenantId,
            organizationId: payload.organizationId,
            roles: payload.roles || [],
            permissions: payload.permissions || [],
            type: payload.type || 'user',
            sessionId: payload.sessionId
        },
        config.jwtSecret,
        {
            expiresIn: options.expiresIn || config.jwtAccessExpiry,
            issuer: config.jwtIssuer,
            audience: config.jwtAudience
        }
    );
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.sessionId - Session ID
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
    return jwt.sign(
        {
            sub: payload.userId,
            sessionId: payload.sessionId,
            type: 'refresh'
        },
        config.jwtSecret,
        {
            expiresIn: config.jwtRefreshExpiry,
            issuer: config.jwtIssuer,
            audience: config.jwtAudience
        }
    );
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
    try {
        const decoded = jwt.verify(token, config.jwtSecret, {
            issuer: config.jwtIssuer,
            audience: config.jwtAudience
        });

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
    requireTenant,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    decodeToken,
    extractToken,
    verifyToken,
    config
};