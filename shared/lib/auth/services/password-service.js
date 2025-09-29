/**
 * @fileoverview Password Management Service
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../../../config');

class PasswordService {
    constructor() {
        this.options = config.auth.password;
    }
    
    async hash(password) {
        return bcrypt.hash(password, this.options.saltRounds);
    }
    
    async compare(password, hash) {
        return bcrypt.compare(password, hash);
    }
    
    validate(password) {
        const errors = [];
        
        if (password.length < this.options.minLength) {
            errors.push(`Password must be at least ${this.options.minLength} characters`);
        }
        
        if (password.length > this.options.maxLength) {
            errors.push(`Password must be less than ${this.options.maxLength} characters`);
        }
        
        if (this.options.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain uppercase letter');
        }
        
        if (this.options.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain lowercase letter');
        }
        
        if (this.options.requireNumbers && !/\d/.test(password)) {
            errors.push('Password must contain number');
        }
        
        if (this.options.requireSpecialChars && !/[!@#$%^&*]/.test(password)) {
            errors.push('Password must contain special character');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    generateResetToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    hashResetToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    
    generateTemporaryPassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return password;
    }
    
    calculateStrength(password) {
        let strength = 0;
        
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[!@#$%^&*]/.test(password)) strength++;
        
        return {
            score: strength,
            level: strength <= 2 ? 'weak' : strength <= 4 ? 'medium' : 'strong'
        };
    }
}

module.exports = new PasswordService();
