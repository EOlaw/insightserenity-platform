/**
 * @fileoverview Authentication Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/auth-controller
 * @description Handles HTTP requests for authentication operations (register, login, logout, etc.)
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CustomerAuthService = require('../services/direct-auth-service');
const AuthResponseDto = require('../dto/auth-response.dto');
const UserResponseDto = require('../dto/user-response.dto');

/**
 * Authentication Controller
 * Handles all authentication-related HTTP requests
 * @class AuthController
 */
class AuthController {
    /**
     * Register a new customer
     * @route POST /api/auth/register
     * @access Public
     */
    async registerUser(req, res, next) {
        try {
            const { email, password, firstName, lastName, phoneNumber, companyName, customerType, emailOptIn, smsOptIn } = req.body;
            const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;

            // Validate required fields
            if (!email || !password) {
                throw new AppError('Email and password are required', 400, 'MISSING_REQUIRED_FIELDS');
            }

            if (!tenantId) {
                throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
            }

            // Prepare user data
            const userData = {
                email,
                password,
                profile: {
                    firstName,
                    lastName,
                    phoneNumber
                },
                companyName,
                customerType,
                emailOptIn,
                smsOptIn
            };

            // Prepare registration options
            const options = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                deviceFingerprint: req.headers['x-device-fingerprint'],
                referralCode: req.body.referralCode || req.query.ref,
                marketingSource: req.body.marketingSource || req.query.source,
                utmParams: {
                    source: req.query.utm_source,
                    medium: req.query.utm_medium,
                    campaign: req.query.utm_campaign,
                    term: req.query.utm_term,
                    content: req.query.utm_content
                }
            };

            // Call customer auth service
            const result = await CustomerAuthService.registerCustomer(userData, tenantId, options);

            // Format response using DTO
            const response = AuthResponseDto.formatRegistrationResponse(result);

            logger.info('User registration successful', {
                userId: result.user.id,
                email: result.user.email,
                tenantId
            });

            res.status(201).json({
                success: true,
                message: 'Registration successful',
                data: response
            });

        } catch (error) {
            logger.error('User registration failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Login with credentials
     * @route POST /api/auth/login
     * @access Public
     */
    async loginUser(req, res, next) {
        try {
            const { email, password, mfaCode, rememberMe } = req.body;
            const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;

            // Validate required fields
            if (!email || !password) {
                throw new AppError('Email and password are required', 400, 'MISSING_CREDENTIALS');
            }

            if (!tenantId) {
                throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
            }

            // Prepare credentials
            const credentials = {
                email,
                password,
                mfaCode,
                rememberMe: rememberMe || false
            };

            // Prepare login options
            const options = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                deviceFingerprint: req.headers['x-device-fingerprint']
            };

            // Call customer auth service
            const result = await CustomerAuthService.loginCustomer(credentials, tenantId, options);

            // Check if MFA is required
            if (result.requiresMFA) {
                logger.info('MFA challenge required', {
                    email,
                    tenantId,
                    mfaMethods: result.mfaMethods
                });

                return res.status(200).json({
                    success: true,
                    requiresMFA: true,
                    message: 'MFA verification required',
                    data: {
                        challengeId: result.challengeId,
                        mfaMethods: result.mfaMethods,
                        preferredMethod: result.preferredMethod
                    }
                });
            }

            // Format successful login response
            const response = AuthResponseDto.formatLoginResponse(result);

            // Set HTTP-only cookie for refresh token if available
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                });
            }

            logger.info('User login successful', {
                userId: result.user.id,
                email: result.user.email,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: response
            });

        } catch (error) {
            logger.error('User login failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Logout current session
     * @route POST /api/auth/logout
     * @access Protected
     */
    async logoutUser(req, res, next) {
        try {
            const userId = req.user.id;
            const sessionId = req.session.id || req.headers['x-session-id'];

            if (!sessionId) {
                throw new AppError('Session ID not found', 400, 'MISSING_SESSION_ID');
            }

            // Prepare logout options
            const options = {
                logoutAll: false
            };

            // Call customer auth service
            await CustomerAuthService.logoutCustomer(userId, sessionId, options);

            // Clear refresh token cookie
            res.clearCookie('refreshToken');

            logger.info('User logout successful', {
                userId,
                sessionId
            });

            res.status(200).json({
                success: true,
                message: 'Logout successful',
                data: null
            });

        } catch (error) {
            logger.error('User logout failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Logout all sessions
     * @route POST /api/auth/logout-all
     * @access Protected
     */
    async logoutAllSessions(req, res, next) {
        try {
            const userId = req.user.id;
            const currentSessionId = req.session.id || req.headers['x-session-id'];

            // Prepare logout options
            const options = {
                logoutAll: true,
                excludeCurrentSession: false
            };

            // Call customer auth service
            await CustomerAuthService.logoutCustomer(userId, currentSessionId, options);

            // Clear refresh token cookie
            res.clearCookie('refreshToken');

            logger.info('All sessions logout successful', {
                userId
            });

            res.status(200).json({
                success: true,
                message: 'All sessions logged out successfully',
                data: null
            });

        } catch (error) {
            logger.error('Logout all sessions failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Refresh access token
     * @route POST /api/auth/refresh
     * @access Public (requires refresh token)
     */
    async refreshAccessToken(req, res, next) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
            const tenantId = req.headers['x-tenant-id'];

            if (!refreshToken) {
                throw new AppError('Refresh token is required', 400, 'MISSING_REFRESH_TOKEN');
            }

            // Call shared auth service directly for token refresh
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            const result = await AuthService.refreshToken(refreshToken, tenantId);

            // Update refresh token cookie if new one issued
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
            }

            logger.info('Token refresh successful', {
                userId: result.user.id
            });

            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    accessToken: result.tokens.accessToken,
                    expiresIn: result.tokens.expiresIn,
                    user: UserResponseDto.format(result.user)
                }
            });

        } catch (error) {
            logger.error('Token refresh failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get current authenticated user
     * @route GET /api/auth/me
     * @access Protected
     */
    async getCurrentUser(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Get user profile from service
            const UserService = require('../../user-management/services/user-service');
            const user = await UserService.getUserById(userId, tenantId);

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            // Format user response
            const response = UserResponseDto.format(user);

            logger.debug('Current user retrieved', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'User retrieved successfully',
                data: response
            });

        } catch (error) {
            logger.error('Get current user failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Verify email address
     * @route POST /api/auth/verify-email
     * @access Public
     */
    async verifyEmail(req, res, next) {
        try {
            const { token, email } = req.body;

            if (!token) {
                throw new AppError('Verification token is required', 400, 'MISSING_TOKEN');
            }

            // Call shared auth service for email verification
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            const result = await AuthService.verifyEmail(token, email);

            logger.info('Email verification successful', {
                email: result.email
            });

            res.status(200).json({
                success: true,
                message: 'Email verified successfully',
                data: {
                    email: result.email,
                    verified: true
                }
            });

        } catch (error) {
            logger.error('Email verification failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Resend email verification
     * @route POST /api/auth/resend-verification
     * @access Public
     */
    async resendEmailVerification(req, res, next) {
        try {
            const { email } = req.body;
            const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;

            if (!email) {
                throw new AppError('Email is required', 400, 'MISSING_EMAIL');
            }

            // Call shared auth service to resend verification
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            await AuthService.resendEmailVerification(email, tenantId);

            logger.info('Verification email resent', {
                email,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Verification email sent successfully',
                data: {
                    email: email,
                    message: 'Please check your email for the verification link'
                }
            });

        } catch (error) {
            logger.error('Resend verification failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

// Export singleton instance
module.exports = new AuthController();