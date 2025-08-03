'use strict';

/**
 * @fileoverview JWT authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/jwt-strategy
 * @requires module:passport-jwt
 * @requires module:shared/lib/auth/services/token-service
 * @requires module:shared/lib/auth/services/blacklist-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 */

const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const TokenService = require('../services/token-service');
const BlacklistService = require('../services/blacklist-service');
const UserModel = require('../../database/models/users/user-model');
const OrganizationModel = require('../../database/models/organizations/organization-model');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class JWTAuthStrategy
 * @description JWT authentication strategy with enterprise security features
 */
class JWTAuthStrategy {
  /**
   * @private
   * @type {TokenService}
   */
  #tokenService;

  /**
   * @private
   * @type {BlacklistService}
   */
  #blacklistService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #verificationMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    secretOrKey: process.env.JWT_SECRET,
    algorithms: ['HS256', 'RS256'],
    issuer: process.env.JWT_ISSUER || 'insightserenity',
    audience: process.env.JWT_AUDIENCE || 'insightserenity-platform',
    passReqToCallback: true,
    ignoreExpiration: false,
    cache: {
      userCacheTTL: 300, // 5 minutes
      blacklistCacheTTL: 600 // 10 minutes
    },
    security: {
      validateTokenFingerprint: true,
      validateTokenBinding: true,
      checkTokenRevocation: true,
      enforceTokenExpiry: true
    },
    audit: {
      logVerificationAttempts: true,
      logFailedAttempts: true,
      logSuspiciousActivity: true
    },
    extractors: {
      fromAuthHeaderAsBearerToken: true,
      fromCookie: 'access_token',
      fromUrlQueryParameter: 'token',
      fromBodyField: 'access_token'
    }
  };

  /**
   * Creates JWT strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {TokenService} [tokenService] - Token service instance
   * @param {BlacklistService} [blacklistService] - Blacklist service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    tokenService,
    blacklistService,
    cacheService,
    auditService
  ) {
    this.#config = { ...JWTAuthStrategy.#DEFAULT_CONFIG, ...config };
    this.#tokenService = tokenService || new TokenService();
    this.#blacklistService = blacklistService || new BlacklistService();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#verificationMetrics = new Map();

    logger.info('JWTAuthStrategy initialized', {
      algorithms: this.#config.algorithms,
      issuer: this.#config.issuer,
      audience: this.#config.audience
    });
  }

  /**
   * Gets Passport.js strategy configuration
   * @returns {JwtStrategy} Configured JWT strategy
   */
  getStrategy() {
    const options = this.#buildStrategyOptions();
    
    return new JwtStrategy(options, async (req, payload, done) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Validate token payload structure
        await this.#validateTokenPayload(payload, correlationId);

        // Check token revocation
        if (this.#config.security.checkTokenRevocation) {
          const token = this.#extractTokenFromRequest(req);
          const isRevoked = await this.#checkTokenRevocation(token, correlationId);
          if (isRevoked) {
            throw new AppError(
              'Token has been revoked',
              401,
              ERROR_CODES.TOKEN_REVOKED,
              { correlationId }
            );
          }
        }

        // Validate token binding
        if (this.#config.security.validateTokenBinding) {
          await this.#validateTokenBinding(req, payload, correlationId);
        }

        // Get user with caching
        const user = await this.#getUserFromPayload(payload, correlationId);
        if (!user) {
          throw new AppError(
            'User not found',
            401,
            ERROR_CODES.USER_NOT_FOUND,
            { correlationId, userId: payload.sub }
          );
        }

        // Validate user status
        await this.#validateUserStatus(user, correlationId);

        // Validate organization membership if applicable
        if (payload.org) {
          await this.#validateOrganizationMembership(user, payload.org, correlationId);
        }

        // Enhance user object with token metadata
        const enhancedUser = this.#enhanceUserObject(user, payload);

        // Track successful verification
        this.#trackVerificationMetric(true, Date.now() - startTime);

        // Audit successful verification
        if (this.#config.audit.logVerificationAttempts) {
          await this.#auditVerification(req, user, true, correlationId);
        }

        logger.debug('JWT verification successful', {
          correlationId,
          userId: user._id,
          duration: Date.now() - startTime
        });

        return done(null, enhancedUser);

      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Track failed verification
        this.#trackVerificationMetric(false, duration);

        // Audit failed verification
        if (this.#config.audit.logFailedAttempts) {
          await this.#auditVerification(req, null, false, correlationId, error.message);
        }

        logger.error('JWT verification failed', {
          correlationId,
          error: error.message,
          duration
        });

        return done(error, false);
      }
    });
  }

  /**
   * @private
   * Builds strategy options
   */
  #buildStrategyOptions() {
    const extractors = [];

    // Add token extractors
    if (this.#config.extractors.fromAuthHeaderAsBearerToken) {
      extractors.push(ExtractJwt.fromAuthHeaderAsBearerToken());
    }

    if (this.#config.extractors.fromCookie) {
      extractors.push((req) => req.cookies?.[this.#config.extractors.fromCookie]);
    }

    if (this.#config.extractors.fromUrlQueryParameter) {
      extractors.push(ExtractJwt.fromUrlQueryParameter(this.#config.extractors.fromUrlQueryParameter));
    }

    if (this.#config.extractors.fromBodyField) {
      extractors.push(ExtractJwt.fromBodyField(this.#config.extractors.fromBodyField));
    }

    return {
      secretOrKey: this.#config.secretOrKey,
      algorithms: this.#config.algorithms,
      issuer: this.#config.issuer,
      audience: this.#config.audience,
      passReqToCallback: this.#config.passReqToCallback,
      ignoreExpiration: this.#config.ignoreExpiration,
      jwtFromRequest: ExtractJwt.fromExtractors(extractors)
    };
  }

  /**
   * @private
   * Validates token payload structure
   */
  async #validateTokenPayload(payload, correlationId) {
    // Check required fields
    if (!payload.sub) {
      throw new AppError(
        'Invalid token payload: missing subject',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { correlationId }
      );
    }

    if (!payload.iat || !payload.exp) {
      throw new AppError(
        'Invalid token payload: missing timestamps',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { correlationId }
      );
    }

    // Validate token age
    const tokenAge = Date.now() / 1000 - payload.iat;
    if (tokenAge < 0) {
      throw new AppError(
        'Invalid token: issued in the future',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { correlationId }
      );
    }

    // Check token type
    if (payload.type && payload.type !== 'access') {
      throw new AppError(
        'Invalid token type',
        401,
        ERROR_CODES.INVALID_TOKEN_TYPE,
        { correlationId, type: payload.type }
      );
    }
  }

  /**
   * @private
   * Checks token revocation status
   */
  async #checkTokenRevocation(token, correlationId) {
    const cacheKey = `token_revoked:${token}`;
    
    // Check cache first
    const cachedStatus = await this.#cacheService.get(cacheKey);
    if (cachedStatus !== null) {
      return cachedStatus;
    }

    // Check blacklist service
    const isRevoked = await this.#blacklistService.isTokenBlacklisted(token);
    
    // Cache the result
    await this.#cacheService.set(
      cacheKey,
      isRevoked,
      this.#config.cache.blacklistCacheTTL
    );

    return isRevoked;
  }

  /**
   * @private
   * Validates token binding to request context
   */
  async #validateTokenBinding(req, payload, correlationId) {
    // Validate IP binding
    if (payload.ip) {
      const currentIP = req.ip || req.connection.remoteAddress;
      if (currentIP !== payload.ip) {
        logger.warn('Token IP binding mismatch', {
          correlationId,
          tokenIP: payload.ip,
          currentIP
        });

        if (this.#config.security.strictIPBinding) {
          throw new AppError(
            'Token binding validation failed',
            401,
            ERROR_CODES.TOKEN_BINDING_MISMATCH,
            { correlationId }
          );
        }
      }
    }

    // Validate fingerprint
    if (payload.fingerprint && this.#config.security.validateTokenFingerprint) {
      const requestFingerprint = await this.#generateRequestFingerprint(req);
      if (requestFingerprint !== payload.fingerprint) {
        logger.warn('Token fingerprint mismatch', {
          correlationId,
          tokenFingerprint: payload.fingerprint,
          requestFingerprint
        });

        if (this.#config.audit.logSuspiciousActivity) {
          await this.#auditSuspiciousActivity(req, payload, 'fingerprint_mismatch', correlationId);
        }
      }
    }
  }

  /**
   * @private
   * Gets user from token payload
   */
  async #getUserFromPayload(payload, correlationId) {
    const cacheKey = `jwt_user:${payload.sub}:${payload.org || 'default'}`;
    
    // Check cache
    const cachedUser = await this.#cacheService.get(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    // Build query
    const query = {
      _id: payload.sub,
      isActive: true
    };

    if (payload.org) {
      query.organizationId = payload.org;
    }

    // Get user from database
    const user = await UserModel.findOne(query)
      .populate('roles')
      .populate('permissions')
      .populate({
        path: 'organizationId',
        select: 'name slug isActive subscription'
      })
      .lean();

    if (user) {
      // Cache user
      await this.#cacheService.set(cacheKey, user, this.#config.cache.userCacheTTL);
    }

    return user;
  }

  /**
   * @private
   * Validates user status
   */
  async #validateUserStatus(user, correlationId) {
    if (!user.isActive) {
      throw new AppError(
        'User account is inactive',
        403,
        ERROR_CODES.ACCOUNT_INACTIVE,
        { correlationId }
      );
    }

    if (user.isLocked) {
      throw new AppError(
        'User account is locked',
        403,
        ERROR_CODES.ACCOUNT_LOCKED,
        { correlationId }
      );
    }

    if (user.isSuspended) {
      throw new AppError(
        'User account is suspended',
        403,
        ERROR_CODES.ACCOUNT_SUSPENDED,
        { correlationId, suspendedUntil: user.suspendedUntil }
      );
    }
  }

  /**
   * @private
   * Validates organization membership
   */
  async #validateOrganizationMembership(user, organizationId, correlationId) {
    if (!user.organizationId || user.organizationId.toString() !== organizationId) {
      throw new AppError(
        'User not member of organization',
        403,
        ERROR_CODES.ORGANIZATION_MISMATCH,
        { correlationId }
      );
    }

    // Validate organization status
    const org = user.organizationId;
    if (typeof org === 'object' && !org.isActive) {
      throw new AppError(
        'Organization is inactive',
        403,
        ERROR_CODES.ORGANIZATION_INACTIVE,
        { correlationId }
      );
    }
  }

  /**
   * @private
   * Enhances user object with token metadata
   */
  #enhanceUserObject(user, payload) {
    return {
      ...user,
      tokenMetadata: {
        jti: payload.jti,
        iat: payload.iat,
        exp: payload.exp,
        scope: payload.scope,
        permissions: payload.permissions,
        sessionId: payload.sessionId
      }
    };
  }

  /**
   * @private
   * Extracts token from request
   */
  #extractTokenFromRequest(req) {
    // From Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // From cookie
    if (req.cookies?.[this.#config.extractors.fromCookie]) {
      return req.cookies[this.#config.extractors.fromCookie];
    }

    // From query parameter
    if (req.query?.[this.#config.extractors.fromUrlQueryParameter]) {
      return req.query[this.#config.extractors.fromUrlQueryParameter];
    }

    return null;
  }

  /**
   * @private
   * Generates request fingerprint
   */
  async #generateRequestFingerprint(req) {
    const components = [
      req.headers['user-agent'],
      req.headers['accept-language'],
      req.headers['accept-encoding'],
      req.connection.remoteAddress
    ].filter(Boolean).join('|');

    // Use crypto helper to generate fingerprint
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(components)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * @private
   * Audits JWT verification
   */
  async #auditVerification(req, user, success, correlationId, error) {
    try {
      await this.#auditService.logEvent({
        event: success ? 'jwt.verification.success' : 'jwt.verification.failed',
        userId: user?._id,
        organizationId: user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          method: req.method,
          path: req.path,
          success,
          error,
          tokenExtractor: this.#getTokenExtractorUsed(req)
        }
      });
    } catch (err) {
      logger.error('Failed to audit JWT verification', { error: err.message });
    }
  }

  /**
   * @private
   * Audits suspicious activity
   */
  async #auditSuspiciousActivity(req, payload, reason, correlationId) {
    try {
      await this.#auditService.logSecurityEvent({
        event: 'jwt.suspicious_activity',
        severity: 'medium',
        userId: payload.sub,
        organizationId: payload.org,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          reason,
          tokenId: payload.jti,
          tokenIssuedAt: payload.iat,
          method: req.method,
          path: req.path
        }
      });
    } catch (err) {
      logger.error('Failed to audit suspicious activity', { error: err.message });
    }
  }

  /**
   * @private
   * Gets token extractor used
   */
  #getTokenExtractorUsed(req) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return 'authorization_header';
    }
    if (req.cookies?.[this.#config.extractors.fromCookie]) {
      return 'cookie';
    }
    if (req.query?.[this.#config.extractors.fromUrlQueryParameter]) {
      return 'query_parameter';
    }
    return 'unknown';
  }

  /**
   * @private
   * Tracks verification metrics
   */
  #trackVerificationMetric(success, duration) {
    const key = success ? 'success' : 'failure';
    const current = this.#verificationMetrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.#verificationMetrics.set(key, {
      count: current.count + 1,
      totalDuration: current.totalDuration + duration,
      avgDuration: (current.totalDuration + duration) / (current.count + 1)
    });
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `jwt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets verification metrics
   * @returns {Object} Verification metrics
   */
  getMetrics() {
    const metrics = {};
    this.#verificationMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }
}

// Export factory function
module.exports = (config) => {
  const strategy = new JWTAuthStrategy(config);
  return strategy.getStrategy();
};

// Also export class for testing
module.exports.JWTAuthStrategy = JWTAuthStrategy;