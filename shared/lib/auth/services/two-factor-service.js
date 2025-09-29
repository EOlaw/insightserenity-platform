/**
 * @fileoverview Two-Factor Authentication Service
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const config = require('../../../config');

class TwoFactorService {
    constructor() {
        this.options = config.auth.twoFactor;
    }
    
    generateSecret(user) {
        const secret = speakeasy.generateSecret({
            name: `${this.options.appName} (${user.email})`,
            issuer: this.options.appName,
            length: 32
        });
        
        return {
            secret: secret.base32,
            url: secret.otpauth_url
        };
    }
    
    async generateQRCode(url) {
        try {
            const qrCode = await QRCode.toDataURL(url, {
                width: this.options.qrCodeSize
            });
            return qrCode;
        } catch (error) {
            throw new Error(`QR code generation failed: ${error.message}`);
        }
    }
    
    verifyCode(secret, code) {
        return speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token: code,
            window: this.options.window
        });
    }
    
    generateBackupCodes(count = this.options.backupCodes) {
        const codes = [];
        
        for (let i = 0; i < count; i++) {
            const code = Math.random().toString(36).substr(2, 8).toUpperCase();
            codes.push(code);
        }
        
        return codes;
    }
    
    async enable2FA(user) {
        const { secret, url } = this.generateSecret(user);
        const qrCode = await this.generateQRCode(url);
        const backupCodes = this.generateBackupCodes();
        
        return {
            secret,
            qrCode,
            backupCodes
        };
    }
    
    disable2FA(user) {
        // Would update user in database
        return { success: true };
    }
}

module.exports = new TwoFactorService();
