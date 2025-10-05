/**
 * @fileoverview Direct Business Authentication Service
 * @module servers/customer-services/modules/core-business/authentication/services/direct-auth-service
 * @description Authentication service for users registering directly with your company
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'direct-auth-service'
});
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const validator = require('validator');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');
const OnboardingService = require('../../onboarding/services/onboarding-service');

/**
 * User Type Constants
 */
const DIRECT_USER_TYPES = {
    CLIENT: 'client',
    CONSULTANT: 'consultant',
    CANDIDATE: 'candidate',
    PARTNER: 'partner'
};

/**
 * Registration Source Constants
 */
const REGISTRATION_SOURCES = {
    WEB_CLIENT: 'web_client',
    WEB_CONSULTANT: 'web_consultant',
    WEB_CANDIDATE: 'web_candidate',
    REFERRAL: 'referral',
    LINKEDIN: 'linkedin',
    JOB_BOARD: 'job_board',
    DIRECT_INQUIRY: 'direct_inquiry'
};

/**
 * Direct Business Authentication Service
 * @class DirectAuthService
 */
class DirectAuthService {
    constructor() {
        this._dbService = null;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            requireEmailVerification: process.env.DIRECT_REQUIRE_EMAIL_VERIFICATION !== 'false',
            passwordMinLength: 8,
            maxLoginAttempts: 5,
            sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
            jwtSecret: process.env.JWT_SECRET || 'customer-jwt-secret',
            jwtExpiresIn: '24h',
            refreshTokenExpiresIn: '30d'
        };

        // Service dependencies
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;
        this.onboardingService = OnboardingService;
    }

    /**
     * Get database service instance
     * @private
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getUserDatabaseService();
        }
        return this._dbService;
    }

    /**
     * Get TokenBlacklist model from shared database
     * Models are automatically registered during database initialization
     * @private
     */
    _getTokenBlacklistModel() {
        try {
            // Get the database service instance
            const dbService = database.getDatabaseService();

            // Access the TokenBlacklist model from the shared database
            // The second parameter specifies which database to get the model from
            return dbService.getModel('TokenBlacklist', 'shared');
        } catch (error) {
            logger.error('Failed to get TokenBlacklist model', {
                error: error.message
            });
            throw new AppError('Token blacklist service unavailable', 500);
        }
    }

    /**
     * Hash token for secure storage
     * Uses SHA-256 to create a one-way hash of the token
     * @private
     * @param {string} token - JWT token to hash
     * @returns {string} Hashed token
     */
    _hashToken(token) {
        return crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
    }

    /**
     * Extract expiration date from JWT token
     * @private
     * @param {string} token - JWT token
     * @returns {Date} Expiration date
     */
    _extractTokenExpiration(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                // JWT exp is in seconds, convert to milliseconds
                return new Date(decoded.exp * 1000);
            }
            // Default to 24 hours from now if exp not found
            return new Date(Date.now() + 24 * 60 * 60 * 1000);
        } catch (error) {
            logger.warn('Failed to extract token expiration', {
                error: error.message
            });
            // Default to 24 hours from now
            return new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
    }

    // ============= REGISTRATION =============

    /**
     * Register a new direct user
     * @param {Object} userData - User registration data
     * @param {string} userType - Type of user (client, consultant, candidate, partner)
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     */
    async registerDirectUser(userData, userType, options = {}) {
        try {
            logger.info('Starting direct user registration', {
                email: userData.email,
                userType: userType
            });

            this._validateUserType(userType);
            this._validateRegistrationData(userData, userType);

            const dbService = this._getDatabaseService();

            const existingUser = await dbService.userExists(
                userData.email,
                this.config.companyTenantId
            );

            if (existingUser) {
                throw new AppError('User already exists with this email', 409);
            }

            const userDocument = {
                email: userData.email.toLowerCase(),
                username: userData.username ? userData.username.toLowerCase() : undefined,
                password: userData.password,
                phoneNumber: userData.phoneNumber,
                profile: {
                    firstName: userData.profile?.firstName,
                    lastName: userData.profile?.lastName,
                    middleName: userData.profile?.middleName,
                    displayName: userData.profile?.displayName,
                    title: userData.profile?.title,
                    bio: userData.profile?.bio,
                },
                accountStatus: {
                    status: 'pending',
                    reason: 'Account created - awaiting email verification',
                },
                verification: {
                    email: {
                        verified: false,
                        token: this._generateVerificationToken(),
                        tokenExpires: new Date(Date.now() + 86400000),
                    }
                },
                metadata: {
                    source: this._determineRegistrationSource(userType, options),
                    userType: userType,
                    directBusiness: true,
                    referrer: options.referralCode,
                    campaign: options.utmParams?.campaign,
                    tags: userData.metadata?.tags || [],
                    flags: {
                        isVip: false,
                        isBetaTester: false,
                        ...userData.metadata?.flags
                    }
                },
                customFields: this._getUserTypeSpecificFields(userData, userType)
            };

            const newUser = await dbService.createUser(
                userDocument,
                this.config.companyTenantId
            );

            logger.info('User created successfully', {
                userId: newUser._id || newUser.id,
                email: newUser.email,
                userType: userType
            });

            this._executePostRegistrationWorkflows(newUser, userType, options)
                .catch(error => {
                    logger.error('Post-registration workflows failed (non-blocking)', {
                        error: error.message,
                        userId: newUser._id || newUser.id
                    });
                });

            let onboardingData = null;
            try {
                onboardingData = await this._initializeOnboarding(
                    newUser._id || newUser.id,
                    userType
                );
            } catch (error) {
                logger.error('Onboarding initialization failed (non-blocking)', {
                    error: error.message
                });
            }

            const accessToken = this._generateAccessToken(newUser);
            const refreshToken = this._generateRefreshToken(newUser);

            return {
                user: this._sanitizeUserOutput(newUser),
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                },
                userType: userType,
                onboarding: onboardingData,
                nextSteps: this._getRegistrationNextSteps(userType, newUser),
                dashboardUrl: this._getDashboardUrl(userType),
                requiresAction: !newUser.verification?.email?.verified ? ['VERIFY_EMAIL'] : []
            };

        } catch (error) {
            logger.error('Direct user registration failed', {
                error: error.message,
                stack: error.stack,
                email: userData?.email,
                userType: userType
            });
            throw error;
        }
    }

    // ============= AUTHENTICATION =============

    /**
     * Authenticate direct user with credentials
     * @param {Object} credentials - Login credentials
     * @param {Object} options - Login options
     * @returns {Promise<Object>} Authentication result
     */
    async loginDirectUser(credentials, options = {}) {
        try {
            const { email, password } = credentials;

            logger.info('Starting direct user login', { email });

            const dbService = this._getDatabaseService();

            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                await this._logFailedLogin(email, 'User not found', options);
                throw AppError.unauthorized('Invalid credentials');
            }

            if (user.accountStatus?.status === 'suspended') {
                throw AppError.forbidden('Account is suspended. Please contact support');
            }

            if (user.accountStatus?.status === 'blocked') {
                throw AppError.forbidden('Account is blocked. Please contact support');
            }

            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                if (typeof user.incrementLoginAttempts === 'function') {
                    await user.incrementLoginAttempts();
                }
                await this._logFailedLogin(email, 'Invalid password', options);
                throw AppError.unauthorized('Invalid credentials');
            }

            if (user.mfa?.enabled) {
                const tempToken = this._generateTempToken(user._id || user.id);
                return {
                    requiresMFA: true,
                    tempToken: tempToken,
                    mfaMethods: user.mfa.methods || [],
                    challengeId: this._generateChallengeId()
                };
            }

            if (typeof user.recordLogin === 'function') {
                await user.recordLogin({
                    ip: options.ip,
                    userAgent: options.userAgent,
                    device: options.device,
                    location: options.location
                });
            }

            const accessToken = this._generateAccessToken(user);
            const refreshToken = this._generateRefreshToken(user);

            const userType = this._getUserTypeFromUser(user);

            let userSpecificData = {};
            let pendingNotifications = [];

            try {
                userSpecificData = await this._loadUserSpecificData(
                    user._id || user.id,
                    userType
                );
            } catch (error) {
                logger.error('Failed to load user-specific data', { error: error.message });
            }

            logger.info('Direct user login successful', {
                userId: user._id || user.id,
                email: user.email,
                userType: userType
            });

            return {
                user: this._sanitizeUserOutput(user),
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                },
                userType: userType,
                userSpecificData: userSpecificData,
                pendingNotifications: pendingNotifications,
                dashboardUrl: this._getDashboardUrl(userType),
                features: this._getAvailableFeatures(userType)
            };

        } catch (error) {
            logger.error('Direct user login failed', {
                error: error.message,
                email: credentials?.email
            });
            throw error;
        }
    }

    /**
     * Check if token is blacklisted (Production-Ready)
     * Queries the database to check if token has been invalidated
     * @param {string} token - Access token to check
     * @returns {Promise<boolean>} True if token is blacklisted
     */
    async isTokenBlacklisted(token) {
        try {
            const TokenBlacklist = this._getTokenBlacklistModel();
            const tokenHash = this._hashToken(token);

            const isBlacklisted = await TokenBlacklist.isBlacklisted(tokenHash);

            if (isBlacklisted) {
                logger.debug('Token found in blacklist', {
                    tokenHash: tokenHash.substring(0, 10) + '...'
                });
            }

            return isBlacklisted;
        } catch (error) {
            logger.error('Error checking token blacklist', {
                error: error.message
            });
            // Fail secure: if we cannot check the blacklist, deny access
            return true;
        }
    }

    /**
     * Logout user and invalidate token (Production-Ready)
     * Stores token in database with automatic expiration cleanup
     * @param {string} userId - User ID
     * @param {string} token - Access token to invalidate
     * @param {Object} options - Logout options
     * @returns {Promise<void>}
     */
    async logoutUser(userId, token, options = {}) {
        try {
            logger.info('Logging out user', { userId });

            const TokenBlacklist = this._getTokenBlacklistModel();
            const tokenHash = this._hashToken(token);
            const expiresAt = this._extractTokenExpiration(token);

            // Add token to database blacklist
            await TokenBlacklist.blacklistToken({
                tokenHash: tokenHash,
                userId: userId,
                tenantId: this.config.companyTenantId,
                expiresAt: expiresAt,
                reason: 'logout',
                ipAddress: options.ip,
                userAgent: options.userAgent,
                metadata: {
                    sessionId: options.sessionId,
                    deviceId: options.deviceId,
                    location: options.location
                }
            });

            logger.info('User logged out successfully', {
                userId,
                tokenExpires: expiresAt
            });

        } catch (error) {
            logger.error('Logout failed', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Logout user from all devices (Production-Ready)
     * Blacklists all active tokens for a user
     * @param {string} userId - User ID
     * @param {string} reason - Reason for logout
     * @returns {Promise<number>} Number of tokens blacklisted
     */
    async logoutUserAllDevices(userId, reason = 'logout_all') {
        try {
            logger.info('Logging out user from all devices', { userId, reason });

            const TokenBlacklist = this._getTokenBlacklistModel();

            // In production, you would track active sessions and blacklist all their tokens
            // For now, we record the action
            const result = await TokenBlacklist.blacklistUserTokens(
                userId,
                this.config.companyTenantId,
                reason
            );

            logger.info('User logged out from all devices', {
                userId,
                tokensBlacklisted: result
            });

            return result;

        } catch (error) {
            logger.error('Logout all devices failed', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get user by ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User data
     */
    async getUserById(userId) {
        try {
            const dbService = this._getDatabaseService();

            const user = await dbService.findUserById(userId, this.config.companyTenantId, {
                select: '-password -verification.email.token'
            });

            if (!user) {
                throw new AppError('User not found', 404);
            }

            return this._sanitizeUserOutput(user);
        } catch (error) {
            logger.error('Failed to get user by ID', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Verify email with token
     * @param {string} token - Verification token
     * @param {string} email - User email
     * @returns {Promise<Object>} Verification result
     */
    async verifyEmail(token, email) {
        try {
            logger.info('Verifying email', { email });

            const dbService = this._getDatabaseService();
            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                throw new AppError('User not found', 404);
            }

            if (user.verification?.email?.verified) {
                return {
                    message: 'Email already verified',
                    verified: true
                };
            }

            const storedToken = user.verification?.email?.token;
            const tokenExpires = user.verification?.email?.tokenExpires;

            if (!storedToken || storedToken !== token) {
                throw new AppError('Invalid verification token', 400);
            }

            if (new Date() > new Date(tokenExpires)) {
                throw new AppError('Verification token has expired', 400);
            }

            user.verification.email.verified = true;
            user.verification.email.verifiedAt = new Date();
            user.accountStatus.status = 'active';
            user.accountStatus.reason = 'Email verified';

            await user.save();

            logger.info('Email verified successfully', { userId: user._id || user.id });

            return {
                message: 'Email verified successfully',
                verified: true,
                user: this._sanitizeUserOutput(user)
            };
        } catch (error) {
            logger.error('Email verification failed', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    /**
     * Resend verification email
     * @param {string} email - User email
     * @returns {Promise<void>}
     */
    async resendVerificationEmail(email) {
        try {
            logger.info('Resending verification email', { email });

            const dbService = this._getDatabaseService();
            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                throw new AppError('User not found', 404);
            }

            if (user.verification?.email?.verified) {
                throw new AppError('Email already verified', 400);
            }

            user.verification.email.token = this._generateVerificationToken();
            user.verification.email.tokenExpires = new Date(Date.now() + 86400000);
            user.verification.email.attempts = (user.verification.email.attempts || 0) + 1;

            await user.save();

            await this._sendVerificationEmail(user);

            logger.info('Verification email resent', { userId: user._id || user.id });
        } catch (error) {
            logger.error('Failed to resend verification email', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    /**
     * Initiate password reset
     * @param {string} email - User email
     * @returns {Promise<void>}
     */
    async initiatePasswordReset(email) {
        try {
            logger.info('Initiating password reset', { email });

            const dbService = this._getDatabaseService();
            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                logger.warn('Password reset requested for non-existent user', { email });
                return;
            }

            const resetToken = this._generateVerificationToken();
            const resetExpires = new Date(Date.now() + 3600000);

            user.security = user.security || {};
            user.security.passwordReset = {
                token: resetToken,
                tokenExpires: resetExpires,
                attempts: (user.security.passwordReset?.attempts || 0) + 1
            };

            await user.save();

            await this._sendPasswordResetEmail(user, resetToken);

            logger.info('Password reset initiated', { userId: user._id || user.id });
        } catch (error) {
            logger.error('Failed to initiate password reset', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    /**
     * Reset password with token
     * @param {string} token - Reset token
     * @param {string} newPassword - New password
     * @returns {Promise<void>}
     */
    async resetPassword(token, newPassword) {
        try {
            logger.info('Resetting password');

            const dbService = this._getDatabaseService();
            const User = dbService.getModel('user');

            const user = await User.findOne({
                'security.passwordReset.token': token,
                'security.passwordReset.tokenExpires': { $gt: new Date() }
            });

            if (!user) {
                throw new AppError('Invalid or expired reset token', 400);
            }

            this._validatePassword(newPassword);

            user.password = newPassword;
            user.security.passwordReset = undefined;

            await user.save();

            // Blacklist all existing tokens for security
            await this.logoutUserAllDevices(user._id.toString(), 'password_reset');

            logger.info('Password reset successfully', { userId: user._id || user.id });
        } catch (error) {
            logger.error('Password reset failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Change password for authenticated user (Enhanced with Debugging)
     * @param {string} userId - User ID
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<void>}
     */
    async changePassword(userId, currentPassword, newPassword, currentToken = null) {
        try {
            logger.info('Changing password', { userId });

            const dbService = this._getDatabaseService();
            const User = dbService.getModel('User', 'customer');

            const user = await User.findOne({
                _id: userId,
                tenantId: this.config.companyTenantId,
                'accountStatus.status': { $ne: 'deleted' }
            }).select('+password');

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            if (!user.password) {
                logger.error('Password field is empty or not retrieved', {
                    userId,
                    userFields: Object.keys(user.toObject())
                });
                throw new AppError('User password not found. Please contact support.', 500);
            }

            const isCurrentPasswordValid = await user.comparePassword(currentPassword);

            if (!isCurrentPasswordValid) {
                throw new AppError('Current password is incorrect', 401);
            }

            this._validatePassword(newPassword);

            user.password = newPassword;
            await user.save();

            logger.info('Password changed successfully', { userId });

            // Blacklist the current token immediately
            if (currentToken) {
                try {
                    await this.logoutUser(userId, currentToken, {
                        reason: 'password_change',
                        immediate: true
                    });
                    logger.info('Current token blacklisted', { userId });
                } catch (error) {
                    logger.error('Failed to blacklist current token', {
                        error: error.message,
                        userId
                    });
                }
            }

            // Blacklist all other existing tokens for security
            try {
                await this.logoutUserAllDevices(userId, 'password_change');
            } catch (error) {
                logger.warn('Failed to blacklist all tokens after password change', {
                    error: error.message,
                    userId
                });
            }

        } catch (error) {
            logger.error('Password change failed', {
                error: error.message,
                userId,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Refresh access token with complete token rotation security
     * @param {string} refreshToken - Refresh token
     * @param {string} oldAccessToken - Old access token to invalidate (optional but recommended)
     * @returns {Promise<Object>} New tokens
     */
    async refreshAccessToken(refreshToken, oldAccessToken = null) {
        try {
            logger.info('Refreshing access token');

            const decoded = jwt.verify(refreshToken, this.config.jwtSecret);

            if (decoded.type !== 'refresh') {
                throw new AppError('Invalid token type', 401);
            }

            // Check if refresh token is blacklisted
            const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
            if (isBlacklisted) {
                throw new AppError('Refresh token has been revoked', 401);
            }

            const user = await this.getUserById(decoded.userId);

            const newAccessToken = this._generateAccessToken(user);
            const newRefreshToken = this._generateRefreshToken(user);

            // Blacklist the old refresh token
            await this.logoutUser(decoded.userId, refreshToken, {
                reason: 'token_refresh'
            });

            // SECURITY FIX: Also blacklist the old access token if provided
            // This ensures that after token rotation, only the new tokens are valid
            if (oldAccessToken) {
                try {
                    // Verify the old access token belongs to the same user before blacklisting
                    const oldDecoded = jwt.decode(oldAccessToken);
                    if (oldDecoded && oldDecoded.userId === decoded.userId) {
                        await this.logoutUser(decoded.userId, oldAccessToken, {
                            reason: 'token_refresh_access'
                        });
                        logger.info('Old access token blacklisted during refresh', {
                            userId: decoded.userId
                        });
                    } else {
                        logger.warn('Old access token user mismatch during refresh', {
                            userId: decoded.userId
                        });
                    }
                } catch (error) {
                    // Log but do not fail the refresh if old access token blacklisting fails
                    // This maintains backward compatibility with clients that do not send the old token
                    logger.warn('Failed to blacklist old access token during refresh', {
                        userId: decoded.userId,
                        error: error.message
                    });
                }
            } else {
                logger.warn('Token refresh performed without old access token - security gap exists', {
                    userId: decoded.userId
                });
            }

            logger.info('Access token refreshed', { userId: decoded.userId });

            return {
                tokens: {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                }
            };
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                throw new AppError('Invalid or expired refresh token', 401);
            }
            logger.error('Token refresh failed', { error: error.message });
            throw error;
        }
    }

    // ============= VALIDATION METHODS =============

    _validateUserType(userType) {
        const validTypes = Object.values(DIRECT_USER_TYPES);
        if (!validTypes.includes(userType.toLowerCase())) {
            throw new AppError(
                `Invalid user type. Must be one of: ${validTypes.join(', ')}`,
                400
            );
        }
    }

    _validateRegistrationData(userData, userType) {
        const errors = [];

        if (!userData.email) {
            errors.push('Email is required');
        } else if (!validator.isEmail(userData.email)) {
            errors.push('Invalid email format');
        }

        if (!userData.password) {
            errors.push('Password is required');
        } else {
            this._validatePassword(userData.password, errors);
        }

        if (!userData.profile?.firstName) {
            errors.push('First name is required');
        }

        if (!userData.profile?.lastName) {
            errors.push('Last name is required');
        }

        if (errors.length > 0) {
            throw AppError.validation('Validation failed', errors);
        }
    }

    _validatePassword(password, errors = []) {
        if (password.length < this.config.passwordMinLength) {
            errors.push(`Password must be at least ${this.config.passwordMinLength} characters`);
        }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(password)) {
            errors.push('Password must contain uppercase, lowercase, number, and special character');
        }

        if (errors.length > 0) {
            throw AppError.validation('Password validation failed', errors);
        }
    }

    // ============= HELPER METHODS =============

    _getUserTypeSpecificFields(userData, userType) {
        const specificFields = {};

        switch (userType) {
            case DIRECT_USER_TYPES.CLIENT:
                specificFields.companyName = userData.companyName;
                specificFields.businessType = userData.businessType;
                specificFields.industry = userData.industry;
                break;
            case DIRECT_USER_TYPES.CONSULTANT:
                specificFields.expertise = userData.expertise;
                specificFields.yearsOfExperience = userData.yearsOfExperience;
                break;
            case DIRECT_USER_TYPES.CANDIDATE:
                specificFields.skills = userData.skills;
                specificFields.jobInterest = userData.jobInterest;
                break;
            case DIRECT_USER_TYPES.PARTNER:
                specificFields.organizationName = userData.organizationName;
                specificFields.partnerType = userData.partnerType;
                break;
        }

        return specificFields;
    }

    _determineRegistrationSource(userType, options) {
        if (options.referralCode) return REGISTRATION_SOURCES.REFERRAL;

        const sourceMap = {
            [DIRECT_USER_TYPES.CLIENT]: REGISTRATION_SOURCES.WEB_CLIENT,
            [DIRECT_USER_TYPES.CONSULTANT]: REGISTRATION_SOURCES.WEB_CONSULTANT,
            [DIRECT_USER_TYPES.CANDIDATE]: REGISTRATION_SOURCES.WEB_CANDIDATE,
        };

        return sourceMap[userType] || REGISTRATION_SOURCES.DIRECT_INQUIRY;
    }

    _getUserTypeFromUser(user) {
        return user.metadata?.userType ||
            user.customFields?.userType ||
            DIRECT_USER_TYPES.CLIENT;
    }

    _getRegistrationNextSteps(userType, user) {
        const steps = [];

        if (!user.verification?.email?.verified) {
            steps.push({
                action: 'VERIFY_EMAIL',
                message: 'Please verify your email address',
                priority: 'high'
            });
        }

        steps.push({
            action: 'COMPLETE_PROFILE',
            message: 'Complete your profile to get started',
            priority: 'medium'
        });

        return steps;
    }

    _getDashboardUrl(userType) {
        const baseUrl = this.config.platformUrl;
        const dashboardMap = {
            [DIRECT_USER_TYPES.CLIENT]: `${baseUrl}/client/dashboard`,
            [DIRECT_USER_TYPES.CONSULTANT]: `${baseUrl}/consultant/dashboard`,
            [DIRECT_USER_TYPES.CANDIDATE]: `${baseUrl}/candidate/dashboard`,
            [DIRECT_USER_TYPES.PARTNER]: `${baseUrl}/partner/dashboard`,
        };
        return dashboardMap[userType] || `${baseUrl}/dashboard`;
    }

    _getAvailableFeatures(userType) {
        return {
            messaging: true,
            notifications: true,
            profile: true,
            settings: true
        };
    }

    async _loadUserSpecificData(userId, userType) {
        return { userType };
    }

    // ============= POST-REGISTRATION WORKFLOWS =============

    async _executePostRegistrationWorkflows(user, userType, options) {
        try {
            await this._sendWelcomeEmail(user, userType);
            await this._trackRegistrationEvent(user, userType, options);

            if (options.referralCode) {
                await this._processReferral(user._id || user.id, options.referralCode, userType);
            }
        } catch (error) {
            logger.error('Post-registration workflows failed', {
                error: error.message,
                userId: user._id || user.id
            });
        }
    }

    async _sendWelcomeEmail(user, userType) {
        try {
            if (typeof this.notificationService.sendEmail === 'function') {
                await this.notificationService.sendEmail({
                    to: user.email,
                    template: `welcome-${userType}`,
                    data: {
                        firstName: user.profile?.firstName || 'User',
                        userType: userType,
                        platformUrl: this.config.platformUrl
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send welcome email', { error: error.message });
        }
    }

    async _sendVerificationEmail(user) {
        try {
            if (typeof this.notificationService.sendEmail === 'function') {
                await this.notificationService.sendEmail({
                    to: user.email,
                    template: 'email-verification',
                    data: {
                        firstName: user.profile?.firstName || 'User',
                        verificationLink: `${this.config.platformUrl}/verify-email?token=${user.verification.email.token}`,
                        token: user.verification.email.token
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send verification email', { error: error.message });
        }
    }

    async _sendPasswordResetEmail(user, resetToken) {
        try {
            if (typeof this.notificationService.sendEmail === 'function') {
                await this.notificationService.sendEmail({
                    to: user.email,
                    template: 'password-reset',
                    data: {
                        firstName: user.profile?.firstName || 'User',
                        resetLink: `${this.config.platformUrl}/reset-password?token=${resetToken}`,
                        token: resetToken
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send password reset email', { error: error.message });
        }
    }

    async _trackRegistrationEvent(user, userType, options) {
        try {
            if (typeof this.analyticsService.track === 'function') {
                await this.analyticsService.track({
                    event: 'user_registered',
                    userId: user._id || user.id,
                    properties: {
                        userType: userType,
                        email: user.email,
                        source: options.marketingSource || 'direct'
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to track registration event', { error: error.message });
        }
    }

    async _processReferral(userId, referralCode, userType) {
        logger.info('Processing referral', { userId, referralCode, userType });
    }

    async _initializeOnboarding(userId, userType) {
        try {
            if (typeof this.onboardingService.createOnboarding === 'function') {
                return await this.onboardingService.createOnboarding({
                    userId: userId,
                    type: userType,
                    context: 'direct_business'
                });
            }
        } catch (error) {
            logger.error('Failed to initialize onboarding', { error: error.message });
        }
        return null;
    }

    // ============= UTILITY METHODS =============

    _generateVerificationToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    _generateAccessToken(user) {
        return jwt.sign(
            {
                id: user._id || user.id,
                userId: user._id || user.id,
                email: user.email,
                tenantId: this.config.companyTenantId
            },
            this.config.jwtSecret,
            { expiresIn: this.config.jwtExpiresIn }
        );
    }

    _generateRefreshToken(user) {
        return jwt.sign(
            {
                userId: user._id || user.id,
                type: 'refresh'
            },
            this.config.jwtSecret,
            { expiresIn: this.config.refreshTokenExpiresIn }
        );
    }

    _generateTempToken(userId) {
        return jwt.sign(
            { userId, type: 'temp' },
            this.config.jwtSecret,
            { expiresIn: '5m' }
        );
    }

    _generateChallengeId() {
        return crypto.randomBytes(16).toString('hex');
    }

    _sanitizeUserOutput(user) {
        if (!user) return null;
        if (user.toSafeJSON) return user.toSafeJSON();

        const userObject = user.toObject ? user.toObject() : user;

        delete userObject.password;
        delete userObject.passwordHistory;
        delete userObject.security?.passwordReset;
        delete userObject.verification?.email?.token;
        delete userObject.__v;

        return userObject;
    }

    async _logFailedLogin(email, reason, options) {
        logger.warn('Failed login attempt', {
            email,
            reason,
            ip: options.ip,
            userAgent: options.userAgent
        });
    }
}

module.exports = new DirectAuthService();