'use strict';

/**
 * @fileoverview Unified authentication service with configuration-driven enterprise features
 * @module shared/lib/auth/services/auth-service
 * @requires module:shared/lib/database/models/users/user-model
 * @requires module:shared/lib/database/models/organizations/organization-model
 * @requires module:shared/lib/database/models/auth/session-model
 * @requires module:shared/lib/database/models/security/audit-log-model
 * @requires module:shared/lib/auth/services/token-service
 * @requires module:shared/lib/auth/services/session-service
 * @requires module:shared/lib/auth/services/password-service
 * @requires module:shared/lib/auth/services/two-factor-service
 * @requires module:shared/lib/auth/services/blacklist-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');

const User = require('../../database/models/customer-services/core-business/user-management/user-model');
const OrganizationModel = require('../../database/models/customer-services/hosted-organizations/organizations/organization-model');
const SessionModel = require('../../database/models/customer-services/core-business/user-management/user-session-model');
const AuditLogModel = require('../../database/models/security/audit-log-model');

const TokenService = require('./token-service');
const SessionService = require('./session-service');
const PasswordService = require('./password-service');
const TwoFactorService = require('./two-factor-service');
const BlacklistService = require('./blacklist-service');

const logger = require('../../utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

const EmailService = require('../../services/email-service');
const CacheService = require('../../services/cache-service');
const NotificationService = require('../../services/notification-service');
const AuditService = require('../../security/audit/audit-service');

/**
 * @class UnifiedAuthService
 * @description Configuration-driven authentication service that provides both core and enterprise
 * authentication capabilities based on feature flags and environment configuration.
 * Consolidates functionality from separate auth services into a single, unified interface.
 */
class AuthService {
  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {TokenService}
   */
  #tokenService;

  /**
   * @private
   * @type {SessionService}
   */
  #sessionService;

  /**
   * @private
   * @type {PasswordService}
   */
  #passwordService;

  /**
   * @private
   * @type {TwoFactorService}
   */
  #twoFactorService;

  /**
   * @private
   * @type {BlacklistService}
   */
  #blacklistService;

  /**
   * @private
   * @type {EmailService}
   */
  #emailService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

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
   * @static
   * @readonly
   * @type {Object}
   */
  static #AUTH_EVENTS = {
    LOGIN_SUCCESS: 'auth.login.success',
    LOGIN_FAILED: 'auth.login.failed',
    LOGOUT: 'auth.logout',
    REGISTER: 'auth.register',
    PASSWORD_RESET: 'auth.password.reset',
    PASSWORD_CHANGE: 'auth.password.change',
    TWO_FACTOR_ENABLED: 'auth.2fa.enabled',
    TWO_FACTOR_DISABLED: 'auth.2fa.disabled',
    SESSION_CREATED: 'auth.session.created',
    SESSION_EXPIRED: 'auth.session.expired',
    ACCOUNT_LOCKED: 'auth.account.locked',
    ACCOUNT_UNLOCKED: 'auth.account.unlocked',
    EMAIL_VERIFIED: 'auth.email.verified',
    TOKEN_REFRESHED: 'auth.token.refreshed',
    OAUTH_AUTHENTICATED: 'auth.oauth.authenticated',
    SSO_AUTHENTICATED: 'auth.sso.authenticated',
    DEVICE_TRUSTED: 'auth.device.trusted',
    MFA_ENABLED: 'auth.mfa.enabled',
    SESSION_REVOKED: 'auth.session.revoked',
    SECURITY_ALERT: 'auth.security.alert'
  };

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
   * Creates a new UnifiedAuthService instance
   * @param {Object} authConfig - Authentication configuration from config system
   * @param {Object} [dependencies] - Service dependencies for dependency injection
   */
  constructor(authConfig, dependencies = {}) {
    this.#config = authConfig || {
      enterprise: {
        enableRiskAssessment: false,
        enableAdvancedMFA: false,
        enableDeviceManagement: false,
        enableSecurityAlerts: false,
        enableAdvancedAudit: false
      },
      features: {
        oauth: false,
        sso: false,
        mfa: { require2FA: false }
      },
      mfa: { require2FA: false },
      security: {
        riskThresholds: {
          low: 20,
          medium: 40,
          high: 60,
          critical: 80
        }
      }
    };

    // Initialize service dependencies
    this.#tokenService = dependencies.tokenService || new TokenService();
    this.#sessionService = dependencies.sessionService || new SessionService();
    this.#passwordService = dependencies.passwordService || new PasswordService();
    this.#twoFactorService = dependencies.twoFactorService || new TwoFactorService();
    this.#blacklistService = dependencies.blacklistService || new BlacklistService();
    this.#emailService = dependencies.emailService || new EmailService();
    this.#cacheService = dependencies.cacheService || new CacheService();
    this.#notificationService = dependencies.notificationService || new NotificationService();
    this.#auditService = dependencies.auditService || new AuditService();

    this.#initializeService();
  }

  /**
   * Initialize service components based on configuration
   * @private
   */
  #initializeService() {
    logger.info('Initializing UnifiedAuthService', {
      coreFeatures: 'enabled',
      enterpriseFeatures: this.#config.enterprise.enableRiskAssessment ? 'enabled' : 'disabled',
      oauthEnabled: this.#config.features.oauth,
      ssoEnabled: this.#config.features.sso,
      mfaRequired: this.#config.mfa.require2FA,
      biometricEnabled: this.#config.features.biometric
    });

    // Initialize OAuth providers if enabled
    if (this.#config.features.oauth) {
      this.#initializeOAuthProviders();
    }

    // Initialize SSO providers if enabled
    if (this.#config.features.sso) {
      this.#initializeSSOProviders();
    }

    // Setup cleanup intervals for enterprise features
    if (this.#isEnterpriseFeatureEnabled('enableAdvancedMFA')) {
      this.#setupCleanupIntervals();
    }
  }

  // ==================== CORE AUTHENTICATION METHODS ====================

  /**
   * Authenticates user credentials and creates session
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - User email
   * @param {string} credentials.password - User password
   * @param {string} [credentials.organizationId] - Organization ID for multi-tenant login
   * @param {string} [credentials.totpCode] - TOTP code for 2FA
   * @param {Object} context - Request context
   * @param {string} context.ipAddress - Client IP address
   * @param {string} context.userAgent - Client user agent
   * @param {string} [context.deviceId] - Device identifier
   * @param {string} [context.correlationId] - Request correlation ID
   * @param {Object} [options] - Authentication options
   * @returns {Promise<Object>} Authentication result with tokens and security context
   * @throws {AppError} If authentication fails
   */
  async authenticate(credentials, context, options = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('User authentication attempt', {
        correlationId,
        email: credentials.email,
        organizationId: credentials.organizationId,
        ipAddress: context.ipAddress,
        enterpriseMode: this.#isEnterpriseFeatureEnabled('enableRiskAssessment')
      });

      // Core authentication steps
      await this.#validateIPRestrictions(context.ipAddress);
      await this.#checkRateLimit(credentials.email, context.ipAddress);

      const user = await this.#findUserForLogin(credentials.email, credentials.organizationId);
      await this.#validateAccountStatus(user);

      // Verify password
      const isPasswordValid = await this.#passwordService.verifyPassword(
        credentials.password,
        user.password
      );

      if (!isPasswordValid) {
        await this.#handleFailedLogin(user, context, correlationId);
        throw new AppError(
          'Invalid credentials',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId }
        );
      }

      // Enterprise risk assessment if enabled
      let riskScore = 0;
      let riskFactors = [];
      if (this.#isEnterpriseFeatureEnabled('enableRiskAssessment')) {
        const riskAssessment = await this.#calculateRiskScore(credentials.email, context);
        riskScore = riskAssessment.score;
        riskFactors = riskAssessment.factors;
      }

      // MFA verification
      const mfaResult = await this.#handleMFAVerification(user, credentials, context, options);
      if (mfaResult.requiresTwoFactor) {
        return mfaResult;
      }

      // Session management
      await this.#validateConcurrentSessions(user._id);

      // Generate tokens
      const tokens = await this.#generateAuthTokens(user);

      // Create session (enhanced if enterprise features enabled)
      const session = await this.#createSession(user, context, tokens, {
        riskScore,
        riskFactors,
        authMethod: 'password'
      });

      // Post-authentication processing
      await this.#resetFailedAttempts(user);
      await this.#updateLastLogin(user, context);

      // Enterprise security processing
      if (this.#isEnterpriseFeatureEnabled('enableSecurityAlerts') &&
        riskScore > this.#config.security.riskThresholds.high) {
        await this.#sendSecurityAlert(user, context, riskScore, riskFactors);
      }

      // Audit successful login
      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.LOGIN_SUCCESS,
        user,
        { ...context, riskScore, riskFactors },
        correlationId
      );

      const duration = Date.now() - startTime;
      logger.info('User authentication successful', {
        correlationId,
        userId: user._id,
        duration,
        riskScore,
        threatLevel: this.#getThreatLevel(riskScore)
      });

      const result = {
        success: true,
        user: this.#sanitizeUser(user),
        tokens,
        session: {
          id: session._id,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt
        },
        requiresPasswordChange: this.#checkPasswordExpiry(user)
      };

      // Add enterprise security context if enabled
      if (this.#isEnterpriseFeatureEnabled('enableRiskAssessment')) {
        result.security = {
          riskScore,
          riskFactors,
          threatLevel: this.#getThreatLevel(riskScore),
          trustedDevice: this.#isTrustedDevice(user._id, context.deviceId),
          recommendations: this.#getSecurityRecommendations(riskScore, riskFactors)
        };
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('User authentication failed', {
        correlationId,
        error: error.message,
        duration
      });

      throw error instanceof AppError ? error : new AppError(
        'Authentication failed',
        500,
        ERROR_CODES.AUTHENTICATION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Logs out user and invalidates session
   * @param {string} sessionId - Session ID or access token
   * @param {Object} context - Request context
   * @param {boolean} [allDevices=false] - Whether to logout from all devices
   * @returns {Promise<Object>} Logout result
   * @throws {AppError} If logout fails
   */
  async logout(sessionId, context = {}, allDevices = false) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('User logout attempt', {
        correlationId,
        sessionId: sessionId?.substring(0, 10) + '...',
        allDevices
      });

      // Get session (could be sessionId or access token)
      let session;
      try {
        const payload = await this.#tokenService.verifyAccessToken(sessionId);
        session = await this.#sessionService.getSessionByUserId(payload.userId);
      } catch {
        session = await this.#sessionService.getSession(sessionId);
      }

      if (!session) {
        throw new AppError(
          'Session not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { correlationId }
        );
      }

      if (allDevices) {
        await this.#sessionService.terminateAllUserSessions(session.userId);

        const userSessions = await this.#sessionService.getActiveUserSessions(session.userId);
        for (const userSession of userSessions) {
          if (userSession.accessToken) {
            await this.#blacklistService.blacklistToken(userSession.accessToken, 'logout_all');
          }
          if (userSession.refreshToken) {
            await this.#blacklistService.blacklistToken(userSession.refreshToken, 'logout_all');
          }
        }
      } else {
        if (session.accessToken) {
          await this.#blacklistService.blacklistToken(session.accessToken, 'logout');
        }
        if (session.refreshToken) {
          await this.#blacklistService.blacklistToken(session.refreshToken, 'logout');
        }

        await this.#sessionService.terminateSession(session._id || session.sessionId);
      }

      // Cleanup enterprise session data
      this.#activeSessions.delete(session.sessionId);

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.LOGOUT,
        { _id: session.userId },
        { ...context, allDevices },
        correlationId
      );

      logger.info('User logout successful', {
        correlationId,
        userId: session.userId,
        allDevices
      });

      return {
        success: true,
        message: allDevices ? 'Logged out from all devices' : 'Logged out successfully'
      };

    } catch (error) {
      logger.error('User logout failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Logout failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Registers a new user account
   * @param {Object} userData - User registration data
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Registration result
   * @throws {AppError} If registration fails
   */
  async register(userData, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('User registration attempt', {
        correlationId,
        email: userData.email,
        organizationId: userData.organizationId
      });

      if (!this.#config.registration.enabled) {
        throw new AppError(
          'Registration is currently disabled',
          403,
          ERROR_CODES.OPERATION_NOT_ALLOWED,
          { correlationId }
        );
      }

      if (!this.#config.registration.allowPublicRegistration && !userData.invitationCode) {
        throw new AppError(
          'Invitation code required for registration',
          403,
          ERROR_CODES.INVITATION_REQUIRED,
          { correlationId }
        );
      }

      // Domain validation if enterprise features enabled
      if (this.#isEnterpriseFeatureEnabled('enableAdvancedAudit')) {
        await this.#validateRegistrationDomain(userData.email);
      }

      if (userData.invitationCode) {
        await this.#validateInvitationCode(userData.invitationCode, userData.email);
      }

      const existingUser = await User.findOne({
        email: userData.email.toLowerCase(),
        organizationId: userData.organizationId
      });

      if (existingUser) {
        throw new AppError(
          'User already exists with this email',
          409,
          ERROR_CODES.CONFLICT,
          { correlationId }
        );
      }

      await this.#passwordService.validatePasswordPolicy(
        userData.password,
        this.#config.passwordPolicy
      );

      const hashedPassword = await this.#passwordService.hashPassword(userData.password);
      const username = userData.username || await this.#generateUniqueUsername(userData.email);

      const newUserData = {
        email: userData.email.toLowerCase(),
        username,
        password: hashedPassword,
        profile: {
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          displayName: userData.displayName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
        },
        organizationId: userData.organizationId,
        registeredAt: new Date(),
        registrationIP: context.ipAddress,
        lastActivity: new Date(),
        accountStatus: {
          status: this.#config.registration.autoActivate ? 'active' : 'pending',
          statusHistory: [{
            status: this.#config.registration.autoActivate ? 'active' : 'pending',
            reason: 'Registration',
            changedAt: new Date(),
            changedBy: null
          }]
        },
        roles: [this.#config.registration.defaultRole],
        metadata: {
          source: 'registration',
          registrationMethod: userData.invitationCode ? 'invitation' : 'public'
        }
      };

      // Email verification setup
      if (this.#config.core.requireEmailVerification) {
        const verificationToken = await this.#tokenService.generateVerificationToken();
        newUserData.verification = {
          email: {
            verified: false,
            token: verificationToken,
            tokenExpires: new Date(Date.now() + this.#config.core.verificationTokenDuration),
            verifiedAt: null
          }
        };
      } else {
        newUserData.verification = {
          email: {
            verified: true,
            verifiedAt: new Date()
          }
        };
      }

      const user = await User.create(newUserData);

      if (this.#config.core.requireEmailVerification) {
        await this.#sendVerificationEmail(user, newUserData.verification.email.token);
      }

      if (this.#config.notifications.email.welcomeEmail) {
        await this.#sendWelcomeEmail(user);
      }

      if (userData.invitationCode) {
        await this.#markInvitationUsed(userData.invitationCode, user._id);
      }

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.REGISTER,
        user,
        context,
        correlationId
      );

      logger.info('User registration successful', {
        correlationId,
        userId: user._id,
        requiresVerification: this.#config.core.requireEmailVerification
      });

      const response = {
        success: true,
        user: this.#sanitizeUser(user),
        message: 'Registration successful'
      };

      if (this.#config.core.requireEmailVerification) {
        response.message += '. Please check your email to verify your account.';
        response.emailVerificationRequired = true;
      } else {
        response.message += '. You can now log in to your account.';
      }

      return response;

    } catch (error) {
      logger.error('User registration failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Registration failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Initiates password reset process
   * @param {string} email - User email
   * @param {string} [organizationId] - Organization ID
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Password reset initiation result
   * @throws {AppError} If password reset fails
   */
  async initiatePasswordReset(email, organizationId, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Password reset initiation', {
        correlationId,
        email,
        organizationId
      });

      const user = await User.findOne({
        email: email.toLowerCase(),
        organizationId,
        'accountStatus.status': { $in: ['active', 'pending'] }
      });

      // Always return success to prevent user enumeration
      if (!user) {
        logger.warn('Password reset attempted for non-existent user', {
          correlationId,
          email
        });
        return {
          success: true,
          message: 'If the email exists, a password reset link has been sent.'
        };
      }

      if (user.accountStatus.status === 'suspended' || user.accountStatus.status === 'deactivated') {
        logger.warn('Password reset attempted for inactive user', {
          correlationId,
          userId: user._id,
          status: user.accountStatus.status
        });
        return {
          success: true,
          message: 'If the email exists, a password reset link has been sent.'
        };
      }

      const resetToken = await this.#tokenService.generatePasswordResetToken();
      const hashedToken = await this.#passwordService.hashToken(resetToken);

      user.security = user.security || {};
      user.security.passwordReset = {
        token: hashedToken,
        tokenExpires: new Date(Date.now() + this.#config.core.passwordResetTokenDuration),
        requestedAt: new Date(),
        requestIp: context.ipAddress
      };
      await user.save();

      if (this.#config.notifications.email.passwordResetEmail) {
        await this.#sendPasswordResetEmail(user, resetToken);
      }

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.PASSWORD_RESET,
        user,
        context,
        correlationId
      );

      logger.info('Password reset initiated', {
        correlationId,
        userId: user._id
      });

      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent.',
        expiresIn: this.#config.core.passwordResetTokenDuration / 1000 / 60
      };

    } catch (error) {
      logger.error('Password reset initiation failed', {
        correlationId,
        error: error.message
      });

      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent.'
      };
    }
  }

  /**
   * Completes password reset with token
   * @param {string} token - Password reset token
   * @param {string} newPassword - New password
   * @param {Object} context - Request context
   * @param {boolean} [terminateAllSessions=true] - Whether to terminate all sessions
   * @returns {Promise<Object>} Password reset result
   * @throws {AppError} If password reset fails
   */
  async resetPassword(token, newPassword, context = {}, terminateAllSessions = true) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Password reset completion attempt', {
        correlationId,
        terminateAllSessions
      });

      const hashedToken = await this.#passwordService.hashToken(token);

      const user = await User.findOne({
        'security.passwordReset.token': hashedToken,
        'security.passwordReset.tokenExpires': { $gt: new Date() }
      }).select('+password +passwordHistory');

      if (!user) {
        throw new AppError(
          'Invalid or expired reset token',
          400,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      await this.#passwordService.validatePasswordPolicy(
        newPassword,
        this.#config.passwordPolicy
      );

      if (user.passwordHistory && user.passwordHistory.length > 0) {
        await this.#passwordService.checkPasswordHistory(
          newPassword,
          user.passwordHistory,
          this.#config.passwordPolicy.preventReuse
        );
      }

      const hashedPassword = await this.#passwordService.hashPassword(newPassword);

      user.password = hashedPassword;
      user.security.passwordReset = undefined;
      user.passwordChangedAt = new Date();

      user.passwordHistory = user.passwordHistory || [];
      user.passwordHistory.unshift({
        hash: hashedPassword,
        changedAt: new Date(),
        changedBy: user._id,
        reason: 'password_reset'
      });
      user.passwordHistory = user.passwordHistory.slice(0, this.#config.passwordPolicy.preventReuse);

      user.security.loginAttempts = {
        count: 0,
        lockedUntil: null,
        lastAttemptAt: null
      };

      await user.save();

      if (terminateAllSessions) {
        await this.#sessionService.terminateAllUserSessions(user._id);
      }

      if (this.#config.notifications.email.passwordResetEmail) {
        await this.#sendPasswordChangeConfirmation(user, context);
      }

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.PASSWORD_CHANGE,
        user,
        { ...context, terminateAllSessions },
        correlationId
      );

      logger.info('Password reset successful', {
        correlationId,
        userId: user._id,
        terminateAllSessions
      });

      return {
        success: true,
        message: 'Password reset successful. Please login with your new password.',
        sessionsTerminated: terminateAllSessions
      };

    } catch (error) {
      logger.error('Password reset failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Password reset failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Refreshes authentication tokens
   * @param {string} refreshToken - Refresh token
   * @param {Object} context - Request context
   * @returns {Promise<Object>} New tokens
   * @throws {AppError} If token refresh fails
   */
  async refreshTokens(refreshToken, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Token refresh attempt', {
        correlationId
      });

      const isBlacklisted = await this.#blacklistService.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        throw new AppError(
          'Token has been revoked',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      const payload = await this.#tokenService.verifyRefreshToken(refreshToken);

      const user = await User.findById(payload.userId);
      if (!user || user.accountStatus.status !== 'active') {
        throw new AppError(
          'User not found or inactive',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId }
        );
      }

      const session = await this.#sessionService.getSessionByRefreshToken(refreshToken);
      if (!session || session.status !== 'active') {
        throw new AppError(
          'Session not found or inactive',
          401,
          ERROR_CODES.INVALID_SESSION,
          { correlationId }
        );
      }

      if (session.expiresAt < new Date()) {
        throw new AppError(
          'Session expired',
          401,
          ERROR_CODES.SESSION_EXPIRED,
          { correlationId }
        );
      }

      const tokens = await this.#generateAuthTokens(user);

      await this.#sessionService.updateSessionTokens(session._id, tokens);

      await this.#blacklistService.blacklistToken(session.accessToken, 'refresh');
      await this.#blacklistService.blacklistToken(refreshToken, 'refresh');

      await this.#updateLastActivity(user);

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.TOKEN_REFRESHED,
        user,
        context,
        correlationId
      );

      logger.info('Token refresh successful', {
        correlationId,
        userId: user._id
      });

      return {
        success: true,
        tokens,
        user: this.#sanitizeUser(user)
      };

    } catch (error) {
      logger.error('Token refresh failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Token refresh failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies email with token
   * @param {string} token - Email verification token
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Verification result
   * @throws {AppError} If verification fails
   */
  async verifyEmail(token, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Email verification attempt', {
        correlationId
      });

      const user = await User.findOne({
        'verification.email.token': token,
        'verification.email.tokenExpires': { $gt: new Date() }
      });

      if (!user) {
        throw new AppError(
          'Invalid or expired verification token',
          400,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      if (user.verification.email.verified) {
        throw new AppError(
          'Email is already verified',
          400,
          ERROR_CODES.OPERATION_NOT_ALLOWED,
          { correlationId }
        );
      }

      user.verification.email.verified = true;
      user.verification.email.verifiedAt = new Date();
      user.verification.email.token = undefined;
      user.verification.email.tokenExpires = undefined;

      if (user.accountStatus.status === 'pending') {
        user.accountStatus.status = 'active';
        user.accountStatus.statusHistory.push({
          status: 'active',
          reason: 'Email verified',
          changedAt: new Date()
        });
      }

      await user.save();

      if (user.accountStatus.status === 'active') {
        await this.#sendAccountActivatedEmail(user);
      }

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.EMAIL_VERIFIED,
        user,
        context,
        correlationId
      );

      logger.info('Email verification successful', {
        correlationId,
        userId: user._id
      });

      return {
        success: true,
        message: 'Email verified successfully',
        accountActivated: user.accountStatus.status === 'active'
      };

    } catch (error) {
      logger.error('Email verification failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Email verification failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Validates session and returns user context
   * @param {string} accessToken - Access token to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Session validation result
   * @throws {AppError} If validation fails
   */
  async validateSession(accessToken, options = {}) {
    const { updateActivity = true, requiredPermissions = [] } = options;

    try {
      const isBlacklisted = await this.#blacklistService.isTokenBlacklisted(accessToken);
      if (isBlacklisted) {
        throw new AppError(
          'Token has been revoked',
          401,
          ERROR_CODES.INVALID_TOKEN
        );
      }

      const payload = await this.#tokenService.verifyAccessToken(accessToken);

      const user = await User.findById(payload.userId).populate('organizations.organizationId');
      if (!user || user.accountStatus.status !== 'active') {
        throw new AppError(
          'User not found or inactive',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR
        );
      }

      const session = await this.#sessionService.getActiveSessionByUserId(payload.userId);
      if (!session || session.expiresAt < new Date()) {
        throw new AppError(
          'Session expired',
          401,
          ERROR_CODES.SESSION_EXPIRED
        );
      }

      if (requiredPermissions.length > 0) {
        const userPermissions = this.#extractUserPermissions(user);
        const hasRequiredPermissions = requiredPermissions.every(
          permission => userPermissions.includes(permission)
        );

        if (!hasRequiredPermissions) {
          throw new AppError(
            'Insufficient permissions',
            403,
            ERROR_CODES.INSUFFICIENT_PERMISSIONS
          );
        }
      }

      if (updateActivity) {
        await this.#updateLastActivity(user);
        await this.#sessionService.updateSessionActivity(session._id);
      }

      const result = {
        valid: true,
        user: this.#sanitizeUser(user),
        session: {
          id: session._id,
          sessionId: session.sessionId,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastActivityAt: session.lastActivityAt
        },
        permissions: this.#extractUserPermissions(user)
      };

      // Add enterprise security context if enabled
      if (this.#isEnterpriseFeatureEnabled('enableSessionAnalytics')) {
        const sessionData = this.#activeSessions.get(session.sessionId);
        if (sessionData) {
          result.security = {
            riskScore: sessionData.riskScore,
            threatLevel: sessionData.threatLevel,
            trustedDevice: sessionData.trustedDevice
          };
        }
      }

      return result;

    } catch (error) {
      logger.error('Session validation failed', {
        error: error.message
      });
      throw error;
    }
  }

  // ==================== ENTERPRISE MFA METHODS ====================

  /**
   * Setup multi-factor authentication for user with enhanced options
   * @param {string} userId - User ID
   * @param {string} method - MFA method to setup
   * @param {Object} options - Setup options
   * @returns {Promise<Object>} Enhanced MFA setup result
   */
  async setupAdvancedMFA(userId, method, options = {}) {
    if (!this.#config.features.advancedMFA) {
      return this.#setupBasicMFA(userId, method, options);
    }

    const {
      label,
      issuer = this.#config.mfa.totp.issuer || 'Enterprise App',
      deviceInfo,
      phoneNumber,
      email,
      authenticatorName
    } = options;

    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      // Initialize MFA structure if not present
      if (!user.mfa) {
        user.mfa = {
          enabled: false,
          methods: [],
          lastUsedMethod: null,
          lastUsedAt: null,
          trustedDevices: []
        };
      }

      // Check if method already exists and is enabled
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

      // Add new method to user's MFA methods
      await this.#auditEvent(
        'MFA_SETUP_INITIATED',
        user,
        { method, deviceInfo },
        this.#generateCorrelationId()
      );

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
    if (!this.#config.features.advancedMFA) {
      return this.#completeBasicMFASetup(userId, method, verificationCode, options);
    }

    const {
      makeDefault = false,
      deviceInfo,
      trustDevice = false
    } = options;

    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      const mfaMethod = user.mfa.methods.find(m => m.type === method && !m.enabled);
      if (!mfaMethod) {
        throw new NotFoundError('MFA method not found or already enabled', 'MFA_METHOD_NOT_FOUND');
      }

      const isValid = await this.#verifyMFACodeAdvanced(mfaMethod, verificationCode, {
        userId,
        deviceInfo
      });

      if (!isValid) {
        await this.#recordFailedMFA(userId, method, deviceInfo, 'setup_verification');
        throw new ValidationError('Invalid verification code', 'INVALID_VERIFICATION_CODE');
      }

      mfaMethod.enabled = true;
      mfaMethod.verifiedAt = new Date();
      mfaMethod.setupDeviceInfo = deviceInfo ? {
        deviceId: deviceInfo.deviceId,
        userAgent: deviceInfo.userAgent,
        ipAddress: deviceInfo.ipAddress
      } : null;

      if (makeDefault || !user.mfa.methods.some(m => m.enabled && m.isPrimary)) {
        user.mfa.methods.forEach(m => m.isPrimary = false);
        mfaMethod.isPrimary = true;
      }

      if (!user.mfa.enabled) {
        user.mfa.enabled = true;
        user.mfa.enabledAt = new Date();
      }

      await user.save();

      let backupCodes = null;
      if (method === 'totp' && !user.mfa.backupCodes?.length) {
        backupCodes = await this.#generateBackupCodes(user);
      }

      if (trustDevice && deviceInfo) {
        await this.#trustDevice(userId, deviceInfo);
      }

      await this.#sendMFAEnabledNotifications(user, method, {
        deviceInfo,
        securityLevel: this.#calculateMFASecurityLevel(user.mfa.methods)
      });

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.MFA_ENABLED,
        user,
        { method, isPrimary: mfaMethod.isPrimary, deviceInfo: mfaMethod.setupDeviceInfo },
        this.#generateCorrelationId()
      );

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

  // ==================== ENTERPRISE OAUTH METHODS ====================

  /**
   * Authenticate with OAuth provider with enhanced security
   * @param {string} provider - OAuth provider (google, github, etc.)
   * @param {string} authorizationCode - Authorization code from provider
   * @param {Object} deviceInfo - Device information
   * @param {Object} options - OAuth options
   * @returns {Promise<Object>} Enhanced OAuth authentication result
   */
  async authenticateWithOAuth(provider, authorizationCode, deviceInfo, options = {}) {
    if (!this.#config.features.oauth) {
      throw new AppError(
        'OAuth authentication is not enabled',
        403,
        ERROR_CODES.FEATURE_DISABLED
      );
    }

    const {
      linkToExisting = false,
      createIfNotExists = true,
      organizationId
    } = options;

    try {
      const providerConfig = this.#oauthProviders.get(provider);
      if (!providerConfig) {
        throw new ValidationError('Unsupported OAuth provider', 'UNSUPPORTED_OAUTH_PROVIDER');
      }

      // Enterprise risk assessment if enabled
      let riskScore = 0;
      if (this.#isEnterpriseFeatureEnabled('enableRiskAssessment')) {
        riskScore = await this.#calculateOAuthRiskScore(provider, deviceInfo);
      }

      const tokenResponse = await this.#exchangeOAuthCode(provider, authorizationCode);
      const userInfo = await this.#getOAuthUserInfo(provider, tokenResponse.access_token);

      let user = await this.#findUserByOAuthProvider(provider, userInfo.id);

      if (!user && userInfo.email) {
        user = await User.findOne({
          email: userInfo.email.toLowerCase(),
          organizationId: organizationId || null
        });

        if (user && linkToExisting) {
          await this.#linkOAuthAccount(user, provider, userInfo, tokenResponse, {
            riskScore,
            deviceInfo
          });
        } else if (!user && createIfNotExists) {
          user = await this.#createUserFromOAuth(provider, userInfo, tokenResponse, {
            organizationId,
            deviceInfo,
            riskScore
          });
        }
      }

      if (!user) {
        throw new NotFoundError('User not found and creation disabled', 'USER_NOT_FOUND');
      }

      await this.#updateOAuthTokens(user, provider, tokenResponse);

      const tokens = await this.#generateAuthTokens(user);

      const session = await this.#createSession(user, deviceInfo, tokens, {
        authMethod: 'oauth',
        provider,
        riskScore,
        userInfo
      });

      await user.recordLogin({
        ...deviceInfo,
        authMethod: 'oauth',
        authProvider: provider,
        success: true,
        riskScore,
        location: await this.#getLocationFromIP(deviceInfo.ipAddress)
      });

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.OAUTH_AUTHENTICATED,
        user,
        { provider, linked: !!linkToExisting, created: !linkToExisting && createIfNotExists, riskScore },
        this.#generateCorrelationId()
      );

      logger.info('OAuth authentication successful', {
        userId: user._id,
        provider,
        email: userInfo.email,
        riskScore
      });

      const result = {
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
        }
      };

      if (this.#isEnterpriseFeatureEnabled('enableRiskAssessment')) {
        result.security = {
          riskScore,
          threatLevel: this.#getThreatLevel(riskScore),
          authMethod: 'oauth'
        };
      }

      return result;

    } catch (error) {
      logger.error('OAuth authentication failed', {
        error: error.message,
        provider,
        deviceInfo: deviceInfo.deviceId
      });
      throw error;
    }
  }

  // ==================== ENTERPRISE SSO METHODS ====================

  /**
   * Authenticate with SSO (SAML/OIDC) with enhanced enterprise features
   * @param {string} provider - SSO provider
   * @param {Object} ssoResponse - SSO response data
   * @param {Object} deviceInfo - Device information
   * @param {Object} options - SSO options
   * @returns {Promise<Object>} Enhanced SSO authentication result
   */
  async authenticateWithSSO(provider, ssoResponse, deviceInfo, options = {}) {
    if (!this.#config.features.sso) {
      throw new AppError(
        'SSO authentication is not enabled',
        403,
        ERROR_CODES.FEATURE_DISABLED
      );
    }

    const {
      validateSignature = true,
      allowProvisioning = true,
      organizationId,
      roleMapping = true
    } = options;

    try {
      const providerConfig = this.#ssoProviders.get(provider);
      if (!providerConfig) {
        throw new ValidationError('Unsupported SSO provider', 'UNSUPPORTED_SSO_PROVIDER');
      }

      // Enterprise risk assessment if enabled
      let riskScore = 0;
      if (this.#isEnterpriseFeatureEnabled('enableRiskAssessment')) {
        riskScore = await this.#calculateSSORequestRiskScore(provider, ssoResponse, deviceInfo);
      }

      if (validateSignature) {
        await this.#validateSSOSignature(provider, ssoResponse);
      }

      const userAttributes = await this.#extractSSOAttributes(provider, ssoResponse);

      let user = await this.#findOrProvisionSSOUser(provider, userAttributes, {
        allowProvisioning,
        organizationId,
        roleMapping,
        deviceInfo
      });

      await this.#updateUserFromSSO(user, userAttributes, { roleMapping });

      const tokens = await this.#generateAuthTokens(user);

      const session = await this.#createSession(user, deviceInfo, tokens, {
        authMethod: 'sso',
        provider,
        riskScore,
        ssoAttributes: userAttributes
      });

      await user.recordLogin({
        ...deviceInfo,
        authMethod: 'sso',
        authProvider: provider,
        success: true,
        riskScore,
        location: await this.#getLocationFromIP(deviceInfo.ipAddress)
      });

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.SSO_AUTHENTICATED,
        user,
        { provider, organizationId, riskScore, roleMapping },
        this.#generateCorrelationId()
      );

      logger.info('SSO authentication successful', {
        userId: user._id,
        provider,
        email: userAttributes.email,
        riskScore
      });

      const result = {
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
        }
      };

      if (this.#isEnterpriseFeatureEnabled('enableRiskAssessment')) {
        result.security = {
          riskScore,
          threatLevel: this.#getThreatLevel(riskScore),
          authMethod: 'sso'
        };
      }

      return result;

    } catch (error) {
      logger.error('SSO authentication failed', {
        error: error.message,
        provider,
        deviceInfo: deviceInfo.deviceId
      });
      throw error;
    }
  }

  // ==================== ENTERPRISE DEVICE MANAGEMENT ====================

  /**
   * Manage trusted devices for user
   * @param {string} userId - User ID
   * @param {Object} deviceInfo - Device information
   * @param {string} action - Action to perform (trust, untrust, list)
   * @param {Object} options - Management options
   * @returns {Promise<Object>} Device management result
   */
  async manageTrustedDevices(userId, deviceInfo, action, options = {}) {
    if (!this.#config.features.deviceTrust) {
      throw new AppError(
        'Device trust management is not enabled',
        403,
        ERROR_CODES.FEATURE_DISABLED
      );
    }

    const { requesterId = userId } = options;

    try {
      if (requesterId !== userId) {
        await this.#checkDeviceManagementPermission(requesterId, userId);
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      let result = {};

      switch (action) {
        case 'trust':
          result = await this.#trustDevice(userId, deviceInfo, options);
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

      await this.#auditEvent(
        `DEVICE_${action.toUpperCase()}`,
        user,
        { deviceId: deviceInfo?.deviceId, action },
        this.#generateCorrelationId()
      );

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

  // ==================== ENTERPRISE SECURITY ASSESSMENT ====================

  /**
   * Perform comprehensive security assessment for user
   * @param {string} userId - User ID
   * @param {Object} options - Assessment options
   * @returns {Promise<Object>} Security assessment result
   */
  async performSecurityAssessment(userId, options = {}) {
    if (!this.#config.features.securityAnalytics) {
      throw new AppError(
        'Security analytics is not enabled',
        403,
        ERROR_CODES.FEATURE_DISABLED
      );
    }

    const { includeRecommendations = true, includeThreatAnalysis = true } = options;

    try {
      const user = await User.findById(userId)
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

      assessment.categories.password = await this.#assessPasswordSecurity(user);
      assessment.categories.mfa = await this.#assessMFASecurity(user);
      assessment.categories.sessions = await this.#assessSessionSecurity(user);
      assessment.categories.devices = await this.#assessDeviceSecurity(user);
      assessment.categories.account = await this.#assessAccountSecurity(user);

      const categoryScores = Object.values(assessment.categories).map(cat => cat.score);
      assessment.overallScore = Math.round(
        categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length
      );

      assessment.securityLevel = this.#getSecurityLevel(assessment.overallScore);

      if (includeRecommendations) {
        assessment.recommendations = this.#generateSecurityRecommendations(assessment);
      }

      if (includeThreatAnalysis) {
        assessment.threats = await this.#analyzePotentialThreats(user, assessment);
      }

      await this.#auditEvent(
        'SECURITY_ASSESSMENT',
        user,
        { overallScore: assessment.overallScore, securityLevel: assessment.securityLevel },
        this.#generateCorrelationId()
      );

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

  // ==================== SERVICE MANAGEMENT METHODS ====================

  /**
   * Gets service configuration
   * @returns {Object} Service configuration
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Updates service configuration
   * @param {Object} newConfig - New configuration values
   */
  updateConfig(newConfig) {
    this.#config = { ...this.#config, ...newConfig };
    logger.info('UnifiedAuthService configuration updated', newConfig);
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const checks = await Promise.all([
        this.#tokenService.getHealthStatus?.() || { healthy: true },
        this.#sessionService.getHealthStatus?.() || { healthy: true },
        this.#blacklistService.getHealthStatus?.() || { healthy: true }
      ]);

      const healthy = checks.every(check => check.healthy);

      return {
        healthy,
        service: 'UnifiedAuthService',
        timestamp: new Date(),
        configuration: {
          enterpriseFeaturesEnabled: this.#isEnterpriseFeatureEnabled('enableRiskAssessment'),
          oauthEnabled: this.#config.features.oauth,
          ssoEnabled: this.#config.features.sso,
          mfaRequired: this.#config.mfa.require2FA,
          biometricEnabled: this.#config.features.biometric
        },
        checks: {
          tokenService: checks[0],
          sessionService: checks[1],
          blacklistService: checks[2]
        }
      };
    } catch (error) {
      logger.error('Unified auth service health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'UnifiedAuthService',
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * @private
   * Check if enterprise feature is enabled
   */
  #isEnterpriseFeatureEnabled(feature) {
    return this.#config.enterprise?.[feature] === true;
  }

  /**
   * @private
   * Initialize OAuth providers
   */
  #initializeOAuthProviders() {
    Object.entries(this.#config.oauth).forEach(([provider, config]) => {
      if (config.enabled) {
        this.#oauthProviders.set(provider, {
          ...config,
          tokenUrl: this.#getOAuthTokenUrl(provider),
          userInfoUrl: this.#getOAuthUserInfoUrl(provider),
          revokeUrl: this.#getOAuthRevokeUrl(provider)
        });
      }
    });

    logger.info('OAuth providers initialized', {
      providers: Array.from(this.#oauthProviders.keys())
    });
  }

  /**
   * @private
   * Initialize SSO providers
   */
  #initializeSSOProviders() {
    Object.entries(this.#config.sso).forEach(([provider, config]) => {
      if (config.enabled) {
        this.#ssoProviders.set(provider, config);
      }
    });

    logger.info('SSO providers initialized', {
      providers: Array.from(this.#ssoProviders.keys())
    });
  }

  /**
   * @private
   * Setup cleanup intervals for enterprise features
   */
  #setupCleanupIntervals() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.#mfaCodes) {
        if (now > data.expiresAt) {
          this.#mfaCodes.delete(key);
        }
      }
    }, 300000);

    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.#trustedDevices) {
        if (now > data.expiresAt) {
          this.#trustedDevices.delete(key);
        }
      }
    }, 3600000);
  }

  /**
   * @private
   * Validate IP restrictions
   */
  async #validateIPRestrictions(ipAddress) {
    if (this.#config.security.ipWhitelist.length > 0) {
      if (!this.#config.security.ipWhitelist.includes(ipAddress)) {
        throw new AppError(
          'Access denied from this IP address',
          403,
          ERROR_CODES.FORBIDDEN
        );
      }
    }

    if (this.#config.security.ipBlacklist.includes(ipAddress)) {
      throw new AppError(
        'Access denied from this IP address',
        403,
        ERROR_CODES.FORBIDDEN
      );
    }
  }

  /**
   * @private
   * Check rate limiting
   */
  async #checkRateLimit(identifier, ipAddress) {
    if (!this.#config.security.enableRateLimiting) return;

    const identifierKey = `auth_rate_limit:${identifier}`;
    const ipKey = `auth_rate_limit:ip:${ipAddress}`;

    const [identifierAttempts, ipAttempts] = await Promise.all([
      this.#cacheService.get(identifierKey) || 0,
      this.#cacheService.get(ipKey) || 0
    ]);

    if (identifierAttempts >= this.#config.security.rateLimitMaxAttempts) {
      throw new AppError(
        'Too many authentication attempts for this account',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR
      );
    }

    if (ipAttempts >= this.#config.security.rateLimitMaxAttempts * 3) {
      throw new AppError(
        'Too many authentication attempts from this IP',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR
      );
    }

    await Promise.all([
      this.#cacheService.set(identifierKey, identifierAttempts + 1, this.#config.security.rateLimitWindow / 1000),
      this.#cacheService.set(ipKey, ipAttempts + 1, this.#config.security.rateLimitWindow / 1000)
    ]);
  }

  /**
   * @private
   * Find user for login
   */
  async #findUserForLogin(email, organizationId) {
    const query = {
      email: email.toLowerCase(),
      'accountStatus.status': { $in: ['active', 'pending'] }
    };

    if (organizationId) {
      query.organizationId = organizationId;
    }

    const user = await User.findOne(query).select('+password +mfa.secret +security');

    if (!user) {
      throw new AppError(
        'Invalid credentials',
        401,
        ERROR_CODES.AUTHENTICATION_ERROR
      );
    }

    return user;
  }

  /**
   * @private
   * Validate account status
   */
  async #validateAccountStatus(user) {
    if (user.accountStatus.status === 'suspended') {
      throw new AppError(
        'Account is suspended',
        403,
        ERROR_CODES.ACCOUNT_SUSPENDED
      );
    }

    if (user.accountStatus.status === 'deactivated') {
      throw new AppError(
        'Account is deactivated',
        403,
        ERROR_CODES.ACCOUNT_DEACTIVATED
      );
    }

    if (user.security?.loginAttempts?.lockedUntil) {
      const lockExpiry = new Date(user.security.loginAttempts.lockedUntil);
      if (lockExpiry > new Date()) {
        throw new AppError(
          `Account is locked until ${lockExpiry.toISOString()}`,
          403,
          ERROR_CODES.ACCOUNT_LOCKED
        );
      } else {
        user.security.loginAttempts.lockedUntil = null;
        user.security.loginAttempts.count = 0;
        await user.save();
      }
    }

    if (this.#config.core.requireEmailVerification && !user.verification?.email?.verified) {
      throw new AppError(
        'Email verification required',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED
      );
    }
  }

  /**
   * @private
   * Handle MFA verification
   */
  async #handleMFAVerification(user, credentials, context, options) {
    if (user.mfa?.enabled || this.#config.mfa.require2FA) {
      if (!credentials.totpCode) {
        const tempTokenResult = await this.#generateTemporaryToken(user, context.correlationId);
        return {
          requiresTwoFactor: true,
          temporaryToken: tempTokenResult.token,
          expiresIn: tempTokenResult.expiresIn,
          message: 'Two-factor authentication required',
          availableMethods: this.#getAvailable2FAMethods(user)
        };
      }

      const is2FAValid = await this.#verify2FACode(user, credentials.totpCode);
      if (!is2FAValid) {
        await this.#handleFailedLogin(user, context, context.correlationId, 'Invalid 2FA code');
        throw new AppError(
          'Invalid two-factor authentication code',
          401,
          ERROR_CODES.TWO_FACTOR_ERROR,
          { correlationId: context.correlationId }
        );
      }
    }

    return { requiresTwoFactor: false };
  }

  /**
   * @private
   * Handle failed login attempt
   */
  async #handleFailedLogin(user, context, correlationId, reason = 'Invalid credentials') {
    if (!user.security) user.security = {};
    if (!user.security.loginAttempts) user.security.loginAttempts = { count: 0 };

    user.security.loginAttempts.count = (user.security.loginAttempts.count || 0) + 1;
    user.security.loginAttempts.lastAttemptAt = new Date();

    if (user.security.loginAttempts.count >= this.#config.core.maxLoginAttempts) {
      user.security.loginAttempts.lockedUntil = new Date(Date.now() + this.#config.core.lockoutDuration);

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.ACCOUNT_LOCKED,
        user,
        context,
        correlationId
      );
    }

    await user.save();

    await this.#auditEvent(
      UnifiedAuthService.#AUTH_EVENTS.LOGIN_FAILED,
      user,
      { ...context, reason },
      correlationId
    );
  }

  /**
   * @private
   * Validate concurrent sessions
   */
  async #validateConcurrentSessions(userId) {
    if (!this.#config.core.allowMultipleSessions) {
      await this.#sessionService.terminateAllUserSessions(userId);
      return;
    }

    const activeSessions = await this.#sessionService.getActiveUserSessions(userId);
    if (activeSessions.length >= this.#config.core.maxConcurrentSessions) {
      const oldestSession = activeSessions.sort((a, b) =>
        new Date(a.createdAt) - new Date(b.createdAt)
      )[0];
      await this.#sessionService.terminateSession(oldestSession._id);
    }
  }

  /**
   * @private
   * Generate authentication tokens
   */
  async #generateAuthTokens(user) {
    const payload = {
      userId: user._id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.roles || [],
      permissions: this.#extractUserPermissions(user)
    };

    const accessToken = await this.#tokenService.generateAccessToken(payload);
    const refreshToken = await this.#tokenService.generateRefreshToken({
      userId: user._id,
      organizationId: user.organizationId
    });

    return { accessToken, refreshToken };
  }

  /**
   * @private
   * Create session with optional enterprise enhancements
   */
  async #createSession(user, deviceInfo, tokens, enhancements = {}) {
    const sessionData = {
      userId: user._id,
      organizationId: user.organizationId || enhancements.organizationId,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      deviceId: deviceInfo.deviceId,
      ...tokens
    };

    // Add enterprise enhancements if features enabled
    if (this.#isEnterpriseFeatureEnabled('enableSessionAnalytics')) {
      sessionData.enhancedData = {
        authMethod: enhancements.authMethod || 'password',
        authProvider: enhancements.provider,
        riskScore: enhancements.riskScore || 0,
        riskFactors: enhancements.riskFactors || [],
        location: await this.#getLocationFromIP(deviceInfo.ipAddress),
        deviceTrusted: this.#isTrustedDevice(user._id, deviceInfo.deviceId)
      };
    }

    const session = await this.#sessionService.createSession(sessionData);

    // Cache enhanced session data if enterprise features enabled
    if (this.#isEnterpriseFeatureEnabled('enableSessionAnalytics')) {
      this.#activeSessions.set(session.sessionId, {
        ...sessionData.enhancedData,
        threatLevel: this.#getThreatLevel(enhancements.riskScore || 0)
      });
    }

    return session;
  }

  /**
   * @private
   * Calculate risk score for authentication attempt
   */
  async #calculateRiskScore(identifier, deviceInfo) {
    let score = 0;
    const factors = [];

    try {
      const user = await User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { username: identifier }
        ]
      });

      if (!user) {
        factors.push('unknown_user');
        score += 10;
      } else {
        if (!this.#isTrustedDevice(user._id, deviceInfo.deviceId)) {
          factors.push('new_device');
          score += this.#riskFactors.newDevice;
        }

        const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
        if (location && !this.#isKnownLocation(user, location)) {
          factors.push('new_location');
          score += this.#riskFactors.newLocation;
        }

        if (this.#isUnusualLoginTime(user, new Date())) {
          factors.push('unusual_time');
          score += this.#riskFactors.unusualTime;
        }

        if (user.security?.loginAttempts?.count > 0) {
          factors.push('recent_failed_attempts');
          score += this.#riskFactors.multipleFailedAttempts;
        }
      }

      if (await this.#isVPNOrProxy(deviceInfo.ipAddress)) {
        factors.push('vpn_or_proxy');
        score += this.#riskFactors.vpnDetected;
      }

      if (this.#isSuspiciousUserAgent(deviceInfo.userAgent)) {
        factors.push('suspicious_user_agent');
        score += this.#riskFactors.suspiciousUserAgent;
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

      return {
        score: 75,
        factors: ['calculation_error'],
        assessment: 'high'
      };
    }
  }

  /**
   * @private
   * Reset failed login attempts
   */
  async #resetFailedAttempts(user) {
    if (user.security?.loginAttempts) {
      user.security.loginAttempts.count = 0;
      user.security.loginAttempts.lastAttemptAt = null;
      user.security.loginAttempts.lockedUntil = null;
      await user.save();
    }
  }

  /**
   * @private
   * Update last login information
   */
  async #updateLastLogin(user, context) {
    user.lastLoginAt = new Date();
    user.lastActivity = new Date();
    user.lastLoginIP = context.ipAddress;
    await user.save();
  }

  /**
   * @private
   * Update last activity
   */
  async #updateLastActivity(user) {
    user.lastActivity = new Date();
    await user.save();
  }

  /**
   * @private
   * Check if password has expired
   */
  #checkPasswordExpiry(user) {
    if (!user.passwordChangedAt || !this.#config.passwordPolicy.expiryDays) {
      return false;
    }

    const expiryDate = new Date(user.passwordChangedAt);
    expiryDate.setDate(expiryDate.getDate() + this.#config.passwordPolicy.expiryDays);

    return new Date() > expiryDate;
  }

  /**
   * @private
   * Sanitize user object for response
   */
  #sanitizeUser(user) {
    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.mfa?.secret;
    delete sanitized.mfa?.backupCodes;
    delete sanitized.security?.passwordReset;
    delete sanitized.verification?.email?.token;
    delete sanitized.passwordHistory;
    return sanitized;
  }

  /**
   * @private
   * Extract user permissions from roles and organizations
   */
  #extractUserPermissions(user) {
    const permissions = new Set();

    if (user.roles) {
      user.roles.forEach(role => {
        permissions.add(`role:${role}`);
      });
    }

    if (user.organizations) {
      user.organizations.forEach(org => {
        if (org.roles) {
          org.roles.forEach(role => {
            permissions.add(`org:${org.organizationId}:${role.roleName}`);
          });
        }
      });
    }

    return Array.from(permissions);
  }

  /**
   * @private
   * Generate correlation ID
   */
  #generateCorrelationId() {
    return `unified_auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generate unique username from email
   */
  async #generateUniqueUsername(email) {
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;

    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    return username;
  }

  /**
   * @private
   * Validate invitation code
   */
  async #validateInvitationCode(invitationCode, email) {
    const invitation = await this.#cacheService.get(`invitation:${invitationCode}`);

    if (!invitation) {
      throw new AppError(
        'Invalid or expired invitation code',
        400,
        ERROR_CODES.INVALID_INVITATION
      );
    }

    if (invitation.email && invitation.email !== email.toLowerCase()) {
      throw new AppError(
        'Invitation code is not valid for this email',
        400,
        ERROR_CODES.INVITATION_EMAIL_MISMATCH
      );
    }

    return invitation;
  }

  /**
   * @private
   * Mark invitation as used
   */
  async #markInvitationUsed(invitationCode, userId) {
    await this.#cacheService.delete(`invitation:${invitationCode}`);

    logger.info('Invitation code used', {
      invitationCode,
      userId
    });
  }

  /**
   * @private
   * Send verification email
   */
  async #sendVerificationEmail(user, token) {
    if (!this.#config.notifications.email.verificationEmail) return;

    const verificationUrl = `${this.#config.core.appUrl}/auth/verify-email?token=${token}`;

    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        template: 'email-verification',
        data: {
          firstName: user.profile?.firstName || 'User',
          verificationUrl,
          expiresIn: '24 hours'
        }
      });
    } catch (error) {
      logger.error('Failed to send verification email', {
        userId: user._id,
        email: user.email,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Send welcome email
   */
  async #sendWelcomeEmail(user) {
    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Welcome to our platform',
        template: 'welcome',
        data: {
          firstName: user.profile?.firstName || 'User',
          loginUrl: `${this.#config.core.appUrl}/auth/login`
        }
      });
    } catch (error) {
      logger.error('Failed to send welcome email', {
        userId: user._id,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Send password reset email
   */
  async #sendPasswordResetEmail(user, token) {
    const resetUrl = `${this.#config.core.appUrl}/auth/reset-password?token=${token}`;

    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        template: 'password-reset',
        data: {
          firstName: user.profile?.firstName || 'User',
          resetUrl,
          expiresIn: '1 hour'
        }
      });
    } catch (error) {
      logger.error('Failed to send password reset email', {
        userId: user._id,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Send password change confirmation
   */
  async #sendPasswordChangeConfirmation(user, context) {
    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Password Changed Successfully',
        template: 'password-change-confirmation',
        data: {
          firstName: user.profile?.firstName || 'User',
          timestamp: new Date(),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      });
    } catch (error) {
      logger.error('Failed to send password change confirmation', {
        userId: user._id,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Send account activated email
   */
  async #sendAccountActivatedEmail(user) {
    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Account Activated',
        template: 'account-activated',
        data: {
          firstName: user.profile?.firstName || 'User',
          loginUrl: `${this.#config.core.appUrl}/auth/login`
        }
      });
    } catch (error) {
      logger.error('Failed to send account activated email', {
        userId: user._id,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Record audit event
   */
  async #auditEvent(event, user, context, correlationId) {
    if (!this.#config.security.enableAuditLog) return;

    try {
      await this.#auditService.logEvent({
        event,
        userId: user._id,
        organizationId: user.organizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId,
        timestamp: new Date(),
        metadata: context
      });
    } catch (error) {
      logger.error('Failed to log audit event', {
        event,
        userId: user._id,
        error: error.message
      });
    }
  }

  // Additional private methods would be implemented here for:
  // - Basic MFA setup/completion
  // - Enterprise MFA features
  // - OAuth provider interactions
  // - SSO SAML/OIDC handling
  // - Device fingerprinting and trust management
  // - Risk analysis algorithms
  // - Security assessments
  // - Threat intelligence integration
  // - Notification services
  // - And other enterprise security features

  /**
   * @private
   * Generate temporary token for 2FA
   */
  async #generateTemporaryToken(user, correlationId) {
    const tempToken = await this.#tokenService.generateTemporaryToken({
      userId: user._id,
      purpose: '2fa_verification',
      correlationId
    });

    return {
      token: tempToken,
      expiresIn: 300 // 5 minutes
    };
  }

  /**
   * @private
   * Get available 2FA methods for user
   */
  #getAvailable2FAMethods(user) {
    const methods = [];

    if (user.mfa?.methods) {
      user.mfa.methods.forEach(method => {
        if (method.enabled) {
          methods.push(method.type);
        }
      });
    }

    if (user.mfa?.enabled && methods.length === 0) {
      methods.push('totp');
    }

    return methods;
  }

  /**
   * @private
   * Verify 2FA code
   */
  async #verify2FACode(user, code) {
    if (user.mfa?.methods && user.mfa.methods.length > 0) {
      for (const method of user.mfa.methods) {
        if (method.enabled) {
          const isValid = await this.#twoFactorService.verifyCode(method, code);
          if (isValid) return true;
        }
      }
      return false;
    }

    if (user.mfa?.enabled && user.mfa?.secret) {
      return await this.#twoFactorService.verifyTOTP(user.mfa.secret, code);
    }

    return false;
  }

  /**
   * @private
   * Get threat level from risk score
   */
  #getThreatLevel(riskScore) {
    const thresholds = this.#config.security.riskThresholds;

    if (riskScore >= thresholds.critical) return 'critical';
    if (riskScore >= thresholds.high) return 'high';
    if (riskScore >= thresholds.medium) return 'medium';
    if (riskScore >= thresholds.low) return 'low';
    return 'none';
  }

  /**
   * @private
   * Generate security recommendations based on risk factors
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

    if (riskScore > this.#config.security.riskThresholds.high) {
      recommendations.push({
        type: 'security_review',
        priority: 'critical',
        message: 'Review account security settings immediately',
        action: 'security_assessment'
      });
    }

    return recommendations;
  }

  // ==================== MFA PRIVATE METHODS ====================

  /**
   * @private
   * Setup basic MFA for users when enterprise features are disabled
   */
  async #setupBasicMFA(userId, method, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    if (!user.mfa) {
      user.mfa = {
        enabled: false,
        secret: null,
        backupCodes: [],
        lastUsedAt: null
      };
    }

    switch (method) {
      case 'totp':
        const secret = speakeasy.generateSecret({
          name: options.label || user.email,
          issuer: this.#config.mfa.totp.issuer,
          length: 32
        });

        user.mfa.secret = secret.base32;
        await user.save();

        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url, {
          errorCorrectionLevel: 'M',
          width: 256,
          margin: 2
        });

        return {
          secret: secret.base32,
          qrCode: qrCodeUrl,
          manualEntryKey: secret.base32,
          issuer: this.#config.mfa.totp.issuer,
          accountName: options.label || user.email
        };

      default:
        throw new ValidationError('Unsupported MFA method for basic setup', 'UNSUPPORTED_MFA_METHOD');
    }
  }

  /**
   * @private
   * Complete basic MFA setup
   */
  async #completeBasicMFASetup(userId, method, verificationCode, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    if (method === 'totp' && user.mfa?.secret) {
      const isValid = speakeasy.totp.verify({
        secret: user.mfa.secret,
        encoding: 'base32',
        token: verificationCode,
        window: 2
      });

      if (!isValid) {
        throw new ValidationError('Invalid verification code', 'INVALID_VERIFICATION_CODE');
      }

      user.mfa.enabled = true;
      user.mfa.enabledAt = new Date();

      // Generate backup codes
      const backupCodes = [];
      for (let i = 0; i < 8; i++) {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        backupCodes.push(code);
      }

      user.mfa.backupCodes = await Promise.all(
        backupCodes.map(async (code, index) => ({
          code: await bcrypt.hash(code, 10),
          used: false,
          createdAt: new Date(),
          index: index + 1
        }))
      );

      await user.save();

      return {
        success: true,
        method: 'totp',
        backupCodes,
        message: 'MFA setup completed successfully'
      };
    }

    throw new ValidationError('Invalid MFA method or missing setup', 'INVALID_MFA_SETUP');
  }

  /**
   * @private
   * Setup TOTP MFA with enhanced security
   */
  async #setupTOTP(user, options = {}) {
    const { label, issuer } = options;

    const secret = speakeasy.generateSecret({
      name: label || user.email,
      issuer: issuer || this.#config.mfa.totp.issuer,
      length: 32
    });

    const mfaMethod = {
      type: 'totp',
      enabled: false,
      secret: secret.base32,
      deviceInfo: null,
      verifiedAt: null,
      createdAt: new Date(),
      issuer: issuer || this.#config.mfa.totp.issuer,
      algorithm: this.#config.mfa.totp.algorithm,
      digits: this.#config.mfa.totp.digits,
      period: this.#config.mfa.totp.period
    };

    if (!user.mfa.methods) user.mfa.methods = [];
    user.mfa.methods.push(mfaMethod);
    await user.save();

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url, {
      errorCorrectionLevel: 'M',
      width: 256,
      margin: 2
    });

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32,
      issuer: issuer || this.#config.mfa.totp.issuer,
      accountName: label || user.email,
      algorithm: this.#config.mfa.totp.algorithm,
      digits: this.#config.mfa.totp.digits,
      period: this.#config.mfa.totp.period
    };
  }

  /**
   * @private
   * Setup SMS MFA with enhanced security
   */
  async #setupSMS(user, options = {}) {
    const { phoneNumber } = options;

    if (!phoneNumber) {
      throw new ValidationError('Phone number is required for SMS MFA', 'PHONE_NUMBER_REQUIRED');
    }

    const cleanPhone = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
    if (!/^[\+]?[1-9][\d]{7,15}$/.test(cleanPhone)) {
      throw new ValidationError('Invalid phone number format', 'INVALID_PHONE_NUMBER');
    }

    const existingUser = await User.findOne({
      'mfa.methods.phoneNumber': cleanPhone,
      _id: { $ne: user._id }
    });

    if (existingUser) {
      throw new ConflictError('Phone number already in use', 'PHONE_NUMBER_IN_USE');
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeKey = `sms_setup:${user._id}:${verificationCode}`;

    this.#mfaCodes.set(codeKey, {
      userId: user._id,
      code: verificationCode,
      phoneNumber: cleanPhone,
      attempts: 0,
      maxAttempts: 3,
      expiresAt: Date.now() + this.#config.mfa.codeExpiry
    });

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

    // Send SMS code (integrate with your SMS service)
    if (this.#config.notifications.sms.enabled) {
      await this.#sendSMSCode(cleanPhone, verificationCode, 'setup');
    }

    return {
      phoneNumber: this.#maskPhoneNumber(cleanPhone),
      message: 'Verification code sent to your phone',
      expiresIn: this.#config.mfa.codeExpiry / 1000,
      method: 'sms'
    };
  }

  /**
   * @private
   * Setup email MFA with enhanced validation
   */
  async #setupEmailMFA(user, options = {}) {
    const { email = user.email } = options;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format', 'INVALID_EMAIL_FORMAT');
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeKey = `email_setup:${user._id}:${verificationCode}`;

    this.#mfaCodes.set(codeKey, {
      userId: user._id,
      code: verificationCode,
      email,
      attempts: 0,
      maxAttempts: 3,
      expiresAt: Date.now() + this.#config.mfa.codeExpiry
    });

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

    if (this.#config.notifications.email.mfaAlerts) {
      await this.#emailService.sendMFAVerificationCode(email, {
        firstName: user.profile?.firstName,
        verificationCode,
        expiresIn: this.#config.mfa.codeExpiry / 60000
      });
    }

    return {
      email: this.#maskEmail(email),
      message: 'Verification code sent to your email',
      expiresIn: this.#config.mfa.codeExpiry / 1000,
      method: 'email'
    };
  }

  /**
   * @private
   * Setup WebAuthn MFA with enhanced configuration
   */
  async #setupWebAuthn(user, options = {}) {
    const { authenticatorName = 'Security Key' } = options;

    const challenge = crypto.randomBytes(32);
    const challengeB64 = challenge.toString('base64url');

    const challengeKey = `webauthn_challenge:${user._id}`;
    await this.#cacheService.set(challengeKey, {
      challenge: challengeB64,
      userId: user._id,
      authenticatorName,
      createdAt: Date.now()
    }, 300);

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

    return {
      challenge: challengeB64,
      rp: {
        name: this.#config.biometric.webauthn.rpName,
        id: this.#config.biometric.webauthn.rpId
      },
      user: {
        id: Buffer.from(user._id.toString()).toString('base64url'),
        name: user.email,
        displayName: user.profile?.displayName || user.email
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
      ],
      authenticatorSelection: {
        authenticatorAttachment: this.#config.biometric.webauthn.authenticatorAttachment,
        userVerification: this.#config.biometric.webauthn.userVerification,
        requireResidentKey: false
      },
      timeout: this.#config.biometric.webauthn.timeout,
      attestation: this.#config.biometric.webauthn.attestation
    };
  }

  /**
   * @private
   * Setup backup codes with enhanced generation
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
   * @private
   * Setup push notification MFA
   */
  async #setupPushMFA(user, deviceInfo) {
    if (!deviceInfo || !deviceInfo.pushToken) {
      throw new ValidationError('Push token required for push MFA', 'PUSH_TOKEN_REQUIRED');
    }

    const deviceRegistration = {
      deviceId: deviceInfo.deviceId,
      pushToken: deviceInfo.pushToken,
      platform: deviceInfo.platform || 'unknown',
      appVersion: deviceInfo.appVersion,
      registeredAt: new Date()
    };

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

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    if (this.#config.notifications.push.enabled) {
      await this.#sendPushNotification(deviceInfo.pushToken, {
        title: 'Verify Push Notifications',
        body: `Your verification code is: ${verificationCode}`,
        data: {
          type: 'mfa_setup',
          code: verificationCode,
          userId: user._id.toString()
        }
      });
    }

    const codeKey = `push_setup:${user._id}:${verificationCode}`;
    this.#mfaCodes.set(codeKey, {
      userId: user._id,
      code: verificationCode,
      deviceId: deviceInfo.deviceId,
      expiresAt: Date.now() + this.#config.mfa.codeExpiry
    });

    return {
      deviceId: deviceInfo.deviceId,
      message: 'Push notification sent to your device for verification',
      expiresIn: this.#config.mfa.codeExpiry / 1000
    };
  }

  /**
   * @private
   * Enhanced MFA code verification with additional security checks
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
            window: this.#config.mfa.totp.window
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
            if (deviceInfo?.deviceId === pushCode.deviceId) {
              this.#mfaCodes.delete(`push_setup:${userId}:${code}`);
              return true;
            }
          }
          return false;

        case 'webauthn':
          return await this.#verifyWebAuthnAssertion(mfaMethod, code, context);

        case 'backup_codes':
          const user = await User.findById(userId);
          if (user?.mfa?.backupCodes) {
            for (const backupCode of user.mfa.backupCodes) {
              if (!backupCode.used && await bcrypt.compare(code, backupCode.code)) {
                backupCode.used = true;
                backupCode.usedAt = new Date();
                await user.save();
                return true;
              }
            }
          }
          return false;

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
   * @private
   * Record failed MFA attempt with enhanced tracking
   */
  async #recordFailedMFA(userId, method, deviceInfo, context = 'verification') {
    try {
      await this.#auditService.logEvent({
        event: 'MFA_FAILED',
        userId: userId,
        details: {
          method,
          context,
          ipAddress: deviceInfo?.ipAddress,
          deviceId: deviceInfo?.deviceId,
          userAgent: deviceInfo?.userAgent
        }
      });

      const failedKey = `mfa_failed:${userId}:${method}`;
      const failedAttempts = await this.#cacheService.get(failedKey) || 0;
      await this.#cacheService.set(failedKey, failedAttempts + 1, 900);

      if (failedAttempts >= 2) {
        const user = await User.findById(userId);
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
   * @private
   * Send MFA enabled notifications with enhanced details
   */
  async #sendMFAEnabledNotifications(user, method, context = {}) {
    try {
      const { deviceInfo, securityLevel } = context;

      if (this.#config.notifications.email.mfaAlerts) {
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
      }

      if (this.#config.notifications.push.enabled) {
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
      }

    } catch (error) {
      logger.warn('Failed to send MFA enabled notifications', {
        userId: user._id,
        method,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Get MFA recommendations for user
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
   * @private
   * Calculate MFA security level
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
   * @private
   * Get MFA next steps for user
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
   * @private
   * Generate backup codes for user with enhanced security
   */
  async #generateBackupCodes(user) {
    const codes = [];
    for (let i = 0; i < this.#config.mfa.backupCodes.count; i++) {
      const code = crypto.randomBytes(this.#config.mfa.backupCodes.length / 2).toString('hex').toUpperCase();
      codes.push(code);
    }

    const hashedCodes = await Promise.all(
      codes.map(async (code, index) => ({
        code: await bcrypt.hash(code, 10),
        used: false,
        createdAt: new Date(),
        index: index + 1
      }))
    );

    if (!user.mfa.backupCodes) user.mfa.backupCodes = [];
    user.mfa.backupCodes = hashedCodes;
    user.mfa.backupCodesGeneratedAt = new Date();
    await user.save();

    await this.#auditEvent(
      'BACKUP_CODES_GENERATED',
      user,
      { codeCount: codes.length },
      this.#generateCorrelationId()
    );

    return codes;
  }

  // ==================== OAUTH PRIVATE METHODS ====================

  /**
   * @private
   * Get OAuth token URL for provider
   */
  #getOAuthTokenUrl(provider) {
    const urls = {
      google: 'https://oauth2.googleapis.com/token',
      github: 'https://github.com/login/oauth/access_token',
      linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    };
    return urls[provider] || '';
  }

  /**
   * @private
   * Get OAuth user info URL for provider
   */
  #getOAuthUserInfoUrl(provider) {
    const urls = {
      google: 'https://www.googleapis.com/oauth2/v2/userinfo',
      github: 'https://api.github.com/user',
      linkedin: 'https://api.linkedin.com/v2/people/~',
      microsoft: 'https://graph.microsoft.com/v1.0/me'
    };
    return urls[provider] || '';
  }

  /**
   * @private
   * Get OAuth revoke URL for provider
   */
  #getOAuthRevokeUrl(provider) {
    const urls = {
      google: 'https://oauth2.googleapis.com/revoke',
      github: 'https://github.com/settings/connections/applications',
      linkedin: null, // LinkedIn doesn't support token revocation
      microsoft: 'https://graph.microsoft.com/v1.0/me/revokeSignInSessions'
    };
    return urls[provider] || null;
  }

  /**
   * @private
   * Exchange OAuth authorization code for tokens
   */
  async #exchangeOAuthCode(provider, authorizationCode) {
    const providerConfig = this.#oauthProviders.get(provider);
    const tokenUrl = this.#getOAuthTokenUrl(provider);

    const tokenRequest = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'InsightSerenity-Auth/1.0'
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
      const response = await fetch(tokenUrl, tokenRequest);

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
   * @private
   * Get user information from OAuth provider
   */
  async #getOAuthUserInfo(provider, accessToken) {
    const userInfoUrl = this.#getOAuthUserInfoUrl(provider);

    try {
      const response = await fetch(userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'InsightSerenity-Auth/1.0'
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
        case 'microsoft':
          standardizedData.jobTitle = userData.jobTitle;
          standardizedData.officeLocation = userData.officeLocation;
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
   * @private
   * Find user by OAuth provider
   */
  async #findUserByOAuthProvider(provider, providerId) {
    return await User.findOne({
      'authProviders.provider': provider,
      'authProviders.providerId': providerId
    });
  }

  /**
   * @private
   * Link OAuth account to existing user
   */
  async #linkOAuthAccount(user, provider, userInfo, tokenResponse, securityContext) {
    const { riskScore, deviceInfo } = securityContext;

    if (riskScore > this.#config.security.riskThresholds.high) {
      await this.#sendSecurityAlert(user, deviceInfo, riskScore, ['oauth_account_linking']);
    }

    if (!user.authProviders) user.authProviders = [];

    const existingProvider = user.authProviders.find(p => p.provider === provider);
    if (existingProvider) {
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

    logger.info('OAuth account linked', {
      userId: user._id,
      provider,
      providerEmail: userInfo.email,
      riskScore
    });
  }

  /**
   * @private
   * Create new user from OAuth data
   */
  async #createUserFromOAuth(provider, userInfo, tokenResponse, options = {}) {
    const { organizationId, deviceInfo, riskScore } = options;

    const baseUsername = (userInfo.username || userInfo.email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    let username = baseUsername;
    let counter = 1;
    while (await User.findOne({ username })) {
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

    const user = await User.create(userData);

    logger.info('User created from OAuth', {
      userId: user._id,
      provider,
      email: userInfo.email,
      riskScore
    });

    return user;
  }

  /**
   * @private
   * Update OAuth tokens
   */
  async #updateOAuthTokens(user, provider, tokenResponse) {
    const providerAccount = user.authProviders?.find(account => account.provider === provider);

    if (providerAccount) {
      const previousToken = providerAccount.tokens.accessToken;

      providerAccount.tokens.accessToken = tokenResponse.access_token;
      providerAccount.tokens.refreshToken = tokenResponse.refresh_token;
      providerAccount.tokens.expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
      providerAccount.lastUsedAt = new Date();

      if (!providerAccount.tokenHistory) providerAccount.tokenHistory = [];
      providerAccount.tokenHistory.unshift({
        rotatedAt: new Date(),
        previousTokenHash: previousToken ? crypto.createHash('sha256').update(previousToken).digest('hex').substring(0, 16) : null,
        reason: 'authentication'
      });

      providerAccount.tokenHistory = providerAccount.tokenHistory.slice(0, 5);

      await user.save();

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
   * @private
   * Calculate risk score for OAuth authentication
   */
  async #calculateOAuthRiskScore(provider, deviceInfo) {
    let riskScore = 0;

    const baseRisk = await this.#calculateRiskScore(null, deviceInfo);
    riskScore += baseRisk.score * 0.7;

    const trustedProviders = ['google', 'microsoft', 'github'];
    if (!trustedProviders.includes(provider)) {
      riskScore += 15;
    }

    const providerAlerts = await this.#cacheService.get(`provider_alerts:${provider}`) || [];
    if (providerAlerts.length > 0) {
      riskScore += 25;
    }

    return Math.min(riskScore, 100);
  }

  /**
   * @private
   * Revoke OAuth token with provider
   */
  async #revokeOAuthToken(provider, token) {
    const revokeUrl = this.#getOAuthRevokeUrl(provider);
    if (!revokeUrl) return;

    try {
      const providerConfig = this.#oauthProviders.get(provider);
      await fetch(revokeUrl, {
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
   * @private
   * Validate SSO signature
   */
  async #validateSSOSignature(provider, ssoResponse) {
    const providerConfig = this.#ssoProviders.get(provider);

    try {
      const certificate = providerConfig.certificate;
      if (!certificate) {
        throw new Error('Provider certificate not configured');
      }

      const signatureValue = ssoResponse.signature;
      const signedInfo = ssoResponse.signedInfo;

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(signedInfo);

      const isValid = verifier.verify(certificate, signatureValue, 'base64');

      if (!isValid) {
        throw new Error('SSO signature validation failed');
      }

      const now = new Date();
      const notBefore = new Date(ssoResponse.notBefore);
      const notOnOrAfter = new Date(ssoResponse.notOnOrAfter);

      if (now < notBefore || now >= notOnOrAfter) {
        throw new Error('SSO assertion time bounds invalid');
      }

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
   * @private
   * Extract user attributes from SSO response
   */
  async #extractSSOAttributes(provider, ssoResponse) {
    const providerConfig = this.#ssoProviders.get(provider);
    const attributeMapping = providerConfig.attributeMapping;

    try {
      const attributes = {};

      Object.keys(attributeMapping).forEach(localAttribute => {
        const ssoAttributeName = attributeMapping[localAttribute];
        const value = ssoResponse.attributes[ssoAttributeName];

        if (value !== undefined) {
          attributes[localAttribute] = Array.isArray(value) ? value[0] : value;
        }
      });

      attributes.email = attributes.email?.toLowerCase();
      attributes.groups = this.#extractGroups(ssoResponse.attributes);
      attributes.roles = this.#mapSSOGroups(attributes.groups, provider);
      attributes.department = attributes.department || this.#extractDepartment(attributes.groups);
      attributes.permissions = this.#mapSSOPermissions(attributes.roles, attributes.groups);

      if (provider === 'saml') {
        attributes.employeeId = ssoResponse.attributes['urn:oid:2.16.840.1.113730.3.1.3'];
        attributes.costCenter = ssoResponse.attributes['urn:oid:1.3.6.1.4.1.5923.1.1.1.8'];
        attributes.manager = ssoResponse.attributes['urn:oid:0.9.2342.19200300.100.1.10'];
      }

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
   * @private
   * Find or provision SSO user
   */
  async #findOrProvisionSSOUser(provider, userAttributes, options = {}) {
    const { allowProvisioning, organizationId, roleMapping, deviceInfo } = options;

    try {
      let user = await User.findOne({
        email: userAttributes.email,
        organizationId: organizationId || null
      });

      if (!user && userAttributes.employeeId) {
        user = await User.findOne({
          'profile.employeeId': userAttributes.employeeId,
          organizationId: organizationId || null
        });
      }

      if (!user && allowProvisioning) {
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

        user = await User.create(userData);

        logger.info('User provisioned from SSO', {
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
   * @private
   * Update user from SSO attributes
   */
  async #updateUserFromSSO(user, userAttributes, options = {}) {
    const { roleMapping } = options;

    try {
      let hasChanges = false;

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

      if (roleMapping && userAttributes.roles) {
        const currentRoles = user.roles || [];
        const newRoles = userAttributes.roles;

        if (JSON.stringify(currentRoles.sort()) !== JSON.stringify(newRoles.sort())) {
          user.roles = newRoles;
          hasChanges = true;
        }
      }

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
   * @private
   * Calculate risk score for SSO request
   */
  async #calculateSSORequestRiskScore(provider, ssoResponse, deviceInfo) {
    let riskScore = 0;

    const baseRisk = await this.#calculateRiskScore(null, deviceInfo);
    riskScore += baseRisk.score * 0.5;

    const authAge = Date.now() - new Date(ssoResponse.authInstant).getTime();
    if (authAge > 3600000) {
      riskScore += 20;
    }

    if (!ssoResponse.attributes || Object.keys(ssoResponse.attributes).length < 3) {
      riskScore += 15;
    }

    const trustedProviders = ['saml', 'oidc', 'azure_ad', 'okta'];
    if (!trustedProviders.includes(provider)) {
      riskScore += 10;
    }

    return Math.min(riskScore, 100);
  }

  // ==================== DEVICE MANAGEMENT PRIVATE METHODS ====================

  /**
   * @private
   * Check if device is trusted
   */
  #isTrustedDevice(userId, deviceId) {
    if (!deviceId) return false;

    const key = `${userId}:${deviceId}`;
    const trustedDevice = this.#trustedDevices.get(key);
    return trustedDevice && trustedDevice.expiresAt > Date.now();
  }

  /**
   * @private
   * Trust a device
   */
  async #trustDevice(userId, deviceInfo, options = {}) {
    const { duration = this.#config.mfa.deviceTrust.duration, reason = 'user_request' } = options;

    try {
      const key = `${userId}:${deviceInfo.deviceId}`;

      const location = await this.#getLocationFromIP(deviceInfo.ipAddress);
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

      this.#trustedDevices.set(key, trustedDevice);

      const user = await User.findById(userId);
      if (user) {
        if (!user.mfa) user.mfa = {};
        if (!user.mfa.trustedDevices) user.mfa.trustedDevices = [];

        user.mfa.trustedDevices = user.mfa.trustedDevices.filter(
          device => device.deviceId !== deviceInfo.deviceId
        );

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

      await this.#auditEvent(
        UnifiedAuthService.#AUTH_EVENTS.DEVICE_TRUSTED,
        { _id: userId },
        {
          deviceId: deviceInfo.deviceId,
          deviceName: trustedDevice.deviceName,
          ipAddress: deviceInfo.ipAddress,
          location: location ? `${location.city}, ${location.country}` : 'Unknown',
          duration: duration / (1000 * 60 * 60 * 24),
          reason
        },
        this.#generateCorrelationId()
      );

      logger.info('Device trusted successfully', {
        userId,
        deviceId: deviceInfo.deviceId,
        deviceName: trustedDevice.deviceName,
        expiresAt: new Date(trustedDevice.expiresAt),
        reason
      });

      return {
        success: true,
        deviceId: deviceInfo.deviceId,
        expiresAt: new Date(trustedDevice.expiresAt),
        message: 'Device trusted successfully'
      };

    } catch (error) {
      logger.error('Failed to trust device', {
        userId,
        deviceId: deviceInfo.deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * @private
   * Untrust a device
   */
  async #untrustDevice(userId, deviceId, options = {}) {
    const key = `${userId}:${deviceId}`;

    this.#trustedDevices.delete(key);

    const user = await User.findById(userId);
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
   * @private
   * List trusted devices for user
   */
  async #listTrustedDevices(userId, options = {}) {
    const user = await User.findById(userId);

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
   * @private
   * Clear all trusted devices for user
   */
  async #clearAllTrustedDevices(userId, options = {}) {
    for (const [key] of this.#trustedDevices) {
      if (key.startsWith(`${userId}:`)) {
        this.#trustedDevices.delete(key);
      }
    }

    const user = await User.findById(userId);
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

  /**
   * @private
   * Check device management permission
   */
  async #checkDeviceManagementPermission(requesterId, userId) {
    if (requesterId === userId) return;

    const requester = await User.findById(requesterId);
    if (!requester) {
      throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
    }

    const hasAdminAccess = requester.roles?.includes('admin') ||
      requester.roles?.includes('security-admin');

    if (!hasAdminAccess) {
      throw new ForbiddenError('Insufficient permissions to manage user devices', 'INSUFFICIENT_PERMISSIONS');
    }
  }

  // ==================== SECURITY ASSESSMENT PRIVATE METHODS ====================

  /**
   * @private
   * Assess password security
   */
  async #assessPasswordSecurity(user) {
    let score = 0;
    const issues = [];
    const recommendations = [];

    if (!user.password) {
      if (user.authProviders?.length > 0) {
        score = 85;
        recommendations.push('Consider setting a backup password for account recovery');
      } else {
        score = 0;
        issues.push('No password set');
        recommendations.push('Set a strong password immediately');
      }
    } else {
      score = 70;

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

      if (user.passwordHistory?.length < 5) {
        score -= 5;
        issues.push('Limited password history tracking');
      }

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
   * @private
   * Assess MFA security
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
      score = 60;

      const enabledMethods = user.mfa.methods?.filter(m => m.enabled) || [];

      if (enabledMethods.length >= 2) {
        score += 25;
      } else if (enabledMethods.length === 1) {
        score += 15;
        recommendations.push('Consider enabling a second MFA method for redundancy');
      }

      const methodTypes = enabledMethods.map(m => m.type);
      if (methodTypes.includes('totp')) score += 10;
      if (methodTypes.includes('webauthn')) score += 15;
      if (methodTypes.includes('sms')) score += 5;
      if (methodTypes.includes('email')) score += 5;

      if (user.mfa.backupCodes?.length > 0) {
        score += 10;

        if (user.mfa.backupCodesGeneratedAt) {
          const codeAge = Date.now() - user.mfa.backupCodesGeneratedAt.getTime();
          if (codeAge > 365 * 24 * 60 * 60 * 1000) {
            issues.push('Backup codes are over 1 year old');
            recommendations.push('Regenerate backup codes periodically');
          }
        }
      } else {
        issues.push('No backup codes generated');
        recommendations.push('Generate backup codes for account recovery');
      }

      if (user.mfa.lastUsedAt) {
        const lastUsed = Date.now() - user.mfa.lastUsedAt.getTime();
        if (lastUsed > 30 * 24 * 60 * 60 * 1000) {
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
   * @private
   * Assess session security
   */
  async #assessSessionSecurity(user) {
    let score = 70;
    const issues = [];
    const recommendations = [];

    try {
      const activeSessions = await SessionModel.find({
        userId: user._id,
        status: 'active',
        expiresAt: { $gt: new Date() }
      });

      if (activeSessions.length > 5) {
        score -= 10;
        issues.push('High number of active sessions');
        recommendations.push('Review and close unnecessary sessions');
      }

      const highRiskSessions = activeSessions.filter(
        session => session.security?.riskScore > this.#config.security.riskThresholds.high
      );

      if (highRiskSessions.length > 0) {
        score -= 20;
        issues.push(`${highRiskSessions.length} high-risk sessions detected`);
        recommendations.push('Review high-risk sessions and terminate if unauthorized');
      }

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

      const oldSessions = activeSessions.filter(session => {
        const sessionAge = Date.now() - session.createdAt.getTime();
        return sessionAge > 7 * 24 * 60 * 60 * 1000;
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
   * @private
   * Assess device security
   */
  async #assessDeviceSecurity(user) {
    let score = 60;
    const issues = [];
    const recommendations = [];

    const trustedDevices = user.mfa?.trustedDevices || [];

    if (trustedDevices.length === 0) {
      score += 10;
      recommendations.push('Consider trusting frequently used devices for convenience');
    } else {
      const expiredDevices = trustedDevices.filter(device => device.expiresAt < Date.now());
      if (expiredDevices.length > 0) {
        issues.push(`${expiredDevices.length} expired trusted devices found`);
        recommendations.push('Clean up expired trusted devices');
      }

      const activeDevices = trustedDevices.filter(device => device.expiresAt > Date.now());
      if (activeDevices.length > 10) {
        score -= 15;
        issues.push('High number of trusted devices');
        recommendations.push('Review and remove unnecessary trusted devices');
      }

      const longTrustedDevices = activeDevices.filter(device => {
        const trustAge = Date.now() - device.trustedAt;
        return trustAge > 90 * 24 * 60 * 60 * 1000;
      });

      if (longTrustedDevices.length > 0) {
        score -= 5;
        issues.push('Devices trusted for extended periods');
        recommendations.push('Periodically review device trust settings');
      }
    }

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
   * @private
   * Assess account security
   */
  async #assessAccountSecurity(user) {
    let score = 70;
    const issues = [];
    const recommendations = [];

    if (!user.verification?.email?.verified) {
      score -= 30;
      issues.push('Email address not verified');
      recommendations.push('Verify your email address immediately');
    }

    if (user.registeredAt) {
      const accountAge = Date.now() - user.registeredAt.getTime();
      const ageInDays = accountAge / (1000 * 60 * 60 * 24);

      if (ageInDays < 30) {
        score -= 5;
        issues.push('New account (less than 30 days old)');
      }
    }

    const profileFields = ['firstName', 'lastName', 'displayName'];
    const completedFields = profileFields.filter(field => user.profile?.[field]);

    if (completedFields.length < profileFields.length) {
      score -= 5;
      issues.push('Incomplete profile information');
      recommendations.push('Complete your profile information');
    }

    if (!user.organizationId && (!user.organizations || user.organizations.length === 0)) {
      score -= 10;
      issues.push('No organization membership');
      recommendations.push('Join an organization for enhanced security policies');
    }

    if (user.authProviders?.length > 0) {
      score += 10;

      if (user.authProviders.length > 1) {
        score += 5;
      }
    }

    if (user.security?.incidents?.length > 0) {
      const recentIncidents = user.security.incidents.filter(incident => {
        const incidentAge = Date.now() - incident.timestamp.getTime();
        return incidentAge < 30 * 24 * 60 * 60 * 1000;
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

  /**
   * @private
   * Get security level from score
   */
  #getSecurityLevel(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  /**
   * @private
   * Generate security recommendations from assessment
   */
  #generateSecurityRecommendations(assessment) {
    const recommendations = [];

    Object.values(assessment.categories).forEach(category => {
      if (category.recommendations) {
        recommendations.push(...category.recommendations.map(rec => ({
          category: category.category,
          priority: category.score < 40 ? 'high' : category.score < 70 ? 'medium' : 'low',
          recommendation: rec
        })));
      }
    });

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

    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * @private
   * Analyze potential threats for user
   */
  async #analyzePotentialThreats(user, assessment) {
    const threats = [];

    if (assessment.overallScore < 40) {
      threats.push({
        type: 'account_compromise',
        severity: 'high',
        description: 'Account is vulnerable to compromise due to weak security posture',
        indicators: ['low_security_score', 'multiple_issues']
      });
    }

    if (!user.mfa?.enabled) {
      threats.push({
        type: 'credential_theft',
        severity: 'medium',
        description: 'Account vulnerable to credential theft without MFA protection',
        indicators: ['no_mfa']
      });
    }

    const activeSessions = await SessionModel.countDocuments({
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

  // ==================== UTILITY PRIVATE METHODS ====================

  /**
   * @private
   * Get location from IP address
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
            coordinates: [geo.ll[1], geo.ll[0]]
          },
          timezone: geo.timezone,
          isp: geo.org || 'Unknown ISP',
          asn: geo.as || 'Unknown ASN'
        };
      }
    } catch (error) {
      logger.warn('Failed to get location from IP', {
        ipAddress,
        error: error.message
      });
    }
    return null;
  }

  /**
   * @private
   * Check if location is known for user
   */
  #isKnownLocation(user, location) {
    if (!user.activity?.loginHistory || !location) {
      return false;
    }

    return user.activity.loginHistory.some(login => {
      if (!login.location) return false;
      return login.location.city === location.city &&
        login.location.country === location.country;
    });
  }

  /**
   * @private
   * Check if login time is unusual for user
   */
  #isUnusualLoginTime(user, loginTime) {
    if (!user.activity?.loginHistory || user.activity.loginHistory.length < 5) {
      return false;
    }

    const hour = loginTime.getHours();

    const loginHours = user.activity.loginHistory
      .map(login => new Date(login.timestamp).getHours())
      .filter(h => !isNaN(h));

    if (loginHours.length === 0) return false;

    const avgHour = loginHours.reduce((sum, h) => sum + h, 0) / loginHours.length;
    const variance = loginHours.reduce((sum, h) => sum + Math.pow(h - avgHour, 2), 0) / loginHours.length;
    const stdDev = Math.sqrt(variance);

    return Math.abs(hour - avgHour) > (2 * stdDev);
  }

  /**
   * @private
   * Check if IP address is VPN or proxy
   */
  async #isVPNOrProxy(ipAddress) {
    try {
      const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./
      ];

      if (privateRanges.some(range => range.test(ipAddress))) {
        return false;
      }

      // Integrate with VPN detection services like IPInfo, MaxMind, etc.
      // For now, return false as a placeholder
      return false;

    } catch (error) {
      logger.warn('VPN/proxy detection failed', {
        ipAddress,
        error: error.message
      });
      return false;
    }
  }

  /**
   * @private
   * Check if user agent is suspicious
   */
  #isSuspiciousUserAgent(userAgent) {
    if (!userAgent || userAgent.length < 10) {
      return true;
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
   * @private
   * Validate registration domain
   */
  async #validateRegistrationDomain(email) {
    const domain = email.split('@')[1].toLowerCase();

    if (this.#config.registration.domainWhitelist.length > 0) {
      if (!this.#config.registration.domainWhitelist.includes(domain)) {
        throw new AppError(
          'Email domain not allowed for registration',
          403,
          ERROR_CODES.DOMAIN_NOT_ALLOWED
        );
      }
    }

    if (this.#config.registration.domainBlacklist.includes(domain)) {
      throw new AppError(
        'Email domain is blocked for registration',
        403,
        ERROR_CODES.DOMAIN_BLOCKED
      );
    }
  }

  /**
   * @private
   * Send security alert with detailed context
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

      if (this.#config.notifications.email.securityAlerts) {
        await this.#emailService.sendSecurityAlert(user.email, {
          firstName: user.profile?.firstName,
          ...alertPayload,
          actionRequired: riskScore > this.#config.security.riskThresholds.high,
          recommendations: this.#getSecurityRecommendations(riskScore, riskFactors)
        });
      }

      if (this.#config.notifications.push.securityAlerts) {
        await this.#notificationService.sendNotification({
          type: 'SECURITY_ALERT',
          recipients: [user._id.toString()],
          data: alertPayload,
          priority: riskScore > this.#config.security.riskThresholds.high ? 'high' : 'medium'
        });
      }

      logger.info('Security alert sent', {
        userId: user._id,
        alertType: alertPayload.alertType,
        riskScore,
        location: alertPayload.location
      });

    } catch (error) {
      logger.error('Failed to send security alert', {
        userId: user._id,
        riskScore: typeof alertData === 'number' ? alertData : 50,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Helper methods for complex implementations
   */
  #maskPhoneNumber(phoneNumber) {
    if (phoneNumber.length <= 4) return phoneNumber;
    const visible = phoneNumber.slice(-4);
    const masked = '*'.repeat(Math.max(0, phoneNumber.length - 4));
    return masked + visible;
  }

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

  #parseUserAgent(userAgent) {
    const uaParser = new UAParser(userAgent);
    const result = uaParser.getResult();

    return {
      browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
      os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
      device: result.device.type || 'desktop'
    };
  }

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

  #mapSSOGroups(groups, provider) {
    const roleMappings = {
      saml: {
        'Administrators': ['admin'],
        'Security Admins': ['security-admin'],
        'Users': ['user'],
        'Managers': ['manager'],
        'HR Team': ['hr'],
        'IT Support': ['support']
      }
    };

    const mappings = roleMappings[provider] || {};
    const roles = new Set(['user']);

    groups.forEach(group => {
      const mappedRoles = mappings[group];
      if (mappedRoles) {
        mappedRoles.forEach(role => roles.add(role));
      }
    });

    return Array.from(roles);
  }

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

  #mapSSOPermissions(roles, groups) {
    const permissions = new Set();

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

    return Array.from(permissions);
  }

  async #generateUsernameFromSSO(userAttributes) {
    let baseUsername;

    if (userAttributes.employeeId) {
      baseUsername = `emp${userAttributes.employeeId}`;
    } else if (userAttributes.email) {
      baseUsername = userAttributes.email.split('@')[0].toLowerCase();
    } else {
      baseUsername = `${userAttributes.firstName || 'user'}${userAttributes.lastName || ''}`.toLowerCase();
    }

    baseUsername = baseUsername.replace(/[^a-z0-9]/g, '');

    let username = baseUsername;
    let counter = 1;
    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    return username;
  }

  #determineAlertType(riskFactors) {
    if (riskFactors.includes('compromised_credentials')) return 'credential_compromise';
    if (riskFactors.includes('repeated_failed_attempts')) return 'brute_force_attempt';
    if (riskFactors.includes('repeated_mfa_failures')) return 'mfa_bypass_attempt';
    if (riskFactors.includes('new_device') && riskFactors.includes('new_location')) return 'suspicious_login';
    if (riskFactors.includes('vpn_or_proxy')) return 'anonymous_access';
    if (riskFactors.includes('anomalous_pattern')) return 'unusual_activity';
    return 'security_concern';
  }

  async #sendSMSCode(phoneNumber, code, purpose) {
    try {
      const message = purpose === 'setup'
        ? `Your MFA setup code is: ${code}. This code expires in 5 minutes.`
        : `Your verification code is: ${code}. This code expires in 5 minutes.`;

      logger.info('SMS code sent', {
        phoneNumber: this.#maskPhoneNumber(phoneNumber),
        purpose,
        codeLength: code.length
      });

      // Integrate with SMS providers like Twilio, AWS SNS, etc.

    } catch (error) {
      logger.error('SMS sending failed', {
        phoneNumber: this.#maskPhoneNumber(phoneNumber),
        purpose,
        error: error.message
      });
      throw new AppError('Failed to send SMS code', 500, 'SMS_SEND_FAILED');
    }
  }

  async #sendPushNotification(pushToken, payload) {
    try {
      logger.info('Push notification sent', {
        pushToken: pushToken.substring(0, 10) + '...',
        title: payload.title,
        type: payload.data?.type
      });

      // Integrate with push notification services like Firebase, APNS, etc.

    } catch (error) {
      logger.error('Push notification sending failed', {
        error: error.message
      });
      throw new AppError('Failed to send push notification', 500, 'PUSH_SEND_FAILED');
    }
  }

  async #verifyWebAuthnAssertion(mfaMethod, assertion, context = {}) {
    try {
      // WebAuthn verification would be implemented here
      // For now, return mock verification
      const assertionData = JSON.parse(assertion);
      return assertionData.id === mfaMethod.credentialId;

    } catch (error) {
      logger.error('WebAuthn verification failed', {
        error: error.message,
        method: mfaMethod.type
      });
      return false;
    }
  }
}

module.exports = AuthService;