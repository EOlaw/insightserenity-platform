/**
 * @fileoverview Password Management Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/password-controller
 * @description Handles HTTP requests for password operations (reset, change, validate)
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CustomerAuthService = require('../services/customer-auth-service');

/**
 * Password Controller
 * Handles all password-related HTTP requests
 * @class PasswordController
 */
class PasswordController {
    /**
     * Request password reset
     * @route POST /api/auth/password/forgot
     * @access Public
     */
    async requestPasswordReset(req, res, next) {
        try {
            const { email } = req.body;
            const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;

            if (!email) {
                throw new AppError('Email is required', 400, 'MISSING_EMAIL');
            }

            if (!tenantId) {
                throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
            }

            // Prepare options
            const options = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };

            // Call customer auth service for password reset request
            await CustomerAuthService.requestCustomerPasswordReset(email, tenantId, options);

            logger.info('Password reset requested', {
                email,
                tenantId
            });

            // Always return success to prevent email enumeration
            res.status(200).json({
                success: true,
                message: 'If an account exists with this email, a password reset link has been sent.',
                data: {
                    email: email,
                    expiresIn: '1 hour'
                }
            });

        } catch (error) {
            logger.error('Password reset request failed', {
                error: error.message,
                stack: error.stack
            });
            
            // For security, still return success even on error
            res.status(200).json({
                success: true,
                message: 'If an account exists with this email, a password reset link has been sent.',
                data: {
                    email: req.body.email
                }
            });
        }
    }

    /**
     * Reset password with token
     * @route POST /api/auth/password/reset
     * @access Public
     */
    async resetPassword(req, res, next) {
        try {
            const { token, newPassword, confirmPassword } = req.body;

            if (!token) {
                throw new AppError('Reset token is required', 400, 'MISSING_TOKEN');
            }

            if (!newPassword) {
                throw new AppError('New password is required', 400, 'MISSING_PASSWORD');
            }

            if (newPassword !== confirmPassword) {
                throw new AppError('Passwords do not match', 400, 'PASSWORD_MISMATCH');
            }

            // Call shared auth service for password reset
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            const result = await AuthService.resetPassword(token, newPassword);

            logger.info('Password reset successful', {
                userId: result.userId,
                email: result.email
            });

            res.status(200).json({
                success: true,
                message: 'Password reset successful. You can now log in with your new password.',
                data: {
                    email: result.email,
                    passwordUpdated: true
                }
            });

        } catch (error) {
            logger.error('Password reset failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Change password (authenticated user)
     * @route POST /api/auth/password/change
     * @access Protected
     */
    async changePassword(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { currentPassword, newPassword, confirmPassword } = req.body;

            if (!currentPassword) {
                throw new AppError('Current password is required', 400, 'MISSING_CURRENT_PASSWORD');
            }

            if (!newPassword) {
                throw new AppError('New password is required', 400, 'MISSING_NEW_PASSWORD');
            }

            if (newPassword !== confirmPassword) {
                throw new AppError('Passwords do not match', 400, 'PASSWORD_MISMATCH');
            }

            if (currentPassword === newPassword) {
                throw new AppError('New password must be different from current password', 400, 'SAME_PASSWORD');
            }

            // Call shared auth service to change password
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            await AuthService.changePassword(userId, currentPassword, newPassword, tenantId);

            logger.info('Password changed successfully', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Password changed successfully',
                data: {
                    passwordUpdated: true,
                    updatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Password change failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Validate password strength
     * @route POST /api/auth/password/validate
     * @access Public
     */
    async validatePassword(req, res, next) {
        try {
            const { password } = req.body;

            if (!password) {
                throw new AppError('Password is required', 400, 'MISSING_PASSWORD');
            }

            // Call shared password service for validation
            const PasswordService = require('../../../../../../shared/lib/auth/services/password-service');
            const validation = await PasswordService.validatePasswordStrength(password);

            logger.debug('Password validated', {
                isValid: validation.isValid,
                score: validation.score
            });

            res.status(200).json({
                success: true,
                message: 'Password validation completed',
                data: {
                    isValid: validation.isValid,
                    score: validation.score,
                    strength: validation.strength,
                    feedback: validation.feedback,
                    requirements: validation.requirements,
                    suggestions: validation.suggestions
                }
            });

        } catch (error) {
            logger.error('Password validation failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Check password requirements
     * @route GET /api/auth/password/requirements
     * @access Public
     */
    async getPasswordRequirements(req, res, next) {
        try {
            // Get password requirements from config or service
            const requirements = {
                minLength: 8,
                maxLength: 128,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
                specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
                forbiddenPatterns: ['password', '12345', 'qwerty'],
                preventCommonPasswords: true
            };

            logger.debug('Password requirements retrieved');

            res.status(200).json({
                success: true,
                message: 'Password requirements retrieved',
                data: requirements
            });

        } catch (error) {
            logger.error('Get password requirements failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Update password expiry settings (admin only)
     * @route POST /api/auth/password/expiry
     * @access Protected (Admin)
     */
    async updatePasswordExpiry(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { expiryDays, requireChange } = req.body;

            // Verify admin role
            if (!req.user.roles || !req.user.roles.includes('admin')) {
                throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
            }

            // Call shared password service to update expiry settings
            const PasswordService = require('../../../../../../shared/lib/auth/services/password-service');
            await PasswordService.updatePasswordExpiry(userId, {
                expiryDays: expiryDays,
                requireChange: requireChange
            }, tenantId);

            logger.info('Password expiry settings updated', {
                userId,
                tenantId,
                expiryDays,
                requireChange
            });

            res.status(200).json({
                success: true,
                message: 'Password expiry settings updated',
                data: {
                    expiryDays: expiryDays,
                    requireChange: requireChange,
                    updatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Update password expiry failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Force password reset for user (admin only)
     * @route POST /api/auth/password/force-reset/:userId
     * @access Protected (Admin)
     */
    async forcePasswordReset(req, res, next) {
        try {
            const adminUserId = req.user.id;
            const targetUserId = req.params.userId;
            const tenantId = req.user.tenantId;

            // Verify admin role
            if (!req.user.roles || !req.user.roles.includes('admin')) {
                throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
            }

            if (!targetUserId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            // Call shared password service to force password reset
            const PasswordService = require('../../../../../../shared/lib/auth/services/password-service');
            await PasswordService.forcePasswordReset(targetUserId, tenantId);

            logger.info('Force password reset initiated', {
                adminUserId,
                targetUserId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'User will be required to reset password on next login',
                data: {
                    userId: targetUserId,
                    requiresPasswordReset: true
                }
            });

        } catch (error) {
            logger.error('Force password reset failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

// Export singleton instance
module.exports = new PasswordController();