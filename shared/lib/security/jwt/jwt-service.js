'use strict';

/**
 * @fileoverview JSON Web Token (JWT) service for token operations
 * @module shared/lib/security/jwt/jwt-service
 * @requires module:jsonwebtoken
 * @requires module:jose
 * @requires module:node-jose
 * @requires module:crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 */

const jwt = require('jsonwebtoken');
const { jwtVerify, createRemoteJWKSet, decodeJwt, importJWK } = require('jose');
const jose = require('node-jose');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');

/**
 * @class JWTService
 * @description Enterprise-grade JWT service with comprehensive token operations,
 * validation, and security features
 */
class JWTService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for JWK sets and validation results
   */
  #cacheService;

  /**
   * @private
   * @type {Map}
   * @description Map of cached JWK sets by issuer
   */
  #jwkSetsCache;

  /**
   * @private
   * @type {Map}
   * @description Map of cached public keys
   */
  #publicKeysCache;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    clockTolerance: 300, // 5 minutes
    maxTokenAge: 86400,  // 24 hours
    cacheTTL: 3600,      // 1 hour
    jwkCacheTTL: 43200,  // 12 hours
    defaultIssuer: null,
    defaultAudience: null,
    allowedAlgorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
    requiredClaims: ['iat', 'exp'],
    ignoreExpiration: false,
    ignoreNotBefore: false,
    complete: false,
    audience: null,
    issuer: null,
    jwtid: null,
    subject: null,
    maxAge: null,
    nonce: null,
    security: {
      allowNoneAlgorithm: false,
      requireKeyId: true,
      validateKeyUsage: true,
      maxClockSkew: 300
    },
    jwks: {
      timeout: 30000,
      cacheMaxEntries: 100,
      cacheMaxAge: 600000,
      rateLimit: false,
      jwksRequestsPerMinute: 10
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Array<string>}
   * @description Algorithms considered secure for JWT verification
   */
  static #SECURE_ALGORITHMS = [
    'RS256', 'RS384', 'RS512',
    'ES256', 'ES384', 'ES512',
    'PS256', 'PS384', 'PS512'
  ];

  /**
   * @private
   * @static
   * @readonly
   * @type {Array<string>}
   * @description Standard JWT claims
   */
  static #STANDARD_CLAIMS = [
    'iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'
  ];

  /**
   * Creates a new JWTService instance
   * @param {Object} [config] - Service configuration
   * @param {number} [config.clockTolerance] - Clock tolerance in seconds
   * @param {Array<string>} [config.allowedAlgorithms] - Allowed signing algorithms
   * @param {string} [config.defaultIssuer] - Default token issuer
   * @param {string} [config.defaultAudience] - Default token audience
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(config = {}, cacheService) {
    try {
      this.#config = {
        ...JWTService.#DEFAULT_CONFIG,
        ...config,
        security: {
          ...JWTService.#DEFAULT_CONFIG.security,
          ...config.security
        },
        jwks: {
          ...JWTService.#DEFAULT_CONFIG.jwks,
          ...config.jwks
        }
      };

      this.#cacheService = cacheService || new CacheService();
      this.#jwkSetsCache = new Map();
      this.#publicKeysCache = new Map();

      // Validate algorithm security
      this.#validateAlgorithmSecurity();

      logger.info('JWTService initialized', {
        clockTolerance: this.#config.clockTolerance,
        allowedAlgorithms: this.#config.allowedAlgorithms,
        securityFeatures: {
          requireKeyId: this.#config.security.requireKeyId,
          validateKeyUsage: this.#config.security.validateKeyUsage,
          allowNoneAlgorithm: this.#config.security.allowNoneAlgorithm
        }
      });

    } catch (error) {
      logger.error('JWTService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize JWT service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifies a JWT token with comprehensive validation
   * @param {string} token - JWT token to verify
   * @param {Object} [options] - Verification options
   * @param {string|Array<string>} [options.audience] - Expected audience
   * @param {string} [options.issuer] - Expected issuer
   * @param {string} [options.subject] - Expected subject
   * @param {number} [options.clockTolerance] - Clock tolerance in seconds
   * @param {Array<string>} [options.algorithms] - Allowed algorithms
   * @param {string} [options.nonce] - Expected nonce value
   * @param {boolean} [options.complete] - Return complete token object
   * @param {string} [options.secretOrKey] - Secret or public key for verification
   * @param {string} [options.jwksUri] - JWKS URI for key retrieval
   * @returns {Promise<Object>} Verified token payload or complete token object
   */
  async verify(token, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (!token || typeof token !== 'string') {
        throw new AppError(
          'Invalid token format',
          400,
          ERROR_CODES.JWT_INVALID_FORMAT,
          { correlationId }
        );
      }

      logger.debug('JWT verification started', {
        correlationId,
        hasAudience: !!options.audience,
        hasIssuer: !!options.issuer,
        hasCustomKey: !!options.secretOrKey,
        hasJwksUri: !!options.jwksUri
      });

      // Decode token header to get algorithm and key ID
      const decoded = this.decode(token, { complete: true });
      const { header, payload } = decoded;

      // Validate algorithm
      await this.#validateAlgorithm(header.alg, options.algorithms);

      // Validate required claims
      this.#validateRequiredClaims(payload);

      // Determine verification method based on available options
      let verifiedToken;

      if (options.secretOrKey) {
        // Direct key verification
        verifiedToken = await this.#verifyWithKey(token, options.secretOrKey, options, correlationId);
      } else if (options.jwksUri || payload.iss) {
        // JWKS-based verification
        verifiedToken = await this.#verifyWithJWKS(token, options.jwksUri || payload.iss, options, correlationId);
      } else {
        throw new AppError(
          'No verification key or JWKS URI provided',
          400,
          ERROR_CODES.JWT_NO_KEY_PROVIDED,
          { correlationId }
        );
      }

      // Additional custom validations
      await this.#performAdditionalValidations(verifiedToken.payload, options, correlationId);

      logger.info('JWT verification successful', {
        correlationId,
        subject: verifiedToken.payload.sub,
        issuer: verifiedToken.payload.iss,
        audience: verifiedToken.payload.aud,
        algorithm: header.alg
      });

      return options.complete ? verifiedToken : verifiedToken.payload;

    } catch (error) {
      logger.error('JWT verification failed', {
        correlationId,
        error: error.message,
        tokenPreview: token ? token.substring(0, 50) + '...' : null
      });

      throw error instanceof AppError ? error : new AppError(
        'JWT verification failed',
        401,
        ERROR_CODES.JWT_VERIFICATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Decodes a JWT token without verification
   * @param {string} token - JWT token to decode
   * @param {Object} [options] - Decode options
   * @param {boolean} [options.complete] - Return complete token object
   * @param {boolean} [options.json] - Parse payload as JSON
   * @returns {Object} Decoded token payload or complete token object
   */
  decode(token, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (!token || typeof token !== 'string') {
        throw new AppError(
          'Invalid token format',
          400,
          ERROR_CODES.JWT_INVALID_FORMAT,
          { correlationId }
        );
      }

      logger.debug('JWT decode started', {
        correlationId,
        complete: options.complete,
        json: options.json
      });

      let decoded;

      if (options.complete) {
        // Use jsonwebtoken for complete decode
        decoded = jwt.decode(token, { complete: true, json: options.json });
      } else {
        // Use jose for simple decode (better performance)
        decoded = decodeJwt(token);
      }

      if (!decoded) {
        throw new AppError(
          'Failed to decode token',
          400,
          ERROR_CODES.JWT_DECODE_ERROR,
          { correlationId }
        );
      }

      logger.debug('JWT decode successful', {
        correlationId,
        hasHeader: !!decoded.header,
        hasPayload: !!decoded.payload,
        hasSignature: !!decoded.signature
      });

      return decoded;

    } catch (error) {
      logger.error('JWT decode failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'JWT decode failed',
        400,
        ERROR_CODES.JWT_DECODE_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Signs a JWT token
   * @param {Object} payload - Token payload
   * @param {string|Buffer} secretOrPrivateKey - Secret or private key
   * @param {Object} [options] - Signing options
   * @param {string} [options.algorithm] - Signing algorithm
   * @param {string|number} [options.expiresIn] - Expiration time
   * @param {string} [options.issuer] - Token issuer
   * @param {string|Array<string>} [options.audience] - Token audience
   * @param {string} [options.subject] - Token subject
   * @param {string} [options.jwtid] - JWT ID
   * @param {boolean} [options.noTimestamp] - Exclude iat claim
   * @param {Object} [options.header] - Additional header claims
   * @returns {Promise<string>} Signed JWT token
   */
  async sign(payload, secretOrPrivateKey, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (!payload || typeof payload !== 'object') {
        throw new AppError(
          'Invalid payload format',
          400,
          ERROR_CODES.JWT_INVALID_PAYLOAD,
          { correlationId }
        );
      }

      if (!secretOrPrivateKey) {
        throw new AppError(
          'Secret or private key is required',
          400,
          ERROR_CODES.JWT_NO_KEY_PROVIDED,
          { correlationId }
        );
      }

      logger.info('JWT signing started', {
        correlationId,
        algorithm: options.algorithm || 'HS256',
        hasExpiration: !!options.expiresIn,
        hasIssuer: !!(options.issuer || this.#config.defaultIssuer),
        hasAudience: !!(options.audience || this.#config.defaultAudience)
      });

      // Prepare signing options
      const signingOptions = {
        algorithm: options.algorithm || 'HS256',
        expiresIn: options.expiresIn,
        issuer: options.issuer || this.#config.defaultIssuer,
        audience: options.audience || this.#config.defaultAudience,
        subject: options.subject,
        jwtid: options.jwtid,
        noTimestamp: options.noTimestamp,
        header: options.header,
        encoding: options.encoding,
        allowInsecureKeySizes: false,
        allowInvalidAsymmetricKeyTypes: false
      };

      // Remove undefined options
      Object.keys(signingOptions).forEach(key => {
        if (signingOptions[key] === undefined) {
          delete signingOptions[key];
        }
      });

      // Validate algorithm security
      await this.#validateAlgorithm(signingOptions.algorithm);

      const token = jwt.sign(payload, secretOrPrivateKey, signingOptions);

      logger.info('JWT signing successful', {
        correlationId,
        algorithm: signingOptions.algorithm,
        tokenLength: token.length
      });

      return token;

    } catch (error) {
      logger.error('JWT signing failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'JWT signing failed',
        500,
        ERROR_CODES.JWT_SIGNING_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Retrieves JWK Set from a given URI
   * @param {string} jwksUri - JWKS URI
   * @param {Object} [options] - Retrieval options
   * @param {boolean} [options.useCache=true] - Use cached JWK set
   * @returns {Promise<Object>} JWK Set
   */
  async getJWKSet(jwksUri, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      if (!jwksUri) {
        throw new AppError(
          'JWKS URI is required',
          400,
          ERROR_CODES.JWT_INVALID_JWKS_URI,
          { correlationId }
        );
      }

      logger.debug('JWK Set retrieval started', {
        correlationId,
        jwksUri,
        useCache: options.useCache !== false
      });

      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `jwks:${this.#hashUri(jwksUri)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('JWK Set retrieved from cache', { correlationId });
          return cached;
        }
      }

      // Retrieve JWK Set
      const response = await this.#fetchJWKSet(jwksUri);
      const jwkSet = response.data || response;

      // Validate JWK Set format
      if (!jwkSet.keys || !Array.isArray(jwkSet.keys)) {
        throw new AppError(
          'Invalid JWK Set format',
          400,
          ERROR_CODES.JWT_INVALID_JWKS_FORMAT,
          { correlationId, jwksUri }
        );
      }

      // Process and validate individual keys
      const processedKeys = await Promise.all(
        jwkSet.keys.map(async (key, index) => {
          try {
            return await this.#processJWK(key, index, correlationId);
          } catch (keyError) {
            logger.warn('Failed to process JWK', {
              correlationId,
              keyIndex: index,
              keyId: key.kid,
              error: keyError.message
            });
            return null;
          }
        })
      );

      const validKeys = processedKeys.filter(key => key !== null);

      if (validKeys.length === 0) {
        throw new AppError(
          'No valid keys found in JWK Set',
          400,
          ERROR_CODES.JWT_NO_VALID_KEYS,
          { correlationId, jwksUri }
        );
      }

      const processedJwkSet = {
        keys: validKeys,
        retrievedAt: Date.now(),
        source: jwksUri
      };

      // Cache the processed JWK Set
      if (options.useCache !== false) {
        const cacheKey = `jwks:${this.#hashUri(jwksUri)}`;
        await this.#cacheService.set(cacheKey, processedJwkSet, this.#config.jwkCacheTTL);
      }

      logger.info('JWK Set retrieved successfully', {
        correlationId,
        jwksUri,
        keyCount: validKeys.length,
        algorithms: [...new Set(validKeys.map(k => k.alg).filter(Boolean))]
      });

      return processedJwkSet;

    } catch (error) {
      logger.error('JWK Set retrieval failed', {
        correlationId,
        jwksUri,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to retrieve JWK Set',
        500,
        ERROR_CODES.JWT_JWKS_RETRIEVAL_FAILED,
        { correlationId, jwksUri, originalError: error.message }
      );
    }
  }

  /**
   * Finds a specific JWK by key ID
   * @param {string} jwksUri - JWKS URI
   * @param {string} keyId - Key ID to find
   * @returns {Promise<Object|null>} Found JWK or null
   */
  async findJWK(jwksUri, keyId) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.debug('JWK search started', {
        correlationId,
        jwksUri,
        keyId
      });

      const jwkSet = await this.getJWKSet(jwksUri);
      const jwk = jwkSet.keys.find(key => key.kid === keyId);

      if (!jwk) {
        logger.warn('JWK not found', {
          correlationId,
          keyId,
          availableKeys: jwkSet.keys.map(k => k.kid)
        });
        return null;
      }

      logger.debug('JWK found successfully', {
        correlationId,
        keyId,
        algorithm: jwk.alg,
        use: jwk.use
      });

      return jwk;

    } catch (error) {
      logger.error('JWK search failed', {
        correlationId,
        jwksUri,
        keyId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Validates token claims against expected values
   * @param {Object} payload - Token payload
   * @param {Object} expected - Expected claim values
   * @returns {boolean} Validation result
   */
  validateClaims(payload, expected) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.debug('Claims validation started', {
        correlationId,
        expectedClaims: Object.keys(expected)
      });

      const validationResults = [];

      Object.entries(expected).forEach(([claim, expectedValue]) => {
        const actualValue = payload[claim];
        let isValid = false;

        if (Array.isArray(expectedValue)) {
          isValid = expectedValue.includes(actualValue);
        } else if (typeof expectedValue === 'function') {
          isValid = expectedValue(actualValue);
        } else {
          isValid = actualValue === expectedValue;
        }

        validationResults.push({
          claim,
          expected: expectedValue,
          actual: actualValue,
          valid: isValid
        });
      });

      const failedValidations = validationResults.filter(r => !r.valid);

      if (failedValidations.length > 0) {
        logger.warn('Claims validation failed', {
          correlationId,
          failedClaims: failedValidations.map(f => f.claim)
        });

        throw new AppError(
          'Token claims validation failed',
          401,
          ERROR_CODES.JWT_CLAIMS_VALIDATION_FAILED,
          {
            correlationId,
            failedClaims: failedValidations
          }
        );
      }

      logger.debug('Claims validation successful', { correlationId });
      return true;

    } catch (error) {
      logger.error('Claims validation error', {
        correlationId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * @private
   * Verifies token with direct key
   */
  async #verifyWithKey(token, key, options, correlationId) {
    const verifyOptions = {
      algorithms: options.algorithms || this.#config.allowedAlgorithms,
      audience: options.audience || this.#config.defaultAudience,
      issuer: options.issuer || this.#config.defaultIssuer,
      subject: options.subject,
      clockTolerance: options.clockTolerance || this.#config.clockTolerance,
      maxAge: options.maxAge,
      jwtid: options.jwtid,
      nonce: options.nonce,
      complete: options.complete || true,
      ignoreExpiration: options.ignoreExpiration || this.#config.ignoreExpiration,
      ignoreNotBefore: options.ignoreNotBefore || this.#config.ignoreNotBefore
    };

    // Remove undefined options
    Object.keys(verifyOptions).forEach(key => {
      if (verifyOptions[key] === undefined) {
        delete verifyOptions[key];
      }
    });

    return jwt.verify(token, key, verifyOptions);
  }

  /**
   * @private
   * Verifies token with JWKS
   */
  async #verifyWithJWKS(token, jwksUri, options, correlationId) {
    const decoded = this.decode(token, { complete: true });
    const keyId = decoded.header.kid;

    if (this.#config.security.requireKeyId && !keyId) {
      throw new AppError(
        'Token missing required key ID',
        401,
        ERROR_CODES.JWT_MISSING_KEY_ID,
        { correlationId }
      );
    }

    // Get appropriate key from JWKS
    let jwk;
    if (keyId) {
      jwk = await this.findJWK(jwksUri, keyId);
      if (!jwk) {
        throw new AppError(
          `JWK not found for key ID: ${keyId}`,
          401,
          ERROR_CODES.JWT_KEY_NOT_FOUND,
          { correlationId, keyId }
        );
      }
    } else {
      const jwkSet = await this.getJWKSet(jwksUri);
      jwk = jwkSet.keys.find(key => 
        key.alg === decoded.header.alg && 
        (!key.use || key.use === 'sig')
      );
      
      if (!jwk) {
        throw new AppError(
          'No suitable key found for token verification',
          401,
          ERROR_CODES.JWT_NO_SUITABLE_KEY,
          { correlationId, algorithm: decoded.header.alg }
        );
      }
    }

    // Convert JWK to key for verification
    const key = await this.#jwkToKey(jwk, correlationId);
    
    return this.#verifyWithKey(token, key, options, correlationId);
  }

  /**
   * @private
   * Converts JWK to verification key
   */
  async #jwkToKey(jwk, correlationId) {
    try {
      const keystore = jose.JWK.asKeyStore();
      const key = await keystore.add(jwk);
      return key.toPEM();
    } catch (error) {
      logger.error('JWK to key conversion failed', {
        correlationId,
        error: error.message,
        keyId: jwk.kid
      });

      throw new AppError(
        'Failed to convert JWK to key',
        500,
        ERROR_CODES.JWT_KEY_CONVERSION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Validates algorithm security
   */
  async #validateAlgorithm(algorithm, allowedAlgorithms) {
    const allowed = allowedAlgorithms || this.#config.allowedAlgorithms;

    if (!allowed.includes(algorithm)) {
      throw new AppError(
        `Algorithm '${algorithm}' is not allowed`,
        401,
        ERROR_CODES.JWT_ALGORITHM_NOT_ALLOWED,
        { algorithm, allowedAlgorithms: allowed }
      );
    }

    if (algorithm === 'none' && !this.#config.security.allowNoneAlgorithm) {
      throw new AppError(
        'None algorithm is not permitted',
        401,
        ERROR_CODES.JWT_NONE_ALGORITHM_NOT_ALLOWED,
        { algorithm }
      );
    }

    if (!JWTService.#SECURE_ALGORITHMS.includes(algorithm) && algorithm !== 'none') {
      logger.warn('Using potentially insecure algorithm', { algorithm });
    }
  }

  /**
   * @private
   * Validates algorithm security during initialization
   */
  #validateAlgorithmSecurity() {
    const insecureAlgs = this.#config.allowedAlgorithms.filter(
      alg => !JWTService.#SECURE_ALGORITHMS.includes(alg) && alg !== 'none'
    );

    if (insecureAlgs.length > 0) {
      logger.warn('Configuration includes potentially insecure algorithms', {
        insecureAlgorithms: insecureAlgs
      });
    }

    if (this.#config.security.allowNoneAlgorithm) {
      logger.warn('None algorithm is explicitly allowed - this is insecure for production');
    }
  }

  /**
   * @private
   * Validates required claims presence
   */
  #validateRequiredClaims(payload) {
    const missingClaims = this.#config.requiredClaims.filter(
      claim => payload[claim] === undefined
    );

    if (missingClaims.length > 0) {
      throw new AppError(
        `Missing required claims: ${missingClaims.join(', ')}`,
        401,
        ERROR_CODES.JWT_MISSING_CLAIMS,
        { missingClaims }
      );
    }
  }

  /**
   * @private
   * Performs additional custom validations
   */
  async #performAdditionalValidations(payload, options, correlationId) {
    // Nonce validation
    if (options.nonce && payload.nonce !== options.nonce) {
      throw new AppError(
        'Nonce validation failed',
        401,
        ERROR_CODES.JWT_NONCE_VALIDATION_FAILED,
        { correlationId, expected: options.nonce, actual: payload.nonce }
      );
    }

    // Custom validators can be added here
    if (options.customValidators) {
      for (const validator of options.customValidators) {
        const result = await validator(payload, options);
        if (!result.valid) {
          throw new AppError(
            result.message || 'Custom validation failed',
            401,
            ERROR_CODES.JWT_CUSTOM_VALIDATION_FAILED,
            { correlationId, validationError: result }
          );
        }
      }
    }
  }

  /**
   * @private
   * Fetches JWK Set from URI
   */
  async #fetchJWKSet(jwksUri) {
    const axios = require('axios');

    const response = await axios.get(jwksUri, {
      timeout: this.#config.jwks.timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'InsightSerenity-JWT-Service'
      }
    });

    return response;
  }

  /**
   * @private
   * Processes individual JWK
   */
  async #processJWK(jwk, index, correlationId) {
    // Validate JWK format
    if (!jwk.kty) {
      throw new AppError(
        `JWK missing key type at index ${index}`,
        400,
        ERROR_CODES.JWT_INVALID_JWK_FORMAT,
        { correlationId, index }
      );
    }

    // Validate key usage if specified
    if (this.#config.security.validateKeyUsage && jwk.use && jwk.use !== 'sig') {
      logger.debug('Skipping JWK with non-signature use', {
        correlationId,
        keyId: jwk.kid,
        use: jwk.use
      });
      return null;
    }

    // Validate algorithm if specified
    if (jwk.alg && !this.#config.allowedAlgorithms.includes(jwk.alg)) {
      logger.debug('Skipping JWK with disallowed algorithm', {
        correlationId,
        keyId: jwk.kid,
        algorithm: jwk.alg
      });
      return null;
    }

    return jwk;
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `jwt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Hashes URI for cache key
   */
  #hashUri(uri) {
    return crypto.createHash('sha256').update(uri).digest('hex').substring(0, 16);
  }

  /**
   * Gets service configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      return {
        healthy: true,
        service: 'JWTService',
        configuration: {
          clockTolerance: this.#config.clockTolerance,
          allowedAlgorithms: this.#config.allowedAlgorithms.length,
          cacheEnabled: !!this.#cacheService,
          securityFeatures: {
            requireKeyId: this.#config.security.requireKeyId,
            validateKeyUsage: this.#config.security.validateKeyUsage,
            allowNoneAlgorithm: this.#config.security.allowNoneAlgorithm
          }
        },
        cache: {
          jwkSetsCount: this.#jwkSetsCache.size,
          publicKeysCount: this.#publicKeysCache.size
        }
      };
    } catch (error) {
      logger.error('JWT service health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'JWTService',
        error: error.message
      };
    }
  }
}

module.exports = JWTService;