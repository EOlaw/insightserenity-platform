'use strict';

/**
 * @fileoverview LinkedIn API integration service
 * @module shared/lib/integrations/social/linkedin-api
 * @requires module:axios
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/external-api-service
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const ExternalApiService = require('../../services/external-api-service');

/**
 * @class LinkedInAPI
 * @description Handles LinkedIn OAuth 2.0 authentication and API operations
 * Implements profile retrieval, connections access, and content sharing
 */
class LinkedInAPI {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for token and profile caching
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   * @description Encryption service for token security
   */
  #encryptionService;

  /**
   * @private
   * @type {ExternalApiService}
   * @description External API service for HTTP requests
   */
  #apiService;

  /**
   * @private
   * @type {Object}
   * @description Axios instance for API calls
   */
  #axiosInstance;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    apiVersion: 'v2',
    baseURL: 'https://api.linkedin.com',
    authURL: 'https://www.linkedin.com/oauth/v2',
    tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    cacheTTL: 3600,
    profileCacheTTL: 86400,
    scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social'],
    profileProjection: '(id,firstName,lastName,profilePicture(displayImage~:playableStreams))'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description LinkedIn API endpoints
   */
  static #ENDPOINTS = {
    ME: '/v2/me',
    EMAIL: '/v2/emailAddress?q=members&projection=(elements*(handle~))',
    CONNECTIONS: '/v2/connections',
    SHARES: '/v2/ugcPosts',
    COMPANIES: '/v2/organizationalEntityFollowerStatistics',
    PROFILE: '/v2/people/(id:{profileId})'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description LinkedIn specific error codes
   */
  static #LINKEDIN_ERRORS = {
    401: 'Invalid or expired access token',
    403: 'Insufficient permissions',
    404: 'Resource not found',
    429: 'Rate limit exceeded',
    500: 'LinkedIn server error',
    503: 'Service temporarily unavailable'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Share visibility options
   */
  static #VISIBILITY = {
    ANYONE: 'anyone',
    CONNECTIONS: 'connections-only',
    LOGGED_IN: 'logged-in'
  };

  /**
   * Creates a new LinkedInAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.clientId - LinkedIn app client ID
   * @param {string} config.clientSecret - LinkedIn app client secret
   * @param {string} config.redirectUri - OAuth redirect URI
   * @param {Array<string>} [config.scopes] - OAuth scopes
   * @param {number} [config.timeout=30000] - Request timeout
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @param {ExternalApiService} [apiService] - External API service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService, apiService) {
    try {
      if (!config?.clientId || !config?.clientSecret) {
        throw new AppError(
          'LinkedIn client ID and secret are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'LinkedInAPI' }
        );
      }

      if (!config.redirectUri) {
        throw new AppError(
          'LinkedIn redirect URI is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'redirectUri' }
        );
      }

      this.#config = {
        ...LinkedInAPI.#DEFAULT_CONFIG,
        ...config,
        scopes: config.scopes || LinkedInAPI.#DEFAULT_CONFIG.scopes
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#apiService = apiService || new ExternalApiService();

      // Initialize axios instance
      this.#axiosInstance = axios.create({
        baseURL: this.#config.baseURL,
        timeout: this.#config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      // Add request/response interceptors
      this.#setupInterceptors();

      logger.info('LinkedInAPI initialized', {
        scopes: this.#config.scopes,
        hasEncryption: !!this.#encryptionService
      });
    } catch (error) {
      logger.error('LinkedInAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize LinkedIn API service',
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
   * @returns {string} Authorization URL
   */
  generateAuthorizationUrl(options = {}) {
    try {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: this.#config.clientId,
        redirect_uri: this.#config.redirectUri,
        scope: [...this.#config.scopes, ...(options.additionalScopes || [])].join(' ')
      });

      if (options.state) {
        params.append('state', options.state);
      }

      const authUrl = `${this.#config.authURL}/authorization?${params.toString()}`;

      logger.info('Generated LinkedIn authorization URL', {
        scopes: this.#config.scopes,
        hasState: !!options.state
      });

      return authUrl;
    } catch (error) {
      logger.error('Failed to generate authorization URL', error);
      throw new AppError(
        'Failed to generate LinkedIn authorization URL',
        500,
        ERROR_CODES.OAUTH_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Exchanges authorization code for access token
   * @param {string} code - Authorization code
   * @param {Object} [options] - Exchange options
   * @returns {Promise<Object>} Token response
   * @throws {AppError} If token exchange fails
   */
  async exchangeCodeForToken(code, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Exchanging LinkedIn authorization code', { correlationId });

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.#config.redirectUri,
        client_id: this.#config.clientId,
        client_secret: this.#config.clientSecret
      });

      const response = await axios.post(this.#config.tokenURL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: this.#config.timeout
      });

      const tokenData = {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        expiresAt: Date.now() + (response.data.expires_in * 1000),
        scope: response.data.scope
      };

      // Encrypt and cache token
      if (options.userId) {
        await this.#cacheToken(options.userId, tokenData);
      }

      logger.info('LinkedIn token exchange successful', {
        correlationId,
        expiresIn: tokenData.expiresIn
      });

      return tokenData;

    } catch (error) {
      logger.error('LinkedIn token exchange failed', {
        correlationId,
        error: error.message,
        status: error.response?.status
      });

      throw this.#handleLinkedInError(error, correlationId);
    }
  }

  /**
   * Refreshes an expired access token
   * @param {string} refreshToken - Refresh token
   * @param {Object} [options] - Refresh options
   * @returns {Promise<Object>} New token response
   * @throws {AppError} If refresh fails
   */
  async refreshAccessToken(refreshToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Refreshing LinkedIn access token', { correlationId });

      // Note: LinkedIn doesn't support refresh tokens in the traditional sense
      // Tokens are valid for 60 days, after which user must re-authenticate
      throw new AppError(
        'LinkedIn does not support refresh tokens. User must re-authenticate.',
        400,
        ERROR_CODES.OAUTH_ERROR,
        { correlationId }
      );

    } catch (error) {
      logger.error('Token refresh failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : this.#handleLinkedInError(error, correlationId);
    }
  }

  /**
   * Fetches user profile information
   * @param {string} accessToken - LinkedIn access token
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.includeEmail=true] - Include email address
   * @param {boolean} [options.useCache=true] - Use cached profile
   * @returns {Promise<Object>} User profile data
   * @throws {AppError} If profile fetch fails
   */
  async fetchUserProfile(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `linkedin:profile:${await this.#hashToken(accessToken)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Profile retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching LinkedIn user profile', {
        correlationId,
        includeEmail: options.includeEmail !== false
      });

      // Fetch basic profile
      const profileResponse = await this.#makeAuthenticatedRequest(
        LinkedInAPI.#ENDPOINTS.ME + '?projection=' + this.#config.profileProjection,
        accessToken
      );

      const profile = this.#formatProfile(profileResponse.data);

      // Fetch email if requested
      if (options.includeEmail !== false) {
        try {
          const emailResponse = await this.#makeAuthenticatedRequest(
            LinkedInAPI.#ENDPOINTS.EMAIL,
            accessToken
          );

          if (emailResponse.data.elements?.[0]?.['handle~']) {
            profile.email = emailResponse.data.elements[0]['handle~'].emailAddress;
          }
        } catch (error) {
          logger.warn('Failed to fetch email address', {
            correlationId,
            error: error.message
          });
        }
      }

      // Cache the profile
      if (options.useCache !== false) {
        const cacheKey = `linkedin:profile:${await this.#hashToken(accessToken)}`;
        await this.#cacheService.set(cacheKey, profile, this.#config.profileCacheTTL);
      }

      logger.info('LinkedIn profile fetched successfully', {
        correlationId,
        profileId: profile.id
      });

      return profile;

    } catch (error) {
      logger.error('Profile fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleLinkedInError(error, correlationId);
    }
  }

  /**
   * Fetches user's connections
   * @param {string} accessToken - LinkedIn access token
   * @param {Object} [options] - Fetch options
   * @param {number} [options.start=0] - Starting index
   * @param {number} [options.count=50] - Number of connections
   * @returns {Promise<Object>} Connections data
   * @throws {AppError} If fetch fails
   */
  async getConnections(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Fetching LinkedIn connections', {
        correlationId,
        start: options.start || 0,
        count: options.count || 50
      });

      const params = new URLSearchParams({
        start: options.start || 0,
        count: Math.min(options.count || 50, 100) // LinkedIn max is 100
      });

      const response = await this.#makeAuthenticatedRequest(
        `${LinkedInAPI.#ENDPOINTS.CONNECTIONS}?${params.toString()}`,
        accessToken
      );

      const connections = {
        total: response.data.paging?.total || 0,
        start: response.data.paging?.start || 0,
        count: response.data.paging?.count || 0,
        connections: (response.data.elements || []).map(conn => ({
          id: conn.id,
          firstName: conn.firstName?.localized?.[Object.keys(conn.firstName.localized)[0]],
          lastName: conn.lastName?.localized?.[Object.keys(conn.lastName.localized)[0]],
          headline: conn.headline?.localized?.[Object.keys(conn.headline.localized)[0]],
          profilePicture: this.#extractProfilePicture(conn.profilePicture)
        }))
      };

      logger.info('Connections fetched successfully', {
        correlationId,
        total: connections.total,
        fetched: connections.connections.length
      });

      return connections;

    } catch (error) {
      logger.error('Connections fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleLinkedInError(error, correlationId);
    }
  }

  /**
   * Shares content on LinkedIn
   * @param {string} accessToken - LinkedIn access token
   * @param {Object} shareData - Content to share
   * @param {string} shareData.text - Share text content
   * @param {string} [shareData.url] - URL to share
   * @param {string} [shareData.title] - Share title
   * @param {string} [shareData.description] - Share description
   * @param {string} [shareData.visibility='anyone'] - Share visibility
   * @param {Object} [options] - Share options
   * @returns {Promise<Object>} Share response
   * @throws {AppError} If share fails
   */
  async shareContent(accessToken, shareData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Sharing content on LinkedIn', {
        correlationId,
        hasUrl: !!shareData.url,
        visibility: shareData.visibility || LinkedInAPI.#VISIBILITY.ANYONE
      });

      // Get author URN
      const profile = await this.fetchUserProfile(accessToken, { 
        includeEmail: false,
        correlationId 
      });

      const authorUrn = `urn:li:person:${profile.id}`;

      // Build share payload
      const payload = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: shareData.text
            },
            shareMediaCategory: shareData.url ? 'ARTICLE' : 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 
            shareData.visibility?.toUpperCase() || 'PUBLIC'
        }
      };

      // Add media if URL provided
      if (shareData.url) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
          status: 'READY',
          originalUrl: shareData.url,
          title: {
            text: shareData.title || ''
          },
          description: {
            text: shareData.description || ''
          }
        }];
      }

      const response = await this.#makeAuthenticatedRequest(
        LinkedInAPI.#ENDPOINTS.SHARES,
        accessToken,
        {
          method: 'POST',
          data: payload
        }
      );

      logger.info('Content shared successfully', {
        correlationId,
        shareId: response.data.id
      });

      return {
        id: response.data.id,
        author: authorUrn,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Content share failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleLinkedInError(error, correlationId);
    }
  }

  /**
   * Validates an access token
   * @param {string} accessToken - Access token to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(accessToken) {
    try {
      logger.info('Validating LinkedIn access token');

      // Attempt to fetch minimal profile data
      const profile = await this.fetchUserProfile(accessToken, {
        includeEmail: false,
        useCache: false
      });

      return {
        valid: true,
        profileId: profile.id,
        expiresAt: null // LinkedIn doesn't provide expiration in API
      };

    } catch (error) {
      logger.warn('Token validation failed', { error: error.message });

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
    try {
      logger.info('Revoking LinkedIn access token');

      // LinkedIn doesn't provide a programmatic revocation endpoint
      // Tokens expire after 60 days or can be revoked through LinkedIn settings

      // Clear from cache
      const tokenHash = await this.#hashToken(accessToken);
      await this.#cacheService.delete(`linkedin:token:*${tokenHash}*`);
      await this.#cacheService.delete(`linkedin:profile:${tokenHash}`);

      return {
        success: true,
        message: 'Token removed from cache. User must revoke through LinkedIn settings.'
      };

    } catch (error) {
      logger.error('Token revocation failed', { error: error.message });
      
      throw new AppError(
        'Failed to revoke token',
        500,
        ERROR_CODES.OAUTH_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Sets up axios interceptors
   */
  #setupInterceptors() {
    // Request interceptor
    this.#axiosInstance.interceptors.request.use(
      config => {
        config.headers['X-Request-ID'] = this.#generateCorrelationId();
        return config;
      },
      error => Promise.reject(error)
    );

    // Response interceptor
    this.#axiosInstance.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          logger.warn(`LinkedIn rate limit hit, retry after ${retryAfter}s`);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * @private
   * Makes authenticated API request
   */
  async #makeAuthenticatedRequest(endpoint, accessToken, options = {}) {
    const config = {
      method: options.method || 'GET',
      url: endpoint,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers
      },
      ...options
    };

    const response = await this.#axiosInstance.request(config);
    return response;
  }

  /**
   * @private
   * Formats profile data
   */
  #formatProfile(rawProfile) {
    const profile = {
      id: rawProfile.id,
      firstName: rawProfile.firstName?.localized?.[Object.keys(rawProfile.firstName.localized)[0]],
      lastName: rawProfile.lastName?.localized?.[Object.keys(rawProfile.lastName.localized)[0]],
      profilePicture: this.#extractProfilePicture(rawProfile.profilePicture)
    };

    if (rawProfile.headline) {
      profile.headline = rawProfile.headline.localized?.[Object.keys(rawProfile.headline.localized)[0]];
    }

    return profile;
  }

  /**
   * @private
   * Extracts profile picture URL
   */
  #extractProfilePicture(profilePicture) {
    if (!profilePicture?.['displayImage~']?.elements?.length) {
      return null;
    }

    const elements = profilePicture['displayImage~'].elements;
    const largestImage = elements[elements.length - 1];
    
    return largestImage?.identifiers?.[0]?.identifier || null;
  }

  /**
   * @private
   * Caches encrypted token
   */
  async #cacheToken(userId, tokenData) {
    try {
      const encryptedToken = await this.#encryptionService.encrypt(
        tokenData.accessToken
      );

      const cacheData = {
        ...tokenData,
        accessToken: encryptedToken
      };

      const cacheKey = `linkedin:token:${userId}`;
      await this.#cacheService.set(cacheKey, cacheData, tokenData.expiresIn);

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
   * Handles LinkedIn API errors
   */
  #handleLinkedInError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const status = error.response?.status;
    const errorMessage = LinkedInAPI.#LINKEDIN_ERRORS[status] || 'LinkedIn API error';

    let errorCode = ERROR_CODES.EXTERNAL_API_ERROR;
    if (status === 401) errorCode = ERROR_CODES.UNAUTHORIZED;
    if (status === 403) errorCode = ERROR_CODES.FORBIDDEN;
    if (status === 404) errorCode = ERROR_CODES.NOT_FOUND;
    if (status === 429) errorCode = ERROR_CODES.RATE_LIMIT_ERROR;

    return new AppError(
      errorMessage,
      status || 500,
      errorCode,
      {
        correlationId,
        linkedinError: error.response?.data?.message,
        serviceErrorCode: error.response?.data?.serviceErrorCode
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `linkedin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Check if we can reach LinkedIn's OAuth endpoint
      await axios.get(`${this.#config.authURL}/.well-known/openid-configuration`, {
        timeout: 5000
      });

      return {
        healthy: true,
        service: 'LinkedInAPI',
        apiVersion: this.#config.apiVersion
      };
    } catch (error) {
      logger.error('LinkedIn health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'LinkedInAPI',
        error: error.message
      };
    }
  }
}

module.exports = LinkedInAPI;