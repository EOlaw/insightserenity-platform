'use strict';

/**
 * @fileoverview Microsoft OAuth authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/microsoft-strategy
 * @requires module:passport-azure-ad-oauth2
 * @requires module:shared/lib/auth/strategies/oauth-strategy
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/integrations/social/microsoft-api
 */

const OAuth2Strategy = require('passport-azure-ad-oauth2').Strategy;
const BaseOAuthStrategy = require('./oauth-strategy');
const MicrosoftAPI = require('../../integrations/social/microsoft-api');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class MicrosoftAuthStrategy
 * @extends BaseOAuthStrategy
 * @description Microsoft OAuth authentication strategy with Azure AD integration
 */
class MicrosoftAuthStrategy extends BaseOAuthStrategy {
  /**
   * @private
   * @type {MicrosoftAPI}
   */
  #microsoftAPI;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #MICROSOFT_CONFIG = {
    provider: 'microsoft',
    authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userProfileURL: 'https://graph.microsoft.com/v1.0/me',
    userPhotoURL: 'https://graph.microsoft.com/v1.0/me/photo/$value',
    scope: ['openid', 'profile', 'email', 'User.Read', 'User.ReadBasic.All'],
    scopeSeparator: ' ',
    headers: {
      'User-Agent': 'InsightSerenity-Platform'
    },
    customHeaders: {
      Accept: 'application/json'
    },
    features: {
      fetchProfile: true,
      fetchPhoto: false,
      fetchManager: false,
      fetchDirectReports: false,
      fetchGroups: true,
      validateTenantMembership: false,
      requiredTenants: [],
      allowedTenants: [],
      fetchCalendar: false,
      fetchTeams: false
    },
    tenant: 'common', // 'common', 'organizations', 'consumers', or specific tenant ID
    prompt: 'select_account', // 'login', 'none', 'consent', 'select_account'
    rateLimit: {
      maxRequests: 10000,
      perHour: true,
      trackUsage: true
    }
  };

  /**
   * Creates Microsoft strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    const mergedConfig = {
      ...MicrosoftAuthStrategy.#MICROSOFT_CONFIG,
      ...config,
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || MicrosoftAuthStrategy.#handleNewMicrosoftUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onAccountLinked: config.callbacks?.onAccountLinked,
        onAuthError: config.callbacks?.onAuthError
      }
    };

    super(mergedConfig, ...Object.values(services));
    
    this.#microsoftAPI = services.microsoftAPI || new MicrosoftAPI({
      userAgent: mergedConfig.headers['User-Agent'],
      rateLimit: mergedConfig.rateLimit
    });

    logger.info('MicrosoftAuthStrategy initialized', {
      scope: mergedConfig.scope,
      tenant: mergedConfig.tenant,
      fetchProfile: mergedConfig.features.fetchProfile,
      fetchGroups: mergedConfig.features.fetchGroups
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {OAuth2Strategy} Configured Microsoft strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      clientID: process.env.MICROSOFT_CLIENT_ID || config.clientID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || config.clientSecret,
      callbackURL: process.env.MICROSOFT_CALLBACK_URL || config.callbackURL || '/auth/microsoft/callback',
      scope: config.scope,
      scopeSeparator: config.scopeSeparator,
      customHeaders: config.customHeaders,
      passReqToCallback: true,
      tenant: config.tenant,
      resource: 'https://graph.microsoft.com/',
      prompt: config.prompt
    };

    // Validate required configuration
    if (!options.clientID || !options.clientSecret) {
      throw new AppError(
        'Microsoft OAuth configuration missing',
        500,
        ERROR_CODES.OAUTH_CONFIG_MISSING,
        { provider: 'microsoft' }
      );
    }

    return new OAuth2Strategy(options, async (req, accessToken, refreshToken, params, profile, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        // Get user profile from Microsoft Graph
        const enhancedProfile = await this.#enhanceMicrosoftProfile(
          profile,
          accessToken,
          params,
          correlationId
        );

        // Validate tenant membership if required
        if (config.features.validateTenantMembership) {
          await this.#validateTenantMembership(
            enhancedProfile,
            accessToken,
            correlationId
          );
        }

        // Use base OAuth strategy callback handler
        const baseStrategy = super.getStrategy({
          ...options,
          skipUserProfile: true // We already have the profile
        });

        // Process through base strategy
        return baseStrategy._verify(req, accessToken, refreshToken, enhancedProfile, done);

      } catch (error) {
        logger.error('Microsoft authentication failed', {
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
   * Enhances Microsoft profile with additional data
   */
  async #enhanceMicrosoftProfile(profile, accessToken, params, correlationId) {
    const config = this.getConfig();

    try {
      // Get detailed profile from Microsoft Graph
      const userProfile = await this.#microsoftAPI.getUserProfile(accessToken);
      
      // Construct enhanced profile
      const enhancedProfile = {
        id: userProfile.id,
        username: userProfile.userPrincipalName,
        displayName: userProfile.displayName,
        name: {
          familyName: userProfile.surname,
          givenName: userProfile.givenName
        },
        emails: [
          {
            value: userProfile.mail || userProfile.userPrincipalName,
            verified: true
          }
        ],
        photos: [],
        provider: 'microsoft',
        _raw: JSON.stringify(userProfile),
        _json: {
          ...userProfile,
          microsoft_created_at: new Date().toISOString(),
          access_token: accessToken,
          refresh_token: params.refresh_token,
          expires_in: params.expires_in,
          token_type: params.token_type
        }
      };

      // Fetch user photo if enabled
      if (config.features.fetchPhoto) {
        try {
          const photoUrl = await this.#fetchMicrosoftPhoto(accessToken, correlationId);
          if (photoUrl) {
            enhancedProfile.photos.push({ value: photoUrl });
            enhancedProfile._json.photo_url = photoUrl;
          }
        } catch (error) {
          logger.debug('Failed to fetch Microsoft photo', {
            correlationId,
            error: error.message
          });
        }
      }

      // Fetch user groups if enabled
      if (config.features.fetchGroups) {
        const groups = await this.#fetchMicrosoftGroups(accessToken, correlationId);
        enhancedProfile._json.groups = groups;
      }

      // Fetch manager if enabled
      if (config.features.fetchManager) {
        const manager = await this.#fetchMicrosoftManager(accessToken, correlationId);
        enhancedProfile._json.manager = manager;
      }

      // Fetch direct reports if enabled
      if (config.features.fetchDirectReports) {
        const directReports = await this.#fetchMicrosoftDirectReports(accessToken, correlationId);
        enhancedProfile._json.directReports = directReports;
      }

      logger.debug('Microsoft profile enhanced', {
        correlationId,
        userId: userProfile.id,
        hasPhoto: !!enhancedProfile._json.photo_url,
        groupsCount: enhancedProfile._json.groups?.length || 0,
        hasManager: !!enhancedProfile._json.manager
      });

      return enhancedProfile;

    } catch (error) {
      logger.error('Failed to enhance Microsoft profile', {
        correlationId,
        error: error.message
      });
      // Continue with basic profile if enhancement fails
      return profile;
    }
  }

  /**
   * @private
   * Fetches user's Microsoft photo
   */
  async #fetchMicrosoftPhoto(accessToken, correlationId) {
    try {
      return await this.#microsoftAPI.getUserPhoto(accessToken);
    } catch (error) {
      logger.debug('Failed to fetch Microsoft photo', {
        correlationId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * @private
   * Fetches user's Microsoft groups
   */
  async #fetchMicrosoftGroups(accessToken, correlationId) {
    try {
      const response = await this.#microsoftAPI.getUserGroups(accessToken);
      
      return response.value?.map(group => ({
        id: group.id,
        displayName: group.displayName,
        description: group.description,
        mail: group.mail,
        groupTypes: group.groupTypes
      })) || [];
    } catch (error) {
      logger.error('Failed to fetch Microsoft groups', {
        correlationId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * @private
   * Fetches user's manager
   */
  async #fetchMicrosoftManager(accessToken, correlationId) {
    try {
      const manager = await this.#microsoftAPI.getUserManager(accessToken);
      
      return manager ? {
        id: manager.id,
        displayName: manager.displayName,
        userPrincipalName: manager.userPrincipalName,
        mail: manager.mail
      } : null;
    } catch (error) {
      logger.debug('Failed to fetch Microsoft manager', {
        correlationId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * @private
   * Fetches user's direct reports
   */
  async #fetchMicrosoftDirectReports(accessToken, correlationId) {
    try {
      const response = await this.#microsoftAPI.getUserDirectReports(accessToken);
      
      return response.value?.map(report => ({
        id: report.id,
        displayName: report.displayName,
        userPrincipalName: report.userPrincipalName,
        mail: report.mail
      })) || [];
    } catch (error) {
      logger.debug('Failed to fetch Microsoft direct reports', {
        correlationId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * @private
   * Validates tenant membership
   */
  async #validateTenantMembership(profile, accessToken, correlationId) {
    const config = this.getConfig();
    const requiredTenants = config.features.requiredTenants;
    const allowedTenants = config.features.allowedTenants;

    if (!requiredTenants?.length && !allowedTenants?.length) {
      return true;
    }

    const userTenantId = profile._json.tid || profile._json.tenantId;

    if (requiredTenants?.length > 0) {
      const hasRequiredTenant = requiredTenants.includes(userTenantId);
      if (!hasRequiredTenant) {
        throw new AppError(
          'User is not a member of required Microsoft tenant',
          403,
          ERROR_CODES.OAUTH_TENANT_MEMBERSHIP_REQUIRED,
          { 
            correlationId,
            requiredTenants,
            userTenant: userTenantId
          }
        );
      }
    }

    if (allowedTenants?.length > 0) {
      const hasAllowedTenant = allowedTenants.includes(userTenantId);
      if (!hasAllowedTenant) {
        throw new AppError(
          'User tenant is not in allowed Microsoft tenants list',
          403,
          ERROR_CODES.OAUTH_TENANT_NOT_ALLOWED,
          { 
            correlationId,
            allowedTenants,
            userTenant: userTenantId
          }
        );
      }
    }

    return true;
  }

  /**
   * Extracts provider-specific data from profile
   * @param {Object} profile - Microsoft profile
   * @param {string} accessToken - Access token
   * @returns {Object} Provider-specific data
   */
  async extractProviderSpecificData(profile, accessToken) {
    return {
      microsoftId: profile.id,
      microsoftUsername: profile.username,
      microsoftDisplayName: profile.displayName,
      microsoftUserPrincipalName: profile._json.userPrincipalName,
      microsoftMail: profile._json.mail,
      microsoftJobTitle: profile._json.jobTitle,
      microsoftDepartment: profile._json.department,
      microsoftOfficeLocation: profile._json.officeLocation,
      microsoftCompanyName: profile._json.companyName,
      microsoftBusinessPhones: profile._json.businessPhones,
      microsoftMobilePhone: profile._json.mobilePhone,
      microsoftPreferredLanguage: profile._json.preferredLanguage,
      microsoftTenantId: profile._json.tid || profile._json.tenantId,
      microsoftAccountEnabled: profile._json.accountEnabled,
      microsoftPhotoUrl: profile._json.photo_url,
      groups: profile._json.groups,
      manager: profile._json.manager,
      directReports: profile._json.directReports
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || MicrosoftAuthStrategy.#MICROSOFT_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `microsoft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @static
   * Default handler for new Microsoft users
   */
  static async #handleNewMicrosoftUser(user, profileData, req) {
    logger.info('New Microsoft user registered', {
      userId: user._id,
      microsoftId: profileData.microsoftId,
      displayName: profileData.microsoftDisplayName,
      tenantId: profileData.microsoftTenantId,
      hasGroups: (profileData.groups?.length || 0) > 0
    });

    // Additional Microsoft-specific initialization
    if (profileData.microsoftTenantId) {
      // Could trigger tenant-specific workflows
    }
  }
}

module.exports = MicrosoftAuthStrategy;

// Export factory function
module.exports = (config) => {
  const strategy = new MicrosoftAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.MicrosoftAuthStrategy = MicrosoftAuthStrategy;