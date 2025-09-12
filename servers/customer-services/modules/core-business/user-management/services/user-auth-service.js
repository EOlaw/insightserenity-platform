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

    // ==================== OAUTH PRIVATE METHODS ====================

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
            const response = await fetch(providerConfig.tokenUrl, tokenRequest);

            if (!response.ok) {
                throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
            }

            const tokenData = await response.json();

            if (tokenData.error) {
                throw new Error(`OAuth error: ${tokenData.error_description || tokenData.error}`);
            }

            return {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in || 3600,
                token_type: tokenData.token_type || 'Bearer',
                scope: tokenData.scope
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
            const response = await fetch(providerConfig.userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'User-Agent': 'Enterprise-Auth-Service/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`User info request failed: ${response.status}`);
            }

            const userData = await response.json();

            // Standardize user data across providers
            const standardizedData = {
                id: userData.id || userData.sub,
                email: userData.email,
                name: userData.name || userData.login || `${userData.given_name || ''} ${userData.family_name || ''}`.trim(),
                firstName: userData.given_name || userData.first_name,
                lastName: userData.family_name || userData.last_name,
                picture: userData.picture || userData.avatar_url,
                verified_email: userData.verified_email !== false,
                locale: userData.locale,
                provider: provider,
                raw: userData
            };

            // Provider-specific enhancements
            switch (provider) {
                case 'github':
                    standardizedData.username = userData.login;
                    standardizedData.company = userData.company;
                    standardizedData.blog = userData.blog;
                    break;
                case 'linkedin':
                    standardizedData.headline = userData.headline;
                    standardizedData.industry = userData.industry;
                    break;
            }

            return standardizedData;

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

        // Security check for high-risk linking
        if (riskScore > this.#securityConfig.riskThresholds.high) {
            await this.#sendSecurityAlert(user, deviceInfo, riskScore, ['oauth_account_linking']);
        }

        // Initialize OAuth accounts if not exists
        if (!user.authProviders) user.authProviders = [];

        // Check if provider already linked
        const existingProvider = user.authProviders.find(p => p.provider === provider);
        if (existingProvider) {
            // Update existing provider
            existingProvider.providerId = userInfo.id;
            existingProvider.providerData = {
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
                profile: userInfo.raw
            };
            existingProvider.tokens.accessToken = tokenResponse.access_token;
            existingProvider.tokens.refreshToken = tokenResponse.refresh_token;
            existingProvider.tokens.expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
            existingProvider.lastUsedAt = new Date();
        } else {
            // Add new provider
            user.authProviders.push({
                provider,
                providerId: userInfo.id,
                providerData: {
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    profile: userInfo.raw
                },
                tokens: {
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    expiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000))
                },
                linkedAt: new Date(),
                lastUsedAt: new Date(),
                securityContext: {
                    linkingRiskScore: riskScore,
                    linkingDeviceInfo: deviceInfo ? {
                        deviceId: deviceInfo.deviceId,
                        ipAddress: deviceInfo.ipAddress,
                        userAgent: deviceInfo.userAgent
                    } : null
                }
            });
        }

        await user.save();

        logger.info('OAuth account linked with enhanced security', {
            userId: user._id,
            provider,
            providerEmail: userInfo.email,
            riskScore
        });
    }

    /**
     * Create new user from OAuth data with enhanced profile
     * @private
     * @param {string} provider - OAuth provider
     * @param {Object} userInfo - OAuth user information
     * @param {Object} tokenResponse - OAuth token response
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created user
     */
    async #createUserFromOAuthAdvanced(provider, userInfo, tokenResponse, options = {}) {
        const { organizationId, deviceInfo, riskScore } = options;

        // Generate unique username
        const baseUsername = (userInfo.username || userInfo.email.split('@')[0])
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');

        let username = baseUsername;
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
                displayName: userInfo.name || '',
                avatar: userInfo.picture ? { url: userInfo.picture } : undefined,
                bio: userInfo.bio || userInfo.headline || '',
                company: userInfo.company || '',
                website: userInfo.blog || userInfo.website || ''
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
                    reason: `OAuth registration via ${provider}`,
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
                    profile: userInfo.raw
                },
                tokens: {
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    expiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000))
                },
                linkedAt: new Date(),
                lastUsedAt: new Date(),
                securityContext: {
                    registrationRiskScore: riskScore,
                    registrationDeviceInfo: deviceInfo ? {
                        deviceId: deviceInfo.deviceId,
                        ipAddress: deviceInfo.ipAddress,
                        userAgent: deviceInfo.userAgent
                    } : null
                }
            }],
            metadata: {
                source: 'oauth',
                provider,
                registrationMethod: 'oauth',
                initialRiskScore: riskScore
            },
            registeredAt: new Date(),
            registrationIP: deviceInfo?.ipAddress,
            lastActivity: new Date()
        };

        const user = await UserModel.create(userData);

        logger.info('User created from OAuth with enhanced profile', {
            userId: user._id,
            provider,
            email: userInfo.email,
            riskScore
        });

        return user;
    }

    /**
     * Update OAuth tokens with rotation and security
     * @private
     * @param {Object} user - User object
     * @param {string} provider - OAuth provider
     * @param {Object} tokenResponse - Token response
     */
    async #updateOAuthTokensAdvanced(user, provider, tokenResponse) {
        const providerAccount = user.authProviders?.find(account => account.provider === provider);

        if (providerAccount) {
            // Store previous token for potential revocation
            const previousToken = providerAccount.tokens.accessToken;

            // Update tokens
            providerAccount.tokens.accessToken = tokenResponse.access_token;
            providerAccount.tokens.refreshToken = tokenResponse.refresh_token;
            providerAccount.tokens.expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
            providerAccount.lastUsedAt = new Date();

            // Track token rotation
            if (!providerAccount.tokenHistory) providerAccount.tokenHistory = [];
            providerAccount.tokenHistory.unshift({
                rotatedAt: new Date(),
                previousTokenHash: previousToken ? crypto.createHash('sha256').update(previousToken).digest('hex').substring(0, 16) : null,
                reason: 'authentication'
            });

            // Keep only last 5 token rotations
            providerAccount.tokenHistory = providerAccount.tokenHistory.slice(0, 5);

            await user.save();

            // Optionally revoke previous token with provider
            if (previousToken) {
                await this.#revokeOAuthToken(provider, previousToken).catch(error => {
                    logger.warn('Failed to revoke previous OAuth token', {
                        provider,
                        error: error.message
                    });
                });
            }
        }
    }

    /**
     * Calculate risk score for OAuth authentication
     * @private
     * @param {string} provider - OAuth provider
     * @param {Object} deviceInfo - Device information
     * @returns {Promise<number>} OAuth-specific risk score
     */
    async #calculateOAuthRiskScore(provider, deviceInfo) {
        let riskScore = 0;

        // Base risk factors
        const baseRisk = await this.#calculateRiskScore(null, deviceInfo);
        riskScore += baseRisk.score * 0.7; // OAuth is generally safer, so reduce base risk

        // Provider-specific risk factors
        const trustedProviders = ['google', 'microsoft', 'github'];
        if (!trustedProviders.includes(provider)) {
            riskScore += 15;
        }

        // Check if provider has known security issues
        const providerAlerts = await this.#cacheService.get(`provider_alerts:${provider}`) || [];
        if (providerAlerts.length > 0) {
            riskScore += 25;
        }

        return Math.min(riskScore, 100);
    }

    /**
     * Revoke OAuth token with provider
     * @private
     * @param {string} provider - OAuth provider
     * @param {string} token - Token to revoke
     */
    async #revokeOAuthToken(provider, token) {
        const providerConfig = this.#oauthProviders.get(provider);

        if (!providerConfig.revokeUrl) {
            return; // Provider doesn't support token revocation
        }

        try {
            await fetch(providerConfig.revokeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    token,
                    client_id: providerConfig.clientId,
                    client_secret: providerConfig.clientSecret
                })
            });
        } catch (error) {
            logger.warn('OAuth token revocation failed', {
                provider,
                error: error.message
            });
        }
    }

    // ==================== SSO PRIVATE METHODS ====================

    /**
     * Validate SSO signature with enhanced security
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @returns {Promise<boolean>} Validation result
     */
    async #validateSSOSignatureAdvanced(provider, ssoResponse) {
        const providerConfig = this.#ssoProviders.get(provider);

        try {
            // Load the provider's certificate
            const certificate = providerConfig.certificate;
            if (!certificate) {
                throw new Error('Provider certificate not configured');
            }

            // Validate SAML signature using xmldsig
            // This is a simplified implementation - production would use proper SAML libraries
            const crypto = require('crypto');

            // Extract signature and signed info from SAML response
            const signatureValue = ssoResponse.signature;
            const signedInfo = ssoResponse.signedInfo;

            // Verify signature
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(signedInfo);

            const isValid = verifier.verify(certificate, signatureValue, 'base64');

            if (!isValid) {
                throw new Error('SSO signature validation failed');
            }

            // Additional security checks
            const now = new Date();
            const notBefore = new Date(ssoResponse.notBefore);
            const notOnOrAfter = new Date(ssoResponse.notOnOrAfter);

            if (now < notBefore || now >= notOnOrAfter) {
                throw new Error('SSO assertion time bounds invalid');
            }

            // Check audience restriction
            if (ssoResponse.audience !== providerConfig.entityId) {
                throw new Error('SSO audience restriction failed');
            }

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
     * Extract user attributes from SSO response with enhanced mapping
     * @private
     * @param {string} provider - SSO provider
     * @param {Object} ssoResponse - SSO response data
     * @returns {Promise<Object>} Enhanced user attributes
     */
    async #extractSSOAttributesAdvanced(provider, ssoResponse) {
        const providerConfig = this.#ssoProviders.get(provider);
        const attributeMapping = providerConfig.attributeMapping;

        try {
            const attributes = {};

            // Extract standard attributes
            Object.keys(attributeMapping).forEach(localAttribute => {
                const ssoAttributeName = attributeMapping[localAttribute];
                const value = ssoResponse.attributes[ssoAttributeName];

                if (value !== undefined) {
                    // Handle array values (common in SAML)
                    attributes[localAttribute] = Array.isArray(value) ? value[0] : value;
                }
            });

            // Enhanced attribute processing
            attributes.email = attributes.email?.toLowerCase();
            attributes.groups = this.#extractGroups(ssoResponse.attributes);
            attributes.roles = this.#mapSSOGroups(attributes.groups, provider);
            attributes.department = attributes.department || this.#extractDepartment(attributes.groups);
            attributes.permissions = this.#mapSSOPermissions(attributes.roles, attributes.groups);

            // Provider-specific enhancements
            if (provider === 'enterprise_saml') {
                attributes.employeeId = ssoResponse.attributes['urn:oid:2.16.840.1.113730.3.1.3'];
                attributes.costCenter = ssoResponse.attributes['urn:oid:1.3.6.1.4.1.5923.1.1.1.8'];
                attributes.manager = ssoResponse.attributes['urn:oid:0.9.2342.19200300.100.1.10'];
            }

            // Security context
            attributes.ssoMetadata = {
                provider,
                sessionIndex: ssoResponse.sessionIndex,
                authInstant: ssoResponse.authInstant,
                nameId: ssoResponse.nameId,
                issuer: ssoResponse.issuer
            };

            return attributes;

        } catch (error) {
            logger.error('SSO attribute extraction failed', {
                provider,
                error: error.message
            });
            throw new ValidationError('Failed to extract SSO attributes', 'SSO_ATTRIBUTE_EXTRACTION_FAILED');
        }
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
            // Primary lookup by email and organization
            let user = await UserModel.findOne({
                email: userAttributes.email,
                organizationId: organizationId || null
            });

            // Secondary lookup by employee ID if available
            if (!user && userAttributes.employeeId) {
                user = await UserModel.findOne({
                    'profile.employeeId': userAttributes.employeeId,
                    organizationId: organizationId || null
                });
            }

            if (!user && allowProvisioning) {
                // Create new user from SSO attributes
                const userData = {
                    email: userAttributes.email,
                    username: await this.#generateUsernameFromSSO(userAttributes),
                    profile: {
                        firstName: userAttributes.firstName || '',
                        lastName: userAttributes.lastName || '',
                        displayName: `${userAttributes.firstName || ''} ${userAttributes.lastName || ''}`.trim(),
                        employeeId: userAttributes.employeeId,
                        department: userAttributes.department,
                        manager: userAttributes.manager,
                        costCenter: userAttributes.costCenter
                    },
                    organizationId,
                    verification: {
                        email: { verified: true, verifiedAt: new Date() }
                    },
                    accountStatus: {
                        status: 'active',
                        statusHistory: [{
                            status: 'active',
                            reason: `SSO provisioning via ${provider}`,
                            changedAt: new Date()
                        }]
                    },
                    roles: userAttributes.roles || ['user'],
                    ssoAccounts: [{
                        provider,
                        nameId: userAttributes.ssoMetadata.nameId,
                        sessionIndex: userAttributes.ssoMetadata.sessionIndex,
                        attributes: userAttributes,
                        linkedAt: new Date(),
                        lastUsedAt: new Date()
                    }],
                    metadata: {
                        source: 'sso',
                        provider,
                        provisioningMethod: 'automatic'
                    },
                    registeredAt: new Date(),
                    registrationIP: deviceInfo?.ipAddress,
                    lastActivity: new Date()
                };

                user = await UserModel.create(userData);

                logger.info('User provisioned from SSO with enhanced attributes', {
                    userId: user._id,
                    provider,
                    email: userAttributes.email,
                    employeeId: userAttributes.employeeId
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
     * Update user from SSO attributes
     * @private
     * @param {Object} user - User object
     * @param {Object} userAttributes - SSO attributes
     * @param {Object} options - Update options
     */
    async #updateUserFromSSO(user, userAttributes, options = {}) {
        const { roleMapping } = options;

        try {
            let hasChanges = false;

            // Update profile information
            const profileUpdates = {
                department: userAttributes.department,
                manager: userAttributes.manager,
                costCenter: userAttributes.costCenter
            };

            Object.keys(profileUpdates).forEach(key => {
                if (profileUpdates[key] && user.profile[key] !== profileUpdates[key]) {
                    user.profile[key] = profileUpdates[key];
                    hasChanges = true;
                }
            });

            // Update roles if role mapping is enabled
            if (roleMapping && userAttributes.roles) {
                const currentRoles = user.roles || [];
                const newRoles = userAttributes.roles;

                if (JSON.stringify(currentRoles.sort()) !== JSON.stringify(newRoles.sort())) {
                    user.roles = newRoles;
                    hasChanges = true;
                }
            }

            // Update SSO account information
            if (!user.ssoAccounts) user.ssoAccounts = [];

            const ssoAccount = user.ssoAccounts.find(account =>
                account.provider === userAttributes.ssoMetadata.provider
            );

            if (ssoAccount) {
                ssoAccount.attributes = userAttributes;
                ssoAccount.lastUsedAt = new Date();
                ssoAccount.sessionIndex = userAttributes.ssoMetadata.sessionIndex;
                hasChanges = true;
            }

            if (hasChanges) {
                user.lastActivity = new Date();
                await user.save();

                logger.info('User updated from SSO attributes', {
                    userId: user._id,
                    provider: userAttributes.ssoMetadata.provider,
                    changes: Object.keys(profileUpdates).filter(key => profileUpdates[key])
                });
            }

        } catch (error) {
            logger.error('SSO user update failed', {
                userId: user._id,
                provider: userAttributes.ssoMetadata?.provider,
                error: error.message
            });
        }
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

        // Base device risk
        const baseRisk = await this.#calculateRiskScore(null, deviceInfo);
        riskScore += baseRisk.score * 0.5; // SSO is generally lower risk

        // Check SSO-specific risk factors
        const authAge = Date.now() - new Date(ssoResponse.authInstant).getTime();
        if (authAge > 3600000) { // Authentication older than 1 hour
            riskScore += 20;
        }

        // Check for suspicious attributes
        if (!ssoResponse.attributes || Object.keys(ssoResponse.attributes).length < 3) {
            riskScore += 15; // Minimal attributes might indicate compromise
        }

        // Provider trust level
        const trustedProviders = ['enterprise_saml', 'azure_ad', 'okta'];
        if (!trustedProviders.includes(provider)) {
            riskScore += 10;
        }

        return Math.min(riskScore, 100);
    }

    // ==================== MFA PRIVATE METHODS ====================

    /**
     * Setup SMS MFA with enhanced security
     * @private
     * @param {Object} user - User object
     * @param {Object} options - SMS options
     * @returns {Promise<Object>} Enhanced SMS setup result
     */
    async #setupSMS(user, options = {}) {
        const { phoneNumber } = options;

        if (!phoneNumber) {
            throw new ValidationError('Phone number is required for SMS MFA', 'PHONE_NUMBER_REQUIRED');
        }

        // Enhanced phone number validation
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
        if (!/^[\+]?[1-9][\d]{7,15}$/.test(cleanPhone)) {
            throw new ValidationError('Invalid phone number format', 'INVALID_PHONE_NUMBER');
        }

        // Check if phone number is already in use
        const existingUser = await UserModel.findOne({
            'mfa.methods.phoneNumber': cleanPhone,
            _id: { $ne: user._id }
        });

        if (existingUser) {
            throw new ConflictError('Phone number already in use', 'PHONE_NUMBER_IN_USE');
        }

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeKey = `sms_setup:${user._id}:${verificationCode}`;

        // Store code temporarily with enhanced security
        this.#mfaCodes.set(codeKey, {
            userId: user._id,
            code: verificationCode,
            phoneNumber: cleanPhone,
            attempts: 0,
            maxAttempts: 3,
            expiresAt: Date.now() + this.#securityConfig.mfaCodeExpiry
        });

        // Add SMS method to user (not enabled yet)
        const mfaMethod = {
            type: 'sms',
            enabled: false,
            phoneNumber: cleanPhone,
            verifiedAt: null,
            createdAt: new Date()
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Send SMS with verification code (integrate with SMS service)
        await this.#sendSMSCode(cleanPhone, verificationCode, 'setup');

        return {
            phoneNumber: this.#maskPhoneNumber(cleanPhone),
            message: 'Verification code sent to your phone',
            expiresIn: this.#securityConfig.mfaCodeExpiry / 1000,
            method: 'sms'
        };
    }

    /**
     * Setup email MFA with enhanced validation
     * @private
     * @param {Object} user - User object
     * @param {Object} options - Email options
     * @returns {Promise<Object>} Enhanced email MFA setup result
     */
    async #setupEmailMFA(user, options = {}) {
        const { email = user.email } = options;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ValidationError('Invalid email format', 'INVALID_EMAIL_FORMAT');
        }

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeKey = `email_setup:${user._id}:${verificationCode}`;

        // Store code temporarily
        this.#mfaCodes.set(codeKey, {
            userId: user._id,
            code: verificationCode,
            email,
            attempts: 0,
            maxAttempts: 3,
            expiresAt: Date.now() + this.#securityConfig.mfaCodeExpiry
        });

        // Add email method to user (not enabled yet)
        const mfaMethod = {
            type: 'email',
            enabled: false,
            email,
            verifiedAt: null,
            createdAt: new Date()
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
            expiresIn: this.#securityConfig.mfaCodeExpiry / 1000,
            method: 'email'
        };
    }

    /**
     * Setup WebAuthn MFA with enhanced configuration
     * @private
     * @param {Object} user - User object
     * @param {Object} options - WebAuthn options
     * @returns {Promise<Object>} Enhanced WebAuthn setup result
     */
    async #setupWebAuthn(user, options = {}) {
        const { authenticatorName = 'Security Key' } = options;

        // Generate challenge for WebAuthn registration
        const challenge = crypto.randomBytes(32);
        const challengeB64 = challenge.toString('base64url');

        // Store challenge temporarily
        const challengeKey = `webauthn_challenge:${user._id}`;
        await this.#cacheService.set(challengeKey, {
            challenge: challengeB64,
            userId: user._id,
            authenticatorName,
            createdAt: Date.now()
        }, 300); // 5 minutes

        // Add WebAuthn method to user (not enabled yet)
        const mfaMethod = {
            type: 'webauthn',
            enabled: false,
            authenticatorName,
            credentialId: null,
            publicKey: null,
            counter: 0,
            verifiedAt: null,
            createdAt: new Date()
        };

        if (!user.mfa.methods) user.mfa.methods = [];
        user.mfa.methods.push(mfaMethod);
        await user.save();

        // Return WebAuthn registration options
        return {
            challenge: challengeB64,
            rp: {
                name: 'Enterprise Application',
                id: process.env.WEBAUTHN_RP_ID || 'localhost'
            },
            user: {
                id: Buffer.from(user._id.toString()).toString('base64url'),
                name: user.email,
                displayName: user.profile?.displayName || user.email
            },
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' }, // ES256
                { alg: -257, type: 'public-key' } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'cross-platform',
                userVerification: 'preferred',
                requireResidentKey: false
            },
            timeout: this.#biometricConfig.timeout,
            attestation: 'direct'
        };
    }

    /**
     * Setup backup codes with enhanced generation
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Enhanced backup codes setup result
     */
    async #setupBackupCodes(user) {
        const backupCodes = await this.#generateBackupCodes(user);

        return {
            codes: backupCodes,
            message: 'Store these backup codes securely. Each code can only be used once.',
            warning: 'These codes will not be shown again. Save them in a secure location.',
            format: 'Each code is 8 characters long and can be used once',
            totalCodes: backupCodes.length
        };
    }

    /**
     * Generate backup codes for user with enhanced security
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Array>} Generated backup codes
     */
    async #generateBackupCodes(user) {
        const codes = [];
        for (let i = 0; i < 10; i++) {
            // Generate 8-character alphanumeric codes
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code);
        }

        // Hash and store codes
        const hashedCodes = await Promise.all(
            codes.map(async (code, index) => ({
                code: await bcrypt.hash(code, 10),
                used: false,
                createdAt: new Date(),
                index: index + 1
            }))
        );

        // Update user with backup codes
        if (!user.mfa.backupCodes) user.mfa.backupCodes = [];
        user.mfa.backupCodes = hashedCodes;
        user.mfa.backupCodesGeneratedAt = new Date();
        await user.save();

        // Audit backup code generation
        await this.#auditService.log({
            action: 'BACKUP_CODES_GENERATED',
            entityType: 'authentication',
            entityId: user._id,
            userId: user._id,
            details: {
                codeCount: codes.length,
                generatedAt: new Date()
            }
        });

        return codes;
    }

    /**
     * Verify WebAuthn assertion
     * @private
     * @param {Object} mfaMethod - MFA method object
     * @param {string} assertion - WebAuthn assertion
     * @param {Object} context - Verification context
     * @returns {Promise<boolean>} Verification result
     */
    async #verifyWebAuthnAssertion(mfaMethod, assertion, context = {}) {
        try {
            // This would integrate with a WebAuthn library like @simplewebauthn/server
            // For now, return mock verification

            const assertionData = JSON.parse(assertion);

            // Verify assertion components
            if (!assertionData.id || !assertionData.response) {
                return false;
            }

            // In production, perform full WebAuthn verification:
            // 1. Verify challenge matches stored challenge
            // 2. Verify signature against stored public key
            // 3. Verify authenticator data
            // 4. Update counter to prevent replay attacks

            // Mock verification - replace with actual implementation
            return assertionData.id === mfaMethod.credentialId;

        } catch (error) {
            logger.error('WebAuthn verification failed', {
                error: error.message,
                method: mfaMethod.type
            });
            return false;
        }
    }

    /**
     * Send SMS code with provider integration
     * @private
     * @param {string} phoneNumber - Phone number
     * @param {string} code - Verification code
     * @param {string} purpose - Purpose (setup, verification, etc.)
     */
    async #sendSMSCode(phoneNumber, code, purpose) {
        try {
            // In production, integrate with SMS providers like Twilio, AWS SNS, etc.

            const message = purpose === 'setup'
                ? `Your MFA setup code is: ${code}. This code expires in 5 minutes.`
                : `Your verification code is: ${code}. This code expires in 5 minutes.`;

            // Mock SMS sending - replace with actual provider integration
            logger.info('SMS code sent', {
                phoneNumber: this.#maskPhoneNumber(phoneNumber),
                purpose,
                codeLength: code.length
            });

            // Example Twilio integration:
            // const twilio = require('twilio');
            // const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
            // await client.messages.create({
            //     body: message,
            //     from: process.env.TWILIO_PHONE_NUMBER,
            //     to: phoneNumber
            // });

        } catch (error) {
            logger.error('SMS sending failed', {
                phoneNumber: this.#maskPhoneNumber(phoneNumber),
                purpose,
                error: error.message
            });
            throw new AppError('Failed to send SMS code', 500, 'SMS_SEND_FAILED');
        }
    }

    /**
     * Send push notification
     * @private
     * @param {string} pushToken - Push notification token
     * @param {Object} payload - Notification payload
     */
    async #sendPushNotification(pushToken, payload) {
        try {
            // In production, integrate with push notification services
            // like Firebase Cloud Messaging, Apple Push Notification Service, etc.

            logger.info('Push notification sent', {
                pushToken: pushToken.substring(0, 10) + '...',
                title: payload.title,
                type: payload.data?.type
            });

            // Example Firebase integration:
            // const admin = require('firebase-admin');
            // await admin.messaging().send({
            //     token: pushToken,
            //     notification: {
            //         title: payload.title,
            //         body: payload.body
            //     },
            //     data: payload.data
            // });

        } catch (error) {
            logger.error('Push notification sending failed', {
                error: error.message
            });
            throw new AppError('Failed to send push notification', 500, 'PUSH_SEND_FAILED');
        }
    }

    // ==================== DEVICE MANAGEMENT PRIVATE METHODS ====================

    /**
     * Untrust a device
     * @private
     * @param {string} userId - User ID
     * @param {string} deviceId - Device ID to untrust
     * @param {Object} options - Untrust options
     * @returns {Promise<Object>} Untrust result
     */
    async #untrustDevice(userId, deviceId, options = {}) {
        const key = `${userId}:${deviceId}`;

        // Remove from memory cache
        this.#trustedDevices.delete(key);

        // Remove from database
        const user = await UserModel.findById(userId);
        if (user && user.mfa?.trustedDevices) {
            const initialLength = user.mfa.trustedDevices.length;
            user.mfa.trustedDevices = user.mfa.trustedDevices.filter(
                device => device.deviceId !== deviceId
            );

            if (user.mfa.trustedDevices.length < initialLength) {
                await user.save();

                logger.info('Device untrusted', {
                    userId,
                    deviceId,
                    requesterId: options.requesterId
                });

                return {
                    success: true,
                    deviceId,
                    message: 'Device untrusted successfully'
                };
            }
        }

        return {
            success: false,
            deviceId,
            message: 'Device not found in trusted devices'
        };
    }

    /**
     * List trusted devices for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} options - List options
     * @returns {Promise<Object>} Trusted devices list
     */
    async #listTrustedDevices(userId, options = {}) {
        const user = await UserModel.findById(userId);

        if (!user || !user.mfa?.trustedDevices) {
            return {
                devices: [],
                totalCount: 0
            };
        }

        const devices = user.mfa.trustedDevices.map(device => ({
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            trustedAt: device.trustedAt,
            expiresAt: device.expiresAt,
            lastUsed: device.lastUsed || device.trustedAt,
            location: device.location,
            isActive: device.expiresAt > Date.now(),
            userAgent: device.userAgent ? {
                browser: this.#parseUserAgent(device.userAgent).browser,
                os: this.#parseUserAgent(device.userAgent).os
            } : null
        }));

        return {
            devices: devices.sort((a, b) => new Date(b.trustedAt) - new Date(a.trustedAt)),
            totalCount: devices.length,
            activeCount: devices.filter(d => d.isActive).length
        };
    }

    /**
     * Clear all trusted devices for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} options - Clear options
     * @returns {Promise<Object>} Clear result
     */
    async #clearAllTrustedDevices(userId, options = {}) {
        // Clear from memory cache
        for (const [key] of this.#trustedDevices) {
            if (key.startsWith(`${userId}:`)) {
                this.#trustedDevices.delete(key);
            }
        }

        // Clear from database
        const user = await UserModel.findById(userId);
        if (user) {
            const clearedCount = user.mfa?.trustedDevices?.length || 0;

            if (!user.mfa) user.mfa = {};
            user.mfa.trustedDevices = [];
            await user.save();

            logger.info('All trusted devices cleared', {
                userId,
                clearedCount,
                requesterId: options.requesterId
            });

            return {
                success: true,
                message: `Cleared ${clearedCount} trusted devices`,
                clearedCount
            };
        }

        return {
            success: false,
            message: 'User not found',
            clearedCount: 0
        };
    }

    // ==================== SECURITY ASSESSMENT PRIVATE METHODS ====================

    /**
     * Assess password security
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Password security assessment
     */
    async #assessPasswordSecurity(user) {
        let score = 0;
        const issues = [];
        const recommendations = [];

        // Check if user has a password (OAuth-only users might not)
        if (!user.password) {
            if (user.authProviders?.length > 0) {
                score = 85; // OAuth-only is generally secure
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
                const ageInDays = passwordAge / (1000 * 60 * 60 * 24);

                if (ageInDays > 365) {
                    score -= 20;
                    issues.push('Password is over 1 year old');
                    recommendations.push('Change your password regularly');
                } else if (ageInDays > 180) {
                    score -= 10;
                    issues.push('Password is over 6 months old');
                }
            }

            // Check password history for reuse
            if (user.passwordHistory?.length < 5) {
                score -= 5;
                issues.push('Limited password history tracking');
            }

            // Check recent failed attempts
            if (user.security?.loginAttempts?.count > 0) {
                score -= 15;
                issues.push('Recent failed login attempts detected');
                recommendations.push('Review recent account activity');
            }
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            issues,
            recommendations,
            category: 'password'
        };
    }

    /**
     * Assess MFA security
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} MFA security assessment
     */
    async #assessMFASecurity(user) {
        let score = 0;
        const issues = [];
        const recommendations = [];

        if (!user.mfa?.enabled) {
            score = 0;
            issues.push('Multi-factor authentication is disabled');
            recommendations.push('Enable MFA immediately for better security');
        } else {
            score = 60; // Base score for having MFA enabled

            const enabledMethods = user.mfa.methods?.filter(m => m.enabled) || [];

            // Score based on number of methods
            if (enabledMethods.length >= 2) {
                score += 25;
            } else if (enabledMethods.length === 1) {
                score += 15;
                recommendations.push('Consider enabling a second MFA method for redundancy');
            }

            // Score based on method types
            const methodTypes = enabledMethods.map(m => m.type);
            if (methodTypes.includes('totp')) score += 10;
            if (methodTypes.includes('webauthn')) score += 15;
            if (methodTypes.includes('sms')) score += 5; // SMS is less secure
            if (methodTypes.includes('email')) score += 5;

            // Check for backup codes
            if (user.mfa.backupCodes?.length > 0) {
                score += 10;

                // Check if backup codes are recent
                if (user.mfa.backupCodesGeneratedAt) {
                    const codeAge = Date.now() - user.mfa.backupCodesGeneratedAt.getTime();
                    if (codeAge > 365 * 24 * 60 * 60 * 1000) { // Older than 1 year
                        issues.push('Backup codes are over 1 year old');
                        recommendations.push('Regenerate backup codes periodically');
                    }
                }
            } else {
                issues.push('No backup codes generated');
                recommendations.push('Generate backup codes for account recovery');
            }

            // Check last usage
            if (user.mfa.lastUsedAt) {
                const lastUsed = Date.now() - user.mfa.lastUsedAt.getTime();
                if (lastUsed > 30 * 24 * 60 * 60 * 1000) { // Not used in 30 days
                    issues.push('MFA not used recently');
                }
            }
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            issues,
            recommendations,
            category: 'mfa'
        };
    }

    /**
     * Assess session security
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Session security assessment
     */
    async #assessSessionSecurity(user) {
        let score = 70; // Base score
        const issues = [];
        const recommendations = [];

        try {
            // Get active sessions
            const activeSessions = await UserSessionModel.find({
                userId: user._id,
                status: 'active',
                expiresAt: { $gt: new Date() }
            });

            // Check number of active sessions
            if (activeSessions.length > 5) {
                score -= 10;
                issues.push('High number of active sessions');
                recommendations.push('Review and close unnecessary sessions');
            }

            // Check for high-risk sessions
            const highRiskSessions = activeSessions.filter(
                session => session.security?.riskScore > this.#securityConfig.riskThresholds.high
            );

            if (highRiskSessions.length > 0) {
                score -= 20;
                issues.push(`${highRiskSessions.length} high-risk sessions detected`);
                recommendations.push('Review high-risk sessions and terminate if unauthorized');
            }

            // Check for sessions from different locations
            const locations = new Set();
            activeSessions.forEach(session => {
                if (session.location?.city && session.location?.country) {
                    locations.add(`${session.location.city}, ${session.location.country}`);
                }
            });

            if (locations.size > 3) {
                score -= 15;
                issues.push('Sessions from multiple geographic locations');
                recommendations.push('Verify all session locations are legitimate');
            }

            // Check session ages
            const oldSessions = activeSessions.filter(session => {
                const sessionAge = Date.now() - session.createdAt.getTime();
                return sessionAge > 7 * 24 * 60 * 60 * 1000; // Older than 7 days
            });

            if (oldSessions.length > 0) {
                score -= 5;
                issues.push('Long-lived sessions detected');
                recommendations.push('Consider shorter session timeouts');
            }

        } catch (error) {
            logger.error('Session security assessment failed', {
                userId: user._id,
                error: error.message
            });
            score -= 20;
            issues.push('Unable to assess session security');
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            issues,
            recommendations,
            category: 'sessions'
        };
    }

    /**
     * Assess device security
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Device security assessment
     */
    async #assessDeviceSecurity(user) {
        let score = 60; // Base score
        const issues = [];
        const recommendations = [];

        // Check trusted devices
        const trustedDevices = user.mfa?.trustedDevices || [];

        if (trustedDevices.length === 0) {
            score += 10; // No trusted devices is actually more secure
            recommendations.push('Consider trusting frequently used devices for convenience');
        } else {
            // Check for expired trusted devices
            const expiredDevices = trustedDevices.filter(device => device.expiresAt < Date.now());
            if (expiredDevices.length > 0) {
                issues.push(`${expiredDevices.length} expired trusted devices found`);
                recommendations.push('Clean up expired trusted devices');
            }

            // Check for too many trusted devices
            const activeDevices = trustedDevices.filter(device => device.expiresAt > Date.now());
            if (activeDevices.length > 10) {
                score -= 15;
                issues.push('High number of trusted devices');
                recommendations.push('Review and remove unnecessary trusted devices');
            }

            // Check device trust duration
            const longTrustedDevices = activeDevices.filter(device => {
                const trustAge = Date.now() - device.trustedAt;
                return trustAge > 90 * 24 * 60 * 60 * 1000; // Trusted for over 90 days
            });

            if (longTrustedDevices.length > 0) {
                score -= 5;
                issues.push('Devices trusted for extended periods');
                recommendations.push('Periodically review device trust settings');
            }
        }

        // Check recent login patterns
        if (user.activity?.loginHistory) {
            const recentLogins = user.activity.loginHistory.slice(0, 10);
            const uniqueDevices = new Set(recentLogins.map(login => login.deviceId).filter(Boolean));

            if (uniqueDevices.size > 5) {
                score -= 10;
                issues.push('Many different devices used recently');
                recommendations.push('Verify all recent device usage is legitimate');
            }
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            issues,
            recommendations,
            category: 'devices'
        };
    }

    /**
     * Assess account security
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Account security assessment
     */
    async #assessAccountSecurity(user) {
        let score = 70; // Base score
        const issues = [];
        const recommendations = [];

        // Check email verification
        if (!user.verification?.email?.verified) {
            score -= 30;
            issues.push('Email address not verified');
            recommendations.push('Verify your email address immediately');
        }

        // Check account age
        if (user.registeredAt) {
            const accountAge = Date.now() - user.registeredAt.getTime();
            const ageInDays = accountAge / (1000 * 60 * 60 * 24);

            if (ageInDays < 30) {
                score -= 5; // New accounts are slightly higher risk
                issues.push('New account (less than 30 days old)');
            }
        }

        // Check profile completeness
        const profileFields = ['firstName', 'lastName', 'displayName'];
        const completedFields = profileFields.filter(field => user.profile?.[field]);

        if (completedFields.length < profileFields.length) {
            score -= 5;
            issues.push('Incomplete profile information');
            recommendations.push('Complete your profile information');
        }

        // Check organization membership
        if (!user.organizationId && (!user.organizations || user.organizations.length === 0)) {
            score -= 10;
            issues.push('No organization membership');
            recommendations.push('Join an organization for enhanced security policies');
        }

        // Check OAuth providers
        if (user.authProviders?.length > 0) {
            score += 10; // Having OAuth providers adds security

            // Check for multiple providers
            if (user.authProviders.length > 1) {
                score += 5;
            }
        }

        // Check for security incidents
        if (user.security?.incidents?.length > 0) {
            const recentIncidents = user.security.incidents.filter(incident => {
                const incidentAge = Date.now() - incident.timestamp.getTime();
                return incidentAge < 30 * 24 * 60 * 60 * 1000; // Within last 30 days
            });

            if (recentIncidents.length > 0) {
                score -= 25;
                issues.push(`${recentIncidents.length} recent security incidents`);
                recommendations.push('Review recent security incidents and take action');
            }
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            issues,
            recommendations,
            category: 'account'
        };
    }

    // ==================== UTILITY PRIVATE METHODS ====================

    /**
     * Get security level from score
     * @private
     * @param {number} score - Security score
     * @returns {string} Security level
     */
    #getSecurityLevel(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 60) return 'fair';
        if (score >= 40) return 'poor';
        return 'critical';
    }

    /**
     * Generate security recommendations from assessment
     * @private
     * @param {Object} assessment - Security assessment
     * @returns {Array} Security recommendations
     */
    #generateSecurityRecommendations(assessment) {
        const recommendations = [];

        // Collect all recommendations from categories
        Object.values(assessment.categories).forEach(category => {
            if (category.recommendations) {
                recommendations.push(...category.recommendations.map(rec => ({
                    category: category.category,
                    priority: category.score < 40 ? 'high' : category.score < 70 ? 'medium' : 'low',
                    recommendation: rec
                })));
            }
        });

        // Add overall recommendations based on score
        if (assessment.overallScore < 40) {
            recommendations.unshift({
                category: 'general',
                priority: 'critical',
                recommendation: 'Immediate security review required - multiple critical issues detected'
            });
        } else if (assessment.overallScore < 70) {
            recommendations.unshift({
                category: 'general',
                priority: 'high',
                recommendation: 'Security improvements recommended - address highlighted issues'
            });
        }

        // Sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }

    /**
     * Analyze potential threats for user
     * @private
     * @param {Object} user - User object
     * @param {Object} assessment - Security assessment
     * @returns {Promise<Object>} Threat analysis
     */
    async #analyzePotentialThreats(user, assessment) {
        const threats = [];

        // Analyze based on security score
        if (assessment.overallScore < 40) {
            threats.push({
                type: 'account_compromise',
                severity: 'high',
                description: 'Account is vulnerable to compromise due to weak security posture',
                indicators: ['low_security_score', 'multiple_issues']
            });
        }

        // Check for credential-based threats
        if (!user.mfa?.enabled) {
            threats.push({
                type: 'credential_theft',
                severity: 'medium',
                description: 'Account vulnerable to credential theft without MFA protection',
                indicators: ['no_mfa']
            });
        }

        // Check for session-based threats
        const activeSessions = await UserSessionModel.countDocuments({
            userId: user._id,
            status: 'active',
            expiresAt: { $gt: new Date() }
        });

        if (activeSessions > 5) {
            threats.push({
                type: 'session_hijacking',
                severity: 'medium',
                description: 'Multiple active sessions increase risk of session hijacking',
                indicators: ['multiple_sessions']
            });
        }

        // Check for device-based threats
        const trustedDevices = user.mfa?.trustedDevices?.filter(d => d.expiresAt > Date.now()) || [];
        if (trustedDevices.length > 10) {
            threats.push({
                type: 'device_compromise',
                severity: 'low',
                description: 'Many trusted devices increase attack surface',
                indicators: ['many_trusted_devices']
            });
        }

        return {
            threats,
            threatLevel: threats.length > 0 ? Math.max(...threats.map(t =>
                t.severity === 'high' ? 3 : t.severity === 'medium' ? 2 : 1
            )) : 0,
            lastAnalyzed: new Date()
        };
    }

    // ==================== PERMISSION AND ACCESS CONTROL ====================

    /**
     * Check session access permission
     * @private
     * @param {string} requesterId - Requester user ID
     * @param {string} userId - Target user ID
     */
    async #checkSessionAccessPermission(requesterId, userId) {
        if (requesterId === userId) return; // Self-access allowed

        // Check if requester has admin privileges
        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        // Check for admin roles or permissions
        const hasAdminAccess = requester.roles?.includes('admin') ||
            requester.roles?.includes('security-admin');

        if (!hasAdminAccess) {
            throw new ForbiddenError('Insufficient permissions to access user sessions', 'INSUFFICIENT_PERMISSIONS');
        }
    }

    /**
     * Check session revoke permission
     * @private
     * @param {string} requesterId - Requester user ID
     * @param {string} userId - Target user ID
     */
    async #checkSessionRevokePermission(requesterId, userId) {
        await this.#checkSessionAccessPermission(requesterId, userId);
    }

    /**
     * Check device management permission
     * @private
     * @param {string} requesterId - Requester user ID
     * @param {string} userId - Target user ID
     */
    async #checkDeviceManagementPermission(requesterId, userId) {
        await this.#checkSessionAccessPermission(requesterId, userId);
    }

    // ==================== HELPER METHODS ====================

    /**
     * Mask phone number for display
     * @private
     * @param {string} phoneNumber - Phone number to mask
     * @returns {string} Masked phone number
     */
    #maskPhoneNumber(phoneNumber) {
        if (phoneNumber.length <= 4) return phoneNumber;
        const visible = phoneNumber.slice(-4);
        const masked = '*'.repeat(Math.max(0, phoneNumber.length - 4));
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

    /**
     * Parse user agent string
     * @private
     * @param {string} userAgent - User agent string
     * @returns {Object} Parsed user agent data
     */
    #parseUserAgent(userAgent) {
        const uaParser = new UAParser(userAgent);
        const result = uaParser.getResult();

        return {
            browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
            os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
            device: result.device.type || 'desktop'
        };
    }

    /**
     * Extract groups from SSO attributes
     * @private
     * @param {Object} attributes - SSO attributes
     * @returns {Array} Extracted groups
     */
    #extractGroups(attributes) {
        const groupAttributes = [
            'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
            'groups',
            'memberOf',
            'roles'
        ];

        for (const attr of groupAttributes) {
            if (attributes[attr]) {
                const value = attributes[attr];
                return Array.isArray(value) ? value : [value];
            }
        }

        return [];
    }

    /**
     * Map SSO groups to application roles
     * @private
     * @param {Array} groups - SSO groups
     * @param {string} provider - SSO provider
     * @returns {Array} Mapped roles
     */
    #mapSSOGroups(groups, provider) {
        // Define group-to-role mappings per provider
        const roleMappings = {
            enterprise_saml: {
                'Administrators': ['admin'],
                'Security Admins': ['security-admin'],
                'Users': ['user'],
                'Managers': ['manager'],
                'HR Team': ['hr'],
                'IT Support': ['support']
            }
        };

        const mappings = roleMappings[provider] || {};
        const roles = new Set(['user']); // Default role

        groups.forEach(group => {
            const mappedRoles = mappings[group];
            if (mappedRoles) {
                mappedRoles.forEach(role => roles.add(role));
            }
        });

        return Array.from(roles);
    }

    /**
     * Extract department from groups
     * @private
     * @param {Array} groups - SSO groups
     * @returns {string} Department name
     */
    #extractDepartment(groups) {
        const departmentPrefixes = ['Dept-', 'Department-', 'Team-'];

        for (const group of groups) {
            for (const prefix of departmentPrefixes) {
                if (group.startsWith(prefix)) {
                    return group.substring(prefix.length);
                }
            }
        }

        return null;
    }

    /**
     * Map SSO permissions from roles and groups
     * @private
     * @param {Array} roles - User roles
     * @param {Array} groups - User groups
     * @returns {Array} Permissions
     */
    #mapSSOPermissions(roles, groups) {
        const permissions = new Set();

        // Role-based permissions
        const rolePermissions = {
            admin: ['*'],
            'security-admin': ['security:*', 'users:read', 'audit:read'],
            manager: ['users:read', 'reports:read'],
            user: ['profile:read', 'profile:write']
        };

        roles.forEach(role => {
            const perms = rolePermissions[role] || [];
            perms.forEach(perm => permissions.add(perm));
        });

        // Group-based permissions could be added here

        return Array.from(permissions);
    }

    /**
     * Generate username from SSO attributes
     * @private
     * @param {Object} userAttributes - SSO user attributes
     * @returns {Promise<string>} Generated username
     */
    async #generateUsernameFromSSO(userAttributes) {
        // Try different strategies for username generation
        let baseUsername;

        if (userAttributes.employeeId) {
            baseUsername = `emp${userAttributes.employeeId}`;
        } else if (userAttributes.email) {
            baseUsername = userAttributes.email.split('@')[0].toLowerCase();
        } else {
            baseUsername = `${userAttributes.firstName || 'user'}${userAttributes.lastName || ''}`.toLowerCase();
        }

        // Clean username
        baseUsername = baseUsername.replace(/[^a-z0-9]/g, '');

        // Ensure uniqueness
        let username = baseUsername;
        let counter = 1;
        while (await UserModel.findOne({ username })) {
            username = `${baseUsername}${counter}`;
            counter++;
        }

        return username;
    }

    /**
     * Get MFA recommendations for user
     * @private
     * @param {Object} user - User object
     * @returns {Array} MFA recommendations
     */
    #getMFARecommendations(user) {
        const recommendations = [];
        const enabledMethods = user.mfa?.methods?.filter(m => m.enabled) || [];

        if (enabledMethods.length === 0) {
            recommendations.push({
                type: 'setup_first_method',
                priority: 'high',
                message: 'Set up your first MFA method to secure your account'
            });
        } else {
            if (enabledMethods.length === 1) {
                recommendations.push({
                    type: 'setup_backup_method',
                    priority: 'medium',
                    message: 'Add a second MFA method for account recovery'
                });
            }

            if (!enabledMethods.some(m => m.type === 'totp')) {
                recommendations.push({
                    type: 'setup_authenticator',
                    priority: 'medium',
                    message: 'Consider using an authenticator app for offline access'
                });
            }

            if (!user.mfa.backupCodes || user.mfa.backupCodes.length === 0) {
                recommendations.push({
                    type: 'generate_backup_codes',
                    priority: 'medium',
                    message: 'Generate backup codes for emergency access'
                });
            }
        }

        return recommendations;
    }

    /**
     * Calculate MFA security level
     * @private
     * @param {Array} mfaMethods - Array of MFA methods
     * @returns {string} Security level
     */
    #calculateMFASecurityLevel(mfaMethods) {
        if (!mfaMethods || mfaMethods.length === 0) return 'none';

        const enabledMethods = mfaMethods.filter(m => m.enabled);
        if (enabledMethods.length === 0) return 'none';

        let score = 0;
        const methodScores = {
            totp: 8,
            webauthn: 10,
            push: 7,
            sms: 4,
            email: 3,
            backup_codes: 2
        };

        enabledMethods.forEach(method => {
            score += methodScores[method.type] || 0;
        });

        if (score >= 15) return 'excellent';
        if (score >= 10) return 'good';
        if (score >= 6) return 'fair';
        return 'basic';
    }

    /**
     * Get MFA next steps for user
     * @private
     * @param {Object} user - User object
     * @returns {Array} Next steps recommendations
     */
    #getMFANextSteps(user) {
        const nextSteps = [];
        const enabledMethods = user.mfa?.methods?.filter(m => m.enabled) || [];

        if (enabledMethods.length === 1) {
            nextSteps.push('Consider setting up a second MFA method for redundancy');
        }

        if (!user.mfa?.backupCodes || user.mfa.backupCodes.length === 0) {
            nextSteps.push('Generate backup codes for account recovery');
        }

        if (!enabledMethods.some(m => m.type === 'totp')) {
            nextSteps.push('Consider setting up an authenticator app for offline access');
        }

        if (!enabledMethods.some(m => m.type === 'webauthn')) {
            nextSteps.push('Consider using a hardware security key for maximum security');
        }

        const hasBackupCodes = user.mfa?.backupCodes?.filter(code => !code.used).length > 0;
        if (hasBackupCodes && user.mfa.backupCodes.filter(code => !code.used).length < 3) {
            nextSteps.push('Consider regenerating backup codes - few remaining');
        }

        return nextSteps;
    }

    /**
     * Record failed MFA attempt with enhanced tracking
     * @private
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {Object} deviceInfo - Device information
     * @param {string} context - Additional context
     */
    async #recordFailedMFA(userId, method, deviceInfo, context = 'verification') {
        try {
            // Enhanced audit logging
            await this.#auditService.log({
                action: 'MFA_FAILED',
                entityType: 'authentication',
                entityId: userId,
                userId: userId,
                details: {
                    method,
                    context,
                    ipAddress: deviceInfo?.ipAddress,
                    deviceId: deviceInfo?.deviceId,
                    userAgent: deviceInfo?.userAgent
                }
            });

            // Increment failed MFA attempts counter with context
            const failedKey = `mfa_failed:${userId}:${method}`;
            const failedAttempts = await this.#cacheService.get(failedKey) || 0;
            await this.#cacheService.set(failedKey, failedAttempts + 1, 900); // 15 minutes

            // Send security alert after multiple failures
            if (failedAttempts >= 2) {
                const user = await UserModel.findById(userId);
                if (user) {
                    await this.#sendSecurityAlert(user, deviceInfo, 75, ['repeated_mfa_failures'], {
                        method,
                        context,
                        attemptCount: failedAttempts + 1
                    });
                }
            }

        } catch (error) {
            logger.warn('Failed to record MFA failure', {
                userId,
                method,
                context,
                error: error.message
            });
        }
    }

    /**
     * Send MFA enabled notifications with enhanced details
     * @private
     * @param {Object} user - User object
     * @param {string} method - MFA method that was enabled
     * @param {Object} context - Additional context
     */
    async #sendMFAEnabledNotifications(user, method, context = {}) {
        try {
            const { deviceInfo, securityLevel } = context;

            // Send confirmation email
            await this.#emailService.sendMFAEnabledConfirmation(user.email, {
                firstName: user.profile?.firstName,
                method: method.toUpperCase(),
                timestamp: new Date(),
                securityLevel,
                deviceInfo: deviceInfo ? {
                    name: deviceInfo.deviceName || 'Unknown Device',
                    location: deviceInfo.location
                } : null
            });

            // Send in-app notification
            await this.#notificationService.sendNotification({
                type: 'MFA_ENABLED',
                recipients: [user._id.toString()],
                data: {
                    method,
                    timestamp: new Date(),
                    securityLevel,
                    nextSteps: this.#getMFANextSteps(user)
                },
                priority: 'normal'
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
     * Enhanced session tracking with additional metadata
     * @private
     * @param {string} sessionId - Session ID
     * @param {Object} enhancementData - Enhancement data
     */
    async #enhanceSessionTracking(sessionId, enhancementData) {
        try {
            const { riskScore, riskFactors, deviceInfo, location } = enhancementData;

            await UserSessionModel.findOneAndUpdate(
                { sessionId },
                {
                    $set: {
                        'security.riskScore': riskScore,
                        'security.riskFactors': riskFactors,
                        'security.threatLevel': this.#getThreatLevel(riskScore),
                        'metadata.enhancedAt': new Date(),
                        'location': location
                    }
                }
            );

            logger.debug('Session enhanced with security data', {
                sessionId,
                riskScore,
                threatLevel: this.#getThreatLevel(riskScore)
            });

        } catch (error) {
            logger.warn('Failed to enhance session tracking', {
                sessionId,
                error: error.message
            });
        }
    }

    /**
     * Send session revoked notification
     * @private
     * @param {string} userId - User ID
     * @param {Object} session - Session object
     * @param {string} revokedBy - ID of user who revoked session
     * @param {string} reason - Revocation reason
     */
    async #sendSessionRevokedNotification(userId, session, revokedBy, reason) {
        try {
            const user = await UserModel.findById(userId);
            const revoker = await UserModel.findById(revokedBy);

            if (user) {
                await this.#notificationService.sendNotification({
                    type: 'SESSION_REVOKED',
                    recipients: [userId],
                    data: {
                        sessionInfo: {
                            deviceInfo: session.deviceInfo,
                            location: session.location,
                            createdAt: session.createdAt
                        },
                        revokedBy: revoker ? {
                            name: revoker.profile?.displayName || revoker.email,
                            id: revokedBy
                        } : null,
                        reason,
                        timestamp: new Date()
                    },
                    priority: 'high'
                });

                // Also send email if revoked by admin
                if (revokedBy !== userId) {
                    await this.#emailService.sendSessionRevokedEmail(user.email, {
                        firstName: user.profile?.firstName,
                        sessionInfo: session.deviceInfo,
                        revokedBy: revoker?.profile?.displayName || 'Administrator',
                        reason,
                        timestamp: new Date()
                    });
                }
            }

        } catch (error) {
            logger.warn('Failed to send session revoked notification', {
                userId,
                revokedBy,
                error: error.message
            });
        }
    }

    /**
     * Send enhanced security alert with detailed context
     * @private
     * @param {Object} user - User object
     * @param {Object} deviceInfo - Device information
     * @param {number|Array} alertData - Risk score or risk factors array
     * @param {Array} [additionalFactors] - Additional risk factors
     * @param {Object} [context] - Additional context
     */
    async #sendSecurityAlert(user, deviceInfo, alertData, additionalFactors = [], context = {}) {
        try {
            const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
            const uaParser = new UAParser(deviceInfo.userAgent);
            const parsedUA = uaParser.getResult();

            let riskScore, riskFactors;

            if (typeof alertData === 'number') {
                riskScore = alertData;
                riskFactors = additionalFactors;
            } else {
                riskFactors = alertData;
                riskScore = additionalFactors[0] || 50;
            }

            const alertPayload = {
                userId: user._id,
                alertType: context.alertType || this.#determineAlertType(riskFactors),
                timestamp: new Date(),
                riskScore,
                riskFactors,
                threatLevel: this.#getThreatLevel(riskScore),
                location: location ? `${location.city}, ${location.country}` : 'Unknown',
                device: `${parsedUA.browser.name || 'Unknown'} on ${parsedUA.os.name || 'Unknown'}`,
                ipAddress: deviceInfo.ipAddress,
                context
            };

            // Send email alert
            await this.#emailService.sendSecurityAlert(user.email, {
                firstName: user.profile?.firstName,
                ...alertPayload,
                actionRequired: riskScore > this.#securityConfig.riskThresholds.high,
                recommendations: this.#getSecurityRecommendations(riskScore, riskFactors)
            });

            // Send in-app notification
            await this.#notificationService.sendNotification({
                type: 'SECURITY_ALERT',
                recipients: [user._id.toString()],
                data: alertPayload,
                priority: riskScore > this.#securityConfig.riskThresholds.high ? 'high' : 'medium'
            });

            logger.info('Enhanced security alert sent', {
                userId: user._id,
                alertType: alertPayload.alertType,
                riskScore,
                location: alertPayload.location
            });

        } catch (error) {
            logger.error('Failed to send enhanced security alert', {
                userId: user._id,
                riskScore: typeof alertData === 'number' ? alertData : 50,
                error: error.message
            });
        }
    }

    /**
     * Determine alert type from risk factors
     * @private
     * @param {Array} riskFactors - Risk factors
     * @returns {string} Alert type
     */
    #determineAlertType(riskFactors) {
        if (riskFactors.includes('compromised_credentials')) return 'credential_compromise';
        if (riskFactors.includes('repeated_failed_attempts')) return 'brute_force_attempt';
        if (riskFactors.includes('repeated_mfa_failures')) return 'mfa_bypass_attempt';
        if (riskFactors.includes('new_device') && riskFactors.includes('new_location')) return 'suspicious_login';
        if (riskFactors.includes('vpn_or_proxy')) return 'anonymous_access';
        if (riskFactors.includes('anomalous_pattern')) return 'unusual_activity';
        return 'security_concern';
    }

    /**
     * Trust a device for simplified authentication flows
     * @private
     * @param {string} userId - User ID
     * @param {Object} deviceInfo - Device information
     * @param {Object} [options] - Trust options
     */
    async #trustDevice(userId, deviceInfo, options = {}) {
        const {
            duration = this.#securityConfig.deviceTrustDuration,
            reason = 'user_request'
        } = options;

        try {
            const key = `${userId}:${deviceInfo.deviceId}`;

            // Get location data for the device
            const location = await this.#getLocationFromIP(deviceInfo.ipAddress);

            // Parse user agent for device information
            const uaParser = new UAParser(deviceInfo.userAgent);
            const parsedUA = uaParser.getResult();

            const trustedDevice = {
                userId,
                deviceId: deviceInfo.deviceId,
                deviceName: deviceInfo.deviceName || `${parsedUA.browser.name || 'Unknown'} on ${parsedUA.os.name || 'Unknown'}`,
                userAgent: deviceInfo.userAgent,
                trustedAt: Date.now(),
                expiresAt: Date.now() + duration,
                ipAddress: deviceInfo.ipAddress,
                location,
                reason,
                metadata: {
                    browser: parsedUA.browser.name,
                    browserVersion: parsedUA.browser.version,
                    os: parsedUA.os.name,
                    osVersion: parsedUA.os.version,
                    deviceType: parsedUA.device.type || 'desktop'
                }
            };

            // Store in memory cache
            this.#trustedDevices.set(key, trustedDevice);

            // Store in database for persistence
            const user = await UserModel.findById(userId);
            if (user) {
                if (!user.mfa) user.mfa = {};
                if (!user.mfa.trustedDevices) user.mfa.trustedDevices = [];

                // Remove existing entry for same device
                user.mfa.trustedDevices = user.mfa.trustedDevices.filter(
                    device => device.deviceId !== deviceInfo.deviceId
                );

                // Add new trusted device
                user.mfa.trustedDevices.push({
                    deviceId: trustedDevice.deviceId,
                    deviceName: trustedDevice.deviceName,
                    trustedAt: new Date(trustedDevice.trustedAt),
                    expiresAt: new Date(trustedDevice.expiresAt),
                    ipAddress: trustedDevice.ipAddress,
                    location: trustedDevice.location,
                    userAgent: trustedDevice.userAgent,
                    reason: trustedDevice.reason,
                    metadata: trustedDevice.metadata
                });

                await user.save();
            }

            // Audit device trust
            await this.#auditService.log({
                action: 'DEVICE_TRUSTED',
                entityType: 'authentication',
                entityId: userId,
                userId: userId,
                details: {
                    deviceId: deviceInfo.deviceId,
                    deviceName: trustedDevice.deviceName,
                    ipAddress: deviceInfo.ipAddress,
                    location: location ? `${location.city}, ${location.country}` : 'Unknown',
                    duration: duration / (1000 * 60 * 60 * 24), // Convert to days
                    reason
                }
            });

            logger.info('Device trusted successfully', {
                userId,
                deviceId: deviceInfo.deviceId,
                deviceName: trustedDevice.deviceName,
                expiresAt: new Date(trustedDevice.expiresAt),
                reason
            });

        } catch (error) {
            logger.error('Failed to trust device', {
                userId,
                deviceId: deviceInfo.deviceId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = UserAuthService;