/**
 * @fileoverview Universal Authentication Service Engine
 * @module shared/lib/auth/services/auth-service
 * @description Framework-agnostic authentication engine for any user type or context
 * @version 3.0.0
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// Core dependencies
const database = require('../../database');
const HashService = require('../../security/encryption/hash-service');
const logger = require('../../utils/logger').getLogger();
const { AppError } = require('../../utils/app-error');
const config = require('../../../config');

// Related auth services
const TokenService = require('./token-service');
const SessionService = require('./session-service');
const TwoFactorService = require('./two-factor-service');
const BlacklistService = require('./blacklist-service');
const PasswordService = require('./password-service');

/**
 * Authentication Methods
 * @enum {string}
 */
const AUTH_METHODS = {
    PASSWORD: 'password',
    OAUTH_GOOGLE: 'oauth_google',
    OAUTH_GITHUB: 'oauth_github',
    OAUTH_LINKEDIN: 'oauth_linkedin',
    PASSKEY: 'passkey',
    MAGIC_LINK: 'magic_link',
    SSO: 'sso',
    API_KEY: 'api_key',
    MFA_TOTP: 'mfa_totp',
    MFA_SMS: 'mfa_sms',
    MFA_EMAIL: 'mfa_email',
    MFA_BACKUP_CODE: 'mfa_backup_code',
    BIOMETRIC: 'biometric'
};

/**
 * Authentication Events
 * @enum {string}
 */
const AUTH_EVENTS = {
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
    LOGIN_BLOCKED: 'login_blocked',
    LOGOUT: 'logout',
    TOKEN_REFRESH: 'token_refresh',
    PASSWORD_RESET_REQUEST: 'password_reset_request',
    PASSWORD_RESET_SUCCESS: 'password_reset_success',
    PASSWORD_CHANGED: 'password_changed',
    MFA_ENABLED: 'mfa_enabled',
    MFA_DISABLED: 'mfa_disabled',
    MFA_VERIFIED: 'mfa_verified',
    MFA_FAILED: 'mfa_failed',
    ACCOUNT_LOCKED: 'account_locked',
    ACCOUNT_UNLOCKED: 'account_unlocked',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    NEW_DEVICE: 'new_device',
    NEW_LOCATION: 'new_location',
    EMAIL_VERIFICATION_SENT: 'email_verification_sent',
    EMAIL_VERIFIED: 'email_verified',
    OAUTH_LINKED: 'oauth_linked',
    OAUTH_UNLINKED: 'oauth_unlinked',
    PASSKEY_REGISTERED: 'passkey_registered',
    PASSKEY_REMOVED: 'passkey_removed',
    SESSION_CREATED: 'session_created',
    SESSION_TERMINATED: 'session_terminated',
    SECURITY_ALERT: 'security_alert'
};

/**
 * Account Status
 * @enum {string}
 */
const ACCOUNT_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    LOCKED: 'locked',
    PENDING_VERIFICATION: 'pending_verification',
    PENDING_APPROVAL: 'pending_approval',
    DELETED: 'deleted',
    BANNED: 'banned'
};

/**
 * MFA Challenge Types
 * @enum {string}
 */
const MFA_CHALLENGE_TYPES = {
    TOTP: 'totp',
    SMS: 'sms',
    EMAIL: 'email',
    PUSH: 'push',
    BACKUP_CODE: 'backup_code',
    WEBAUTHN: 'webauthn',
    BIOMETRIC: 'biometric'
};

/**
 * User Type Enum
 * @enum {string}
 */
const USER_TYPES = {
    CUSTOMER: 'customer',
    ADMIN: 'admin',
    PARTNER: 'partner',
    VENDOR: 'vendor',
    CONSULTANT: 'consultant',
    EMPLOYEE: 'employee',
    GUEST: 'guest',
    API_USER: 'api_user'
};

/**
 * Universal Authentication Service
 * Framework-agnostic authentication engine that can be configured for any context
 * @class AuthService
 */
class AuthService {
    constructor(options = {}) {
        this.tokenService = TokenService;
        this.sessionService = SessionService;
        this.twoFactorService = TwoFactorService;
        this.blacklistService = BlacklistService;
        this.passwordService = PasswordService;
        
        // Universal configuration with context-aware defaults
        this.config = this._buildConfiguration(options);

        // Statistics tracking
        this.stats = {
            totalLogins: 0,
            failedLogins: 0,
            successfulLogins: 0,
            mfaChallenges: 0,
            accountLockouts: 0,
            suspiciousActivities: 0
        };

        // Context-specific hooks for extensibility
        this.hooks = {
            beforeRegister: options.hooks?.beforeRegister || null,
            afterRegister: options.hooks?.afterRegister || null,
            beforeLogin: options.hooks?.beforeLogin || null,
            afterLogin: options.hooks?.afterLogin || null,
            beforeLogout: options.hooks?.beforeLogout || null,
            afterLogout: options.hooks?.afterLogout || null,
            onAuthEvent: options.hooks?.onAuthEvent || null,
            validateUser: options.hooks?.validateUser || null,
            enrichUserData: options.hooks?.enrichUserData || null,
            sanitizeUserData: options.hooks?.sanitizeUserData || this._defaultSanitizeUserData.bind(this)
        };

        // User structure configuration
        this.userStructure = options.userStructure || this._getDefaultUserStructure();

        // Initialize database
        this._initializeDatabase();
    }

    /**
     * Build configuration from options and environment
     * @private
     */
    _buildConfiguration(options) {
        const contextConfig = options.context || 'default';
        const envPrefix = `AUTH_${contextConfig.toUpperCase()}_`;

        return {
            context: contextConfig,
            maxLoginAttempts: this._getConfigValue(envPrefix, 'MAX_LOGIN_ATTEMPTS', options.maxLoginAttempts, 5),
            lockoutDuration: this._getConfigValue(envPrefix, 'LOCKOUT_DURATION', options.lockoutDuration, 30 * 60 * 1000),
            sessionTimeout: this._getConfigValue(envPrefix, 'SESSION_TIMEOUT', options.sessionTimeout, 24 * 60 * 60 * 1000),
            maxActiveSessions: this._getConfigValue(envPrefix, 'MAX_ACTIVE_SESSIONS', options.maxActiveSessions, 5),
            requireEmailVerification: this._getConfigValue(envPrefix, 'REQUIRE_EMAIL_VERIFICATION', options.requireEmailVerification, true),
            enableMFA: this._getConfigValue(envPrefix, 'ENABLE_MFA', options.enableMFA, true),
            enableDeviceTracking: this._getConfigValue(envPrefix, 'ENABLE_DEVICE_TRACKING', options.enableDeviceTracking, true),
            enableLocationTracking: this._getConfigValue(envPrefix, 'ENABLE_LOCATION_TRACKING', options.enableLocationTracking, true),
            enableSuspiciousActivityDetection: this._getConfigValue(envPrefix, 'ENABLE_SUSPICIOUS_ACTIVITY', options.enableSuspiciousActivityDetection, true),
            passwordResetTokenExpiry: this._getConfigValue(envPrefix, 'PASSWORD_RESET_EXPIRY', options.passwordResetTokenExpiry, 3600000),
            emailVerificationTokenExpiry: this._getConfigValue(envPrefix, 'EMAIL_VERIFICATION_EXPIRY', options.emailVerificationTokenExpiry, 86400000),
            magicLinkExpiry: this._getConfigValue(envPrefix, 'MAGIC_LINK_EXPIRY', options.magicLinkExpiry, 900000),
            trustedDeviceExpiry: this._getConfigValue(envPrefix, 'TRUSTED_DEVICE_EXPIRY', options.trustedDeviceExpiry, 30 * 24 * 60 * 60 * 1000),
            userModel: options.userModel || 'User',
            metadataFields: options.metadataFields || [],
            trackingFields: options.trackingFields || ['registrationIp', 'registrationUserAgent']
        };
    }

    /**
     * Get configuration value with fallback chain
     * @private
     */
    _getConfigValue(envPrefix, envSuffix, optionValue, defaultValue) {
        if (optionValue !== undefined) return optionValue;
        const envValue = process.env[envPrefix + envSuffix];
        if (envValue !== undefined) {
            if (envValue === 'true') return true;
            if (envValue === 'false') return false;
            const numValue = Number(envValue);
            if (!isNaN(numValue)) return numValue;
            return envValue;
        }
        return defaultValue;
    }

    /**
     * Get default user structure template
     * @private
     */
    _getDefaultUserStructure() {
        return {
            identityFields: ['email', 'username'],
            credentialFields: ['password', 'passwordHash'],
            profileFields: ['firstName', 'lastName', 'displayName', 'phoneNumber'],
            statusFields: ['accountStatus'],
            securityFields: ['security', 'verification', 'mfa'],
            metadataFields: ['metadata', 'activity'],
            organizationFields: ['organizations', 'tenants', 'memberships']
        };
    }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase() {
        try {
            this.db = database;
            if (!this.db.isInitialized) {
                await this.db.initialize({
                    environment: process.env.NODE_ENV || 'development',
                    autoDiscoverModels: true,
                    enableHealthChecks: true,
                    enableMetrics: true
                });
            }
            logger.info('AuthService: Database initialized', { context: this.config.context });
        } catch (error) {
            logger.error('AuthService: Database initialization failed', {
                error: error.message,
                context: this.config.context
            });
            throw new AppError('Database initialization failed', 500, 'DB_INIT_FAILED');
        }
    }

    /**
     * Get User model from database
     * @private
     */
    _getUserModel() {
        try {
            return this.db.getModel(this.config.userModel);
        } catch (error) {
            logger.error('AuthService: Failed to get User model', {
                error: error.message,
                model: this.config.userModel
            });
            throw new AppError(`${this.config.userModel} model not found`, 500, 'MODEL_NOT_FOUND');
        }
    }

    // ============= CORE AUTHENTICATION METHODS =============

    /**
     * Register a new user (universal method)
     * @param {Object} userData - User registration data
     * @param {string} tenantId - Tenant/organization identifier
     * @param {Object} options - Registration options
     * @param {string} [options.userType] - Type of user being registered
     * @param {Object} [options.customFields] - Custom fields specific to user type
     * @param {Object} [options.roleConfig] - Role configuration
     * @param {Object} [options.metadata] - Additional metadata
     * @returns {Promise<Object>} Registration result
     */
    async register(userData, tenantId, options = {}) {
        try {
            const User = this._getUserModel();

            // Execute beforeRegister hook if provided
            if (this.hooks.beforeRegister) {
                await this.hooks.beforeRegister(userData, tenantId, options);
            }

            // Validate email format
            if (!this._isValidEmail(userData.email)) {
                throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
            }

            // Check if user already exists (flexible query based on configuration)
            const existingUser = await this._findExistingUser(userData.email, tenantId, options);
            if (existingUser) {
                throw new AppError('User already exists with this email', 409, 'USER_EXISTS');
            }

            // Validate password strength
            const passwordValidation = await this.passwordService.validate(userData.password);
            if (!passwordValidation.valid) {
                throw new AppError(
                    `Password validation failed: ${passwordValidation.errors.join(', ')}`,
                    400,
                    'INVALID_PASSWORD'
                );
            }

            // Hash password
            const hashedPassword = await this.passwordService.hash(userData.password);

            // Build user document with flexible structure
            const userDocument = await this._buildUserDocument(
                userData,
                hashedPassword,
                tenantId,
                options
            );

            // Enrich user data if hook provided
            if (this.hooks.enrichUserData) {
                await this.hooks.enrichUserData(userDocument, options);
            }

            // Create user in database
            const newUser = await User.create(userDocument);

            // Generate email verification token if required
            let verificationToken = null;
            if (this.config.requireEmailVerification && newUser.generateEmailVerificationToken) {
                verificationToken = await newUser.generateEmailVerificationToken();
                
                await this._logAuthEvent({
                    userId: newUser._id,
                    event: AUTH_EVENTS.EMAIL_VERIFICATION_SENT,
                    method: AUTH_METHODS.PASSWORD,
                    metadata: { email: newUser.email }
                });
            }

            // Generate authentication tokens
            const tokens = await this._generateAuthTokens(newUser, tenantId, options);

            // Create session
            const session = await this.sessionService.createSession({
                userId: newUser._id,
                tenantId: tenantId,
                ip: options.ip,
                userAgent: options.userAgent,
                deviceFingerprint: options.deviceFingerprint,
                metadata: options.sessionMetadata
            });

            // Execute afterRegister hook if provided
            if (this.hooks.afterRegister) {
                await this.hooks.afterRegister(newUser, tokens, session, options);
            }

            // Prepare response
            const response = {
                user: await this._sanitizeUserData(newUser, options),
                tokens: tokens,
                sessionId: session.id,
                requiresEmailVerification: this.config.requireEmailVerification,
                verificationToken: verificationToken,
                userType: options.userType || USER_TYPES.CUSTOMER
            };

            logger.info('User registered successfully', {
                userId: newUser._id,
                email: newUser.email,
                tenantId,
                userType: options.userType,
                context: this.config.context
            });

            return response;

        } catch (error) {
            logger.error('Registration failed', {
                error: error.message,
                email: userData.email,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Authenticate user with credentials (universal method)
     * @param {Object} credentials - Login credentials
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Login options
     * @returns {Promise<Object>} Authentication result
     */
    async login(credentials, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            this.stats.totalLogins++;

            // Execute beforeLogin hook if provided
            if (this.hooks.beforeLogin) {
                await this.hooks.beforeLogin(credentials, tenantId, options);
            }

            // Find user with flexible query
            const user = await this._findUserForLogin(credentials, tenantId, options);
            if (!user) {
                this.stats.failedLogins++;
                throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
            }

            // Validate user status
            await this._validateUserStatus(user, options);

            // Verify password
            const isPasswordValid = await this._verifyPassword(user, credentials.password);
            if (!isPasswordValid) {
                await this._handleFailedLogin(user, options);
                this.stats.failedLogins++;
                throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
            }

            // Check if MFA is required
            if (user.mfa?.enabled && !credentials.mfaCode) {
                const tempToken = await this.tokenService.generateTempToken(user, tenantId);
                this.stats.mfaChallenges++;
                
                return {
                    requiresMFA: true,
                    tempToken: tempToken,
                    mfaMethods: this._getAvailableMFAMethods(user),
                    preferredMethod: user.mfa.preferredMethod,
                    userId: user._id.toString()
                };
            }

            // Verify MFA if provided
            if (user.mfa?.enabled && credentials.mfaCode) {
                const mfaValid = await this._verifyMFACode(user, credentials.mfaCode, credentials.mfaMethod);
                if (!mfaValid) {
                    this.stats.failedLogins++;
                    await this._logAuthEvent({
                        userId: user._id,
                        event: AUTH_EVENTS.MFA_FAILED,
                        method: credentials.mfaMethod || AUTH_METHODS.MFA_TOTP,
                        success: false,
                        metadata: { ip: options.ip }
                    });
                    throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
                }
            }

            // Check for suspicious activity
            if (this.config.enableSuspiciousActivityDetection) {
                const isSuspicious = await this._detectSuspiciousActivity(user, options);
                if (isSuspicious) {
                    this.stats.suspiciousActivities++;
                    logger.warn('Suspicious login activity detected', {
                        userId: user._id,
                        ip: options.ip,
                        location: this._getLocationFromIP(options.ip)
                    });
                }
            }

            // Generate authentication tokens
            const tokens = await this._generateAuthTokens(user, tenantId, options);

            // Create session
            const session = await this.sessionService.createSession({
                userId: user._id,
                tenantId: tenantId,
                ip: options.ip,
                userAgent: options.userAgent,
                deviceFingerprint: options.deviceFingerprint,
                location: this._getLocationFromIP(options.ip),
                authMethod: user.mfa?.enabled ? AUTH_METHODS.MFA_TOTP : AUTH_METHODS.PASSWORD,
                metadata: options.sessionMetadata
            });

            // Record successful login
            await this._recordSuccessfulLogin(user, session, options);

            // Manage device trust
            if (this.config.enableDeviceTracking && options.deviceFingerprint) {
                await this._manageDeviceTrust(user, options.deviceFingerprint, options);
            }

            // Execute afterLogin hook if provided
            if (this.hooks.afterLogin) {
                await this.hooks.afterLogin(user, tokens, session, options);
            }

            this.stats.successfulLogins++;

            const response = {
                user: await this._sanitizeUserData(user, options),
                tokens: tokens,
                session: {
                    id: session.id,
                    expiresAt: session.expiresAt
                },
                requiresPasswordChange: this._requiresPasswordChange(user),
                trustedDevice: this._isDeviceTrusted(user, options.deviceFingerprint),
                userType: options.userType || this._getUserType(user)
            };

            logger.info('User logged in successfully', {
                userId: user._id,
                email: user.email,
                tenantId,
                context: this.config.context
            });

            return response;

        } catch (error) {
            logger.error('Login failed', {
                error: error.message,
                email: credentials.email,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Logout user and invalidate session
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @param {Object} options - Logout options
     * @returns {Promise<Object>} Logout result
     */
    async logout(userId, sessionId, options = {}) {
        try {
            // Execute beforeLogout hook if provided
            if (this.hooks.beforeLogout) {
                await this.hooks.beforeLogout(userId, sessionId, options);
            }

            // Terminate session
            await this.sessionService.terminateSession(sessionId);

            // Blacklist tokens if provided
            if (options.accessToken) {
                await this.blacklistService.addToken(
                    options.accessToken,
                    'logout',
                    new Date(Date.now() + 24 * 60 * 60 * 1000)
                );
            }

            if (options.refreshToken) {
                const decoded = this.tokenService.decodeToken(options.refreshToken);
                if (decoded?.tokenId) {
                    await this.blacklistService.revokeRefreshToken(decoded.tokenId, 'logout');
                }
            }

            // Log logout event
            await this._logAuthEvent({
                userId: userId,
                event: AUTH_EVENTS.LOGOUT,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: {
                    sessionId: sessionId,
                    logoutType: options.logoutAll ? 'all_devices' : 'single_device'
                }
            });

            // Logout from all devices if requested
            if (options.logoutAll) {
                await this.sessionService.terminateUserSessions(userId);
                await this.blacklistService.blacklistAllUserTokens(userId, 'logout_all');
            }

            // Execute afterLogout hook if provided
            if (this.hooks.afterLogout) {
                await this.hooks.afterLogout(userId, sessionId, options);
            }

            logger.info('User logged out successfully', {
                userId,
                sessionId,
                logoutAll: options.logoutAll,
                context: this.config.context
            });

            return { success: true, message: 'Logged out successfully' };

        } catch (error) {
            logger.error('Logout failed', {
                error: error.message,
                userId,
                sessionId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Refresh authentication tokens
     * @param {string} refreshToken - Refresh token
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Refresh options
     * @returns {Promise<Object>} New tokens
     */
    async refreshToken(refreshToken, tenantId, options = {}) {
        try {
            // Verify refresh token
            const decoded = this.tokenService.verifyToken(refreshToken, 'refresh');

            // Check if token is blacklisted
            const isRevoked = await this.blacklistService.isRefreshTokenRevoked(decoded.tokenId);
            if (isRevoked) {
                throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
            }

            // Get user from database
            const User = this._getUserModel();
            const user = await User.findById(decoded.id);

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            // Validate user status
            await this._validateUserStatus(user, options);

            // Generate new tokens with rotation
            const tokens = await this._generateAuthTokens(user, tenantId, options);

            // Revoke old refresh token
            await this.blacklistService.revokeRefreshToken(decoded.tokenId, 'token_refresh');

            // Log token refresh
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.TOKEN_REFRESH,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: { oldTokenId: decoded.tokenId }
            });

            logger.info('Token refreshed successfully', {
                userId: user._id,
                context: this.config.context
            });

            return {
                tokens: tokens,
                user: await this._sanitizeUserData(user, options)
            };

        } catch (error) {
            logger.error('Token refresh failed', {
                error: error.message,
                context: this.config.context
            });
            throw error;
        }
    }

    // ============= MFA (MULTI-FACTOR AUTHENTICATION) METHODS =============

    /**
     * Enable MFA for user
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - MFA options
     * @returns {Promise<Object>} MFA setup data
     */
    async enableMFA(userId, method, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const user = await this._findUserById(userId, tenantId, options);

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            let mfaSetupData = {};

            switch (method.toLowerCase()) {
                case MFA_CHALLENGE_TYPES.TOTP:
                    mfaSetupData = await this._setupTOTPMFA(user, options);
                    break;

                case MFA_CHALLENGE_TYPES.SMS:
                    mfaSetupData = await this._setupSMSMFA(user, options);
                    break;

                case MFA_CHALLENGE_TYPES.EMAIL:
                    mfaSetupData = await this._setupEmailMFA(user, options);
                    break;

                case MFA_CHALLENGE_TYPES.WEBAUTHN:
                    mfaSetupData = await this._setupWebAuthnMFA(user, options);
                    break;

                default:
                    throw new AppError(`Unsupported MFA method: ${method}`, 400, 'UNSUPPORTED_MFA_METHOD');
            }

            await user.save();

            logger.info('MFA setup initiated', {
                userId: user._id,
                method: method,
                tenantId,
                context: this.config.context
            });

            return {
                success: true,
                ...mfaSetupData,
                nextStep: 'verify_mfa_code'
            };

        } catch (error) {
            logger.error('MFA enable failed', {
                error: error.message,
                userId,
                method,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Verify and complete MFA setup
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} code - Verification code
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Verification options
     * @returns {Promise<Object>} Verification result
     */
    async verifyAndCompleteMFA(userId, method, code, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const user = await this._findUserById(userId, tenantId, options);

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            const mfaMethod = user.mfa?.methods?.find(m => m.type === method && !m.enabled);
            if (!mfaMethod) {
                throw new AppError('MFA method not found or already enabled', 404, 'MFA_METHOD_NOT_FOUND');
            }

            const isValid = await this._verifyMFASetupCode(user, mfaMethod, code, method);

            if (!isValid) {
                throw new AppError('Invalid verification code', 401, 'INVALID_CODE');
            }

            // Enable the MFA method
            mfaMethod.enabled = true;
            mfaMethod.verifiedAt = new Date();
            mfaMethod.verificationCode = undefined;
            mfaMethod.codeExpiry = undefined;

            // Enable MFA for user
            if (!user.mfa) user.mfa = {};
            user.mfa.enabled = true;
            if (!user.mfa.preferredMethod) {
                user.mfa.preferredMethod = method;
            }

            await user.save();

            // Log MFA enabled event
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.MFA_ENABLED,
                method: method,
                success: true,
                metadata: { tenantId }
            });

            logger.info('MFA enabled successfully', {
                userId: user._id,
                method: method,
                tenantId,
                context: this.config.context
            });

            const response = {
                success: true,
                message: 'MFA enabled successfully',
                method: method,
                mfaEnabled: true
            };

            // Return backup codes if TOTP
            if (method === MFA_CHALLENGE_TYPES.TOTP && mfaMethod.backupCodes) {
                response.backupCodes = this._generateBackupCodes();
                response.backupCodesWarning = 'Store these backup codes securely. They will not be shown again.';
            }

            return response;

        } catch (error) {
            logger.error('MFA verification failed', {
                error: error.message,
                userId,
                method,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Disable MFA for user
     * @param {string} userId - User ID
     * @param {string} method - MFA method to disable
     * @param {string} password - User password for confirmation
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Disable options
     * @returns {Promise<Object>} Disable result
     */
    async disableMFA(userId, method, password, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const user = await this._findUserById(userId, tenantId, options);

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            // Verify password
            const isPasswordValid = await this._verifyPassword(user, password);
            if (!isPasswordValid) {
                throw new AppError('Invalid password', 401, 'INVALID_PASSWORD');
            }

            // Remove MFA method
            if (user.mfa?.methods) {
                user.mfa.methods = user.mfa.methods.filter(m => m.type !== method);

                // Disable MFA if no methods left
                if (user.mfa.methods.length === 0) {
                    user.mfa.enabled = false;
                    user.mfa.preferredMethod = null;
                }
            }

            await user.save();

            // Log MFA disabled event
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.MFA_DISABLED,
                method: method,
                success: true,
                metadata: { tenantId }
            });

            logger.info('MFA disabled successfully', {
                userId: user._id,
                method: method,
                tenantId,
                context: this.config.context
            });

            return {
                success: true,
                message: 'MFA disabled successfully',
                mfaEnabled: user.mfa?.enabled || false,
                remainingMethods: user.mfa?.methods?.map(m => m.type) || []
            };

        } catch (error) {
            logger.error('MFA disable failed', {
                error: error.message,
                userId,
                method,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    // ============= PASSWORD MANAGEMENT =============

    /**
     * Request password reset
     * @param {string} email - User email
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Reset request result
     */
    async requestPasswordReset(email, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const user = await this._findUserByEmail(email, tenantId, options);

            // Don't reveal if user exists for security
            if (!user) {
                logger.warn('Password reset requested for non-existent user', {
                    email,
                    tenantId,
                    context: this.config.context
                });
                return {
                    success: true,
                    message: 'If the email exists, a reset link has been sent'
                };
            }

            // Generate reset token
            const resetToken = user.generatePasswordResetToken 
                ? await user.generatePasswordResetToken()
                : await this._generatePasswordResetToken(user);

            // Log password reset request
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.PASSWORD_RESET_REQUEST,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: {
                    ip: options.ip,
                    userAgent: options.userAgent
                }
            });

            logger.info('Password reset token generated', {
                userId: user._id,
                email: user.email,
                context: this.config.context
            });

            return {
                success: true,
                message: 'If the email exists, a reset link has been sent',
                resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
            };

        } catch (error) {
            logger.error('Password reset request failed', {
                error: error.message,
                email,
                tenantId,
                context: this.config.context
            });
            return {
                success: true,
                message: 'If the email exists, a reset link has been sent'
            };
        }
    }

    /**
     * Reset password with token
     * @param {string} token - Reset token
     * @param {string} newPassword - New password
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Reset result
     */
    async resetPassword(token, newPassword, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const hashedToken = await HashService.hashToken(token);

            const user = await this._findUserByResetToken(hashedToken, tenantId, options);

            if (!user) {
                throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
            }

            // Validate new password
            const passwordValidation = await this.passwordService.validate(newPassword);
            if (!passwordValidation.valid) {
                throw new AppError(
                    `Password validation failed: ${passwordValidation.errors.join(', ')}`,
                    400,
                    'INVALID_PASSWORD'
                );
            }

            // Reset password
            if (user.resetPassword) {
                await user.resetPassword(token, newPassword);
            } else {
                await this._resetUserPassword(user, newPassword);
            }

            // Invalidate all existing sessions
            await this.sessionService.terminateUserSessions(user._id);

            // Blacklist all user tokens
            await this.blacklistService.blacklistAllUserTokens(user._id, 'password_reset');

            // Log password reset success
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.PASSWORD_RESET_SUCCESS,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: { tenantId }
            });

            logger.info('Password reset successfully', {
                userId: user._id,
                email: user.email,
                tenantId,
                context: this.config.context
            });

            return {
                success: true,
                message: 'Password reset successfully. Please login with your new password.'
            };

        } catch (error) {
            logger.error('Password reset failed', {
                error: error.message,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Change password for authenticated user
     * @param {string} userId - User ID
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Change options
     * @returns {Promise<Object>} Change result
     */
    async changePassword(userId, currentPassword, newPassword, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const user = await this._findUserById(userId, tenantId, options);

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            // Verify current password
            const isPasswordValid = await this._verifyPassword(user, currentPassword);
            if (!isPasswordValid) {
                throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
            }

            // Validate new password
            const passwordValidation = await this.passwordService.validate(newPassword);
            if (!passwordValidation.valid) {
                throw new AppError(
                    `Password validation failed: ${passwordValidation.errors.join(', ')}`,
                    400,
                    'INVALID_PASSWORD'
                );
            }

            // Check password history if supported
            if (user.validatePasswordPolicy) {
                await user.validatePasswordPolicy(newPassword);
            }

            // Update password
            user.password = newPassword;
            await user.save();

            // Log password change
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.PASSWORD_CHANGED,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: { tenantId }
            });

            logger.info('Password changed successfully', {
                userId: user._id,
                tenantId,
                context: this.config.context
            });

            return {
                success: true,
                message: 'Password changed successfully'
            };

        } catch (error) {
            logger.error('Password change failed', {
                error: error.message,
                userId,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    // ============= EMAIL VERIFICATION =============

    /**
     * Verify email with token
     * @param {string} token - Verification token
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Verification options
     * @returns {Promise<Object>} Verification result
     */
    async verifyEmail(token, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const hashedToken = await HashService.hashToken(token);

            const user = await this._findUserByVerificationToken(hashedToken, tenantId, options);

            if (!user) {
                throw new AppError('Invalid or expired verification token', 400, 'INVALID_TOKEN');
            }

            // Verify email
            if (user.verifyEmail) {
                await user.verifyEmail(token);
            } else {
                await this._verifyUserEmail(user);
            }

            // Log email verified event
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.EMAIL_VERIFIED,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: { tenantId }
            });

            logger.info('Email verified successfully', {
                userId: user._id,
                email: user.email,
                tenantId,
                context: this.config.context
            });

            return {
                success: true,
                message: 'Email verified successfully',
                accountStatus: user.accountStatus?.status
            };

        } catch (error) {
            logger.error('Email verification failed', {
                error: error.message,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    /**
     * Resend email verification
     * @param {string} email - User email
     * @param {string} tenantId - Tenant identifier
     * @param {Object} options - Resend options
     * @returns {Promise<Object>} Resend result
     */
    async resendEmailVerification(email, tenantId, options = {}) {
        try {
            const User = this._getUserModel();
            const user = await this._findUserByEmail(email, tenantId, options);

            if (!user) {
                return {
                    success: true,
                    message: 'If the email exists and is unverified, a verification link has been sent'
                };
            }

            if (user.verification?.email?.verified) {
                return {
                    success: true,
                    message: 'Email is already verified'
                };
            }

            // Generate new verification token
            const verificationToken = user.generateEmailVerificationToken
                ? await user.generateEmailVerificationToken()
                : await this._generateEmailVerificationToken(user);

            // Log event
            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.EMAIL_VERIFICATION_SENT,
                method: AUTH_METHODS.PASSWORD,
                success: true,
                metadata: { email: user.email }
            });

            logger.info('Email verification token regenerated', {
                userId: user._id,
                email: user.email,
                context: this.config.context
            });

            return {
                success: true,
                message: 'Verification email sent',
                verificationToken: process.env.NODE_ENV === 'development' ? verificationToken : undefined
            };

        } catch (error) {
            logger.error('Resend email verification failed', {
                error: error.message,
                email,
                tenantId,
                context: this.config.context
            });
            throw error;
        }
    }

    // ============= HELPER METHODS (PRIVATE) =============

    /**
     * Find existing user by email (flexible query)
     * @private
     */
    async _findExistingUser(email, tenantId, options) {
        const User = this._getUserModel();
        const query = { email: email.toLowerCase() };

        // Add tenant query if organizations field exists
        if (this.userStructure.organizationFields?.length > 0) {
            const orgField = this.userStructure.organizationFields[0];
            query[`${orgField}.organizationId`] = tenantId;
        }

        return await User.findOne(query);
    }

    /**
     * Find user by ID (flexible query)
     * @private
     */
    async _findUserById(userId, tenantId, options) {
        const User = this._getUserModel();
        const query = { _id: userId };

        // Add tenant query if applicable
        if (tenantId && this.userStructure.organizationFields?.length > 0) {
            const orgField = this.userStructure.organizationFields[0];
            query[`${orgField}.organizationId`] = tenantId;
        }

        return await User.findOne(query);
    }

    /**
     * Find user by email (flexible query)
     * @private
     */
    async _findUserByEmail(email, tenantId, options) {
        return await this._findExistingUser(email, tenantId, options);
    }

    /**
     * Find user for login (flexible query)
     * @private
     */
    async _findUserForLogin(credentials, tenantId, options) {
        return await this._findUserByEmail(credentials.email, tenantId, options);
    }

    /**
     * Find user by reset token
     * @private
     */
    async _findUserByResetToken(hashedToken, tenantId, options) {
        const User = this._getUserModel();
        const query = {
            'security.passwordReset.token': hashedToken,
            'security.passwordReset.tokenExpires': { $gt: new Date() }
        };

        if (tenantId && this.userStructure.organizationFields?.length > 0) {
            const orgField = this.userStructure.organizationFields[0];
            query[`${orgField}.organizationId`] = tenantId;
        }

        return await User.findOne(query);
    }

    /**
     * Find user by verification token
     * @private
     */
    async _findUserByVerificationToken(hashedToken, tenantId, options) {
        const User = this._getUserModel();
        const query = {
            'verification.email.token': hashedToken,
            'verification.email.tokenExpires': { $gt: new Date() }
        };

        if (tenantId && this.userStructure.organizationFields?.length > 0) {
            const orgField = this.userStructure.organizationFields[0];
            query[`${orgField}.organizationId`] = tenantId;
        }

        return await User.findOne(query);
    }

    /**
     * Build user document with flexible structure
     * @private
     */
    async _buildUserDocument(userData, hashedPassword, tenantId, options) {
        const userDocument = {
            email: userData.email.toLowerCase(),
            password: hashedPassword
        };

        // Build profile fields if defined
        if (this.userStructure.profileFields?.length > 0) {
            userDocument.profile = {};
            this.userStructure.profileFields.forEach(field => {
                if (userData[field] !== undefined) {
                    userDocument.profile[field] = userData[field];
                }
            });
        }

        // Build organization/tenant fields if defined
        if (this.userStructure.organizationFields?.length > 0 && tenantId) {
            const orgField = this.userStructure.organizationFields[0];
            userDocument[orgField] = options.organizationData || [{
                organizationId: tenantId,
                roles: options.roleConfig?.roles || [{ 
                    roleName: options.roleConfig?.defaultRole || 'member', 
                    assignedAt: new Date() 
                }],
                isPrimary: true,
                joinedAt: new Date(),
                status: 'active'
            }];
        }

        // Build account status
        userDocument.accountStatus = {
            status: this.config.requireEmailVerification 
                ? ACCOUNT_STATUS.PENDING_VERIFICATION 
                : ACCOUNT_STATUS.ACTIVE,
            createdAt: new Date()
        };

        // Build verification structure
        userDocument.verification = {
            email: {
                verified: false,
                token: null,
                tokenExpires: null
            }
        };

        // Build security structure
        userDocument.security = {
            loginAttempts: { count: 0, lastAttempt: null, lockUntil: null },
            passwordReset: {},
            trustedDevices: []
        };

        // Build MFA structure
        userDocument.mfa = {
            enabled: false,
            methods: [],
            preferredMethod: null
        };

        // Add metadata
        userDocument.metadata = {
            userType: options.userType || USER_TYPES.CUSTOMER,
            source: options.source || 'web',
            context: this.config.context,
            ...options.metadata
        };

        // Add tracking fields
        this.config.trackingFields.forEach(field => {
            if (options[field] !== undefined) {
                userDocument.metadata[field] = options[field];
            }
        });

        // Add custom fields
        if (options.customFields) {
            Object.assign(userDocument, options.customFields);
        }

        return userDocument;
    }

    /**
     * Verify password
     * @private
     */
    async _verifyPassword(user, password) {
        if (user.comparePassword) {
            return await user.comparePassword(password);
        }
        return await bcrypt.compare(password, user.password);
    }

    /**
     * Validate user status
     * @private
     */
    async _validateUserStatus(user, options) {
        const status = user.accountStatus?.status;

        switch (status) {
            case ACCOUNT_STATUS.PENDING_VERIFICATION:
                throw new AppError('Email verification required', 403, 'EMAIL_VERIFICATION_REQUIRED');
            
            case ACCOUNT_STATUS.PENDING_APPROVAL:
                throw new AppError('Account pending approval', 403, 'PENDING_APPROVAL');
            
            case ACCOUNT_STATUS.SUSPENDED:
                throw new AppError('Account suspended', 403, 'ACCOUNT_SUSPENDED');
            
            case ACCOUNT_STATUS.LOCKED:
                const lockInfo = user.security?.loginAttempts;
                if (lockInfo?.lockUntil && new Date() < lockInfo.lockUntil) {
                    const remainingTime = Math.ceil((lockInfo.lockUntil - new Date()) / 60000);
                    throw new AppError(
                        `Account locked. Try again in ${remainingTime} minutes`,
                        403,
                        'ACCOUNT_LOCKED'
                    );
                }
                // Unlock if time has passed
                await user.updateOne({
                    'accountStatus.status': ACCOUNT_STATUS.ACTIVE,
                    'security.loginAttempts.lockUntil': null,
                    'security.loginAttempts.count': 0
                });
                break;
            
            case ACCOUNT_STATUS.DELETED:
                throw new AppError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
            
            case ACCOUNT_STATUS.BANNED:
                throw new AppError('Account banned', 403, 'ACCOUNT_BANNED');
            
            case ACCOUNT_STATUS.INACTIVE:
                throw new AppError('Account inactive', 403, 'ACCOUNT_INACTIVE');
            
            case ACCOUNT_STATUS.ACTIVE:
                break;
            
            default:
                throw new AppError('Invalid account status', 403, 'INVALID_STATUS');
        }

        // Custom validation hook
        if (this.hooks.validateUser) {
            await this.hooks.validateUser(user, options);
        }
    }

    /**
     * Handle failed login attempt
     * @private
     */
    async _handleFailedLogin(user, options) {
        if (user.recordFailedLogin) {
            await user.recordFailedLogin();
        } else {
            if (!user.security) user.security = {};
            if (!user.security.loginAttempts) {
                user.security.loginAttempts = { count: 0 };
            }
            user.security.loginAttempts.count++;
            user.security.loginAttempts.lastAttempt = new Date();
            await user.save();
        }

        // Check if account should be locked
        if (user.security?.loginAttempts?.count >= this.config.maxLoginAttempts) {
            user.accountStatus.status = ACCOUNT_STATUS.LOCKED;
            user.security.loginAttempts.lockUntil = new Date(Date.now() + this.config.lockoutDuration);
            await user.save();
            this.stats.accountLockouts++;

            await this._logAuthEvent({
                userId: user._id,
                event: AUTH_EVENTS.ACCOUNT_LOCKED,
                method: AUTH_METHODS.PASSWORD,
                success: false,
                metadata: { reason: 'max_attempts_exceeded', ip: options.ip }
            });

            throw new AppError('Account locked due to too many failed attempts', 403, 'ACCOUNT_LOCKED');
        }

        await this._logAuthEvent({
            userId: user._id,
            event: AUTH_EVENTS.LOGIN_FAILED,
            method: AUTH_METHODS.PASSWORD,
            success: false,
            metadata: { 
                attempts: user.security.loginAttempts.count, 
                ip: options.ip
            }
        });
    }

    /**
     * Record successful login
     * @private
     */
    async _recordSuccessfulLogin(user, session, options) {
        if (user.recordLogin) {
            await user.recordLogin({
                ipAddress: options.ip,
                userAgent: options.userAgent,
                location: this._getLocationFromIP(options.ip),
                sessionId: session.id,
                authMethod: user.mfa?.enabled ? AUTH_METHODS.MFA_TOTP : AUTH_METHODS.PASSWORD,
                success: true
            });
        } else {
            // Reset login attempts
            if (user.security?.loginAttempts) {
                user.security.loginAttempts.count = 0;
                user.security.loginAttempts.lastAttempt = null;
                await user.save();
            }
        }

        await this._logAuthEvent({
            userId: user._id,
            event: AUTH_EVENTS.LOGIN_SUCCESS,
            method: user.mfa?.enabled ? AUTH_METHODS.MFA_TOTP : AUTH_METHODS.PASSWORD,
            success: true,
            metadata: {
                sessionId: session.id,
                ip: options.ip,
                userAgent: options.userAgent,
                location: this._getLocationFromIP(options.ip)
            }
        });
    }

    /**
     * Generate authentication tokens
     * @private
     */
    async _generateAuthTokens(user, tenantId, options = {}) {
        const accessToken = this.tokenService.generateAccessToken(user, tenantId, options);
        const refreshToken = this.tokenService.generateRefreshToken(user, tenantId, options);

        return {
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            expiresIn: config.auth?.jwt?.expiresIn || '7d'
        };
    }

    /**
     * Setup TOTP MFA
     * @private
     */
    async _setupTOTPMFA(user, options) {
        const secret = speakeasy.generateSecret({
            name: `${config.app?.name || 'App'} (${user.email})`,
            issuer: config.app?.name || 'App',
            length: 32
        });

        const qrCode = await QRCode.toDataURL(secret.otpauth_url, {
            width: 300,
            margin: 1
        });

        const backupCodes = this._generateBackupCodes();
        const hashedBackupCodes = await Promise.all(
            backupCodes.map(code => HashService.hashToken(code))
        );

        if (!user.mfa) user.mfa = {};
        if (!user.mfa.methods) user.mfa.methods = [];
        
        user.mfa.methods.push({
            type: MFA_CHALLENGE_TYPES.TOTP,
            enabled: false,
            secret: secret.base32,
            backupCodes: hashedBackupCodes,
            createdAt: new Date()
        });

        return {
            method: MFA_CHALLENGE_TYPES.TOTP,
            secret: secret.base32,
            qrCode: qrCode,
            backupCodes: backupCodes,
            instructions: 'Scan the QR code with your authenticator app'
        };
    }

    /**
     * Setup SMS MFA
     * @private
     */
    async _setupSMSMFA(user, options) {
        if (!user.phoneNumber) {
            throw new AppError('Phone number required for SMS MFA', 400, 'PHONE_REQUIRED');
        }

        const smsCode = this._generateVerificationCode(6);
        const hashedSmsCode = await HashService.hashToken(smsCode);

        if (!user.mfa) user.mfa = {};
        if (!user.mfa.methods) user.mfa.methods = [];
        
        user.mfa.methods.push({
            type: MFA_CHALLENGE_TYPES.SMS,
            enabled: false,
            phoneNumber: user.phoneNumber,
            verificationCode: hashedSmsCode,
            codeExpiry: new Date(Date.now() + 10 * 60 * 1000),
            createdAt: new Date()
        });

        return {
            method: MFA_CHALLENGE_TYPES.SMS,
            phoneNumber: this._maskPhoneNumber(user.phoneNumber),
            codeExpiry: new Date(Date.now() + 10 * 60 * 1000),
            instructions: 'A verification code has been sent to your phone'
        };
    }

    /**
     * Setup Email MFA
     * @private
     */
    async _setupEmailMFA(user, options) {
        const emailCode = this._generateVerificationCode(6);
        const hashedEmailCode = await HashService.hashToken(emailCode);

        if (!user.mfa) user.mfa = {};
        if (!user.mfa.methods) user.mfa.methods = [];
        
        user.mfa.methods.push({
            type: MFA_CHALLENGE_TYPES.EMAIL,
            enabled: false,
            email: user.email,
            verificationCode: hashedEmailCode,
            codeExpiry: new Date(Date.now() + 10 * 60 * 1000),
            createdAt: new Date()
        });

        return {
            method: MFA_CHALLENGE_TYPES.EMAIL,
            email: this._maskEmail(user.email),
            codeExpiry: new Date(Date.now() + 10 * 60 * 1000),
            instructions: 'A verification code has been sent to your email'
        };
    }

    /**
     * Setup WebAuthn MFA
     * @private
     */
    async _setupWebAuthnMFA(user, options) {
        if (!user.mfa) user.mfa = {};
        if (!user.mfa.methods) user.mfa.methods = [];
        
        user.mfa.methods.push({
            type: MFA_CHALLENGE_TYPES.WEBAUTHN,
            enabled: false,
            challenge: crypto.randomBytes(32).toString('base64'),
            createdAt: new Date()
        });

        return {
            method: MFA_CHALLENGE_TYPES.WEBAUTHN,
            challenge: crypto.randomBytes(32).toString('base64'),
            instructions: 'Complete registration using your security key or biometric'
        };
    }

    /**
     * Verify MFA setup code
     * @private
     */
    async _verifyMFASetupCode(user, mfaMethod, code, method) {
        switch (method.toLowerCase()) {
            case MFA_CHALLENGE_TYPES.TOTP:
                return speakeasy.totp.verify({
                    secret: mfaMethod.secret,
                    encoding: 'base32',
                    token: code,
                    window: 2
                });

            case MFA_CHALLENGE_TYPES.SMS:
            case MFA_CHALLENGE_TYPES.EMAIL:
                if (new Date() > mfaMethod.codeExpiry) {
                    throw new AppError('Verification code expired', 400, 'CODE_EXPIRED');
                }
                const hashedCode = await HashService.hashToken(code);
                return hashedCode === mfaMethod.verificationCode;

            case MFA_CHALLENGE_TYPES.WEBAUTHN:
                return true; // Placeholder

            default:
                return false;
        }
    }

    /**
     * Verify MFA code during login
     * @private
     */
    async _verifyMFACode(user, code, method = null) {
        const preferredMethod = method || user.mfa?.preferredMethod;
        const mfaMethod = user.mfa?.methods?.find(m => m.type === preferredMethod && m.enabled);

        if (!mfaMethod) return false;

        switch (preferredMethod) {
            case MFA_CHALLENGE_TYPES.TOTP:
                return speakeasy.totp.verify({
                    secret: mfaMethod.secret,
                    encoding: 'base32',
                    token: code,
                    window: 2
                });

            case MFA_CHALLENGE_TYPES.BACKUP_CODE:
                for (const hashedCode of mfaMethod.backupCodes || []) {
                    const inputHash = await HashService.hashToken(code);
                    if (inputHash === hashedCode) {
                        mfaMethod.backupCodes = mfaMethod.backupCodes.filter(c => c !== hashedCode);
                        await user.save();
                        return true;
                    }
                }
                return false;

            default:
                return false;
        }
    }

    /**
     * Get available MFA methods
     * @private
     */
    _getAvailableMFAMethods(user) {
        return user.mfa?.methods
            ?.filter(m => m.enabled)
            .map(m => ({
                type: m.type,
                isPreferred: m.type === user.mfa?.preferredMethod
            })) || [];
    }

    /**
     * Generate backup codes
     * @private
     */
    _generateBackupCodes(count = 10) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }

    /**
     * Generate verification code
     * @private
     */
    _generateVerificationCode(length = 6) {
        const digits = '0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += digits[Math.floor(Math.random() * digits.length)];
        }
        return code;
    }

    /**
     * Generate password reset token
     * @private
     */
    async _generatePasswordResetToken(user) {
        const token = crypto.randomBytes(32).toString('hex');
        const hashedToken = await HashService.hashToken(token);

        if (!user.security) user.security = {};
        if (!user.security.passwordReset) user.security.passwordReset = {};
        
        user.security.passwordReset.token = hashedToken;
        user.security.passwordReset.tokenExpires = new Date(Date.now() + this.config.passwordResetTokenExpiry);
        
        await user.save();
        return token;
    }

    /**
     * Generate email verification token
     * @private
     */
    async _generateEmailVerificationToken(user) {
        const token = crypto.randomBytes(32).toString('hex');
        const hashedToken = await HashService.hashToken(token);

        if (!user.verification) user.verification = {};
        if (!user.verification.email) user.verification.email = {};
        
        user.verification.email.token = hashedToken;
        user.verification.email.tokenExpires = new Date(Date.now() + this.config.emailVerificationTokenExpiry);
        
        await user.save();
        return token;
    }

    /**
     * Reset user password
     * @private
     */
    async _resetUserPassword(user, newPassword) {
        user.password = newPassword;
        if (user.security?.passwordReset) {
            user.security.passwordReset.token = null;
            user.security.passwordReset.tokenExpires = null;
        }
        await user.save();
    }

    /**
     * Verify user email
     * @private
     */
    async _verifyUserEmail(user) {
        if (!user.verification) user.verification = {};
        if (!user.verification.email) user.verification.email = {};
        
        user.verification.email.verified = true;
        user.verification.email.verifiedAt = new Date();
        user.verification.email.token = null;
        user.verification.email.tokenExpires = null;
        
        if (user.accountStatus?.status === ACCOUNT_STATUS.PENDING_VERIFICATION) {
            user.accountStatus.status = ACCOUNT_STATUS.ACTIVE;
        }
        
        await user.save();
    }

    /**
     * Detect suspicious activity
     * @private
     */
    async _detectSuspiciousActivity(user, options) {
        const recentLogins = user.activity?.loginHistory || [];
        const currentIP = options.ip;
        const currentLocation = this._getLocationFromIP(currentIP);

        if (currentLocation && recentLogins.length > 0) {
            const recentLocations = recentLogins
                .slice(0, 10)
                .map(login => login.location)
                .filter(Boolean);

            const isNewLocation = !recentLocations.some(
                loc => loc.country === currentLocation.country
            );

            if (isNewLocation) {
                await this._logAuthEvent({
                    userId: user._id,
                    event: AUTH_EVENTS.NEW_LOCATION,
                    method: AUTH_METHODS.PASSWORD,
                    success: true,
                    metadata: { location: currentLocation, ip: currentIP }
                });
                return true;
            }
        }

        if (options.deviceFingerprint) {
            const recentDevices = recentLogins
                .slice(0, 10)
                .map(login => login.deviceFingerprint)
                .filter(Boolean);

            if (!recentDevices.includes(options.deviceFingerprint)) {
                await this._logAuthEvent({
                    userId: user._id,
                    event: AUTH_EVENTS.NEW_DEVICE,
                    method: AUTH_METHODS.PASSWORD,
                    success: true,
                    metadata: { deviceFingerprint: options.deviceFingerprint }
                });
                return true;
            }
        }

        return false;
    }

    /**
     * Manage device trust
     * @private
     */
    async _manageDeviceTrust(user, deviceFingerprint, options) {
        if (!user.security) user.security = {};
        if (!user.security.trustedDevices) user.security.trustedDevices = [];

        const existingDevice = user.security.trustedDevices.find(
            d => d.fingerprint === deviceFingerprint
        );

        if (!existingDevice) {
            user.security.trustedDevices.push({
                fingerprint: deviceFingerprint,
                name: this._parseDeviceName(options.userAgent),
                firstSeen: new Date(),
                lastSeen: new Date(),
                ip: options.ip,
                location: this._getLocationFromIP(options.ip),
                trusted: false
            });
            await user.save();
        } else {
            existingDevice.lastSeen = new Date();
            existingDevice.ip = options.ip;
            await user.save();
        }
    }

    /**
     * Check if device is trusted
     * @private
     */
    _isDeviceTrusted(user, deviceFingerprint) {
        if (!deviceFingerprint) return false;
        const device = user.security?.trustedDevices?.find(
            d => d.fingerprint === deviceFingerprint
        );
        return device?.trusted || false;
    }

    /**
     * Check if password change is required
     * @private
     */
    _requiresPasswordChange(user) {
        const lastChange = user.activity?.lastPasswordChangeAt;
        if (!lastChange) return false;
        
        const passwordAge = Date.now() - new Date(lastChange).getTime();
        const maxPasswordAge = 90 * 24 * 60 * 60 * 1000; // 90 days
        return passwordAge > maxPasswordAge;
    }

    /**
     * Get location from IP address
     * @private
     */
    _getLocationFromIP(ip) {
        if (!ip) return null;
        try {
            const geo = geoip.lookup(ip);
            return geo ? {
                country: geo.country,
                city: geo.city,
                region: geo.region,
                timezone: geo.timezone,
                coordinates: geo.ll
            } : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse device name from user agent
     * @private
     */
    _parseDeviceName(userAgent) {
        if (!userAgent) return 'Unknown Device';
        try {
            const parser = new UAParser(userAgent);
            const result = parser.getResult();
            return `${result.browser.name || 'Unknown'} on ${result.os.name || 'Unknown'}`;
        } catch (error) {
            return 'Unknown Device';
        }
    }

    /**
     * Get user type
     * @private
     */
    _getUserType(user) {
        return user.metadata?.userType || USER_TYPES.CUSTOMER;
    }

    /**
     * Default sanitize user data
     * @private
     */
    async _defaultSanitizeUserData(user, options) {
        const userObject = user.toObject ? user.toObject() : user;
        delete userObject.password;
        delete userObject.passwordHistory;
        delete userObject.security;
        delete userObject.verification;
        if (userObject.mfa) {
            delete userObject.mfa.methods;
        }
        delete userObject.__v;
        return userObject;
    }

    /**
     * Sanitize user data for response
     * @private
     */
    async _sanitizeUserData(user, options) {
        if (this.hooks.sanitizeUserData) {
            return await this.hooks.sanitizeUserData(user, options);
        }
        return await this._defaultSanitizeUserData(user, options);
    }

    /**
     * Validate email format
     * @private
     */
    _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Mask email for display
     * @private
     */
    _maskEmail(email) {
        const [local, domain] = email.split('@');
        const maskedLocal = local.slice(0, 2) + '*'.repeat(Math.max(local.length - 2, 1));
        return `${maskedLocal}@${domain}`;
    }

    /**
     * Mask phone number for display
     * @private
     */
    _maskPhoneNumber(phone) {
        return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
    }

    /**
     * Log authentication event
     * @private
     */
    async _logAuthEvent(eventData) {
        try {
            if (this.hooks.onAuthEvent) {
                await this.hooks.onAuthEvent(eventData);
            }
            logger.info('Auth event logged', {
                ...eventData,
                context: this.config.context
            });
        } catch (error) {
            logger.error('Failed to log auth event', { error: error.message });
        }
    }

    /**
     * Get authentication statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            context: this.config.context,
            successRate: this.stats.totalLogins > 0
                ? ((this.stats.successfulLogins / this.stats.totalLogins) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
}

// Export as factory function for configuration
module.exports = AuthService;

// Export singleton instance with default configuration
module.exports.instance = new AuthService();

// Export enums
module.exports.AUTH_METHODS = AUTH_METHODS;
module.exports.AUTH_EVENTS = AUTH_EVENTS;
module.exports.ACCOUNT_STATUS = ACCOUNT_STATUS;
module.exports.MFA_CHALLENGE_TYPES = MFA_CHALLENGE_TYPES;
module.exports.USER_TYPES = USER_TYPES;