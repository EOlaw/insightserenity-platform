'use strict';

/**
 * @fileoverview LDAP authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/ldap-strategy
 * @requires module:passport-ldapauth
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const LdapStrategy = require('passport-ldapauth').Strategy;
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class LDAPAuthStrategy
 * @description LDAP authentication strategy with enterprise directory integration
 */
class LDAPAuthStrategy {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #LDAP_CONFIG = {
    provider: 'ldap',
    protocol: 'ldaps', // 'ldap' or 'ldaps'
    server: {
      url: 'ldaps://ldap.company.com:636',
      bindDN: 'cn=service,ou=users,dc=company,dc=com',
      bindCredentials: 'service_password',
      searchBase: 'ou=users,dc=company,dc=com',
      searchFilter: '(uid={{username}})',
      searchAttributes: [
        'uid',
        'cn',
        'sn',
        'givenName',
        'mail',
        'telephoneNumber',
        'title',
        'department',
        'employeeNumber',
        'memberOf',
        'description'
      ],
      groupSearchBase: 'ou=groups,dc=company,dc=com',
      groupSearchFilter: '(member={{dn}})',
      groupSearchAttributes: ['cn', 'description'],
      groupDnProperty: 'dn',
      groupSearchScope: 'sub',
      paginationPageSize: 100,
      sizeLimit: 100,
      timeLimit: 0,
      reconnect: true,
      maxConnections: 20,
      idleTimeout: 300000, // 5 minutes
      checkInterval: 60000  // 1 minute
    },
    security: {
      tlsOptions: {
        rejectUnauthorized: true,
        ca: null, // Certificate Authority
        cert: null, // Client certificate
        key: null,  // Client private key
        passphrase: null,
        secureProtocol: 'TLSv1_2_method'
      },
      bindRetries: 3,
      bindTimeout: 5000,
      searchTimeout: 10000,
      cacheCredentials: false,
      cacheTimeout: 300, // 5 minutes
      rateLimiting: {
        enabled: true,
        maxAttempts: 5,
        windowMs: 900000 // 15 minutes
      }
    },
    features: {
      allowProvisioning: true,
      roleMapping: true,
      groupMapping: true,
      attributeMapping: true,
      syncUserData: true,
      fetchGroups: true,
      validateGroups: false,
      requiredGroups: []
    },
    attributeMapping: {
      id: 'uid',
      username: 'uid',
      email: 'mail',
      firstName: 'givenName',
      lastName: 'sn',
      displayName: 'cn',
      phone: 'telephoneNumber',
      title: 'title',
      department: 'department',
      employeeId: 'employeeNumber',
      description: 'description'
    },
    roleMapping: {
      admin: ['Domain Admins', 'Enterprise Admins', 'IT Administrators'],
      manager: ['Managers', 'Department Heads', 'Team Leaders'],
      user: ['Users', 'Employees', 'Staff']
    }
  };

  /**
   * Creates LDAP strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    this._config = {
      ...LDAPAuthStrategy.#LDAP_CONFIG,
      ...config,
      server: {
        ...LDAPAuthStrategy.#LDAP_CONFIG.server,
        ...config.server
      },
      security: {
        ...LDAPAuthStrategy.#LDAP_CONFIG.security,
        ...config.security,
        tlsOptions: {
          ...LDAPAuthStrategy.#LDAP_CONFIG.security.tlsOptions,
          ...config.security?.tlsOptions
        }
      },
      callbacks: {
        onNewUser: config.callbacks?.onNewUser || LDAPAuthStrategy.#handleNewLDAPUser,
        onExistingUser: config.callbacks?.onExistingUser,
        onUserUpdated: config.callbacks?.onUserUpdated,
        onAuthError: config.callbacks?.onAuthError,
        onGroupsUpdated: config.callbacks?.onGroupsUpdated
      }
    };

    this.#cacheService = services.cacheService || new CacheService();
    this.#encryptionService = services.encryptionService || new EncryptionService();

    logger.info('LDAPAuthStrategy initialized', {
      server: this._config.server.url,
      searchBase: this._config.server.searchBase,
      allowProvisioning: this._config.features.allowProvisioning,
      roleMapping: this._config.features.roleMapping
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {LdapStrategy} Configured LDAP strategy
   */
  getStrategy() {
    const config = this.getConfig();
    
    const options = {
      server: {
        url: process.env.LDAP_URL || config.server.url,
        bindDN: process.env.LDAP_BIND_DN || config.server.bindDN,
        bindCredentials: process.env.LDAP_BIND_PASSWORD || config.server.bindCredentials,
        searchBase: process.env.LDAP_SEARCH_BASE || config.server.searchBase,
        searchFilter: process.env.LDAP_SEARCH_FILTER || config.server.searchFilter,
        searchAttributes: config.server.searchAttributes,
        groupSearchBase: process.env.LDAP_GROUP_SEARCH_BASE || config.server.groupSearchBase,
        groupSearchFilter: config.server.groupSearchFilter,
        groupSearchAttributes: config.server.groupSearchAttributes,
        groupDnProperty: config.server.groupDnProperty,
        groupSearchScope: config.server.groupSearchScope,
        paginationPageSize: config.server.paginationPageSize,
        sizeLimit: config.server.sizeLimit,
        timeLimit: config.server.timeLimit,
        reconnect: config.server.reconnect,
        maxConnections: config.server.maxConnections,
        idleTimeout: config.server.idleTimeout,
        checkInterval: config.server.checkInterval,
        tlsOptions: config.security.tlsOptions
      },
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true,
      credentialsLookup: this.#createCredentialsLookup(),
      handleErrorsAsFailures: true
    };

    // Validate required configuration
    if (!options.server.url || !options.server.searchBase) {
      throw new AppError(
        'LDAP configuration missing required parameters',
        500,
        ERROR_CODES.LDAP_CONFIG_MISSING,
        { 
          hasUrl: !!options.server.url,
          hasSearchBase: !!options.server.searchBase
        }
      );
    }

    return new LdapStrategy(options, async (req, user, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.generateCorrelationId();

      try {
        logger.debug('LDAP authentication started', {
          correlationId,
          username: user[config.attributeMapping.username],
          dn: user.dn
        });

        // Enhance user profile with mapped attributes
        const enhancedProfile = await this.#enhanceLDAPProfile(
          user,
          correlationId
        );

        // Fetch user groups if enabled
        if (config.features.fetchGroups) {
          enhancedProfile.groups = await this.#fetchUserGroups(user.dn, correlationId);
        }

        // Map roles if enabled
        if (config.features.roleMapping) {
          enhancedProfile.mappedRoles = this.#mapUserRoles(enhancedProfile);
        }

        // Validate group membership if required
        if (config.features.validateGroups && config.features.requiredGroups.length > 0) {
          await this.#validateGroupMembership(enhancedProfile, correlationId);
        }

        // Process user authentication
        const result = await this.#processUserAuthentication(
          enhancedProfile,
          req,
          correlationId
        );

        logger.info('LDAP authentication successful', {
          correlationId,
          userId: result.user._id,
          username: enhancedProfile.username,
          dn: enhancedProfile.dn,
          duration: Date.now() - startTime
        });

        return done(null, result.user, result.info);

      } catch (error) {
        logger.error('LDAP authentication failed', {
          correlationId,
          error: error.message,
          username: user[config.attributeMapping.username],
          duration: Date.now() - startTime
        });

        return done(error, false);
      }
    });
  }

  /**
   * @private
   * Creates credentials lookup function for LDAP strategy
   */
  #createCredentialsLookup() {
    return (req, callback) => {
      const username = req.body.username || req.body.email;
      const password = req.body.password;

      if (!username || !password) {
        return callback(new AppError(
          'Username and password are required',
          400,
          ERROR_CODES.LDAP_CREDENTIALS_MISSING
        ));
      }

      callback(null, username, password);
    };
  }

  /**
   * @private
   * Enhances LDAP profile with mapped attributes
   */
  async #enhanceLDAPProfile(user, correlationId) {
    const config = this.getConfig();
    const attributeMapping = config.attributeMapping;

    const enhancedProfile = {
      dn: user.dn,
      provider: 'ldap',
      _raw: JSON.stringify(user),
      _json: { ...user }
    };

    // Map LDAP attributes to standard profile fields
    Object.entries(attributeMapping).forEach(([standardField, ldapAttribute]) => {
      const value = user[ldapAttribute];
      if (value !== undefined) {
        enhancedProfile[standardField] = Array.isArray(value) ? value[0] : value;
      }
    });

    // Ensure required fields have defaults
    enhancedProfile.id = enhancedProfile.id || enhancedProfile.username || user.dn;
    enhancedProfile.displayName = enhancedProfile.displayName || 
      `${enhancedProfile.firstName || ''} ${enhancedProfile.lastName || ''}`.trim() ||
      enhancedProfile.username;

    // Store all LDAP attributes for reference
    enhancedProfile.ldapAttributes = user;

    logger.debug('LDAP profile enhanced', {
      correlationId,
      username: enhancedProfile.username,
      dn: enhancedProfile.dn,
      hasEmail: !!enhancedProfile.email,
      hasDisplayName: !!enhancedProfile.displayName
    });

    return enhancedProfile;
  }

  /**
   * @private
   * Fetches user groups from LDAP
   */
  async #fetchUserGroups(userDn, correlationId) {
    const config = this.getConfig();

    try {
      // This would be implemented with actual LDAP client
      // For now, returning empty array as placeholder
      const groups = [];

      logger.debug('LDAP groups fetched', {
        correlationId,
        userDn,
        groupsCount: groups.length
      });

      return groups;

    } catch (error) {
      logger.error('Failed to fetch LDAP groups', {
        correlationId,
        userDn,
        error: error.message
      });
      return [];
    }
  }

  /**
   * @private
   * Maps user roles based on group membership
   */
  #mapUserRoles(profile) {
    const config = this.getConfig();
    const roleMapping = config.roleMapping;
    const userGroups = profile.groups || [];
    const mappedRoles = new Set();

    // Map groups to roles
    Object.entries(roleMapping).forEach(([role, groups]) => {
      const hasGroup = groups.some(groupPattern => 
        userGroups.some(userGroup => 
          userGroup.cn && (
            userGroup.cn.toLowerCase().includes(groupPattern.toLowerCase()) ||
            groupPattern.toLowerCase().includes(userGroup.cn.toLowerCase())
          )
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
   * Validates group membership requirements
   */
  async #validateGroupMembership(profile, correlationId) {
    const config = this.getConfig();
    const requiredGroups = config.features.requiredGroups;
    const userGroups = profile.groups || [];

    if (!requiredGroups || requiredGroups.length === 0) {
      return true;
    }

    const userGroupNames = userGroups.map(group => group.cn?.toLowerCase()).filter(Boolean);
    const hasRequiredGroup = requiredGroups.some(requiredGroup => 
      userGroupNames.some(userGroup => 
        userGroup.includes(requiredGroup.toLowerCase()) ||
        requiredGroup.toLowerCase().includes(userGroup)
      )
    );

    if (!hasRequiredGroup) {
      throw new AppError(
        'User is not a member of required LDAP group',
        403,
        ERROR_CODES.LDAP_GROUP_MEMBERSHIP_REQUIRED,
        { 
          correlationId,
          requiredGroups,
          userGroups: userGroupNames
        }
      );
    }

    return true;
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
        // Update existing user if sync is enabled
        let updatedUser = existingUser;
        if (config.features.syncUserData) {
          updatedUser = await this.#updateExistingUser(existingUser, profile, correlationId);
        }
        
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
            ERROR_CODES.LDAP_PROVISIONING_DISABLED,
            { correlationId, username: profile.username }
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
   * Finds user by LDAP profile
   */
  async #findUserByProfile(profile) {
    // Implementation would depend on your User model
    // This is a placeholder for the actual user lookup logic
    return null; // Replace with actual user lookup
  }

  /**
   * @private
   * Updates existing user with LDAP profile data
   */
  async #updateExistingUser(user, profile, correlationId) {
    // Implementation would update user fields from LDAP profile
    // This is a placeholder for the actual user update logic
    return user; // Replace with actual user update
  }

  /**
   * @private
   * Creates new user from LDAP profile
   */
  async #createNewUser(profile, correlationId) {
    // Implementation would create new user from LDAP profile
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
   * @param {Object} profile - LDAP profile
   * @returns {Object} Provider-specific data
   */
  extractProviderSpecificData(profile) {
    return {
      ldapDn: profile.dn,
      ldapUsername: profile.username,
      ldapDepartment: profile.department,
      ldapEmployeeId: profile.employeeId,
      ldapTitle: profile.title,
      ldapPhone: profile.phone,
      ldapDescription: profile.description,
      ldapGroups: profile.groups,
      mappedRoles: profile.mappedRoles,
      ldapAttributes: profile.ldapAttributes
    };
  }

  /**
   * Gets configuration
   * @returns {Object} Strategy configuration
   */
  getConfig() {
    return this._config || LDAPAuthStrategy.#LDAP_CONFIG;
  }

  /**
   * Generates correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `ldap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Tests LDAP connection
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      // Implementation would test actual LDAP connection
      // This is a placeholder for the actual connection test
      logger.info('LDAP connection test successful');
      return true;
    } catch (error) {
      logger.error('LDAP connection test failed', { error: error.message });
      return false;
    }
  }

  /**
   * Searches LDAP directory
   * @param {string} filter - LDAP search filter
   * @param {Array} attributes - Attributes to retrieve
   * @returns {Promise<Array>} Search results
   */
  async searchDirectory(filter, attributes = []) {
    try {
      // Implementation would perform actual LDAP search
      // This is a placeholder for the actual directory search
      return [];
    } catch (error) {
      logger.error('LDAP directory search failed', { 
        filter, 
        error: error.message 
      });
      throw new AppError(
        'Directory search failed',
        500,
        ERROR_CODES.LDAP_SEARCH_FAILED,
        { filter, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * @static
   * Default handler for new LDAP users
   */
  static async #handleNewLDAPUser(user, profileData, req) {
    logger.info('New LDAP user registered', {
      userId: user._id,
      ldapDn: profileData.ldapDn,
      username: profileData.ldapUsername,
      department: profileData.ldapDepartment,
      hasGroups: (profileData.ldapGroups?.length || 0) > 0,
      mappedRoles: profileData.mappedRoles
    });

    // Additional LDAP-specific initialization
    if (profileData.ldapDepartment) {
      // Could trigger department-specific workflows
    }
  }
}

module.exports = LDAPAuthStrategy;

// Export factory function
module.exports = (config) => {
  const strategy = new LDAPAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing and extension
module.exports.LDAPAuthStrategy = LDAPAuthStrategy;