'use strict';

/**
 * @fileoverview Google OAuth authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/google-strategy
 * @requires module:passport-google-oauth20
 * @requires module:shared/lib/auth/strategies/oauth-strategy
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/integrations/social/google-api
 */

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const BaseOAuthStrategy = require('./oauth-strategy');
const GoogleAPI = require('../../integrations/social/google-api');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class GoogleAuthStrategy
 * @extends BaseOAuthStrategy
 * @description Google OAuth authentication strategy with enterprise features
 */
class GoogleAuthStrategy extends BaseOAuthStrategy {
  /**
   * @private
   * @type {GoogleAPI}
   */
  #googleAPI;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #GOOGLE_CONFIG = {
    provider: 'google',
    authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenURL: 'https://oauth2.googleapis.com/token',
    scope: [
      'profile',
      'email',
      'openid'
    ],
    accessType: 'offline',
    prompt: 'consent',
    includeGrantedScopes: true,
    features: {
      fetchWorkspaceInfo: false,
      validateDomain: false,
      allowedDomains: [],
      blockConsumerAccounts: false,
      fetchGoogleProfile: true,
      syncProfilePhoto: true
    },
    advanced: {
      hostedDomain: null, // Restrict to specific G Suite domain
      loginHint: null, // Pre-fill email
      includeGrantedScopes: true,
      accessType: 'offline', // Get refresh token
      approvalPrompt: 'auto'
    },
    security: {
      validateEmailVerified: true,
      requireWorkspaceAccount: false,
      checkAccountAge: false,
      minimumAccountAgeDays: 0
    }
  };

  /**
   * Creates Google strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    const mergedConfig = {
      ...GoogleAuthStrategy.#GOOGLE_CONFIG,
      ...config,
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || GoogleAuthStrategy.#handleNewGoogleUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onAccountLinked: config.callbacks?.onAccountLinked,
        onAuthError: config.callbacks?.onAuthError
      }
    };

    super(mergedConfig, ...Object.values(services));
    
    this.#googleAPI = services.googleAPI || new GoogleAPI({
      scopes: mergedConfig.scope,
      accessType: mergedConfig.accessType
    });

    logger.info('GoogleAuthStrategy initialized', {
      scope: mergedConfig.scope,
      hostedDomain: mergedConfig.advanced.hostedDomain,
      blockConsumerAccounts: mergedConfig.features.blockConsumerAccounts
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {GoogleStrategy} Configured Google strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      clientID: process.env.GOOGLE_CLIENT_ID || config.clientID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || config.clientSecret,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || config.callbackURL || '/auth/google/callback',
      scope: config.scope,
      passReqToCallback: true,
      state: true,
      accessType: config.accessType,
      prompt: config.prompt,
      includeGrantedScopes: config.includeGrantedScopes
    };

    // Add advanced options if configured
    if (config.advanced.hostedDomain) {
      options.hd = config.advanced.hostedDomain;
      options.hostedDomain = config.advanced.hostedDomain;
    }

    if (config.advanced.loginHint) {
      options.loginHint = config.advanced.loginHint;
    }

    // Validate required configuration
    if (!options.clientID || !options.clientSecret) {
      throw new AppError(
        'Google OAuth configuration missing',
        500,
        ERROR_CODES.OAUTH_CONFIG_MISSING,
        { provider: 'google' }
      );
    }

    return new GoogleStrategy(options, async (req, accessToken, refreshToken, profile, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        // Validate Google-specific requirements
        await this.#validateGoogleAccount(profile, correlationId);

        // Enhance profile with additional Google data
        const enhancedProfile = await this.#enhanceGoogleProfile(
          profile,
          accessToken,
          correlationId
        );

        // Check domain restrictions
        if (config.features.validateDomain) {
          await this.#validateDomainRestrictions(enhancedProfile, correlationId);
        }

        // Use base OAuth strategy callback handler
        const baseStrategy = super.getStrategy({
          ...options,
          skipUserProfile: true
        });

        // Process through base strategy
        return baseStrategy._verify(req, accessToken, refreshToken, enhancedProfile, done);

      } catch (error) {
        logger.error('Google authentication failed', {
          correlationId,
          error: error.message,
          duration: Date.now() - startTime
        });

        return done(error, false);
      }
    });
  }

  /**
   * @private
   * Validates Google account requirements
   */
  async #validateGoogleAccount(profile, correlationId) {
    const config = this.getConfig();

    // Check email verification
    if (config.security.validateEmailVerified && !profile._json.email_verified) {
      throw new AppError(
        'Google account email not verified',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        { correlationId, email: profile._json.email }
      );
    }

    // Check for workspace account
    if (config.security.requireWorkspaceAccount) {
      const isWorkspaceAccount = profile._json.hd || 
                                this.#isWorkspaceEmail(profile._json.email);
      
      if (!isWorkspaceAccount) {
        throw new AppError(
          'Google Workspace account required',
          403,
          ERROR_CODES.OAUTH_WORKSPACE_REQUIRED,
          { correlationId }
        );
      }
    }

    // Block consumer accounts if configured
    if (config.features.blockConsumerAccounts) {
      const isConsumerAccount = this.#isConsumerEmail(profile._json.email);
      
      if (isConsumerAccount) {
        throw new AppError(
          'Consumer Google accounts not allowed',
          403,
          ERROR_CODES.OAUTH_CONSUMER_BLOCKED,
          { correlationId }
        );
      }
    }

    return true;
  }

  /**
   * @private
   * Enhances Google profile with additional data
   */
  async #enhanceGoogleProfile(profile, accessToken, correlationId) {
    const enhancedProfile = { ...profile };
    const config = this.getConfig();

    try {
      // Add Google-specific data
      enhancedProfile._json.google_id = profile.id;
      enhancedProfile._json.is_workspace_account = !!profile._json.hd;
      enhancedProfile._json.hosted_domain = profile._json.hd;
      enhancedProfile._json.locale = profile._json.locale;
      
      // Parse name components if available
      if (profile.name) {
        enhancedProfile._json.full_name = profile.displayName;
        enhancedProfile._json.formatted_name = `${profile.name.givenName} ${profile.name.familyName}`;
      }

      // Fetch additional profile data if enabled
      if (config.features.fetchGoogleProfile) {
        const additionalData = await this.#fetchAdditionalProfileData(
          accessToken,
          correlationId
        );
        Object.assign(enhancedProfile._json, additionalData);
      }

      // Process profile photo
      if (config.features.syncProfilePhoto && profile.photos?.[0]) {
        enhancedProfile._json.profile_photo_url = this.#getHighResPhotoUrl(
          profile.photos[0].value
        );
      }

      logger.debug('Google profile enhanced', {
        correlationId,
        userId: profile.id,
        isWorkspace: enhancedProfile._json.is_workspace_account,
        domain: enhancedProfile._json.hosted_domain
      });

    } catch (error) {
      logger.error('Failed to enhance Google profile', {
        correlationId,
        error: error.message,
        userId: profile.id
      });
    }

    return enhancedProfile;
  }

  /**
   * @private
   * Validates domain restrictions
   */
  async #validateDomainRestrictions(profile, correlationId) {
    const config = this.getConfig();
    const allowedDomains = config.features.allowedDomains || [];

    if (allowedDomains.length === 0) {
      return true;
    }

    const userDomain = profile._json.hd || 
                      profile._json.email?.split('@')[1];

    if (!userDomain) {
      throw new AppError(
        'Unable to determine user domain',
        403,
        ERROR_CODES.OAUTH_DOMAIN_INVALID,
        { correlationId }
      );
    }

    const isDomainAllowed = allowedDomains.some(domain => 
      domain.toLowerCase() === userDomain.toLowerCase()
    );

    if (!isDomainAllowed) {
      throw new AppError(
        'Email domain not allowed',
        403,
        ERROR_CODES.OAUTH_DOMAIN_RESTRICTED,
        { 
          correlationId,
          userDomain,
          allowedDomains
        }
      );
    }

    return true;
  }

  /**
   * @private
   * Fetches additional profile data from Google
   */
  async #fetchAdditionalProfileData(accessToken, correlationId) {
    try {
      const profileData = await this.#googleAPI.getUserProfile(accessToken);
      
      return {
        google_plus_url: profileData.url,
        cover_photo_url: profileData.cover?.coverPhoto?.url,
        tagline: profileData.tagline,
        about_me: profileData.aboutMe,
        occupation: profileData.occupation,
        skills: profileData.skills,
        birthday: profileData.birthday,
        gender: profileData.gender,
        relationship_status: profileData.relationshipStatus,
        organizations: profileData.organizations?.map(org => ({
          name: org.name,
          title: org.title,
          type: org.type,
          primary: org.primary
        }))
      };
    } catch (error) {
      logger.debug('Could not fetch additional Google profile data', {
        correlationId,
        error: error.message
      });
      return {};
    }
  }

  /**
   * @private
   * Checks if email is from Google Workspace
   */
  #isWorkspaceEmail(email) {
    if (!email) return false;
    
    const consumerDomains = ['gmail.com', 'googlemail.com'];
    const domain = email.split('@')[1];
    
    return !consumerDomains.includes(domain.toLowerCase());
  }

  /**
   * @private
   * Checks if email is consumer account
   */
  #isConsumerEmail(email) {
    if (!email) return false;
    
    const consumerDomains = ['gmail.com', 'googlemail.com'];
    const domain = email.split('@')[1];
    
    return consumerDomains.includes(domain.toLowerCase());
  }

  /**
   * @private
   * Gets high resolution photo URL
   */
  #getHighResPhotoUrl(photoUrl) {
    if (!photoUrl) return null;
    
    // Google photo URLs can have size parameters
    // Remove size parameter to get original
    return photoUrl.replace(/\?sz=\d+/, '?sz=400');
  }

  /**
   * Extracts provider-specific data from profile
   * @param {Object} profile - Google profile
   * @param {string} accessToken - Access token
   * @returns {Object} Provider-specific data
   */
  async extractProviderSpecificData(profile, accessToken) {
    return {
      googleId: profile.id,
      googleEmail: profile._json.email,
      googleEmailVerified: profile._json.email_verified,
      googleName: profile.displayName,
      googleGivenName: profile.name?.givenName,
      googleFamilyName: profile.name?.familyName,
      googlePicture: this.#getHighResPhotoUrl(profile._json.picture),
      googleLocale: profile._json.locale,
      googleHostedDomain: profile._json.hd,
      isGoogleWorkspace: !!profile._json.hd,
      googleProfileUrl: profile._json.link || profile._json.url,
      additionalData: profile._json.additionalData || {}
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || GoogleAuthStrategy.#GOOGLE_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @static
   * Default handler for new Google users
   */
  static async #handleNewGoogleUser(user, profileData, req) {
    logger.info('New Google user registered', {
      userId: user._id,
      googleId: profileData.googleId,
      email: profileData.googleEmail,
      isWorkspace: profileData.isGoogleWorkspace,
      domain: profileData.googleHostedDomain
    });

    // Handle workspace-specific initialization
    if (profileData.isGoogleWorkspace && profileData.googleHostedDomain) {
      // Could trigger workspace-specific workflows
      logger.debug('Google Workspace user detected', {
        userId: user._id,
        domain: profileData.googleHostedDomain
      });
    }
  }
}

// Export factory function
module.exports = (config) => {
  const strategy = new GoogleAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.GoogleAuthStrategy = GoogleAuthStrategy;