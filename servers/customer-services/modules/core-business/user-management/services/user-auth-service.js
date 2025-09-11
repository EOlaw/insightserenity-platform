'use strict';

/**
 * @fileoverview Enterprise user authentication service with multi-factor authentication, SSO, OAuth, and advanced security features
 * @module servers/customer-services/modules/core-business/user-management/services/user-auth-service
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
 * @requires module:shared/lib/auth/services/auth-service
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const logger = require('../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../shared/lib/utils/app-error');
const { asyncHandler } = require('../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../shared/lib/security/audit/audit-service');
const UserModel = require('../../../../shared/lib/database/models/users/user-model');
const UserSessionModel = require('../../../../shared/lib/database/models/users/user-session-model');
const AuthService = require('../../../../shared/lib/auth/services/auth-service');

/**
 * Enterprise user authentication service for advanced authentication features and security
 * @class UserAuthService
 * @description Manages enterprise-specific authentication features including advanced MFA,
 * OAuth, SSO, risk assessment, device management, and security policies. This service
 * complements the core AuthService with enterprise-grade security features.
 */
class UserAuthService {
    /**
     * @private
     * @type {AuthService}
     */
    #authService;

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
    #securityConfig = {
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        passwordResetExpiry: 3600000, // 1 hour
        mfaCodeExpiry: 300000, // 5 minutes
        sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
        deviceTrustDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxConcurrentSessions: 5,
        riskThresholds: {
            low: 20,
            medium: 40,
            high: 60,
            critical: 80
        }
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
     * @type {Object}
     */
    #riskFactors = {
        newDevice: 20,
        newLocation: 15,
        unusualTime: 10,
        vpnDetected: 25,
        multipleFailedAttempts: 30,
        suspiciousUserAgent: 15,
        anomalousLogin: 35,
        compromisedCredentials: 100
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
     * @param {AuthService} [dependencies.authService] - Core authentication service
     * @param {CacheService} [dependencies.cacheService] - Cache service instance
     * @param {EmailService} [dependencies.emailService] - Email service instance
     * @param {NotificationService} [dependencies.notificationService] - Notification service instance
     * @param {AuditService} [dependencies.auditService] - Audit service instance
     */
    constructor(dependencies = {}) {
        this.#authService = dependencies.authService || new AuthService();
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

    // ==================== ENHANCED AUTHENTICATION METHODS ====================

    /**
     * Enhanced authentication with risk assessment and adaptive security
     * @param {Object} credentials - Login credentials
     * @param {Object} deviceInfo - Device and request information
     * @param {Object} options - Authentication options
     * @returns {Promise<Object>} Enhanced authentication result
     */
    async authenticateWithRiskAssessment(credentials, deviceInfo, options = {}) {
        const {
            skipRiskAssessment = false,
            bypassMfa = false,
            rememberDevice = false
        } = options;

        try {
            // Calculate risk score before authentication
            let riskScore = 0;
            let riskFactors = [];

            if (!skipRiskAssessment) {
                const riskAssessment = await this.#calculateRiskScore(credentials.email, deviceInfo);
                riskScore = riskAssessment.score;
                riskFactors = riskAssessment.factors;
            }

            // Use core authentication service
            const authResult = await this.#authService.authenticate(credentials, {
                ipAddress: deviceInfo.ipAddress,
                userAgent: deviceInfo.userAgent,
                deviceId: deviceInfo.deviceId,
                correlationId: options.correlationId
            });

            // If authentication successful, enhance with risk data
            if (authResult.success) {
                authResult.security = {
                    riskScore,
                    riskFactors,
                    threatLevel: this.#getThreatLevel(riskScore),
                    trustedDevice: this.#isTrustedDevice(authResult.user.id, deviceInfo.deviceId),
                    recommendations: this.#getSecurityRecommendations(riskScore, riskFactors)
                };

                // Send security alerts if high risk
                if (riskScore > this.#securityConfig.riskThresholds.high) {
                    await this.#sendSecurityAlert(authResult.user, deviceInfo, riskScore, riskFactors);
                }

                // Trust device if requested and conditions met
                if (rememberDevice && riskScore < this.#securityConfig.riskThresholds.medium) {
                    await this.#trustDevice(authResult.user.id, deviceInfo);
                    authResult.security.deviceTrusted = true;
                }

                // Enhanced session tracking
                await this.#enhanceSessionTracking(authResult.session.id, {
                    riskScore,
                    riskFactors,
                    deviceInfo,
                    location: await this.#getLocationFromIP(deviceInfo.ipAddress)
                });
            }

            return authResult;

        } catch (error) {
            logger.error('Enhanced authentication failed', {
                error: error.message,
                credential: credentials.email,
                ipAddress: deviceInfo.ipAddress
            });
            throw error;
        }
    }

    /**
     * Setup multi-factor authentication for user with enhanced options
     * @param {string} userId - User ID
     * @param {string} method - MFA method to setup
     * @param {Object} options - Setup options
     * @returns {Promise<Object>} Enhanced MFA setup result
     */
    async setupAdvancedMFA(userId, method, options = {}) {
        const {
            label,
            issuer = 'Enterprise App',
            deviceInfo,
            phoneNumber,
            email,
            authenticatorName
        } = options;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Initialize MFA if not exists
            if (!user.mfa) {
                user.mfa = {
                    enabled: false,
                    methods: [],
                    lastUsedMethod: null,
                    lastUsedAt: null,
                    trustedDevices: []
                };
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
                    setupResult = await this.#setupSMS(user, { phoneNumber });
                    break;
                case 'email':
                    setupResult = await this.#setupEmailMFA(user, { email: email || user.email });
                    break;
                case 'webauthn':
                    setupResult = await this.#setupWebAuthn(user, { authenticatorName });
                    break;
                case 'backup_codes':
                    setupResult = await this.#setupBackupCodes(user);
                    break;
                case 'push':
                    setupResult = await this.#setupPushMFA(user, deviceInfo);
                    break;
                default:
                    throw new ValidationError('Unsupported MFA method', 'UNSUPPORTED_MFA_METHOD');
            }

            // Enhanced audit logging
            await this.#auditService.log({
                action: 'MFA_SETUP_INITIATED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    method,
                    label,
                    deviceInfo: deviceInfo ? {
                        deviceId: deviceInfo.deviceId,
                        userAgent: deviceInfo.userAgent,
                        ipAddress: deviceInfo.ipAddress
                    } : null
                }
            });

            logger.info('Advanced MFA setup initiated', {
                userId,
                method,
                label
            });

            return {
                ...setupResult,
                method,
                recommendations: this.#getMFARecommendations(user),
                securityLevel: this.#calculateMFASecurityLevel(user.mfa.methods || [])
            };

        } catch (error) {
            logger.error('Advanced MFA setup failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Complete MFA setup with enhanced verification and security
     * @param {string} userId - User ID
     * @param {string} method - MFA method being setup
     * @param {string} verificationCode - Verification code
     * @param {Object} options - Completion options
     * @returns {Promise<Object>} Enhanced MFA completion result
     */
    async completeAdvancedMFASetup(userId, method, verificationCode, options = {}) {
        const {
            makeDefault = false,
            deviceInfo,
            trustDevice = false
        } = options;

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

            // Verify setup code with enhanced validation
            const isValid = await this.#verifyMFACodeAdvanced(mfaMethod, verificationCode, {
                userId,
                deviceInfo
            });

            if (!isValid) {
                await this.#recordFailedMFA(userId, method, deviceInfo, 'setup_verification');
                throw new ValidationError('Invalid verification code', 'INVALID_VERIFICATION_CODE');
            }

            // Enable MFA method
            mfaMethod.enabled = true;
            mfaMethod.verifiedAt = new Date();
            mfaMethod.setupDeviceInfo = deviceInfo ? {
                deviceId: deviceInfo.deviceId,
                userAgent: deviceInfo.userAgent,
                ipAddress: deviceInfo.ipAddress
            } : null;

            // Set as primary if requested or first method
            if (makeDefault || !user.mfa.methods.some(m => m.enabled && m.isPrimary)) {
                user.mfa.methods.forEach(m => m.isPrimary = false);
                mfaMethod.isPrimary = true;
            }

            // Enable MFA if this is the first method
            if (!user.mfa.enabled) {
                user.mfa.enabled = true;
                user.mfa.enabledAt = new Date();
            }

            await user.save();

            // Generate backup codes if this is TOTP and none exist
            let backupCodes = null;
            if (method === 'totp' && !user.mfa.backupCodes?.length) {
                backupCodes = await this.#generateBackupCodes(user);
            }

            // Trust device if requested and appropriate
            if (trustDevice && deviceInfo) {
                await this.#trustDevice(userId, deviceInfo);
            }

            // Send enhanced confirmation notifications
            await this.#sendMFAEnabledNotifications(user, method, {
                deviceInfo,
                securityLevel: this.#calculateMFASecurityLevel(user.mfa.methods)
            });

            // Enhanced audit logging
            await this.#auditService.log({
                action: 'MFA_ENABLED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    method,
                    isPrimary: mfaMethod.isPrimary,
                    deviceInfo: mfaMethod.setupDeviceInfo,
                    totalMethods: user.mfa.methods.filter(m => m.enabled).length
                }
            });

            logger.info('Advanced MFA setup completed', {
                userId,
                method,
                isPrimary: mfaMethod.isPrimary,
                totalMethods: user.mfa.methods.filter(m => m.enabled).length
            });

            return {
                success: true,
                method,
                isPrimary: mfaMethod.isPrimary,
                backupCodes,
                deviceTrusted: trustDevice,
                securityLevel: this.#calculateMFASecurityLevel(user.mfa.methods),
                recommendations: this.#getMFANextSteps(user),
                totalEnabledMethods: user.mfa.methods.filter(m => m.enabled).length
            };

        } catch (error) {
            logger.error('Advanced MFA setup completion failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Authenticate with OAuth provider with enhanced security
     * @param {string} provider - OAuth provider (google, github, etc.)
     * @param {string} authorizationCode - Authorization code from provider
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - OAuth options
     * @returns {Promise<Object>} Enhanced OAuth authentication result
     */
    async authenticateWithOAuthAdvanced(provider, authorizationCode, deviceInfo, options = {}) {
        const {
            linkToExisting = false,
            createIfNotExists = true,
            organizationId
        } = options;

        try {
            // Get OAuth provider configuration
            const providerConfig = this.#oauthProviders.get(provider);
            if (!providerConfig) {
                throw new ValidationError('Unsupported OAuth provider', 'UNSUPPORTED_OAUTH_PROVIDER');
            }

            // Calculate risk score for OAuth attempt
            const riskScore = await this.#calculateOAuthRiskScore(provider, deviceInfo);

            // Exchange authorization code for tokens
            const tokenResponse = await this.#exchangeOAuthCode(provider, authorizationCode);

            // Get user info from provider with enhanced validation
            const userInfo = await this.#getOAuthUserInfoAdvanced(provider, tokenResponse.access_token);

            // Find or create user with enhanced logic
            let user = await UserModel.findByOAuthProvider(provider, userInfo.id);

            if (!user && userInfo.email) {
                user = await UserModel.findOne({
                    email: userInfo.email.toLowerCase(),
                    organizationId: organizationId || null
                });

                if (user && linkToExisting) {
                    // Link OAuth account to existing user with security checks
                    await this.#linkOAuthAccountAdvanced(user, provider, userInfo, tokenResponse, {
                        riskScore,
                        deviceInfo
                    });
                } else if (!user && createIfNotExists) {
                    // Create new user from OAuth data with enhanced profile
                    user = await this.#createUserFromOAuthAdvanced(provider, userInfo, tokenResponse, {
                        organizationId,
                        deviceInfo,
                        riskScore
                    });
                }
            }

            if (!user) {
                throw new NotFoundError('User not found and creation disabled', 'USER_NOT_FOUND');
            }

            // Update OAuth tokens with rotation
            await this.#updateOAuthTokensAdvanced(user, provider, tokenResponse);

            // Use core auth service for session creation
            const sessionData = {
                userId: user._id,
                organizationId: user.organizationId || organizationId,
                ipAddress: deviceInfo.ipAddress,
                userAgent: deviceInfo.userAgent,
                deviceId: deviceInfo.deviceId
            };

            // Generate tokens
            const tokens = await this.#authService._generateAuthTokens(user);

            // Create enhanced session
            const session = await this.#createEnhancedSession(user, deviceInfo, {
                authMethod: 'oauth',
                provider,
                riskScore,
                userInfo
            });

            // Record OAuth login with enhanced tracking
            await user.recordLogin({
                ...deviceInfo,
                authMethod: 'oauth',
                authProvider: provider,
                success: true,
                riskScore,
                location: await this.#getLocationFromIP(deviceInfo.ipAddress)
            });

            // Enhanced audit logging
            await this.#auditService.log({
                action: 'OAUTH_AUTHENTICATED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    provider,
                    linked: !!linkToExisting,
                    created: !linkToExisting && createIfNotExists,
                    riskScore,
                    userInfo: {
                        id: userInfo.id,
                        email: userInfo.email,
                        verified: userInfo.verified_email
                    }
                }
            });

            logger.info('Enhanced OAuth authentication successful', {
                userId: user._id,
                provider,
                email: userInfo.email,
                riskScore
            });

            return {
                success: true,
                user: this.#sanitizeUser(user),
                tokens,
                session: {
                    sessionId: session.sessionId,
                    expiresAt: session.expiresAt
                },
                provider: {
                    name: provider,
                    userInfo: {
                        id: userInfo.id,
                        email: userInfo.email,
                        name: userInfo.name,
                        verified: userInfo.verified_email
                    }
                },
                security: {
                    riskScore,
                    threatLevel: this.#getThreatLevel(riskScore),
                    authMethod: 'oauth'
                }
            };

        } catch (error) {
            logger.error('Enhanced OAuth authentication failed', {
                error: error.message,
                provider,
                deviceInfo: deviceInfo.deviceId
            });
            throw error;
        }
    }

    /**
     * Authenticate with SSO (SAML/OIDC) with enhanced enterprise features
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - SSO options
     * @returns {Promise<Object>} Enhanced SSO authentication result
     */
    async authenticateWithSSOAdvanced(provider, ssoResponse, deviceInfo, options = {}) {
        const {
            validateSignature = true,
            allowProvisioning = true,
            organizationId,
            roleMapping = true
        } = options;

        try {
            // Get SSO provider configuration
            const providerConfig = this.#ssoProviders.get(provider);
            if (!providerConfig) {
                throw new ValidationError('Unsupported SSO provider', 'UNSUPPORTED_SSO_PROVIDER');
            }

            // Calculate risk score for SSO attempt
            const riskScore = await this.#calculateSSORequestRiskScore(provider, ssoResponse, deviceInfo);

            // Validate SSO response with enhanced security
            if (validateSignature) {
                await this.#validateSSOSignatureAdvanced(provider, ssoResponse);
            }

            // Extract user attributes with enhanced mapping
            const userAttributes = await this.#extractSSOAttributesAdvanced(provider, ssoResponse);

            // Find or provision user with enhanced logic
            let user = await this.#findOrProvisionSSOUserAdvanced(provider, userAttributes, {
                allowProvisioning,
                organizationId,
                roleMapping,
                deviceInfo
            });

            // Update user attributes from SSO
            await this.#updateUserFromSSO(user, userAttributes, { roleMapping });

            // Create enhanced session with SSO context
            const session = await this.#createEnhancedSession(user, deviceInfo, {
                authMethod: 'sso',
                provider,
                riskScore,
                ssoAttributes: userAttributes
            });

            // Generate tokens
            const tokens = await this.#authService._generateAuthTokens(user);

            // Record SSO login
            await user.recordLogin({
                ...deviceInfo,
                authMethod: 'sso',
                authProvider: provider,
                success: true,
                riskScore,
                location: await this.#getLocationFromIP(deviceInfo.ipAddress)
            });

            // Enhanced audit logging
            await this.#auditService.log({
                action: 'SSO_AUTHENTICATED',
                entityType: 'authentication',
                entityId: user._id,
                userId: user._id,
                details: {
                    provider,
                    organizationId,
                    riskScore,
                    attributes: Object.keys(userAttributes),
                    roleMapping
                }
            });

            logger.info('Enhanced SSO authentication successful', {
                userId: user._id,
                provider,
                email: userAttributes.email,
                riskScore
            });

            return {
                success: true,
                user: this.#sanitizeUser(user),
                tokens,
                session: {
                    sessionId: session.sessionId,
                    expiresAt: session.expiresAt
                },
                sso: {
                    provider,
                    attributes: userAttributes,
                    rolesMapped: roleMapping
                },
                security: {
                    riskScore,
                    threatLevel: this.#getThreatLevel(riskScore),
                    authMethod: 'sso'
                }
            };

        } catch (error) {
            logger.error('Enhanced SSO authentication failed', {
                error: error.message,
                provider,
                deviceInfo: deviceInfo.deviceId
            });
            throw error;
        }
    }

    // ==================== DEVICE AND SESSION MANAGEMENT ====================

    /**
     * Get user sessions with enhanced filtering and security information
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Enhanced user sessions data
     */
    async getUserSessionsAdvanced(userId, options = {}) {
        const {
            status = 'active',
            limit = 20,
            offset = 0,
            includeExpired = false,
            includeRiskData = true,
            requesterId
        } = options;

        try {
            // Check permissions
            if (requesterId !== userId) {
                await this.#checkSessionAccessPermission(requesterId, userId);
            }

            // Build enhanced query
            const query = { userId };
            if (!includeExpired) {
                query.expiresAt = { $gt: new Date() };
            }
            if (status) {
                query.status = status;
            }

            // Get sessions with enhanced data
            const [sessions, totalCount] = await Promise.all([
                UserSessionModel.find(query)
                    .sort({ lastActivityAt: -1 })
                    .limit(limit)
                    .skip(offset),
                UserSessionModel.countDocuments(query)
            ]);

            // Process sessions with enhanced information
            const processedSessions = await Promise.all(
                sessions.map(async (session) => {
                    const sessionData = {
                        sessionId: session.sessionId,
                        deviceInfo: session.deviceInfo,
                        location: session.location,
                        createdAt: session.createdAt,
                        lastActivityAt: session.lastActivityAt,
                        expiresAt: session.expiresAt,
                        status: session.status,
                        authMethod: session.authMethod,
                        authProvider: session.authProvider,
                        isCurrent: false // This would be determined by comparing with current session
                    };

                    if (includeRiskData && session.security) {
                        sessionData.security = {
                            riskScore: session.security.riskScore,
                            threatLevel: session.security.threatLevel,
                            riskFactors: session.security.riskFactors,
                            suspicious: session.security.riskScore > this.#securityConfig.riskThresholds.high
                        };
                    }

                    // Add device trust status
                    if (session.deviceInfo?.deviceId) {
                        sessionData.deviceTrusted = this.#isTrustedDevice(userId, session.deviceInfo.deviceId);
                    }

                    return sessionData;
                })
            );

            return {
                sessions: processedSessions,
                pagination: {
                    totalCount,
                    limit,
                    offset,
                    hasMore: totalCount > offset + sessions.length
                },
                security: {
                    totalActiveSessions: processedSessions.filter(s => s.status === 'active').length,
                    suspiciousSessions: processedSessions.filter(s => s.security?.suspicious).length,
                    trustedDevices: processedSessions.filter(s => s.deviceTrusted).length
                }
            };

        } catch (error) {
            logger.error('Error fetching enhanced user sessions', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Revoke session with enhanced security and notifications
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID to revoke
     * @param {string} revokedBy - ID of user revoking session
     * @param {Object} options - Revocation options
     * @returns {Promise<Object>} Enhanced revocation result
     */
    async revokeSessionAdvanced(userId, sessionId, revokedBy, options = {}) {
        const {
            reason = 'manual_revocation',
            notifyUser = true,
            blacklistTokens = true
        } = options;

        try {
            // Check permissions
            if (revokedBy !== userId) {
                await this.#checkSessionRevokePermission(revokedBy, userId);
            }

            // Find session with enhanced data
            const session = await UserSessionModel.findOne({ sessionId, userId });
            if (!session) {
                throw new NotFoundError('Session not found', 'SESSION_NOT_FOUND');
            }

            // Blacklist tokens if requested
            if (blacklistTokens && session.accessToken) {
                await this.#authService._blacklistService.blacklistToken(session.accessToken, reason);
                if (session.refreshToken) {
                    await this.#authService._blacklistService.blacklistToken(session.refreshToken, reason);
                }
            }

            // Terminate session with enhanced logging
            await session.terminate(reason, {
                revokedBy,
                revokedAt: new Date(),
                metadata: options.metadata
            });

            // Clean up caches
            this.#activeSessions.delete(sessionId);

            // Send notification if requested
            if (notifyUser && revokedBy !== userId) {
                await this.#sendSessionRevokedNotification(userId, session, revokedBy, reason);
            }

            // Enhanced audit logging
            await this.#auditService.log({
                action: 'SESSION_REVOKED',
                entityType: 'authentication',
                entityId: userId,
                userId: revokedBy,
                details: {
                    sessionId,
                    reason,
                    deviceInfo: session.deviceInfo,
                    location: session.location,
                    sessionDuration: Date.now() - session.createdAt.getTime(),
                    blacklistTokens
                }
            });

            logger.info('Session revoked with enhanced security', {
                userId,
                sessionId,
                revokedBy,
                reason,
                blacklistTokens
            });

            return {
                success: true,
                message: 'Session revoked successfully',
                sessionId,
                tokensBlacklisted: blacklistTokens,
                notificationSent: notifyUser && revokedBy !== userId
            };

        } catch (error) {
            logger.error('Enhanced session revocation failed', {
                error: error.message,
                userId,
                sessionId,
                revokedBy
            });
            throw error;
        }
    }

    /**
     * Manage trusted devices for user
     * @param {string} userId - User ID
     * @param {Object} deviceInfo - Device information
     * @param {string} action - Action to perform (trust, untrust, list)
     * @param {Object} options - Management options
     * @returns {Promise<Object>} Device management result
     */
    async manageTrustedDevices(userId, deviceInfo, action, options = {}) {
        const { requesterId = userId } = options;

        try {
            // Check permissions
            if (requesterId !== userId) {
                await this.#checkDeviceManagementPermission(requesterId, userId);
            }

            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            let result = {};

            switch (action) {
                case 'trust':
                    result = await this.#trustDeviceAdvanced(userId, deviceInfo, options);
                    break;
                case 'untrust':
                    result = await this.#untrustDevice(userId, deviceInfo.deviceId, options);
                    break;
                case 'list':
                    result = await this.#listTrustedDevices(userId, options);
                    break;
                case 'clear_all':
                    result = await this.#clearAllTrustedDevices(userId, options);
                    break;
                default:
                    throw new ValidationError('Invalid device action', 'INVALID_DEVICE_ACTION');
            }

            // Audit device management
            await this.#auditService.log({
                action: `DEVICE_${action.toUpperCase()}`,
                entityType: 'authentication',
                entityId: userId,
                userId: requesterId,
                details: {
                    deviceId: deviceInfo?.deviceId,
                    action,
                    userAgent: deviceInfo?.userAgent,
                    ipAddress: deviceInfo?.ipAddress
                }
            });

            return result;

        } catch (error) {
            logger.error('Device management failed', {
                error: error.message,
                userId,
                action,
                deviceId: deviceInfo?.deviceId
            });
            throw error;
        }
    }

    // ==================== SECURITY AND RISK ASSESSMENT ====================

    /**
     * Perform comprehensive security assessment for user
     * @param {string} userId - User ID
     * @param {Object} options - Assessment options
     * @returns {Promise<Object>} Security assessment result
     */
    async performSecurityAssessment(userId, options = {}) {
        const { includeRecommendations = true, includeThreatAnalysis = true } = options;

        try {
            const user = await UserModel.findById(userId)
                .populate('sessions')
                .populate('organizations.organizationId');

            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            const assessment = {
                userId,
                timestamp: new Date(),
                overallScore: 0,
                categories: {}
            };

            // Password security assessment
            assessment.categories.password = await this.#assessPasswordSecurity(user);

            // MFA security assessment
            assessment.categories.mfa = await this.#assessMFASecurity(user);

            // Session security assessment
            assessment.categories.sessions = await this.#assessSessionSecurity(user);

            // Device security assessment
            assessment.categories.devices = await this.#assessDeviceSecurity(user);

            // Account security assessment
            assessment.categories.account = await this.#assessAccountSecurity(user);

            // Calculate overall score
            const categoryScores = Object.values(assessment.categories).map(cat => cat.score);
            assessment.overallScore = Math.round(
                categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length
            );

            assessment.securityLevel = this.#getSecurityLevel(assessment.overallScore);

            // Add recommendations if requested
            if (includeRecommendations) {
                assessment.recommendations = this.#generateSecurityRecommendations(assessment);
            }

            // Add threat analysis if requested
            if (includeThreatAnalysis) {
                assessment.threats = await this.#analyzePotentialThreats(user, assessment);
            }

            // Audit security assessment
            await this.#auditService.log({
                action: 'SECURITY_ASSESSMENT',
                entityType: 'security',
                entityId: userId,
                userId: userId,
                details: {
                    overallScore: assessment.overallScore,
                    securityLevel: assessment.securityLevel,
                    categories: Object.keys(assessment.categories)
                }
            });

            logger.info('Security assessment completed', {
                userId,
                overallScore: assessment.overallScore,
                securityLevel: assessment.securityLevel
            });

            return assessment;

        } catch (error) {
            logger.error('Security assessment failed', {
                error: error.message,
                userId
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
        // OAuth providers configuration with enhanced security
        this.#oauthProviders.set('google', {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            redirectUri: process.env.GOOGLE_REDIRECT_URI,
            scope: 'openid email profile',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
            revokeUrl: 'https://oauth2.googleapis.com/revoke',
            security: {
                validateState: true,
                requirePKCE: true,
                tokenRotation: true
            }
        });

        this.#oauthProviders.set('github', {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            redirectUri: process.env.GITHUB_REDIRECT_URI,
            scope: 'user:email',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userInfoUrl: 'https://api.github.com/user',
            revokeUrl: 'https://github.com/settings/connections/applications',
            security: {
                validateState: true,
                requirePKCE: false,
                tokenRotation: true
            }
        });

        this.#oauthProviders.set('linkedin', {
            clientId: process.env.LINKEDIN_CLIENT_ID,
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
            redirectUri: process.env.LINKEDIN_REDIRECT_URI,
            scope: 'r_liteprofile r_emailaddress',
            tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
            userInfoUrl: 'https://api.linkedin.com/v2/people/~',
            security: {
                validateState: true,
                requirePKCE: true,
                tokenRotation: true
            }
        });

        // SSO providers would be configured here with enterprise settings
        this.#ssoProviders.set('enterprise_saml', {
            entityId: process.env.SAML_ENTITY_ID,
            ssoUrl: process.env.SAML_SSO_URL,
            sloUrl: process.env.SAML_SLO_URL,
            certificate: process.env.SAML_CERTIFICATE,
            attributeMapping: {
                email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
                roles: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
            },
            security: {
                signatureRequired: true,
                encryptionRequired: false,
                clockSkewTolerance: 300
            }
        });
    }

    /**
     * Setup cleanup intervals for enhanced security
     * @private
     */
    #setupCleanupIntervals() {
        // Clean up expired MFA codes every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, data] of this.#mfaCodes) {
                if (now > data.expiresAt) {
                    this.#mfaCodes.delete(key);
                }
            }
        }, 300000);

        // Clean up expired trusted devices every hour
        setInterval(() => {
            const now = Date.now();
            for (const [key, data] of this.#trustedDevices) {
                if (now > data.expiresAt) {
                    this.#trustedDevices.delete(key);
                }
            }
        }, 3600000);

        // Clean up expired sessions every 30 minutes
        setInterval(async () => {
            try {
                await UserSessionModel.cleanupExpiredSessions();

                // Clean local session cache
                for (const [sessionId, session] of this.#activeSessions) {
                    if (session.expiresAt < new Date()) {
                        this.#activeSessions.delete(sessionId);
                    }
                }
            } catch (error) {
                logger.error('Session cleanup failed', { error: error.message });
            }
        }, 1800000);
    }

    /**
     * Calculate comprehensive risk score for authentication attempt
     * @private
     * @param {string} identifier - Email or username
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<Object>} Risk assessment with score and factors
     */
    async #calculateRiskScore(identifier, deviceInfo) {
        let score = 0;
        const factors = [];

        try {
            // Get user for historical analysis
            const user = await UserModel.findOne({
                $or: [
                    { email: identifier.toLowerCase() },
                    { username: identifier }
                ]
            });

            if (!user) {
                factors.push('unknown_user');
                score += 10;
            } else {
                // Check for new device
                if (!this.#isTrustedDevice(user._id, deviceInfo.deviceId)) {
                    factors.push('new_device');
                    score += this.#riskFactors.newDevice;
                }

                // Check for new location
                const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
                if (location && !this.#isKnownLocation(user, location)) {
                    factors.push('new_location');
                    score += this.#riskFactors.newLocation;
                }

                // Check for unusual login time
                if (this.#isUnusualLoginTime(user, new Date())) {
                    factors.push('unusual_time');
                    score += this.#riskFactors.unusualTime;
                }

                // Check recent failed attempts
                if (user.security?.loginAttempts?.count > 0) {
                    factors.push('recent_failed_attempts');
                    score += this.#riskFactors.multipleFailedAttempts;
                }

                // Check for anomalous login patterns
                if (await this.#detectAnomalousLoginPattern(user, deviceInfo)) {
                    factors.push('anomalous_pattern');
                    score += this.#riskFactors.anomalousLogin;
                }
            }

            // Check for VPN/Proxy
            if (await this.#isVPNOrProxy(deviceInfo.ipAddress)) {
                factors.push('vpn_or_proxy');
                score += this.#riskFactors.vpnDetected;
            }

            // Check user agent
            if (this.#isSuspiciousUserAgent(deviceInfo.userAgent)) {
                factors.push('suspicious_user_agent');
                score += this.#riskFactors.suspiciousUserAgent;
            }

            // Check for compromised credentials (integrate with threat intelligence)
            if (await this.#checkCompromisedCredentials(identifier)) {
                factors.push('compromised_credentials');
                score += this.#riskFactors.compromisedCredentials;
            }

            return {
                score: Math.min(score, 100),
                factors,
                assessment: this.#getThreatLevel(score)
            };

        } catch (error) {
            logger.error('Risk calculation failed', {
                error: error.message,
                identifier,
                deviceInfo: deviceInfo.deviceId
            });

            // Return high risk on calculation failure
            return {
                score: 75,
                factors: ['calculation_error'],
                assessment: 'high'
            };
        }
    }

    /**
     * Setup TOTP MFA with enhanced security
     * @private
     * @param {Object} user - User object
     * @param {Object} options - TOTP options
     * @returns {Promise<Object>} Enhanced TOTP setup data
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
            verifiedAt: null,
            createdAt: new Date(),
            issuer: issuer || 'Enterprise App'
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Generate QR code with enhanced data
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url, {
            errorCorrectionLevel: 'M',
            width: 256,
            margin: 2
        });

        return {
            secret: secret.base32,
            qrCode: qrCodeUrl,
            manualEntryKey: secret.base32,
            issuer: issuer || 'Enterprise App',
            accountName: label || user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30
        };
    }

    /**
     * Setup Push notification MFA
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<Object>} Push MFA setup result
     */
    async #setupPushMFA(user, deviceInfo) {
        if (!deviceInfo || !deviceInfo.pushToken) {
            throw new ValidationError('Push token required for push MFA', 'PUSH_TOKEN_REQUIRED');
        }

        // Generate device registration
        const deviceRegistration = {
            deviceId: deviceInfo.deviceId,
            pushToken: deviceInfo.pushToken,
            platform: deviceInfo.platform || 'unknown',
            appVersion: deviceInfo.appVersion,
            registeredAt: new Date()
        };

        // Add push method to user
        const mfaMethod = {
            type: 'push',
            enabled: false,
            deviceRegistration,
            verifiedAt: null,
            createdAt: new Date()
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Send test push notification for verification
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        await this.#sendPushNotification(deviceInfo.pushToken, {
            title: 'Verify Push Notifications',
            body: `Your verification code is: ${verificationCode}`,
            data: {
                type: 'mfa_setup',
                code: verificationCode,
                userId: user._id.toString()
            }
        });

        // Store verification code temporarily
        const codeKey = `push_setup:${user._id}:${verificationCode}`;
        this.#mfaCodes.set(codeKey, {
            userId: user._id,
            code: verificationCode,
            deviceId: deviceInfo.deviceId,
            expiresAt: Date.now() + this.#securityConfig.mfaCodeExpiry
        });

        return {
            deviceId: deviceInfo.deviceId,
            message: 'Push notification sent to your device for verification',
            expiresIn: this.#securityConfig.mfaCodeExpiry / 1000
        };
    }

    /**
     * Enhanced MFA code verification with additional security checks
     * @private
     * @param {Object} mfaMethod - MFA method object
     * @param {string} code - Code to verify
     * @param {Object} context - Verification context
     * @returns {Promise<boolean>} Verification result
     */
    async #verifyMFACodeAdvanced(mfaMethod, code, context = {}) {
        const { userId, deviceInfo } = context;

        try {
            switch (mfaMethod.type) {
                case 'totp':
                    return speakeasy.totp.verify({
                        secret: mfaMethod.secret,
                        encoding: 'base32',
                        token: code,
                        window: 2 // Allow 2 time steps for clock drift
                    });

                case 'sms':
                case 'email':
                    const storedCode = this.#mfaCodes.get(`${mfaMethod.type}_setup:${userId}:${code}`);
                    if (storedCode && storedCode.expiresAt > Date.now()) {
                        this.#mfaCodes.delete(`${mfaMethod.type}_setup:${userId}:${code}`);
                        return true;
                    }
                    return false;

                case 'push':
                    const pushCode = this.#mfaCodes.get(`push_setup:${userId}:${code}`);
                    if (pushCode && pushCode.expiresAt > Date.now()) {
                        // Verify device ID matches
                        if (deviceInfo?.deviceId === pushCode.deviceId) {
                            this.#mfaCodes.delete(`push_setup:${userId}:${code}`);
                            return true;
                        }
                    }
                    return false;

                case 'webauthn':
                    // WebAuthn verification would be implemented here
                    return await this.#verifyWebAuthnAssertion(mfaMethod, code, context);

                default:
                    return false;
            }
        } catch (error) {
            logger.error('Advanced MFA verification failed', {
                error: error.message,
                method: mfaMethod.type,
                userId
            });
            return false;
        }
    }

    /**
     * Get threat level from risk score
     * @private
     * @param {number} riskScore - Risk score
     * @returns {string} Threat level
     */
    #getThreatLevel(riskScore) {
        const thresholds = this.#securityConfig.riskThresholds;

        if (riskScore >= thresholds.critical) return 'critical';
        if (riskScore >= thresholds.high) return 'high';
        if (riskScore >= thresholds.medium) return 'medium';
        if (riskScore >= thresholds.low) return 'low';
        return 'none';
    }

    /**
     * Generate security recommendations based on risk factors
     * @private
     * @param {number} riskScore - Risk score
     * @param {Array} riskFactors - Risk factors
     * @returns {Array} Security recommendations
     */
    #getSecurityRecommendations(riskScore, riskFactors) {
        const recommendations = [];

        if (riskFactors.includes('new_device')) {
            recommendations.push({
                type: 'device_verification',
                priority: 'high',
                message: 'Verify this device if it belongs to you',
                action: 'trust_device'
            });
        }

        if (riskFactors.includes('new_location')) {
            recommendations.push({
                type: 'location_verification',
                priority: 'medium',
                message: 'Confirm login from new location',
                action: 'verify_location'
            });
        }

        if (riskScore > this.#securityConfig.riskThresholds.high) {
            recommendations.push({
                type: 'security_review',
                priority: 'critical',
                message: 'Review account security settings immediately',
                action: 'security_assessment'
            });
        }

        return recommendations;
    }

    /**
     * Sanitizes user object for response
     * @private
     * @param {Object} user - User object
     * @returns {Object} Sanitized user object
     */
    #sanitizeUser(user) {
        const sanitized = user.toObject ? user.toObject() : { ...user };

        // Remove sensitive fields
        delete sanitized.password;
        delete sanitized.passwordHistory;
        if (sanitized.mfa) {
            delete sanitized.mfa.secret;
            delete sanitized.mfa.backupCodes;
            if (sanitized.mfa.methods) {
                sanitized.mfa.methods.forEach(method => {
                    delete method.secret;
                    delete method.deviceRegistration?.pushToken;
                });
            }
        }
        delete sanitized.security?.passwordReset;
        if (sanitized.verification?.email) {
            delete sanitized.verification.email.token;
        }

        return sanitized;
    }

    // Additional private methods would be implemented here for:
    // - OAuth provider interactions
    // - SSO SAML/OIDC handling
    // - Device fingerprinting
    // - Risk analysis algorithms
    // - Security assessments
    // - Threat intelligence integration
    // - Notification services
    // - And other enterprise security features

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
     * Trust a device with enhanced tracking
     * @private
     * @param {string} userId - User ID
     * @param {Object} deviceInfo - Device information
     * @param {Object} options - Trust options
     */
    async #trustDeviceAdvanced(userId, deviceInfo, options = {}) {
        const { duration = this.#securityConfig.deviceTrustDuration } = options;

        const key = `${userId}:${deviceInfo.deviceId}`;
        const trustedDevice = {
            userId,
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName || 'Unknown Device',
            userAgent: deviceInfo.userAgent,
            trustedAt: Date.now(),
            expiresAt: Date.now() + duration,
            ipAddress: deviceInfo.ipAddress,
            location: await this.#getLocationFromIP(deviceInfo.ipAddress)
        };

        this.#trustedDevices.set(key, trustedDevice);

        // Also store in database for persistence
        const user = await UserModel.findById(userId);
        if (user) {
            if (!user.mfa.trustedDevices) user.mfa.trustedDevices = [];

            // Remove existing entry for same device
            user.mfa.trustedDevices = user.mfa.trustedDevices.filter(
                device => device.deviceId !== deviceInfo.deviceId
            );

            // Add new trusted device
            user.mfa.trustedDevices.push(trustedDevice);
            await user.save();
        }

        return {
            success: true,
            deviceId: deviceInfo.deviceId,
            expiresAt: new Date(trustedDevice.expiresAt),
            message: 'Device trusted successfully'
        };
    }

    /**
     * Get location from IP address with enhanced data
     * @private
     * @param {string} ipAddress - IP address
     * @returns {Promise<Object>} Enhanced location data
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
                    timezone: geo.timezone,
                    isp: geo.org || 'Unknown ISP',
                    asn: geo.as || 'Unknown ASN'
                };
            }
        } catch (error) {
            logger.warn('Failed to get enhanced location from IP', {
                ipAddress,
                error: error.message
            });
        }
        return null;
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
     * Check if IP address is VPN or proxy with enhanced detection
     * @private
     * @param {string} ipAddress - IP address to check
     * @returns {Promise<boolean>} Is VPN or proxy
     */
    async #isVPNOrProxy(ipAddress) {
        try {
            // Basic checks for private/local IPs
            const privateRanges = [
                /^10\./,
                /^172\.(1[6-9]|2[0-9]|3[01])\./,
                /^192\.168\./,
                /^127\./,
                /^169\.254\./
            ];

            if (privateRanges.some(range => range.test(ipAddress))) {
                return false; // Private IPs are not VPNs
            }

            // In production, integrate with VPN detection services
            // like IPInfo, MaxMind, or similar services

            // Mock implementation - would be replaced with actual service calls
            const suspiciousProviders = [
                'amazonaws.com',
                'googlecloud.com',
                'digitalocean.com',
                'linode.com'
            ];

            // Simple hostname check (in production, use proper APIs)
            try {
                // This would be replaced with actual reverse DNS lookup
                // and VPN detection service integration
                return false;
            } catch {
                return false;
            }

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
            /postman/i,
            /automated/i,
            /script/i
        ];

        return suspiciousPatterns.some(pattern => pattern.test(userAgent));
    }

    /**
     * Detect anomalous login patterns
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<boolean>} Is anomalous pattern detected
     */
    async #detectAnomalousLoginPattern(user, deviceInfo) {
        if (!user.activity?.loginHistory || user.activity.loginHistory.length < 10) {
            return false; // Not enough data for pattern analysis
        }

        try {
            const recentLogins = user.activity.loginHistory
                .slice(0, 20) // Last 20 logins
                .filter(login => login.success);

            // Check for rapid successive logins from different locations
            const locationChanges = recentLogins.reduce((changes, login, index) => {
                if (index === 0) return changes;

                const prevLogin = recentLogins[index - 1];
                const timeDiff = new Date(login.timestamp) - new Date(prevLogin.timestamp);

                // If locations differ and time between logins is less than reasonable travel time
                if (login.location && prevLogin.location &&
                    login.location.city !== prevLogin.location.city &&
                    timeDiff < 3600000) { // Less than 1 hour
                    changes++;
                }

                return changes;
            }, 0);

            // Anomalous if more than 2 impossible location changes in recent history
            return locationChanges > 2;

        } catch (error) {
            logger.warn('Pattern analysis failed', {
                userId: user._id,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Check for compromised credentials using threat intelligence
     * @private
     * @param {string} identifier - Email or username
     * @returns {Promise<boolean>} Are credentials compromised
     */
    async #checkCompromisedCredentials(identifier) {
        try {
            // In production, integrate with services like:
            // - Have I Been Pwned API
            // - Threat intelligence feeds
            // - Internal breach databases

            // Mock implementation
            const knownCompromisedEmails = await this.#cacheService.get('compromised_emails') || [];
            return knownCompromisedEmails.includes(identifier.toLowerCase());

        } catch (error) {
            logger.warn('Compromised credential check failed', {
                identifier,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Enhanced session creation with additional security context
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @param {Object} securityContext - Security context
     * @returns {Promise<Object>} Enhanced session data
     */
    async #createEnhancedSession(user, deviceInfo, securityContext = {}) {
        // This would integrate with the core SessionService
        // but add enterprise-specific security context

        const sessionData = {
            userId: user._id,
            organizationId: user.organizationId,
            deviceInfo: {
                ...deviceInfo,
                trusted: this.#isTrustedDevice(user._id, deviceInfo.deviceId)
            },
            security: {
                riskScore: securityContext.riskScore || 0,
                threatLevel: this.#getThreatLevel(securityContext.riskScore || 0),
                authMethod: securityContext.authMethod || 'password',
                authProvider: securityContext.provider,
                riskFactors: securityContext.riskFactors || []
            },
            location: await this.#getLocationFromIP(deviceInfo.ipAddress),
            metadata: {
                userAgent: deviceInfo.userAgent,
                ipAddress: deviceInfo.ipAddress,
                sessionType: 'web'
            }
        };

        // Create session using the core service but enhance with our data
        const session = await UserSessionModel.createSession(sessionData);

        // Cache the enhanced session
        this.#activeSessions.set(session.sessionId, session);

        return session;
    }

    // ==================== OAUTH PROVIDER METHODS ====================

    /**
     * Exchange OAuth authorization code for tokens with enhanced security
     * @private
     * @param {string} provider - OAuth provider
     * @param {string} authorizationCode - Authorization code
     * @returns {Promise<Object>} Token response with enhanced validation
     */
    async #exchangeOAuthCode(provider, authorizationCode) {
        const providerConfig = this.#oauthProviders.get(provider);
        if (!providerConfig) {
            throw new ValidationError('Provider configuration not found', 'PROVIDER_CONFIG_MISSING');
        }

        const tokenRequest = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'User-Agent': 'Enterprise-Auth-Service/1.0'
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
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(providerConfig.tokenUrl, tokenRequest);

            if (!response.ok) {
                throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
            }

            const tokenData = await response.json();

            // Validate required fields
            if (!tokenData.access_token) {
                throw new Error('Access token not received from provider');
            }

            // Enhanced token validation
            return {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in || 3600,
                token_type: tokenData.token_type || 'Bearer',
                scope: tokenData.scope,
                id_token: tokenData.id_token
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
     * Get enhanced user information from OAuth provider
     * @private
     * @param {string} provider - OAuth provider
     * @param {string} accessToken - Access token
     * @returns {Promise<Object>} Enhanced user information
     */
    async #getOAuthUserInfoAdvanced(provider, accessToken) {
        const providerConfig = this.#oauthProviders.get(provider);

        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(providerConfig.userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`User info request failed: ${response.status}`);
            }

            const userInfo = await response.json();

            // Provider-specific user info processing
            switch (provider) {
                case 'google':
                    return {
                        id: userInfo.id,
                        email: userInfo.email,
                        name: userInfo.name,
                        firstName: userInfo.given_name,
                        lastName: userInfo.family_name,
                        picture: userInfo.picture,
                        verified_email: userInfo.verified_email,
                        locale: userInfo.locale
                    };

                case 'github':
                    // GitHub requires additional call for email if not public
                    let email = userInfo.email;
                    if (!email) {
                        const emailResponse = await fetch('https://api.github.com/user/emails', {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        const emails = await emailResponse.json();
                        const primaryEmail = emails.find(e => e.primary);
                        email = primaryEmail ? primaryEmail.email : null;
                    }

                    return {
                        id: userInfo.id.toString(),
                        email: email,
                        name: userInfo.name || userInfo.login,
                        firstName: userInfo.name ? userInfo.name.split(' ')[0] : '',
                        lastName: userInfo.name ? userInfo.name.split(' ').slice(1).join(' ') : '',
                        picture: userInfo.avatar_url,
                        verified_email: true,
                        username: userInfo.login
                    };

                case 'linkedin':
                    return {
                        id: userInfo.id,
                        email: userInfo.emailAddress,
                        name: `${userInfo.firstName?.localized?.en_US || ''} ${userInfo.lastName?.localized?.en_US || ''}`.trim(),
                        firstName: userInfo.firstName?.localized?.en_US || '',
                        lastName: userInfo.lastName?.localized?.en_US || '',
                        picture: userInfo.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier,
                        verified_email: true
                    };

                default:
                    return userInfo;
            }

        } catch (error) {
            logger.error('OAuth user info retrieval failed', {
                provider,
                error: error.message
            });
            throw new ValidationError('Failed to retrieve user information', 'OAUTH_USER_INFO_FAILED');
        }
    }

    /**
     * Link OAuth account to existing user with enhanced security
     * @private
     * @param {Object} user - Existing user object
     * @param {string} provider - OAuth provider
     * @param {Object} userInfo - OAuth user information
     * @param {Object} tokenResponse - OAuth token response
     * @param {Object} securityContext - Security context
     */
    async #linkOAuthAccountAdvanced(user, provider, userInfo, tokenResponse, securityContext) {
        const { riskScore, deviceInfo } = securityContext;

        // Security check for account linking
        if (riskScore > this.#securityConfig.riskThresholds.medium) {
            await this.#sendSecurityAlert(user, deviceInfo, riskScore, ['oauth_account_linking']);
        }

        // Initialize OAuth accounts if not exists
        if (!user.authProviders) user.authProviders = [];

        // Check if provider already linked
        const existingProvider = user.authProviders.find(p => p.provider === provider);
        if (existingProvider) {
            throw new ConflictError('OAuth provider already linked to this account', 'OAUTH_PROVIDER_EXISTS');
        }

        // Add OAuth account with enhanced data
        user.authProviders.push({
            provider,
            providerId: userInfo.id,
            providerData: {
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
                profile: userInfo
            },
            tokens: {
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token,
                tokenExpiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000))
            },
            linkedAt: new Date(),
            linkingContext: {
                ipAddress: deviceInfo.ipAddress,
                userAgent: deviceInfo.userAgent,
                riskScore
            }
        });

        await user.save();

        // Audit OAuth linking
        await this.#auditService.log({
            action: 'OAUTH_ACCOUNT_LINKED',
            entityType: 'authentication',
            entityId: user._id,
            userId: user._id,
            details: {
                provider,
                providerEmail: userInfo.email,
                riskScore,
                deviceInfo: {
                    deviceId: deviceInfo.deviceId,
                    ipAddress: deviceInfo.ipAddress
                }
            }
        });

        logger.info('OAuth account linked with enhanced security', {
            userId: user._id,
            provider,
            providerEmail: userInfo.email,
            riskScore
        });
    }

    /**
     * Create new user from OAuth data with enhanced profile and security
     * @private
     * @param {string} provider - OAuth provider
     * @param {Object} userInfo - OAuth user information
     * @param {Object} tokenResponse - OAuth token response
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created user with enhanced data
     */
    async #createUserFromOAuthAdvanced(provider, userInfo, tokenResponse, options = {}) {
        const { organizationId, deviceInfo, riskScore } = options;

        // Generate unique username
        const baseUsername = userInfo.username || userInfo.email.split('@')[0];
        let username = baseUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
        let counter = 1;

        while (await UserModel.findOne({ username })) {
            username = `${baseUsername}${counter}`;
            counter++;
        }

        const userData = {
            email: userInfo.email.toLowerCase(),
            username,
            profile: {
                firstName: userInfo.firstName || '',
                lastName: userInfo.lastName || '',
                displayName: userInfo.name || `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim(),
                avatar: userInfo.picture ? { url: userInfo.picture } : undefined
            },
            organizationId,
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
            authProviders: [{
                provider,
                providerId: userInfo.id,
                providerData: {
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    profile: userInfo
                },
                tokens: {
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000))
                },
                linkedAt: new Date()
            }],
            metadata: {
                source: 'oauth',
                provider,
                registrationContext: {
                    ipAddress: deviceInfo?.ipAddress,
                    userAgent: deviceInfo?.userAgent,
                    riskScore
                }
            },
            registeredAt: new Date(),
            lastActivity: new Date()
        };

        const user = await UserModel.create(userData);

        logger.info('User created from OAuth with enhanced security', {
            userId: user._id,
            provider,
            email: userInfo.email,
            riskScore
        });

        return user;
    }

    /**
     * Update OAuth tokens with rotation and enhanced security
     * @private
     * @param {Object} user - User object
     * @param {string} provider - OAuth provider
     * @param {Object} tokenResponse - Token response
     */
    async #updateOAuthTokensAdvanced(user, provider, tokenResponse) {
        const oauthAccount = user.authProviders?.find(account => account.provider === provider);

        if (oauthAccount) {
            // Store previous token for audit trail
            const previousToken = {
                accessToken: oauthAccount.tokens.accessToken,
                rotatedAt: new Date()
            };

            // Update with new tokens
            oauthAccount.tokens.accessToken = tokenResponse.access_token;
            oauthAccount.tokens.refreshToken = tokenResponse.refresh_token;
            oauthAccount.tokens.tokenExpiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
            oauthAccount.lastUsedAt = new Date();

            // Track token rotation for security
            if (!oauthAccount.tokenHistory) oauthAccount.tokenHistory = [];
            oauthAccount.tokenHistory.push(previousToken);

            // Keep only last 5 token rotations
            oauthAccount.tokenHistory = oauthAccount.tokenHistory.slice(-5);

            await user.save();

            logger.info('OAuth tokens rotated', {
                userId: user._id,
                provider,
                tokenExpiresAt: oauthAccount.tokens.tokenExpiresAt
            });
        }
    }

    /**
     * Calculate risk score for OAuth authentication attempt
     * @private
     * @param {string} provider - OAuth provider
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<number>} OAuth-specific risk score
     */
    async #calculateOAuthRiskScore(provider, deviceInfo) {
        let riskScore = 0;

        try {
            // Check provider reputation
            const trustedProviders = ['google', 'github', 'microsoft', 'linkedin'];
            if (!trustedProviders.includes(provider)) {
                riskScore += 20;
            }

            // Check for suspicious device patterns
            if (this.#isSuspiciousUserAgent(deviceInfo.userAgent)) {
                riskScore += 15;
            }

            // Check for VPN/proxy usage during OAuth
            if (await this.#isVPNOrProxy(deviceInfo.ipAddress)) {
                riskScore += 25;
            }

            // Check for rapid OAuth attempts from same IP
            const recentAttempts = await this.#cacheService.get(`oauth_attempts:${deviceInfo.ipAddress}`) || 0;
            if (recentAttempts > 5) {
                riskScore += 30;
            }

            // Increment attempt counter
            await this.#cacheService.set(
                `oauth_attempts:${deviceInfo.ipAddress}`,
                recentAttempts + 1,
                3600 // 1 hour expiry
            );

            return Math.min(riskScore, 100);

        } catch (error) {
            logger.warn('OAuth risk calculation failed', {
                provider,
                error: error.message
            });
            return 50; // Medium risk on failure
        }
    }

    // ==================== SSO PROVIDER METHODS ====================

    /**
     * Validate SSO signature with enhanced security checks
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @returns {Promise<boolean>} Validation result
     */
    async #validateSSOSignatureAdvanced(provider, ssoResponse) {
        const providerConfig = this.#ssoProviders.get(provider);
        if (!providerConfig) {
            throw new ValidationError('SSO provider configuration not found', 'SSO_PROVIDER_CONFIG_MISSING');
        }

        try {
            // In production, implement proper SAML signature validation
            const crypto = require('crypto');

            // Mock SAML signature validation
            if (ssoResponse.signature && providerConfig.certificate) {
                // Extract signature and signed data
                const signatureData = ssoResponse.signature;
                const signedData = ssoResponse.signedData || ssoResponse.assertion;

                // Verify signature using provider certificate
                const verify = crypto.createVerify('RSA-SHA256');
                verify.update(signedData);

                // In production, properly parse and validate X.509 certificate
                const publicKey = providerConfig.certificate;
                const isValid = verify.verify(publicKey, signatureData, 'base64');

                if (!isValid) {
                    throw new ValidationError('SSO signature validation failed', 'INVALID_SSO_SIGNATURE');
                }

                // Additional timestamp validation
                if (ssoResponse.notBefore && new Date(ssoResponse.notBefore) > new Date()) {
                    throw new ValidationError('SSO assertion not yet valid', 'SSO_ASSERTION_TOO_EARLY');
                }

                if (ssoResponse.notOnOrAfter && new Date(ssoResponse.notOnOrAfter) < new Date()) {
                    throw new ValidationError('SSO assertion expired', 'SSO_ASSERTION_EXPIRED');
                }

                return true;
            }

            // If no signature required in config, allow pass-through
            return !providerConfig.security.signatureRequired;

        } catch (error) {
            logger.error('SSO signature validation failed', {
                provider,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Extract user attributes from SSO response with enhanced mapping
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @returns {Promise<Object>} Extracted and mapped user attributes
     */
    async #extractSSOAttributesAdvanced(provider, ssoResponse) {
        const providerConfig = this.#ssoProviders.get(provider);
        const attributeMapping = providerConfig.attributeMapping || {};

        try {
            const attributes = {};
            const assertions = ssoResponse.assertions || ssoResponse.attributes || {};

            // Map standard attributes
            Object.entries(attributeMapping).forEach(([localAttr, ssoAttr]) => {
                if (assertions[ssoAttr]) {
                    attributes[localAttr] = Array.isArray(assertions[ssoAttr])
                        ? assertions[ssoAttr][0]
                        : assertions[ssoAttr];
                }
            });

            // Enhanced attribute processing
            return {
                email: attributes.email?.toLowerCase(),
                firstName: attributes.firstName || '',
                lastName: attributes.lastName || '',
                employeeId: attributes.employeeId,
                department: attributes.department,
                roles: this.#parseSSORoles(attributes.roles),
                groups: this.#parseSSO Groups(attributes.groups),
                organizationId: attributes.organizationId,
                metadata: {
                    ssoProvider: provider,
                    extractedAt: new Date(),
                    rawAttributes: Object.keys(assertions)
                }
            };

        } catch (error) {
            logger.error('SSO attribute extraction failed', {
                provider,
                error: error.message
            });
            throw new ValidationError('Failed to extract SSO attributes', 'SSO_ATTRIBUTE_EXTRACTION_FAILED');
        }
    }

    /**
     * Parse SSO roles from assertion
     * @private
     * @param {string|Array} roles - Roles from SSO
     * @returns {Array} Parsed roles array
     */
    #parseSSORoles(roles) {
        if (!roles) return [];

        if (Array.isArray(roles)) {
            return roles;
        }

        if (typeof roles === 'string') {
            // Handle comma-separated or semicolon-separated roles
            return roles.split(/[,;]/).map(role => role.trim()).filter(Boolean);
        }

        return [];
    }

    /**
     * Parse SSO groups from assertion
     * @private
     * @param {string|Array} groups - Groups from SSO
     * @returns {Array} Parsed groups array
     */
    #parseSSO Groups(groups) {
        if (!groups) return [];

        if (Array.isArray(groups)) {
            return groups;
        }

        if (typeof groups === 'string') {
            return groups.split(/[,;]/).map(group => group.trim()).filter(Boolean);
        }

        return [];
    }

    /**
     * Find or provision SSO user with enhanced logic
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} userAttributes - User attributes from SSO
     * @param {Object} options - Provisioning options
     * @returns {Promise<Object>} User object
     */
    async #findOrProvisionSSOUserAdvanced(provider, userAttributes, options = {}) {
        const { allowProvisioning, organizationId, roleMapping, deviceInfo } = options;

        try {
            // Try to find existing user by email and organization
            let user = await UserModel.findOne({
                email: userAttributes.email,
                organizationId: organizationId || userAttributes.organizationId
            });

            if (!user && allowProvisioning) {
                // Create new user from SSO attributes
                const userData = {
                    email: userAttributes.email,
                    username: await this.#generateUniqueUsername(userAttributes.email),
                    profile: {
                        firstName: userAttributes.firstName,
                        lastName: userAttributes.lastName,
                        displayName: `${userAttributes.firstName} ${userAttributes.lastName}`.trim(),
                        employeeId: userAttributes.employeeId,
                        department: userAttributes.department
                    },
                    organizationId: organizationId || userAttributes.organizationId,
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
                        linkedAt: new Date(),
                        provisionedAt: new Date()
                    }],
                    metadata: {
                        source: 'sso',
                        provider,
                        provisioningContext: {
                            ipAddress: deviceInfo?.ipAddress,
                            userAgent: deviceInfo?.userAgent
                        }
                    },
                    registeredAt: new Date(),
                    lastActivity: new Date()
                };

                // Apply role mapping if enabled
                if (roleMapping && userAttributes.roles?.length > 0) {
                    userData.roles = this.#mapSSORolesToLocalRoles(userAttributes.roles);
                }

                user = await UserModel.create(userData);

                logger.info('User provisioned from SSO', {
                    userId: user._id,
                    provider,
                    email: userAttributes.email,
                    roles: userData.roles
                });
            }

            if (!user) {
                throw new NotFoundError('User not found and provisioning disabled', 'SSO_USER_NOT_FOUND');
            }

            return user;

        } catch (error) {
            logger.error('SSO user provisioning failed', {
                provider,
                email: userAttributes.email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update user attributes from SSO data
     * @private
     * @param {Object} user - User object
     * @param {Object} userAttributes - SSO attributes
     * @param {Object} options - Update options
     */
    async #updateUserFromSSO(user, userAttributes, options = {}) {
        const { roleMapping } = options;

        try {
            let updated = false;

            // Update profile information if changed
            if (userAttributes.firstName && user.profile.firstName !== userAttributes.firstName) {
                user.profile.firstName = userAttributes.firstName;
                updated = true;
            }

            if (userAttributes.lastName && user.profile.lastName !== userAttributes.lastName) {
                user.profile.lastName = userAttributes.lastName;
                updated = true;
            }

            if (userAttributes.department && user.profile.department !== userAttributes.department) {
                user.profile.department = userAttributes.department;
                updated = true;
            }

            // Update roles if role mapping is enabled
            if (roleMapping && userAttributes.roles?.length > 0) {
                const mappedRoles = this.#mapSSORolesToLocalRoles(userAttributes.roles);
                if (JSON.stringify(user.roles) !== JSON.stringify(mappedRoles)) {
                    user.roles = mappedRoles;
                    updated = true;
                }
            }

            // Update SSO account information
            if (!user.ssoAccounts) user.ssoAccounts = [];

            const existingSSO = user.ssoAccounts.find(account => account.provider === userAttributes.metadata.ssoProvider);
            if (existingSSO) {
                existingSSO.attributes = userAttributes;
                existingSSO.lastUsedAt = new Date();
                updated = true;
            }

            if (updated) {
                await user.save();
                logger.info('User updated from SSO', {
                    userId: user._id,
                    provider: userAttributes.metadata.ssoProvider
                });
            }

        } catch (error) {
            logger.error('Failed to update user from SSO', {
                userId: user._id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Map SSO roles to local system roles
     * @private
     * @param {Array} ssoRoles - Roles from SSO provider
     * @returns {Array} Mapped local roles
     */
    #mapSSORolesToLocalRoles(ssoRoles) {
        const roleMapping = {
            'Administrator': 'admin',
            'Manager': 'manager',
            'Employee': 'user',
            'Contractor': 'contractor',
            'Guest': 'guest'
        };

        return ssoRoles
            .map(role => roleMapping[role] || role.toLowerCase())
            .filter(Boolean);
    }

    /**
     * Calculate risk score for SSO request
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<number>} SSO-specific risk score
     */
    async #calculateSSORequestRiskScore(provider, ssoResponse, deviceInfo) {
        let riskScore = 0;

        try {
            // Check if assertion is too old
            const assertionAge = Date.now() - new Date(ssoResponse.issuedAt || Date.now()).getTime();
            if (assertionAge > 300000) { // 5 minutes
                riskScore += 20;
            }

            // Check for replay attacks
            const assertionId = ssoResponse.id || ssoResponse.assertionId;
            if (assertionId) {
                const replayKey = `sso_assertion:${assertionId}`;
                const alreadyUsed = await this.#cacheService.get(replayKey);
                if (alreadyUsed) {
                    riskScore += 100; // Critical - replay attack
                } else {
                    // Store assertion ID to prevent replay
                    await this.#cacheService.set(replayKey, true, 3600); // 1 hour
                }
            }

            // Check device consistency
            if (this.#isSuspiciousUserAgent(deviceInfo.userAgent)) {
                riskScore += 15;
            }

            // Check for VPN usage during SSO
            if (await this.#isVPNOrProxy(deviceInfo.ipAddress)) {
                riskScore += 30;
            }

            return Math.min(riskScore, 100);

        } catch (error) {
            logger.warn('SSO risk calculation failed', {
                provider,
                error: error.message
            });
            return 40; // Medium risk on failure
        }
    }

    // ==================== PERMISSION CHECK METHODS ====================

    /**
     * Check session access permission
     * @private
     * @param {string} requesterId - ID of user requesting access
     * @param {string} targetUserId - ID of target user
     */
    async #checkSessionAccessPermission(requesterId, targetUserId) {
        if (requesterId === targetUserId) {
            return; // Self-access always allowed
        }

        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        // Check if requester has admin privileges
        const hasAdminRole = requester.roles?.includes('admin') || requester.roles?.includes('super-admin');
        if (!hasAdminRole) {
            throw new ForbiddenError('Insufficient permissions to access user sessions', 'INSUFFICIENT_PERMISSIONS');
        }
    }

    /**
     * Check session revoke permission
     * @private
     * @param {string} requesterId - ID of user requesting revocation
     * @param {string} targetUserId - ID of target user
     */
    async #checkSessionRevokePermission(requesterId, targetUserId) {
        if (requesterId === targetUserId) {
            return; // Self-revoke always allowed
        }

        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        // Check if requester has admin privileges or security role
        const hasPermission = requester.roles?.some(role =>
            ['admin', 'super-admin', 'security-admin'].includes(role)
        );

        if (!hasPermission) {
            throw new ForbiddenError('Insufficient permissions to revoke user sessions', 'INSUFFICIENT_PERMISSIONS');
        }
    }

    /**
     * Check device management permission
     * @private
     * @param {string} requesterId - ID of user requesting device management
     * @param {string} targetUserId - ID of target user
     */
    async #checkDeviceManagementPermission(requesterId, targetUserId) {
        if (requesterId === targetUserId) {
            return; // Self-management always allowed
        }

        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        // Check if requester has appropriate admin privileges
        const hasPermission = requester.roles?.some(role =>
            ['admin', 'super-admin', 'security-admin', 'user-admin'].includes(role)
        );

        if (!hasPermission) {
            throw new ForbiddenError('Insufficient permissions to manage user devices', 'INSUFFICIENT_PERMISSIONS');
        }
    }

    // ==================== DEVICE MANAGEMENT METHODS ====================

    /**
     * Untrust a specific device
     * @private
     * @param {string} userId - User ID
     * @param {string} deviceId - Device ID to untrust
     * @param {Object} options - Untrust options
     * @returns {Promise<Object>} Untrust result
     */
    async #untrustDevice(userId, deviceId, options = {}) {
        const { reason = 'manual_untrust', terminateSessions = true } = options;

        try {
            // Remove from memory cache
            const key = `${userId}:${deviceId}`;
            this.#trustedDevices.delete(key);

            // Remove from database
            const user = await UserModel.findById(userId);
            if (user && user.mfa?.trustedDevices) {
                user.mfa.trustedDevices = user.mfa.trustedDevices.filter(
                    device => device.deviceId !== deviceId
                );
                await user.save();
            }

            // Terminate sessions for this device if requested
            if (terminateSessions) {
                await UserSessionModel.updateMany(
                    {
                        userId,
                        'deviceInfo.deviceId': deviceId,
                        status: 'active'
                    },
                    {
                        status: 'terminated',
                        terminatedAt: new Date(),
                        terminationReason: 'device_untrusted'
                    }
                );
            }

            logger.info('Device untrusted', {
                userId,
                deviceId,
                reason,
                sessionsTerminated: terminateSessions
            });

            return {
                success: true,
                deviceId,
                untrustedAt: new Date(),
                sessionsTerminated: terminateSessions,
                message: 'Device untrusted successfully'
            };

        } catch (error) {
            logger.error('Failed to untrust device', {
                error: error.message,
                userId,
                deviceId
            });
            throw error;
        }
    }

    /**
     * List all trusted devices for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} options - List options
     * @returns {Promise<Object>} Trusted devices list
     */
    async #listTrustedDevices(userId, options = {}) {
        const { includeExpired = false } = options;

        try {
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            let trustedDevices = user.mfa?.trustedDevices || [];

            // Filter expired devices if not requested
            if (!includeExpired) {
                const now = Date.now();
                trustedDevices = trustedDevices.filter(device =>
                    device.expiresAt > now
                );
            }

            // Process devices for response
            const processedDevices = trustedDevices.map(device => ({
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                trustedAt: device.trustedAt,
                expiresAt: device.expiresAt,
                location: device.location,
                ipAddress: device.ipAddress,
                isExpired: device.expiresAt <= Date.now(),
                userAgent: device.userAgent
            }));

            return {
                devices: processedDevices,
                totalCount: processedDevices.length,
                activeCount: processedDevices.filter(d => !d.isExpired).length,
                expiredCount: processedDevices.filter(d => d.isExpired).length
            };

        } catch (error) {
            logger.error('Failed to list trusted devices', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Clear all trusted devices for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} options - Clear options
     * @returns {Promise<Object>} Clear result
     */
    async #clearAllTrustedDevices(userId, options = {}) {
        const { terminateSessions = true, reason = 'clear_all_devices' } = options;

        try {
            // Clear from memory cache
            for (const [key] of this.#trustedDevices) {
                if (key.startsWith(`${userId}:`)) {
                    this.#trustedDevices.delete(key);
                }
            }

            // Get device count before clearing
            const user = await UserModel.findById(userId);
            const deviceCount = user.mfa?.trustedDevices?.length || 0;

            // Clear from database
            if (user && user.mfa) {
                user.mfa.trustedDevices = [];
                await user.save();
            }

            // Terminate all sessions if requested
            if (terminateSessions) {
                await UserSessionModel.updateMany(
                    { userId, status: 'active' },
                    {
                        status: 'terminated',
                        terminatedAt: new Date(),
                        terminationReason: reason
                    }
                );
            }

            logger.info('All trusted devices cleared', {
                userId,
                deviceCount,
                sessionsTerminated: terminateSessions,
                reason
            });

            return {
                success: true,
                clearedDevices: deviceCount,
                sessionsTerminated: terminateSessions,
                clearedAt: new Date(),
                message: `${deviceCount} trusted devices cleared successfully`
            };

        } catch (error) {
            logger.error('Failed to clear trusted devices', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // ==================== SECURITY ASSESSMENT METHODS ====================

    /**
     * Assess password security for user
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Password security assessment
     */
    async #assessPasswordSecurity(user) {
        let score = 0;
        const issues = [];
        const recommendations = [];

        try {
            // Check if password exists (OAuth-only users might not have password)
            if (!user.password) {
                if (user.authProviders?.length > 0) {
                    score = 80; // OAuth-only is relatively secure
                    recommendations.push('Consider setting a backup password for account recovery');
                } else {
                    score = 0;
                    issues.push('No password set');
                    recommendations.push('Set a strong password immediately');
                }
            } else {
                score = 70; // Base score for having a password

                // Check password age
                if (user.passwordChangedAt) {
                    const passwordAge = Date.now() - user.passwordChangedAt.getTime();
                    const daysSinceChange = passwordAge / (24 * 60 * 60 * 1000);

                    if (daysSinceChange > 90) {
                        score -= 20;
                        issues.push('Password is older than 90 days');
                        recommendations.push('Change your password regularly');
                    } else if (daysSinceChange > 180) {
                        score -= 40;
                        issues.push('Password is very old (>6 months)');
                        recommendations.push('Change your password immediately');
                    }
                }

                // Check for recent failed attempts
                if (user.security?.loginAttempts?.count > 0) {
                    score -= 10;
                    issues.push('Recent failed login attempts detected');
                    recommendations.push('Monitor account for suspicious activity');
                }

                // Check password history depth
                const historyCount = user.passwordHistory?.length || 0;
                if (historyCount >= 5) {
                    score += 10; // Bonus for maintaining password history
                }
            }

            return {
                category: 'password',
                score: Math.max(0, Math.min(100, score)),
                issues,
                recommendations,
                metrics: {
                    hasPassword: !!user.password,
                    daysSinceLastChange: user.passwordChangedAt
                        ? Math.floor((Date.now() - user.passwordChangedAt.getTime()) / (24 * 60 * 60 * 1000))
                        : null,
                    failedAttempts: user.security?.loginAttempts?.count || 0,
                    historyDepth: user.passwordHistory?.length || 0
                }
            };

        } catch (error) {
            logger.error('Password security assessment failed', {
                userId: user._id,
                error: error.message
            });

            return {
                category: 'password',
                score: 0,
                issues: ['Assessment failed'],
                recommendations: ['Review password security manually'],
                error: error.message
            };
        }
    }

    /**
     * Assess MFA security for user
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} MFA security assessment
     */
    async #assessMFASecurity(user) {
        let score = 0;
        const issues = [];
        const recommendations = [];

        try {
            if (!user.mfa?.enabled) {
                score = 0;
                issues.push('Multi-factor authentication not enabled');
                recommendations.push('Enable MFA to significantly improve account security');
            } else {
                score = 60; // Base score for having MFA enabled

                const enabledMethods = user.mfa.methods?.filter(m => m.enabled) || [];

                // Score based on number of methods
                if (enabledMethods.length >= 2) {
                    score += 20;
                } else {
                    recommendations.push('Consider setting up multiple MFA methods for redundancy');
                }

                // Score based on method types
                const methodTypes = enabledMethods.map(m => m.type);

                if (methodTypes.includes('totp')) {
                    score += 10; // TOTP is very secure
                }

                if (methodTypes.includes('webauthn')) {
                    score += 15; // WebAuthn is the most secure
                }

                if (methodTypes.includes('sms') && !methodTypes.includes('totp')) {
                    score -= 10; // SMS-only is less secure
                    recommendations.push('Consider upgrading from SMS to authenticator app');
                }

                // Check backup codes
                if (!user.mfa.backupCodes?.length) {
                    score -= 10;
                    issues.push('No backup codes generated');
                    recommendations.push('Generate backup codes for account recovery');
                }

                // Check trusted devices
                const activeTrustedDevices = user.mfa.trustedDevices?.filter(
                    d => d.expiresAt > Date.now()
                ).length || 0;

                if (activeTrustedDevices > 5) {
                    score -= 10;
                    issues.push('Too many trusted devices');
                    recommendations.push('Review and remove unused trusted devices');
                }
            }

            return {
                category: 'mfa',
                score: Math.max(0, Math.min(100, score)),
                issues,
                recommendations,
                metrics: {
                    enabled: user.mfa?.enabled || false,
                    methodCount: user.mfa?.methods?.filter(m => m.enabled).length || 0,
                    methodTypes: user.mfa?.methods?.filter(m => m.enabled).map(m => m.type) || [],
                    backupCodesCount: user.mfa?.backupCodes?.length || 0,
                    trustedDevicesCount: user.mfa?.trustedDevices?.filter(d => d.expiresAt > Date.now()).length || 0
                }
            };

        } catch (error) {
            logger.error('MFA security assessment failed', {
                userId: user._id,
                error: error.message
            });

            return {
                category: 'mfa',
                score: 0,
                issues: ['Assessment failed'],
                recommendations: ['Review MFA security manually'],
                error: error.message
            };
        }
    }

    /**
     * Get security level from overall score
     * @private
     * @param {number} score - Overall security score
     * @returns {string} Security level
     */
    #getSecurityLevel(score) {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'good';
        if (score >= 60) return 'fair';
        if (score >= 40) return 'poor';
        return 'critical';
    }

    // Additional assessment methods (#assessSessionSecurity, #assessDeviceSecurity, #assessAccountSecurity)
    // and other missing methods would continue here following the same pattern...
}

module.exports = UserAuthService;