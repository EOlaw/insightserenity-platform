'use strict';

/**
 * @fileoverview JWT token generation and validation service
 * @module shared/lib/auth/services/token-service
 * @requires module:jsonwebtoken
 * @requires module:crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/config
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const EncryptionService = require('../../security/encryption/encryption-service');
const CacheService = require('../../services/cache-service');
const config = require('../../config');

/**
 * @class TokenService
 * @description Manages JWT token lifecycle including generation, validation, rotation,
 * and revocation with enterprise security features
 */
class TokenService {
  /**
   * @private
   * @type {Object}
   */
  #config;

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
   * @type {Map}
   */
  #tokenMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    accessToken: {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer: 'insightserenity',
      audience: 'insightserenity-api'
    },
    refreshToken: {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: 'insightserenity',
      audience: 'insightserenity-api'
    },
    temporaryToken: {
      secret: process.env.JWT_TEMP_SECRET,
      expiresIn: '5m',
      algorithm: 'HS256'
    },
    verificationToken: {
      length: 32,
      encoding: 'hex'
    },
    passwordResetToken: {
      length: 32,
      encoding: 'hex'
    },
    apiKey: {
      length: 32,
      prefix: 'isk_'
    },
    enableTokenRotation: true,
    enableJTI: true,
    maxTokenAge: 86400000, // 24 hours
    tokenCleanupInterval: 3600000, // 1 hour
    cacheTTL: {
      publicKey: 3600, // 1 hour
      tokenMetadata: 300, // 5 minutes
      jti: 900 // 15 minutes
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #TOKEN_TYPES = {
    ACCESS: 'access',
    REFRESH: 'refresh',
    TEMPORARY: 'temporary',
    VERIFICATION: 'verification',
    PASSWORD_RESET: 'password_reset',
    API_KEY: 'api_key'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #TOKEN_PURPOSES = {
    AUTHENTICATION: 'authentication',
    EMAIL_VERIFICATION: 'email_verification',
    PASSWORD_RESET: 'password_reset',
    TWO_FACTOR: 'two_factor',
    API_ACCESS: 'api_access',
    SESSION_REFRESH: 'session_refresh'
  };

  /**
   * Creates a new TokenService instance
   * @param {Object} [config] - Service configuration
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config = {}, encryptionService, cacheService) {
    this.#config = this.#mergeConfig(config);
    this.#validateConfig();
    
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#cacheService = cacheService || new CacheService();
    this.#tokenMetrics = new Map();

    // Start token cleanup interval
    if (this.#config.tokenCleanupInterval) {
      this.#startTokenCleanup();
    }

    logger.info('TokenService initialized', {
      accessTokenExpiry: this.#config.accessToken.expiresIn,
      refreshTokenExpiry: this.#config.refreshToken.expiresIn,
      enableTokenRotation: this.#config.enableTokenRotation
    });
  }

  /**
   * Generates an access token
   * @param {Object} payload - Token payload
   * @param {string} payload.userId - User ID
   * @param {string} payload.email - User email
   * @param {string} [payload.organizationId] - Organization ID
   * @param {Array<string>} [payload.roles] - User roles
   * @param {Array<string>} [payload.permissions] - User permissions
   * @param {Object} [options] - Token options
   * @returns {Promise<string>} Access token
   * @throws {AppError} If token generation fails
   */
  async generateAccessToken(payload, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Generating access token', {
        correlationId,
        userId: payload.userId
      });

      // Validate payload
      this.#validateTokenPayload(payload, TokenService.#TOKEN_TYPES.ACCESS);

      // Build token claims
      const claims = {
        sub: payload.userId,
        email: payload.email,
        type: TokenService.#TOKEN_TYPES.ACCESS,
        purpose: TokenService.#TOKEN_PURPOSES.AUTHENTICATION
      };

      if (payload.organizationId) {
        claims.org = payload.organizationId;
      }

      if (payload.roles) {
        claims.roles = payload.roles;
      }

      if (payload.permissions) {
        claims.permissions = payload.permissions;
      }

      // Add JTI if enabled
      if (this.#config.enableJTI) {
        claims.jti = this.#generateJTI();
        await this.#storeJTI(claims.jti, TokenService.#TOKEN_TYPES.ACCESS);
      }

      // Add custom claims
      if (options.customClaims) {
        Object.assign(claims, options.customClaims);
      }

      // Generate token
      const token = jwt.sign(
        claims,
        this.#config.accessToken.secret,
        {
          expiresIn: options.expiresIn || this.#config.accessToken.expiresIn,
          algorithm: this.#config.accessToken.algorithm,
          issuer: this.#config.accessToken.issuer,
          audience: this.#config.accessToken.audience
        }
      );

      // Track metrics
      this.#trackTokenGeneration(TokenService.#TOKEN_TYPES.ACCESS);

      logger.debug('Access token generated', {
        correlationId,
        userId: payload.userId,
        jti: claims.jti
      });

      return token;

    } catch (error) {
      logger.error('Access token generation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to generate access token',
        500,
        ERROR_CODES.TOKEN_GENERATION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Generates a refresh token
   * @param {Object} payload - Token payload
   * @param {string} payload.userId - User ID
   * @param {string} [payload.organizationId] - Organization ID
   * @param {Object} [options] - Token options
   * @returns {Promise<string>} Refresh token
   * @throws {AppError} If token generation fails
   */
  async generateRefreshToken(payload, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Generating refresh token', {
        correlationId,
        userId: payload.userId
      });

      // Validate payload
      this.#validateTokenPayload(payload, TokenService.#TOKEN_TYPES.REFRESH);

      // Build token claims
      const claims = {
        sub: payload.userId,
        type: TokenService.#TOKEN_TYPES.REFRESH,
        purpose: TokenService.#TOKEN_PURPOSES.SESSION_REFRESH
      };

      if (payload.organizationId) {
        claims.org = payload.organizationId;
      }

      // Add JTI
      if (this.#config.enableJTI) {
        claims.jti = this.#generateJTI();
        await this.#storeJTI(claims.jti, TokenService.#TOKEN_TYPES.REFRESH);
      }

      // Add rotation ID if enabled
      if (this.#config.enableTokenRotation) {
        claims.rid = this.#generateRotationId();
      }

      // Generate token
      const token = jwt.sign(
        claims,
        this.#config.refreshToken.secret,
        {
          expiresIn: options.expiresIn || this.#config.refreshToken.expiresIn,
          algorithm: this.#config.refreshToken.algorithm,
          issuer: this.#config.refreshToken.issuer,
          audience: this.#config.refreshToken.audience
        }
      );

      // Track metrics
      this.#trackTokenGeneration(TokenService.#TOKEN_TYPES.REFRESH);

      logger.debug('Refresh token generated', {
        correlationId,
        userId: payload.userId,
        jti: claims.jti
      });

      return token;

    } catch (error) {
      logger.error('Refresh token generation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to generate refresh token',
        500,
        ERROR_CODES.TOKEN_GENERATION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Generates a temporary token for 2FA
   * @param {string} userId - User ID
   * @param {Object} [options] - Token options
   * @returns {Promise<string>} Temporary token
   * @throws {AppError} If token generation fails
   */
  async generateTemporaryToken(userId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Generating temporary token', {
        correlationId,
        userId
      });

      const claims = {
        sub: userId,
        type: TokenService.#TOKEN_TYPES.TEMPORARY,
        purpose: TokenService.#TOKEN_PURPOSES.TWO_FACTOR
      };

      if (this.#config.enableJTI) {
        claims.jti = this.#generateJTI();
        await this.#storeJTI(claims.jti, TokenService.#TOKEN_TYPES.TEMPORARY);
      }

      const token = jwt.sign(
        claims,
        this.#config.temporaryToken.secret,
        {
          expiresIn: this.#config.temporaryToken.expiresIn,
          algorithm: this.#config.temporaryToken.algorithm
        }
      );

      logger.debug('Temporary token generated', {
        correlationId,
        userId
      });

      return token;

    } catch (error) {
      logger.error('Temporary token generation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to generate temporary token',
        500,
        ERROR_CODES.TOKEN_GENERATION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Generates a verification token
   * @param {Object} [options] - Token options
   * @returns {Promise<string>} Verification token
   */
  async generateVerificationToken(options = {}) {
    try {
      const token = crypto.randomBytes(this.#config.verificationToken.length)
        .toString(this.#config.verificationToken.encoding);

      logger.debug('Verification token generated');

      return token;
    } catch (error) {
      throw new AppError(
        'Failed to generate verification token',
        500,
        ERROR_CODES.TOKEN_GENERATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a password reset token
   * @param {Object} [options] - Token options
   * @returns {Promise<string>} Password reset token
   */
  async generatePasswordResetToken(options = {}) {
    try {
      const token = crypto.randomBytes(this.#config.passwordResetToken.length)
        .toString(this.#config.passwordResetToken.encoding);

      logger.debug('Password reset token generated');

      return token;
    } catch (error) {
      throw new AppError(
        'Failed to generate password reset token',
        500,
        ERROR_CODES.TOKEN_GENERATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates an API key
   * @param {Object} metadata - API key metadata
   * @param {string} metadata.name - Key name
   * @param {string} metadata.userId - User ID
   * @param {Array<string>} [metadata.scopes] - API scopes
   * @returns {Promise<Object>} API key and metadata
   */
  async generateAPIKey(metadata) {
    try {
      const keyId = this.#generateKeyId();
      const secret = crypto.randomBytes(this.#config.apiKey.length)
        .toString('base64')
        .replace(/[+/=]/g, '');

      const apiKey = `${this.#config.apiKey.prefix}${keyId}_${secret}`;

      // Hash the key for storage
      const hashedKey = await this.#encryptionService.hashData(apiKey);

      logger.info('API key generated', {
        keyId,
        name: metadata.name,
        userId: metadata.userId
      });

      return {
        apiKey,
        keyId,
        hashedKey,
        metadata: {
          ...metadata,
          createdAt: new Date()
        }
      };

    } catch (error) {
      throw new AppError(
        'Failed to generate API key',
        500,
        ERROR_CODES.TOKEN_GENERATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifies an access token
   * @param {string} token - Access token
   * @param {Object} [options] - Verification options
   * @returns {Promise<Object>} Token payload
   * @throws {AppError} If token is invalid
   */
  async verifyAccessToken(token, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Verifying access token', { correlationId });

      const payload = jwt.verify(token, this.#config.accessToken.secret, {
        algorithms: [this.#config.accessToken.algorithm],
        issuer: this.#config.accessToken.issuer,
        audience: this.#config.accessToken.audience,
        ...options
      });

      // Verify token type
      if (payload.type !== TokenService.#TOKEN_TYPES.ACCESS) {
        throw new AppError(
          'Invalid token type',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      // Verify JTI if enabled
      if (this.#config.enableJTI && payload.jti) {
        const isValid = await this.#verifyJTI(payload.jti, TokenService.#TOKEN_TYPES.ACCESS);
        if (!isValid) {
          throw new AppError(
            'Invalid token identifier',
            401,
            ERROR_CODES.INVALID_TOKEN,
            { correlationId }
          );
        }
      }

      // Track metrics
      this.#trackTokenVerification(TokenService.#TOKEN_TYPES.ACCESS, true);

      return payload;

    } catch (error) {
      this.#trackTokenVerification(TokenService.#TOKEN_TYPES.ACCESS, false);

      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(
          'Token has expired',
          401,
          ERROR_CODES.TOKEN_EXPIRED,
          { correlationId, expiredAt: error.expiredAt }
        );
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(
          'Invalid token',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      throw error instanceof AppError ? error : new AppError(
        'Token verification failed',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies a refresh token
   * @param {string} token - Refresh token
   * @param {Object} [options] - Verification options
   * @returns {Promise<Object>} Token payload
   * @throws {AppError} If token is invalid
   */
  async verifyRefreshToken(token, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Verifying refresh token', { correlationId });

      const payload = jwt.verify(token, this.#config.refreshToken.secret, {
        algorithms: [this.#config.refreshToken.algorithm],
        issuer: this.#config.refreshToken.issuer,
        audience: this.#config.refreshToken.audience,
        ...options
      });

      // Verify token type
      if (payload.type !== TokenService.#TOKEN_TYPES.REFRESH) {
        throw new AppError(
          'Invalid token type',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      // Verify JTI if enabled
      if (this.#config.enableJTI && payload.jti) {
        const isValid = await this.#verifyJTI(payload.jti, TokenService.#TOKEN_TYPES.REFRESH);
        if (!isValid) {
          throw new AppError(
            'Invalid token identifier',
            401,
            ERROR_CODES.INVALID_TOKEN,
            { correlationId }
          );
        }
      }

      // Track metrics
      this.#trackTokenVerification(TokenService.#TOKEN_TYPES.REFRESH, true);

      return payload;

    } catch (error) {
      this.#trackTokenVerification(TokenService.#TOKEN_TYPES.REFRESH, false);

      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(
          'Refresh token has expired',
          401,
          ERROR_CODES.TOKEN_EXPIRED,
          { correlationId, expiredAt: error.expiredAt }
        );
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(
          'Invalid refresh token',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      throw error instanceof AppError ? error : new AppError(
        'Refresh token verification failed',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies a temporary token
   * @param {string} token - Temporary token
   * @param {Object} [options] - Verification options
   * @returns {Promise<Object>} Token payload
   * @throws {AppError} If token is invalid
   */
  async verifyTemporaryToken(token, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      const payload = jwt.verify(token, this.#config.temporaryToken.secret, {
        algorithms: [this.#config.temporaryToken.algorithm],
        ...options
      });

      if (payload.type !== TokenService.#TOKEN_TYPES.TEMPORARY) {
        throw new AppError(
          'Invalid token type',
          401,
          ERROR_CODES.INVALID_TOKEN,
          { correlationId }
        );
      }

      return payload;

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(
          'Temporary token has expired',
          401,
          ERROR_CODES.TOKEN_EXPIRED,
          { correlationId }
        );
      }

      throw error instanceof AppError ? error : new AppError(
        'Invalid temporary token',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { correlationId }
      );
    }
  }

  /**
   * Verifies an API key
   * @param {string} apiKey - API key
   * @returns {Promise<Object>} API key metadata
   * @throws {AppError} If API key is invalid
   */
  async verifyAPIKey(apiKey) {
    try {
      if (!apiKey.startsWith(this.#config.apiKey.prefix)) {
        throw new AppError(
          'Invalid API key format',
          401,
          ERROR_CODES.INVALID_TOKEN
        );
      }

      const parts = apiKey.substring(this.#config.apiKey.prefix.length).split('_');
      if (parts.length !== 2) {
        throw new AppError(
          'Invalid API key format',
          401,
          ERROR_CODES.INVALID_TOKEN
        );
      }

      const [keyId] = parts;

      // Return key ID for lookup
      return { keyId };

    } catch (error) {
      throw error instanceof AppError ? error : new AppError(
        'API key verification failed',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { originalError: error.message }
      );
    }
  }

  /**
   * Decodes a token without verification
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded token payload
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.warn('Token decode failed', { error: error.message });
      return null;
    }
  }

  /**
   * Rotates refresh token
   * @param {string} oldToken - Current refresh token
   * @param {Object} [options] - Rotation options
   * @returns {Promise<string>} New refresh token
   * @throws {AppError} If rotation fails
   */
  async rotateRefreshToken(oldToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Rotating refresh token', { correlationId });

      // Verify old token
      const payload = await this.verifyRefreshToken(oldToken, options);

      // Invalidate old JTI
      if (payload.jti) {
        await this.#invalidateJTI(payload.jti);
      }

      // Generate new token with same claims
      const newToken = await this.generateRefreshToken({
        userId: payload.sub,
        organizationId: payload.org
      }, options);

      logger.debug('Refresh token rotated', {
        correlationId,
        userId: payload.sub
      });

      return newToken;

    } catch (error) {
      logger.error('Refresh token rotation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Token rotation failed',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Invalidates a token JTI
   * @param {string} jti - JWT ID
   * @returns {Promise<void>}
   */
  async invalidateJTI(jti) {
    await this.#invalidateJTI(jti);
  }

  /**
   * @private
   * Merges configuration
   */
  #mergeConfig(config) {
    const merged = { ...TokenService.#DEFAULT_CONFIG };

    if (config.accessToken) {
      merged.accessToken = { ...merged.accessToken, ...config.accessToken };
    }

    if (config.refreshToken) {
      merged.refreshToken = { ...merged.refreshToken, ...config.refreshToken };
    }

    if (config.temporaryToken) {
      merged.temporaryToken = { ...merged.temporaryToken, ...config.temporaryToken };
    }

    Object.keys(config).forEach(key => {
      if (!['accessToken', 'refreshToken', 'temporaryToken'].includes(key)) {
        merged[key] = config[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Validates configuration
   */
  #validateConfig() {
    const errors = [];

    if (!this.#config.accessToken.secret) {
      errors.push('Access token secret is required');
    }

    if (!this.#config.refreshToken.secret) {
      errors.push('Refresh token secret is required');
    }

    if (!this.#config.temporaryToken.secret) {
      errors.push('Temporary token secret is required');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid token service configuration',
        500,
        ERROR_CODES.CONFIGURATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Validates token payload
   */
  #validateTokenPayload(payload, tokenType) {
    const errors = [];

    if (!payload.userId) {
      errors.push('User ID is required');
    }

    if (tokenType === TokenService.#TOKEN_TYPES.ACCESS && !payload.email) {
      errors.push('Email is required for access tokens');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid token payload',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Generates JTI
   */
  #generateJTI() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * @private
   * Generates rotation ID
   */
  #generateRotationId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * @private
   * Generates key ID
   */
  #generateKeyId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * @private
   * Stores JTI in cache
   */
  async #storeJTI(jti, tokenType) {
    const key = `jti:${tokenType}:${jti}`;
    const ttl = tokenType === TokenService.#TOKEN_TYPES.REFRESH 
      ? 604800 // 7 days
      : this.#config.cacheTTL.jti;

    await this.#cacheService.set(key, {
      createdAt: new Date(),
      tokenType
    }, ttl);
  }

  /**
   * @private
   * Verifies JTI
   */
  async #verifyJTI(jti, tokenType) {
    const key = `jti:${tokenType}:${jti}`;
    const data = await this.#cacheService.get(key);
    return !!data;
  }

  /**
   * @private
   * Invalidates JTI
   */
  async #invalidateJTI(jti) {
    const keys = [
      `jti:${TokenService.#TOKEN_TYPES.ACCESS}:${jti}`,
      `jti:${TokenService.#TOKEN_TYPES.REFRESH}:${jti}`,
      `jti:${TokenService.#TOKEN_TYPES.TEMPORARY}:${jti}`
    ];

    await Promise.all(keys.map(key => this.#cacheService.delete(key)));
  }

  /**
   * @private
   * Tracks token generation
   */
  #trackTokenGeneration(tokenType) {
    const key = `generated:${tokenType}`;
    const current = this.#tokenMetrics.get(key) || 0;
    this.#tokenMetrics.set(key, current + 1);
  }

  /**
   * @private
   * Tracks token verification
   */
  #trackTokenVerification(tokenType, success) {
    const key = `verified:${tokenType}:${success ? 'success' : 'failure'}`;
    const current = this.#tokenMetrics.get(key) || 0;
    this.#tokenMetrics.set(key, current + 1);
  }

  /**
   * @private
   * Starts token cleanup interval
   */
  #startTokenCleanup() {
    setInterval(() => {
      this.#cleanupExpiredTokens();
    }, this.#config.tokenCleanupInterval);
  }

  /**
   * @private
   * Cleans up expired tokens
   */
  async #cleanupExpiredTokens() {
    try {
      logger.debug('Running token cleanup');
      // Implementation depends on storage mechanism
    } catch (error) {
      logger.error('Token cleanup failed', { error: error.message });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets token metrics
   * @returns {Object} Token metrics
   */
  getMetrics() {
    const metrics = {};
    this.#tokenMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Test token generation and verification
      const testToken = await this.generateAccessToken({
        userId: 'health-check',
        email: 'health@check.com'
      });

      await this.verifyAccessToken(testToken);

      return {
        healthy: true,
        service: 'TokenService',
        metrics: this.getMetrics()
      };
    } catch (error) {
      logger.error('Token service health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'TokenService',
        error: error.message
      };
    }
  }
}

module.exports = TokenService;