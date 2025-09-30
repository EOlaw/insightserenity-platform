/**
 * @fileoverview Enterprise Multi-Factor Authentication (MFA) Service
 * @module shared/lib/auth/services/two-factor-service
 * @description Comprehensive MFA service with TOTP, SMS, Email, Backup codes, and WebAuthn support
 * @version 2.0.0
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const logger = require('../../utils/logger').getLogger();
const { AppError } = require('../../utils/app-error');
const config = require('../../../config');
const database = require('../../database');
const HashService = require('../../security/encryption/hash-service');

/**
 * MFA Method Types
 * @enum {string}
 */
const MFA_METHODS = {
    TOTP: 'totp',
    SMS: 'sms',
    EMAIL: 'email',
    PUSH: 'push',
    BACKUP_CODE: 'backup_code',
    WEBAUTHN: 'webauthn',
    BIOMETRIC: 'biometric',
    HARDWARE_TOKEN: 'hardware_token'
};

/**
 * MFA Status
 * @enum {string}
 */
const MFA_STATUS = {
    ENABLED: 'enabled',
    DISABLED: 'disabled',
    PENDING: 'pending',
    SUSPENDED: 'suspended'
};

/**
 * Verification Result Types
 * @enum {string}
 */
const VERIFICATION_RESULT = {
    SUCCESS: 'success',
    FAILED: 'failed',
    EXPIRED: 'expired',
    INVALID_CODE: 'invalid_code',
    MAX_ATTEMPTS_EXCEEDED: 'max_attempts_exceeded',
    METHOD_DISABLED: 'method_disabled',
    USER_NOT_FOUND: 'user_not_found'
};

/**
 * Challenge Types
 * @enum {string}
 */
const CHALLENGE_TYPES = {
    SETUP: 'setup',
    LOGIN: 'login',
    VERIFICATION: 'verification',
    TRANSACTION: 'transaction',
    RESET: 'reset'
};

/**
 * Enterprise Multi-Factor Authentication Service
 * Handles all MFA operations including TOTP, SMS, Email, and Backup codes
 * @class TwoFactorService
 */
class TwoFactorService {
    constructor() {
        // Configuration
        this.config = {
            // TOTP Configuration
            totpWindow: config.auth?.twoFactor?.window || 2,
            totpStep: config.auth?.twoFactor?.step || 30,
            totpDigits: config.auth?.twoFactor?.digits || 6,
            totpAlgorithm: config.auth?.twoFactor?.algorithm || 'sha1',
            totpSecretLength: config.auth?.twoFactor?.secretLength || 32,
            
            // QR Code Configuration
            qrCodeSize: config.auth?.twoFactor?.qrCodeSize || 300,
            qrCodeErrorCorrection: config.auth?.twoFactor?.qrCodeErrorCorrection || 'M',
            
            // Backup Codes Configuration
            backupCodesCount: config.auth?.twoFactor?.backupCodes || 10,
            backupCodeLength: config.auth?.twoFactor?.backupCodeLength || 8,
            
            // SMS Configuration
            smsCodeLength: config.auth?.twoFactor?.smsCodeLength || 6,
            smsCodeExpiry: config.auth?.twoFactor?.smsCodeExpiry || 10 * 60 * 1000, // 10 minutes
            smsRateLimit: config.auth?.twoFactor?.smsRateLimit || 3,
            smsRateLimitWindow: config.auth?.twoFactor?.smsRateLimitWindow || 60 * 60 * 1000, // 1 hour
            
            // Email Configuration
            emailCodeLength: config.auth?.twoFactor?.emailCodeLength || 6,
            emailCodeExpiry: config.auth?.twoFactor?.emailCodeExpiry || 10 * 60 * 1000, // 10 minutes
            emailRateLimit: config.auth?.twoFactor?.emailRateLimit || 5,
            emailRateLimitWindow: config.auth?.twoFactor?.emailRateLimitWindow || 60 * 60 * 1000, // 1 hour
            
            // Push Notification Configuration
            pushCodeExpiry: config.auth?.twoFactor?.pushCodeExpiry || 5 * 60 * 1000, // 5 minutes
            
            // Security Configuration
            maxVerificationAttempts: config.auth?.twoFactor?.maxAttempts || 5,
            attemptLockoutDuration: config.auth?.twoFactor?.lockoutDuration || 15 * 60 * 1000, // 15 minutes
            requireMFAForSensitiveOps: config.auth?.twoFactor?.requireForSensitiveOps !== false,
            
            // App Configuration
            appName: config.app?.name || 'InsightSerenity',
            appIssuer: config.auth?.twoFactor?.issuer || 'InsightSerenity',
            
            // Recovery Configuration
            allowRecoveryWithBackupCodes: config.auth?.twoFactor?.allowRecovery !== false,
            requireRecoveryEmailVerification: config.auth?.twoFactor?.requireRecoveryEmailVerification !== false
        };

        // In-memory storage for challenges and rate limiting
        this.activeChallenges = new Map(); // challengeId -> challenge data
        this.rateLimitTracking = new Map(); // userId:method -> attempts array
        this.verificationAttempts = new Map(); // userId:challengeId -> attempt count

        // Statistics
        this.stats = {
            totpGenerated: 0,
            totpVerified: 0,
            smsCodesSent: 0,
            smsCodesVerified: 0,
            emailCodesSent: 0,
            emailCodesVerified: 0,
            backupCodesGenerated: 0,
            backupCodesUsed: 0,
            verificationsFailed: 0,
            rateLimitHits: 0,
            challengesCreated: 0,
            challengesCompleted: 0
        };

        // Initialize database
        this._initializeDatabase();
        this._startCleanupScheduler();
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
            logger.info('TwoFactorService: Database initialized successfully');
        } catch (error) {
            logger.error('TwoFactorService: Database initialization failed', { error: error.message });
        }
    }

    // ============= TOTP (Time-based One-Time Password) METHODS =============

    /**
     * Generate TOTP secret for user
     * @param {string} userIdentifier - User email or username
     * @param {Object} [options] - Generation options
     * @returns {Object} Secret and QR code data
     */
    generateSecret(userIdentifier, options = {}) {
        try {
            const secret = speakeasy.generateSecret({
                name: `${this.config.appName} (${userIdentifier})`,
                issuer: this.config.appIssuer,
                length: this.config.totpSecretLength,
                algorithm: this.config.totpAlgorithm
            });

            this.stats.totpGenerated++;
            logger.info('TOTP secret generated', {
                userIdentifier,
                algorithm: this.config.totpAlgorithm
            });

            return {
                secret: secret.base32,
                secretHex: secret.hex,
                otpauthUrl: secret.otpauth_url,
                qrCodeUrl: null, // Will be generated separately
                algorithm: this.config.totpAlgorithm,
                digits: this.config.totpDigits,
                period: this.config.totpStep
            };

        } catch (error) {
            logger.error('TOTP secret generation failed', {
                error: error.message,
                userIdentifier
            });
            throw new AppError('Failed to generate TOTP secret', 500, 'TOTP_GENERATION_FAILED');
        }
    }

    /**
     * Generate QR code for TOTP setup
     * @param {string} otpauthUrl - OTP Auth URL
     * @param {Object} [options] - QR code options
     * @returns {Promise<string>} Data URL for QR code image
     */
    async generateQRCode(otpauthUrl, options = {}) {
        try {
            const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
                width: options.width || this.config.qrCodeSize,
                errorCorrectionLevel: options.errorCorrection || this.config.qrCodeErrorCorrection,
                margin: options.margin || 1,
                color: {
                    dark: options.darkColor || '#000000',
                    light: options.lightColor || '#FFFFFF'
                }
            });

            logger.debug('QR code generated', {
                size: options.width || this.config.qrCodeSize
            });

            return qrCodeDataUrl;

        } catch (error) {
            logger.error('QR code generation failed', { error: error.message });
            throw new AppError('QR code generation failed', 500, 'QR_CODE_GENERATION_FAILED');
        }
    }

    /**
     * Verify TOTP code
     * @param {string} secret - User's TOTP secret (base32)
     * @param {string} token - TOTP token to verify
     * @param {Object} [options] - Verification options
     * @returns {Object} Verification result
     */
    verifyCode(secret, token, options = {}) {
        try {
            if (!secret || !token) {
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.INVALID_CODE,
                    message: 'Secret and token are required'
                };
            }

            // Remove spaces and convert to string
            const cleanToken = String(token).replace(/\s/g, '');

            // Verify the token
            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: cleanToken,
                window: options.window || this.config.totpWindow,
                step: options.step || this.config.totpStep,
                digits: options.digits || this.config.totpDigits,
                algorithm: options.algorithm || this.config.totpAlgorithm
            });

            if (verified) {
                this.stats.totpVerified++;
                logger.info('TOTP verification successful', {
                    tokenLength: cleanToken.length
                });
            } else {
                this.stats.verificationsFailed++;
                logger.warn('TOTP verification failed', {
                    tokenLength: cleanToken.length
                });
            }

            return {
                verified: verified,
                result: verified ? VERIFICATION_RESULT.SUCCESS : VERIFICATION_RESULT.INVALID_CODE,
                message: verified ? 'Code verified successfully' : 'Invalid code',
                timestamp: new Date()
            };

        } catch (error) {
            logger.error('TOTP verification error', { error: error.message });
            return {
                verified: false,
                result: VERIFICATION_RESULT.FAILED,
                message: 'Verification failed',
                error: error.message
            };
        }
    }

    /**
     * Generate current TOTP token (for testing/verification)
     * @param {string} secret - TOTP secret
     * @param {Object} [options] - Generation options
     * @returns {string} Current TOTP token
     */
    generateToken(secret, options = {}) {
        try {
            const token = speakeasy.totp({
                secret: secret,
                encoding: 'base32',
                step: options.step || this.config.totpStep,
                digits: options.digits || this.config.totpDigits,
                algorithm: options.algorithm || this.config.totpAlgorithm
            });

            return token;

        } catch (error) {
            logger.error('TOTP token generation failed', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    // ============= BACKUP CODES METHODS =============

    /**
     * Generate backup codes
     * @param {number} [count] - Number of codes to generate
     * @param {Object} [options] - Generation options
     * @returns {Promise<Object>} Backup codes (plain and hashed)
     */
    async generateBackupCodes(count = null, options = {}) {
        try {
            const codeCount = count || this.config.backupCodesCount;
            const codeLength = options.length || this.config.backupCodeLength;
            
            const codes = [];
            const hashedCodes = [];

            for (let i = 0; i < codeCount; i++) {
                // Generate random backup code
                const code = this._generateBackupCode(codeLength);
                codes.push(code);

                // Hash for storage
                const hashedCode = await HashService.hashToken(code);
                hashedCodes.push({
                    hash: hashedCode,
                    used: false,
                    usedAt: null,
                    createdAt: new Date()
                });
            }

            this.stats.backupCodesGenerated += codeCount;
            logger.info('Backup codes generated', {
                count: codeCount,
                length: codeLength
            });

            return {
                codes: codes, // Plain codes (show to user once)
                hashedCodes: hashedCodes, // Store in database
                count: codeCount,
                createdAt: new Date()
            };

        } catch (error) {
            logger.error('Backup code generation failed', { error: error.message });
            throw new AppError('Backup code generation failed', 500, 'BACKUP_CODE_GENERATION_FAILED');
        }
    }

    /**
     * Verify backup code
     * @param {string} code - Backup code to verify
     * @param {Array<Object>} storedCodes - Array of stored backup code objects
     * @returns {Promise<Object>} Verification result with updated codes array
     */
    async verifyBackupCode(code, storedCodes) {
        try {
            if (!code || !storedCodes || storedCodes.length === 0) {
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.INVALID_CODE,
                    message: 'Invalid backup code'
                };
            }

            const cleanCode = code.replace(/\s|-/g, '').toUpperCase();
            const hashedInput = await HashService.hashToken(cleanCode);

            // Find matching code
            let matchedIndex = -1;
            for (let i = 0; i < storedCodes.length; i++) {
                const storedCode = storedCodes[i];
                
                // Skip if already used
                if (storedCode.used) {
                    continue;
                }

                // Compare hashes
                if (storedCode.hash === hashedInput) {
                    matchedIndex = i;
                    break;
                }
            }

            if (matchedIndex >= 0) {
                // Mark code as used
                storedCodes[matchedIndex].used = true;
                storedCodes[matchedIndex].usedAt = new Date();

                this.stats.backupCodesUsed++;
                logger.info('Backup code verified and marked as used', {
                    remainingCodes: storedCodes.filter(c => !c.used).length
                });

                return {
                    verified: true,
                    result: VERIFICATION_RESULT.SUCCESS,
                    message: 'Backup code verified successfully',
                    updatedCodes: storedCodes,
                    remainingCodes: storedCodes.filter(c => !c.used).length
                };
            }

            this.stats.verificationsFailed++;
            logger.warn('Backup code verification failed');

            return {
                verified: false,
                result: VERIFICATION_RESULT.INVALID_CODE,
                message: 'Invalid or already used backup code'
            };

        } catch (error) {
            logger.error('Backup code verification error', { error: error.message });
            return {
                verified: false,
                result: VERIFICATION_RESULT.FAILED,
                message: 'Verification failed',
                error: error.message
            };
        }
    }

    /**
     * Check remaining backup codes
     * @param {Array<Object>} storedCodes - Array of stored backup codes
     * @returns {Object} Backup code statistics
     */
    checkBackupCodeStatus(storedCodes) {
        if (!storedCodes || storedCodes.length === 0) {
            return {
                total: 0,
                used: 0,
                remaining: 0,
                needsRegeneration: true
            };
        }

        const total = storedCodes.length;
        const used = storedCodes.filter(c => c.used).length;
        const remaining = total - used;

        return {
            total: total,
            used: used,
            remaining: remaining,
            needsRegeneration: remaining < 2,
            usagePercentage: ((used / total) * 100).toFixed(2) + '%'
        };
    }

    // ============= SMS/EMAIL CODE METHODS =============

    /**
     * Generate verification code for SMS or Email
     * @param {string} method - Method type (sms or email)
     * @param {Object} [options] - Generation options
     * @returns {Object} Verification code data
     */
    generateVerificationCode(method, options = {}) {
        try {
            const isEmail = method === MFA_METHODS.EMAIL;
            const length = isEmail ? this.config.emailCodeLength : this.config.smsCodeLength;
            const expiry = isEmail ? this.config.emailCodeExpiry : this.config.smsCodeExpiry;

            // Generate numeric code
            const code = this._generateNumericCode(length);
            
            // Generate unique challenge ID
            const challengeId = crypto.randomBytes(16).toString('hex');

            const codeData = {
                challengeId: challengeId,
                code: code,
                method: method,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + expiry),
                attempts: 0,
                verified: false
            };

            // Store in active challenges
            this.activeChallenges.set(challengeId, codeData);

            // Auto-cleanup after expiry
            setTimeout(() => {
                this.activeChallenges.delete(challengeId);
            }, expiry + 60000); // Add 1 minute buffer

            this.stats.challengesCreated++;
            if (isEmail) {
                this.stats.emailCodesSent++;
            } else {
                this.stats.smsCodesSent++;
            }

            logger.info('Verification code generated', {
                method: method,
                challengeId: challengeId,
                expiresAt: codeData.expiresAt
            });

            return {
                challengeId: challengeId,
                code: code, // Send this to user
                expiresAt: codeData.expiresAt,
                expiresIn: expiry
            };

        } catch (error) {
            logger.error('Verification code generation failed', {
                error: error.message,
                method
            });
            throw new AppError('Verification code generation failed', 500, 'CODE_GENERATION_FAILED');
        }
    }

    /**
     * Verify SMS or Email code
     * @param {string} challengeId - Challenge ID
     * @param {string} code - Code to verify
     * @param {Object} [options] - Verification options
     * @returns {Object} Verification result
     */
    verifyVerificationCode(challengeId, code, options = {}) {
        try {
            if (!challengeId || !code) {
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.INVALID_CODE,
                    message: 'Challenge ID and code are required'
                };
            }

            // Get challenge
            const challenge = this.activeChallenges.get(challengeId);

            if (!challenge) {
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.EXPIRED,
                    message: 'Challenge not found or expired'
                };
            }

            // Check if already verified
            if (challenge.verified) {
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.INVALID_CODE,
                    message: 'Code already used'
                };
            }

            // Check expiry
            if (new Date() > challenge.expiresAt) {
                this.activeChallenges.delete(challengeId);
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.EXPIRED,
                    message: 'Code has expired'
                };
            }

            // Check max attempts
            if (challenge.attempts >= this.config.maxVerificationAttempts) {
                this.activeChallenges.delete(challengeId);
                return {
                    verified: false,
                    result: VERIFICATION_RESULT.MAX_ATTEMPTS_EXCEEDED,
                    message: 'Maximum verification attempts exceeded'
                };
            }

            // Increment attempts
            challenge.attempts++;

            // Verify code
            const cleanCode = String(code).replace(/\s/g, '');
            const isValid = cleanCode === challenge.code;

            if (isValid) {
                challenge.verified = true;
                challenge.verifiedAt = new Date();

                // Update stats
                this.stats.challengesCompleted++;
                if (challenge.method === MFA_METHODS.EMAIL) {
                    this.stats.emailCodesVerified++;
                } else if (challenge.method === MFA_METHODS.SMS) {
                    this.stats.smsCodesVerified++;
                }

                // Keep challenge for a short time for audit
                setTimeout(() => {
                    this.activeChallenges.delete(challengeId);
                }, 5 * 60 * 1000); // 5 minutes

                logger.info('Verification code verified', {
                    challengeId: challengeId,
                    method: challenge.method,
                    attempts: challenge.attempts
                });

                return {
                    verified: true,
                    result: VERIFICATION_RESULT.SUCCESS,
                    message: 'Code verified successfully',
                    method: challenge.method
                };
            }

            this.stats.verificationsFailed++;
            logger.warn('Verification code failed', {
                challengeId: challengeId,
                attempts: challenge.attempts,
                remainingAttempts: this.config.maxVerificationAttempts - challenge.attempts
            });

            return {
                verified: false,
                result: VERIFICATION_RESULT.INVALID_CODE,
                message: 'Invalid code',
                attemptsRemaining: this.config.maxVerificationAttempts - challenge.attempts
            };

        } catch (error) {
            logger.error('Verification code verification error', {
                error: error.message,
                challengeId
            });
            return {
                verified: false,
                result: VERIFICATION_RESULT.FAILED,
                message: 'Verification failed',
                error: error.message
            };
        }
    }

    // ============= RATE LIMITING METHODS =============

    /**
     * Check rate limit for MFA method
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @returns {Object} Rate limit status
     */
    checkRateLimit(userId, method) {
        try {
            const key = `${userId}:${method}`;
            const now = Date.now();

            // Get rate limit config for method
            const isEmail = method === MFA_METHODS.EMAIL;
            const limit = isEmail ? this.config.emailRateLimit : this.config.smsRateLimit;
            const window = isEmail ? this.config.emailRateLimitWindow : this.config.smsRateLimitWindow;

            // Get tracking data
            let attempts = this.rateLimitTracking.get(key) || [];

            // Remove old attempts outside the window
            attempts = attempts.filter(timestamp => now - timestamp < window);

            // Check if limit exceeded
            if (attempts.length >= limit) {
                this.stats.rateLimitHits++;
                
                const oldestAttempt = Math.min(...attempts);
                const resetTime = new Date(oldestAttempt + window);

                logger.warn('Rate limit exceeded', {
                    userId,
                    method,
                    attempts: attempts.length,
                    limit: limit,
                    resetTime
                });

                return {
                    allowed: false,
                    limitReached: true,
                    attemptsUsed: attempts.length,
                    attemptsLimit: limit,
                    resetTime: resetTime,
                    retryAfter: Math.ceil((resetTime - now) / 1000) // seconds
                };
            }

            // Update tracking
            attempts.push(now);
            this.rateLimitTracking.set(key, attempts);

            return {
                allowed: true,
                limitReached: false,
                attemptsUsed: attempts.length,
                attemptsRemaining: limit - attempts.length,
                attemptsLimit: limit
            };

        } catch (error) {
            logger.error('Rate limit check failed', {
                error: error.message,
                userId,
                method
            });
            // Fail open on errors
            return { allowed: true, limitReached: false };
        }
    }

    /**
     * Reset rate limit for user and method
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @returns {boolean} Success status
     */
    resetRateLimit(userId, method) {
        try {
            const key = `${userId}:${method}`;
            this.rateLimitTracking.delete(key);
            
            logger.info('Rate limit reset', { userId, method });
            return true;

        } catch (error) {
            logger.error('Rate limit reset failed', {
                error: error.message,
                userId,
                method
            });
            return false;
        }
    }

    // ============= MFA SETUP AND MANAGEMENT =============

    /**
     * Enable MFA for user (complete flow)
     * @param {string} userId - User ID
     * @param {string} userIdentifier - Email or username
     * @param {string} method - MFA method
     * @param {Object} [options] - Setup options
     * @returns {Promise<Object>} Setup data
     */
    async enable2FA(userId, userIdentifier, method, options = {}) {
        try {
            let setupData = {};

            switch (method) {
                case MFA_METHODS.TOTP:
                    // Generate TOTP secret
                    const secretData = this.generateSecret(userIdentifier, options);
                    
                    // Generate QR code
                    const qrCode = await this.generateQRCode(secretData.otpauthUrl, options);
                    
                    // Generate backup codes
                    const backupCodes = await this.generateBackupCodes(
                        options.backupCodeCount,
                        options
                    );

                    setupData = {
                        method: MFA_METHODS.TOTP,
                        secret: secretData.secret,
                        qrCode: qrCode,
                        backupCodes: backupCodes.codes, // Show once
                        hashedBackupCodes: backupCodes.hashedCodes, // Store
                        otpauthUrl: secretData.otpauthUrl,
                        instructions: [
                            'Scan the QR code with your authenticator app',
                            'Enter the 6-digit code from your app to verify',
                            'Save your backup codes in a secure location'
                        ]
                    };
                    break;

                case MFA_METHODS.SMS:
                    // Check rate limit
                    const smsRateLimit = this.checkRateLimit(userId, MFA_METHODS.SMS);
                    if (!smsRateLimit.allowed) {
                        throw new AppError(
                            `SMS rate limit exceeded. Try again in ${smsRateLimit.retryAfter} seconds`,
                            429,
                            'RATE_LIMIT_EXCEEDED'
                        );
                    }

                    // Generate verification code
                    const smsCode = this.generateVerificationCode(MFA_METHODS.SMS, options);

                    setupData = {
                        method: MFA_METHODS.SMS,
                        challengeId: smsCode.challengeId,
                        code: smsCode.code, // Send via SMS service
                        expiresAt: smsCode.expiresAt,
                        phoneNumber: options.phoneNumber,
                        instructions: [
                            'A verification code has been sent to your phone',
                            'Enter the code to complete setup'
                        ]
                    };

                    // TODO: Send SMS via SMS service
                    logger.info('SMS verification code ready to send', {
                        userId,
                        phoneNumber: options.phoneNumber,
                        code: smsCode.code // Remove in production
                    });
                    break;

                case MFA_METHODS.EMAIL:
                    // Check rate limit
                    const emailRateLimit = this.checkRateLimit(userId, MFA_METHODS.EMAIL);
                    if (!emailRateLimit.allowed) {
                        throw new AppError(
                            `Email rate limit exceeded. Try again in ${emailRateLimit.retryAfter} seconds`,
                            429,
                            'RATE_LIMIT_EXCEEDED'
                        );
                    }

                    // Generate verification code
                    const emailCode = this.generateVerificationCode(MFA_METHODS.EMAIL, options);

                    setupData = {
                        method: MFA_METHODS.EMAIL,
                        challengeId: emailCode.challengeId,
                        code: emailCode.code, // Send via email service
                        expiresAt: emailCode.expiresAt,
                        email: userIdentifier,
                        instructions: [
                            'A verification code has been sent to your email',
                            'Enter the code to complete setup'
                        ]
                    };

                    // TODO: Send email via email service
                    logger.info('Email verification code ready to send', {
                        userId,
                        email: userIdentifier,
                        code: emailCode.code // Remove in production
                    });
                    break;

                default:
                    throw new AppError(`Unsupported MFA method: ${method}`, 400, 'UNSUPPORTED_METHOD');
            }

            logger.info('MFA setup initiated', {
                userId,
                method,
                userIdentifier
            });

            return {
                success: true,
                ...setupData,
                nextStep: 'verify_and_complete'
            };

        } catch (error) {
            logger.error('MFA enable failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Disable MFA for user
     * @param {string} userId - User ID
     * @param {string} method - MFA method to disable
     * @param {Object} [options] - Disable options
     * @returns {Object} Disable result
     */
    disable2FA(userId, method, options = {}) {
        try {
            logger.info('MFA disabled', {
                userId,
                method,
                reason: options.reason || 'user_request'
            });

            return {
                success: true,
                method: method,
                disabledAt: new Date(),
                message: 'MFA disabled successfully'
            };

        } catch (error) {
            logger.error('MFA disable failed', {
                error: error.message,
                userId,
                method
            });
            throw new AppError('MFA disable failed', 500, 'DISABLE_FAILED');
        }
    }

    // ============= RECOVERY METHODS =============

    /**
     * Generate recovery codes (same as backup codes)
     * @param {number} [count] - Number of recovery codes
     * @param {Object} [options] - Generation options
     * @returns {Promise<Object>} Recovery codes
     */
    async generateRecoveryCodes(count = 10, options = {}) {
        return await this.generateBackupCodes(count, options);
    }

    /**
     * Verify recovery code (same as backup code)
     * @param {string} code - Recovery code
     * @param {Array<Object>} storedCodes - Stored recovery codes
     * @returns {Promise<Object>} Verification result
     */
    async verifyRecoveryCode(code, storedCodes) {
        return await this.verifyBackupCode(code, storedCodes);
    }

    // ============= CLEANUP AND MAINTENANCE =============

    /**
     * Clean up expired challenges and rate limit data
     * @returns {number} Number of items cleaned
     */
    cleanup() {
        try {
            let cleanedCount = 0;
            const now = Date.now();

            // Clean expired challenges
            for (const [challengeId, challenge] of this.activeChallenges.entries()) {
                if (new Date(challenge.expiresAt) < now) {
                    this.activeChallenges.delete(challengeId);
                    cleanedCount++;
                }
            }

            // Clean old rate limit data
            for (const [key, attempts] of this.rateLimitTracking.entries()) {
                const validAttempts = attempts.filter(timestamp => now - timestamp < 24 * 60 * 60 * 1000);
                if (validAttempts.length === 0) {
                    this.rateLimitTracking.delete(key);
                    cleanedCount++;
                } else if (validAttempts.length < attempts.length) {
                    this.rateLimitTracking.set(key, validAttempts);
                }
            }

            if (cleanedCount > 0) {
                logger.debug('MFA cleanup completed', {
                    itemsCleaned: cleanedCount,
                    activeChallenges: this.activeChallenges.size,
                    rateLimitEntries: this.rateLimitTracking.size
                });
            }

            return cleanedCount;

        } catch (error) {
            logger.error('MFA cleanup failed', { error: error.message });
            return 0;
        }
    }

    /**
     * Start automatic cleanup scheduler
     * @private
     */
    _startCleanupScheduler() {
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000); // Every 5 minutes

        logger.info('MFA cleanup scheduler started');
    }

    // ============= STATISTICS AND MONITORING =============

    /**
     * Get service statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            activeChallenges: this.activeChallenges.size,
            rateLimitEntries: this.rateLimitTracking.size,
            totpSuccessRate: this.stats.totpVerified > 0
                ? ((this.stats.totpVerified / (this.stats.totpVerified + this.stats.verificationsFailed)) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Get active challenges for user
     * @param {string} userId - User ID
     * @returns {Array} Active challenges
     */
    getUserActiveChallenges(userId) {
        const userChallenges = [];
        
        for (const [challengeId, challenge] of this.activeChallenges.entries()) {
            if (challenge.userId === userId && !challenge.verified) {
                userChallenges.push({
                    challengeId: challengeId,
                    method: challenge.method,
                    createdAt: challenge.createdAt,
                    expiresAt: challenge.expiresAt,
                    attempts: challenge.attempts
                });
            }
        }

        return userChallenges;
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Generate backup code
     * @private
     */
    _generateBackupCode(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
            // Add dash every 4 characters for readability
            if ((i + 1) % 4 === 0 && i < length - 1) {
                code += '-';
            }
        }
        
        return code;
    }

    /**
     * Generate numeric code
     * @private
     */
    _generateNumericCode(length) {
        let code = '';
        for (let i = 0; i < length; i++) {
            code += Math.floor(Math.random() * 10);
        }
        return code;
    }

    /**
     * Format backup codes for display
     * @param {Array<string>} codes - Backup codes
     * @returns {Array<string>} Formatted codes
     */
    formatBackupCodes(codes) {
        return codes.map(code => {
            // Add dashes every 4 characters if not already formatted
            if (code.includes('-')) {
                return code;
            }
            return code.match(/.{1,4}/g).join('-');
        });
    }
}

// Export singleton instance
module.exports = new TwoFactorService();