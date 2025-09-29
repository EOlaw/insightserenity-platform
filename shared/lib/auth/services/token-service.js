/**
 * @fileoverview Token Management Service
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../../config');

class TokenService {
    constructor() {
        this.secret = config.auth.jwt.secret;
        this.options = config.auth.jwt;
    }
    
    generateAccessToken(user) {
        const payload = {
            id: user._id || user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            organizationId: user.organizationId,
            type: 'access'
        };
        
        return jwt.sign(payload, this.secret, {
            expiresIn: this.options.expiresIn,
            issuer: this.options.issuer,
            audience: this.options.audience
        });
    }
    
    generateRefreshToken(user) {
        const payload = {
            id: user._id || user.id,
            type: 'refresh',
            tokenId: crypto.randomBytes(16).toString('hex')
        };
        
        return jwt.sign(payload, this.secret, {
            expiresIn: this.options.refreshExpiresIn,
            issuer: this.options.issuer
        });
    }
    
    verifyToken(token, type = 'access') {
        try {
            const decoded = jwt.verify(token, this.secret, {
                issuer: this.options.issuer,
                audience: type === 'access' ? this.options.audience : undefined
            });
            
            if (decoded.type !== type) {
                throw new Error('Invalid token type');
            }
            
            return decoded;
        } catch (error) {
            throw new Error(`Token verification failed: ${error.message}`);
        }
    }
    
    decodeToken(token) {
        return jwt.decode(token);
    }
    
    generateResetToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    generateVerificationToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}

module.exports = new TokenService();
