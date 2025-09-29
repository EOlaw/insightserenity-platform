/**
 * @fileoverview Authentication Middleware
 */

const TokenService = require('../services/token-service');
const BlacklistService = require('../services/blacklist-service');

const authenticate = (options = {}) => {
    return async (req, res, next) => {
        try {
            // Extract token
            const token = extractToken(req);
            
            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'No authentication token provided'
                });
            }
            
            // Check blacklist
            const isBlacklisted = await BlacklistService.isTokenBlacklisted(token);
            if (isBlacklisted) {
                return res.status(401).json({
                    success: false,
                    error: 'Token has been revoked'
                });
            }
            
            // Verify token
            const decoded = TokenService.verifyToken(token);
            
            // Attach user to request
            req.user = decoded;
            req.auth = {
                type: 'jwt',
                token
            };
            
            next();
            
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: error.message
            });
        }
    };
};

function extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    // Check query parameter
    if (req.query && req.query.token) {
        return req.query.token;
    }
    
    // Check cookie
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }
    
    return null;
}

module.exports = authenticate;
