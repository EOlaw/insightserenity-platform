/**
 * @fileoverview Main Authentication Service
 */

const bcrypt = require('bcryptjs');
const TokenService = require('./token-service');
const SessionService = require('./session-service');
const TwoFactorService = require('./two-factor-service');

class AuthService {
    constructor() {
        this.tokenService = TokenService;
        this.sessionService = SessionService;
        this.twoFactorService = TwoFactorService;
    }
    
    async login(user, options = {}) {
        // Check if 2FA is enabled
        if (user.twoFactorEnabled && !options.twoFactorCode) {
            return {
                requiresTwoFactor: true,
                tempToken: this.tokenService.generateAccessToken({ ...user, temp: true })
            };
        }
        
        // Verify 2FA if provided
        if (user.twoFactorEnabled && options.twoFactorCode) {
            const isValid = await this.twoFactorService.verifyCode(
                user.twoFactorSecret,
                options.twoFactorCode
            );
            
            if (!isValid) {
                throw new Error('Invalid 2FA code');
            }
        }
        
        // Generate tokens
        const accessToken = this.tokenService.generateAccessToken(user);
        const refreshToken = this.tokenService.generateRefreshToken(user);
        
        // Create session
        const session = await this.sessionService.createSession({
            userId: user._id || user.id,
            tenantId: user.tenantId,
            ip: options.ip,
            userAgent: options.userAgent
        });
        
        return {
            user,
            accessToken,
            refreshToken,
            sessionId: session.id
        };
    }
    
    async logout(userId, sessionId) {
        await this.sessionService.terminateSession(sessionId);
        return { success: true };
    }
    
    async refreshToken(refreshToken) {
        const decoded = this.tokenService.verifyToken(refreshToken, 'refresh');
        
        // Get user (would be from database)
        const user = { id: decoded.id };
        
        const newAccessToken = this.tokenService.generateAccessToken(user);
        const newRefreshToken = this.tokenService.generateRefreshToken(user);
        
        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        };
    }
    
    async validatePassword(password, hashedPassword) {
        return bcrypt.compare(password, hashedPassword);
    }
    
    async hashPassword(password) {
        return bcrypt.hash(password, 12);
    }
}

module.exports = new AuthService();
