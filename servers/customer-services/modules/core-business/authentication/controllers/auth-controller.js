/**
 * @fileoverview Authentication Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/auth-controller
 */

const directAuthService = require('../services/direct-auth-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const { validationResult } = require('express-validator');

class AuthController {
    /**
     * Register a new user
     * POST /api/auth/register
     */
    async registerUser(req, res, next) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(AppError.validation('Validation failed', errors.array()));
            }

            const {
                email,
                username,
                password,
                phoneNumber,
                profile,
                userType = 'client',
                companyName,
                businessType,
                industry,
                expertise,
                yearsOfExperience,
                skills,
                jobInterest,
                organizationName,
                partnerType
            } = req.body;

            // Prepare user data
            const userData = {
                email,
                username,
                password,
                phoneNumber,
                profile,
                // User-type-specific fields
                companyName,
                businessType,
                industry,
                expertise,
                yearsOfExperience,
                skills,
                jobInterest,
                organizationName,
                partnerType
            };

            // Registration options
            const options = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                referralCode: req.body.referralCode,
                utmParams: req.body.utmParams,
                marketingSource: req.body.marketingSource
            };

            // Call service
            const result = await directAuthService.registerDirectUser(
                userData,
                userType,
                options
            );

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: result
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Login user
     * POST /api/auth/login
     */
    async loginUser(req, res, next) {
        try {
            const { email, username, password } = req.body;

            if (!password || (!email && !username)) {
                return next(
                    new AppError('Email/username and password are required', 400)
                );
            }

            const credentials = {
                email: email || username,
                password
            };

            const options = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                device: req.body.device,
                location: req.body.location
            };

            const result = await directAuthService.loginDirectUser(credentials, options);

            // Handle MFA challenge
            if (result.requiresMFA) {
                return res.status(200).json({
                    success: true,
                    requiresMFA: true,
                    data: {
                        tempToken: result.tempToken,
                        mfaMethods: result.mfaMethods,
                        challengeId: result.challengeId
                    }
                });
            }

            // Set refresh token as HTTP-only cookie
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                });
            }

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: result
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Logout user
     * POST /api/auth/logout
     */
    async logoutUser(req, res, next) {
        try {
            // Clear refresh token cookie
            res.clearCookie('refreshToken');

            res.status(200).json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get current user
     * GET /api/auth/me
     */
    async getCurrentUser(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            // User is already loaded by auth middleware
            res.status(200).json({
                success: true,
                data: {
                    user: req.user
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Verify email
     * POST /api/auth/verify-email
     */
    async verifyEmail(req, res, next) {
        try {
            const { token, email } = req.body;

            if (!token) {
                return next(new AppError('Verification token is required', 400));
            }

            // TODO: Implement email verification logic
            // This would typically be in a separate verification service

            res.status(200).json({
                success: true,
                message: 'Email verified successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Resend verification email
     * POST /api/auth/resend-verification
     */
    async resendVerification(req, res, next) {
        try {
            const { email } = req.body;

            if (!email) {
                return next(new AppError('Email is required', 400));
            }

            // TODO: Implement resend verification logic

            res.status(200).json({
                success: true,
                message: 'Verification email sent successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Forgot password
     * POST /api/auth/forgot-password
     */
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;

            if (!email) {
                return next(new AppError('Email is required', 400));
            }

            // TODO: Implement forgot password logic

            res.status(200).json({
                success: true,
                message: 'Password reset instructions sent to your email'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Reset password
     * POST /api/auth/reset-password
     */
    async resetPassword(req, res, next) {
        try {
            const { token, newPassword, confirmPassword } = req.body;

            if (!token || !newPassword) {
                return next(
                    new AppError('Token and new password are required', 400)
                );
            }

            if (newPassword !== confirmPassword) {
                return next(new AppError('Passwords do not match', 400));
            }

            // TODO: Implement reset password logic

            res.status(200).json({
                success: true,
                message: 'Password reset successful'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Change password
     * POST /api/auth/change-password
     */
    async changePassword(req, res, next) {
        try {
            const { currentPassword, newPassword, confirmPassword } = req.body;

            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            if (!currentPassword || !newPassword) {
                return next(
                    new AppError('Current and new password are required', 400)
                );
            }

            if (newPassword !== confirmPassword) {
                return next(new AppError('Passwords do not match', 400));
            }

            // TODO: Implement change password logic

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Refresh access token
     * POST /api/auth/refresh
     */
    async refreshToken(req, res, next) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (!refreshToken) {
                return next(new AppError('Refresh token is required', 400));
            }

            // TODO: Implement refresh token logic

            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    accessToken: 'new-access-token',
                    expiresIn: 86400
                }
            });

        } catch (error) {
            next(error);
        }
    }
}

// Export singleton instance (same pattern as user-controller)
module.exports = new AuthController();