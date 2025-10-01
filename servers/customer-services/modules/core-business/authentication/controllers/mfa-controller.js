/**
 * @fileoverview MFA Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/mfa-controller
 * @description Handles HTTP requests for Multi-Factor Authentication operations
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CustomerAuthService = require('../services/direct-auth-service');

/**
 * MFA Controller
 * Handles all MFA-related HTTP requests
 * @class MfaController
 */
class MfaController {
    /**
     * Setup TOTP/Authenticator MFA
     * @route POST /api/auth/mfa/setup/totp
     * @access Protected
     */
    async setupTotpMfa(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Call customer auth service for MFA setup
            const result = await CustomerAuthService.enableCustomerMFA(
                userId,
                'totp',
                tenantId,
                {}
            );

            logger.info('TOTP MFA setup initiated', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'TOTP MFA setup initiated',
                data: {
                    secret: result.secret,
                    qrCode: result.qrCode,
                    backupCodes: result.backupCodes,
                    setupInstructions: result.instructions,
                    supportUrl: result.supportUrl,
                    videoTutorial: result.videoTutorial
                }
            });

        } catch (error) {
            logger.error('TOTP MFA setup failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Setup SMS MFA
     * @route POST /api/auth/mfa/setup/sms
     * @access Protected
     */
    async setupSmsMfa(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { phoneNumber } = req.body;

            if (!phoneNumber) {
                throw new AppError('Phone number is required', 400, 'MISSING_PHONE_NUMBER');
            }

            // Call customer auth service for SMS MFA setup
            const result = await CustomerAuthService.enableCustomerMFA(
                userId,
                'sms',
                tenantId,
                { phoneNumber }
            );

            logger.info('SMS MFA setup initiated', {
                userId,
                tenantId,
                phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*')
            });

            res.status(200).json({
                success: true,
                message: 'SMS MFA setup initiated. Verification code sent.',
                data: {
                    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                    verificationId: result.verificationId,
                    expiresIn: result.expiresIn,
                    supportUrl: result.supportUrl
                }
            });

        } catch (error) {
            logger.error('SMS MFA setup failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Setup Email MFA
     * @route POST /api/auth/mfa/setup/email
     * @access Protected
     */
    async setupEmailMfa(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { email } = req.body;

            // Use user's email if not provided
            const targetEmail = email || req.user.email;

            // Call customer auth service for Email MFA setup
            const result = await CustomerAuthService.enableCustomerMFA(
                userId,
                'email',
                tenantId,
                { email: targetEmail }
            );

            logger.info('Email MFA setup initiated', {
                userId,
                tenantId,
                email: targetEmail
            });

            res.status(200).json({
                success: true,
                message: 'Email MFA setup initiated. Verification code sent.',
                data: {
                    email: targetEmail,
                    verificationId: result.verificationId,
                    expiresIn: result.expiresIn,
                    supportUrl: result.supportUrl
                }
            });

        } catch (error) {
            logger.error('Email MFA setup failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Verify MFA code during setup
     * @route POST /api/auth/mfa/verify
     * @access Protected
     */
    async verifyMfaSetup(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { code, method, verificationId } = req.body;

            if (!code) {
                throw new AppError('Verification code is required', 400, 'MISSING_CODE');
            }

            if (!method) {
                throw new AppError('MFA method is required', 400, 'MISSING_METHOD');
            }

            // Call shared auth service for MFA verification
            const TwoFactorService = require('../../../../../../shared/lib/auth/services/two-factor-service');
            const result = await TwoFactorService.verifyMfaSetup(
                userId,
                method,
                code,
                verificationId,
                tenantId
            );

            logger.info('MFA setup verified', {
                userId,
                tenantId,
                method
            });

            res.status(200).json({
                success: true,
                message: 'MFA enabled successfully',
                data: {
                    method: method,
                    enabled: true,
                    backupCodes: result.backupCodes
                }
            });

        } catch (error) {
            logger.error('MFA verification failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Challenge MFA during login
     * @route POST /api/auth/mfa/challenge
     * @access Public (with challenge ID)
     */
    async challengeMfa(req, res, next) {
        try {
            const { challengeId, code, method } = req.body;
            const tenantId = req.headers['x-tenant-id'];

            if (!challengeId) {
                throw new AppError('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');
            }

            if (!code) {
                throw new AppError('MFA code is required', 400, 'MISSING_CODE');
            }

            // Call shared auth service for MFA challenge verification
            const TwoFactorService = require('../../../../../../shared/lib/auth/services/two-factor-service');
            const result = await TwoFactorService.verifyMfaChallenge(
                challengeId,
                code,
                method,
                tenantId
            );

            // Set HTTP-only cookie for refresh token
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
            }

            logger.info('MFA challenge verified', {
                userId: result.user.id,
                tenantId,
                method
            });

            res.status(200).json({
                success: true,
                message: 'MFA verification successful',
                data: {
                    accessToken: result.tokens.accessToken,
                    refreshToken: result.tokens.refreshToken,
                    expiresIn: result.tokens.expiresIn,
                    user: result.user
                }
            });

        } catch (error) {
            logger.error('MFA challenge failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Disable MFA method
     * @route POST /api/auth/mfa/disable
     * @access Protected
     */
    async disableMfa(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { method, password } = req.body;

            if (!method) {
                throw new AppError('MFA method is required', 400, 'MISSING_METHOD');
            }

            if (!password) {
                throw new AppError('Password confirmation is required', 400, 'MISSING_PASSWORD');
            }

            // Verify password before disabling MFA
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            await AuthService.verifyPassword(userId, password, tenantId);

            // Call shared auth service to disable MFA
            const TwoFactorService = require('../../../../../../shared/lib/auth/services/two-factor-service');
            await TwoFactorService.disableMfa(userId, method, tenantId);

            logger.info('MFA disabled', {
                userId,
                tenantId,
                method
            });

            res.status(200).json({
                success: true,
                message: `${method.toUpperCase()} MFA disabled successfully`,
                data: {
                    method: method,
                    enabled: false
                }
            });

        } catch (error) {
            logger.error('MFA disable failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get enabled MFA methods
     * @route GET /api/auth/mfa/methods
     * @access Protected
     */
    async getMfaMethods(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Call shared auth service to get MFA methods
            const TwoFactorService = require('../../../../../../shared/lib/auth/services/two-factor-service');
            const methods = await TwoFactorService.getMfaMethods(userId, tenantId);

            logger.debug('MFA methods retrieved', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'MFA methods retrieved successfully',
                data: {
                    methods: methods,
                    hasMfaEnabled: methods.some(m => m.enabled)
                }
            });

        } catch (error) {
            logger.error('Get MFA methods failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get backup codes
     * @route GET /api/auth/mfa/backup-codes
     * @access Protected
     */
    async getBackupCodes(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Call shared auth service to get backup codes
            const TwoFactorService = require('../../../../../../shared/lib/auth/services/two-factor-service');
            const backupCodes = await TwoFactorService.getBackupCodes(userId, tenantId);

            logger.info('Backup codes retrieved', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Backup codes retrieved successfully',
                data: {
                    codes: backupCodes,
                    warning: 'Store these codes securely. Each code can only be used once.'
                }
            });

        } catch (error) {
            logger.error('Get backup codes failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Regenerate backup codes
     * @route POST /api/auth/mfa/regenerate-codes
     * @access Protected
     */
    async regenerateBackupCodes(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { password } = req.body;

            if (!password) {
                throw new AppError('Password confirmation is required', 400, 'MISSING_PASSWORD');
            }

            // Verify password before regenerating codes
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            await AuthService.verifyPassword(userId, password, tenantId);

            // Call shared auth service to regenerate backup codes
            const TwoFactorService = require('../../../../../../shared/lib/auth/services/two-factor-service');
            const newBackupCodes = await TwoFactorService.regenerateBackupCodes(userId, tenantId);

            logger.info('Backup codes regenerated', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Backup codes regenerated successfully',
                data: {
                    codes: newBackupCodes,
                    warning: 'Previous backup codes are now invalid. Store these new codes securely.'
                }
            });

        } catch (error) {
            logger.error('Regenerate backup codes failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

// Export singleton instance
module.exports = new MfaController();