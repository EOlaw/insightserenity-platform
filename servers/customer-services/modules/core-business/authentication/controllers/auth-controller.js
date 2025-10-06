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

            const userData = {
                email,
                username,
                password,
                phoneNumber,
                profile,
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

            const options = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                referralCode: req.body.referralCode,
                utmParams: req.body.utmParams,
                marketingSource: req.body.marketingSource
            };

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

            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 24 * 60 * 60 * 1000
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
     * Logout user (Production-Ready)
     * POST /api/auth/logout
     * Invalidates both access and refresh tokens in database
     */
    async logoutUser(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            // Extract access token from Authorization header
            const accessToken = req.headers.authorization?.replace('Bearer ', '');

            // Extract refresh token from cookie or body (safely handle undefined body)
            const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

            // Build logout options with context (safely access body properties)
            const logoutOptions = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                sessionId: req.body?.sessionId,
                deviceId: req.body?.deviceId,
                location: req.body?.location
            };

            // Blacklist access token if present
            if (accessToken) {
                await directAuthService.logoutUser(
                    req.user.id,
                    accessToken,
                    logoutOptions
                );
            }

            // Blacklist refresh token if present
            if (refreshToken) {
                await directAuthService.logoutUser(
                    req.user.id,
                    refreshToken,
                    { ...logoutOptions, reason: 'logout_refresh' }
                );
            }

            // Clear refresh token cookie
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            res.status(200).json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Logout from all devices (Production-Ready)
     * POST /api/auth/logout-all
     * Invalidates all active tokens for the user
     */
    async logoutAllDevices(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            // Extract current tokens to blacklist them first
            const accessToken = req.headers.authorization?.replace('Bearer ', '');
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            const logoutOptions = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };

            // Blacklist current tokens
            if (accessToken) {
                await directAuthService.logoutUser(
                    req.user.id,
                    accessToken,
                    logoutOptions
                );
            }

            if (refreshToken) {
                await directAuthService.logoutUser(
                    req.user.id,
                    refreshToken,
                    logoutOptions
                );
            }

            // Blacklist all other tokens
            const tokensBlacklisted = await directAuthService.logoutUserAllDevices(
                req.user.id,
                'logout_all_devices'
            );

            // Clear refresh token cookie
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            res.status(200).json({
                success: true,
                message: 'Logged out from all devices successfully',
                data: {
                    tokensInvalidated: tokensBlacklisted
                }
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

            const userData = await directAuthService.getUserById(req.user.id);

            if (!userData) {
                return next(new AppError('User not found', 404));
            }

            res.status(200).json({
                success: true,
                data: {
                    user: userData
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

            const result = await directAuthService.verifyEmail(token, email);

            res.status(200).json({
                success: true,
                message: 'Email verified successfully',
                data: result
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

            await directAuthService.resendVerificationEmail(email);

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

            await directAuthService.initiatePasswordReset(email);

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

            await directAuthService.resetPassword(token, newPassword);

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

            await directAuthService.changePassword(
                req.user.id,
                currentPassword,
                newPassword
            );

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Refresh access token (Production-Ready with Token Rotation Security)
     * POST /api/auth/refresh
     * Implements complete token rotation - invalidates both old access and refresh tokens
     */
    async refreshToken(req, res, next) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            // Extract the old access token from Authorization header
            const oldAccessToken = req.headers.authorization?.replace('Bearer ', '');

            if (!refreshToken) {
                return next(new AppError('Refresh token is required', 400));
            }

            // Pass both tokens to the service for proper rotation
            const result = await directAuthService.refreshAccessToken(
                refreshToken,
                oldAccessToken
            );

            // Set new refresh token cookie (token rotation)
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 24 * 60 * 60 * 1000
                });
            }

            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully',
                data: result
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();