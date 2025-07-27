'use strict';

/**
 * @fileoverview Main authentication orchestration service
 * @module shared/lib/auth/services/auth-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/session-model
 * @requires module:shared/lib/database/models/audit-log-model
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
const OrganizationModel = require('../../database/models/organization-model');
const SessionModel = require('../../database/models/session-model');
const AuditLogModel = require('../../database/models/audit-log-model');
const TokenService = require('./token-service');
const SessionService = require('./session-service');
const PasswordService = require('./password-service');
const TwoFactorService = require('./two-factor-service');
const BlacklistService = require('./blacklist-service');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const EmailService = require('../../services/email-service');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');

/**
 * @class AuthService
 * @description Orchestrates authentication flows including login, logout, registration,
 * password reset, and multi-factor authentication with enterprise security features
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
    ipWhitelist: [],
    ipBlacklist: [],
    enableAuditLog: true,
    enableRateLimiting: true,
    rateLimitWindow: 900000, // 15 minutes
    rateLimitMaxAttempts: 100
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
    ACCOUNT_UNLOCKED: 'auth.account.unlocked'
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
      maxConcurrentSessions: this.#config.maxConcurrentSessions
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
  async login(credentials, context) {
    const correlationId = context.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('User login attempt', {
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
      if (user.twoFactorEnabled || this.#config.require2FA) {
        if (!credentials.totpCode) {
          return {
            requiresTwoFactor: true,
            temporaryToken: await this.#tokenService.generateTemporaryToken(user._id),
            message: 'Two-factor authentication required'
          };
        }

        const is2FAValid = await this.#twoFactorService.verifyTOTP(
          user.twoFactorSecret,
          credentials.totpCode
        );

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
        organizationId: user.organizationId,
        ...tokens,
        ...context
      });

      // Reset failed attempts
      await this.#resetFailedAttempts(user);

      // Update last login
      await this.#updateLastLogin(user);

      // Audit successful login
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.LOGIN_SUCCESS,
        user,
        context,
        correlationId
      );

      const duration = Date.now() - startTime;
      logger.info('User login successful', {
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
          expiresAt: session.expiresAt
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('User login failed', {
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
   * @param {string} sessionId - Session ID
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Logout result
   * @throws {AppError} If logout fails
   */
  async logout(sessionId, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('User logout attempt', {
        correlationId,
        sessionId
      });

      // Get session
      const session = await this.#sessionService.getSession(sessionId);
      if (!session) {
        throw new AppError(
          'Session not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { correlationId }
        );
      }

      // Blacklist tokens
      await this.#blacklistService.blacklistToken(session.accessToken, 'logout');
      if (session.refreshToken) {
        await this.#blacklistService.blacklistToken(session.refreshToken, 'logout');
      }

      // Terminate session
      await this.#sessionService.terminateSession(sessionId);

      // Audit logout
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.LOGOUT,
        { _id: session.userId },
        context,
        correlationId
      );

      logger.info('User logout successful', {
        correlationId,
        userId: session.userId
      });

      return {
        success: true,
        message: 'Logged out successfully'
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
   * Registers a new user
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

      // Check existing user
      const existingUser = await User.findOne({
        email: userData.email,
        organizationId: userData.organizationId
      });

      if (existingUser) {
        throw new AppError(
          'User already exists',
          409,
          ERROR_CODES.CONFLICT,
          { correlationId }
        );
      }

      // Validate password
      await this.#passwordService.validatePasswordPolicy(
        userData.password,
        this.#config.passwordPolicy
      );

      // Hash password
      userData.password = await this.#passwordService.hashPassword(userData.password);

      // Generate verification token
      if (this.#config.requireEmailVerification) {
        userData.emailVerificationToken = await this.#tokenService.generateVerificationToken();
        userData.emailVerificationExpires = new Date(
          Date.now() + this.#config.verificationTokenDuration
        );
        userData.isEmailVerified = false;
      } else {
        userData.isEmailVerified = true;
      }

      // Create user
      const user = await User.create({
        ...userData,
        registeredAt: new Date(),
        registrationIP: context.ipAddress,
        lastActivity: new Date()
      });

      // Send verification email
      if (this.#config.requireEmailVerification) {
        await this.#sendVerificationEmail(user);
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
        userId: user._id
      });

      return {
        success: true,
        user: this.#sanitizeUser(user),
        message: this.#config.requireEmailVerification
          ? 'Registration successful. Please check your email to verify your account.'
          : 'Registration successful.'
      };

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
        email,
        organizationId,
        isActive: true
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

      // Generate reset token
      const resetToken = await this.#tokenService.generatePasswordResetToken();
      const hashedToken = await this.#passwordService.hashToken(resetToken);

      // Save reset token
      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(
        Date.now() + this.#config.passwordResetTokenDuration
      );
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
        message: 'If the email exists, a password reset link has been sent.'
      };

    } catch (error) {
      logger.error('Password reset initiation failed', {
        correlationId,
        error: error.message
      });

      // Always return generic message
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
   * @returns {Promise<Object>} Password reset result
   * @throws {AppError} If password reset fails
   */
  async resetPassword(token, newPassword, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Password reset completion attempt', {
        correlationId
      });

      // Hash token for comparison
      const hashedToken = await this.#passwordService.hashToken(token);

      // Find user with valid token
      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: new Date() }
      });

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
      await this.#passwordService.checkPasswordHistory(
        newPassword,
        user.passwordHistory || [],
        this.#config.passwordPolicy.preventReuse
      );

      // Hash new password
      const hashedPassword = await this.#passwordService.hashPassword(newPassword);

      // Update user
      user.password = hashedPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.passwordChangedAt = new Date();
      
      // Update password history
      user.passwordHistory = user.passwordHistory || [];
      user.passwordHistory.unshift({
        password: hashedPassword,
        changedAt: new Date()
      });
      user.passwordHistory = user.passwordHistory.slice(0, this.#config.passwordPolicy.preventReuse);

      await user.save();

      // Invalidate all sessions
      await this.#sessionService.terminateAllUserSessions(user._id);

      // Send confirmation email
      await this.#sendPasswordChangeConfirmation(user);

      // Audit password change
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.PASSWORD_CHANGE,
        user,
        context,
        correlationId
      );

      logger.info('Password reset successful', {
        correlationId,
        userId: user._id
      });

      return {
        success: true,
        message: 'Password reset successful. Please login with your new password.'
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
      if (!user || !user.isActive) {
        throw new AppError(
          'User not found or inactive',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId }
        );
      }

      // Get session
      const session = await this.#sessionService.getSessionByRefreshToken(refreshToken);
      if (!session) {
        throw new AppError(
          'Session not found',
          401,
          ERROR_CODES.INVALID_SESSION,
          { correlationId }
        );
      }

      // Generate new tokens
      const tokens = await this.#generateAuthTokens(user);

      // Update session
      await this.#sessionService.updateSessionTokens(session._id, tokens);

      // Blacklist old tokens
      await this.#blacklistService.blacklistToken(session.accessToken, 'refresh');
      await this.#blacklistService.blacklistToken(refreshToken, 'refresh');

      logger.info('Token refresh successful', {
        correlationId,
        userId: user._id
      });

      return {
        success: true,
        tokens
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
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        throw new AppError(
          'Invalid or expired verification token',
          400,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      // Update user
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerifiedAt = new Date();
      await user.save();

      logger.info('Email verification successful', {
        correlationId,
        userId: user._id
      });

      return {
        success: true,
        message: 'Email verified successfully'
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
   * Enables two-factor authentication
   * @param {string} userId - User ID
   * @param {Object} context - Request context
   * @returns {Promise<Object>} 2FA setup data
   * @throws {AppError} If 2FA setup fails
   */
  async enableTwoFactor(userId, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Two-factor authentication enable attempt', {
        correlationId,
        userId
      });

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError(
          'User not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { correlationId }
        );
      }

      if (user.twoFactorEnabled) {
        throw new AppError(
          'Two-factor authentication is already enabled',
          400,
          ERROR_CODES.OPERATION_NOT_ALLOWED,
          { correlationId }
        );
      }

      // Generate 2FA secret
      const { secret, qrCode, backupCodes } = await this.#twoFactorService.generateSecret(
        user.email,
        'InsightSerenity'
      );

      // Store encrypted secret temporarily
      const encryptedSecret = await this.#twoFactorService.encryptSecret(secret);
      await this.#cacheService.set(
        `2fa_setup:${userId}`,
        { secret: encryptedSecret, backupCodes },
        300 // 5 minutes
      );

      // Audit 2FA setup initiation
      await this.#auditEvent(
        'auth.2fa.setup_initiated',
        user,
        context,
        correlationId
      );

      logger.info('Two-factor authentication setup initiated', {
        correlationId,
        userId
      });

      return {
        success: true,
        qrCode,
        secret,
        backupCodes
      };

    } catch (error) {
      logger.error('Two-factor authentication setup failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Two-factor authentication setup failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Confirms two-factor authentication setup
   * @param {string} userId - User ID
   * @param {string} totpCode - TOTP verification code
   * @param {Object} context - Request context
   * @returns {Promise<Object>} 2FA confirmation result
   * @throws {AppError} If 2FA confirmation fails
   */
  async confirmTwoFactor(userId, totpCode, context = {}) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Two-factor authentication confirmation attempt', {
        correlationId,
        userId
      });

      // Get setup data from cache
      const setupData = await this.#cacheService.get(`2fa_setup:${userId}`);
      if (!setupData) {
        throw new AppError(
          'Two-factor setup session expired',
          400,
          ERROR_CODES.SESSION_EXPIRED,
          { correlationId }
        );
      }

      // Decrypt and verify secret
      const secret = await this.#twoFactorService.decryptSecret(setupData.secret);
      const isValid = await this.#twoFactorService.verifyTOTP(secret, totpCode);

      if (!isValid) {
        throw new AppError(
          'Invalid verification code',
          400,
          ERROR_CODES.INVALID_CODE,
          { correlationId }
        );
      }

      // Update user
      const user = await User.findById(userId);
      user.twoFactorEnabled = true;
      user.twoFactorSecret = setupData.secret;
      user.twoFactorBackupCodes = setupData.backupCodes;
      user.twoFactorEnabledAt = new Date();
      await user.save();

      // Clear setup data
      await this.#cacheService.delete(`2fa_setup:${userId}`);

      // Audit 2FA enabled
      await this.#auditEvent(
        AuthService.#AUTH_EVENTS.TWO_FACTOR_ENABLED,
        user,
        context,
        correlationId
      );

      logger.info('Two-factor authentication enabled', {
        correlationId,
        userId
      });

      return {
        success: true,
        message: 'Two-factor authentication enabled successfully'
      };

    } catch (error) {
      logger.error('Two-factor authentication confirmation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Two-factor authentication confirmation failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

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

    const key = `auth_rate_limit:${identifier}:${ipAddress}`;
    const attempts = await this.#cacheService.get(key) || 0;

    if (attempts >= this.#config.rateLimitMaxAttempts) {
      throw new AppError(
        'Too many authentication attempts',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR
      );
    }

    await this.#cacheService.set(
      key,
      attempts + 1,
      this.#config.rateLimitWindow / 1000
    );
  }

  /**
   * @private
   * Finds user for login
   */
  async #findUserForLogin(email, organizationId) {
    const query = { email, isActive: true };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const user = await User.findOne(query).select('+password +twoFactorSecret');
    
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
    if (!user.isActive) {
      throw new AppError(
        'Account is inactive',
        403,
        ERROR_CODES.ACCOUNT_INACTIVE
      );
    }

    if (user.isLocked) {
      const lockExpiry = new Date(user.lockedUntil);
      if (lockExpiry > new Date()) {
        throw new AppError(
          `Account is locked until ${lockExpiry.toISOString()}`,
          403,
          ERROR_CODES.ACCOUNT_LOCKED
        );
      } else {
        // Unlock account
        user.isLocked = false;
        user.lockedUntil = undefined;
        user.failedLoginAttempts = 0;
        await user.save();
      }
    }

    if (this.#config.requireEmailVerification && !user.isEmailVerified) {
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
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLoginAt = new Date();

    if (user.failedLoginAttempts >= this.#config.maxLoginAttempts) {
      user.isLocked = true;
      user.lockedUntil = new Date(Date.now() + this.#config.lockoutDuration);
      
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
    const accessToken = await this.#tokenService.generateAccessToken({
      userId: user._id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.roles,
      permissions: user.permissions
    });

    const refreshToken = await this.#tokenService.generateRefreshToken({
      userId: user._id,
      organizationId: user.organizationId
    });

    return { accessToken, refreshToken };
  }

  /**
   * @private
   * Resets failed login attempts
   */
  async #resetFailedAttempts(user) {
    user.failedLoginAttempts = 0;
    user.lastFailedLoginAt = undefined;
    await user.save();
  }

  /**
   * @private
   * Updates last login information
   */
  async #updateLastLogin(user) {
    user.lastLoginAt = new Date();
    user.lastActivity = new Date();
    await user.save();
  }

  /**
   * @private
   * Sanitizes user object for response
   */
  #sanitizeUser(user) {
    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.twoFactorSecret;
    delete sanitized.twoFactorBackupCodes;
    delete sanitized.passwordResetToken;
    delete sanitized.emailVerificationToken;
    delete sanitized.passwordHistory;
    return sanitized;
  }

  /**
   * @private
   * Sends verification email
   */
  async #sendVerificationEmail(user) {
    const verificationUrl = `${this.#config.appUrl}/auth/verify-email?token=${user.emailVerificationToken}`;
    
    await this.#emailService.sendEmail({
      to: user.email,
      subject: 'Verify your email',
      template: 'email-verification',
      data: {
        userName: user.name,
        verificationUrl
      }
    });
  }

  /**
   * @private
   * Sends password reset email
   */
  async #sendPasswordResetEmail(user, token) {
    const resetUrl = `${this.#config.appUrl}/auth/reset-password?token=${token}`;
    
    await this.#emailService.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'password-reset',
      data: {
        userName: user.name,
        resetUrl,
        expiryTime: '1 hour'
      }
    });
  }

  /**
   * @private
   * Sends password change confirmation
   */
  async #sendPasswordChangeConfirmation(user) {
    await this.#emailService.sendEmail({
      to: user.email,
      subject: 'Password Changed Successfully',
      template: 'password-change-confirmation',
      data: {
        userName: user.name,
        changeTime: new Date().toISOString()
      }
    });
  }

  /**
   * @private
   * Records audit event
   */
  async #auditEvent(event, user, context, correlationId) {
    if (!this.#config.enableAuditLog) return;

    await this.#auditService.logEvent({
      event,
      userId: user._id,
      organizationId: user.organizationId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId,
      metadata: context
    });
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const checks = await Promise.all([
        this.#tokenService.getHealthStatus(),
        this.#sessionService.getHealthStatus(),
        this.#blacklistService.getHealthStatus()
      ]);

      const healthy = checks.every(check => check.healthy);

      return {
        healthy,
        service: 'AuthService',
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
        error: error.message
      };
    }
  }
}

module.exports = AuthService;