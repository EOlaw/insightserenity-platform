'use strict';

/**
 * @fileoverview SAML authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/saml-strategy
 * @requires module:passport-saml
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/cache-service
 */

// const SamlStrategy = require('@node-saml/passport-saml').Strategy;
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const EncryptionService = require('../../security/encryption/encryption-service');
const CacheService = require('../../services/cache-service');

/**
 * @class SAMLAuthStrategy
 * @description SAML 2.0 authentication strategy with enterprise SSO features
 */
class SAMLAuthStrategy {
  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #SAML_CONFIG = {
    provider: 'saml',
    protocol: 'saml2',
    acceptedClockSkewMs: 300000, // 5 minutes
    disableRequestedAuthnContext: false,
    forceAuthn: false,
    skipRequestCompression: false,
    authnRequestBinding: 'HTTP-POST',
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',
    features: {
      allowProvisioning: true,
      roleMapping: true,
      attributeMapping: true,
      singleLogout: true,
      encryptedAssertions: false,
      signedAssertions: true,
      signedResponses: true,
      validateSignature: true,
      validateAssertions: true
    },
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      displayName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
      roles: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
      department: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department',
      employeeId: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/employeeid',
      title: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/title',
      phone: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/telephonenumber'
    },
    roleMapping: {
      admin: ['Domain Admins', 'Enterprise Admins', 'Application Administrators'],
      manager: ['Managers', 'Team Leaders', 'Department Heads'],
      user: ['Users', 'Employees', 'Standard Users']
    },
    security: {
      validateInResponseTo: true,
      requestIdExpirationPeriodMs: 3600000, // 1 hour
      cacheProvider: 'memory',
      logoutCallbackURL: '/auth/saml/logout/callback'
    }
  };

  /**
   * Creates SAML strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    this._config = {
      ...SAMLAuthStrategy.#SAML_CONFIG,
      ...config,
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || SAMLAuthStrategy.#handleNewSAMLUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onUserUpdated: config.callbacks?.onUserUpdated,
        onLogout: config.callbacks?.onLogout,
        onAuthError: config.callbacks?.onAuthError
      }
    };

    this.#encryptionService = services.encryptionService || new EncryptionService();
    this.#cacheService = services.cacheService || new CacheService();

    logger.info('SAMLAuthStrategy initialized', {
      entityId: this._config.entityId,
      allowProvisioning: this._config.features.allowProvisioning,
      roleMapping: this._config.features.roleMapping,
      singleLogout: this._config.features.singleLogout
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {SamlStrategy} Configured SAML strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      // Identity Provider settings
      entryPoint: process.env.SAML_SSO_URL || config.ssoUrl,
      logoutUrl: process.env.SAML_SLO_URL || config.sloUrl,
      cert: process.env.SAML_CERTIFICATE || config.certificate,
      
      // Service Provider settings
      issuer: process.env.SAML_ENTITY_ID || config.entityId,
      callbackUrl: process.env.SAML_CALLBACK_URL || config.callbackURL || '/auth/saml/callback',
      logoutCallbackUrl: process.env.SAML_LOGOUT_CALLBACK_URL || config.security.logoutCallbackURL,
      
      // Private key for signing (if needed)
      privateCert: process.env.SAML_PRIVATE_KEY || config.privateKey,
      
      // Security settings
      acceptedClockSkewMs: config.acceptedClockSkewMs,
      disableRequestedAuthnContext: config.disableRequestedAuthnContext,
      forceAuthn: config.forceAuthn,
      skipRequestCompression: config.skipRequestCompression,
      authnRequestBinding: config.authnRequestBinding,
      signatureAlgorithm: config.signatureAlgorithm,
      digestAlgorithm: config.digestAlgorithm,
      
      // Validation settings
      validateInResponseTo: config.security.validateInResponseTo,
      requestIdExpirationPeriodMs: config.security.requestIdExpirationPeriodMs,
      cacheProvider: this.#createCacheProvider(),
      
      // Additional options
      passReqToCallback: true,
      additionalParams: config.additionalParams || {},
      additionalAuthorizeParams: config.additionalAuthorizeParams || {}
    };

    // Validate required configuration
    if (!options.entryPoint || !options.cert || !options.issuer) {
      throw new AppError(
        'SAML configuration missing required parameters',
        500,
        ERROR_CODES.SAML_CONFIG_MISSING,
        { 
          hasEntryPoint: !!options.entryPoint,
          hasCert: !!options.cert,
          hasIssuer: !!options.issuer
        }
      );
    }

    return new SamlStrategy(options, async (req, profile, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        logger.debug('SAML authentication started', {
          correlationId,
          nameId: profile.nameID,
          issuer: profile.issuer
        });

        // Enhance profile with mapped attributes
        const enhancedProfile = await this.#enhanceSAMLProfile(
          profile,
          correlationId
        );

        // Validate and map roles if enabled
        if (config.features.roleMapping) {
          enhancedProfile.mappedRoles = this.#mapUserRoles(enhancedProfile);
        }

        // Process user authentication
        const result = await this.#processUserAuthentication(
          enhancedProfile,
          req,
          correlationId
        );

        logger.info('SAML authentication successful', {
          correlationId,
          userId: result.user._id,
          nameId: profile.nameID,
          duration: Date.now() - startTime
        });

        return done(null, result.user, result.info);

      } catch (error) {
        logger.error('SAML authentication failed', {
          correlationId,
          error: error.message,
          nameId: profile.nameID,
          duration: Date.now() - startTime
        });

        return done(error, false);
      }
    });
  }

  /**
   * @private
   * Enhances SAML profile with mapped attributes
   */
  async #enhanceSAMLProfile(profile, correlationId) {
    const config = this.getConfig();
    const attributeMapping = config.attributeMapping;

    const enhancedProfile = {
      id: profile.nameID,
      nameID: profile.nameID,
      nameIDFormat: profile.nameIDFormat,
      sessionIndex: profile.sessionIndex,
      issuer: profile.issuer,
      provider: 'saml',
      _raw: JSON.stringify(profile),
      _json: { ...profile }
    };

    // Map SAML attributes to standard profile fields
    if (profile.attributes) {
      const attrs = profile.attributes;

      // Extract standard fields
      enhancedProfile.email = this.#extractAttributeValue(attrs, attributeMapping.email);
      enhancedProfile.firstName = this.#extractAttributeValue(attrs, attributeMapping.firstName);
      enhancedProfile.lastName = this.#extractAttributeValue(attrs, attributeMapping.lastName);
      enhancedProfile.displayName = this.#extractAttributeValue(attrs, attributeMapping.displayName) ||
        `${enhancedProfile.firstName || ''} ${enhancedProfile.lastName || ''}`.trim();

      // Extract additional attributes
      enhancedProfile.department = this.#extractAttributeValue(attrs, attributeMapping.department);
      enhancedProfile.employeeId = this.#extractAttributeValue(attrs, attributeMapping.employeeId);
      enhancedProfile.title = this.#extractAttributeValue(attrs, attributeMapping.title);
      enhancedProfile.phone = this.#extractAttributeValue(attrs, attributeMapping.phone);

      // Extract groups and roles
      enhancedProfile.groups = this.#extractAttributeValues(attrs, attributeMapping.groups) || [];
      enhancedProfile.roles = this.#extractAttributeValues(attrs, attributeMapping.roles) || [];

      // Store all attributes for reference
      enhancedProfile.samlAttributes = attrs;
    }

    logger.debug('SAML profile enhanced', {
      correlationId,
      nameId: profile.nameID,
      hasEmail: !!enhancedProfile.email,
      groupsCount: enhancedProfile.groups?.length || 0,
      rolesCount: enhancedProfile.roles?.length || 0
    });

    return enhancedProfile;
  }

  /**
   * @private
   * Extracts single attribute value from SAML attributes
   */
  #extractAttributeValue(attributes, attributeName) {
    if (!attributes || !attributeName) return null;

    const value = attributes[attributeName];
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    return value || null;
  }

  /**
   * @private
   * Extracts multiple attribute values from SAML attributes
   */
  #extractAttributeValues(attributes, attributeName) {
    if (!attributes || !attributeName) return [];

    const value = attributes[attributeName];
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  }

  /**
   * @private
   * Maps user roles based on groups
   */
  #mapUserRoles(profile) {
    const config = this.getConfig();
    const roleMapping = config.roleMapping;
    const userGroups = profile.groups || [];
    const userRoles = profile.roles || [];
    const mappedRoles = new Set();

    // Add explicit roles
    userRoles.forEach(role => mappedRoles.add(role.toLowerCase()));

    // Map groups to roles
    Object.entries(roleMapping).forEach(([role, groups]) => {
      const hasGroup = groups.some(group => 
        userGroups.some(userGroup => 
          userGroup.toLowerCase().includes(group.toLowerCase()) ||
          group.toLowerCase().includes(userGroup.toLowerCase())
        )
      );

      if (hasGroup) {
        mappedRoles.add(role);
      }
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
        // Update existing user if needed
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
            ERROR_CODES.SAML_PROVISIONING_DISABLED,
            { correlationId, nameId: profile.nameID }
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
   * Finds user by SAML profile
   */
  async #findUserByProfile(profile) {
    // Implementation would depend on your User model
    // This is a placeholder for the actual user lookup logic
    return null; // Replace with actual user lookup
  }

  /**
   * @private
   * Updates existing user with SAML profile data
   */
  async #updateExistingUser(user, profile, correlationId) {
    // Implementation would update user fields from SAML profile
    // This is a placeholder for the actual user update logic
    return user; // Replace with actual user update
  }

  /**
   * @private
   * Creates new user from SAML profile
   */
  async #createNewUser(profile, correlationId) {
    // Implementation would create new user from SAML profile
    // This is a placeholder for the actual user creation logic
    throw new AppError(
      'User creation not implemented',
      500,
      ERROR_CODES.NOT_IMPLEMENTED,
      { correlationId }
    );
  }

  /**
   * @private
   * Creates cache provider for SAML strategy
   */
  #createCacheProvider() {
    return {
      save: async (key, value, callback) => {
        try {
          await this.#cacheService.set(`saml:${key}`, value, 3600); // 1 hour TTL
          callback(null);
        } catch (error) {
          callback(error);
        }
      },
      get: async (key, callback) => {
        try {
          const value = await this.#cacheService.get(`saml:${key}`);
          callback(null, value);
        } catch (error) {
          callback(error, null);
        }
      },
      remove: async (key, callback) => {
        try {
          await this.#cacheService.delete(`saml:${key}`);
          callback(null);
        } catch (error) {
          callback(error);
        }
      }
    };
  }

  /**
   * Extracts provider-specific data from profile
   * @param {Object} profile - SAML profile
   * @returns {Object} Provider-specific data
   */
  extractProviderSpecificData(profile) {
    return {
      samlNameId: profile.nameID,
      samlNameIdFormat: profile.nameIDFormat,
      samlSessionIndex: profile.sessionIndex,
      samlIssuer: profile.issuer,
      samlDepartment: profile.department,
      samlEmployeeId: profile.employeeId,
      samlTitle: profile.title,
      samlPhone: profile.phone,
      samlGroups: profile.groups,
      samlRoles: profile.roles,
      mappedRoles: profile.mappedRoles,
      samlAttributes: profile.samlAttributes
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || SAMLAuthStrategy.#SAML_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `saml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates logout URL
   * @param {Object} user - User object with SAML session data
   * @returns {string} Logout URL
   */
  generateLogoutUrl(user) {
    const config = this.getConfig();
    const strategy = this.getStrategy();
    
    return strategy.generateServiceProviderMetadata(config.decryptionCert);
  }

  /**
   * @private
   * @static
   * Default handler for new SAML users
   */
  static async #handleNewSAMLUser(user, profileData, req) {
    logger.info('New SAML user registered', {
      userId: user._id,
      samlNameId: profileData.samlNameId,
      issuer: profileData.samlIssuer,
      hasGroups: (profileData.samlGroups?.length || 0) > 0,
      mappedRoles: profileData.mappedRoles
    });

    // Additional SAML-specific initialization
    if (profileData.samlDepartment) {
      // Could trigger department-specific workflows
    }
  }
}

module.exports = SAMLAuthStrategy;

// Export factory function
module.exports = (config) => {
  const strategy = new SAMLAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.SAMLAuthStrategy = SAMLAuthStrategy;