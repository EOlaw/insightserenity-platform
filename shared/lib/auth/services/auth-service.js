'use strict';

/**
 * @fileoverview Main authentication orchestration service
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
 * @requires module:shared/lib/security/audit/audit-service
 */

const User = require('../../database/models/users/user-model');
const OrganizationModel = require('../../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model');
const SessionModel = require('../../database/models/auth/session-model');
const AuditLogModel = require('../../database/models/security/audit-log-model');
const TokenService = require('./token-service');
const SessionService = require('./session-service');
const PasswordService = require('./password-service');
const TwoFactorService = require('./two-factor-service');
const BlacklistService = require('./blacklist-service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const EmailService = require('../../services/email-service');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');

/**
 * @class AuthService
 * @description Main authentication orchestration service that coordinates authentication flows
 * including login, logout, registration, password reset, and multi-factor authentication.
 * This service acts as the primary interface for all authentication operations and delegates
 * advanced enterprise features to specialized services.
 */
class AuthService {
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
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    maxLoginAttempts: 5,
    lockoutDuration: 900000, // 15 minutes
    sessionDuration: 86400000, // 24 hours
    refreshTokenDuration: 604800000, // 7 days
    passwordResetTokenDuration: 3600000, // 1 hour
    verificationTokenDuration: 86400000, // 24 hours
    requireEmailVerification: true,
    require2FA: false,
    allowMultipleSessions: true,
    maxConcurrentSessions: 5,
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecial: true,
      preventReuse: 5
    },
    registration: {
      enabled: true,
      requireInvitation: false,
      defaultRole: 'user',
      autoActivate: true,
      allowPublicRegistration: true
    },
    ipWhitelist: [],
    ipBlacklist: [],
    enableAuditLog: true,
    enableRateLimiting: true,
    rateLimitWindow: 900000, // 15 minutes
    rateLimitMaxAttempts: 100,
    appUrl: process.env.APP_URL || 'http://localhost:3000'
  };

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
    TOKEN_REFRESHED: 'auth.token.refreshed'
  };

  /**
   * Creates a new AuthService instance
   * @param {Object} [config] - Service configuration
   * @param {TokenService} [tokenService] - Token service instance
   * @param {SessionService} [sessionService] - Session service instance
   * @param {PasswordService} [passwordService] - Password service instance
   * @param {TwoFactorService} [twoFactorService] - Two-factor service instance
   * @param {BlacklistService} [blacklistService] - Blacklist service instance
   * @param {EmailService} [emailService] - Email service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    tokenService,
    sessionService,
    passwordService,
    twoFactorService,
    blacklistService,
    emailService,
    cacheService,
    auditService
  ) {
    this.#config = { ...AuthService.#DEFAULT_CONFIG, ...config };
    this.#tokenService = tokenService || new TokenService();
    this.#sessionService = sessionService || new SessionService();
    this.#passwordService = passwordService || new PasswordService();
    this.#twoFactorService = twoFactorService || new TwoFactorService();
    this.#blacklistService = blacklistService || new BlacklistService();
    this.#emailService = emailService || new EmailService();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();

    logger.info('AuthService initialized', {
      requireEmailVerification: this.#config.requireEmailVerification,
      require2FA: this.#config.require2FA,
      maxConcurrentSessions: this.#config.maxConcurrentSessions,
      registrationEnabled: this.#config.registration.enabled,
      allowPublicRegistration: this.#config.registration.allowPublicRegistration
    });
  }

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
   * @returns {Promise<Object>} Authentication result with tokens
   * @throws {AppError} If authentication fails
   */
  async authenticate(credentials, context) {
    const correlationId = context.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('User authentication attempt', {
        correlationId,
        email: credentials.email,
        organizationId: credentials.organizationId,
        ipAddress: context.ipAddress
      });

      // Validate IP restrictions
      await this.#validateIPRestrictions(context.ipAddress);

      // Check rate limiting
      await this.#checkRateLimit(credentials.email, context.ipAddress);

      // Find user
      const user = await this.#findUserForLogin(credentials.email, credentials.organizationId);

      // Check account status
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

      // Check 2FA requirement
      if (user.mfa?.enabled || this.#config.require2FA) {
        if (!credentials.totpCode) {
          const tempTokenResult = await this.#generateTemporaryToken(user, correlationId);
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
          await this.#handleFailedLogin(user, context, correlationId, 'Invalid 2FA code');
          throw new AppError(
            'Invalid two-factor authentication code',
            401,
            ERROR_CODES.TWO_FACTOR_ERROR,
            { correlationId }
          );
        }
      }

      // Check concurrent sessions
      await this.#validateConcurrentSessions(user._id);

      // Generate tokens
      const tokens = await this.#generateAuthTokens(user);

      // Create session
      const session = await this.#sessionService.createSession({
        userId: user._id,
        organizationId: user.organizationId || credentials.organizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceId: context.deviceId,
        ...tokens
      });

      // Reset failed attempts
      await this.#resetFailedAttempts(user);

      // Update last login
      await this.#updateLastLogin(user, context);

      // Audit successful login
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.LOGIN_SUCCESS,
        user,
        context,
        correlationId
      );

      const duration = Date.now() - startTime;
      logger.info('User authentication successful', {
        correlationId,
        userId: user._id,
        duration
      });

      return {
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
        // Try to verify as access token first
        const payload = await this.#tokenService.verifyAccessToken(sessionId);
        session = await this.#sessionService.getSessionByUserId(payload.userId);
      } catch {
        // Fall back to session ID lookup
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
        // Terminate all user sessions
        await this.#sessionService.terminateAllUserSessions(session.userId);
        
        // Blacklist all user tokens
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
        // Blacklist session tokens
        if (session.accessToken) {
          await this.#blacklistService.blacklistToken(session.accessToken, 'logout');
        }
        if (session.refreshToken) {
          await this.#blacklistService.blacklistToken(session.refreshToken, 'logout');
        }

        // Terminate specific session
        await this.#sessionService.terminateSession(session._id || session.sessionId);
      }

      // Audit logout
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.LOGOUT,
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
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @param {string} [userData.firstName] - User first name
   * @param {string} [userData.lastName] - User last name
   * @param {string} [userData.organizationId] - Organization ID
   * @param {string} [userData.invitationCode] - Invitation code if required
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

      // Check if registration is enabled
      if (!this.#config.registration.enabled) {
        throw new AppError(
          'Registration is currently disabled',
          403,
          ERROR_CODES.OPERATION_NOT_ALLOWED,
          { correlationId }
        );
      }

      // Check if public registration is allowed
      if (!this.#config.registration.allowPublicRegistration && !userData.invitationCode) {
        throw new AppError(
          'Invitation code required for registration',
          403,
          ERROR_CODES.INVITATION_REQUIRED,
          { correlationId }
        );
      }

      // Validate invitation code if provided
      if (userData.invitationCode) {
        await this.#validateInvitationCode(userData.invitationCode, userData.email);
      }

      // Check existing user
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

      // Validate password policy
      await this.#passwordService.validatePasswordPolicy(
        userData.password,
        this.#config.passwordPolicy
      );

      // Hash password
      const hashedPassword = await this.#passwordService.hashPassword(userData.password);

      // Generate username if not provided
      const username = userData.username || await this.#generateUniqueUsername(userData.email);

      // Prepare user data
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
      if (this.#config.requireEmailVerification) {
        const verificationToken = await this.#tokenService.generateVerificationToken();
        newUserData.verification = {
          email: {
            verified: false,
            token: verificationToken,
            tokenExpires: new Date(Date.now() + this.#config.verificationTokenDuration),
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

      // Create user
      const user = await User.create(newUserData);

      // Send verification email if required
      if (this.#config.requireEmailVerification) {
        await this.#sendVerificationEmail(user, newUserData.verification.email.token);
      }

      // Send welcome email
      await this.#sendWelcomeEmail(user);

      // Mark invitation as used if applicable
      if (userData.invitationCode) {
        await this.#markInvitationUsed(userData.invitationCode, user._id);
      }

      // Audit registration
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.REGISTER,
        user,
        context,
        correlationId
      );

      logger.info('User registration successful', {
        correlationId,
        userId: user._id,
        requiresVerification: this.#config.requireEmailVerification
      });

      const response = {
        success: true,
        user: this.#sanitizeUser(user),
        message: 'Registration successful'
      };

      if (this.#config.requireEmailVerification) {
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

      // Find user
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

      // Check if user can reset password
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

      // Generate reset token
      const resetToken = await this.#tokenService.generatePasswordResetToken();
      const hashedToken = await this.#passwordService.hashToken(resetToken);

      // Save reset token
      user.security = user.security || {};
      user.security.passwordReset = {
        token: hashedToken,
        tokenExpires: new Date(Date.now() + this.#config.passwordResetTokenDuration),
        requestedAt: new Date(),
        requestIp: context.ipAddress
      };
      await user.save();

      // Send reset email
      await this.#sendPasswordResetEmail(user, resetToken);

      // Audit password reset
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.PASSWORD_RESET,
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
        expiresIn: this.#config.passwordResetTokenDuration / 1000 / 60 // minutes
      };

    } catch (error) {
      logger.error('Password reset initiation failed', {
        correlationId,
        error: error.message
      });

      // Always return generic message for security
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

      // Hash token for comparison
      const hashedToken = await this.#passwordService.hashToken(token);

      // Find user with valid token
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

      // Validate new password
      await this.#passwordService.validatePasswordPolicy(
        newPassword,
        this.#config.passwordPolicy
      );

      // Check password history
      if (user.passwordHistory && user.passwordHistory.length > 0) {
        await this.#passwordService.checkPasswordHistory(
          newPassword,
          user.passwordHistory,
          this.#config.passwordPolicy.preventReuse
        );
      }

      // Hash new password
      const hashedPassword = await this.#passwordService.hashPassword(newPassword);

      // Update user
      user.password = hashedPassword;
      user.security.passwordReset = undefined;
      user.passwordChangedAt = new Date();
      
      // Update password history
      user.passwordHistory = user.passwordHistory || [];
      user.passwordHistory.unshift({
        hash: hashedPassword,
        changedAt: new Date(),
        changedBy: user._id,
        reason: 'password_reset'
      });
      user.passwordHistory = user.passwordHistory.slice(0, this.#config.passwordPolicy.preventReuse);

      // Reset failed login attempts
      user.security.loginAttempts = {
        count: 0,
        lockedUntil: null,
        lastAttemptAt: null
      };

      await user.save();

      // Terminate sessions if requested
      if (terminateAllSessions) {
        await this.#sessionService.terminateAllUserSessions(user._id);
      }

      // Send confirmation email
      await this.#sendPasswordChangeConfirmation(user, context);

      // Audit password change
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.PASSWORD_CHANGE,
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

      // Check if token is blacklisted
      const isBlacklisted = await this.#blacklistService.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        throw new AppError(
          'Token has been revoked',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      // Verify refresh token
      const payload = await this.#tokenService.verifyRefreshToken(refreshToken);

      // Get user
      const user = await User.findById(payload.userId);
      if (!user || user.accountStatus.status !== 'active') {
        throw new AppError(
          'User not found or inactive',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId }
        );
      }

      // Get session
      const session = await this.#sessionService.getSessionByRefreshToken(refreshToken);
      if (!session || session.status !== 'active') {
        throw new AppError(
          'Session not found or inactive',
          401,
          ERROR_CODES.INVALID_SESSION,
          { correlationId }
        );
      }

      // Check session expiry
      if (session.expiresAt < new Date()) {
        throw new AppError(
          'Session expired',
          401,
          ERROR_CODES.SESSION_EXPIRED,
          { correlationId }
        );
      }

      // Generate new tokens
      const tokens = await this.#generateAuthTokens(user);

      // Update session with new tokens
      await this.#sessionService.updateSessionTokens(session._id, tokens);

      // Blacklist old tokens
      await this.#blacklistService.blacklistToken(session.accessToken, 'refresh');
      await this.#blacklistService.blacklistToken(refreshToken, 'refresh');

      // Update last activity
      await this.#updateLastActivity(user);

      // Audit token refresh
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.TOKEN_REFRESHED,
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

      // Find user with valid token
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

      // Update user
      user.verification.email.verified = true;
      user.verification.email.verifiedAt = new Date();
      user.verification.email.token = undefined;
      user.verification.email.tokenExpires = undefined;

      // Activate account if pending
      if (user.accountStatus.status === 'pending') {
        user.accountStatus.status = 'active';
        user.accountStatus.statusHistory.push({
          status: 'active',
          reason: 'Email verified',
          changedAt: new Date()
        });
      }

      await user.save();

      // Send welcome email if account was just activated
      if (user.accountStatus.status === 'active') {
        await this.#sendAccountActivatedEmail(user);
      }

      // Audit email verification
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.EMAIL_VERIFIED,
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
      // Check if token is blacklisted
      const isBlacklisted = await this.#blacklistService.isTokenBlacklisted(accessToken);
      if (isBlacklisted) {
        throw new AppError(
          'Token has been revoked',
          401,
          ERROR_CODES.INVALID_TOKEN
        );
      }

      // Verify access token
      const payload = await this.#tokenService.verifyAccessToken(accessToken);

      // Get user
      const user = await User.findById(payload.userId).populate('organizations.organizationId');
      if (!user || user.accountStatus.status !== 'active') {
        throw new AppError(
          'User not found or inactive',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR
        );
      }

      // Get session
      const session = await this.#sessionService.getActiveSessionByUserId(payload.userId);
      if (!session || session.expiresAt < new Date()) {
        throw new AppError(
          'Session expired',
          401,
          ERROR_CODES.SESSION_EXPIRED
        );
      }

      // Check permissions if required
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

      // Update activity if requested
      if (updateActivity) {
        await this.#updateLastActivity(user);
        await this.#sessionService.updateSessionActivity(session._id);
      }

      return {
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

    } catch (error) {
      logger.error('Session validation failed', {
        error: error.message
      });
      throw error;
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * @private
   * Validates IP restrictions
   */
  async #validateIPRestrictions(ipAddress) {
    if (this.#config.ipWhitelist.length > 0) {
      if (!this.#config.ipWhitelist.includes(ipAddress)) {
        throw new AppError(
          'Access denied from this IP address',
          403,
          ERROR_CODES.FORBIDDEN
        );
      }
    }

    if (this.#config.ipBlacklist.includes(ipAddress)) {
      throw new AppError(
        'Access denied from this IP address',
        403,
        ERROR_CODES.FORBIDDEN
      );
    }
  }

  /**
   * @private
   * Checks rate limiting
   */
  async #checkRateLimit(identifier, ipAddress) {
    if (!this.#config.enableRateLimiting) return;

    const identifierKey = `auth_rate_limit:${identifier}`;
    const ipKey = `auth_rate_limit:ip:${ipAddress}`;

    const [identifierAttempts, ipAttempts] = await Promise.all([
      this.#cacheService.get(identifierKey) || 0,
      this.#cacheService.get(ipKey) || 0
    ]);

    if (identifierAttempts >= this.#config.rateLimitMaxAttempts) {
      throw new AppError(
        'Too many authentication attempts for this account',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR
      );
    }

    if (ipAttempts >= this.#config.rateLimitMaxAttempts * 3) {
      throw new AppError(
        'Too many authentication attempts from this IP',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR
      );
    }

    await Promise.all([
      this.#cacheService.set(identifierKey, identifierAttempts + 1, this.#config.rateLimitWindow / 1000),
      this.#cacheService.set(ipKey, ipAttempts + 1, this.#config.rateLimitWindow / 1000)
    ]);
  }

  /**
   * @private
   * Finds user for login
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
   * Validates account status
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

    // Check if account is locked
    if (user.security?.loginAttempts?.lockedUntil) {
      const lockExpiry = new Date(user.security.loginAttempts.lockedUntil);
      if (lockExpiry > new Date()) {
        throw new AppError(
          `Account is locked until ${lockExpiry.toISOString()}`,
          403,
          ERROR_CODES.ACCOUNT_LOCKED
        );
      } else {
        // Unlock account
        user.security.loginAttempts.lockedUntil = null;
        user.security.loginAttempts.count = 0;
        await user.save();
      }
    }

    if (this.#config.requireEmailVerification && !user.verification?.email?.verified) {
      throw new AppError(
        'Email verification required',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED
      );
    }
  }

  /**
   * @private
   * Handles failed login attempt
   */
  async #handleFailedLogin(user, context, correlationId, reason = 'Invalid credentials') {
    if (!user.security) user.security = {};
    if (!user.security.loginAttempts) user.security.loginAttempts = { count: 0 };

    user.security.loginAttempts.count = (user.security.loginAttempts.count || 0) + 1;
    user.security.loginAttempts.lastAttemptAt = new Date();

    if (user.security.loginAttempts.count >= this.#config.maxLoginAttempts) {
      user.security.loginAttempts.lockedUntil = new Date(Date.now() + this.#config.lockoutDuration);
      
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.ACCOUNT_LOCKED,
        user,
        context,
        correlationId
      );
    }

    await user.save();

    await this.#auditEvent(
      AuthService.#AUTH_EVENTS.LOGIN_FAILED,
      user,
      { ...context, reason },
      correlationId
    );
  }

  /**
   * @private
   * Validates concurrent sessions
   */
  async #validateConcurrentSessions(userId) {
    if (!this.#config.allowMultipleSessions) {
      await this.#sessionService.terminateAllUserSessions(userId);
      return;
    }

    const activeSessions = await this.#sessionService.getActiveUserSessions(userId);
    if (activeSessions.length >= this.#config.maxConcurrentSessions) {
      // Terminate oldest session
      const oldestSession = activeSessions.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      )[0];
      await this.#sessionService.terminateSession(oldestSession._id);
    }
  }

  /**
   * @private
   * Generates authentication tokens
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
   * Generates temporary token for 2FA
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
   * Gets available 2FA methods for user
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

    // Default TOTP if user has 2FA enabled but no specific methods
    if (user.mfa?.enabled && methods.length === 0) {
      methods.push('totp');
    }

    return methods;
  }

  /**
   * @private
   * Verifies 2FA code
   */
  async #verify2FACode(user, code) {
    if (user.mfa?.methods && user.mfa.methods.length > 0) {
      // Try each enabled method
      for (const method of user.mfa.methods) {
        if (method.enabled) {
          const isValid = await this.#twoFactorService.verifyCode(method, code);
          if (isValid) return true;
        }
      }
      return false;
    }

    // Fallback to legacy TOTP
    if (user.mfa?.enabled && user.mfa?.secret) {
      return await this.#twoFactorService.verifyTOTP(user.mfa.secret, code);
    }

    return false;
  }

  /**
   * @private
   * Resets failed login attempts
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
   * Updates last login information
   */
  async #updateLastLogin(user, context) {
    user.lastLoginAt = new Date();
    user.lastActivity = new Date();
    user.lastLoginIP = context.ipAddress;
    await user.save();
  }

  /**
   * @private
   * Updates last activity
   */
  async #updateLastActivity(user) {
    user.lastActivity = new Date();
    await user.save();
  }

  /**
   * @private
   * Checks if password has expired
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
   * Sanitizes user object for response
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
   * Extracts user permissions from roles and organizations
   */
  #extractUserPermissions(user) {
    const permissions = new Set();

    // Add role-based permissions
    if (user.roles) {
      user.roles.forEach(role => {
        permissions.add(`role:${role}`);
      });
    }

    // Add organization-based permissions
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
   * Generates unique username from email
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
   * Validates invitation code
   */
  async #validateInvitationCode(invitationCode, email) {
    // Implementation would check invitation code validity
    // This could be against an invitations collection
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
   * Marks invitation as used
   */
  async #markInvitationUsed(invitationCode, userId) {
    // Update invitation status
    await this.#cacheService.delete(`invitation:${invitationCode}`);
    
    // Could also update database record if invitations are stored there
    logger.info('Invitation code used', {
      invitationCode,
      userId
    });
  }

  /**
   * @private
   * Sends verification email
   */
  async #sendVerificationEmail(user, token) {
    const verificationUrl = `${this.#config.appUrl}/auth/verify-email?token=${token}`;
    
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
   * Sends welcome email
   */
  async #sendWelcomeEmail(user) {
    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Welcome to our platform',
        template: 'welcome',
        data: {
          firstName: user.profile?.firstName || 'User',
          loginUrl: `${this.#config.appUrl}/auth/login`
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
   * Sends password reset email
   */
  async #sendPasswordResetEmail(user, token) {
    const resetUrl = `${this.#config.appUrl}/auth/reset-password?token=${token}`;
    
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
   * Sends password change confirmation
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
   * Sends account activated email
   */
  async #sendAccountActivatedEmail(user) {
    try {
      await this.#emailService.sendEmail({
        to: user.email,
        subject: 'Account Activated',
        template: 'account-activated',
        data: {
          firstName: user.profile?.firstName || 'User',
          loginUrl: `${this.#config.appUrl}/auth/login`
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
   * Records audit event
   */
  async #auditEvent(event, user, context, correlationId) {
    if (!this.#config.enableAuditLog) return;

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

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

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
    logger.info('AuthService configuration updated', newConfig);
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const checks = await Promise.all([
        this.#tokenService.getHealthStatus().catch(() => ({ healthy: false })),
        this.#sessionService.getHealthStatus().catch(() => ({ healthy: false })),
        this.#blacklistService.getHealthStatus().catch(() => ({ healthy: false }))
      ]);

      const healthy = checks.every(check => check.healthy);

      return {
        healthy,
        service: 'AuthService',
        timestamp: new Date(),
        checks: {
          tokenService: checks[0],
          sessionService: checks[1],
          blacklistService: checks[2]
        }
      };
    } catch (error) {
      logger.error('Auth service health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'AuthService',
        timestamp: new Date(),
        error: error.message
      };
    }
  }
}

module.exports = AuthService;