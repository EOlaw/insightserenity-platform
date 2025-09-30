/**
 * @fileoverview MFA Requirement Middleware
 * @module shared/lib/auth/middleware/require-mfa
 * @description Middleware to enforce Multi-Factor Authentication for sensitive operations
 * @version 2.0.0
 */

const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger');
const TwoFactorService = require('../services/two-factor-service');
const database = require('../../database');

/**
 * MFA Challenge Status
 * @enum {string}
 */
const MFA_CHALLENGE_STATUS = {
    PENDING: 'pending',
    VERIFIED: 'verified',
    EXPIRED: 'expired',
    FAILED: 'failed'
};

/**
 * Sensitive Operations that require MFA
 * @enum {string}
 */
const SENSITIVE_OPERATIONS = {
    PASSWORD_CHANGE: 'password_change',
    EMAIL_CHANGE: 'email_change',
    PHONE_CHANGE: 'phone_change',
    MFA_DISABLE: 'mfa_disable',
    ACCOUNT_DELETE: 'account_delete',
    FINANCIAL_TRANSACTION: 'financial_transaction',
    DATA_EXPORT: 'data_export',
    SECURITY_SETTINGS: 'security_settings',
    API_KEY_GENERATE: 'api_key_generate',
    ADMIN_ACTION: 'admin_action'
};

/**
 * MFA requirement statistics
 * @type {Object}
 */
const mfaStats = {
    totalChecks: 0,
    mfaRequired: 0,
    mfaVerified: 0,
    mfaBypassedTrustedDevice: 0,
    mfaBypassedRecentAuth: 0,
    mfaFailed: 0,
    challengesCreated: 0,
    challengesExpired: 0
};

/**
 * Recent MFA verifications cache
 * Tracks recently verified MFA challenges to avoid repeated prompts
 * @type {Map}
 */
const recentVerifications = new Map();
const VERIFICATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if user has MFA enabled
 * @param {Object} user - User object
 * @returns {boolean} True if MFA is enabled
 * @private
 */
function isMFAEnabled(user) {
    return user.mfa && user.mfa.enabled === true && 
           user.mfa.methods && user.mfa.methods.length > 0;
}

/**
 * Get enabled MFA methods for user
 * @param {Object} user - User object
 * @returns {Array<Object>} Array of enabled MFA methods
 * @private
 */
function getEnabledMFAMethods(user) {
    if (!user.mfa || !user.mfa.methods) {
        return [];
    }

    return user.mfa.methods.filter(method => method.enabled === true);
}

/**
 * Check if device is trusted
 * @param {Object} user - User object
 * @param {string} deviceFingerprint - Device fingerprint
 * @returns {boolean} True if device is trusted
 * @private
 */
function isDeviceTrusted(user, deviceFingerprint) {
    if (!deviceFingerprint || !user.security || !user.security.trustedDevices) {
        return false;
    }

    const trustedDevice = user.security.trustedDevices.find(
        device => device.fingerprint === deviceFingerprint && device.trusted === true
    );

    if (!trustedDevice) {
        return false;
    }

    // Check if trust is still valid (not expired)
    const trustExpiry = 30 * 24 * 60 * 60 * 1000; // 30 days
    const deviceAge = Date.now() - new Date(trustedDevice.firstSeen).getTime();
    
    return deviceAge < trustExpiry;
}

/**
 * Check if user has recently authenticated with MFA
 * @param {string} userId - User ID
 * @param {number} timeWindow - Time window in milliseconds
 * @returns {boolean} True if recently authenticated
 * @private
 */
function hasRecentMFAVerification(userId, timeWindow) {
    const verification = recentVerifications.get(userId);
    
    if (!verification) {
        return false;
    }

    const timeSinceVerification = Date.now() - verification.timestamp;
    
    if (timeSinceVerification > timeWindow) {
        // Verification expired, remove from cache
        recentVerifications.delete(userId);
        return false;
    }

    return true;
}

/**
 * Record MFA verification
 * @param {string} userId - User ID
 * @param {Object} metadata - Verification metadata
 * @private
 */
function recordMFAVerification(userId, metadata = {}) {
    recentVerifications.set(userId, {
        timestamp: Date.now(),
        ...metadata
    });

    // Auto-cleanup after TTL
    setTimeout(() => {
        recentVerifications.delete(userId);
    }, VERIFICATION_CACHE_TTL);
}

/**
 * Verify MFA code provided in request
 * @param {Object} req - Express request object
 * @param {Object} user - User object
 * @param {Object} options - Verification options
 * @returns {Promise<Object>} Verification result
 * @private
 */
async function verifyMFACode(req, user, options = {}) {
    const mfaCode = req.body.mfaCode || req.headers['x-mfa-code'];
    const mfaMethod = req.body.mfaMethod || req.headers['x-mfa-method'] || user.mfa.preferredMethod;

    if (!mfaCode) {
        return {
            verified: false,
            code: 'MFA_CODE_REQUIRED',
            message: 'MFA verification code is required'
        };
    }

    if (!mfaMethod) {
        return {
            verified: false,
            code: 'MFA_METHOD_REQUIRED',
            message: 'MFA verification method is required'
        };
    }

    // Get the specific MFA method configuration
    const userMFAMethod = user.mfa.methods.find(
        m => m.type === mfaMethod && m.enabled === true
    );

    if (!userMFAMethod) {
        return {
            verified: false,
            code: 'MFA_METHOD_NOT_FOUND',
            message: `MFA method '${mfaMethod}' is not enabled for this user`
        };
    }

    // Verify based on method type
    let verificationResult;

    switch (mfaMethod) {
        case 'totp':
            verificationResult = TwoFactorService.verifyCode(
                userMFAMethod.secret,
                mfaCode
            );
            break;

        case 'sms':
        case 'email':
            const challengeId = req.body.challengeId || req.headers['x-challenge-id'];
            if (!challengeId) {
                return {
                    verified: false,
                    code: 'CHALLENGE_ID_REQUIRED',
                    message: 'Challenge ID is required for SMS/Email MFA'
                };
            }
            verificationResult = TwoFactorService.verifyVerificationCode(
                challengeId,
                mfaCode
            );
            break;

        case 'backup_code':
            const backupResult = await TwoFactorService.verifyBackupCode(
                mfaCode,
                userMFAMethod.backupCodes || []
            );
            verificationResult = {
                verified: backupResult.verified,
                result: backupResult.result,
                message: backupResult.verified ? 'Backup code verified' : 'Invalid backup code'
            };

            // Update user's backup codes if one was used
            if (backupResult.verified && backupResult.updatedCodes) {
                try {
                    await database.getModel('User').findByIdAndUpdate(
                        user._id,
                        { 'mfa.methods.$[elem].backupCodes': backupResult.updatedCodes },
                        { arrayFilters: [{ 'elem.type': 'backup_code' }] }
                    );
                } catch (error) {
                    logger.error('Failed to update backup codes', {
                        error: error.message,
                        userId: user._id
                    });
                }
            }
            break;

        default:
            return {
                verified: false,
                code: 'UNSUPPORTED_MFA_METHOD',
                message: `MFA method '${mfaMethod}' is not supported`
            };
    }

    if (verificationResult.verified) {
        // Record successful verification
        recordMFAVerification(user._id.toString(), {
            method: mfaMethod,
            operation: options.operation,
            ip: req.ip
        });

        // Update last MFA usage
        try {
            await database.getModel('User').findByIdAndUpdate(
                user._id,
                {
                    'mfa.lastUsedMethod': mfaMethod,
                    'mfa.lastUsedAt': new Date()
                }
            );
        } catch (error) {
            logger.error('Failed to update MFA last used', {
                error: error.message,
                userId: user._id
            });
        }

        logger.info('MFA verification successful', {
            userId: user._id,
            method: mfaMethod,
            operation: options.operation
        });
    } else {
        logger.warn('MFA verification failed', {
            userId: user._id,
            method: mfaMethod,
            operation: options.operation
        });
    }

    return verificationResult;
}

/**
 * Main MFA requirement middleware factory
 * @param {Object} options - Middleware configuration options
 * @param {string} [options.operation] - Operation type requiring MFA
 * @param {boolean} [options.allowTrustedDevices=true] - Allow bypass for trusted devices
 * @param {number} [options.recentAuthWindow=5*60*1000] - Recent auth time window (ms)
 * @param {boolean} [options.allowRecentAuth=true] - Allow bypass if recently authenticated
 * @param {boolean} [options.strict=false] - Strict mode (no bypasses)
 * @param {boolean} [options.createChallenge=false] - Auto-create challenge for SMS/Email
 * @param {Array<string>} [options.allowedMethods] - Allowed MFA methods for this operation
 * @param {Function} [options.customCheck] - Custom MFA requirement check
 * @returns {Function} Express middleware function
 */
function requireMFA(options = {}) {
    const config = {
        operation: options.operation || 'sensitive_operation',
        allowTrustedDevices: options.allowTrustedDevices !== false,
        recentAuthWindow: options.recentAuthWindow || 5 * 60 * 1000, // 5 minutes
        allowRecentAuth: options.allowRecentAuth !== false,
        strict: options.strict || false,
        createChallenge: options.createChallenge || false,
        allowedMethods: options.allowedMethods || null,
        customCheck: options.customCheck || null
    };

    return async (req, res, next) => {
        try {
            mfaStats.totalChecks++;

            // Ensure user is authenticated
            if (!req.user || !req.authenticated) {
                return next(new AppError(
                    'Authentication required for MFA check',
                    401,
                    'NOT_AUTHENTICATED'
                ));
            }

            // Get fresh user data from database
            const User = database.getModel('User');
            const user = await User.findById(req.user.id);

            if (!user) {
                return next(new AppError(
                    'User not found',
                    404,
                    'USER_NOT_FOUND'
                ));
            }

            // Check if MFA is enabled for user
            if (!isMFAEnabled(user)) {
                // MFA not enabled, check if it should be enforced
                const shouldEnforce = config.strict || 
                                     SENSITIVE_OPERATIONS[config.operation.toUpperCase()];

                if (shouldEnforce) {
                    return next(new AppError(
                        'Multi-Factor Authentication must be enabled for this operation',
                        403,
                        'MFA_NOT_ENABLED',
                        {
                            operation: config.operation,
                            setupUrl: '/api/auth/mfa/setup'
                        }
                    ));
                }

                // MFA not enforced, allow request
                logger.info('MFA not enforced for operation', {
                    userId: user._id,
                    operation: config.operation
                });
                return next();
            }

            mfaStats.mfaRequired++;

            // Custom MFA requirement check
            if (config.customCheck && typeof config.customCheck === 'function') {
                const customResult = await config.customCheck(req, user);
                if (customResult && customResult.bypass === true) {
                    logger.info('MFA bypassed by custom check', {
                        userId: user._id,
                        operation: config.operation,
                        reason: customResult.reason
                    });
                    return next();
                }
            }

            // Check for bypasses (only if not in strict mode)
            if (!config.strict) {
                // Check trusted device bypass
                if (config.allowTrustedDevices) {
                    const deviceFingerprint = req.body?.deviceFingerprint || 
                                            req.headers['x-device-fingerprint'];
                    
                    if (deviceFingerprint && isDeviceTrusted(user, deviceFingerprint)) {
                        mfaStats.mfaBypassedTrustedDevice++;
                        logger.info('MFA bypassed for trusted device', {
                            userId: user._id,
                            operation: config.operation
                        });
                        return next();
                    }
                }

                // Check recent authentication bypass
                if (config.allowRecentAuth) {
                    if (hasRecentMFAVerification(user._id.toString(), config.recentAuthWindow)) {
                        mfaStats.mfaBypassedRecentAuth++;
                        logger.debug('MFA bypassed for recent authentication', {
                            userId: user._id,
                            operation: config.operation
                        });
                        return next();
                    }
                }
            }

            // Get enabled MFA methods
            const enabledMethods = getEnabledMFAMethods(user);
            
            if (enabledMethods.length === 0) {
                return next(new AppError(
                    'No MFA methods are enabled. Please configure MFA.',
                    403,
                    'NO_MFA_METHODS'
                ));
            }

            // Filter by allowed methods if specified
            let availableMethods = enabledMethods;
            if (config.allowedMethods && config.allowedMethods.length > 0) {
                availableMethods = enabledMethods.filter(
                    method => config.allowedMethods.includes(method.type)
                );

                if (availableMethods.length === 0) {
                    return next(new AppError(
                        `No allowed MFA methods available. Required: ${config.allowedMethods.join(', ')}`,
                        403,
                        'NO_ALLOWED_MFA_METHODS'
                    ));
                }
            }

            // Check if MFA code is provided in request
            const mfaCode = req.body.mfaCode || req.headers['x-mfa-code'];

            if (mfaCode) {
                // Verify the provided MFA code
                const verificationResult = await verifyMFACode(req, user, {
                    operation: config.operation
                });

                if (verificationResult.verified) {
                    mfaStats.mfaVerified++;
                    req.mfaVerified = true;
                    req.mfaMethod = verificationResult.method;
                    return next();
                } else {
                    mfaStats.mfaFailed++;
                    return next(new AppError(
                        verificationResult.message || 'MFA verification failed',
                        401,
                        verificationResult.code || 'MFA_VERIFICATION_FAILED'
                    ));
                }
            }

            // MFA code not provided, return challenge
            mfaStats.challengesCreated++;

            // Auto-create challenge for SMS/Email if enabled
            let challengeInfo = null;
            if (config.createChallenge) {
                const preferredMethod = user.mfa.preferredMethod;
                
                if (preferredMethod === 'sms' || preferredMethod === 'email') {
                    try {
                        const challenge = TwoFactorService.generateVerificationCode(
                            preferredMethod
                        );

                        challengeInfo = {
                            challengeId: challenge.challengeId,
                            expiresAt: challenge.expiresAt
                        };

                        logger.info('MFA challenge created', {
                            userId: user._id,
                            method: preferredMethod,
                            challengeId: challenge.challengeId
                        });

                        // TODO: Send code via SMS/Email service
                    } catch (error) {
                        logger.error('Failed to create MFA challenge', {
                            error: error.message,
                            userId: user._id
                        });
                    }
                }
            }

            // Return MFA challenge response
            const response = {
                success: false,
                mfaRequired: true,
                message: 'Multi-Factor Authentication required for this operation',
                code: 'MFA_REQUIRED',
                data: {
                    operation: config.operation,
                    availableMethods: availableMethods.map(m => ({
                        type: m.type,
                        isPreferred: m.type === user.mfa.preferredMethod
                    })),
                    preferredMethod: user.mfa.preferredMethod,
                    ...(challengeInfo && { challenge: challengeInfo })
                }
            };

            res.status(403).json(response);

        } catch (error) {
            mfaStats.mfaFailed++;
            logger.error('MFA requirement middleware error', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                operation: config.operation
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError(
                'MFA requirement check failed',
                500,
                'MFA_CHECK_ERROR'
            ));
        }
    };
}

/**
 * Middleware for password change operations
 * @returns {Function} Express middleware
 */
function requireMFAForPasswordChange() {
    return requireMFA({
        operation: SENSITIVE_OPERATIONS.PASSWORD_CHANGE,
        strict: true,
        allowRecentAuth: false
    });
}

/**
 * Middleware for account deletion
 * @returns {Function} Express middleware
 */
function requireMFAForAccountDelete() {
    return requireMFA({
        operation: SENSITIVE_OPERATIONS.ACCOUNT_DELETE,
        strict: true,
        allowTrustedDevices: false,
        allowRecentAuth: false
    });
}

/**
 * Middleware for financial transactions
 * @returns {Function} Express middleware
 */
function requireMFAForFinancial() {
    return requireMFA({
        operation: SENSITIVE_OPERATIONS.FINANCIAL_TRANSACTION,
        strict: true,
        recentAuthWindow: 2 * 60 * 1000 // 2 minutes
    });
}

/**
 * Middleware for security settings changes
 * @returns {Function} Express middleware
 */
function requireMFAForSecuritySettings() {
    return requireMFA({
        operation: SENSITIVE_OPERATIONS.SECURITY_SETTINGS,
        strict: true,
        allowRecentAuth: true,
        recentAuthWindow: 10 * 60 * 1000 // 10 minutes
    });
}

/**
 * Get MFA requirement statistics
 * @returns {Object} MFA statistics
 */
function getMFAStats() {
    return {
        ...mfaStats,
        verificationRate: mfaStats.mfaRequired > 0
            ? ((mfaStats.mfaVerified / mfaStats.mfaRequired) * 100).toFixed(2) + '%'
            : '0%',
        bypassRate: mfaStats.mfaRequired > 0
            ? (((mfaStats.mfaBypassedTrustedDevice + mfaStats.mfaBypassedRecentAuth) / mfaStats.mfaRequired) * 100).toFixed(2) + '%'
            : '0%',
        recentVerifications: recentVerifications.size,
        timestamp: new Date()
    };
}

/**
 * Reset MFA requirement statistics
 */
function resetMFAStats() {
    mfaStats.totalChecks = 0;
    mfaStats.mfaRequired = 0;
    mfaStats.mfaVerified = 0;
    mfaStats.mfaBypassedTrustedDevice = 0;
    mfaStats.mfaBypassedRecentAuth = 0;
    mfaStats.mfaFailed = 0;
    mfaStats.challengesCreated = 0;
    mfaStats.challengesExpired = 0;
    
    logger.info('MFA requirement statistics reset');
}

/**
 * Clear recent MFA verifications cache
 * @param {string} [userId] - Specific user ID to clear
 */
function clearVerificationCache(userId = null) {
    if (userId) {
        recentVerifications.delete(userId);
        logger.debug('MFA verification cache cleared for user', { userId });
    } else {
        recentVerifications.clear();
        logger.info('All MFA verification cache cleared');
    }
}

module.exports = requireMFA;
module.exports.requireMFA = requireMFA;
module.exports.requireMFAForPasswordChange = requireMFAForPasswordChange;
module.exports.requireMFAForAccountDelete = requireMFAForAccountDelete;
module.exports.requireMFAForFinancial = requireMFAForFinancial;
module.exports.requireMFAForSecuritySettings = requireMFAForSecuritySettings;
module.exports.getMFAStats = getMFAStats;
module.exports.resetMFAStats = resetMFAStats;
module.exports.clearVerificationCache = clearVerificationCache;
module.exports.SENSITIVE_OPERATIONS = SENSITIVE_OPERATIONS;
module.exports.MFA_CHALLENGE_STATUS = MFA_CHALLENGE_STATUS;