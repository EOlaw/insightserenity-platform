'use strict';

/**
 * @fileoverview Base OAuth authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/oauth-strategy
 * @requires module:passport-oauth2
 * @requires module:shared/lib/auth/services/auth-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/oauth-provider-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 */

const OAuth2Strategy = require('passport-oauth2');
const AuthService = require('../services/auth-service');
const UserModel = require('../../database/models/users/user-model');
const OrganizationModel = require('../../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model');
const OAuthProviderModel = require('../../database/models/oauth-provider-model');
const CacheService = require('../../services/cache-service');
const EmailService = require('../../services/email-service');
const AuditService = require('../../security/audit/audit-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class BaseOAuthStrategy
 * @description Base OAuth authentication strategy with enterprise security features
 */
class BaseOAuthStrategy {
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
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #stateValidation;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    provider: 'oauth',
    scope: ['profile', 'email'],
    passReqToCallback: true,
    state: true,
    proxy: false,
    skipUserProfile: false,
    security: {
      validateState: true,
      stateExpiry: 600000, // 10 minutes
      enforceHttps: process.env.NODE_ENV === 'production',
      allowUnverifiedEmail: false,
      requireOrganizationMatch: false
    },
    user: {
      autoCreateAccount: true,
      autoLinkAccounts: true,
      mergeStrategy: 'email', // 'email' or 'provider_id'
      defaultRole: 'user',
      requireEmailVerification: false
    },
    cache: {
      stateCacheTTL: 600, // 10 minutes
      profileCacheTTL: 300 // 5 minutes
    },
    audit: {
      logAuthAttempts: true,
      logAccountCreation: true,
      logAccountLinking: true,
      logStateValidation: true
    },
    callbacks: {
      onNewUser: null,
      onExistingUser: null,
      onAccountLinked: null,
      onAuthError: null
    }
  };

  /**
   * Creates base OAuth strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {AuthService} [authService] - Auth service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EmailService} [emailService] - Email service instance
   * @param {AuditService} [auditService] - Audit service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   */
  constructor(
    config = {},
    authService,
    cacheService,
    emailService,
    auditService,
    encryptionService
  ) {
    this.#config = { ...BaseOAuthStrategy.#DEFAULT_CONFIG, ...config };
    this.#authService = authService || new AuthService();
    this.#cacheService = cacheService || new CacheService();
    this.#emailService = emailService || new EmailService();
    this.#auditService = auditService || new AuditService();
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#stateValidation = new Map();

    logger.info('BaseOAuthStrategy initialized', {
      provider: this.#config.provider,
      autoCreateAccount: this.#config.user.autoCreateAccount,
      autoLinkAccounts: this.#config.user.autoLinkAccounts
    });
  }

  /**
   * Gets OAuth strategy configuration
   * @param {Object} oauthConfig - OAuth provider configuration
   * @returns {OAuth2Strategy} Configured OAuth strategy
   */
  getStrategy(oauthConfig) {
    const options = {
      ...oauthConfig,
      passReqToCallback: this.#config.passReqToCallback,
      state: this.#config.state,
      proxy: this.#config.proxy,
      scope: this.#config.scope,
      skipUserProfile: this.#config.skipUserProfile
    };

    const strategy = new OAuth2Strategy(options, async (req, accessToken, refreshToken, profile, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Validate state parameter
        if (this.#config.security.validateState && req.query.state) {
          await this.#validateState(req.query.state, req, correlationId);
        }

        // Process OAuth callback
        const result = await this.#processOAuthCallback(
          req,
          accessToken,
          refreshToken,
          profile,
          correlationId
        );

        logger.info('OAuth authentication successful', {
          correlationId,
          provider: this.#config.provider,
          userId: result.user._id,
          isNewUser: result.isNewUser,
          duration: Date.now() - startTime
        });

        return done(null, result.user, result.info);

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('OAuth authentication failed', {
          correlationId,
          provider: this.#config.provider,
          error: error.message,
          duration
        });

        // Call error callback if provided
        if (this.#config.callbacks.onAuthError) {
          await this.#config.callbacks.onAuthError(error, req, correlationId);
        }

        return done(error, false);
      }
    });

    // Override getOAuthAccessToken for custom token handling
    strategy.getOAuthAccessToken = this.#getOAuthAccessToken.bind(this, strategy);

    return strategy;
  }

  /**
   * Generates and stores state parameter for CSRF protection
   * @param {Object} req - Express request object
   * @param {Object} [metadata] - Additional state metadata
   * @returns {Promise<string>} State parameter
   */
  async generateState(req, metadata = {}) {
    const correlationId = req.correlationId || this.#generateCorrelationId();
    const state = this.#generateSecureToken();
    
    const stateData = {
      state,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      timestamp: Date.now(),
      correlationId,
      metadata
    };

    // Store in cache
    const cacheKey = `oauth_state:${state}`;
    await this.#cacheService.set(cacheKey, stateData, this.#config.cache.stateCacheTTL);

    // Also store in memory for quick validation
    this.#stateValidation.set(state, stateData);

    logger.debug('OAuth state generated', {
      correlationId,
      provider: this.#config.provider,
      hasMetadata: Object.keys(metadata).length > 0
    });

    return state;
  }

  /**
   * @private
   * Processes OAuth callback
   */
  async #processOAuthCallback(req, accessToken, refreshToken, profile, correlationId) {
    // Extract profile data
    const profileData = await this.#extractProfileData(profile, accessToken, correlationId);

    // Find or create user
    let user;
    let isNewUser = false;
    let accountLinked = false;

    // Check if user exists
    const existingUser = await this.#findExistingUser(profileData, req, correlationId);

    if (existingUser) {
      // Update existing user
      user = await this.#updateExistingUser(
        existingUser,
        profileData,
        accessToken,
        refreshToken,
        correlationId
      );

      // Call existing user callback
      if (this.#config.callbacks.onExistingUser) {
        await this.#config.callbacks.onExistingUser(user, profileData, req);
      }
    } else if (this.#config.user.autoCreateAccount) {
      // Create new user
      const createResult = await this.#createNewUser(
        profileData,
        accessToken,
        refreshToken,
        req,
        correlationId
      );
      user = createResult.user;
      isNewUser = createResult.isNewUser;
      accountLinked = createResult.accountLinked;

      // Call appropriate callback
      if (isNewUser && this.#config.callbacks.onNewUser) {
        await this.#config.callbacks.onNewUser(user, profileData, req);
      } else if (accountLinked && this.#config.callbacks.onAccountLinked) {
        await this.#config.callbacks.onAccountLinked(user, profileData, req);
      }
    } else {
      throw new AppError(
        'No account found and auto-creation is disabled',
        403,
        ERROR_CODES.OAUTH_ACCOUNT_NOT_FOUND,
        { correlationId, provider: this.#config.provider }
      );
    }

    // Validate user status
    await this.#validateUserStatus(user, correlationId);

    // Store OAuth tokens securely
    await this.#storeOAuthTokens(user._id, accessToken, refreshToken, correlationId);

    // Audit OAuth login
    if (this.#config.audit.logAuthAttempts) {
      await this.#auditOAuthLogin(req, user, profileData, isNewUser, correlationId);
    }

    return {
      user,
      isNewUser,
      accountLinked,
      info: {
        provider: this.#config.provider,
        profileId: profileData.id,
        isNewUser,
        accountLinked
      }
    };
  }

  /**
   * @private
   * Extracts profile data from OAuth response
   */
  async #extractProfileData(profile, accessToken, correlationId) {
    const profileData = {
      id: profile.id,
      provider: this.#config.provider,
      email: this.#extractEmail(profile),
      emailVerified: this.#extractEmailVerified(profile),
      displayName: profile.displayName || profile.name?.formatted,
      firstName: profile.name?.givenName || profile.given_name,
      lastName: profile.name?.familyName || profile.family_name,
      username: profile.username || profile.login,
      photos: profile.photos || [],
      locale: profile._json?.locale || profile.locale,
      raw: profile._json || profile._raw
    };

    // Provider-specific extraction (override in subclasses)
    if (this.extractProviderSpecificData) {
      Object.assign(profileData, await this.extractProviderSpecificData(profile, accessToken));
    }

    // Cache profile data
    const cacheKey = `oauth_profile:${this.#config.provider}:${profileData.id}`;
    await this.#cacheService.set(cacheKey, profileData, this.#config.cache.profileCacheTTL);

    return profileData;
  }

  /**
   * @private
   * Finds existing user
   */
  async #findExistingUser(profileData, req, correlationId) {
    // First, check by OAuth provider ID
    let user = await UserModel.findOne({
      'oauthProviders.provider': this.#config.provider,
      'oauthProviders.providerId': profileData.id
    })
    .populate('roles')
    .populate('permissions')
    .lean();

    if (user) {
      return user;
    }

    // If auto-linking is enabled, check by email
    if (this.#config.user.autoLinkAccounts && profileData.email) {
      const query = {
        email: profileData.email
      };

      // Add organization context if required
      if (this.#config.security.requireOrganizationMatch) {
        const organizationId = await this.#extractOrganizationContext(req, correlationId);
        if (organizationId) {
          query.organizationId = organizationId;
        }
      }

      user = await UserModel.findOne(query)
        .populate('roles')
        .populate('permissions')
        .lean();

      return user;
    }

    return null;
  }

  /**
   * @private
   * Updates existing user with OAuth data
   */
  async #updateExistingUser(user, profileData, accessToken, refreshToken, correlationId) {
    const updateData = {
      lastLogin: new Date(),
      lastLoginMethod: this.#config.provider
    };

    // Check if OAuth provider needs to be added
    const hasProvider = user.oauthProviders?.some(
      p => p.provider === this.#config.provider && p.providerId === profileData.id
    );

    if (!hasProvider) {
      updateData.$push = {
        oauthProviders: {
          provider: this.#config.provider,
          providerId: profileData.id,
          email: profileData.email,
          displayName: profileData.displayName,
          profileUrl: profileData.raw?.html_url || profileData.raw?.link,
          avatarUrl: profileData.photos?.[0]?.value,
          raw: profileData.raw,
          connectedAt: new Date()
        }
      };
    } else {
      // Update existing provider data
      updateData.$set = {
        'oauthProviders.$[elem].lastUsedAt': new Date(),
        'oauthProviders.$[elem].displayName': profileData.displayName,
        'oauthProviders.$[elem].avatarUrl': profileData.photos?.[0]?.value
      };
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      user._id,
      updateData,
      {
        new: true,
        runValidators: true,
        arrayFilters: hasProvider ? [{ 'elem.provider': this.#config.provider }] : undefined
      }
    )
    .populate('roles')
    .populate('permissions')
    .lean();

    return updatedUser;
  }

  /**
   * @private
   * Creates new user from OAuth profile
   */
  async #createNewUser(profileData, accessToken, refreshToken, req, correlationId) {
    // Check for existing user by email for linking
    let existingUser = null;
    if (this.#config.user.autoLinkAccounts && profileData.email) {
      existingUser = await UserModel.findOne({ email: profileData.email }).lean();
    }

    if (existingUser) {
      // Link to existing account
      const linkedUser = await this.#linkOAuthAccount(existingUser, profileData, correlationId);
      return { user: linkedUser, isNewUser: false, accountLinked: true };
    }

    // Extract organization context
    const organizationId = await this.#extractOrganizationContext(req, correlationId);

    // Generate username if not provided
    const username = profileData.username || 
                    await this.#generateUniqueUsername(profileData, correlationId);

    // Create new user
    const userData = {
      email: profileData.email,
      username,
      displayName: profileData.displayName,
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      isEmailVerified: profileData.emailVerified || !this.#config.user.requireEmailVerification,
      locale: profileData.locale,
      roles: [this.#config.user.defaultRole],
      organizationId,
      registrationMethod: this.#config.provider,
      oauthProviders: [{
        provider: this.#config.provider,
        providerId: profileData.id,
        email: profileData.email,
        displayName: profileData.displayName,
        profileUrl: profileData.raw?.html_url || profileData.raw?.link,
        avatarUrl: profileData.photos?.[0]?.value,
        raw: profileData.raw,
        connectedAt: new Date()
      }],
      lastLogin: new Date(),
      lastLoginMethod: this.#config.provider
    };

    const newUser = await UserModel.create(userData);

    // Populate user data
    const populatedUser = await UserModel.findById(newUser._id)
      .populate('roles')
      .populate('permissions')
      .lean();

    // Send welcome email if configured
    if (profileData.email && this.#config.user.sendWelcomeEmail) {
      this.#sendWelcomeEmail(populatedUser, correlationId).catch(err =>
        logger.error('Failed to send welcome email', { error: err.message })
      );
    }

    // Audit account creation
    if (this.#config.audit.logAccountCreation) {
      await this.#auditAccountCreation(req, populatedUser, profileData, correlationId);
    }

    return { user: populatedUser, isNewUser: true, accountLinked: false };
  }

  /**
   * @private
   * Links OAuth account to existing user
   */
  async #linkOAuthAccount(user, profileData, correlationId) {
    const linkedUser = await UserModel.findByIdAndUpdate(
      user._id,
      {
        $push: {
          oauthProviders: {
            provider: this.#config.provider,
            providerId: profileData.id,
            email: profileData.email,
            displayName: profileData.displayName,
            profileUrl: profileData.raw?.html_url || profileData.raw?.link,
            avatarUrl: profileData.photos?.[0]?.value,
            raw: profileData.raw,
            connectedAt: new Date()
          }
        },
        lastLogin: new Date(),
        lastLoginMethod: this.#config.provider
      },
      { new: true, runValidators: true }
    )
    .populate('roles')
    .populate('permissions')
    .lean();

    // Audit account linking
    if (this.#config.audit.logAccountLinking) {
      await this.#auditService.logEvent({
        event: 'oauth.account_linked',
        userId: user._id,
        organizationId: user.organizationId,
        correlationId,
        metadata: {
          provider: this.#config.provider,
          providerId: profileData.id,
          email: profileData.email
        }
      });
    }

    return linkedUser;
  }

  /**
   * @private
   * Validates state parameter
   */
  async #validateState(state, req, correlationId) {
    if (!state) {
      throw new AppError(
        'Missing state parameter',
        400,
        ERROR_CODES.OAUTH_STATE_MISSING,
        { correlationId }
      );
    }

    // Check cache
    const cacheKey = `oauth_state:${state}`;
    const stateData = await this.#cacheService.get(cacheKey);

    if (!stateData) {
      // Check memory store as fallback
      const memoryData = this.#stateValidation.get(state);
      if (!memoryData) {
        throw new AppError(
          'Invalid or expired state parameter',
          400,
          ERROR_CODES.OAUTH_STATE_INVALID,
          { correlationId }
        );
      }
    }

    // Validate state age
    const stateAge = Date.now() - (stateData?.timestamp || 0);
    if (stateAge > this.#config.security.stateExpiry) {
      throw new AppError(
        'State parameter expired',
        400,
        ERROR_CODES.OAUTH_STATE_EXPIRED,
        { correlationId }
      );
    }

    // Clean up
    await this.#cacheService.delete(cacheKey);
    this.#stateValidation.delete(state);

    // Audit state validation
    if (this.#config.audit.logStateValidation) {
      await this.#auditService.logEvent({
        event: 'oauth.state_validated',
        correlationId,
        metadata: {
          provider: this.#config.provider,
          stateAge,
          ipMatch: (stateData?.ipAddress === req.ip)
        }
      });
    }
  }

  /**
   * @private
   * Validates user status
   */
  async #validateUserStatus(user, correlationId) {
    if (!user.isActive) {
      throw new AppError(
        'User account is inactive',
        403,
        ERROR_CODES.ACCOUNT_INACTIVE,
        { correlationId }
      );
    }

    if (user.isLocked) {
      throw new AppError(
        'User account is locked',
        403,
        ERROR_CODES.ACCOUNT_LOCKED,
        { correlationId }
      );
    }

    if (!this.#config.security.allowUnverifiedEmail && !user.isEmailVerified) {
      throw new AppError(
        'Email verification required',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        { correlationId }
      );
    }
  }

  /**
   * @private
   * Stores OAuth tokens securely
   */
  async #storeOAuthTokens(userId, accessToken, refreshToken, correlationId) {
    try {
      const encryptedTokens = {
        accessToken: await this.#encryptionService.encrypt(accessToken),
        refreshToken: refreshToken ? await this.#encryptionService.encrypt(refreshToken) : null
      };

      await OAuthProviderModel.findOneAndUpdate(
        {
          userId,
          provider: this.#config.provider
        },
        {
          ...encryptedTokens,
          lastRefreshed: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Failed to store OAuth tokens', {
        correlationId,
        userId,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Extracts organization context
   */
  async #extractOrganizationContext(req, correlationId) {
    // From subdomain
    const subdomain = req.hostname.split('.')[0];
    if (subdomain && subdomain !== 'www') {
      const org = await OrganizationModel.findOne({ 
        slug: subdomain,
        isActive: true 
      }).lean();
      if (org) return org._id;
    }

    // From session
    if (req.session?.organizationId) {
      return req.session.organizationId;
    }

    // From header
    if (req.headers['x-organization-id']) {
      return req.headers['x-organization-id'];
    }

    return null;
  }

  /**
   * @private
   * Generates unique username
   */
  async #generateUniqueUsername(profileData, correlationId) {
    let baseUsername = profileData.email?.split('@')[0] || 
                      profileData.displayName?.toLowerCase().replace(/\s+/g, '') ||
                      `user_${this.#config.provider}`;

    // Remove invalid characters
    baseUsername = baseUsername.replace(/[^a-zA-Z0-9_-]/g, '');

    let username = baseUsername;
    let suffix = 0;

    while (await UserModel.exists({ username })) {
      suffix++;
      username = `${baseUsername}${suffix}`;
    }

    return username;
  }

  /**
   * @private
   * Sends welcome email
   */
  async #sendWelcomeEmail(user, correlationId) {
    await this.#emailService.sendTemplate('welcome-oauth', {
      to: user.email,
      data: {
        displayName: user.displayName || user.firstName || user.username,
        provider: this.#config.provider,
        loginUrl: `${process.env.APP_URL}/login`
      }
    });
  }

  /**
   * @private
   * Custom OAuth access token retrieval
   */
  async #getOAuthAccessToken(strategy, code, params, callback) {
    // Add custom parameters if needed
    const customParams = {
      ...params,
      client_id: strategy._oauth2._clientId,
      client_secret: strategy._oauth2._clientSecret
    };

    // Call original method
    return strategy._oauth2.getOAuthAccessToken(code, customParams, callback);
  }

  /**
   * @private
   * Extracts email from profile
   */
  #extractEmail(profile) {
    if (profile.emails?.length > 0) {
      return profile.emails[0].value;
    }
    return profile._json?.email || profile.email;
  }

  /**
   * @private
   * Extracts email verification status
   */
  #extractEmailVerified(profile) {
    if (profile.emails?.length > 0) {
      return profile.emails[0].verified || false;
    }
    return profile._json?.email_verified || profile._json?.verified || false;
  }

  /**
   * @private
   * Audits OAuth login
   */
  async #auditOAuthLogin(req, user, profileData, isNewUser, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'oauth.login',
        userId: user._id,
        organizationId: user.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          provider: this.#config.provider,
          providerId: profileData.id,
          isNewUser,
          method: 'oauth',
          email: profileData.email
        }
      });
    } catch (error) {
      logger.error('Failed to audit OAuth login', { error: error.message });
    }
  }

  /**
   * @private
   * Audits account creation
   */
  async #auditAccountCreation(req, user, profileData, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'oauth.account_created',
        userId: user._id,
        organizationId: user.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          provider: this.#config.provider,
          providerId: profileData.id,
          email: profileData.email,
          method: 'oauth'
        }
      });
    } catch (error) {
      logger.error('Failed to audit account creation', { error: error.message });
    }
  }

  /**
   * @private
   * Generates secure token
   */
  #generateSecureToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `oauth_${this.#config.provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export class
module.exports = BaseOAuthStrategy;

// Also export factory function for convenience
module.exports.createOAuthStrategy = (config) => new BaseOAuthStrategy(config);