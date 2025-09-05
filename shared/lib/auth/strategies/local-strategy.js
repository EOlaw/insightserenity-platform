'use strict';

/**
 * @fileoverview Local authentication strategy for Passport.js (username/email + password)
 * @module shared/lib/auth/strategies/local-strategy
 * @requires module:passport-local
 * @requires module:shared/lib/auth/services/password-service
 * @requires module:shared/lib/auth/services/auth-service
 * @requires module:shared/lib/auth/services/two-factor-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/validators/auth-validators
 */

const { Strategy: LocalStrategy } = require('passport-local');
const PasswordService = require('../services/password-service');
const AuthService = require('../services/auth-service');
const TwoFactorService = require('../services/two-factor-service');
const UserModel = require('../../database/models/users/user-model');
const OrganizationModel = require('../../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const { validateEmail, validatePassword } = require('../../utils/validators/auth-validators');

/**
 * @class LocalAuthStrategy
 * @description Local authentication strategy with enterprise security features
 */
class LocalAuthStrategy {
  /**
   * @private
   * @type {PasswordService}
   */
  #passwordService;

  /**
   * @private
   * @type {AuthService}
   */
  #authService;

  /**
   * @private
   * @type {TwoFactorService}
   */
  #twoFactorService;

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
   * @type {Map}
   */
  #loginAttempts;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    usernameField: 'username', // Can be 'email' or 'username'
    passwordField: 'password',
    passReqToCallback: true,
    session: false,
    security: {
      maxLoginAttempts: 5,
      lockoutDuration: 900000, // 15 minutes
      checkPasswordStrength: true,
      enforcePasswordHistory: true,
      requireEmailVerification: true,
      supportOrganizationLogin: true
    },
    validation: {
      normalizeEmail: true,
      caseSensitiveUsername: false,
      trimWhitespace: true
    },
    cache: {
      userCacheTTL: 300, // 5 minutes
      attemptsCacheTTL: 900 // 15 minutes
    },
    audit: {
      logSuccessfulLogins: true,
      logFailedLogins: true,
      logAccountLockouts: true,
      logPasswordValidation: true
    },
    features: {
      support2FA: true,
      supportRememberMe: true,
      supportPasswordless: false,
      supportMultiTenant: true
    }
  };

  /**
   * Creates local strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {PasswordService} [passwordService] - Password service instance
   * @param {AuthService} [authService] - Auth service instance
   * @param {TwoFactorService} [twoFactorService] - 2FA service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    passwordService,
    authService,
    twoFactorService,
    cacheService,
    auditService
  ) {
    this.#config = { ...LocalAuthStrategy.#DEFAULT_CONFIG, ...config };
    this.#passwordService = passwordService || new PasswordService();
    this.#authService = authService || new AuthService();
    this.#twoFactorService = twoFactorService || new TwoFactorService();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#loginAttempts = new Map();

    logger.info('LocalAuthStrategy initialized', {
      usernameField: this.#config.usernameField,
      supportOrganizationLogin: this.#config.security.supportOrganizationLogin,
      support2FA: this.#config.features.support2FA
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {LocalStrategy} Configured local strategy
   */
  getStrategy() {
    const options = {
      usernameField: this.#config.usernameField,
      passwordField: this.#config.passwordField,
      passReqToCallback: this.#config.passReqToCallback,
      session: this.#config.session
    };

    return new LocalStrategy(options, async (req, username, password, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const ipAddress = req.ip || req.connection.remoteAddress;

      try {
        // Validate input
        await this.#validateInput(username, password, correlationId);

        // Normalize username/email
        const normalizedUsername = this.#normalizeUsername(username);

        // Check login attempts
        const attemptsExceeded = await this.#checkLoginAttempts(normalizedUsername, ipAddress, correlationId);
        if (attemptsExceeded) {
          throw new AppError(
            'Account temporarily locked due to multiple failed login attempts',
            429,
            ERROR_CODES.ACCOUNT_LOCKED,
            { correlationId, lockoutMinutes: this.#config.security.lockoutDuration / 60000 }
          );
        }

        // Extract organization context if multi-tenant
        const { userIdentifier, organizationId } = await this.#extractLoginContext(
          normalizedUsername,
          req,
          correlationId
        );

        // Find user
        const user = await this.#findUser(userIdentifier, organizationId, correlationId);
        if (!user) {
          await this.#handleFailedLogin(normalizedUsername, ipAddress, correlationId, 'USER_NOT_FOUND');
          throw new AppError(
            'Invalid credentials',
            401,
            ERROR_CODES.INVALID_CREDENTIALS,
            { correlationId }
          );
        }

        // Validate user status
        await this.#validateUserStatus(user, correlationId);

        // Verify password
        const isValidPassword = await this.#verifyPassword(
          password,
          user.password,
          user,
          correlationId
        );

        if (!isValidPassword) {
          await this.#handleFailedLogin(normalizedUsername, ipAddress, correlationId, 'INVALID_PASSWORD', user);
          throw new AppError(
            'Invalid credentials',
            401,
            ERROR_CODES.INVALID_CREDENTIALS,
            { correlationId }
          );
        }

        // Check password expiry
        if (this.#config.security.enforcePasswordHistory) {
          await this.#checkPasswordExpiry(user, correlationId);
        }

        // Handle 2FA if enabled
        if (this.#config.features.support2FA && user.twoFactorEnabled) {
          const pendingAuth = await this.#initiate2FA(user, req, correlationId);
          return done(null, false, { 
            require2FA: true, 
            challengeId: pendingAuth.challengeId,
            userId: user._id 
          });
        }

        // Clear login attempts on success
        await this.#clearLoginAttempts(normalizedUsername, ipAddress);

        // Update user login metadata
        await this.#updateLoginMetadata(user, req);

        // Audit successful login
        if (this.#config.audit.logSuccessfulLogins) {
          await this.#auditLogin(req, user, true, correlationId);
        }

        logger.info('Local authentication successful', {
          correlationId,
          userId: user._id,
          duration: Date.now() - startTime
        });

        return done(null, user);

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('Local authentication failed', {
          correlationId,
          error: error.message,
          duration
        });

        return done(error, false);
      }
    });
  }

  /**
   * @private
   * Validates input credentials
   */
  async #validateInput(username, password, correlationId) {
    if (!username || !password) {
      throw new AppError(
        'Username and password are required',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { correlationId }
      );
    }

    // Validate based on field type
    if (this.#config.usernameField === 'email') {
      const emailValidation = validateEmail(username);
      if (!emailValidation.isValid) {
        throw new AppError(
          'Invalid email format',
          400,
          ERROR_CODES.INVALID_EMAIL,
          { correlationId, errors: emailValidation.errors }
        );
      }
    }

    // Basic password validation
    if (password.length < 8) {
      throw new AppError(
        'Invalid credentials',
        401,
        ERROR_CODES.INVALID_CREDENTIALS,
        { correlationId }
      );
    }
  }

  /**
   * @private
   * Normalizes username/email
   */
  #normalizeUsername(username) {
    let normalized = username;

    if (this.#config.validation.trimWhitespace) {
      normalized = normalized.trim();
    }

    if (this.#config.usernameField === 'email' && this.#config.validation.normalizeEmail) {
      normalized = normalized.toLowerCase();
    } else if (!this.#config.validation.caseSensitiveUsername) {
      normalized = normalized.toLowerCase();
    }

    return normalized;
  }

  /**
   * @private
   * Checks login attempts
   */
  async #checkLoginAttempts(identifier, ipAddress, correlationId) {
    const attemptKey = `login_attempts:${identifier}:${ipAddress}`;
    
    // Check cache
    const attempts = await this.#cacheService.get(attemptKey) || 0;
    
    if (attempts >= this.#config.security.maxLoginAttempts) {
      logger.warn('Login attempts exceeded', {
        correlationId,
        identifier,
        ipAddress,
        attempts
      });
      return true;
    }

    return false;
  }

  /**
   * @private
   * Extracts login context for multi-tenant
   */
  async #extractLoginContext(username, req, correlationId) {
    let userIdentifier = username;
    let organizationId = null;

    // Check for organization context in various places
    if (this.#config.features.supportMultiTenant && this.#config.security.supportOrganizationLogin) {
      // From subdomain
      const subdomain = req.hostname.split('.')[0];
      if (subdomain && subdomain !== 'www') {
        const org = await OrganizationModel.findOne({ 
          slug: subdomain,
          isActive: true 
        }).lean();
        if (org) {
          organizationId = org._id;
        }
      }

      // From header
      if (!organizationId && req.headers['x-organization-id']) {
        organizationId = req.headers['x-organization-id'];
      }

      // From body
      if (!organizationId && req.body.organizationId) {
        organizationId = req.body.organizationId;
      }

      // From username format (user@organization)
      if (!organizationId && username.includes('@') && username.split('@').length === 3) {
        const parts = username.split('@');
        userIdentifier = `${parts[0]}@${parts[1]}`;
        const orgSlug = parts[2];
        
        const org = await OrganizationModel.findOne({ 
          slug: orgSlug,
          isActive: true 
        }).lean();
        if (org) {
          organizationId = org._id;
        }
      }
    }

    return { userIdentifier, organizationId };
  }

  /**
   * @private
   * Finds user in database
   */
  async #findUser(identifier, organizationId, correlationId) {
    const cacheKey = `local_user:${identifier}:${organizationId || 'default'}`;
    
    // Check cache
    const cachedUser = await this.#cacheService.get(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    // Build query
    const query = {
      $or: [
        { email: identifier },
        { username: identifier }
      ],
      isDeleted: { $ne: true }
    };

    if (organizationId) {
      query.organizationId = organizationId;
    }

    // Find user
    const user = await UserModel.findOne(query)
      .select('+password +twoFactorSecret +passwordHistory')
      .populate('roles')
      .populate('permissions')
      .populate({
        path: 'organizationId',
        select: 'name slug isActive subscription'
      })
      .lean();

    if (user) {
      // Don't cache user with sensitive data
      const userToCache = { ...user };
      delete userToCache.password;
      delete userToCache.twoFactorSecret;
      await this.#cacheService.set(cacheKey, userToCache, this.#config.cache.userCacheTTL);
    }

    return user;
  }

  /**
   * @private
   * Validates user status
   */
  async #validateUserStatus(user, correlationId) {
    if (!user.isActive) {
      throw new AppError(
        'Account is inactive',
        403,
        ERROR_CODES.ACCOUNT_INACTIVE,
        { correlationId }
      );
    }

    if (user.isLocked) {
      throw new AppError(
        'Account is locked',
        403,
        ERROR_CODES.ACCOUNT_LOCKED,
        { correlationId }
      );
    }

    if (this.#config.security.requireEmailVerification && !user.isEmailVerified) {
      throw new AppError(
        'Email verification required',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        { correlationId, email: user.email }
      );
    }

    // Check organization status if applicable
    if (user.organizationId && typeof user.organizationId === 'object') {
      if (!user.organizationId.isActive) {
        throw new AppError(
          'Organization is inactive',
          403,
          ERROR_CODES.ORGANIZATION_INACTIVE,
          { correlationId }
        );
      }
    }
  }

  /**
   * @private
   * Verifies password
   */
  async #verifyPassword(plainPassword, hashedPassword, user, correlationId) {
    const isValid = await this.#passwordService.verifyPassword(plainPassword, hashedPassword);

    if (this.#config.audit.logPasswordValidation) {
      await this.#auditService.logEvent({
        event: 'password.validation',
        userId: user._id,
        organizationId: user.organizationId,
        correlationId,
        metadata: {
          success: isValid,
          method: 'local'
        }
      });
    }

    return isValid;
  }

  /**
   * @private
   * Checks password expiry
   */
  async #checkPasswordExpiry(user, correlationId) {
    const passwordAge = Date.now() - new Date(user.passwordChangedAt || user.createdAt).getTime();
    const maxPasswordAge = this.#config.security.maxPasswordAge || 7776000000; // 90 days

    if (passwordAge > maxPasswordAge) {
      logger.warn('Password expired', {
        correlationId,
        userId: user._id,
        passwordAge: Math.floor(passwordAge / 86400000) // days
      });

      // Update user to require password change
      await UserModel.findByIdAndUpdate(user._id, {
        passwordChangeRequired: true
      });
    }
  }

  /**
   * @private
   * Initiates 2FA process
   */
  async #initiate2FA(user, req, correlationId) {
    const challengeId = await this.#twoFactorService.initiateChallenge({
      userId: user._id,
      method: user.twoFactorMethod || 'totp',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId
    });

    logger.info('2FA challenge initiated', {
      correlationId,
      userId: user._id,
      challengeId,
      method: user.twoFactorMethod
    });

    return { challengeId };
  }

  /**
   * @private
   * Handles failed login
   */
  async #handleFailedLogin(identifier, ipAddress, correlationId, reason, user = null) {
    const attemptKey = `login_attempts:${identifier}:${ipAddress}`;
    
    // Increment attempts
    const attempts = await this.#cacheService.increment(attemptKey);
    await this.#cacheService.expire(attemptKey, this.#config.cache.attemptsCacheTTL);

    // Audit failed login
    if (this.#config.audit.logFailedLogins) {
      await this.#auditService.logEvent({
        event: 'login.failed',
        userId: user?._id,
        organizationId: user?.organizationId,
        ipAddress,
        correlationId,
        metadata: {
          identifier,
          reason,
          attempts,
          remainingAttempts: Math.max(0, this.#config.security.maxLoginAttempts - attempts)
        }
      });
    }

    // Lock account if attempts exceeded
    if (attempts >= this.#config.security.maxLoginAttempts) {
      if (user && this.#config.audit.logAccountLockouts) {
        await this.#auditService.logSecurityEvent({
          event: 'account.locked',
          severity: 'high',
          userId: user._id,
          organizationId: user.organizationId,
          ipAddress,
          correlationId,
          metadata: {
            reason: 'excessive_login_attempts',
            lockoutDuration: this.#config.security.lockoutDuration
          }
        });
      }
    }
  }

  /**
   * @private
   * Clears login attempts
   */
  async #clearLoginAttempts(identifier, ipAddress) {
    const attemptKey = `login_attempts:${identifier}:${ipAddress}`;
    await this.#cacheService.delete(attemptKey);
  }

  /**
   * @private
   * Updates user login metadata
   */
  async #updateLoginMetadata(user, req) {
    try {
      await UserModel.findByIdAndUpdate(user._id, {
        lastLogin: new Date(),
        lastLoginIP: req.ip || req.connection.remoteAddress,
        lastLoginUserAgent: req.headers['user-agent'],
        loginCount: (user.loginCount || 0) + 1
      });
    } catch (error) {
      logger.error('Failed to update login metadata', {
        userId: user._id,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Audits login attempt
   */
  async #auditLogin(req, user, success, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: success ? 'login.success' : 'login.failed',
        userId: user._id,
        organizationId: user.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          method: 'local',
          usernameField: this.#config.usernameField,
          sessionId: req.sessionID
        }
      });
    } catch (error) {
      logger.error('Failed to audit login', { error: error.message });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = LocalAuthStrategy;
module.exports.createStrategy = (config) => {
  const strategy = new LocalAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing
module.exports.LocalAuthStrategy = LocalAuthStrategy;