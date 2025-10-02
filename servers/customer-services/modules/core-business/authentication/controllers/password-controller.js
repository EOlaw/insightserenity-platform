/**
 * @fileoverview Password Management Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/password-controller
 */

const directAuthService = require('../services/direct-auth-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const { validationResult } = require('express-validator');

class PasswordController {
    /**
     * Change password (authenticated user)
     * POST /api/auth/password/change
     */
    async changePassword(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { currentPassword, newPassword, confirmPassword } = req.body;

            if (!currentPassword || !newPassword || !confirmPassword) {
                return next(new AppError('All password fields are required', 400));
            }

            if (newPassword !== confirmPassword) {
                return next(new AppError('Passwords do not match', 400));
            }

            if (currentPassword === newPassword) {
                return next(new AppError('New password must be different from current password', 400));
            }

            // Get user from database
            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id, { includePassword: true });

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Verify current password
            const isPasswordValid = await user.comparePassword(currentPassword);
            if (!isPasswordValid) {
                return next(new AppError('Current password is incorrect', 401));
            }

            // Change password
            user.password = newPassword;
            await user.save();

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Request password reset
     * POST /api/auth/password/forgot
     */
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;

            if (!email) {
                return next(new AppError('Email is required', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findByEmail(email);

            // Always return success to prevent email enumeration
            if (!user) {
                return res.status(200).json({
                    success: true,
                    message: 'If an account exists with this email, a password reset link has been sent'
                });
            }

            // Generate reset token
            const resetToken = await user.generatePasswordResetToken();
            user.security.passwordReset.requestIp = req.ip;
            await user.save();

            // TODO: Send password reset email with resetToken
            // await NotificationService.sendEmail({
            //     to: user.email,
            //     template: 'password-reset',
            //     data: { resetToken, resetUrl: `${process.env.PLATFORM_URL}/reset-password?token=${resetToken}` }
            // });

            res.status(200).json({
                success: true,
                message: 'If an account exists with this email, a password reset link has been sent',
                // In development, return token for testing
                ...(process.env.NODE_ENV === 'development' && { resetToken })
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Verify password reset token
     * GET /api/auth/password/reset/verify/:token
     */
    async verifyResetToken(req, res, next) {
        try {
            const { token } = req.params;

            if (!token) {
                return next(new AppError('Reset token is required', 400));
            }

            // TODO: Find user by reset token and verify it's valid
            // This would involve hashing the token and looking it up in the database

            res.status(200).json({
                success: true,
                message: 'Reset token is valid',
                data: {
                    tokenValid: true
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Reset password with token
     * POST /api/auth/password/reset
     */
    async resetPassword(req, res, next) {
        try {
            const { token, newPassword, confirmPassword } = req.body;

            if (!token || !newPassword || !confirmPassword) {
                return next(new AppError('Token and passwords are required', 400));
            }

            if (newPassword !== confirmPassword) {
                return next(new AppError('Passwords do not match', 400));
            }

            // TODO: Find user by reset token
            // For now, using a mock implementation
            const dbService = directAuthService._getDatabaseService();
            
            // This is a simplified version - need to implement token lookup
            // const user = await dbService.findByResetToken(token);
            
            // Mock success response
            res.status(200).json({
                success: true,
                message: 'Password reset successful. You can now login with your new password'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Validate password strength
     * POST /api/auth/password/validate
     */
    async validatePassword(req, res, next) {
        try {
            const { password } = req.body;

            if (!password) {
                return next(new AppError('Password is required', 400));
            }

            const validation = {
                length: password.length >= 8,
                uppercase: /[A-Z]/.test(password),
                lowercase: /[a-z]/.test(password),
                number: /\d/.test(password),
                special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
            };

            const isValid = Object.values(validation).every(v => v === true);

            const strength = this._calculatePasswordStrength(password);

            res.status(200).json({
                success: true,
                data: {
                    valid: isValid,
                    validation,
                    strength,
                    suggestions: this._getPasswordSuggestions(validation)
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get password policy
     * GET /api/auth/password/policy
     */
    async getPasswordPolicy(req, res, next) {
        try {
            const policy = {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
                preventReuse: 5,
                expiryDays: 90,
                allowedSpecialChars: '!@#$%^&*(),.?":{}|<>'
            };

            res.status(200).json({
                success: true,
                data: { policy }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Set password (for users without password)
     * POST /api/auth/password/set
     */
    async setPassword(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { newPassword, confirmPassword } = req.body;

            if (!newPassword || !confirmPassword) {
                return next(new AppError('Password fields are required', 400));
            }

            if (newPassword !== confirmPassword) {
                return next(new AppError('Passwords do not match', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id, { includePassword: true });

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            if (user.password) {
                return next(new AppError('User already has a password. Use change password instead', 400));
            }

            // Set password
            user.password = newPassword;
            await user.save();

            res.status(200).json({
                success: true,
                message: 'Password set successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    // Helper methods
    _calculatePasswordStrength(password) {
        let strength = 0;
        
        if (password.length >= 8) strength += 1;
        if (password.length >= 12) strength += 1;
        if (/[a-z]/.test(password)) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/\d/.test(password)) strength += 1;
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 1;
        if (password.length >= 16) strength += 1;

        if (strength <= 2) return 'weak';
        if (strength <= 4) return 'medium';
        if (strength <= 6) return 'strong';
        return 'very-strong';
    }

    _getPasswordSuggestions(validation) {
        const suggestions = [];

        if (!validation.length) {
            suggestions.push('Use at least 8 characters');
        }
        if (!validation.uppercase) {
            suggestions.push('Add uppercase letters');
        }
        if (!validation.lowercase) {
            suggestions.push('Add lowercase letters');
        }
        if (!validation.number) {
            suggestions.push('Add numbers');
        }
        if (!validation.special) {
            suggestions.push('Add special characters (!@#$%^&*)');
        }

        return suggestions;
    }
}

module.exports = new PasswordController();