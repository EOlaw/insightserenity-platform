'use strict';

/**
 * @fileoverview LDAP directory operations and management service
 * @module shared/lib/integrations/directory/ldap-api
 * @requires module:ldapjs
 * @requires module:tls
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const ldap = require('ldapjs');
const tls = require('tls');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class LDAPAPI
 * @description Handles LDAP directory operations including authentication,
 * search, user management, and group operations
 */
class LDAPAPI {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for search results and connections
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   * @description Encryption service for sensitive data
   */
  #encryptionService;

  /**
   * @private
   * @type {Object}
   * @description LDAP client connection
   */
  #client;

  /**
   * @private
   * @type {Map}
   * @description Connection pool for multiple LDAP operations
   */
  #connectionPool;

  /**
   * @private
   * @type {Number}
   * @description Connection pool size counter
   */
  #poolSize;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    protocol: 'ldaps',
    port: 636,
    timeout: 30000,
    connectTimeout: 10000,
    idleTimeout: 300000, // 5 minutes
    reconnect: true,
    maxConnections: 10,
    maxRetries: 3,
    retryDelay: 1000,
    cacheTTL: 3600,
    searchCacheTTL: 1800,
    userCacheTTL: 3600,
    groupCacheTTL: 7200,
    pageSize: 100,
    sizeLimit: 1000,
    timeLimit: 30,
    scope: 'sub',
    deref: 'never',
    typesOnly: false,
    paged: true,
    searchFilter: '(objectClass=*)',
    userObjectClass: 'user',
    groupObjectClass: 'group',
    userSearchFilter: '(&(objectClass=user)(|(sAMAccountName={username})(userPrincipalName={username})(mail={username})))',
    groupSearchFilter: '(&(objectClass=group)(member={userDN}))',
    attributeMapping: {
      username: 'sAMAccountName',
      email: 'mail',
      firstName: 'givenName',
      lastName: 'sn',
      displayName: 'displayName',
      title: 'title',
      department: 'department',
      company: 'company',
      employeeId: 'employeeNumber',
      manager: 'manager',
      phone: 'telephoneNumber',
      mobile: 'mobile'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description LDAP search scopes
   */
  static #SEARCH_SCOPES = {
    BASE: 'base',
    ONE: 'one',
    SUB: 'sub'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description LDAP dereference options
   */
  static #DEREF_OPTIONS = {
    NEVER: 'never',
    SEARCHING: 'searching',
    FINDING: 'finding',
    ALWAYS: 'always'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Common LDAP object classes
   */
  static #OBJECT_CLASSES = {
    PERSON: 'person',
    USER: 'user',
    INETORGPERSON: 'inetOrgPerson',
    GROUP: 'group',
    GROUPOFNAMES: 'groupOfNames',
    GROUPOFUNIQUENAMES: 'groupOfUniqueNames',
    ORGANIZATIONALUNIT: 'organizationalUnit',
    ORGANIZATION: 'organization',
    DOMAIN: 'domain'
  };

  /**
   * Creates a new LDAPAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.url - LDAP server URL
   * @param {string} config.bindDN - Bind DN for authentication
   * @param {string} config.bindPassword - Bind password
   * @param {string} config.baseDN - Base DN for searches
   * @param {string} [config.userSearchBase] - User search base DN
   * @param {string} [config.groupSearchBase] - Group search base DN
   * @param {Object} [config.tlsOptions] - TLS configuration
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.url || !config?.baseDN) {
        throw new AppError(
          'LDAP URL and base DN are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'LDAPAPI' }
        );
      }

      this.#config = {
        ...LDAPAPI.#DEFAULT_CONFIG,
        ...config,
        tlsOptions: {
          rejectUnauthorized: true,
          ca: null,
          cert: null,
          key: null,
          passphrase: null,
          secureProtocol: 'TLSv1_2_method',
          ...config.tlsOptions
        }
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#connectionPool = new Map();
      this.#poolSize = 0;

      // Set default search bases if not provided
      this.#config.userSearchBase = config.userSearchBase || config.baseDN;
      this.#config.groupSearchBase = config.groupSearchBase || config.baseDN;

      logger.info('LDAPAPI initialized', {
        url: this.#config.url,
        baseDN: this.#config.baseDN,
        userSearchBase: this.#config.userSearchBase,
        groupSearchBase: this.#config.groupSearchBase,
        maxConnections: this.#config.maxConnections,
        hasTLS: this.#config.protocol === 'ldaps'
      });
    } catch (error) {
      logger.error('LDAPAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize LDAP API service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Establishes connection to LDAP server
   * @param {Object} [options] - Connection options
   * @param {boolean} [options.bind=true] - Perform bind operation
   * @returns {Promise<Object>} Connection status
   */
  async connect(options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (this.#client && this.#client.connected) {
        return { connected: true, reused: true, correlationId };
      }

      logger.info('Connecting to LDAP server', {
        correlationId,
        url: this.#config.url,
        bindDN: this.#config.bindDN
      });

      // Create LDAP client
      this.#client = ldap.createClient({
        url: this.#config.url,
        timeout: this.#config.timeout,
        connectTimeout: this.#config.connectTimeout,
        idleTimeout: this.#config.idleTimeout,
        reconnect: this.#config.reconnect,
        tlsOptions: this.#config.tlsOptions,
        maxConnections: this.#config.maxConnections
      });

      // Set up event handlers
      this.#setupClientEventHandlers(correlationId);

      // Wait for connection
      await new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          reject(new AppError(
            'LDAP connection timeout',
            500,
            ERROR_CODES.LDAP_CONNECTION_TIMEOUT,
            { correlationId, timeout: this.#config.connectTimeout }
          ));
        }, this.#config.connectTimeout);

        this.#client.on('connect', () => {
          clearTimeout(connectTimeout);
          resolve();
        });

        this.#client.on('error', (error) => {
          clearTimeout(connectTimeout);
          reject(error);
        });
      });

      // Perform bind if requested
      if (options.bind !== false && this.#config.bindDN && this.#config.bindPassword) {
        await this.#performBind(this.#config.bindDN, this.#config.bindPassword, correlationId);
      }

      logger.info('LDAP connection established successfully', {
        correlationId,
        bound: options.bind !== false
      });

      return { connected: true, reused: false, correlationId };

    } catch (error) {
      logger.error('LDAP connection failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleLDAPError(error, correlationId);
    }
  }

  /**
   * Authenticates user credentials against LDAP
   * @param {string} username - Username or DN
   * @param {string} password - User password
   * @param {Object} [options] - Authentication options
   * @param {boolean} [options.returnUserData=true] - Return user data on success
   * @returns {Promise<Object>} Authentication result
   */
  async authenticateUser(username, password, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Authenticating LDAP user', {
        correlationId,
        username: username.substring(0, 10) + '...',
        returnUserData: options.returnUserData !== false
      });

      // Ensure connection
      await this.connect();

      // Find user DN if username is not a DN
      let userDN = username;
      let userData = null;

      if (!this.#isDN(username)) {
        const searchResult = await this.#searchUser(username, correlationId);
        if (!searchResult) {
          throw new AppError(
            'User not found',
            404,
            ERROR_CODES.LDAP_USER_NOT_FOUND,
            { correlationId, username }
          );
        }
        userDN = searchResult.dn;
        userData = searchResult;
      }

      // Authenticate with user credentials
      const authClient = ldap.createClient({
        url: this.#config.url,
        timeout: this.#config.timeout,
        connectTimeout: this.#config.connectTimeout,
        tlsOptions: this.#config.tlsOptions
      });

      try {
        await new Promise((resolve, reject) => {
          authClient.bind(userDN, password, (err) => {
            if (err) {
              return reject(new AppError(
                'Invalid credentials',
                401,
                ERROR_CODES.LDAP_INVALID_CREDENTIALS,
                { correlationId, userDN }
              ));
            }
            resolve();
          });
        });

        // Get user data if not already retrieved and requested
        if (options.returnUserData !== false && !userData) {
          userData = await this.#getUserByDN(userDN, correlationId);
        }

        logger.info('LDAP authentication successful', {
          correlationId,
          userDN,
          hasUserData: !!userData
        });

        return {
          authenticated: true,
          userDN,
          userData,
          correlationId
        };

      } finally {
        authClient.unbind(() => {});
      }

    } catch (error) {
      logger.error('LDAP authentication failed', {
        correlationId,
        username: username.substring(0, 10) + '...',
        error: error.message
      });

      throw error instanceof AppError ? error : this.#handleLDAPError(error, correlationId);
    }
  }

  /**
   * Searches for users in LDAP directory
   * @param {string} searchTerm - Search term
   * @param {Object} [options] - Search options
   * @param {string} [options.filter] - Custom LDAP filter
   * @param {Array<string>} [options.attributes] - Attributes to return
   * @param {string} [options.scope] - Search scope
   * @param {number} [options.sizeLimit] - Maximum results
   * @param {boolean} [options.useCache=true] - Use cached results
   * @returns {Promise<Array>} Search results
   */
  async searchUsers(searchTerm, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `ldap:users:${this.#hashSearchTerm(searchTerm)}:${JSON.stringify(options)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('User search results retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Searching LDAP users', {
        correlationId,
        searchTerm: searchTerm.substring(0, 20) + '...',
        hasCustomFilter: !!options.filter,
        scope: options.scope || this.#config.scope
      });

      // Ensure connection
      await this.connect();

      // Build search filter
      const filter = options.filter || this.#buildUserSearchFilter(searchTerm);

      // Perform search
      const searchOptions = {
        filter,
        scope: options.scope || this.#config.scope,
        attributes: options.attributes || Object.values(this.#config.attributeMapping),
        sizeLimit: Math.min(options.sizeLimit || this.#config.sizeLimit, this.#config.sizeLimit),
        timeLimit: this.#config.timeLimit,
        deref: this.#config.deref,
        typesOnly: false,
        paged: this.#config.paged
      };

      const results = await this.#performSearch(this.#config.userSearchBase, searchOptions, correlationId);

      // Map results to standard format
      const users = results.map(entry => this.#mapUserAttributes(entry));

      // Cache results
      if (options.useCache !== false) {
        const cacheKey = `ldap:users:${this.#hashSearchTerm(searchTerm)}:${JSON.stringify(options)}`;
        await this.#cacheService.set(cacheKey, users, this.#config.searchCacheTTL);
      }

      logger.info('User search completed successfully', {
        correlationId,
        resultsCount: users.length
      });

      return users;

    } catch (error) {
      logger.error('User search failed', {
        correlationId,
        searchTerm: searchTerm.substring(0, 20) + '...',
        error: error.message
      });

      throw this.#handleLDAPError(error, correlationId);
    }
  }

  /**
   * Fetches user groups from LDAP
   * @param {string} userDN - User distinguished name
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.recursive=false] - Include nested groups
   * @param {boolean} [options.useCache=true] - Use cached results
   * @returns {Promise<Array>} User groups
   */
  async getUserGroups(userDN, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `ldap:groups:${this.#hashDN(userDN)}:${JSON.stringify(options)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('User groups retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching LDAP user groups', {
        correlationId,
        userDN,
        recursive: options.recursive === true
      });

      // Ensure connection
      await this.connect();

      // Build group search filter
      const filter = this.#config.groupSearchFilter.replace('{userDN}', userDN);

      // Perform search
      const searchOptions = {
        filter,
        scope: this.#config.scope,
        attributes: ['cn', 'distinguishedName', 'description', 'groupType', 'member'],
        sizeLimit: this.#config.sizeLimit,
        timeLimit: this.#config.timeLimit
      };

      const results = await this.#performSearch(this.#config.groupSearchBase, searchOptions, correlationId);

      // Map results to standard format
      let groups = results.map(entry => ({
        dn: entry.dn,
        name: this.#getAttributeValue(entry, 'cn'),
        description: this.#getAttributeValue(entry, 'description'),
        type: this.#getAttributeValue(entry, 'groupType'),
        members: this.#getAttributeValues(entry, 'member')
      }));

      // Fetch nested groups if requested
      if (options.recursive) {
        groups = await this.#getNestedGroups(groups, correlationId);
      }

      // Cache results
      if (options.useCache !== false) {
        const cacheKey = `ldap:groups:${this.#hashDN(userDN)}:${JSON.stringify(options)}`;
        await this.#cacheService.set(cacheKey, groups, this.#config.groupCacheTTL);
      }

      logger.info('User groups fetched successfully', {
        correlationId,
        groupsCount: groups.length
      });

      return groups;

    } catch (error) {
      logger.error('User groups fetch failed', {
        correlationId,
        userDN,
        error: error.message
      });

      throw this.#handleLDAPError(error, correlationId);
    }
  }

  /**
   * Tests LDAP connection and configuration
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Testing LDAP connection', {
        correlationId,
        url: this.#config.url
      });

      const startTime = Date.now();

      // Test connection
      await this.connect({ bind: true });

      // Test search operation
      const testSearchOptions = {
        filter: '(objectClass=*)',
        scope: 'base',
        attributes: ['objectClass'],
        sizeLimit: 1,
        timeLimit: 5
      };

      await this.#performSearch(this.#config.baseDN, testSearchOptions, correlationId);

      const duration = Date.now() - startTime;

      logger.info('LDAP connection test successful', {
        correlationId,
        duration
      });

      return {
        success: true,
        connected: true,
        bound: true,
        searchable: true,
        duration,
        server: this.#config.url,
        baseDN: this.#config.baseDN,
        correlationId
      };

    } catch (error) {
      logger.error('LDAP connection test failed', {
        correlationId,
        error: error.message
      });

      return {
        success: false,
        connected: false,
        bound: false,
        searchable: false,
        error: error.message,
        correlationId
      };
    }
  }

  /**
   * Closes LDAP connection
   * @returns {Promise<void>}
   */
  async disconnect() {
    const correlationId = this.#generateCorrelationId();

    try {
      if (this.#client && this.#client.connected) {
        logger.info('Disconnecting from LDAP server', { correlationId });

        await new Promise((resolve) => {
          this.#client.unbind((err) => {
            if (err) {
              logger.warn('LDAP unbind error', { correlationId, error: err.message });
            }
            resolve();
          });
        });

        this.#client = null;
      }

      // Close connection pool
      for (const [key, client] of this.#connectionPool) {
        try {
          client.unbind(() => {});
        } catch (error) {
          logger.warn('Pool connection unbind error', { key, error: error.message });
        }
      }
      this.#connectionPool.clear();
      this.#poolSize = 0;

      logger.info('LDAP disconnection completed', { correlationId });

    } catch (error) {
      logger.error('LDAP disconnection failed', {
        correlationId,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Sets up LDAP client event handlers
   */
  #setupClientEventHandlers(correlationId) {
    this.#client.on('error', (error) => {
      logger.error('LDAP client error', {
        correlationId,
        error: error.message
      });
    });

    this.#client.on('close', () => {
      logger.info('LDAP connection closed', { correlationId });
    });

    this.#client.on('timeout', () => {
      logger.warn('LDAP connection timeout', { correlationId });
    });

    this.#client.on('idle', () => {
      logger.debug('LDAP connection idle', { correlationId });
    });
  }

  /**
   * @private
   * Performs LDAP bind operation
   */
  async #performBind(bindDN, password, correlationId) {
    return new Promise((resolve, reject) => {
      this.#client.bind(bindDN, password, (err) => {
        if (err) {
          logger.error('LDAP bind failed', {
            correlationId,
            bindDN,
            error: err.message
          });
          return reject(new AppError(
            'LDAP bind failed',
            401,
            ERROR_CODES.LDAP_BIND_FAILED,
            { correlationId, bindDN, originalError: err.message }
          ));
        }

        logger.debug('LDAP bind successful', {
          correlationId,
          bindDN
        });
        resolve();
      });
    });
  }

  /**
   * @private
   * Searches for a specific user
   */
  async #searchUser(username, correlationId) {
    const filter = this.#config.userSearchFilter
      .replace(/{username}/g, ldap.filters.escapeFilterValue(username));

    const searchOptions = {
      filter,
      scope: this.#config.scope,
      attributes: Object.values(this.#config.attributeMapping).concat(['dn']),
      sizeLimit: 1,
      timeLimit: this.#config.timeLimit
    };

    const results = await this.#performSearch(this.#config.userSearchBase, searchOptions, correlationId);
    
    if (results.length === 0) {
      return null;
    }

    return this.#mapUserAttributes(results[0]);
  }

  /**
   * @private
   * Gets user by DN
   */
  async #getUserByDN(userDN, correlationId) {
    const searchOptions = {
      filter: '(objectClass=*)',
      scope: 'base',
      attributes: Object.values(this.#config.attributeMapping),
      sizeLimit: 1,
      timeLimit: this.#config.timeLimit
    };

    const results = await this.#performSearch(userDN, searchOptions, correlationId);
    
    if (results.length === 0) {
      return null;
    }

    return this.#mapUserAttributes(results[0]);
  }

  /**
   * @private
   * Performs LDAP search operation
   */
  async #performSearch(baseDN, options, correlationId) {
    return new Promise((resolve, reject) => {
      const results = [];

      this.#client.search(baseDN, options, (err, res) => {
        if (err) {
          logger.error('LDAP search failed', {
            correlationId,
            baseDN,
            filter: options.filter,
            error: err.message
          });
          return reject(new AppError(
            'LDAP search failed',
            500,
            ERROR_CODES.LDAP_SEARCH_FAILED,
            { correlationId, baseDN, originalError: err.message }
          ));
        }

        res.on('searchEntry', (entry) => {
          results.push({
            dn: entry.dn.toString(),
            attributes: entry.attributes
          });
        });

        res.on('searchReference', (referral) => {
          logger.debug('LDAP search referral', {
            correlationId,
            referral: referral.uris
          });
        });

        res.on('error', (error) => {
          logger.error('LDAP search error', {
            correlationId,
            error: error.message
          });
          reject(new AppError(
            'LDAP search error',
            500,
            ERROR_CODES.LDAP_SEARCH_ERROR,
            { correlationId, originalError: error.message }
          ));
        });

        res.on('end', (result) => {
          if (result.status !== 0) {
            logger.error('LDAP search ended with error', {
              correlationId,
              status: result.status,
              errorMessage: result.errorMessage
            });
            return reject(new AppError(
              `LDAP search failed with status ${result.status}`,
              500,
              ERROR_CODES.LDAP_SEARCH_FAILED,
              { correlationId, status: result.status, errorMessage: result.errorMessage }
            ));
          }

          logger.debug('LDAP search completed', {
            correlationId,
            resultCount: results.length
          });
          resolve(results);
        });
      });
    });
  }

  /**
   * @private
   * Maps LDAP user attributes to standard format
   */
  #mapUserAttributes(entry) {
    const mapping = this.#config.attributeMapping;
    const mapped = {
      dn: entry.dn,
      attributes: {}
    };

    Object.entries(mapping).forEach(([standardName, ldapAttribute]) => {
      const value = this.#getAttributeValue(entry, ldapAttribute);
      if (value !== null) {
        mapped[standardName] = value;
        mapped.attributes[ldapAttribute] = value;
      }
    });

    // Add all other attributes
    if (entry.attributes) {
      entry.attributes.forEach(attr => {
        if (!mapped.attributes[attr.type]) {
          mapped.attributes[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
        }
      });
    }

    return mapped;
  }

  /**
   * @private
   * Gets single attribute value from LDAP entry
   */
  #getAttributeValue(entry, attributeName) {
    if (!entry.attributes) return null;

    const attribute = entry.attributes.find(attr => 
      attr.type.toLowerCase() === attributeName.toLowerCase()
    );

    if (!attribute || !attribute.values || attribute.values.length === 0) {
      return null;
    }

    return attribute.values[0];
  }

  /**
   * @private
   * Gets multiple attribute values from LDAP entry
   */
  #getAttributeValues(entry, attributeName) {
    if (!entry.attributes) return [];

    const attribute = entry.attributes.find(attr => 
      attr.type.toLowerCase() === attributeName.toLowerCase()
    );

    if (!attribute || !attribute.values) {
      return [];
    }

    return attribute.values;
  }

  /**
   * @private
   * Builds user search filter
   */
  #buildUserSearchFilter(searchTerm) {
    const escapedTerm = ldap.filters.escapeFilterValue(searchTerm);
    const objectClassFilter = `(objectClass=${this.#config.userObjectClass})`;
    
    // Search in multiple fields
    const searchFields = [
      this.#config.attributeMapping.username,
      this.#config.attributeMapping.email,
      this.#config.attributeMapping.displayName,
      this.#config.attributeMapping.firstName,
      this.#config.attributeMapping.lastName
    ].filter(Boolean);

    const fieldFilters = searchFields.map(field => `(${field}=*${escapedTerm}*)`).join('');
    
    return `(&${objectClassFilter}(|${fieldFilters}))`;
  }

  /**
   * @private
   * Gets nested groups recursively
   */
  async #getNestedGroups(groups, correlationId) {
    const allGroups = [...groups];
    const processedDNs = new Set(groups.map(g => g.dn));

    for (const group of groups) {
      try {
        const nestedGroups = await this.getUserGroups(group.dn, { 
          recursive: false, 
          useCache: true,
          correlationId 
        });

        for (const nestedGroup of nestedGroups) {
          if (!processedDNs.has(nestedGroup.dn)) {
            allGroups.push(nestedGroup);
            processedDNs.add(nestedGroup.dn);
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch nested groups', {
          correlationId,
          groupDN: group.dn,
          error: error.message
        });
      }
    }

    return allGroups;
  }

  /**
   * @private
   * Checks if a string is a distinguished name
   */
  #isDN(str) {
    return /^(?:(?:[A-Za-z][\w-]*|\d+(?:\.\d+)*)=(?:[^,=+<>#;\\]|\\[,=+<>#;\\]|\\[\dA-Fa-f]{2})+)(?:,(?:(?:[A-Za-z][\w-]*|\d+(?:\.\d+)*)=(?:[^,=+<>#;\\]|\\[,=+<>#;\\]|\\[\dA-Fa-f]{2})+))*$/.test(str);
  }

  /**
   * @private
   * Hashes search term for cache key
   */
  #hashSearchTerm(term) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(term).digest('hex').substring(0, 16);
  }

  /**
   * @private
   * Hashes DN for cache key
   */
  #hashDN(dn) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(dn.toLowerCase()).digest('hex').substring(0, 16);
  }

  /**
   * @private
   * Handles LDAP API errors
   */
  #handleLDAPError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    let errorCode = ERROR_CODES.LDAP_ERROR;
    let message = 'LDAP operation failed';

    if (error.code) {
      switch (error.code) {
        case 'ECONNREFUSED':
          errorCode = ERROR_CODES.LDAP_CONNECTION_REFUSED;
          message = 'LDAP server connection refused';
          break;
        case 'ENOTFOUND':
          errorCode = ERROR_CODES.LDAP_SERVER_NOT_FOUND;
          message = 'LDAP server not found';
          break;
        case 'ETIMEDOUT':
          errorCode = ERROR_CODES.LDAP_CONNECTION_TIMEOUT;
          message = 'LDAP connection timeout';
          break;
        case 'ECONNRESET':
          errorCode = ERROR_CODES.LDAP_CONNECTION_RESET;
          message = 'LDAP connection reset';
          break;
      }
    }

    // LDAP specific errors
    if (error.name === 'InvalidCredentialsError') {
      errorCode = ERROR_CODES.LDAP_INVALID_CREDENTIALS;
      message = 'Invalid LDAP credentials';
    } else if (error.name === 'InsufficientAccessRightsError') {
      errorCode = ERROR_CODES.LDAP_INSUFFICIENT_ACCESS;
      message = 'Insufficient LDAP access rights';
    } else if (error.name === 'NoSuchObjectError') {
      errorCode = ERROR_CODES.LDAP_NO_SUCH_OBJECT;
      message = 'LDAP object not found';
    }

    return new AppError(
      message,
      error.status || 500,
      errorCode,
      {
        correlationId,
        ldapError: error.name,
        ldapMessage: error.message,
        ldapCode: error.code,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `ldap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const testResult = await this.testConnection();

      return {
        healthy: testResult.success,
        service: 'LDAPAPI',
        server: this.#config.url,
        baseDN: this.#config.baseDN,
        connected: testResult.connected,
        bound: testResult.bound,
        searchable: testResult.searchable,
        protocol: this.#config.protocol,
        port: this.#config.port,
        connectionPoolSize: this.#poolSize,
        features: {
          paging: this.#config.paged,
          tls: this.#config.protocol === 'ldaps'
        }
      };
    } catch (error) {
      logger.error('LDAP health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'LDAPAPI',
        error: error.message
      };
    }
  }
}

module.exports = LDAPAPI;