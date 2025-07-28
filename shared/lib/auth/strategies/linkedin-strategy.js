'use strict';

/**
 * @fileoverview LinkedIn OAuth authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/linkedin-strategy
 * @requires module:passport-linkedin-oauth2
 * @requires module:shared/lib/auth/strategies/oauth-strategy
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/integrations/social/linkedin-api
 */

const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const BaseOAuthStrategy = require('./oauth-strategy');
const LinkedInAPI = require('../../integrations/social/linkedin-api');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class LinkedInAuthStrategy
 * @extends BaseOAuthStrategy
 * @description LinkedIn OAuth authentication strategy with enterprise features
 */
class LinkedInAuthStrategy extends BaseOAuthStrategy {
  /**
   * @private
   * @type {LinkedInAPI}
   */
  #linkedinAPI;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #LINKEDIN_CONFIG = {
    provider: 'linkedin',
    authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
    profileURL: 'https://api.linkedin.com/v2/me',
    emailURL: 'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
    scope: [
      'r_liteprofile',
      'r_emailaddress',
      'w_member_social'
    ],
    profileFields: [
      'id',
      'first-name',
      'last-name',
      'email-address',
      'headline',
      'picture-url',
      'picture-urls::(original)',
      'public-profile-url',
      'location',
      'industry',
      'positions',
      'summary'
    ],
    state: true,
    features: {
      fetchFullProfile: true,
      fetchConnections: false,
      fetchCompanyInfo: true,
      syncProfilePhoto: true,
      trackProfessionalData: true,
      validateProfessionalEmail: false
    },
    professional: {
      minimumConnections: 0,
      requiredIndustries: [],
      requiredPositionKeywords: [],
      blockRecruiters: false
    },
    api: {
      version: 'v2',
      format: 'json',
      headers: {
        'X-Restli-Protocol-Version': '2.0.0',
        'Accept': 'application/json'
      }
    }
  };

  /**
   * Creates LinkedIn strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    const mergedConfig = {
      ...LinkedInAuthStrategy.#LINKEDIN_CONFIG,
      ...config,
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || LinkedInAuthStrategy.#handleNewLinkedInUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onAccountLinked: config.callbacks?.onAccountLinked,
        onAuthError: config.callbacks?.onAuthError
      }
    };

    super(mergedConfig, ...Object.values(services));
    
    this.#linkedinAPI = services.linkedinAPI || new LinkedInAPI({
      apiVersion: mergedConfig.api.version,
      headers: mergedConfig.api.headers
    });

    logger.info('LinkedInAuthStrategy initialized', {
      scope: mergedConfig.scope,
      fetchFullProfile: mergedConfig.features.fetchFullProfile,
      trackProfessionalData: mergedConfig.features.trackProfessionalData
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {LinkedInStrategy} Configured LinkedIn strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      clientID: process.env.LINKEDIN_CLIENT_ID || config.clientID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || config.clientSecret,
      callbackURL: process.env.LINKEDIN_CALLBACK_URL || config.callbackURL || '/auth/linkedin/callback',
      scope: config.scope,
      passReqToCallback: true,
      state: config.state,
      profileFields: config.profileFields
    };

    // Validate required configuration
    if (!options.clientID || !options.clientSecret) {
      throw new AppError(
        'LinkedIn OAuth configuration missing',
        500,
        ERROR_CODES.OAUTH_CONFIG_MISSING,
        { provider: 'linkedin' }
      );
    }

    return new LinkedInStrategy(options, async (req, accessToken, refreshToken, profile, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        // LinkedIn v2 API returns limited data, enhance it
        const enhancedProfile = await this.#enhanceLinkedInProfile(
          profile,
          accessToken,
          correlationId
        );

        // Validate professional requirements if configured
        if (config.professional.minimumConnections > 0) {
          await this.#validateProfessionalRequirements(
            enhancedProfile,
            accessToken,
            correlationId
          );
        }

        // Use base OAuth strategy callback handler
        const baseStrategy = super.getStrategy({
          ...options,
          skipUserProfile: true
        });

        // Process through base strategy
        return baseStrategy._verify(req, accessToken, refreshToken, enhancedProfile, done);

      } catch (error) {
        logger.error('LinkedIn authentication failed', {
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
   * Enhances LinkedIn profile with additional data
   */
  async #enhanceLinkedInProfile(profile, accessToken, correlationId) {
    const enhancedProfile = { ...profile };
    const config = this.getConfig();

    try {
      // LinkedIn v2 API requires separate calls for different data
      
      // Fetch email if not included
      if (!enhancedProfile.emails?.length) {
        const emailData = await this.#fetchLinkedInEmail(accessToken, correlationId);
        if (emailData) {
          enhancedProfile.emails = [{
            value: emailData.email,
            type: 'primary'
          }];
          enhancedProfile._json.email = emailData.email;
        }
      }

      // Fetch full profile data if enabled
      if (config.features.fetchFullProfile) {
        const fullProfile = await this.#fetchFullProfile(accessToken, correlationId);
        Object.assign(enhancedProfile._json, fullProfile);
      }

      // Fetch company information if enabled
      if (config.features.fetchCompanyInfo && enhancedProfile._json.positions?.values?.length > 0) {
        enhancedProfile._json.currentCompanies = await this.#extractCompanyInfo(
          enhancedProfile._json.positions.values
        );
      }

      // Process profile photo
      if (config.features.syncProfilePhoto) {
        enhancedProfile._json.profilePhotoUrl = this.#extractProfilePhoto(enhancedProfile);
      }

      // Add professional metadata
      if (config.features.trackProfessionalData) {
        enhancedProfile._json.professionalData = {
          headline: enhancedProfile._json.headline,
          industry: enhancedProfile._json.industry,
          currentPosition: this.#getCurrentPosition(enhancedProfile._json.positions),
          yearsOfExperience: this.#calculateExperience(enhancedProfile._json.positions),
          skills: enhancedProfile._json.skills?.values?.map(s => s.skill.name) || []
        };
      }

      logger.debug('LinkedIn profile enhanced', {
        correlationId,
        userId: profile.id,
        hasEmail: !!enhancedProfile._json.email,
        hasCompanyInfo: !!enhancedProfile._json.currentCompanies,
        hasProfessionalData: !!enhancedProfile._json.professionalData
      });

    } catch (error) {
      logger.error('Failed to enhance LinkedIn profile', {
        correlationId,
        error: error.message,
        userId: profile.id
      });
    }

    return enhancedProfile;
  }

  /**
   * @private
   * Fetches LinkedIn email address
   */
  async #fetchLinkedInEmail(accessToken, correlationId) {
    try {
      const response = await this.#linkedinAPI.getEmailAddress(accessToken);
      
      if (response.elements && response.elements.length > 0) {
        const primaryEmail = response.elements.find(e => e['handle~'].emailAddress);
        return {
          email: primaryEmail['handle~'].emailAddress,
          verified: true // LinkedIn emails are pre-verified
        };
      }
    } catch (error) {
      logger.error('Failed to fetch LinkedIn email', {
        correlationId,
        error: error.message
      });
    }
    return null;
  }

  /**
   * @private
   * Fetches full LinkedIn profile
   */
  async #fetchFullProfile(accessToken, correlationId) {
    try {
      const profile = await this.#linkedinAPI.getFullProfile(accessToken);
      
      return {
        linkedinId: profile.id,
        vanityName: profile.vanityName,
        localizedHeadline: profile.localizedHeadline,
        localizedFirstName: profile.firstName?.localized?.en_US,
        localizedLastName: profile.lastName?.localized?.en_US,
        profilePicture: profile.profilePicture?.displayImage,
        industry: profile.industryName?.localized?.en_US,
        summary: profile.summary?.localized?.en_US,
        locationName: profile.location?.basicLocation?.city,
        countryCode: profile.location?.basicLocation?.countryCode,
        publicProfileUrl: `https://www.linkedin.com/in/${profile.vanityName || profile.id}`
      };
    } catch (error) {
      logger.error('Failed to fetch full LinkedIn profile', {
        correlationId,
        error: error.message
      });
      return {};
    }
  }

  /**
   * @private
   * Validates professional requirements
   */
  async #validateProfessionalRequirements(profile, accessToken, correlationId) {
    const config = this.getConfig();

    // Check minimum connections
    if (config.professional.minimumConnections > 0) {
      const connections = await this.#getConnectionCount(accessToken, correlationId);
      if (connections < config.professional.minimumConnections) {
        throw new AppError(
          'Insufficient LinkedIn connections',
          403,
          ERROR_CODES.OAUTH_PROFESSIONAL_REQUIREMENTS,
          { 
            correlationId,
            required: config.professional.minimumConnections,
            actual: connections
          }
        );
      }
    }

    // Check required industries
    if (config.professional.requiredIndustries?.length > 0) {
      const userIndustry = profile._json.industry?.toLowerCase();
      const hasRequiredIndustry = config.professional.requiredIndustries.some(
        industry => industry.toLowerCase() === userIndustry
      );

      if (!hasRequiredIndustry) {
        throw new AppError(
          'Industry requirement not met',
          403,
          ERROR_CODES.OAUTH_PROFESSIONAL_REQUIREMENTS,
          { 
            correlationId,
            requiredIndustries: config.professional.requiredIndustries,
            userIndustry
          }
        );
      }
    }

    // Check position keywords
    if (config.professional.requiredPositionKeywords?.length > 0) {
      const currentPosition = this.#getCurrentPosition(profile._json.positions);
      const positionText = `${currentPosition?.title} ${currentPosition?.company}`.toLowerCase();
      
      const hasRequiredKeyword = config.professional.requiredPositionKeywords.some(
        keyword => positionText.includes(keyword.toLowerCase())
      );

      if (!hasRequiredKeyword) {
        throw new AppError(
          'Position requirement not met',
          403,
          ERROR_CODES.OAUTH_PROFESSIONAL_REQUIREMENTS,
          { correlationId }
        );
      }
    }

    // Validate professional email if required
    if (config.features.validateProfessionalEmail) {
      const email = profile._json.email;
      if (!email || this.#isPersonalEmail(email)) {
        throw new AppError(
          'Professional email required',
          403,
          ERROR_CODES.OAUTH_PROFESSIONAL_EMAIL_REQUIRED,
          { correlationId }
        );
      }
    }
  }

  /**
   * @private
   * Gets connection count
   */
  async #getConnectionCount(accessToken, correlationId) {
    try {
      const response = await this.#linkedinAPI.getConnectionCount(accessToken);
      return response.numConnections || 0;
    } catch (error) {
      logger.error('Failed to get LinkedIn connection count', {
        correlationId,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * @private
   * Extracts company information
   */
  async #extractCompanyInfo(positions) {
    if (!positions || positions.length === 0) return [];

    return positions
      .filter(p => p.isCurrent)
      .map(position => ({
        id: position.company?.id,
        name: position.company?.name,
        industry: position.company?.industry,
        size: position.company?.size,
        type: position.company?.type,
        position: position.title,
        startDate: position.startDate,
        location: position.location
      }));
  }

  /**
   * @private
   * Gets current position
   */
  #getCurrentPosition(positions) {
    if (!positions?.values?.length) return null;

    const current = positions.values.find(p => p.isCurrent);
    if (current) {
      return {
        title: current.title,
        company: current.company?.name,
        startDate: current.startDate,
        location: current.location
      };
    }

    // Return most recent if no current position
    return positions.values[0];
  }

  /**
   * @private
   * Calculates years of experience
   */
  #calculateExperience(positions) {
    if (!positions?.values?.length) return 0;

    const sortedPositions = positions.values.sort((a, b) => {
      const aDate = new Date(a.startDate?.year || 0, a.startDate?.month || 0);
      const bDate = new Date(b.startDate?.year || 0, b.startDate?.month || 0);
      return aDate - bDate;
    });

    const firstPosition = sortedPositions[0];
    if (!firstPosition?.startDate?.year) return 0;

    const startYear = firstPosition.startDate.year;
    const currentYear = new Date().getFullYear();
    
    return currentYear - startYear;
  }

  /**
   * @private
   * Extracts profile photo URL
   */
  #extractProfilePhoto(profile) {
    // Try different photo sources
    if (profile.photos?.length > 0) {
      return profile.photos[0].value;
    }

    if (profile._json.pictureUrl) {
      return profile._json.pictureUrl;
    }

    if (profile._json['picture-urls']?.values?.length > 0) {
      return profile._json['picture-urls'].values[0];
    }

    if (profile._json.profilePicture?.displayImage) {
      return profile._json.profilePicture.displayImage;
    }

    return null;
  }

  /**
   * @private
   * Checks if email is personal
   */
  #isPersonalEmail(email) {
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'protonmail.com', 'mail.com'
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    return personalDomains.includes(domain);
  }

  /**
   * Extracts provider-specific data from profile
   * @param {Object} profile - LinkedIn profile
   * @param {string} accessToken - Access token
   * @returns {Object} Provider-specific data
   */
  async extractProviderSpecificData(profile, accessToken) {
    return {
      linkedinId: profile.id,
      linkedinUrl: profile._json.publicProfileUrl,
      linkedinVanityName: profile._json.vanityName,
      headline: profile._json.headline || profile._json.localizedHeadline,
      industry: profile._json.industry,
      location: profile._json.locationName,
      countryCode: profile._json.countryCode,
      summary: profile._json.summary,
      positions: profile._json.positions,
      currentCompanies: profile._json.currentCompanies,
      professionalData: profile._json.professionalData,
      profilePhotoUrl: profile._json.profilePhotoUrl,
      connectionCount: profile._json.numConnections,
      isPremium: profile._json.premiumAccount || false
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || LinkedInAuthStrategy.#LINKEDIN_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `linkedin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @static
   * Default handler for new LinkedIn users
   */
  static async #handleNewLinkedInUser(user, profileData, req) {
    logger.info('New LinkedIn user registered', {
      userId: user._id,
      linkedinId: profileData.linkedinId,
      industry: profileData.industry,
      hasCurrentPosition: !!profileData.professionalData?.currentPosition,
      yearsOfExperience: profileData.professionalData?.yearsOfExperience
    });

    // Could trigger professional network-specific workflows
    if (profileData.professionalData?.currentPosition) {
      logger.debug('Professional user detected', {
        userId: user._id,
        position: profileData.professionalData.currentPosition.title,
        company: profileData.professionalData.currentPosition.company
      });
    }
  }
}

// Export factory function
module.exports = (config) => {
  const strategy = new LinkedInAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.LinkedInAuthStrategy = LinkedInAuthStrategy;