/**
 * @fileoverview Authentication Middleware
 * @module servers/gateway/middleware/authentication
 */

const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 */
module.exports = (config = {}) => {
    return async (req, res, next) => {
        try {
            // Check API Key authentication
            if (config.apiKey?.enabled) {
                const apiKey = req.headers[config.apiKey.header || 'x-api-key'];

                if (apiKey) {
                    const keyConfig = Array.from(config.apiKey.keys?.values() || [])
                        .find(k => k.key === apiKey);

                    if (keyConfig) {
                        req.auth = {
                            type: 'apiKey',
                            roles: keyConfig.roles,
                            rateLimit: keyConfig.rateLimit
                        };
                        return next();
                    }
                }
            }

            // Check JWT authentication
            const token = extractToken(req);

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'NO_TOKEN',
                        message: 'Authentication token required'
                    }
                });
            }

            // Verify JWT token
            const decoded = jwt.verify(token, config.jwt?.secret || process.env.JWT_SECRET, {
                algorithms: [config.jwt?.algorithm || 'HS256'],
                issuer: config.jwt?.issuer,
                audience: config.jwt?.audience
            });

            // Attach user info to request
            req.user = decoded;
            req.auth = {
                type: 'jwt',
                userId: decoded.id || decoded.sub,
                roles: decoded.roles || [],
                permissions: decoded.permissions || []
            };

            // Add user info to headers for downstream services
            req.headers['x-user-id'] = req.auth.userId;
            req.headers['x-user-roles'] = JSON.stringify(req.auth.roles);

            next();

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'TOKEN_EXPIRED',
                        message: 'Authentication token has expired'
                    }
                });
            }

            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'Invalid authentication token'
                    }
                });
            }

            return res.status(500).json({
                success: false,
                error: {
                    code: 'AUTH_ERROR',
                    message: 'Authentication error occurred'
                }
            });
        }
    };
};

/**
 * Extract token from request
 */
function extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check query parameter
    if (req.query.token) {
        return req.query.token;
    }

    // Check cookie
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }

    return null;
}
