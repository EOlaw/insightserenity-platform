/**
 * @fileoverview Enterprise Password Management Service
 * @module shared/lib/auth/services/password-service
 * @description Comprehensive password hashing, validation, strength analysis, and policy enforcement
 * @version 2.0.0
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const zxcvbn = require('zxcvbn');
const logger = require('../../utils/logger').getLogger();
const { AppError } = require('../../utils/app-error');
const config = require('../../../config');
const database = require('../../database');

/**
 * Password Strength Levels
 * @enum {string}
 */
const STRENGTH_LEVELS = {
    VERY_WEAK: 'very_weak',
    WEAK: 'weak',
    FAIR: 'fair',
    GOOD: 'good',
    STRONG: 'strong',
    VERY_STRONG: 'very_strong'
};

/**
 * Password Policy Types
 * @enum {string}
 */
const POLICY_TYPES = {
    BASIC: 'basic',
    STANDARD: 'standard',
    STRICT: 'strict',
    ENTERPRISE: 'enterprise',
    CUSTOM: 'custom'
};

/**
 * Password Validation Error Codes
 * @enum {string}
 */
const VALIDATION_ERRORS = {
    TOO_SHORT: 'too_short',
    TOO_LONG: 'too_long',
    NO_UPPERCASE: 'no_uppercase',
    NO_LOWERCASE: 'no_lowercase',
    NO_DIGITS: 'no_digits',
    NO_SPECIAL: 'no_special',
    TOO_COMMON: 'too_common',
    REUSED: 'reused',
    CONTAINS_USERNAME: 'contains_username',
    CONTAINS_EMAIL: 'contains_email',
    SEQUENTIAL: 'sequential',
    REPEATED_CHARS: 'repeated_chars',
    DICTIONARY_WORD: 'dictionary_word'
};

/**
 * Enterprise Password Management Service
 * Handles password operations with advanced security features
 * @class PasswordService
 */
class PasswordService {
    constructor() {
        // Load configuration
        this.config = {
            // Basic requirements
            minLength: config.auth?.password?.minLength || 8,
            maxLength: config.auth?.password?.maxLength || 128,
            requireUppercase: config.auth?.password?.requireUppercase !== false,
            requireLowercase: config.auth?.password?.requireLowercase !== false,
            requireNumbers: config.auth?.password?.requireNumbers !== false,
            requireSpecialChars: config.auth?.password?.requireSpecialChars !== false,
            
            // Advanced requirements
            minUniqueChars: config.auth?.password?.minUniqueChars || 5,
            maxRepeatedChars: config.auth?.password?.maxRepeatedChars || 3,
            preventSequential: config.auth?.password?.preventSequential !== false,
            preventDictionaryWords: config.auth?.password?.preventDictionaryWords !== false,
            preventUserInfo: config.auth?.password?.preventUserInfo !== false,
            
            // History and reuse
            preventReuse: config.auth?.password?.preventReuse || 5,
            historyLimit: config.auth?.password?.historyLimit || 12,
            
            // Expiry and rotation
            expiryDays: config.auth?.password?.expiryDays || 90,
            warningDays: config.auth?.password?.warningDays || 14,
            enforceExpiry: config.auth?.password?.enforceExpiry || false,
            
            // Hashing
            saltRounds: config.auth?.password?.saltRounds || 12,
            
            // Strength requirements
            minimumStrength: config.auth?.password?.minimumStrength || STRENGTH_LEVELS.FAIR,
            
            // Reset tokens
            resetTokenLength: config.auth?.password?.resetTokenLength || 32,
            resetTokenExpiry: config.auth?.password?.resetTokenExpiry || 3600000, // 1 hour
            
            // Policy type
            policyType: config.auth?.password?.policyType || POLICY_TYPES.STANDARD
        };

        // Common passwords list (top 10000 most common)
        this.commonPasswords = new Set([
            'password', '123456', '123456789', 'qwerty', 'abc123', 'monkey',
            'letmein', 'password1', 'admin', 'welcome', 'login', 'Password1',
            'Password123', 'Admin123', '12345678', '1234567890', 'p@ssw0rd',
            // Add more from https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt
        ]);

        // Dictionary words (simplified - in production, use full dictionary)
        this.dictionaryWords = new Set([
            'apple', 'orange', 'banana', 'computer', 'keyboard', 'mouse',
            'monitor', 'laptop', 'desktop', 'internet', 'network', 'server'
            // Add more dictionary words
        ]);

        // Sequential patterns
        this.sequentialPatterns = [
            '012', '123', '234', '345', '456', '567', '678', '789',
            'abc', 'bcd', 'cde', 'def', 'efg', 'fgh', 'ghi', 'hij'
        ];

        // Statistics
        this.stats = {
            passwordsHashed: 0,
            passwordsValidated: 0,
            passwordsCompared: 0,
            validationFailures: 0,
            strengthChecks: 0,
            tokensGenerated: 0
        };

        // Initialize database
        this._initializeDatabase();
    }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase() {
        try {
            this.db = database;
            if (!this.db.isInitialized) {
                await this.db.initialize();
            }
            logger.info('PasswordService: Database initialized successfully');
        } catch (error) {
            logger.error('PasswordService: Database initialization failed', { error: error.message });
        }
    }

    // ============= PASSWORD HASHING AND COMPARISON =============

    /**
     * Hash password using bcrypt
     * @param {string} password - Plain text password
     * @param {number} [saltRounds] - Number of salt rounds (higher = more secure but slower)
     * @returns {Promise<string>} Hashed password
     */
    async hash(password, saltRounds = null) {
        try {
            if (!password) {
                throw new AppError('Password is required', 400, 'MISSING_PASSWORD');
            }

            const rounds = saltRounds || this.config.saltRounds;
            const hashedPassword = await bcrypt.hash(password, rounds);

            this.stats.passwordsHashed++;
            logger.debug('Password hashed successfully', {
                saltRounds: rounds
            });

            return hashedPassword;

        } catch (error) {
            logger.error('Password hashing failed', { error: error.message });
            throw new AppError('Password hashing failed', 500, 'HASH_FAILED');
        }
    }

    /**
     * Compare plain text password with hashed password
     * @param {string} password - Plain text password
     * @param {string} hashedPassword - Hashed password
     * @returns {Promise<boolean>} True if passwords match
     */
    async compare(password, hashedPassword) {
        try {
            if (!password || !hashedPassword) {
                return false;
            }

            const isMatch = await bcrypt.compare(password, hashedPassword);

            this.stats.passwordsCompared++;
            logger.debug('Password comparison completed', { match: isMatch });

            return isMatch;

        } catch (error) {
            logger.error('Password comparison failed', { error: error.message });
            return false;
        }
    }

    /**
     * Verify password strength meets minimum requirements
     * @param {string} password - Password to verify
     * @param {string} hashedPassword - Hashed password to compare against
     * @returns {Promise<boolean>} True if password matches
     */
    async verify(password, hashedPassword) {
        return await this.compare(password, hashedPassword);
    }

    // ============= PASSWORD VALIDATION =============

    /**
     * Validate password against policy rules
     * @param {string} password - Password to validate
     * @param {Object} [options] - Validation options
     * @param {string} [options.username] - Username to check against
     * @param {string} [options.email] - Email to check against
     * @param {Array<string>} [options.passwordHistory] - Previous password hashes
     * @param {Object} [options.customRules] - Custom validation rules
     * @returns {Object} Validation result with errors array
     */
    validate(password, options = {}) {
        try {
            this.stats.passwordsValidated++;
            const errors = [];
            const warnings = [];

            if (!password) {
                errors.push({
                    code: 'MISSING_PASSWORD',
                    message: 'Password is required'
                });
                return { valid: false, errors, warnings };
            }

            // Length validation
            if (password.length < this.config.minLength) {
                errors.push({
                    code: VALIDATION_ERRORS.TOO_SHORT,
                    message: `Password must be at least ${this.config.minLength} characters long`
                });
            }

            if (password.length > this.config.maxLength) {
                errors.push({
                    code: VALIDATION_ERRORS.TOO_LONG,
                    message: `Password must be less than ${this.config.maxLength} characters long`
                });
            }

            // Character type requirements
            if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.NO_UPPERCASE,
                    message: 'Password must contain at least one uppercase letter'
                });
            }

            if (this.config.requireLowercase && !/[a-z]/.test(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.NO_LOWERCASE,
                    message: 'Password must contain at least one lowercase letter'
                });
            }

            if (this.config.requireNumbers && !/\d/.test(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.NO_DIGITS,
                    message: 'Password must contain at least one number'
                });
            }

            if (this.config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.NO_SPECIAL,
                    message: 'Password must contain at least one special character'
                });
            }

            // Unique characters check
            const uniqueChars = new Set(password).size;
            if (uniqueChars < this.config.minUniqueChars) {
                warnings.push({
                    code: 'LOW_UNIQUE_CHARS',
                    message: `Password should contain at least ${this.config.minUniqueChars} unique characters`
                });
            }

            // Repeated characters check
            if (this._hasExcessiveRepeats(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.REPEATED_CHARS,
                    message: `Password contains too many repeated characters (max ${this.config.maxRepeatedChars} consecutive)`
                });
            }

            // Sequential characters check
            if (this.config.preventSequential && this._hasSequentialChars(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.SEQUENTIAL,
                    message: 'Password contains sequential characters (e.g., "123", "abc")'
                });
            }

            // Common password check
            if (this._isCommonPassword(password)) {
                errors.push({
                    code: VALIDATION_ERRORS.TOO_COMMON,
                    message: 'Password is too common. Please choose a more unique password'
                });
            }

            // Dictionary word check
            if (this.config.preventDictionaryWords && this._containsDictionaryWord(password)) {
                warnings.push({
                    code: VALIDATION_ERRORS.DICTIONARY_WORD,
                    message: 'Password contains dictionary words. Consider using more unique combinations'
                });
            }

            // User info check
            if (this.config.preventUserInfo) {
                if (options.username && this._containsSubstring(password, options.username)) {
                    errors.push({
                        code: VALIDATION_ERRORS.CONTAINS_USERNAME,
                        message: 'Password should not contain your username'
                    });
                }

                if (options.email) {
                    const emailParts = options.email.split('@');
                    if (this._containsSubstring(password, emailParts[0])) {
                        errors.push({
                            code: VALIDATION_ERRORS.CONTAINS_EMAIL,
                            message: 'Password should not contain parts of your email'
                        });
                    }
                }
            }

            // Password history check (if provided)
            if (options.passwordHistory && options.passwordHistory.length > 0) {
                // Note: This is a simplified check. In production, you'd hash and compare
                warnings.push({
                    code: 'HISTORY_CHECK_NEEDED',
                    message: 'Password will be checked against history after hashing'
                });
            }

            // Custom rules validation
            if (options.customRules) {
                const customErrors = this._validateCustomRules(password, options.customRules);
                errors.push(...customErrors);
            }

            const valid = errors.length === 0;
            
            if (!valid) {
                this.stats.validationFailures++;
            }

            return {
                valid,
                errors,
                warnings,
                checks: {
                    length: password.length >= this.config.minLength && password.length <= this.config.maxLength,
                    uppercase: /[A-Z]/.test(password),
                    lowercase: /[a-z]/.test(password),
                    numbers: /\d/.test(password),
                    specialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
                    uniqueChars: uniqueChars >= this.config.minUniqueChars,
                    notCommon: !this._isCommonPassword(password),
                    noSequential: !this._hasSequentialChars(password)
                }
            };

        } catch (error) {
            logger.error('Password validation failed', { error: error.message });
            throw new AppError('Password validation failed', 500, 'VALIDATION_FAILED');
        }
    }

    /**
     * Validate password against history
     * @param {string} newPassword - New plain text password
     * @param {Array<string>} passwordHistory - Array of hashed previous passwords
     * @returns {Promise<Object>} Validation result
     */
    async validateAgainstHistory(newPassword, passwordHistory) {
        try {
            if (!passwordHistory || passwordHistory.length === 0) {
                return { valid: true, reused: false };
            }

            const historyToCheck = passwordHistory.slice(0, this.config.preventReuse);
            
            for (const hashedPassword of historyToCheck) {
                const isMatch = await this.compare(newPassword, hashedPassword);
                if (isMatch) {
                    return {
                        valid: false,
                        reused: true,
                        error: {
                            code: VALIDATION_ERRORS.REUSED,
                            message: `Password cannot be one of your last ${this.config.preventReuse} passwords`
                        }
                    };
                }
            }

            return { valid: true, reused: false };

        } catch (error) {
            logger.error('Password history validation failed', { error: error.message });
            throw new AppError('Password history validation failed', 500, 'HISTORY_VALIDATION_FAILED');
        }
    }

    // ============= PASSWORD STRENGTH ANALYSIS =============

    /**
     * Calculate password strength using multiple algorithms
     * @param {string} password - Password to analyze
     * @param {Object} [userInputs] - User-specific data to check against
     * @returns {Object} Strength analysis result
     */
    calculateStrength(password, userInputs = []) {
        try {
            this.stats.strengthChecks++;

            if (!password) {
                return {
                    score: 0,
                    level: STRENGTH_LEVELS.VERY_WEAK,
                    feedback: ['Password is required'],
                    crackTime: '0 seconds'
                };
            }

            // Use zxcvbn for advanced strength estimation
            const zxcvbnResult = zxcvbn(password, userInputs);

            // Our own scoring algorithm
            let score = 0;

            // Length scoring (0-25 points)
            if (password.length >= 8) score += 5;
            if (password.length >= 12) score += 10;
            if (password.length >= 16) score += 10;

            // Character variety (0-25 points)
            if (/[a-z]/.test(password)) score += 5;
            if (/[A-Z]/.test(password)) score += 5;
            if (/\d/.test(password)) score += 5;
            if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 10;

            // Unique characters (0-15 points)
            const uniqueChars = new Set(password).size;
            score += Math.min(uniqueChars, 15);

            // Pattern penalties (0-30 points deduction)
            if (this._hasSequentialChars(password)) score -= 10;
            if (this._hasExcessiveRepeats(password)) score -= 10;
            if (this._isCommonPassword(password)) score -= 30;

            // Entropy calculation
            const entropy = this._calculateEntropy(password);

            // Normalize score (0-100)
            score = Math.max(0, Math.min(100, score));

            // Determine strength level
            let level;
            switch (true) {
                case score >= 90:
                    level = STRENGTH_LEVELS.VERY_STRONG;
                    break;
                case score >= 75:
                    level = STRENGTH_LEVELS.STRONG;
                    break;
                case score >= 60:
                    level = STRENGTH_LEVELS.GOOD;
                    break;
                case score >= 40:
                    level = STRENGTH_LEVELS.FAIR;
                    break;
                case score >= 20:
                    level = STRENGTH_LEVELS.WEAK;
                    break;
                default:
                    level = STRENGTH_LEVELS.VERY_WEAK;
            }

            // Generate feedback
            const feedback = [];
            
            if (password.length < 12) {
                feedback.push('Use at least 12 characters for better security');
            }
            
            if (!/[A-Z]/.test(password)) {
                feedback.push('Add uppercase letters');
            }
            
            if (!/\d/.test(password)) {
                feedback.push('Add numbers');
            }
            
            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
                feedback.push('Add special characters');
            }
            
            if (this._hasSequentialChars(password)) {
                feedback.push('Avoid sequential characters');
            }
            
            if (this._isCommonPassword(password)) {
                feedback.push('Avoid common passwords');
            }

            if (uniqueChars < 8) {
                feedback.push('Use more unique characters');
            }

            return {
                score: score,
                level: level,
                entropy: entropy,
                zxcvbnScore: zxcvbnResult.score,
                crackTime: zxcvbnResult.crack_times_display.offline_slow_hashing_1e4_per_second,
                feedback: feedback.length > 0 ? feedback : ['Password strength is good'],
                suggestions: zxcvbnResult.feedback.suggestions,
                warning: zxcvbnResult.feedback.warning,
                meetsMinimum: this._meetsMinimumStrength(level),
                details: {
                    length: password.length,
                    uniqueChars: uniqueChars,
                    hasUppercase: /[A-Z]/.test(password),
                    hasLowercase: /[a-z]/.test(password),
                    hasNumbers: /\d/.test(password),
                    hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
                    hasSequential: this._hasSequentialChars(password),
                    hasRepeats: this._hasExcessiveRepeats(password),
                    isCommon: this._isCommonPassword(password)
                }
            };

        } catch (error) {
            logger.error('Password strength calculation failed', { error: error.message });
            return {
                score: 0,
                level: STRENGTH_LEVELS.VERY_WEAK,
                feedback: ['Unable to calculate password strength'],
                error: error.message
            };
        }
    }

    /**
     * Check if password meets minimum strength requirement
     * @param {string} level - Strength level to check
     * @returns {boolean} True if meets minimum
     * @private
     */
    _meetsMinimumStrength(level) {
        const levels = [
            STRENGTH_LEVELS.VERY_WEAK,
            STRENGTH_LEVELS.WEAK,
            STRENGTH_LEVELS.FAIR,
            STRENGTH_LEVELS.GOOD,
            STRENGTH_LEVELS.STRONG,
            STRENGTH_LEVELS.VERY_STRONG
        ];

        const currentIndex = levels.indexOf(level);
        const minimumIndex = levels.indexOf(this.config.minimumStrength);

        return currentIndex >= minimumIndex;
    }

    /**
     * Calculate password entropy
     * @param {string} password - Password to analyze
     * @returns {number} Entropy in bits
     * @private
     */
    _calculateEntropy(password) {
        let poolSize = 0;

        if (/[a-z]/.test(password)) poolSize += 26;
        if (/[A-Z]/.test(password)) poolSize += 26;
        if (/\d/.test(password)) poolSize += 10;
        if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) poolSize += 32;

        const entropy = Math.log2(Math.pow(poolSize, password.length));
        return Math.round(entropy);
    }

    // ============= TOKEN GENERATION =============

    /**
     * Generate password reset token
     * @param {Object} [options] - Token generation options
     * @returns {Object} Token and expiry
     */
    generateResetToken(options = {}) {
        try {
            const length = options.length || this.config.resetTokenLength;
            const token = crypto.randomBytes(length).toString('hex');
            const expiresAt = new Date(Date.now() + (options.expiresIn || this.config.resetTokenExpiry));

            this.stats.tokensGenerated++;
            logger.debug('Password reset token generated', {
                length: token.length,
                expiresAt
            });

            return {
                token,
                expiresAt,
                hashedToken: this._hashResetToken(token)
            };

        } catch (error) {
            logger.error('Reset token generation failed', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Hash reset token for storage
     * @param {string} token - Reset token
     * @returns {string} Hashed token
     */
    hashResetToken(token) {
        return this._hashResetToken(token);
    }

    /**
     * Verify reset token
     * @param {string} token - Reset token to verify
     * @param {string} hashedToken - Hashed token from storage
     * @param {Date} expiresAt - Token expiry date
     * @returns {Object} Verification result
     */
    verifyResetToken(token, hashedToken, expiresAt) {
        try {
            // Check expiry
            if (new Date() > expiresAt) {
                return {
                    valid: false,
                    expired: true,
                    error: 'Reset token has expired'
                };
            }

            // Verify token
            const computedHash = this._hashResetToken(token);
            const isValid = computedHash === hashedToken;

            return {
                valid: isValid,
                expired: false,
                error: isValid ? null : 'Invalid reset token'
            };

        } catch (error) {
            logger.error('Reset token verification failed', { error: error.message });
            return {
                valid: false,
                expired: false,
                error: 'Token verification failed'
            };
        }
    }

    // ============= TEMPORARY PASSWORD GENERATION =============

    /**
     * Generate temporary password
     * @param {Object} [options] - Generation options
     * @returns {string} Temporary password
     */
    generateTemporaryPassword(options = {}) {
        try {
            const length = options.length || 16;
            const includeSymbols = options.includeSymbols !== false;
            
            const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const lowercase = 'abcdefghijklmnopqrstuvwxyz';
            const numbers = '0123456789';
            const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            
            let charset = uppercase + lowercase + numbers;
            if (includeSymbols) {
                charset += symbols;
            }
            
            let password = '';
            
            // Ensure at least one of each required type
            password += uppercase[Math.floor(Math.random() * uppercase.length)];
            password += lowercase[Math.floor(Math.random() * lowercase.length)];
            password += numbers[Math.floor(Math.random() * numbers.length)];
            if (includeSymbols) {
                password += symbols[Math.floor(Math.random() * symbols.length)];
            }
            
            // Fill remaining length
            for (let i = password.length; i < length; i++) {
                password += charset[Math.floor(Math.random() * charset.length)];
            }
            
            // Shuffle password
            password = password.split('').sort(() => Math.random() - 0.5).join('');
            
            logger.debug('Temporary password generated', { length });
            
            return password;

        } catch (error) {
            logger.error('Temporary password generation failed', { error: error.message });
            throw new AppError('Temporary password generation failed', 500, 'GENERATION_FAILED');
        }
    }

    /**
     * Generate passphrase (multiple words)
     * @param {number} [wordCount=4] - Number of words
     * @param {Object} [options] - Generation options
     * @returns {string} Generated passphrase
     */
    generatePassphrase(wordCount = 4, options = {}) {
        try {
            const words = [
                'correct', 'horse', 'battery', 'staple', 'mountain', 'river', 'ocean', 'forest',
                'tiger', 'eagle', 'thunder', 'rainbow', 'crystal', 'diamond', 'phoenix', 'dragon',
                'wizard', 'castle', 'knight', 'sword', 'shield', 'crown', 'galaxy', 'planet'
                // Add more words from a word list
            ];

            const separator = options.separator || '-';
            const capitalize = options.capitalize !== false;
            const includeNumbers = options.includeNumbers !== false;

            const selectedWords = [];
            for (let i = 0; i < wordCount; i++) {
                let word = words[Math.floor(Math.random() * words.length)];
                if (capitalize) {
                    word = word.charAt(0).toUpperCase() + word.slice(1);
                }
                selectedWords.push(word);
            }

            let passphrase = selectedWords.join(separator);

            if (includeNumbers) {
                passphrase += separator + Math.floor(Math.random() * 10000);
            }

            logger.debug('Passphrase generated', { wordCount });

            return passphrase;

        } catch (error) {
            logger.error('Passphrase generation failed', { error: error.message });
            throw new AppError('Passphrase generation failed', 500, 'GENERATION_FAILED');
        }
    }

    // ============= PASSWORD POLICY MANAGEMENT =============

    /**
     * Get current password policy
     * @returns {Object} Password policy
     */
    getPolicy() {
        return {
            type: this.config.policyType,
            requirements: {
                minLength: this.config.minLength,
                maxLength: this.config.maxLength,
                requireUppercase: this.config.requireUppercase,
                requireLowercase: this.config.requireLowercase,
                requireNumbers: this.config.requireNumbers,
                requireSpecialChars: this.config.requireSpecialChars,
                minUniqueChars: this.config.minUniqueChars,
                maxRepeatedChars: this.config.maxRepeatedChars
            },
            restrictions: {
                preventSequential: this.config.preventSequential,
                preventDictionaryWords: this.config.preventDictionaryWords,
                preventUserInfo: this.config.preventUserInfo,
                preventReuse: this.config.preventReuse
            },
            expiry: {
                expiryDays: this.config.expiryDays,
                warningDays: this.config.warningDays,
                enforceExpiry: this.config.enforceExpiry
            },
            strength: {
                minimumStrength: this.config.minimumStrength
            }
        };
    }

    /**
     * Update password policy
     * @param {Object} newPolicy - New policy settings
     * @returns {Object} Updated policy
     */
    updatePolicy(newPolicy) {
        try {
            // Merge new policy with existing
            Object.assign(this.config, newPolicy);

            logger.info('Password policy updated', { policyType: this.config.policyType });

            return this.getPolicy();

        } catch (error) {
            logger.error('Password policy update failed', { error: error.message });
            throw new AppError('Policy update failed', 500, 'POLICY_UPDATE_FAILED');
        }
    }

    /**
     * Apply predefined policy template
     * @param {string} policyType - Policy type (basic, standard, strict, enterprise)
     * @returns {Object} Applied policy
     */
    applyPolicyTemplate(policyType) {
        try {
            let template = {};

            switch (policyType.toLowerCase()) {
                case POLICY_TYPES.BASIC:
                    template = {
                        minLength: 6,
                        requireUppercase: false,
                        requireLowercase: true,
                        requireNumbers: false,
                        requireSpecialChars: false,
                        preventReuse: 0,
                        minimumStrength: STRENGTH_LEVELS.WEAK
                    };
                    break;

                case POLICY_TYPES.STANDARD:
                    template = {
                        minLength: 8,
                        requireUppercase: true,
                        requireLowercase: true,
                        requireNumbers: true,
                        requireSpecialChars: false,
                        preventReuse: 3,
                        minimumStrength: STRENGTH_LEVELS.FAIR
                    };
                    break;

                case POLICY_TYPES.STRICT:
                    template = {
                        minLength: 12,
                        requireUppercase: true,
                        requireLowercase: true,
                        requireNumbers: true,
                        requireSpecialChars: true,
                        preventReuse: 5,
                        preventSequential: true,
                        minimumStrength: STRENGTH_LEVELS.GOOD
                    };
                    break;

                case POLICY_TYPES.ENTERPRISE:
                    template = {
                        minLength: 14,
                        requireUppercase: true,
                        requireLowercase: true,
                        requireNumbers: true,
                        requireSpecialChars: true,
                        minUniqueChars: 8,
                        maxRepeatedChars: 2,
                        preventReuse: 12,
                        preventSequential: true,
                        preventDictionaryWords: true,
                        preventUserInfo: true,
                        expiryDays: 60,
                        enforceExpiry: true,
                        minimumStrength: STRENGTH_LEVELS.STRONG
                    };
                    break;

                default:
                    throw new AppError('Invalid policy type', 400, 'INVALID_POLICY_TYPE');
            }

            template.policyType = policyType;
            return this.updatePolicy(template);

        } catch (error) {
            logger.error('Policy template application failed', { error: error.message });
            throw error;
        }
    }

    // ============= STATISTICS AND MONITORING =============

    /**
     * Get service statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            policyType: this.config.policyType,
            validationSuccessRate: this.stats.passwordsValidated > 0
                ? (((this.stats.passwordsValidated - this.stats.validationFailures) / this.stats.passwordsValidated) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Check if password has excessive repeated characters
     * @private
     */
    _hasExcessiveRepeats(password) {
        const maxRepeats = this.config.maxRepeatedChars;
        for (let i = 0; i <= password.length - maxRepeats; i++) {
            const char = password[i];
            let count = 1;
            for (let j = i + 1; j < password.length && password[j] === char; j++) {
                count++;
            }
            if (count > maxRepeats) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if password contains sequential characters
     * @private
     */
    _hasSequentialChars(password) {
        const lowerPassword = password.toLowerCase();
        for (const pattern of this.sequentialPatterns) {
            if (lowerPassword.includes(pattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if password is in common passwords list
     * @private
     */
    _isCommonPassword(password) {
        return this.commonPasswords.has(password.toLowerCase());
    }

    /**
     * Check if password contains dictionary word
     * @private
     */
    _containsDictionaryWord(password) {
        const lowerPassword = password.toLowerCase();
        for (const word of this.dictionaryWords) {
            if (lowerPassword.includes(word)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if password contains substring (case insensitive)
     * @private
     */
    _containsSubstring(password, substring) {
        if (!substring || substring.length < 3) {
            return false;
        }
        return password.toLowerCase().includes(substring.toLowerCase());
    }

    /**
     * Validate custom rules
     * @private
     */
    _validateCustomRules(password, customRules) {
        const errors = [];
        
        for (const rule of customRules) {
            if (rule.regex) {
                const regex = new RegExp(rule.regex);
                if (!regex.test(password)) {
                    errors.push({
                        code: rule.code || 'CUSTOM_RULE_FAILED',
                        message: rule.message || 'Password does not meet custom requirements'
                    });
                }
            }
            
            if (rule.validator && typeof rule.validator === 'function') {
                const result = rule.validator(password);
                if (!result.valid) {
                    errors.push({
                        code: result.code || 'CUSTOM_VALIDATION_FAILED',
                        message: result.message || 'Custom validation failed'
                    });
                }
            }
        }
        
        return errors;
    }

    /**
     * Hash reset token
     * @private
     */
    _hashResetToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}

// Export singleton instance
module.exports = new PasswordService();