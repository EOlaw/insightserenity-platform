'use strict';

/**
 * @fileoverview GitHub OAuth authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/github-strategy
 * @requires module:passport-github2
 * @requires module:shared/lib/auth/strategies/oauth-strategy
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/integrations/social/github-api
 */

const GitHubStrategy = require('passport-github2').Strategy;
const BaseOAuthStrategy = require('./oauth-strategy');
const GitHubAPI = require('../../integrations/social/github-api');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class GitHubAuthStrategy
 * @extends BaseOAuthStrategy
 * @description GitHub OAuth authentication strategy with enterprise features
 */
class GitHubAuthStrategy extends BaseOAuthStrategy {
  /**
   * @private
   * @type {GitHubAPI}
   */
  #githubAPI;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #GITHUB_CONFIG = {
    provider: 'github',
    authorizationURL: 'https://github.com/login/oauth/authorize',
    tokenURL: 'https://github.com/login/oauth/access_token',
    userProfileURL: 'https://api.github.com/user',
    userEmailsURL: 'https://api.github.com/user/emails',
    scope: ['user:email', 'read:user'],
    scopeSeparator: ' ',
    headers: {
      'User-Agent': 'InsightSerenity-Platform'
    },
    customHeaders: {
      Accept: 'application/vnd.github.v3+json'
    },
    features: {
      fetchPrivateEmails: true,
      fetchOrganizations: true,
      fetchRepositories: false,
      validateOrganizationMembership: false,
      requiredOrganizations: []
    },
    rateLimit: {
      maxRequests: 5000,
      perHour: true,
      trackUsage: true
    }
  };

  /**
   * Creates GitHub strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    const mergedConfig = {
      ...GitHubAuthStrategy.#GITHUB_CONFIG,
      ...config,
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || GitHubAuthStrategy.#handleNewGitHubUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onAccountLinked: config.callbacks?.onAccountLinked,
        onAuthError: config.callbacks?.onAuthError
      }
    };

    super(mergedConfig, ...Object.values(services));
    
    this.#githubAPI = services.githubAPI || new GitHubAPI({
      userAgent: mergedConfig.headers['User-Agent'],
      rateLimit: mergedConfig.rateLimit
    });

    logger.info('GitHubAuthStrategy initialized', {
      scope: mergedConfig.scope,
      fetchPrivateEmails: mergedConfig.features.fetchPrivateEmails,
      fetchOrganizations: mergedConfig.features.fetchOrganizations
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {GitHubStrategy} Configured GitHub strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      clientID: process.env.GITHUB_CLIENT_ID || config.clientID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET || config.clientSecret,
      callbackURL: process.env.GITHUB_CALLBACK_URL || config.callbackURL || '/auth/github/callback',
      scope: config.scope,
      scopeSeparator: config.scopeSeparator,
      customHeaders: config.customHeaders,
      userAgent: config.headers['User-Agent'],
      passReqToCallback: true,
      state: true,
      authorizationURL: config.authorizationURL,
      tokenURL: config.tokenURL,
      userProfileURL: config.userProfileURL
    };

    // Validate required configuration
    if (!options.clientID || !options.clientSecret) {
      throw new AppError(
        'GitHub OAuth configuration missing',
        500,
        ERROR_CODES.OAUTH_CONFIG_MISSING,
        { provider: 'github' }
      );
    }

    return new GitHubStrategy(options, async (req, accessToken, refreshToken, profile, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        // Enhance profile with additional GitHub data
        const enhancedProfile = await this.#enhanceGitHubProfile(
          profile,
          accessToken,
          correlationId
        );

        // Validate organization membership if required
        if (config.features.validateOrganizationMembership) {
          await this.#validateOrganizationMembership(
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
        logger.error('GitHub authentication failed', {
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
   * Enhances GitHub profile with additional data
   */
  async #enhanceGitHubProfile(profile, accessToken, correlationId) {
    const enhancedProfile = { ...profile };
    const config = this.getConfig();

    try {
      // Fetch private emails if enabled
      if (config.features.fetchPrivateEmails) {
        const emails = await this.#fetchGitHubEmails(accessToken, correlationId);
        enhancedProfile.emails = emails;
        
        // Set primary email if not already set
        if (!enhancedProfile._json.email) {
          const primaryEmail = emails.find(e => e.primary);
          if (primaryEmail) {
            enhancedProfile._json.email = primaryEmail.email;
            enhancedProfile._json.email_verified = primaryEmail.verified;
          }
        }
      }

      // Fetch organizations if enabled
      if (config.features.fetchOrganizations) {
        const organizations = await this.#fetchGitHubOrganizations(accessToken, correlationId);
        enhancedProfile._json.organizations = organizations;
      }

      // Add additional GitHub-specific data
      enhancedProfile._json.github_created_at = enhancedProfile._json.created_at;
      enhancedProfile._json.github_updated_at = enhancedProfile._json.updated_at;
      enhancedProfile._json.is_hireable = enhancedProfile._json.hireable || false;
      enhancedProfile._json.public_repos_count = enhancedProfile._json.public_repos || 0;
      enhancedProfile._json.followers_count = enhancedProfile._json.followers || 0;

      logger.debug('GitHub profile enhanced', {
        correlationId,
        userId: profile.id,
        hasPrivateEmail: !!enhancedProfile._json.email,
        organizationsCount: enhancedProfile._json.organizations?.length || 0
      });

    } catch (error) {
      logger.error('Failed to enhance GitHub profile', {
        correlationId,
        error: error.message,
        userId: profile.id
      });
      // Continue with basic profile if enhancement fails
    }

    return enhancedProfile;
  }

  /**
   * @private
   * Fetches user's GitHub emails
   */
  async #fetchGitHubEmails(accessToken, correlationId) {
    try {
      const response = await this.#githubAPI.getUserEmails(accessToken);
      
      return response.map(email => ({
        email: email.email,
        verified: email.verified,
        primary: email.primary,
        visibility: email.visibility
      }));
    } catch (error) {
      logger.error('Failed to fetch GitHub emails', {
        correlationId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * @private
   * Fetches user's GitHub organizations
   */
  async #fetchGitHubOrganizations(accessToken, correlationId) {
    try {
      const response = await this.#githubAPI.getUserOrganizations(accessToken);
      
      return response.map(org => ({
        id: org.id,
        login: org.login,
        name: org.name,
        description: org.description,
        url: org.html_url,
        avatarUrl: org.avatar_url
      }));
    } catch (error) {
      logger.error('Failed to fetch GitHub organizations', {
        correlationId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * @private
   * Validates organization membership
   */
  async #validateOrganizationMembership(profile, accessToken, correlationId) {
    const config = this.getConfig();
    const requiredOrgs = config.features.requiredOrganizations;

    if (!requiredOrgs || requiredOrgs.length === 0) {
      return true;
    }

    const userOrgs = profile._json.organizations || [];
    const userOrgLogins = userOrgs.map(org => org.login.toLowerCase());

    const hasRequiredOrg = requiredOrgs.some(requiredOrg => 
      userOrgLogins.includes(requiredOrg.toLowerCase())
    );

    if (!hasRequiredOrg) {
      throw new AppError(
        'User is not a member of required GitHub organization',
        403,
        ERROR_CODES.OAUTH_ORG_MEMBERSHIP_REQUIRED,
        { 
          correlationId,
          requiredOrganizations: requiredOrgs,
          userOrganizations: userOrgLogins
        }
      );
    }

    return true;
  }

  /**
   * Extracts provider-specific data from profile
   * @param {Object} profile - GitHub profile
   * @param {string} accessToken - Access token
   * @returns {Object} Provider-specific data
   */
  async extractProviderSpecificData(profile, accessToken) {
    return {
      githubId: profile.id,
      githubUsername: profile.username,
      githubProfileUrl: profile.profileUrl || profile._json.html_url,
      githubAvatarUrl: profile._json.avatar_url,
      githubCompany: profile._json.company,
      githubLocation: profile._json.location,
      githubBio: profile._json.bio,
      githubBlog: profile._json.blog,
      githubTwitterUsername: profile._json.twitter_username,
      githubPublicRepos: profile._json.public_repos,
      githubPublicGists: profile._json.public_gists,
      githubFollowers: profile._json.followers,
      githubFollowing: profile._json.following,
      githubCreatedAt: profile._json.created_at,
      githubUpdatedAt: profile._json.updated_at,
      isGitHubPro: profile._json.plan?.name === 'pro',
      organizations: profile._json.organizations
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || GitHubAuthStrategy.#GITHUB_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `github_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @static
   * Default handler for new GitHub users
   */
  static async #handleNewGitHubUser(user, profileData, req) {
    logger.info('New GitHub user registered', {
      userId: user._id,
      githubId: profileData.githubId,
      username: profileData.githubUsername,
      hasOrganizations: (profileData.organizations?.length || 0) > 0
    });

    // Additional GitHub-specific initialization
    if (profileData.organizations?.length > 0) {
      // Could trigger organization-specific workflows
    }
  }
}

module.exports = GitHubAuthStrategy;
// Export factory function
module.exports = (config) => {
  const strategy = new GitHubAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.GitHubAuthStrategy = GitHubAuthStrategy;