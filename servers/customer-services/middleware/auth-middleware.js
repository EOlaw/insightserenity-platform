/**
 * @fileoverview Authentication Middleware with Token Blacklist
 * @module servers/customer-services/middleware/auth-middleware
 * @description Production-ready authentication middleware with database-backed blacklist
 */

const passport = require('passport');
const { AppError } = require('../../../shared/lib/utils/app-error');
const directAuthService = require('../modules/core-business/authentication/services/direct-auth-service');
const logger = require('../../../shared/lib/utils/logger').createLogger({
    serviceName: 'auth-middleware'
});

/**
 * JWT Authentication Middleware with Token Blacklist Check
 * 
 * This middleware performs a two-step authentication process:
 * 1. Verifies JWT signature and expiration using Passport
 * 2. Checks if the token has been blacklisted (logged out) in the database
 * 
 * This ensures that even valid JWTs cannot be used after logout, providing
 * proper session management across multiple server instances.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
    try {
        // Step 1: Verify JWT with Passport
        passport.authenticate('jwt', { session: false }, async (err, user, info) => {
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
                if (!user) {
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
                            userId: user.id,
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

                // Authentication successful - attach user to request
                req.user = user;
                
                logger.debug('Authentication successful', {
                    userId: user.id,
                    path: req.path
                });
                
                next();

            } catch (blacklistError) {
                logger.error('Token blacklist check failed', {
                    error: blacklistError.message,
                    userId: user?.id
                });
                
                // Fail secure: deny access if blacklist check fails
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'AUTHENTICATION_ERROR',
                        message: 'Authentication service temporarily unavailable'
                    }
                });
            }
        })(req, res, next);

    } catch (error) {
        logger.error('Authentication middleware error', {
            error: error.message,
            path: req.path
        });
        next(error);
    }
};

/**
 * Optional Authentication Middleware
 * 
 * Similar to authenticate(), but does not require authentication.
 * If a valid token is provided, the user is attached to the request.
 * If no token or an invalid token is provided, the request continues without a user.
 * 
 * Useful for endpoints that have different behavior for authenticated vs unauthenticated users.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return next();
        }

        passport.authenticate('jwt', { session: false }, async (err, user, info) => {
            try {
                if (err || !user) {
                    return next();
                }

                const isBlacklisted = await directAuthService.isTokenBlacklisted(token);
                
                if (!isBlacklisted) {
                    req.user = user;
                }

                next();

            } catch (error) {
                logger.error('Optional auth blacklist check failed', {
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
 * @param {string[]} roles - Array of allowed roles
 * @returns {Function} Express middleware function
 */
const requireRole = (roles) => {
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
        const hasRole = roles.some(role => userRoles.includes(role));

        if (!hasRole) {
            logger.warn('Authorization failed - Insufficient permissions', {
                userId: req.user.id,
                userRoles: userRoles,
                requiredRoles: roles,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions'
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

    if (!req.user.verification?.email?.verified) {
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
    requireEmailVerification,
    rateLimitByUser
};