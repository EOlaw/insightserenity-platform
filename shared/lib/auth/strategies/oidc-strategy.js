'use strict';

/**
 * @fileoverview OpenID Connect authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/oidc-strategy
 * @requires module:passport-openidconnect
 * @requires module:shared/lib/auth/strategies/oauth-strategy
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/jwt/jwt-service
 */

const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const BaseOAuthStrategy = require('./oauth-strategy');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const JWTService = require('../../security/jwt/jwt-service');

/**
 * @class OIDCAuthStrategy
 * @extends BaseOAuthStrategy
 * @description OpenID Connect authentication strategy with enterprise SSO features
 */
class OIDCAuthStrategy extends BaseOAuthStrategy {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {JWTService}
   */
  #jwtService;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #OIDC_CONFIG = {
    provider: 'oidc',
    protocol: 'openid_connect',
    scope: ['openid', 'profile', 'email'],
    scopeSeparator: ' ',
    responseType: 'code',
    responseMode: 'query',
    display: 'page',
    prompt: 'select_account',
    maxAge: 3600,
    acrValues: null,
    headers: {
      'User-Agent': 'InsightSerenity-Platform'
    },
    features: {
      allowProvisioning: true,
      roleMapping: true,
      validateIdToken: true,
      fetchUserInfo: true,
      validateAudience: true,
      validateIssuer: true,
      validateNonce: true,
      validateState: true,
      cacheDiscovery: true,
      clockTolerance: 300 // 5 minutes
    },
    roleMapping: {
      admin: ['admin', 'administrator', 'superuser'],
      manager: ['manager', 'supervisor', 'lead'],
      user: ['user', 'member', 'employee']
    },
    security: {
      nonce: true,
      state: true,
      pkce: true,
      idTokenSigningAlg: 'RS256',
      userInfoSigningAlg: 'RS256',
      requestObjectSigningAlg: 'none',
      tokenEndpointAuthMethod: 'client_secret_basic'
    }
  };

  /**
   * Creates OIDC strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    const mergedConfig = {
      ...OIDCAuthStrategy.#OIDC_CONFIG,
      ...config,
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || OIDCAuthStrategy.#handleNewOIDCUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onUserUpdated: config.callbacks?.onUserUpdated,
        onAuthError: config.callbacks?.onAuthError
      }
    };

    super(mergedConfig, ...Object.values(services));
    
    this.#cacheService = services.cacheService || new CacheService();
    this.#jwtService = services.jwtService || new JWTService();

    logger.info('OIDCAuthStrategy initialized', {
      issuer: mergedConfig.issuer,
      scope: mergedConfig.scope,
      allowProvisioning: mergedConfig.features.allowProvisioning,
      roleMapping: mergedConfig.features.roleMapping
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {OpenIDConnectStrategy} Configured OIDC strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      // Provider configuration
      issuer: process.env.OIDC_ISSUER || config.issuer,
      clientID: process.env.OIDC_CLIENT_ID || config.clientID,
      clientSecret: process.env.OIDC_CLIENT_SECRET || config.clientSecret,
      callbackURL: process.env.OIDC_CALLBACK_URL || config.callbackURL || '/auth/oidc/callback',
      
      // Authorization parameters
      scope: config.scope,
      scopeSeparator: config.scopeSeparator,
      responseType: config.responseType,
      responseMode: config.responseMode,
      display: config.display,
      prompt: config.prompt,
      maxAge: config.maxAge,
      acrValues: config.acrValues,
      
      // Security settings
      nonce: config.security.nonce,
      state: config.security.state,
      pkce: config.security.pkce,
      
      // Token validation
      idTokenSigningAlg: config.security.idTokenSigningAlg,
      userInfoSigningAlg: config.security.userInfoSigningAlg,
      requestObjectSigningAlg: config.security.requestObjectSigningAlg,
      tokenEndpointAuthMethod: config.security.tokenEndpointAuthMethod,
      
      // Additional options
      passReqToCallback: true,
      clockTolerance: config.features.clockTolerance,
      
      // Custom headers
      customHeaders: config.headers
    };

    // Validate required configuration
    if (!options.issuer || !options.clientID || !options.clientSecret) {
      throw new AppError(
        'OIDC configuration missing required parameters',
        500,
        ERROR_CODES.OIDC_CONFIG_MISSING,
        { 
          hasIssuer: !!options.issuer,
          hasClientID: !!options.clientID,
          hasClientSecret: !!options.clientSecret
        }
      );
    }

    return new OpenIDConnectStrategy(options, async (req, issuer, profile, context, idToken, accessToken, refreshToken, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        logger.debug('OIDC authentication started', {
          correlationId,
          issuer,
          subject: profile.id,
          hasIdToken: !!idToken,
          hasAccessToken: !!accessToken
        });

        // Validate ID token if enabled
        if (config.features.validateIdToken && idToken) {
          await this.#validateIdToken(idToken, issuer, correlationId);
        }

        // Enhance profile with additional OIDC data
        const enhancedProfile = await this.#enhanceOIDCProfile(
          profile,
          context,
          idToken,
          accessToken,
          correlationId
        );

        // Fetch additional user info if enabled
        if (config.features.fetchUserInfo && accessToken) {
          await this.#fetchUserInfo(enhancedProfile, accessToken, issuer, correlationId);
        }

        // Map roles if enabled
        if (config.features.roleMapping) {
          enhancedProfile.mappedRoles = this.#mapUserRoles(enhancedProfile);
        }

        // Process user authentication
        const result = await this.#processUserAuthentication(
          enhancedProfile,
          req,
          correlationId
        );

        logger.info('OIDC authentication successful', {
          correlationId,
          userId: result.user._id,
          subject: profile.id,
          issuer,
          duration: Date.now() - startTime
        });

        return done(null, result.user, result.info);

      } catch (error) {
        logger.error('OIDC authentication failed', {
          correlationId,
          error: error.message,
          subject: profile.id,
          issuer,
          duration: Date.now() - startTime
        });

        return done(error, false);
      }
    });
  }

  /**
   * @private
   * Validates ID token
   */
  async #validateIdToken(idToken, issuer, correlationId) {
    const config = this.getConfig();

    try {
      // Decode and validate the ID token
      const decoded = await this.#jwtService.verify(idToken, {
        issuer: config.features.validateIssuer ? issuer : undefined,
        audience: config.features.validateAudience ? config.clientID : undefined,
        clockTolerance: config.features.clockTolerance
      });

      // Additional validation checks
      if (config.features.validateNonce && decoded.nonce) {
        // Validate nonce if present (implementation depends on session storage)
      }

      logger.debug('ID token validated successfully', {
        correlationId,
        subject: decoded.sub,
        issuer: decoded.iss,
        audience: decoded.aud
      });

      return decoded;

    } catch (error) {
      logger.error('ID token validation failed', {
        correlationId,
        error: error.message
      });

      throw new AppError(
        'Invalid ID token',
        401,
        ERROR_CODES.OIDC_INVALID_ID_TOKEN,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Enhances OIDC profile with additional data
   */
  async #enhanceOIDCProfile(profile, context, idToken, accessToken, correlationId) {
    const enhancedProfile = {
      id: profile.id,
      subject: profile.id,
      issuer: context.issuer,
      provider: 'oidc',
      username: profile.username,
      displayName: profile.displayName,
      name: {
        familyName: profile.name?.familyName,
        givenName: profile.name?.givenName,
        middleName: profile.name?.middleName
      },
      emails: profile.emails || [],
      photos: profile.photos || [],
      _raw: profile._raw,
      _json: {
        ...profile._json,
        oidc_issuer: context.issuer,
        oidc_subject: profile.id,
        id_token: idToken,
        access_token: accessToken,
        token_endpoint: context.tokenEndpoint,
        userinfo_endpoint: context.userinfoEndpoint
      }
    };

    // Extract claims from ID token if available
    if (idToken) {
      try {
        const idTokenClaims = this.#jwtService.decode(idToken);
        enhancedProfile._json.id_token_claims = idTokenClaims;
        
        // Map standard OIDC claims
        if (idTokenClaims.email && !enhancedProfile.emails.length) {
          enhancedProfile.emails.push({
            value: idTokenClaims.email,
            verified: idTokenClaims.email_verified || false
          });
        }

        // Extract additional claims
        enhancedProfile.preferredUsername = idTokenClaims.preferred_username;
        enhancedProfile.locale = idTokenClaims.locale;
        enhancedProfile.timezone = idTokenClaims.zoneinfo;
        enhancedProfile.updatedAt = idTokenClaims.updated_at;
        enhancedProfile.roles = idTokenClaims.roles || [];
        enhancedProfile.groups = idTokenClaims.groups || [];

      } catch (error) {
        logger.debug('Failed to decode ID token claims', {
          correlationId,
          error: error.message
        });
      }
    }

    logger.debug('OIDC profile enhanced', {
      correlationId,
      subject: profile.id,
      hasEmail: enhancedProfile.emails.length > 0,
      rolesCount: enhancedProfile.roles?.length || 0,
      groupsCount: enhancedProfile.groups?.length || 0
    });

    return enhancedProfile;
  }

  /**
   * @private
   * Fetches additional user info from UserInfo endpoint
   */
  async #fetchUserInfo(profile, accessToken, issuer, correlationId) {
    try {
      // This would make a request to the UserInfo endpoint
      // Implementation depends on your HTTP client setup
      const userInfoResponse = await this.#makeUserInfoRequest(accessToken, issuer);
      
      if (userInfoResponse) {
        // Merge UserInfo data into profile
        profile._json.userinfo = userInfoResponse;
        
        // Update profile fields with UserInfo data
        if (userInfoResponse.email && !profile.emails.length) {
          profile.emails.push({
            value: userInfoResponse.email,
            verified: userInfoResponse.email_verified || false
          });
        }

        if (userInfoResponse.picture && !profile.photos.length) {
          profile.photos.push({ value: userInfoResponse.picture });
        }

        // Merge additional claims
        profile.roles = userInfoResponse.roles || profile.roles || [];
        profile.groups = userInfoResponse.groups || profile.groups || [];
      }

    } catch (error) {
      logger.debug('Failed to fetch UserInfo', {
        correlationId,
        error: error.message
      });
      // Continue without UserInfo data
    }
  }

  /**
   * @private
   * Makes request to UserInfo endpoint
   */
  async #makeUserInfoRequest(accessToken, issuer) {
    // Placeholder for actual UserInfo endpoint request
    // This would use your HTTP client to make the request
    return null;
  }

  /**
   * @private
   * Maps user roles based on OIDC claims
   */
  #mapUserRoles(profile) {
    const config = this.getConfig();
    const roleMapping = config.roleMapping;
    const userRoles = profile.roles || [];
    const userGroups = profile.groups || [];
    const mappedRoles = new Set();

    // Add explicit roles
    userRoles.forEach(role => {
      const normalizedRole = role.toLowerCase();
      Object.entries(roleMapping).forEach(([mappedRole, patterns]) => {
        if (patterns.some(pattern => normalizedRole.includes(pattern.toLowerCase()))) {
          mappedRoles.add(mappedRole);
        }
      });
    });

    // Map groups to roles
    userGroups.forEach(group => {
      const normalizedGroup = group.toLowerCase();
      Object.entries(roleMapping).forEach(([mappedRole, patterns]) => {
        if (patterns.some(pattern => normalizedGroup.includes(pattern.toLowerCase()))) {
          mappedRoles.add(mappedRole);
        }
      });
    });

    // Default role if no roles mapped
    if (mappedRoles.size === 0) {
      mappedRoles.add('user');
    }

    return Array.from(mappedRoles);
  }

  /**
   * @private
   * Processes user authentication
   */
  async #processUserAuthentication(profile, req, correlationId) {
    const config = this.getConfig();

    try {
      // Check if user exists
      const existingUser = await this.#findUserByProfile(profile);

      if (existingUser) {
        // Update existing user
        const updatedUser = await this.#updateExistingUser(existingUser, profile, correlationId);
        
        if (config.callbacks.onExistingUser) {
          await config.callbacks.onExistingUser(updatedUser, profile, req);
        }

        return { user: updatedUser, info: { type: 'existing' } };
      } else {
        // Create new user if provisioning is allowed
        if (!config.features.allowProvisioning) {
          throw new AppError(
            'User provisioning is not allowed',
            403,
            ERROR_CODES.OIDC_PROVISIONING_DISABLED,
            { correlationId, subject: profile.subject }
          );
        }

        const newUser = await this.#createNewUser(profile, correlationId);
        
        if (config.callbacks.onNewUser) {
          await config.callbacks.onNewUser(newUser, profile, req);
        }

        return { user: newUser, info: { type: 'new' } };
      }

    } catch (error) {
      if (config.callbacks.onAuthError) {
        await config.callbacks.onAuthError(error, profile, req);
      }
      throw error;
    }
  }

  /**
   * @private
   * Finds user by OIDC profile
   */
  async #findUserByProfile(profile) {
    // Implementation would depend on your User model
    // This is a placeholder for the actual user lookup logic
    return null; // Replace with actual user lookup
  }

  /**
   * @private
   * Updates existing user with OIDC profile data
   */
  async #updateExistingUser(user, profile, correlationId) {
    // Implementation would update user fields from OIDC profile
    // This is a placeholder for the actual user update logic
    return user; // Replace with actual user update
  }

  /**
   * @private
   * Creates new user from OIDC profile
   */
  async #createNewUser(profile, correlationId) {
    // Implementation would create new user from OIDC profile
    // This is a placeholder for the actual user creation logic
    throw new AppError(
      'User creation not implemented',
      500,
      ERROR_CODES.NOT_IMPLEMENTED,
      { correlationId }
    );
  }

  /**
   * Extracts provider-specific data from profile
   * @param {Object} profile - OIDC profile
   * @param {string} accessToken - Access token
   * @returns {Object} Provider-specific data
   */
  async extractProviderSpecificData(profile, accessToken) {
    return {
      oidcSubject: profile.subject,
      oidcIssuer: profile.issuer,
      oidcPreferredUsername: profile.preferredUsername,
      oidcLocale: profile.locale,
      oidcTimezone: profile.timezone,
      oidcUpdatedAt: profile.updatedAt,
      oidcRoles: profile.roles,
      oidcGroups: profile.groups,
      mappedRoles: profile.mappedRoles,
      idTokenClaims: profile._json.id_token_claims,
      userInfo: profile._json.userinfo
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || OIDCAuthStrategy.#OIDC_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `oidc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @static
   * Default handler for new OIDC users
   */
  static async #handleNewOIDCUser(user, profileData, req) {
    logger.info('New OIDC user registered', {
      userId: user._id,
      oidcSubject: profileData.oidcSubject,
      issuer: profileData.oidcIssuer,
      hasRoles: (profileData.oidcRoles?.length || 0) > 0,
      mappedRoles: profileData.mappedRoles
    });

    // Additional OIDC-specific initialization
    if (profileData.oidcIssuer) {
      // Could trigger issuer-specific workflows
    }
  }
}

module.exports = OIDCAuthStrategy;

// Export factory function
module.exports = (config) => {
  const strategy = new OIDCAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.OIDCAuthStrategy = OIDCAuthStrategy;