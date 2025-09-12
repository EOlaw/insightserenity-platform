'use strict';

/**
 * @fileoverview OpenID Connect discovery and operations service
 * @module shared/lib/integrations/sso/oidc-api
 * @requires module:openid-client
 * @requires module:jose
 * @requires module:axios
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/security/jwt/jwt-service
 */

const { Issuer, generators, custom } = require('openid-client');
const { jwtVerify, createRemoteJWKSet } = require('jose');
const axios = require('axios');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const JWTService = require('../../security/jwt/jwt-service');

/**
 * @class OIDCAPI
 * @description Handles OpenID Connect operations including discovery,
 * token validation, and userinfo endpoint integration
 */
class OIDCAPI {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for discovery and token caching
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
   * @type {JWTService}
   * @description JWT service for token operations
   */
  #jwtService;

  /**
   * @private
   * @type {Object}
   * @description OIDC Issuer instance
   */
  #issuer;

  /**
   * @private
   * @type {Object}
   * @description OIDC Client instance
   */
  #client;

  /**
   * @private
   * @type {Map}
   * @description Map of cached JWKS by issuer
   */
  #jwksCache;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    discoveryTimeout: 10000,
    tokenTimeout: 30000,
    clockTolerance: 300, // 5 minutes
    cacheTTL: 3600,
    discoveryCacheTTL: 86400,
    jwksCacheTTL: 43200,
    userInfoCacheTTL: 1800,
    scope: 'openid profile email',
    responseType: 'code',
    responseMode: 'query',
    grantType: 'authorization_code',
    tokenEndpointAuthMethod: 'client_secret_basic',
    idTokenSigningAlg: 'RS256',
    userInfoSigningAlg: 'RS256',
    requestObjectSigningAlg: 'none',
    requirePkce: true,
    requireNonce: true,
    requireState: true,
    maxAge: null,
    acrValues: null
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Standard OIDC scopes
   */
  static #SCOPES = {
    OPENID: 'openid',
    PROFILE: 'profile',
    EMAIL: 'email',
    ADDRESS: 'address',
    PHONE: 'phone',
    OFFLINE_ACCESS: 'offline_access'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description OIDC claim names
   */
  static #CLAIMS = {
    SUB: 'sub',
    NAME: 'name',
    GIVEN_NAME: 'given_name',
    FAMILY_NAME: 'family_name',
    MIDDLE_NAME: 'middle_name',
    NICKNAME: 'nickname',
    PREFERRED_USERNAME: 'preferred_username',
    PROFILE: 'profile',
    PICTURE: 'picture',
    WEBSITE: 'website',
    EMAIL: 'email',
    EMAIL_VERIFIED: 'email_verified',
    GENDER: 'gender',
    BIRTHDATE: 'birthdate',
    ZONEINFO: 'zoneinfo',
    LOCALE: 'locale',
    PHONE_NUMBER: 'phone_number',
    PHONE_NUMBER_VERIFIED: 'phone_number_verified',
    ADDRESS: 'address',
    UPDATED_AT: 'updated_at'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description OIDC response types
   */
  static #RESPONSE_TYPES = {
    CODE: 'code',
    TOKEN: 'token',
    ID_TOKEN: 'id_token',
    CODE_TOKEN: 'code token',
    CODE_ID_TOKEN: 'code id_token',
    TOKEN_ID_TOKEN: 'token id_token',
    CODE_TOKEN_ID_TOKEN: 'code token id_token'
  };

  /**
   * Creates a new OIDCAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.issuer - OIDC issuer URL
   * @param {string} config.clientId - OIDC client ID
   * @param {string} config.clientSecret - OIDC client secret
   * @param {string} config.redirectUri - OAuth redirect URI
   * @param {Array<string>} [config.scopes] - OAuth scopes
   * @param {string} [config.responseType] - OAuth response type
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @param {JWTService} [jwtService] - JWT service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService, jwtService) {
    try {
      if (!config?.issuer || !config?.clientId || !config?.clientSecret) {
        throw new AppError(
          'OIDC issuer, client ID, and client secret are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'OIDCAPI' }
        );
      }

      if (!config.redirectUri) {
        throw new AppError(
          'OIDC redirect URI is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'redirectUri' }
        );
      }

      this.#config = {
        ...OIDCAPI.#DEFAULT_CONFIG,
        ...config,
        scopes: config.scopes || OIDCAPI.#DEFAULT_CONFIG.scope.split(' ')
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#jwtService = jwtService || new JWTService();
      this.#jwksCache = new Map();

      // Set custom HTTP timeout for openid-client
      custom.setHttpOptionsDefaults({
        timeout: this.#config.discoveryTimeout
      });

      logger.info('OIDCAPI initialized', {
        issuer: this.#config.issuer,
        clientId: this.#config.clientId,
        scopes: this.#config.scopes,
        responseType: this.#config.responseType
      });
    } catch (error) {
      logger.error('OIDCAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize OIDC API service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Performs OIDC discovery and initializes client
   * @returns {Promise<Object>} Discovery configuration
   */
  async performDiscovery() {
    const correlationId = this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `oidc:discovery:${this.#config.issuer}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && this.#issuer && this.#client) {
        logger.debug('Discovery configuration retrieved from cache', { correlationId });
        return cached;
      }

      logger.info('Performing OIDC discovery', {
        correlationId,
        issuer: this.#config.issuer
      });

      // Discover issuer
      this.#issuer = await Issuer.discover(this.#config.issuer);

      // Create client
      this.#client = new this.#issuer.Client({
        client_id: this.#config.clientId,
        client_secret: this.#config.clientSecret,
        redirect_uris: [this.#config.redirectUri],
        response_types: [this.#config.responseType],
        grant_types: [this.#config.grantType],
        token_endpoint_auth_method: this.#config.tokenEndpointAuthMethod,
        id_token_signed_response_alg: this.#config.idTokenSigningAlg,
        userinfo_signed_response_alg: this.#config.userInfoSigningAlg,
        request_object_signing_alg: this.#config.requestObjectSigningAlg
      });

      const discoveryConfig = {
        issuer: this.#issuer.issuer,
        authorizationEndpoint: this.#issuer.authorization_endpoint,
        tokenEndpoint: this.#issuer.token_endpoint,
        userinfoEndpoint: this.#issuer.userinfo_endpoint,
        jwksUri: this.#issuer.jwks_uri,
        endSessionEndpoint: this.#issuer.end_session_endpoint,
        introspectionEndpoint: this.#issuer.introspection_endpoint,
        revocationEndpoint: this.#issuer.revocation_endpoint,
        supportedScopes: this.#issuer.scopes_supported || [],
        supportedResponseTypes: this.#issuer.response_types_supported || [],
        supportedGrantTypes: this.#issuer.grant_types_supported || [],
        supportedSubjectTypes: this.#issuer.subject_types_supported || [],
        supportedIdTokenSigningAlgs: this.#issuer.id_token_signing_alg_values_supported || [],
        supportedClaims: this.#issuer.claims_supported || [],
        claimsParameterSupported: this.#issuer.claims_parameter_supported || false,
        requestParameterSupported: this.#issuer.request_parameter_supported || false,
        requestUriParameterSupported: this.#issuer.request_uri_parameter_supported || false,
        requireRequestUriRegistration: this.#issuer.require_request_uri_registration || false
      };

      // Cache discovery configuration
      await this.#cacheService.set(cacheKey, discoveryConfig, this.#config.discoveryCacheTTL);

      logger.info('OIDC discovery completed successfully', {
        correlationId,
        issuer: this.#issuer.issuer,
        endpoints: {
          authorization: !!this.#issuer.authorization_endpoint,
          token: !!this.#issuer.token_endpoint,
          userinfo: !!this.#issuer.userinfo_endpoint,
          jwks: !!this.#issuer.jwks_uri
        }
      });

      return discoveryConfig;

    } catch (error) {
      logger.error('OIDC discovery failed', {
        correlationId,
        issuer: this.#config.issuer,
        error: error.message
      });

      throw new AppError(
        'Failed to perform OIDC discovery',
        500,
        ERROR_CODES.OIDC_DISCOVERY_ERROR,
        { correlationId, issuer: this.#config.issuer, originalError: error.message }
      );
    }
  }

  /**
   * Generates authorization URL
   * @param {Object} [options] - Authorization options
   * @param {Array<string>} [options.additionalScopes] - Additional scopes
   * @param {string} [options.state] - OAuth state parameter
   * @param {string} [options.nonce] - OAuth nonce parameter
   * @param {string} [options.prompt] - OAuth prompt parameter
   * @param {string} [options.loginHint] - Login hint
   * @param {number} [options.maxAge] - Maximum authentication age
   * @returns {Promise<Object>} Authorization URL and parameters
   */
  async generateAuthorizationUrl(options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      // Ensure discovery is completed
      if (!this.#client) {
        await this.performDiscovery();
      }

      logger.info('Generating OIDC authorization URL', {
        correlationId,
        scopes: [...this.#config.scopes, ...(options.additionalScopes || [])],
        hasState: !!options.state,
        hasNonce: !!options.nonce
      });

      // Generate PKCE parameters if required
      const codeVerifier = this.#config.requirePkce ? generators.codeVerifier() : null;
      const codeChallenge = codeVerifier ? generators.codeChallenge(codeVerifier) : null;

      // Generate state and nonce if not provided
      const state = options.state || (this.#config.requireState ? generators.state() : null);
      const nonce = options.nonce || (this.#config.requireNonce ? generators.nonce() : null);

      const authParams = {
        scope: [...this.#config.scopes, ...(options.additionalScopes || [])].join(' '),
        response_type: this.#config.responseType,
        redirect_uri: this.#config.redirectUri
      };

      if (state) authParams.state = state;
      if (nonce) authParams.nonce = nonce;
      if (options.prompt) authParams.prompt = options.prompt;
      if (options.loginHint) authParams.login_hint = options.loginHint;
      if (options.maxAge || this.#config.maxAge) authParams.max_age = options.maxAge || this.#config.maxAge;
      if (this.#config.acrValues) authParams.acr_values = this.#config.acrValues;
      if (codeChallenge) {
        authParams.code_challenge = codeChallenge;
        authParams.code_challenge_method = 'S256';
      }

      const authUrl = this.#client.authorizationUrl(authParams);

      // Cache PKCE parameters for token exchange
      if (codeVerifier) {
        await this.#cacheService.set(
          `oidc:pkce:${state || correlationId}`,
          { codeVerifier, correlationId },
          600 // 10 minutes
        );
      }

      logger.info('Authorization URL generated successfully', {
        correlationId,
        hasCodeChallenge: !!codeChallenge,
        state,
        nonce
      });

      return {
        authUrl,
        state,
        nonce,
        codeVerifier,
        correlationId
      };

    } catch (error) {
      logger.error('Failed to generate authorization URL', {
        correlationId,
        error: error.message
      });

      throw new AppError(
        'Failed to generate OIDC authorization URL',
        500,
        ERROR_CODES.OIDC_AUTH_URL_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Exchanges authorization code for tokens
   * @param {string} code - Authorization code
   * @param {Object} [options] - Exchange options
   * @param {string} [options.state] - OAuth state for PKCE lookup
   * @param {string} [options.codeVerifier] - PKCE code verifier
   * @returns {Promise<Object>} Token set
   */
  async exchangeCodeForTokens(code, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Ensure client is initialized
      if (!this.#client) {
        await this.performDiscovery();
      }

      logger.info('Exchanging OIDC authorization code', {
        correlationId,
        hasState: !!options.state,
        hasCodeVerifier: !!options.codeVerifier
      });

      const tokenParams = {
        grant_type: this.#config.grantType,
        code,
        redirect_uri: this.#config.redirectUri
      };

      // Retrieve PKCE code verifier if not provided
      let codeVerifier = options.codeVerifier;
      if (!codeVerifier && options.state) {
        const pkceData = await this.#cacheService.get(`oidc:pkce:${options.state}`);
        if (pkceData) {
          codeVerifier = pkceData.codeVerifier;
          await this.#cacheService.delete(`oidc:pkce:${options.state}`);
        }
      }

      if (codeVerifier) {
        tokenParams.code_verifier = codeVerifier;
      }

      const tokenSet = await this.#client.grant(tokenParams);

      // Validate ID token if present
      if (tokenSet.id_token) {
        await this.#validateIdToken(tokenSet.id_token, options.nonce, correlationId);
      }

      const tokens = {
        accessToken: tokenSet.access_token,
        tokenType: tokenSet.token_type || 'Bearer',
        expiresIn: tokenSet.expires_in,
        refreshToken: tokenSet.refresh_token,
        idToken: tokenSet.id_token,
        scope: tokenSet.scope,
        claims: tokenSet.claims ? tokenSet.claims() : null,
        issuedAt: Date.now(),
        expiresAt: tokenSet.expires_at ? tokenSet.expires_at * 1000 : null
      };

      // Cache tokens if user identifier is available
      if (tokens.claims?.sub) {
        await this.#cacheTokens(tokens.claims.sub, tokens, correlationId);
      }

      logger.info('Token exchange completed successfully', {
        correlationId,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        hasIdToken: !!tokens.idToken,
        expiresIn: tokens.expiresIn
      });

      return tokens;

    } catch (error) {
      logger.error('Token exchange failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleOIDCError(error, correlationId);
    }
  }

  /**
   * Fetches user information from UserInfo endpoint
   * @param {string} accessToken - Access token
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.useCache=true] - Use cached userinfo
   * @returns {Promise<Object>} User information
   */
  async fetchUserInfo(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `oidc:userinfo:${await this.#hashToken(accessToken)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('UserInfo retrieved from cache', { correlationId });
          return cached;
        }
      }

      // Ensure client is initialized
      if (!this.#client) {
        await this.performDiscovery();
      }

      logger.info('Fetching OIDC UserInfo', {
        correlationId,
        hasUserinfoEndpoint: !!this.#issuer.userinfo_endpoint
      });

      if (!this.#issuer.userinfo_endpoint) {
        throw new AppError(
          'UserInfo endpoint not available',
          400,
          ERROR_CODES.OIDC_USERINFO_UNAVAILABLE,
          { correlationId }
        );
      }

      const userInfo = await this.#client.userinfo(accessToken);

      // Normalize user information
      const normalizedUserInfo = {
        sub: userInfo.sub,
        name: userInfo.name,
        givenName: userInfo.given_name,
        familyName: userInfo.family_name,
        middleName: userInfo.middle_name,
        nickname: userInfo.nickname,
        preferredUsername: userInfo.preferred_username,
        profile: userInfo.profile,
        picture: userInfo.picture,
        website: userInfo.website,
        email: userInfo.email,
        emailVerified: userInfo.email_verified,
        gender: userInfo.gender,
        birthdate: userInfo.birthdate,
        zoneinfo: userInfo.zoneinfo,
        locale: userInfo.locale,
        phoneNumber: userInfo.phone_number,
        phoneNumberVerified: userInfo.phone_number_verified,
        address: userInfo.address,
        updatedAt: userInfo.updated_at,
        rawClaims: userInfo
      };

      // Cache the user information
      if (options.useCache !== false) {
        const cacheKey = `oidc:userinfo:${await this.#hashToken(accessToken)}`;
        await this.#cacheService.set(cacheKey, normalizedUserInfo, this.#config.userInfoCacheTTL);
      }

      logger.info('UserInfo fetched successfully', {
        correlationId,
        sub: userInfo.sub,
        hasEmail: !!userInfo.email,
        hasName: !!userInfo.name
      });

      return normalizedUserInfo;

    } catch (error) {
      logger.error('UserInfo fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleOIDCError(error, correlationId);
    }
  }

  /**
   * Validates an ID token
   * @param {string} idToken - ID token to validate
   * @param {string} [expectedNonce] - Expected nonce value
   * @param {string} [correlationId] - Correlation ID
   * @returns {Promise<Object>} Validated token claims
   */
  async validateIdToken(idToken, expectedNonce, correlationId) {
    return this.#validateIdToken(idToken, expectedNonce, correlationId);
  }

  /**
   * @private
   * Validates an ID token
   */
  async #validateIdToken(idToken, expectedNonce, correlationId) {
    try {
      if (!this.#client) {
        await this.performDiscovery();
      }

      logger.info('Validating OIDC ID token', {
        correlationId,
        hasNonce: !!expectedNonce
      });

      // Use openid-client for comprehensive validation
      const tokenSet = { id_token: idToken };
      const claims = this.#client.validateIdToken(tokenSet, expectedNonce, 'authorization', this.#config.clockTolerance);

      logger.info('ID token validated successfully', {
        correlationId,
        sub: claims.sub,
        iss: claims.iss,
        aud: claims.aud
      });

      return claims;

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
   * Refreshes access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @param {Object} [options] - Refresh options
   * @returns {Promise<Object>} New token set
   */
  async refreshAccessToken(refreshToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      if (!this.#client) {
        await this.performDiscovery();
      }

      logger.info('Refreshing OIDC access token', { correlationId });

      const tokenSet = await this.#client.refresh(refreshToken);

      const tokens = {
        accessToken: tokenSet.access_token,
        tokenType: tokenSet.token_type || 'Bearer',
        expiresIn: tokenSet.expires_in,
        refreshToken: tokenSet.refresh_token,
        idToken: tokenSet.id_token,
        scope: tokenSet.scope,
        claims: tokenSet.claims ? tokenSet.claims() : null,
        issuedAt: Date.now(),
        expiresAt: tokenSet.expires_at ? tokenSet.expires_at * 1000 : null
      };

      logger.info('Token refresh completed successfully', {
        correlationId,
        hasNewRefreshToken: !!tokens.refreshToken,
        expiresIn: tokens.expiresIn
      });

      return tokens;

    } catch (error) {
      logger.error('Token refresh failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleOIDCError(error, correlationId);
    }
  }

  /**
   * Revokes tokens
   * @param {string} token - Access or refresh token to revoke
   * @param {string} [tokenTypeHint] - Token type hint ('access_token' or 'refresh_token')
   * @returns {Promise<Object>} Revocation result
   */
  async revokeToken(token, tokenTypeHint) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (!this.#client) {
        await this.performDiscovery();
      }

      logger.info('Revoking OIDC token', {
        correlationId,
        tokenTypeHint,
        hasRevocationEndpoint: !!this.#issuer.revocation_endpoint
      });

      if (this.#issuer.revocation_endpoint) {
        await this.#client.revoke(token, tokenTypeHint);
      }

      // Clear cached data
      const tokenHash = await this.#hashToken(token);
      await this.#cacheService.delete(`oidc:tokens:*${tokenHash}*`);
      await this.#cacheService.delete(`oidc:userinfo:${tokenHash}`);

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

      throw this.#handleOIDCError(error, correlationId);
    }
  }

  /**
   * Generates logout URL
   * @param {Object} [options] - Logout options
   * @param {string} [options.idTokenHint] - ID token hint
   * @param {string} [options.postLogoutRedirectUri] - Post-logout redirect URI
   * @param {string} [options.state] - State parameter
   * @returns {Promise<string|null>} Logout URL or null if not supported
   */
  async generateLogoutUrl(options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (!this.#client) {
        await this.performDiscovery();
      }

      if (!this.#issuer.end_session_endpoint) {
        logger.warn('End session endpoint not available', { correlationId });
        return null;
      }

      const logoutParams = {};
      
      if (options.idTokenHint) logoutParams.id_token_hint = options.idTokenHint;
      if (options.postLogoutRedirectUri) logoutParams.post_logout_redirect_uri = options.postLogoutRedirectUri;
      if (options.state) logoutParams.state = options.state;

      const logoutUrl = this.#client.endSessionUrl(logoutParams);

      logger.info('Logout URL generated successfully', {
        correlationId,
        hasIdTokenHint: !!options.idTokenHint,
        hasPostLogoutRedirect: !!options.postLogoutRedirectUri
      });

      return logoutUrl;

    } catch (error) {
      logger.error('Logout URL generation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleOIDCError(error, correlationId);
    }
  }

  /**
   * @private
   * Caches tokens
   */
  async #cacheTokens(sub, tokens, correlationId) {
    try {
      const encryptedTokens = {
        ...tokens,
        accessToken: await this.#encryptionService.encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? await this.#encryptionService.encrypt(tokens.refreshToken) : null
      };

      const cacheKey = `oidc:tokens:${sub}`;
      await this.#cacheService.set(cacheKey, encryptedTokens, this.#config.cacheTTL);

    } catch (error) {
      logger.error('Failed to cache tokens', {
        correlationId,
        error: error.message
      });
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
   * Handles OIDC API errors
   */
  #handleOIDCError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    let errorCode = ERROR_CODES.OIDC_ERROR;
    let message = 'OIDC operation failed';

    if (error.error) {
      // Standard OAuth/OIDC error
      switch (error.error) {
        case 'invalid_request':
          errorCode = ERROR_CODES.OIDC_INVALID_REQUEST;
          message = 'Invalid OIDC request';
          break;
        case 'invalid_client':
          errorCode = ERROR_CODES.OIDC_INVALID_CLIENT;
          message = 'Invalid client credentials';
          break;
        case 'invalid_grant':
          errorCode = ERROR_CODES.OIDC_INVALID_GRANT;
          message = 'Invalid authorization grant';
          break;
        case 'unauthorized_client':
          errorCode = ERROR_CODES.OIDC_UNAUTHORIZED_CLIENT;
          message = 'Unauthorized client';
          break;
        case 'unsupported_grant_type':
          errorCode = ERROR_CODES.OIDC_UNSUPPORTED_GRANT;
          message = 'Unsupported grant type';
          break;
        case 'invalid_scope':
          errorCode = ERROR_CODES.OIDC_INVALID_SCOPE;
          message = 'Invalid scope';
          break;
      }
      
      if (error.error_description) {
        message = error.error_description;
      }
    }

    return new AppError(
      message,
      error.status || 400,
      errorCode,
      {
        correlationId,
        oidcError: error.error,
        oidcErrorDescription: error.error_description,
        oidcErrorUri: error.error_uri,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `oidc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      let discoveryStatus = false;
      let endpoints = {};

      try {
        if (!this.#issuer) {
          await this.performDiscovery();
        }
        discoveryStatus = true;
        endpoints = {
          authorization: !!this.#issuer.authorization_endpoint,
          token: !!this.#issuer.token_endpoint,
          userinfo: !!this.#issuer.userinfo_endpoint,
          jwks: !!this.#issuer.jwks_uri,
          endSession: !!this.#issuer.end_session_endpoint
        };
      } catch (discoveryError) {
        logger.warn('Discovery failed during health check', {
          error: discoveryError.message
        });
      }

      return {
        healthy: discoveryStatus,
        service: 'OIDCAPI',
        issuer: this.#config.issuer,
        clientId: this.#config.clientId,
        discoveryCompleted: discoveryStatus,
        endpoints,
        features: {
          pkce: this.#config.requirePkce,
          nonce: this.#config.requireNonce,
          state: this.#config.requireState
        }
      };
    } catch (error) {
      logger.error('OIDC health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'OIDCAPI',
        error: error.message
      };
    }
  }
}

module.exports = OIDCAPI;