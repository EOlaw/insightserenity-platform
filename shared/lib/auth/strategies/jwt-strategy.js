/**
 * @fileoverview JWT Authentication Strategy
 * @module shared/lib/auth/strategies/jwt
 */

const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const config = require('../../../config');

class JWTAuthStrategy {
    constructor(options = {}) {
        this.options = {
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: options.secret || config.auth.jwt.secret,
            issuer: options.issuer || config.auth.jwt.issuer,
            audience: options.audience || config.auth.jwt.audience,
            algorithms: [config.auth.jwt.algorithm],
            passReqToCallback: true
        };

        this.strategy = new JwtStrategy(this.options, this.verify.bind(this));
    }

    /**
     * Verify JWT token
     */
    async verify(req, payload, done) {
        try {
            // Check if token is expired
            if (payload.exp && Date.now() >= payload.exp * 1000) {
                return done(null, false, { message: 'Token expired' });
            }

            // Check if token is blacklisted
            const BlacklistService = require('../services/blacklist-service');
            const isBlacklisted = await BlacklistService.isTokenBlacklisted(req.headers.authorization);

            if (isBlacklisted) {
                return done(null, false, { message: 'Token revoked' });
            }

            // Extract user data from payload
            const user = {
                id: payload.id || payload.sub,
                email: payload.email,
                tenantId: payload.tenantId,
                organizationId: payload.organizationId,
                role: payload.role,
                permissions: payload.permissions || []
            };

            // Validate tenant context
            if (req.headers['x-tenant-id'] && req.headers['x-tenant-id'] !== user.tenantId) {
                return done(null, false, { message: 'Tenant mismatch' });
            }

            // Attach user to request
            req.user = user;
            req.auth = {
                type: 'jwt',
                token: req.headers.authorization
            };

            return done(null, user);

        } catch (error) {
            return done(error, false);
        }
    }

    /**
     * Get Passport strategy
     */
    getStrategy() {
        return this.strategy;
    }

    /**
     * Generate JWT token
     */
    static generateToken(user, options = {}) {
        const jwt = require('jsonwebtoken');

        const payload = {
            id: user._id || user.id,
            email: user.email,
            tenantId: user.tenantId,
            organizationId: user.organizationId,
            role: user.role,
            permissions: user.permissions || []
        };

        const tokenOptions = {
            expiresIn: options.expiresIn || config.auth.jwt.expiresIn,
            issuer: options.issuer || config.auth.jwt.issuer,
            audience: options.audience || config.auth.jwt.audience,
            algorithm: config.auth.jwt.algorithm
        };

        return jwt.sign(payload, config.auth.jwt.secret, tokenOptions);
    }

    /**
     * Verify token without Passport
     */
    static verifyToken(token) {
        const jwt = require('jsonwebtoken');

        try {
            return jwt.verify(token, config.auth.jwt.secret, {
                issuer: config.auth.jwt.issuer,
                audience: config.auth.jwt.audience,
                algorithms: [config.auth.jwt.algorithm]
            });
        } catch (error) {
            throw new Error(`Invalid token: ${error.message}`);
        }
    }

    /**
     * Decode token without verification
     */
    static decodeToken(token) {
        const jwt = require('jsonwebtoken');
        return jwt.decode(token);
    }
}

module.exports = JWTAuthStrategy;
