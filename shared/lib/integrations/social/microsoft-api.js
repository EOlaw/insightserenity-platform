'use strict';

/**
 * @fileoverview Microsoft Graph API integration service
 * @module shared/lib/integrations/social/microsoft-api
 * @requires module:@azure/msal-node
 * @requires module:axios
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class MicrosoftAPI
 * @description Handles Microsoft Graph API operations with comprehensive functionality
 * Implements profile access, organizational data, calendar, and Teams integration
 */
class MicrosoftAPI {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for token and data caching
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
   * @type {ConfidentialClientApplication}
   * @description MSAL client application instance
   */
  #msalClient;

  /**
   * @private
   * @type {Map}
   * @description Map of axios instances per access token
   */
  #httpClients;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    apiVersion: 'v1.0',
    baseURL: 'https://graph.microsoft.com',
    authority: 'https://login.microsoftonline.com/common',
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    cacheTTL: 3600,
    profileCacheTTL: 86400,
    photosCacheTTL: 43200,
    scopes: ['openid', 'profile', 'email', 'User.Read', 'User.ReadBasic.All'],
    userAgent: 'InsightSerenity-Platform/1.0',
    perPage: 25,
    maxPerPage: 999
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Microsoft Graph API endpoints
   */
  static #ENDPOINTS = {
    ME: '/me',
    ME_PHOTO: '/me/photo/$value',
    ME_GROUPS: '/me/memberOf',
    ME_MANAGER: '/me/manager',
    ME_DIRECT_REPORTS: '/me/directReports',
    ME_CALENDAR: '/me/calendar',
    ME_EVENTS: '/me/events',
    ME_MESSAGES: '/me/messages',
    ME_DRIVE: '/me/drive',
    USERS: '/users',
    GROUPS: '/groups',
    ORGANIZATION: '/organization',
    TEAMS: '/me/joinedTeams',
    PRESENCE: '/me/presence'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Microsoft tenant types
   */
  static #TENANT_TYPES = {
    COMMON: 'common',
    ORGANIZATIONS: 'organizations',
    CONSUMERS: 'consumers'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description User presence states
   */
  static #PRESENCE_STATES = {
    AVAILABLE: 'Available',
    BUSY: 'Busy',
    DO_NOT_DISTURB: 'DoNotDisturb',
    AWAY: 'Away',
    BE_RIGHT_BACK: 'BeRightBack',
    OFFLINE: 'Offline'
  };

  /**
   * Creates a new MicrosoftAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.clientId - Microsoft application client ID
   * @param {string} config.clientSecret - Microsoft application client secret
   * @param {string} config.tenantId - Microsoft tenant ID
   * @param {string} config.redirectUri - OAuth redirect URI
   * @param {Array<string>} [config.scopes] - OAuth scopes
   * @param {string} [config.userAgent] - User agent string
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.clientId || !config?.clientSecret) {
        throw new AppError(
          'Microsoft client ID and secret are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'MicrosoftAPI' }
        );
      }

      if (!config.tenantId) {
        throw new AppError(
          'Microsoft tenant ID is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'tenantId' }
        );
      }

      this.#config = {
        ...MicrosoftAPI.#DEFAULT_CONFIG,
        ...config,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        scopes: config.scopes || MicrosoftAPI.#DEFAULT_CONFIG.scopes
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#httpClients = new Map();

      // Initialize MSAL client
      this.#msalClient = new ConfidentialClientApplication({
        auth: {
          clientId: this.#config.clientId,
          clientSecret: this.#config.clientSecret,
          authority: this.#config.authority
        },
        cache: {
          cacheLocation: 'fileCache'
        },
        system: {
          loggerOptions: {
            loggerCallback: (level, message) => {
              logger.debug('MSAL Debug', { level, message });
            },
            piiLoggingEnabled: false,
            logLevel: 'Error'
          }
        }
      });

      logger.info('MicrosoftAPI initialized', {
        tenantId: config.tenantId,
        scopes: this.#config.scopes,
        userAgent: this.#config.userAgent
      });
    } catch (error) {
      logger.error('MicrosoftAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize Microsoft API service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates OAuth authorization URL
   * @param {Object} [options] - Authorization options
   * @param {string} [options.state] - OAuth state parameter
   * @param {Array<string>} [options.additionalScopes] - Additional scopes
   * @param {string} [options.prompt] - Prompt parameter
   * @param {string} [options.loginHint] - Login hint email
   * @returns {Promise<string>} Authorization URL
   */
  async generateAuthorizationUrl(options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      const authCodeUrlParameters = {
        scopes: [...this.#config.scopes, ...(options.additionalScopes || [])],
        redirectUri: this.#config.redirectUri,
        state: options.state,
        prompt: options.prompt || 'select_account',
        loginHint: options.loginHint,
        correlationId
      };

      const response = await this.#msalClient.getAuthCodeUrl(authCodeUrlParameters);

      logger.info('Generated Microsoft authorization URL', {
        correlationId,
        scopes: authCodeUrlParameters.scopes,
        hasState: !!options.state
      });

      return response;
    } catch (error) {
      logger.error('Failed to generate authorization URL', {
        correlationId,
        error: error.message
      });
      throw new AppError(
        'Failed to generate Microsoft authorization URL',
        500,
        ERROR_CODES.OAUTH_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Exchanges authorization code for access token
   * @param {string} code - Authorization code
   * @param {Object} [options] - Exchange options
   * @param {string} [options.state] - OAuth state for validation
   * @returns {Promise<Object>} Token response
   * @throws {AppError} If token exchange fails
   */
  async exchangeCodeForToken(code, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Exchanging Microsoft authorization code', { correlationId });

      const tokenRequest = {
        code,
        scopes: this.#config.scopes,
        redirectUri: this.#config.redirectUri,
        correlationId
      };

      const response = await this.#msalClient.acquireTokenByCode(tokenRequest);

      const tokenData = {
        accessToken: response.accessToken,
        tokenType: 'Bearer',
        expiresIn: response.expiresOn ? Math.floor((response.expiresOn.getTime() - Date.now()) / 1000) : 3600,
        scope: response.scopes.join(' '),
        refreshToken: response.refreshToken,
        idToken: response.idToken,
        createdAt: Date.now(),
        account: response.account
      };

      // Cache token
      if (response.account?.homeAccountId) {
        await this.#cacheToken(response.account.homeAccountId, tokenData);
      }

      logger.info('Microsoft token exchange successful', {
        correlationId,
        username: response.account?.username,
        tenantId: response.account?.tenantId
      });

      return tokenData;

    } catch (error) {
      logger.error('Microsoft token exchange failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleMicrosoftError(error, correlationId);
    }
  }

  /**
   * Fetches user profile information
   * @param {string} accessToken - Microsoft access token
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.includePhoto=false] - Include profile photo
   * @param {boolean} [options.includeManager=false] - Include manager information
   * @param {boolean} [options.includeGroups=false] - Include group memberships
   * @param {boolean} [options.useCache=true] - Use cached profile
   * @returns {Promise<Object>} User profile data
   * @throws {AppError} If profile fetch fails
   */
  async getUserProfile(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `microsoft:profile:${await this.#hashToken(accessToken)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Profile retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching Microsoft user profile', {
        correlationId,
        includePhoto: options.includePhoto === true,
        includeManager: options.includeManager === true,
        includeGroups: options.includeGroups === true
      });

      const client = await this.#getHttpClient(accessToken);

      // Fetch basic profile
      const { data: user } = await client.get(MicrosoftAPI.#ENDPOINTS.ME);

      const profile = {
        id: user.id,
        userPrincipalName: user.userPrincipalName,
        displayName: user.displayName,
        givenName: user.givenName,
        surname: user.surname,
        mail: user.mail,
        mobilePhone: user.mobilePhone,
        businessPhones: user.businessPhones || [],
        jobTitle: user.jobTitle,
        department: user.department,
        companyName: user.companyName,
        officeLocation: user.officeLocation,
        preferredLanguage: user.preferredLanguage,
        accountEnabled: user.accountEnabled,
        createdDateTime: user.createdDateTime,
        lastPasswordChangeDateTime: user.lastPasswordChangeDateTime,
        passwordPolicies: user.passwordPolicies,
        usageLocation: user.usageLocation,
        isResourceAccount: user.isResourceAccount
      };

      // Fetch profile photo if requested
      if (options.includePhoto) {
        try {
          const photoUrl = await this.#getUserPhoto(accessToken, correlationId);
          profile.photoUrl = photoUrl;
        } catch (error) {
          logger.debug('Failed to fetch profile photo', {
            correlationId,
            error: error.message
          });
        }
      }

      // Fetch manager if requested
      if (options.includeManager) {
        try {
          const { data: manager } = await client.get(MicrosoftAPI.#ENDPOINTS.ME_MANAGER);
          profile.manager = {
            id: manager.id,
            displayName: manager.displayName,
            userPrincipalName: manager.userPrincipalName,
            mail: manager.mail,
            jobTitle: manager.jobTitle
          };
        } catch (error) {
          logger.debug('Failed to fetch manager information', {
            correlationId,
            error: error.message
          });
        }
      }

      // Fetch group memberships if requested
      if (options.includeGroups) {
        const groups = await this.#getUserGroups(accessToken, correlationId);
        profile.groups = groups;
      }

      // Cache the profile
      if (options.useCache !== false) {
        const cacheKey = `microsoft:profile:${await this.#hashToken(accessToken)}`;
        await this.#cacheService.set(cacheKey, profile, this.#config.profileCacheTTL);
      }

      logger.info('Microsoft profile fetched successfully', {
        correlationId,
        userPrincipalName: profile.userPrincipalName
      });

      return profile;

    } catch (error) {
      logger.error('Profile fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleMicrosoftError(error, correlationId);
    }
  }

  /**
   * Fetches user's profile photo
   * @param {string} accessToken - Microsoft access token
   * @param {string} [correlationId] - Correlation ID
   * @returns {Promise<string|null>} Base64 encoded photo or null
   */
  async getUserPhoto(accessToken, correlationId) {
    return this.#getUserPhoto(accessToken, correlationId);
  }

  /**
   * @private
   * Fetches user's profile photo
   */
  async #getUserPhoto(accessToken, correlationId) {
    try {
      const client = await this.#getHttpClient(accessToken);
      
      const response = await client.get(MicrosoftAPI.#ENDPOINTS.ME_PHOTO, {
        responseType: 'arraybuffer'
      });

      if (response.data) {
        const base64Photo = Buffer.from(response.data).toString('base64');
        const contentType = response.headers['content-type'] || 'image/jpeg';
        return `data:${contentType};base64,${base64Photo}`;
      }

      return null;

    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug('User has no profile photo', { correlationId });
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetches user's groups and organizational units
   * @param {string} accessToken - Microsoft access token
   * @param {Object} [options] - Fetch options
   * @param {number} [options.top=25] - Number of results to return
   * @param {boolean} [options.useCache=true] - Use cached data
   * @returns {Promise<Array>} User groups
   */
  async getUserGroups(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    return this.#getUserGroups(accessToken, correlationId, options);
  }

  /**
   * @private
   * Fetches user's groups
   */
  async #getUserGroups(accessToken, correlationId, options = {}) {
    try {
      // Check cache
      if (options.useCache !== false) {
        const cacheKey = `microsoft:groups:${await this.#hashToken(accessToken)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Groups retrieved from cache', { correlationId });
          return cached;
        }
      }

      const client = await this.#getHttpClient(accessToken);
      
      const response = await client.get(MicrosoftAPI.#ENDPOINTS.ME_GROUPS, {
        params: {
          $top: Math.min(options.top || 25, this.#config.maxPerPage),
          $select: 'id,displayName,description,mail,groupTypes,securityEnabled'
        }
      });

      const groups = response.data.value.map(group => ({
        id: group.id,
        displayName: group.displayName,
        description: group.description,
        mail: group.mail,
        groupTypes: group.groupTypes || [],
        securityEnabled: group.securityEnabled,
        isUnified: group.groupTypes?.includes('Unified') || false,
        isDynamic: group.groupTypes?.includes('DynamicMembership') || false
      }));

      // Cache the results
      if (options.useCache !== false) {
        const cacheKey = `microsoft:groups:${await this.#hashToken(accessToken)}`;
        await this.#cacheService.set(cacheKey, groups, this.#config.cacheTTL);
      }

      logger.info('User groups fetched successfully', {
        correlationId,
        groupsCount: groups.length
      });

      return groups;

    } catch (error) {
      logger.error('Groups fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleMicrosoftError(error, correlationId);
    }
  }

  /**
   * Fetches user's manager information
   * @param {string} accessToken - Microsoft access token
   * @param {Object} [options] - Fetch options
   * @returns {Promise<Object|null>} Manager information
   */
  async getUserManager(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      const client = await this.#getHttpClient(accessToken);
      
      const { data: manager } = await client.get(MicrosoftAPI.#ENDPOINTS.ME_MANAGER, {
        params: {
          $select: 'id,displayName,userPrincipalName,mail,jobTitle,department,officeLocation'
        }
      });

      return {
        id: manager.id,
        displayName: manager.displayName,
        userPrincipalName: manager.userPrincipalName,
        mail: manager.mail,
        jobTitle: manager.jobTitle,
        department: manager.department,
        officeLocation: manager.officeLocation
      };

    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug('User has no manager', { correlationId });
        return null;
      }

      logger.error('Manager fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleMicrosoftError(error, correlationId);
    }
  }

  /**
   * Fetches user's direct reports
   * @param {string} accessToken - Microsoft access token
   * @param {Object} [options] - Fetch options
   * @param {number} [options.top=25] - Number of results to return
   * @returns {Promise<Array>} Direct reports
   */
  async getUserDirectReports(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      const client = await this.#getHttpClient(accessToken);
      
      const response = await client.get(MicrosoftAPI.#ENDPOINTS.ME_DIRECT_REPORTS, {
        params: {
          $top: Math.min(options.top || 25, this.#config.maxPerPage),
          $select: 'id,displayName,userPrincipalName,mail,jobTitle,department'
        }
      });

      const directReports = response.data.value.map(report => ({
        id: report.id,
        displayName: report.displayName,
        userPrincipalName: report.userPrincipalName,
        mail: report.mail,
        jobTitle: report.jobTitle,
        department: report.department
      }));

      logger.info('Direct reports fetched successfully', {
        correlationId,
        reportsCount: directReports.length
      });

      return directReports;

    } catch (error) {
      logger.error('Direct reports fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleMicrosoftError(error, correlationId);
    }
  }

  /**
   * Validates an access token
   * @param {string} accessToken - Access token to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(accessToken) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Validating Microsoft access token', { correlationId });

      const client = await this.#getHttpClient(accessToken);
      
      // Test token with basic profile endpoint
      const { data: user } = await client.get(MicrosoftAPI.#ENDPOINTS.ME, {
        params: { $select: 'id,userPrincipalName,displayName' }
      });

      return {
        valid: true,
        userPrincipalName: user.userPrincipalName,
        userId: user.id,
        displayName: user.displayName
      };

    } catch (error) {
      logger.warn('Token validation failed', {
        correlationId,
        error: error.message
      });

      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Revokes access token
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<Object>} Revocation result
   */
  async revokeToken(accessToken) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Revoking Microsoft access token', { correlationId });

      // Clear from cache and instances
      const tokenHash = await this.#hashToken(accessToken);
      await this.#cacheService.delete(`microsoft:token:*${tokenHash}*`);
      await this.#cacheService.delete(`microsoft:profile:${tokenHash}`);
      await this.#cacheService.delete(`microsoft:groups:${tokenHash}`);
      this.#httpClients.delete(accessToken);

      logger.info('Token revoked successfully', { correlationId });

      return {
        success: true,
        message: 'Token revoked successfully'
      };

    } catch (error) {
      logger.error('Token revocation failed', {
        correlationId,
        error: error.message
      });
      
      throw this.#handleMicrosoftError(error, correlationId);
    }
  }

  /**
   * @private
   * Gets or creates HTTP client
   */
  async #getHttpClient(accessToken) {
    if (this.#httpClients.has(accessToken)) {
      return this.#httpClients.get(accessToken);
    }

    const client = axios.create({
      baseURL: `${this.#config.baseURL}/${this.#config.apiVersion}`,
      timeout: this.#config.timeout,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': this.#config.userAgent,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    client.interceptors.response.use(
      response => response,
      error => {
        logger.error('Microsoft API request failed', {
          url: error.config?.url,
          status: error.response?.status,
          error: error.response?.data?.error || error.message
        });
        return Promise.reject(error);
      }
    );

    this.#httpClients.set(accessToken, client);

    // Clean up old clients if too many
    if (this.#httpClients.size > 100) {
      const firstKey = this.#httpClients.keys().next().value;
      this.#httpClients.delete(firstKey);
    }

    return client;
  }

  /**
   * @private
   * Caches encrypted token
   */
  async #cacheToken(accountId, tokenData) {
    try {
      const encryptedToken = await this.#encryptionService.encrypt(
        tokenData.accessToken
      );

      const cacheData = {
        ...tokenData,
        accessToken: encryptedToken
      };

      const cacheKey = `microsoft:token:${accountId}`;
      await this.#cacheService.set(cacheKey, cacheData, this.#config.cacheTTL);

    } catch (error) {
      logger.error('Failed to cache token', { error: error.message });
    }
  }

  /**
   * @private
   * Hashes token for cache key
   */
  async #hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * @private
   * Handles Microsoft API errors
   */
  #handleMicrosoftError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const status = error.status || error.response?.status;
    const errorData = error.response?.data?.error;
    let errorCode = ERROR_CODES.EXTERNAL_API_ERROR;
    let message = 'Microsoft API error';

    if (status === 401) {
      errorCode = ERROR_CODES.UNAUTHORIZED;
      message = 'Invalid or expired access token';
    } else if (status === 403) {
      errorCode = ERROR_CODES.FORBIDDEN;
      message = 'Insufficient permissions';
    } else if (status === 404) {
      errorCode = ERROR_CODES.NOT_FOUND;
      message = 'Resource not found';
    } else if (status === 429) {
      errorCode = ERROR_CODES.RATE_LIMIT_EXCEEDED;
      message = 'Microsoft API rate limit exceeded';
    } else if (errorData) {
      message = errorData.message || message;
    }

    return new AppError(
      message,
      status || 500,
      errorCode,
      {
        correlationId,
        microsoftError: errorData?.code,
        microsoftMessage: errorData?.message,
        innerError: errorData?.innerError
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `microsoft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Check Microsoft Graph status
      const response = await axios.get(`${this.#config.baseURL}/v1.0/$metadata`, {
        timeout: 5000,
        headers: {
          'User-Agent': this.#config.userAgent
        }
      });

      return {
        healthy: true,
        service: 'MicrosoftAPI',
        apiVersion: this.#config.apiVersion,
        tenantId: this.#config.tenantId
      };
    } catch (error) {
      logger.error('Microsoft health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'MicrosoftAPI',
        error: error.message
      };
    }
  }
}

module.exports = MicrosoftAPI;