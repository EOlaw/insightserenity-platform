'use strict';

/**
 * @fileoverview Enterprise user authentication service with multi-factor authentication, SSO, OAuth, and advanced security features
 * @module shared/lib/services/user-management/user-auth-service
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/users/user-model
 * @requires module:shared/lib/database/models/users/user-session-model
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const logger = require('../../utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../utils/app-error');
const { asyncHandler } = require('../../utils/async-handler');
const CacheService = require('../cache-service');
const EmailService = require('../email-service');
const NotificationService = require('../notification-service');
const AuditService = require('../../security/audit/audit-service');
const UserModel = require('../../database/models/users/user-model');
const UserSessionModel = require('../../database/models/users/user-session-model');

/**
 * Enterprise authentication service for comprehensive user authentication and security
 * @class UserAuthService
 * @description Manages authentication, MFA, SSO, OAuth, sessions, and security challenges
 */
class UserAuthService {
    /**
     * @private
     * @type {CacheService}
     */
    #cacheService;

    /**
     * @private
     * @type {EmailService}
     */
    #emailService;

    /**
     * @private
     * @type {NotificationService}
     */
    #notificationService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {Object}
     */
    #jwtConfig = {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        resetTokenExpiry: '1h',
        verificationTokenExpiry: '24h'
    };

    /**
     * @private
     * @type {Object}
     */
    #securityConfig = {
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        passwordResetExpiry: 3600000, // 1 hour
        mfaCodeExpiry: 300000, // 5 minutes
        sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
        deviceTrustDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxConcurrentSessions: 5
    };

    /**
     * @private
     * @type {Map}
     */
    #activeSessions = new Map();

    /**
     * @private
     * @type {Map}
     */
    #mfaCodes = new Map();

    /**
     * @private
     * @type {Map}
     */
    #trustedDevices = new Map();

    /**
     * @private
     * @type {Set}
     */
    #blacklistedTokens = new Set();

    /**
     * @private
     * @type {Object}
     */
    #riskFactors = {
        newDevice: 20,
        newLocation: 15,
        unusualTime: 10,
        vpnDetected: 25,
        multipleFailedAttempts: 30,
        suspiciousUserAgent: 15
    };

    /**
     * @private
     * @type {Map}
     */
    #oauthProviders = new Map();

    /**
     * @private
     * @type {Map}
     */
    #ssoProviders = new Map();

    /**
     * @private
     * @type {Object}
     */
    #biometricConfig = {
        enabled: true,
        timeout: 60000, // 1 minute
        allowFallback: true,
        requireLiveness: false
    };

    /**
     * Creates an instance of UserAuthService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     * @param {CacheService} dependencies.cacheService - Cache service instance
     * @param {EmailService} dependencies.emailService - Email service instance
     * @param {NotificationService} dependencies.notificationService - Notification service instance
     * @param {AuditService} dependencies.auditService - Audit service instance
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing UserAuthService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService
        });

        this.#initializeProviders();
        this.#setupCleanupIntervals();
    }

    // ==================== PUBLIC METHODS ====================

    /**
     * Authenticate user with email/username and password
     * @param {Object} credentials - Login credentials
     * @param {Object} deviceInfo - Device and request information
     * @param {Object} options - Authentication options
     * @returns {Promise<Object>} Authentication result
     */
    async authenticate(credentials, deviceInfo, options = {}) {
        const { email, username, password } = credentials;
        const {
            ipAddress,
            userAgent,
            deviceId,
            location,
            rememberDevice = false,
            bypassMfa = false
        } = deviceInfo;

        try {
            // Rate limiting check
            await this.#checkRateLimit(email || username, ipAddress);

            // Find user by credentials
            const user = await UserModel.findByCredentials(email || username, password);

            // Calculate risk score
            const riskScore = await this.#calculateRiskScore(user, deviceInfo);

            // Check if MFA is required
            const requiresMfa = user.mfa.enabled && !bypassMfa && riskScore > 30;

            // Create session
            const sessionData = await this.#createUserSession(user, deviceInfo, {
                riskScore,
                requiresMfa
            });

            // Generate tokens
            const tokens = await this.#generateTokens(user, sessionData.sessionId);

            // Record login activity
            await user.recordLogin({
                ipAddress,
                userAgent,
                location: await this.#getLocationFromIP(ipAddress),
                sessionId: sessionData.sessionId,
                authMethod: 'password',
                success: true
            });

            // Send security notifications if high risk
            if (riskScore > 50) {
                await this.#sendSecurityAlert(user, deviceInfo, riskScore);
            }

            // Trust device if requested and MFA verified
            if (rememberDevice && !requiresMfa) {
                await this.#trustDevice(user._id, deviceInfo);
            }

            // Log successful authentication
            await this.#auditService.log({
                action: 'USER_AUTHENTICATED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    authMethod: 'password',
                    riskScore,
                    requiresMfa,
                    ipAddress,
                    deviceId
                }
            });

            logger.info('User authenticated successfully', {
                userId: user._id,
                email: user.email,
                riskScore,
                requiresMfa,
                ipAddress
            });

            const authResult = {
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    profile: user.profile,
                    roles: user.organizations.flatMap(org => org.roles)
                },
                tokens: requiresMfa ? { tempToken: tokens.tempToken } : tokens,
                session: {
                    sessionId: sessionData.sessionId,
                    expiresAt: sessionData.expiresAt
                },
                security: {
                    riskScore,
                    requiresMfa,
                    trustedDevice: this.#isTrustedDevice(user._id, deviceId)
                }
            };

            if (requiresMfa) {
                authResult.nextStep = 'MFA_REQUIRED';
                authResult.mfaMethods = user.mfa.methods.filter(m => m.enabled).map(m => m.type);
            }

            return authResult;
        } catch (error) {
            // Record failed login attempt
            if (error.code !== 'RATE_LIMIT_EXCEEDED') {
                await this.#recordFailedLogin(email || username, deviceInfo, error.message);
            }

            logger.error('Authentication failed', {
                error: error.message,
                credential: email || username,
                ipAddress
            });

            throw error;
        }
    }

    /**
     * Verify multi-factor authentication code
     * @param {string} tempToken - Temporary token from initial auth
     * @param {string} mfaCode - MFA verification code
     * @param {string} method - MFA method used
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - Verification options
     * @returns {Promise<Object>} MFA verification result
     */
    async verifyMFA(tempToken, mfaCode, method, deviceInfo, options = {}) {
        const { rememberDevice = false, backupCode = false } = options;

        try {
            // Verify temporary token
            const tokenData = await this.#verifyToken(tempToken, 'temp');
            const userId = tokenData.userId;

            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Find MFA method
            const mfaMethod = user.mfa.methods.find(m => m.type === method && m.enabled);
            if (!mfaMethod) {
                throw new ValidationError('Invalid MFA method', 'INVALID_MFA_METHOD');
            }

            let verificationResult = false;

            if (backupCode) {
                // Verify backup code
                verificationResult = await this.#verifyBackupCode(user, mfaCode);
            } else {
                // Verify MFA code based on method
                verificationResult = await this.#verifyMFACode(mfaMethod, mfaCode);
            }

            if (!verificationResult) {
                await this.#recordFailedMFA(userId, method, deviceInfo);
                throw new ValidationError('Invalid MFA code', 'INVALID_MFA_CODE');
            }

            // Update session to mark MFA as verified
            const session = await UserSessionModel.findOne({
                userId,
                status: 'active',
                'settings.requireMfa': true
            });

            if (session) {
                await session.verifyMfa();
            }

            // Generate full access tokens
            const tokens = await this.#generateTokens(user, session.sessionId);

            // Trust device if requested
            if (rememberDevice) {
                await this.#trustDevice(userId, deviceInfo);
            }

            // Update MFA usage tracking
            mfaMethod.lastUsedAt = new Date();
            user.mfa.lastUsedMethod = method;
            user.mfa.lastUsedAt = new Date();
            await user.save();

            // Log successful MFA verification
            await this.#auditService.log({
                action: 'MFA_VERIFIED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    method,
                    backupCode,
                    deviceId: deviceInfo.deviceId
                }
            });

            logger.info('MFA verified successfully', {
                userId,
                method,
                backupCode,
                deviceId: deviceInfo.deviceId
            });

            return {
                success: true,
                tokens,
                user: {
                    id: user._id,
                    email: user.email,
                    profile: user.profile
                },
                trustedDevice: rememberDevice
            };
        } catch (error) {
            logger.error('MFA verification failed', {
                error: error.message,
                method,
                deviceInfo: deviceInfo.deviceId
            });
            throw error;
        }
    }

    /**
     * Setup multi-factor authentication for user
     * @param {string} userId - User ID
     * @param {string} method - MFA method to setup
     * @param {Object} options - Setup options
     * @returns {Promise<Object>} MFA setup result
     */
    async setupMFA(userId, method, options = {}) {
        const { label, issuer = 'Enterprise App' } = options;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Check if method already exists
            const existingMethod = user.mfa.methods.find(m => m.type === method);
            if (existingMethod && existingMethod.enabled) {
                throw new ConflictError('MFA method already enabled', 'MFA_METHOD_EXISTS');
            }

            let setupResult = {};

            switch (method) {
                case 'totp':
                    setupResult = await this.#setupTOTP(user, { label, issuer });
                    break;
                case 'sms':
                    setupResult = await this.#setupSMS(user, options);
                    break;
                case 'email':
                    setupResult = await this.#setupEmailMFA(user, options);
                    break;
                case 'webauthn':
                    setupResult = await this.#setupWebAuthn(user, options);
                    break;
                case 'backup_codes':
                    setupResult = await this.#setupBackupCodes(user);
                    break;
                default:
                    throw new ValidationError('Unsupported MFA method', 'UNSUPPORTED_MFA_METHOD');
            }

            // Log MFA setup
            await this.#auditService.log({
                action: 'MFA_SETUP',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    method,
                    label
                }
            });

            logger.info('MFA setup initiated', {
                userId,
                method,
                label
            });

            return setupResult;
        } catch (error) {
            logger.error('MFA setup failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Complete MFA setup with verification
     * @param {string} userId - User ID
     * @param {string} method - MFA method being setup
     * @param {string} verificationCode - Verification code
     * @param {Object} options - Completion options
     * @returns {Promise<Object>} MFA completion result
     */
    async completeMFASetup(userId, method, verificationCode, options = {}) {
        const { makeDefault = false } = options;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Find MFA method in setup
            const mfaMethod = user.mfa.methods.find(m => m.type === method && !m.enabled);
            if (!mfaMethod) {
                throw new NotFoundError('MFA method not found or already enabled', 'MFA_METHOD_NOT_FOUND');
            }

            // Verify setup code
            const isValid = await this.#verifyMFACode(mfaMethod, verificationCode);
            if (!isValid) {
                throw new ValidationError('Invalid verification code', 'INVALID_VERIFICATION_CODE');
            }

            // Enable MFA method
            mfaMethod.enabled = true;
            mfaMethod.verifiedAt = new Date();

            // Set as primary if requested or first method
            if (makeDefault || !user.mfa.methods.some(m => m.enabled && m.isPrimary)) {
                user.mfa.methods.forEach(m => m.isPrimary = false);
                mfaMethod.isPrimary = true;
            }

            // Enable MFA if this is the first method
            if (!user.mfa.enabled) {
                user.mfa.enabled = true;
            }

            await user.save();

            // Generate backup codes if this is TOTP
            let backupCodes = null;
            if (method === 'totp') {
                backupCodes = await this.#generateBackupCodes(user);
            }

            // Send confirmation notifications
            await this.#sendMFAEnabledNotifications(user, method);

            // Log MFA completion
            await this.#auditService.log({
                action: 'MFA_ENABLED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    method,
                    isPrimary: mfaMethod.isPrimary
                }
            });

            logger.info('MFA setup completed', {
                userId,
                method,
                isPrimary: mfaMethod.isPrimary
            });

            return {
                success: true,
                method,
                isPrimary: mfaMethod.isPrimary,
                backupCodes,
                nextSteps: this.#getMFANextSteps(user)
            };
        } catch (error) {
            logger.error('MFA setup completion failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Authenticate with OAuth provider
     * @param {string} provider - OAuth provider (google, github, etc.)
     * @param {string} authorizationCode - Authorization code from provider
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - OAuth options
     * @returns {Promise<Object>} OAuth authentication result
     */
    async authenticateWithOAuth(provider, authorizationCode, deviceInfo, options = {}) {
        const { linkToExisting = false, createIfNotExists = true } = options;

        try {
            // Get OAuth provider configuration
            const providerConfig = this.#oauthProviders.get(provider);
            if (!providerConfig) {
                throw new ValidationError('Unsupported OAuth provider', 'UNSUPPORTED_OAUTH_PROVIDER');
            }

            // Exchange authorization code for tokens
            const tokenResponse = await this.#exchangeOAuthCode(provider, authorizationCode);

            // Get user info from provider
            const userInfo = await this.#getOAuthUserInfo(provider, tokenResponse.access_token);

            // Find or create user
            let user = await UserModel.findByOAuthProvider(provider, userInfo.id);

            if (!user && userInfo.email) {
                user = await UserModel.findByEmail(userInfo.email);

                if (user && linkToExisting) {
                    // Link OAuth account to existing user
                    await this.#linkOAuthAccount(user, provider, userInfo, tokenResponse);
                } else if (!user && createIfNotExists) {
                    // Create new user from OAuth data
                    user = await this.#createUserFromOAuth(provider, userInfo, tokenResponse);
                }
            }

            if (!user) {
                throw new NotFoundError('User not found and creation disabled', 'USER_NOT_FOUND');
            }

            // Update OAuth tokens
            await this.#updateOAuthTokens(user, provider, tokenResponse);

            // Create session
            const sessionData = await this.#createUserSession(user, deviceInfo, {
                authMethod: 'oauth',
                provider
            });

            // Generate tokens
            const tokens = await this.#generateTokens(user, sessionData.sessionId);

            // Record login
            await user.recordLogin({
                ...deviceInfo,
                authMethod: 'oauth',
                authProvider: provider,
                success: true
            });

            // Log OAuth authentication
            await this.#auditService.log({
                action: 'OAUTH_AUTHENTICATED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    provider,
                    linked: !!linkToExisting,
                    created: !linkToExisting && createIfNotExists
                }
            });

            logger.info('OAuth authentication successful', {
                userId: user._id,
                provider,
                email: userInfo.email
            });

            return {
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    profile: user.profile
                },
                tokens,
                session: {
                    sessionId: sessionData.sessionId,
                    expiresAt: sessionData.expiresAt
                },
                provider: {
                    name: provider,
                    userInfo: {
                        id: userInfo.id,
                        email: userInfo.email,
                        name: userInfo.name
                    }
                }
            };
        } catch (error) {
            logger.error('OAuth authentication failed', {
                error: error.message,
                provider,
                deviceInfo: deviceInfo.deviceId
            });
            throw error;
        }
    }

    /**
     * Authenticate with SSO (SAML/OIDC)
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - SSO options
     * @returns {Promise<Object>} SSO authentication result
     */
    async authenticateWithSSO(provider, ssoResponse, deviceInfo, options = {}) {
        const { validateSignature = true, allowProvisioning = true } = options;

        try {
            // Get SSO provider configuration
            const providerConfig = this.#ssoProviders.get(provider);
            if (!providerConfig) {
                throw new ValidationError('Unsupported SSO provider', 'UNSUPPORTED_SSO_PROVIDER');
            }

            // Validate SSO response
            if (validateSignature) {
                await this.#validateSSOSignature(provider, ssoResponse);
            }

            // Extract user attributes
            const userAttributes = await this.#extractSSOAttributes(provider, ssoResponse);

            // Find or provision user
            let user = await this.#findOrProvisionSSOUser(provider, userAttributes, allowProvisioning);

            // Create session
            const sessionData = await this.#createUserSession(user, deviceInfo, {
                authMethod: 'sso',
                provider
            });

            // Generate tokens
            const tokens = await this.#generateTokens(user, sessionData.sessionId);

            // Record login
            await user.recordLogin({
                ...deviceInfo,
                authMethod: 'sso',
                authProvider: provider,
                success: true
            });

            // Log SSO authentication
            await this.#auditService.log({
                action: 'SSO_AUTHENTICATED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    provider,
                    attributes: Object.keys(userAttributes)
                }
            });

            logger.info('SSO authentication successful', {
                userId: user._id,
                provider,
                email: userAttributes.email
            });

            return {
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    profile: user.profile
                },
                tokens,
                session: {
                    sessionId: sessionData.sessionId,
                    expiresAt: sessionData.expiresAt
                },
                sso: {
                    provider,
                    attributes: userAttributes
                }
            };
        } catch (error) {
            logger.error('SSO authentication failed', {
                error: error.message,
                provider,
                deviceInfo: deviceInfo.deviceId
            });
            throw error;
        }
    }

    /**
     * Initiate password reset process
     * @param {string} email - User email
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Password reset initiation result
     */
    async initiatePasswordReset(email, options = {}) {
        const { ipAddress, userAgent } = options;

        try {
            // Find user by email
            const user = await UserModel.findByEmail(email);
            if (!user) {
                // Don't reveal if email exists - return success anyway
                logger.warn('Password reset attempted for non-existent email', { email, ipAddress });
                return { success: true, message: 'If the email exists, a reset link has been sent' };
            }

            // Check rate limiting for password resets
            await this.#checkPasswordResetRateLimit(email, ipAddress);

            // Generate reset token
            const resetToken = await user.generatePasswordResetToken();
            user.security.passwordReset.requestIp = ipAddress;
            await user.save();

            // Send reset email
            await this.#emailService.sendPasswordResetEmail(user.email, {
                firstName: user.profile.firstName,
                resetToken,
                expiresIn: '1 hour'
            });

            // Log password reset request
            await this.#auditService.log({
                action: 'PASSWORD_RESET_REQUESTED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    email,
                    ipAddress,
                    userAgent
                }
            });

            logger.info('Password reset initiated', {
                userId: user._id,
                email,
                ipAddress
            });

            return {
                success: true,
                message: 'Password reset email sent',
                expiresIn: '1 hour'
            };
        } catch (error) {
            logger.error('Password reset initiation failed', {
                error: error.message,
                email,
                ipAddress
            });
            throw error;
        }
    }

    /**
     * Complete password reset with new password
     * @param {string} resetToken - Password reset token
     * @param {string} newPassword - New password
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - Reset completion options
     * @returns {Promise<Object>} Password reset completion result
     */
    async completePasswordReset(resetToken, newPassword, deviceInfo, options = {}) {
        const { terminateAllSessions = true } = options;

        try {
            // Find user by reset token
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            const user = await UserModel.findOne({
                'security.passwordReset.token': hashedToken,
                'security.passwordReset.tokenExpires': { $gt: Date.now() }
            });

            if (!user) {
                throw new ValidationError('Invalid or expired reset token', 'INVALID_RESET_TOKEN');
            }

            // Validate new password
            await user.validatePasswordPolicy(newPassword);

            // Reset password
            await user.resetPassword(resetToken, newPassword);

            // Terminate all sessions if requested
            if (terminateAllSessions) {
                await UserSessionModel.terminateUserSessions(user._id, {
                    reason: 'password_reset'
                });
            }

            // Send confirmation notifications
            await this.#sendPasswordResetConfirmation(user, deviceInfo);

            // Log password reset completion
            await this.#auditService.log({
                action: 'PASSWORD_RESET_COMPLETED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    terminateAllSessions,
                    ipAddress: deviceInfo.ipAddress
                }
            });

            logger.info('Password reset completed', {
                userId: user._id,
                email: user.email,
                terminateAllSessions
            });

            return {
                success: true,
                message: 'Password reset successfully',
                sessionsTerminated: terminateAllSessions
            };
        } catch (error) {
            logger.error('Password reset completion failed', {
                error: error.message,
                deviceInfo: deviceInfo.ipAddress
            });
            throw error;
        }
    }

    /**
     * Logout user and terminate session
     * @param {string} accessToken - User's access token
     * @param {Object} options - Logout options
     * @returns {Promise<Object>} Logout result
     */
    async logout(accessToken, options = {}) {
        const { allDevices = false, reason = 'logout' } = options;

        try {
            // Verify and decode token
            const tokenData = await this.#verifyToken(accessToken, 'access');
            const userId = tokenData.userId;
            const sessionId = tokenData.sessionId;

            // Add token to blacklist
            this.#blacklistedTokens.add(accessToken);

            if (allDevices) {
                // Terminate all user sessions
                await UserSessionModel.terminateUserSessions(userId, { reason });
            } else {
                // Terminate specific session
                const session = await UserSessionModel.findOne({ sessionId });
                if (session) {
                    await session.terminate(reason);
                }
            }

            // Clean up active sessions cache
            this.#activeSessions.delete(sessionId);

            // Log logout
            await this.#auditService.log({
                action: 'USER_LOGOUT',
                entityType: 'authentication',
                entityId: userId,
                userId: userId,
                details: {
                    sessionId,
                    allDevices,
                    reason
                }
            });

            logger.info('User logged out', {
                userId,
                sessionId,
                allDevices,
                reason
            });

            return {
                success: true,
                message: allDevices ? 'Logged out from all devices' : 'Logged out successfully'
            };
        } catch (error) {
            logger.error('Logout failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken - Refresh token
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - Refresh options
     * @returns {Promise<Object>} Token refresh result
     */
    async refreshToken(refreshToken, deviceInfo, options = {}) {
        const { extendSession = true } = options;

        try {
            // Verify refresh token
            const tokenData = await this.#verifyToken(refreshToken, 'refresh');
            const userId = tokenData.userId;
            const sessionId = tokenData.sessionId;

            // Get user and session
            const [user, session] = await Promise.all([
                UserModel.findById(userId),
                UserSessionModel.findOne({ sessionId, status: 'active' })
            ]);

            if (!user || !session) {
                throw new ValidationError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
            }

            // Check if session is still valid
            if (session.expiresAt < new Date()) {
                throw new ValidationError('Session expired', 'SESSION_EXPIRED');
            }

            // Generate new tokens
            const newTokens = await this.#generateTokens(user, sessionId);

            // Extend session if requested
            if (extendSession) {
                await session.updateActivity();
            }

            // Log token refresh
            await this.#auditService.log({
                action: 'TOKEN_REFRESHED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    sessionId,
                    extendSession,
                    ipAddress: deviceInfo.ipAddress
                }
            });

            logger.info('Token refreshed', {
                userId,
                sessionId,
                extendSession
            });

            return {
                success: true,
                tokens: newTokens,
                session: {
                    sessionId: session.sessionId,
                    expiresAt: session.expiresAt
                }
            };
        } catch (error) {
            logger.error('Token refresh failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate session and return user context
     * @param {string} accessToken - Access token to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Session validation result
     */
    async validateSession(accessToken, options = {}) {
        const { updateActivity = true, checkPermissions = [] } = options;

        try {
            // Check if token is blacklisted
            if (this.#blacklistedTokens.has(accessToken)) {
                throw new ValidationError('Token has been revoked', 'TOKEN_REVOKED');
            }

            // Verify token
            const tokenData = await this.#verifyToken(accessToken, 'access');
            const userId = tokenData.userId;
            const sessionId = tokenData.sessionId;

            // Get session from cache or database
            let session = this.#activeSessions.get(sessionId);
            if (!session) {
                session = await UserSessionModel.findOne({ sessionId, status: 'active' });
                if (session) {
                    this.#activeSessions.set(sessionId, session);
                }
            }

            if (!session || session.expiresAt < new Date()) {
                throw new ValidationError('Session expired', 'SESSION_EXPIRED');
            }

            // Get user
            const user = await UserModel.findById(userId).populate('organizations.organizationId');
            if (!user || user.accountStatus.status !== 'active') {
                throw new ValidationError('User account inactive', 'ACCOUNT_INACTIVE');
            }

            // Update session activity if requested
            if (updateActivity) {
                await session.updateActivity();
            }

            // Check permissions if specified
            if (checkPermissions.length > 0) {
                const userPermissions = this.#extractUserPermissions(user);
                const hasRequiredPermissions = checkPermissions.every(
                    permission => userPermissions.includes(permission)
                );

                if (!hasRequiredPermissions) {
                    throw new ForbiddenError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');
                }
            }

            return {
                valid: true,
                user: {
                    id: user._id,
                    email: user.email,
                    profile: user.profile,
                    organizations: user.organizations,
                    roles: user.organizations.flatMap(org => org.roles),
                    permissions: this.#extractUserPermissions(user)
                },
                session: {
                    sessionId: session.sessionId,
                    createdAt: session.createdAt,
                    expiresAt: session.expiresAt,
                    lastActivityAt: session.lastActivityAt,
                    deviceInfo: session.deviceInfo
                },
                security: {
                    riskScore: session.security.riskScore,
                    mfaVerified: session.settings.mfaVerified,
                    trustedDevice: session.deviceInfo.trusted
                }
            };
        } catch (error) {
            logger.error('Session validation failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get user sessions with filtering and pagination
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User sessions
     */
    async getUserSessions(userId, options = {}) {
        const {
            status = 'active',
            limit = 20,
            offset = 0,
            includeExpired = false,
            requesterId
        } = options;

        try {
            // Check permissions
            if (requesterId !== userId) {
                // Additional permission checks would go here
            }

            // Build query
            const query = { userId };
            if (!includeExpired) {
                query.expiresAt = { $gt: new Date() };
            }
            if (status) {
                query.status = status;
            }

            // Get sessions
            const [sessions, totalCount] = await Promise.all([
                UserSessionModel.find(query)
                    .sort({ lastActivityAt: -1 })
                    .limit(limit)
                    .skip(offset),
                UserSessionModel.countDocuments(query)
            ]);

            // Process sessions for output
            const processedSessions = sessions.map(session => ({
                sessionId: session.sessionId,
                deviceInfo: session.deviceInfo,
                location: session.location,
                createdAt: session.createdAt,
                lastActivityAt: session.lastActivityAt,
                expiresAt: session.expiresAt,
                status: session.status,
                riskScore: session.security.riskScore,
                isCurrent: false // This would be determined by comparing with current session
            }));

            return {
                sessions: processedSessions,
                pagination: {
                    totalCount,
                    limit,
                    offset,
                    hasMore: totalCount > offset + sessions.length
                }
            };
        } catch (error) {
            logger.error('Error fetching user sessions', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Revoke specific session
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID to revoke
     * @param {string} revokedBy - ID of user revoking session
     * @param {Object} options - Revocation options
     * @returns {Promise<Object>} Revocation result
     */
    async revokeSession(userId, sessionId, revokedBy, options = {}) {
        const { reason = 'manual_revocation' } = options;

        try {
            // Check permissions
            if (revokedBy !== userId) {
                // Additional permission checks for admin revocation
            }

            // Find and terminate session
            const session = await UserSessionModel.findOne({ sessionId, userId });
            if (!session) {
                throw new NotFoundError('Session not found', 'SESSION_NOT_FOUND');
            }

            await session.terminate(reason);

            // Clean up caches
            this.#activeSessions.delete(sessionId);

            // Log session revocation
            await this.#auditService.log({
                action: 'SESSION_REVOKED',
                entityType: 'authentication',
                entityId: userId,
                userId: revokedBy,
                details: {
                    sessionId,
                    reason,
                    deviceInfo: session.deviceInfo
                }
            });

            logger.info('Session revoked', {
                userId,
                sessionId,
                revokedBy,
                reason
            });

            return {
                success: true,
                message: 'Session revoked successfully'
            };
        } catch (error) {
            logger.error('Session revocation failed', {
                error: error.message,
                userId,
                sessionId,
                revokedBy
            });
            throw error;
        }
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Initialize OAuth and SSO providers
     * @private
     */
    #initializeProviders() {
        // OAuth providers configuration
        this.#oauthProviders.set('google', {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            redirectUri: process.env.GOOGLE_REDIRECT_URI,
            scope: 'openid email profile',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
        });

        this.#oauthProviders.set('github', {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            redirectUri: process.env.GITHUB_REDIRECT_URI,
            scope: 'user:email',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userInfoUrl: 'https://api.github.com/user'
        });

        // SSO providers would be configured here
        // this.#ssoProviders.set('enterprise_saml', { ... });
    }

    /**
     * Setup cleanup intervals
     * @private
     */
    #setupCleanupIntervals() {
        // Clean up expired tokens every hour
        setInterval(() => {
            // Clean blacklisted tokens (implement with external store in production)
            if (this.#blacklistedTokens.size > 10000) {
                this.#blacklistedTokens.clear();
            }
        }, 3600000);

        // Clean up expired sessions every 30 minutes
        setInterval(async () => {
            try {
                await UserSessionModel.cleanupExpiredSessions();
            } catch (error) {
                logger.error('Session cleanup failed', { error: error.message });
            }
        }, 1800000);

        // Clean up expired MFA codes every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, data] of this.#mfaCodes) {
                if (now > data.expiresAt) {
                    this.#mfaCodes.delete(key);
                }
            }
        }, 300000);
    }

    /**
     * Calculate risk score for authentication attempt
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<number>} Risk score (0-100)
     */
    async #calculateRiskScore(user, deviceInfo) {
        let riskScore = 0;

        // Check for new device
        if (!this.#isTrustedDevice(user._id, deviceInfo.deviceId)) {
            riskScore += this.#riskFactors.newDevice;
        }

        // Check for new location
        const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
        if (location && !this.#isKnownLocation(user, location)) {
            riskScore += this.#riskFactors.newLocation;
        }

        // Check for unusual login time
        if (this.#isUnusualLoginTime(user, new Date())) {
            riskScore += this.#riskFactors.unusualTime;
        }

        // Check for VPN/Proxy
        if (await this.#isVPNOrProxy(deviceInfo.ipAddress)) {
            riskScore += this.#riskFactors.vpnDetected;
        }

        // Check recent failed attempts
        if (user.security.loginAttempts.count > 0) {
            riskScore += this.#riskFactors.multipleFailedAttempts;
        }

        // Check user agent
        if (this.#isSuspiciousUserAgent(deviceInfo.userAgent)) {
            riskScore += this.#riskFactors.suspiciousUserAgent;
        }

        return Math.min(riskScore, 100);
    }

    /**
     * Create user session
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - Session options
     * @returns {Promise<Object>} Session data
     */
    async #createUserSession(user, deviceInfo, options = {}) {
        const {
            riskScore = 0,
            requiresMfa = false,
            authMethod = 'password',
            provider = null
        } = options;

        // Parse user agent
        const uaParser = new UAParser(deviceInfo.userAgent);
        const parsedUA = uaParser.getResult();

        // Get location
        const location = await this.#getLocationFromIP(deviceInfo.ipAddress);

        // Create session
        const sessionData = {
            userId: user._id,
            organizationId: user.defaultOrganizationId,
            sessionType: 'web',
            authMethod,
            authProvider: provider,
            deviceInfo: {
                deviceId: deviceInfo.deviceId,
                deviceName: `${parsedUA.browser.name} on ${parsedUA.os.name}`,
                deviceType: this.#getDeviceType(parsedUA),
                platform: parsedUA.os.name,
                platformVersion: parsedUA.os.version,
                browser: parsedUA.browser.name,
                browserVersion: parsedUA.browser.version,
                userAgent: deviceInfo.userAgent,
                trusted: this.#isTrustedDevice(user._id, deviceInfo.deviceId)
            },
            networkInfo: {
                ipAddress: deviceInfo.ipAddress,
                ipVersion: deviceInfo.ipAddress.includes(':') ? 'IPv6' : 'IPv4'
            },
            location,
            security: {
                riskScore,
                threatLevel: this.#getThreatLevel(riskScore)
            },
            settings: {
                requireMfa: requiresMfa,
                mfaVerified: !requiresMfa,
                idleTimeout: this.#securityConfig.sessionTimeout / 60000, // Convert to minutes
                absoluteTimeout: 8 * 60 // 8 hours in minutes
            }
        };

        const session = await UserSessionModel.createSession(sessionData);

        // Cache active session
        this.#activeSessions.set(session.sessionId, session);

        return {
            sessionId: session.sessionId,
            expiresAt: session.expiresAt
        };
    }

    /**
     * Generate JWT tokens for user
     * @private
     * @param {Object} user - User object
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Generated tokens
     */
    async #generateTokens(user, sessionId) {
        const payload = {
            userId: user._id,
            email: user.email,
            sessionId,
            roles: user.organizations.flatMap(org => org.roles.map(r => r.roleName)),
            organizations: user.organizations.map(org => org.organizationId)
        };

        const accessToken = jwt.sign(payload, this.#jwtConfig.secret, {
            expiresIn: this.#jwtConfig.accessTokenExpiry,
            issuer: 'enterprise-app',
            audience: 'enterprise-users'
        });

        const refreshToken = jwt.sign(
            { userId: user._id, sessionId, type: 'refresh' },
            this.#jwtConfig.secret,
            {
                expiresIn: this.#jwtConfig.refreshTokenExpiry,
                issuer: 'enterprise-app',
                audience: 'enterprise-users'
            }
        );

        return {
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            expiresIn: 15 * 60 // 15 minutes in seconds
        };
    }

    /**
     * Verify JWT token
     * @private
     * @param {string} token - Token to verify
     * @param {string} type - Token type (access, refresh, temp)
     * @returns {Promise<Object>} Token payload
     */
    async #verifyToken(token, type) {
        try {
            const decoded = jwt.verify(token, this.#jwtConfig.secret, {
                issuer: 'enterprise-app',
                audience: 'enterprise-users'
            });

            if (type === 'refresh' && decoded.type !== 'refresh') {
                throw new ValidationError('Invalid token type', 'INVALID_TOKEN_TYPE');
            }

            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new ValidationError('Token expired', 'TOKEN_EXPIRED');
            } else if (error.name === 'JsonWebTokenError') {
                throw new ValidationError('Invalid token', 'INVALID_TOKEN');
            }
            throw error;
        }
    }

    /**
     * Setup TOTP MFA
     * @private
     * @param {Object} user - User object
     * @param {Object} options - TOTP options
     * @returns {Promise<Object>} TOTP setup data
     */
    async #setupTOTP(user, options = {}) {
        const { label, issuer } = options;

        const secret = speakeasy.generateSecret({
            name: label || user.email,
            issuer: issuer || 'Enterprise App',
            length: 32
        });

        // Store secret temporarily (not enabled yet)
        const mfaMethod = {
            type: 'totp',
            enabled: false,
            secret: secret.base32,
            deviceInfo: null,
            verifiedAt: null
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Generate QR code
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

        return {
            secret: secret.base32,
            qrCode: qrCodeUrl,
            manualEntryKey: secret.base32,
            issuer: issuer || 'Enterprise App',
            accountName: label || user.email
        };
    }

    /**
     * Verify MFA code
     * @private
     * @param {Object} mfaMethod - MFA method object
     * @param {string} code - Code to verify
     * @returns {Promise<boolean>} Verification result
     */
    async #verifyMFACode(mfaMethod, code) {
        switch (mfaMethod.type) {
            case 'totp':
                return speakeasy.totp.verify({
                    secret: mfaMethod.secret,
                    encoding: 'base32',
                    token: code,
                    window: 2 // Allow 2 time steps
                });

            case 'sms':
            case 'email':
                // Verify against stored code
                const storedCode = this.#mfaCodes.get(`${mfaMethod.type}:${code}`);
                if (storedCode && storedCode.expiresAt > Date.now()) {
                    this.#mfaCodes.delete(`${mfaMethod.type}:${code}`);
                    return true;
                }
                return false;

            default:
                return false;
        }
    }

    /**
     * Check if device is trusted
     * @private
     * @param {string} userId - User ID
     * @param {string} deviceId - Device ID
     * @returns {boolean} Is trusted device
     */
    #isTrustedDevice(userId, deviceId) {
        const key = `${userId}:${deviceId}`;
        const trustedDevice = this.#trustedDevices.get(key);
        return trustedDevice && trustedDevice.expiresAt > Date.now();
    }

    /**
     * Trust a device
     * @private
     * @param {string} userId - User ID
     * @param {Object} deviceInfo - Device information
     */
    async #trustDevice(userId, deviceInfo) {
        const key = `${userId}:${deviceInfo.deviceId}`;
        this.#trustedDevices.set(key, {
            userId,
            deviceId: deviceInfo.deviceId,
            trustedAt: Date.now(),
            expiresAt: Date.now() + this.#securityConfig.deviceTrustDuration
        });
    }

    /**
     * Get location from IP address
     * @private
     * @param {string} ipAddress - IP address
     * @returns {Promise<Object>} Location data
     */
    async #getLocationFromIP(ipAddress) {
        try {
            const geo = geoip.lookup(ipAddress);
            if (geo) {
                return {
                    country: geo.country,
                    region: geo.region,
                    city: geo.city,
                    coordinates: {
                        type: 'Point',
                        coordinates: [geo.ll[1], geo.ll[0]] // [longitude, latitude]
                    },
                    timezone: geo.timezone
                };
            }
        } catch (error) {
            logger.warn('Failed to get location from IP', { ipAddress, error: error.message });
        }
        return null;
    }

    /**
     * Get device type from parsed user agent
     * @private
     * @param {Object} parsedUA - Parsed user agent
     * @returns {string} Device type
     */
    #getDeviceType(parsedUA) {
        if (parsedUA.device.type === 'mobile') return 'mobile';
        if (parsedUA.device.type === 'tablet') return 'tablet';
        if (parsedUA.device.type === 'wearable') return 'wearable';
        return 'desktop';
    }

    /**
     * Get threat level from risk score
     * @private
     * @param {number} riskScore - Risk score
     * @returns {string} Threat level
     */
    #getThreatLevel(riskScore) {
        if (riskScore >= 80) return 'critical';
        if (riskScore >= 60) return 'high';
        if (riskScore >= 40) return 'medium';
        if (riskScore >= 20) return 'low';
        return 'none';
    }

    /**
     * Extract user permissions from roles
     * @private
     * @param {Object} user - User object
     * @returns {Array} User permissions
     */
    #extractUserPermissions(user) {
        const permissions = new Set();

        user.organizations.forEach(org => {
            org.roles.forEach(role => {
                // Add role-based permissions
                permissions.add(`org:${org.organizationId}:${role.roleName}`);
            });

            org.permissions?.forEach(permission => {
                permission.actions.forEach(action => {
                    permissions.add(`${permission.resource}:${action}`);
                });
            });
        });

        return Array.from(permissions);
    }

    /**
     * Check rate limiting for authentication attempts
     * @private
     * @param {string} identifier - Email or username
     * @param {string} ipAddress - IP address
     * @throws {ValidationError} If rate limit exceeded
     */
    async #checkRateLimit(identifier, ipAddress) {
        const identifierKey = `rate_limit:auth:${identifier}`;
        const ipKey = `rate_limit:auth:ip:${ipAddress}`;

        // Check identifier-based rate limiting
        const identifierAttempts = await this.#cacheService.get(identifierKey) || 0;
        if (identifierAttempts >= this.#securityConfig.maxLoginAttempts) {
            throw new ValidationError(
                'Too many login attempts. Please try again later.',
                'RATE_LIMIT_EXCEEDED'
            );
        }

        // Check IP-based rate limiting (more lenient)
        const ipAttempts = await this.#cacheService.get(ipKey) || 0;
        if (ipAttempts >= this.#securityConfig.maxLoginAttempts * 3) {
            throw new ValidationError(
                'Too many login attempts from this IP. Please try again later.',
                'IP_RATE_LIMIT_EXCEEDED'
            );
        }

        // Increment counters
        await Promise.all([
            this.#cacheService.set(identifierKey, identifierAttempts + 1, this.#securityConfig.lockoutDuration / 1000),
            this.#cacheService.set(ipKey, ipAttempts + 1, this.#securityConfig.lockoutDuration / 1000)
        ]);
    }

    /**
     * Record failed login attempt
     * @private
     * @param {string} identifier - Email or username
     * @param {Object} deviceInfo - Device information
     * @param {string} reason - Failure reason
     */
    async #recordFailedLogin(identifier, deviceInfo, reason) {
        try {
            // Log failed attempt
            await this.#auditService.log({
                action: 'LOGIN_FAILED',
                entityType: 'authentication',
                details: {
                    identifier,
                    reason,
                    ipAddress: deviceInfo.ipAddress,
                    userAgent: deviceInfo.userAgent,
                    deviceId: deviceInfo.deviceId
                }
            });

            // Try to find user and update failed attempts
            const user = await UserModel.findByCredentials(identifier);
            if (user) {
                await user.incrementLoginAttempts();

                // Send security alert if threshold exceeded
                if (user.security.loginAttempts.count >= this.#securityConfig.maxLoginAttempts - 1) {
                    await this.#sendSecurityAlert(user, deviceInfo, 'repeated_failed_logins');
                }
            }
        } catch (error) {
            logger.warn('Failed to record failed login attempt', {
                identifier,
                error: error.message
            });
        }
    }

    /**
     * Check password reset rate limiting
     * @private
     * @param {string} email - Email address
     * @param {string} ipAddress - IP address
     * @throws {ValidationError} If rate limit exceeded
     */
    async #checkPasswordResetRateLimit(email, ipAddress) {
        const emailKey = `rate_limit:reset:${email}`;
        const ipKey = `rate_limit:reset:ip:${ipAddress}`;

        const [emailAttempts, ipAttempts] = await Promise.all([
            this.#cacheService.get(emailKey) || 0,
            this.#cacheService.get(ipKey) || 0
        ]);

        // Allow 3 reset attempts per email per hour
        if (emailAttempts >= 3) {
            throw new ValidationError(
                'Too many password reset attempts. Please try again later.',
                'RESET_RATE_LIMIT_EXCEEDED'
            );
        }

        // Allow 10 reset attempts per IP per hour
        if (ipAttempts >= 10) {
            throw new ValidationError(
                'Too many password reset attempts from this IP. Please try again later.',
                'IP_RESET_RATE_LIMIT_EXCEEDED'
            );
        }

        // Increment counters (1 hour expiry)
        await Promise.all([
            this.#cacheService.set(emailKey, emailAttempts + 1, 3600),
            this.#cacheService.set(ipKey, ipAttempts + 1, 3600)
        ]);
    }

    /**
     * Send security alert to user
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @param {string|number} alertType - Type of alert or risk score
     */
    async #sendSecurityAlert(user, deviceInfo, alertType) {
        try {
            const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
            const uaParser = new UAParser(deviceInfo.userAgent);
            const parsedUA = uaParser.getResult();

            let alertData = {
                userId: user._id,
                alertType: typeof alertType === 'string' ? alertType : 'high_risk_login',
                timestamp: new Date(),
                location: location ? `${location.city}, ${location.country}` : 'Unknown',
                device: `${parsedUA.browser.name} on ${parsedUA.os.name}`,
                ipAddress: deviceInfo.ipAddress
            };

            if (typeof alertType === 'number') {
                alertData.riskScore = alertType;
            }

            // Send email alert
            await this.#emailService.sendSecurityAlert(user.email, {
                firstName: user.profile?.firstName,
                alertType: alertData.alertType,
                location: alertData.location,
                device: alertData.device,
                timestamp: alertData.timestamp,
                actionRequired: alertType === 'repeated_failed_logins'
            });

            // Send in-app notification
            await this.#notificationService.sendNotification({
                type: 'SECURITY_ALERT',
                recipients: [user._id.toString()],
                data: alertData,
                priority: 'high'
            });

            logger.info('Security alert sent', {
                userId: user._id,
                alertType: alertData.alertType,
                location: alertData.location
            });
        } catch (error) {
            logger.error('Failed to send security alert', {
                userId: user._id,
                alertType,
                error: error.message
            });
        }
    }

    /**
     * Setup SMS MFA
     * @private
     * @param {Object} user - User object
     * @param {Object} options - SMS options
     * @returns {Promise<Object>} SMS setup result
     */
    async #setupSMS(user, options = {}) {
        const { phoneNumber } = options;

        if (!phoneNumber) {
            throw new ValidationError('Phone number is required for SMS MFA', 'PHONE_NUMBER_REQUIRED');
        }

        // Validate phone number format
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!/^[\+]?[1-9][\d]{0,15}$/.test(cleanPhone)) {
            throw new ValidationError('Invalid phone number format', 'INVALID_PHONE_NUMBER');
        }

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeKey = `sms_setup:${user._id}:${verificationCode}`;

        // Store code temporarily
        this.#mfaCodes.set(codeKey, {
            userId: user._id,
            code: verificationCode,
            phoneNumber: cleanPhone,
            expiresAt: Date.now() + this.#securityConfig.mfaCodeExpiry
        });

        // Add SMS method to user (not enabled yet)
        const mfaMethod = {
            type: 'sms',
            enabled: false,
            phoneNumber: cleanPhone,
            verifiedAt: null
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Send SMS with verification code
        // In production, integrate with SMS service (Twilio, AWS SNS, etc.)
        logger.info('SMS verification code generated', {
            userId: user._id,
            phoneNumber: this.#maskPhoneNumber(cleanPhone)
        });

        return {
            phoneNumber: this.#maskPhoneNumber(cleanPhone),
            message: 'Verification code sent to your phone',
            expiresIn: this.#securityConfig.mfaCodeExpiry / 1000
        };
    }

    /**
     * Setup email MFA
     * @private
     * @param {Object} user - User object
     * @param {Object} options - Email options
     * @returns {Promise<Object>} Email MFA setup result
     */
    async #setupEmailMFA(user, options = {}) {
        const { email = user.email } = options;

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeKey = `email_setup:${user._id}:${verificationCode}`;

        // Store code temporarily
        this.#mfaCodes.set(codeKey, {
            userId: user._id,
            code: verificationCode,
            email,
            expiresAt: Date.now() + this.#securityConfig.mfaCodeExpiry
        });

        // Add email method to user (not enabled yet)
        const mfaMethod = {
            type: 'email',
            enabled: false,
            email,
            verifiedAt: null
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Send email with verification code
        await this.#emailService.sendMFAVerificationCode(email, {
            firstName: user.profile?.firstName,
            verificationCode,
            expiresIn: this.#securityConfig.mfaCodeExpiry / 60000 // Convert to minutes
        });

        return {
            email: this.#maskEmail(email),
            message: 'Verification code sent to your email',
            expiresIn: this.#securityConfig.mfaCodeExpiry / 1000
        };
    }

    /**
     * Setup WebAuthn MFA
     * @private
     * @param {Object} user - User object
     * @param {Object} options - WebAuthn options
     * @returns {Promise<Object>} WebAuthn setup result
     */
    async #setupWebAuthn(user, options = {}) {
        const { authenticatorName = 'Security Key' } = options;

        // Generate challenge for WebAuthn registration
        const challenge = crypto.randomBytes(32);
        const challengeB64 = challenge.toString('base64url');

        // Store challenge temporarily
        const challengeKey = `webauthn_challenge:${user._id}`;
        await this.#cacheService.set(challengeKey, challengeB64, 300); // 5 minutes

        // Add WebAuthn method to user (not enabled yet)
        const mfaMethod = {
            type: 'webauthn',
            enabled: false,
            authenticatorName,
            credentialId: null,
            publicKey: null,
            counter: 0,
            verifiedAt: null
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Return WebAuthn registration options
        return {
            challenge: challengeB64,
            rp: {
                name: 'Enterprise App',
                id: process.env.WEBAUTHN_RP_ID || 'localhost'
            },
            user: {
                id: user._id.toString(),
                name: user.email,
                displayName: user.profile?.firstName || user.email
            },
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' }, // ES256
                { alg: -257, type: 'public-key' } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'cross-platform',
                userVerification: 'preferred'
            },
            timeout: this.#biometricConfig.timeout
        };
    }

    /**
     * Setup backup codes
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Backup codes setup result
     */
    async #setupBackupCodes(user) {
        const backupCodes = await this.#generateBackupCodes(user);

        return {
            codes: backupCodes,
            message: 'Store these backup codes securely. Each code can only be used once.',
            warning: 'These codes will not be shown again. Save them in a secure location.'
        };
    }

    /**
     * Generate backup codes for user
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Array>} Generated backup codes
     */
    async #generateBackupCodes(user) {
        const codes = [];
        for (let i = 0; i < 10; i++) {
            codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Hash and store codes
        const hashedCodes = await Promise.all(
            codes.map(async code => ({
                code: await bcrypt.hash(code, 10),
                used: false,
                createdAt: new Date()
            }))
        );

        // Update user with backup codes
        user.mfa.backupCodes = hashedCodes;
        await user.save();

        return codes;
    }

    /**
     * Verify backup code
     * @private
     * @param {Object} user - User object
     * @param {string} code - Backup code to verify
     * @returns {Promise<boolean>} Verification result
     */
    async #verifyBackupCode(user, code) {
        if (!user.mfa.backupCodes || user.mfa.backupCodes.length === 0) {
            return false;
        }

        for (const backupCode of user.mfa.backupCodes) {
            if (!backupCode.used && await bcrypt.compare(code, backupCode.code)) {
                // Mark code as used
                backupCode.used = true;
                backupCode.usedAt = new Date();
                await user.save();

                logger.info('Backup code used', {
                    userId: user._id,
                    remainingCodes: user.mfa.backupCodes.filter(c => !c.used).length
                });

                return true;
            }
        }

        return false;
    }

    /**
     * Record failed MFA attempt
     * @private
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {Object} deviceInfo - Device information
     */
    async #recordFailedMFA(userId, method, deviceInfo) {
        try {
            await this.#auditService.log({
                action: 'MFA_FAILED',
                entityType: 'authentication',
                entityId: userId,
                userId: userId,
                details: {
                    method,
                    ipAddress: deviceInfo.ipAddress,
                    deviceId: deviceInfo.deviceId
                }
            });

            // Increment failed MFA attempts counter
            const failedKey = `mfa_failed:${userId}`;
            const failedAttempts = await this.#cacheService.get(failedKey) || 0;
            await this.#cacheService.set(failedKey, failedAttempts + 1, 900); // 15 minutes

            // Send security alert after multiple failures
            if (failedAttempts >= 3) {
                const user = await UserModel.findById(userId);
                if (user) {
                    await this.#sendSecurityAlert(user, deviceInfo, 'repeated_mfa_failures');
                }
            }
        } catch (error) {
            logger.warn('Failed to record MFA failure', {
                userId,
                method,
                error: error.message
            });
        }
    }

    /**
     * Send MFA enabled notifications
     * @private
     * @param {Object} user - User object
     * @param {string} method - MFA method that was enabled
     */
    async #sendMFAEnabledNotifications(user, method) {
        try {
            // Send confirmation email
            await this.#emailService.sendMFAEnabledConfirmation(user.email, {
                firstName: user.profile?.firstName,
                method: method.toUpperCase(),
                timestamp: new Date()
            });

            // Send in-app notification
            await this.#notificationService.sendNotification({
                type: 'MFA_ENABLED',
                recipients: [user._id.toString()],
                data: {
                    method,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.warn('Failed to send MFA enabled notifications', {
                userId: user._id,
                method,
                error: error.message
            });
        }
    }

    /**
     * Get MFA next steps for user
     * @private
     * @param {Object} user - User object
     * @returns {Array} Next steps recommendations
     */
    #getMFANextSteps(user) {
        const nextSteps = [];
        const enabledMethods = user.mfa.methods.filter(m => m.enabled);

        if (enabledMethods.length === 1) {
            nextSteps.push('Consider setting up a second MFA method for redundancy');
        }

        if (!user.mfa.backupCodes || user.mfa.backupCodes.length === 0) {
            nextSteps.push('Generate backup codes for account recovery');
        }

        if (!enabledMethods.some(m => m.type === 'totp')) {
            nextSteps.push('Consider setting up an authenticator app for offline access');
        }

        return nextSteps;
    }

    /**
     * Exchange OAuth authorization code for tokens
     * @private
     * @param {string} provider - OAuth provider
     * @param {string} authorizationCode - Authorization code
     * @returns {Promise<Object>} Token response
     */
    async #exchangeOAuthCode(provider, authorizationCode) {
        const providerConfig = this.#oauthProviders.get(provider);

        const tokenRequest = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: providerConfig.clientId,
                client_secret: providerConfig.clientSecret,
                code: authorizationCode,
                redirect_uri: providerConfig.redirectUri
            })
        };

        try {
            // In production, use actual HTTP client
            // const response = await fetch(providerConfig.tokenUrl, tokenRequest);
            // return await response.json();

            // Mock response for demonstration
            return {
                access_token: 'mock_access_token',
                refresh_token: 'mock_refresh_token',
                expires_in: 3600,
                token_type: 'Bearer'
            };
        } catch (error) {
            logger.error('OAuth token exchange failed', {
                provider,
                error: error.message
            });
            throw new ValidationError('OAuth authentication failed', 'OAUTH_TOKEN_EXCHANGE_FAILED');
        }
    }

    /**
     * Get user information from OAuth provider
     * @private
     * @param {string} provider - OAuth provider
     * @param {string} accessToken - Access token
     * @returns {Promise<Object>} User information
     */
    async #getOAuthUserInfo(provider, accessToken) {
        const providerConfig = this.#oauthProviders.get(provider);

        try {
            // In production, use actual HTTP client
            // const response = await fetch(providerConfig.userInfoUrl, {
            //     headers: { 'Authorization': `Bearer ${accessToken}` }
            // });
            // return await response.json();

            // Mock response for demonstration
            return {
                id: 'mock_oauth_user_id',
                email: 'user@example.com',
                name: 'John Doe',
                picture: 'https://example.com/avatar.jpg',
                verified_email: true
            };
        } catch (error) {
            logger.error('OAuth user info retrieval failed', {
                provider,
                error: error.message
            });
            throw new ValidationError('Failed to retrieve user information', 'OAUTH_USER_INFO_FAILED');
        }
    }

    /**
     * Link OAuth account to existing user
     * @private
     * @param {Object} user - Existing user object
     * @param {string} provider - OAuth provider
     * @param {Object} userInfo - OAuth user information
     * @param {Object} tokenResponse - OAuth token response
     */
    async #linkOAuthAccount(user, provider, userInfo, tokenResponse) {
        // Add OAuth account to user
        if (!user.oauthAccounts) user.oauthAccounts = [];

        user.oauthAccounts.push({
            provider,
            providerId: userInfo.id,
            email: userInfo.email,
            linkedAt: new Date(),
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            tokenExpiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000))
        });

        await user.save();

        logger.info('OAuth account linked', {
            userId: user._id,
            provider,
            providerEmail: userInfo.email
        });
    }

    /**
     * Create new user from OAuth data
     * @private
     * @param {string} provider - OAuth provider
     * @param {Object} userInfo - OAuth user information
     * @param {Object} tokenResponse - OAuth token response
     * @returns {Promise<Object>} Created user
     */
    async #createUserFromOAuth(provider, userInfo, tokenResponse) {
        const [firstName, ...lastNameParts] = (userInfo.name || '').split(' ');
        const lastName = lastNameParts.join(' ');

        const userData = {
            email: userInfo.email,
            username: await UserModel.generateUniqueUsername(userInfo.email),
            profile: {
                firstName: firstName || '',
                lastName: lastName || '',
                avatar: userInfo.picture ? { url: userInfo.picture } : undefined
            },
            verification: {
                email: {
                    verified: userInfo.verified_email || false,
                    verifiedAt: userInfo.verified_email ? new Date() : null
                }
            },
            accountStatus: {
                status: 'active',
                statusHistory: [{
                    status: 'active',
                    reason: 'OAuth registration',
                    changedAt: new Date()
                }]
            },
            oauthAccounts: [{
                provider,
                providerId: userInfo.id,
                email: userInfo.email,
                linkedAt: new Date(),
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token,
                tokenExpiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000))
            }],
            metadata: {
                source: 'oauth',
                provider
            }
        };

        const user = await UserModel.create([userData]);

        logger.info('User created from OAuth', {
            userId: user[0]._id,
            provider,
            email: userInfo.email
        });

        return user[0];
    }

    /**
     * Update OAuth tokens for user
     * @private
     * @param {Object} user - User object
     * @param {string} provider - OAuth provider
     * @param {Object} tokenResponse - Token response
     */
    async #updateOAuthTokens(user, provider, tokenResponse) {
        const oauthAccount = user.oauthAccounts.find(account => account.provider === provider);

        if (oauthAccount) {
            oauthAccount.accessToken = tokenResponse.access_token;
            oauthAccount.refreshToken = tokenResponse.refresh_token;
            oauthAccount.tokenExpiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
            oauthAccount.lastUsedAt = new Date();

            await user.save();
        }
    }

    /**
     * Validate SSO signature
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @returns {Promise<boolean>} Validation result
     */
    async #validateSSOSignature(provider, ssoResponse) {
        // In production, implement SAML signature validation
        // This would verify the digital signature of the SAML response
        try {
            // Mock validation
            return true;
        } catch (error) {
            logger.error('SSO signature validation failed', {
                provider,
                error: error.message
            });
            throw new ValidationError('Invalid SSO signature', 'INVALID_SSO_SIGNATURE');
        }
    }

    /**
     * Extract user attributes from SSO response
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @returns {Promise<Object>} Extracted user attributes
     */
    async #extractSSOAttributes(provider, ssoResponse) {
        // In production, parse SAML assertions or OIDC claims
        // Mock attribute extraction
        return {
            email: ssoResponse.email || 'user@enterprise.com',
            firstName: ssoResponse.firstName || 'John',
            lastName: ssoResponse.lastName || 'Doe',
            employeeId: ssoResponse.employeeId,
            department: ssoResponse.department,
            groups: ssoResponse.groups || []
        };
    }

    /**
     * Find or provision SSO user
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} userAttributes - User attributes from SSO
     * @param {boolean} allowProvisioning - Whether to create new users
     * @returns {Promise<Object>} User object
     */
    async #findOrProvisionSSOUser(provider, userAttributes, allowProvisioning) {
        // Try to find existing user by email
        let user = await UserModel.findByEmail(userAttributes.email);

        if (!user && allowProvisioning) {
            // Create new user from SSO attributes
            const userData = {
                email: userAttributes.email,
                username: await UserModel.generateUniqueUsername(userAttributes.email),
                profile: {
                    firstName: userAttributes.firstName,
                    lastName: userAttributes.lastName,
                    employeeId: userAttributes.employeeId,
                    department: userAttributes.department
                },
                verification: {
                    email: { verified: true, verifiedAt: new Date() }
                },
                accountStatus: {
                    status: 'active',
                    statusHistory: [{
                        status: 'active',
                        reason: 'SSO provisioning',
                        changedAt: new Date()
                    }]
                },
                ssoAccounts: [{
                    provider,
                    attributes: userAttributes,
                    linkedAt: new Date()
                }],
                metadata: {
                    source: 'sso',
                    provider
                }
            };

            user = await UserModel.create([userData]);
            user = user[0];

            logger.info('User provisioned from SSO', {
                userId: user._id,
                provider,
                email: userAttributes.email
            });
        } else if (user) {
            // Update SSO account information
            if (!user.ssoAccounts) user.ssoAccounts = [];

            const existingSSO = user.ssoAccounts.find(account => account.provider === provider);
            if (existingSSO) {
                existingSSO.attributes = userAttributes;
                existingSSO.lastUsedAt = new Date();
            } else {
                user.ssoAccounts.push({
                    provider,
                    attributes: userAttributes,
                    linkedAt: new Date()
                });
            }

            await user.save();
        }

        if (!user) {
            throw new NotFoundError('User not found and provisioning disabled', 'SSO_USER_NOT_FOUND');
        }

        return user;
    }

    /**
     * Send password reset confirmation
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     */
    async #sendPasswordResetConfirmation(user, deviceInfo) {
        try {
            const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
            const uaParser = new UAParser(deviceInfo.userAgent);
            const parsedUA = uaParser.getResult();

            // Send confirmation email
            await this.#emailService.sendPasswordResetConfirmation(user.email, {
                firstName: user.profile?.firstName,
                timestamp: new Date(),
                location: location ? `${location.city}, ${location.country}` : 'Unknown location',
                device: `${parsedUA.browser.name} on ${parsedUA.os.name}`,
                ipAddress: deviceInfo.ipAddress
            });

            // Send in-app notification
            await this.#notificationService.sendNotification({
                type: 'PASSWORD_RESET_COMPLETED',
                recipients: [user._id.toString()],
                data: {
                    timestamp: new Date(),
                    location: location ? `${location.city}, ${location.country}` : 'Unknown',
                    device: `${parsedUA.browser.name} on ${parsedUA.os.name}`
                },
                priority: 'high'
            });
        } catch (error) {
            logger.warn('Failed to send password reset confirmation', {
                userId: user._id,
                error: error.message
            });
        }
    }

    /**
     * Check if location is known for user
     * @private
     * @param {Object} user - User object
     * @param {Object} location - Location data
     * @returns {boolean} Is known location
     */
    #isKnownLocation(user, location) {
        if (!user.activity?.loginHistory || !location) {
            return false;
        }

        // Check if user has logged in from this city before
        return user.activity.loginHistory.some(login => {
            if (!login.location) return false;
            return login.location.city === location.city &&
                login.location.country === location.country;
        });
    }

    /**
     * Check if login time is unusual for user
     * @private
     * @param {Object} user - User object
     * @param {Date} loginTime - Login timestamp
     * @returns {boolean} Is unusual time
     */
    #isUnusualLoginTime(user, loginTime) {
        if (!user.activity?.loginHistory || user.activity.loginHistory.length < 5) {
            return false; // Not enough data to determine patterns
        }

        const hour = loginTime.getHours();

        // Get typical login hours from history
        const loginHours = user.activity.loginHistory
            .map(login => new Date(login.timestamp).getHours())
            .filter(h => !isNaN(h));

        if (loginHours.length === 0) return false;

        // Calculate if this hour is outside normal range
        const avgHour = loginHours.reduce((sum, h) => sum + h, 0) / loginHours.length;
        const variance = loginHours.reduce((sum, h) => sum + Math.pow(h - avgHour, 2), 0) / loginHours.length;
        const stdDev = Math.sqrt(variance);

        // Consider unusual if more than 2 standard deviations from average
        return Math.abs(hour - avgHour) > (2 * stdDev);
    }

    /**
     * Check if IP address is VPN or proxy
     * @private
     * @param {string} ipAddress - IP address to check
     * @returns {Promise<boolean>} Is VPN or proxy
     */
    async #isVPNOrProxy(ipAddress) {
        try {
            // In production, integrate with VPN/proxy detection service
            // For now, implement basic checks

            // Check against known VPN/proxy IP ranges
            const suspiciousRanges = [
                '10.0.0.0/8',
                '172.16.0.0/12',
                '192.168.0.0/16'
            ];

            // Simple check for private IPs (which might be proxied)
            const isPrivate = suspiciousRanges.some(range => {
                // Basic IP range check - in production use proper CIDR library
                return ipAddress.startsWith(range.split('/')[0].substring(0, 3));
            });

            // Additional checks could include:
            // - GeoIP database lookups for hosting providers
            // - DNS reverse lookups
            // - Commercial VPN detection services

            return isPrivate;
        } catch (error) {
            logger.warn('VPN/proxy detection failed', {
                ipAddress,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Check if user agent is suspicious
     * @private
     * @param {string} userAgent - User agent string
     * @returns {boolean} Is suspicious
     */
    #isSuspiciousUserAgent(userAgent) {
        if (!userAgent || userAgent.length < 10) {
            return true; // Too short or missing
        }

        const suspiciousPatterns = [
            /bot/i,
            /crawler/i,
            /spider/i,
            /scanner/i,
            /curl/i,
            /wget/i,
            /python/i,
            /requests/i,
            /postman/i
        ];

        return suspiciousPatterns.some(pattern => pattern.test(userAgent));
    }

    /**
     * Mask phone number for display
     * @private
     * @param {string} phoneNumber - Phone number to mask
     * @returns {string} Masked phone number
     */
    #maskPhoneNumber(phoneNumber) {
        if (phoneNumber.length <= 4) return phoneNumber;
        const visible = phoneNumber.slice(-4);
        const masked = '*'.repeat(phoneNumber.length - 4);
        return masked + visible;
    }

    /**
     * Mask email address for display
     * @private
     * @param {string} email - Email to mask
     * @returns {string} Masked email
     */
    #maskEmail(email) {
        const [localPart, domain] = email.split('@');
        if (localPart.length <= 3) {
            return `${localPart[0]}***@${domain}`;
        }
        const visibleStart = localPart.slice(0, 2);
        const visibleEnd = localPart.slice(-1);
        const masked = '*'.repeat(Math.max(1, localPart.length - 3));
        return `${visibleStart}${masked}${visibleEnd}@${domain}`;
    }
}

module.exports = UserAuthService;