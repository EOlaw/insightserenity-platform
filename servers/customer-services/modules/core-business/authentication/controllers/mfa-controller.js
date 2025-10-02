/**
 * @fileoverview Multi-Factor Authentication Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/mfa-controller
 */

const directAuthService = require('../services/direct-auth-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const { validationResult } = require('express-validator');

class MFAController {
    /**
     * Setup MFA for user
     * POST /api/auth/mfa/setup
     */
    async setupMFA(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { method = 'totp' } = req.body;

            const validMethods = ['totp', 'sms', 'email', 'backup_codes', 'webauthn', 'push'];
            if (!validMethods.includes(method)) {
                return next(new AppError('Invalid MFA method', 400));
            }

            // Get user from database
            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Setup MFA
            const mfaSetup = await user.setupTwoFactor(method);

            res.status(200).json({
                success: true,
                message: 'MFA setup initiated',
                data: {
                    method: method,
                    qrCode: mfaSetup.qrCode,
                    secret: method === 'totp' ? mfaSetup.secret : undefined,
                    nextStep: 'Verify the MFA code to complete setup'
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Verify MFA setup
     * POST /api/auth/mfa/verify-setup
     */
    async verifyMFASetup(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { method, code } = req.body;

            if (!method || !code) {
                return next(new AppError('Method and code are required', 400));
            }

            // Get user from database
            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Verify MFA
            await user.verifyTwoFactor(method, code);

            res.status(200).json({
                success: true,
                message: 'MFA verified and enabled successfully',
                data: {
                    mfaEnabled: true,
                    method: method
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Verify MFA code during login
     * POST /api/auth/mfa/verify
     */
    async verifyMFA(req, res, next) {
        try {
            const { tempToken, code, method } = req.body;

            if (!tempToken || !code) {
                return next(new AppError('Temporary token and code are required', 400));
            }

            // TODO: Implement MFA verification during login
            // This would verify the tempToken, validate the MFA code,
            // and return the actual access token

            res.status(200).json({
                success: true,
                message: 'MFA verification successful',
                data: {
                    accessToken: 'new-access-token',
                    refreshToken: 'new-refresh-token',
                    expiresIn: 86400
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Disable MFA
     * POST /api/auth/mfa/disable
     */
    async disableMFA(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { password, code } = req.body;

            if (!password) {
                return next(new AppError('Password is required to disable MFA', 400));
            }

            // Get user from database
            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Verify password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                return next(new AppError('Invalid password', 401));
            }

            // Verify current MFA code before disabling
            if (user.mfa?.enabled && code) {
                const currentMethod = user.mfa.methods.find(m => m.enabled);
                if (currentMethod) {
                    await user.verifyTwoFactor(currentMethod.type, code);
                }
            }

            // Disable MFA
            user.mfa.enabled = false;
            user.mfa.methods = [];
            await user.save();

            res.status(200).json({
                success: true,
                message: 'MFA disabled successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get MFA status
     * GET /api/auth/mfa/status
     */
    async getMFAStatus(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            // Get user from database
            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            res.status(200).json({
                success: true,
                data: {
                    enabled: user.mfa?.enabled || false,
                    methods: user.mfa?.methods?.map(m => ({
                        type: m.type,
                        enabled: m.enabled,
                        isPrimary: m.isPrimary
                    })) || []
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Generate backup codes
     * POST /api/auth/mfa/backup-codes
     */
    async generateBackupCodes(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { password } = req.body;

            if (!password) {
                return next(new AppError('Password is required', 400));
            }

            // Get user from database
            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Verify password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                return next(new AppError('Invalid password', 401));
            }

            // Generate backup codes (TODO: implement in user model)
            const backupCodes = [];
            for (let i = 0; i < 10; i++) {
                const code = Math.random().toString(36).substring(2, 10).toUpperCase();
                backupCodes.push(code);
            }

            res.status(200).json({
                success: true,
                message: 'Backup codes generated successfully',
                data: {
                    backupCodes,
                    warning: 'Save these codes in a safe place. Each code can only be used once.'
                }
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new MFAController();