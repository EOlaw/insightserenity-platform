'use strict';

/**
 * @fileoverview Authentication middleware for JWT and session-based authentication
 * @module shared/lib/auth/middleware/authenticate
 * @requires module:passport
 * @requires module:shared/lib/auth/services/token-service
 * @requires module:shared/lib/auth/services/session-service
 * @requires module:shared/lib/auth/services/blacklist-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/session-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 */

const passport = require('passport');
const TokenService = require('../services/token-service');
const SessionService = require('../services/session-service');
const BlacklistService = require('../services/blacklist-service');
const UserModel = require('../../database/models/user-model');
const OrganizationModel = require('../../database/models/organization-model');
const SessionModel = require('../../database/models/session-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');

/**
 * @class AuthenticationMiddleware
 * @description Handles JWT and session-based authentication with enterprise security features
 */
class AuthenticationMiddleware {
  /**
   * @private
   * @type {TokenService}
   */
  #tokenService;

  /**
   * @private
   * @type {SessionService}
   */
  #sessionService;

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
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    tokenLocation: {
      header: 'Authorization',
      headerScheme: 'Bearer',
      cookie: 'access_token',
      query: 'token'
    },
    sessionCookie: {
      name: 'sessionId',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 86400000 // 24 hours
    },
    cache: {
      userCacheTTL: 300, // 5 minutes
      permissionCacheTTL: 600 // 10 minutes
    },
    security: {
      requireSecureContext: process.env.NODE_ENV === 'production',
      validateIPAddress: true,
      validateUserAgent: true,
      enableTokenFingerprinting: true
    },
    audit: {
      logAuthenticationAttempts: true,
      logSensitiveAccess: true
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #AUTH_STRATEGIES = {
    JWT: 'jwt',
    SESSION: 'session',
    API_KEY: 'apiKey',
    OAUTH: 'oauth',
    PASSKEY: 'passkey'
  };

  /**
   * Creates authentication middleware instance
   * @param {Object} [config] - Middleware configuration
   * @param {TokenService} [tokenService] - Token service instance
   * @param {SessionService} [sessionService] - Session service instance
   * @param {BlacklistService} [blacklistService] - Blacklist service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    tokenService,
    sessionService,
    blacklistService,
    cacheService,
    auditService
  ) {
    this.#config = { ...AuthenticationMiddleware.#DEFAULT_CONFIG, ...config };
    this.#tokenService = tokenService || new TokenService();
    this.#sessionService = sessionService || new SessionService();
    this.#blacklistService = blacklistService || new BlacklistService();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();

    logger.info('AuthenticationMiddleware initialized', {
      strategies: Object.values(AuthenticationMiddleware.#AUTH_STRATEGIES),
      secureContext: this.#config.security.requireSecureContext
    });
  }

  /**
   * Authenticates requests using JWT tokens
   * @param {Object} [options] - Authentication options
   * @returns {Function} Express middleware function
   */
  authenticateJWT(options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Extract token
        const token = await this.#extractToken(req);
        if (!token) {
          throw new AppError(
            'No authentication token provided',
            401,
            ERROR_CODES.MISSING_TOKEN,
            { correlationId }
          );
        }

        // Check if token is blacklisted
        const isBlacklisted = await this.#blacklistService.isTokenBlacklisted(token);
        if (isBlacklisted) {
          throw new AppError(
            'Token has been revoked',
            401,
            ERROR_CODES.TOKEN_REVOKED,
            { correlationId }
          );
        }

        // Verify token
        const payload = await this.#tokenService.verifyAccessToken(token, {
          correlationId,
          ...options
        });

        // Validate security context
        if (this.#config.security.requireSecureContext) {
          await this.#validateSecurityContext(req, payload);
        }

        // Get user from cache or database
        const user = await this.#getAuthenticatedUser(payload.sub, payload.org);
        if (!user) {
          throw new AppError(
            'User not found',
            401,
            ERROR_CODES.USER_NOT_FOUND,
            { correlationId }
          );
        }

        // Validate user status
        await this.#validateUserStatus(user);

        // Enhance request with auth data
        req.auth = {
          user: this.#sanitizeUser(user),
          token: payload,
          strategy: AuthenticationMiddleware.#AUTH_STRATEGIES.JWT,
          correlationId
        };

        // Update user activity
        this.#updateUserActivity(user._id).catch(err => 
          logger.error('Failed to update user activity', { error: err.message })
        );

        // Audit successful authentication
        if (this.#config.audit.logAuthenticationAttempts) {
          this.#auditAuthentication(req, user, true, correlationId);
        }

        const duration = Date.now() - startTime;
        logger.debug('JWT authentication successful', {
          correlationId,
          userId: user._id,
          duration
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;
        
        if (this.#config.audit.logAuthenticationAttempts) {
          this.#auditAuthentication(req, null, false, correlationId, error.message);
        }

        logger.error('JWT authentication failed', {
          correlationId,
          error: error.message,
          duration
        });

        if (options.optional && error.code === ERROR_CODES.MISSING_TOKEN) {
          req.auth = null;
          return next();
        }

        next(error instanceof AppError ? error : new AppError(
          'Authentication failed',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Authenticates requests using session cookies
   * @param {Object} [options] - Authentication options
   * @returns {Function} Express middleware function
   */
  authenticateSession(options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Get session ID from cookie
        const sessionId = req.cookies?.[this.#config.sessionCookie.name] || 
                         req.signedCookies?.[this.#config.sessionCookie.name];

        if (!sessionId) {
          throw new AppError(
            'No session found',
            401,
            ERROR_CODES.MISSING_SESSION,
            { correlationId }
          );
        }

        // Get session
        const session = await this.#sessionService.getSession(sessionId);
        if (!session || !session.isActive) {
          throw new AppError(
            'Invalid or expired session',
            401,
            ERROR_CODES.INVALID_SESSION,
            { correlationId }
          );
        }

        // Validate session integrity
        await this.#validateSessionIntegrity(req, session);

        // Get user
        const user = await this.#getAuthenticatedUser(session.userId, session.organizationId);
        if (!user) {
          throw new AppError(
            'User not found',
            401,
            ERROR_CODES.USER_NOT_FOUND,
            { correlationId }
          );
        }

        // Validate user status
        await this.#validateUserStatus(user);

        // Enhance request with auth data
        req.auth = {
          user: this.#sanitizeUser(user),
          session,
          strategy: AuthenticationMiddleware.#AUTH_STRATEGIES.SESSION,
          correlationId
        };

        // Touch session to extend expiry
        await this.#sessionService.touchSession(sessionId);

        logger.debug('Session authentication successful', {
          correlationId,
          userId: user._id,
          sessionId
        });

        next();

      } catch (error) {
        logger.error('Session authentication failed', {
          correlationId,
          error: error.message
        });

        if (options.optional && error.code === ERROR_CODES.MISSING_SESSION) {
          req.auth = null;
          return next();
        }

        next(error instanceof AppError ? error : new AppError(
          'Authentication failed',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Authenticates using Passport.js strategies
   * @param {string} strategy - Passport strategy name
   * @param {Object} [options] - Authentication options
   * @returns {Function} Express middleware function
   */
  authenticatePassport(strategy, options = {}) {
    return (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      passport.authenticate(strategy, {
        session: false,
        ...options
      }, async (err, user, info) => {
        try {
          if (err) {
            throw new AppError(
              'Authentication error',
              401,
              ERROR_CODES.AUTHENTICATION_ERROR,
              { correlationId, originalError: err.message }
            );
          }

          if (!user) {
            throw new AppError(
              info?.message || 'Authentication failed',
              401,
              ERROR_CODES.AUTHENTICATION_ERROR,
              { correlationId, info }
            );
          }

          // Validate user status
          await this.#validateUserStatus(user);

          // Enhance request with auth data
          req.auth = {
            user: this.#sanitizeUser(user),
            strategy,
            correlationId,
            info
          };

          // Generate tokens if needed
          if (options.generateTokens) {
            const tokens = await this.#generateAuthTokens(user);
            req.auth.tokens = tokens;
          }

          logger.debug('Passport authentication successful', {
            correlationId,
            strategy,
            userId: user._id
          });

          next();

        } catch (error) {
          logger.error('Passport authentication failed', {
            correlationId,
            strategy,
            error: error.message
          });

          next(error instanceof AppError ? error : new AppError(
            'Authentication failed',
            401,
            ERROR_CODES.AUTHENTICATION_ERROR,
            { correlationId, originalError: error.message }
          ));
        }
      })(req, res, next);
    };
  }

  /**
   * Authenticates API keys
   * @param {Object} [options] - Authentication options
   * @returns {Function} Express middleware function
   */
  authenticateAPIKey(options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Extract API key
        const apiKey = req.headers['x-api-key'] || 
                      req.headers['api-key'] ||
                      req.query.apiKey;

        if (!apiKey) {
          throw new AppError(
            'No API key provided',
            401,
            ERROR_CODES.MISSING_API_KEY,
            { correlationId }
          );
        }

        // Verify API key format
        const keyData = await this.#tokenService.verifyAPIKey(apiKey);

        // Get API key metadata from database
        const apiKeyDoc = await this.#getAPIKeyDocument(keyData.keyId);
        if (!apiKeyDoc) {
          throw new AppError(
            'Invalid API key',
            401,
            ERROR_CODES.INVALID_API_KEY,
            { correlationId }
          );
        }

        // Verify key hash
        const isValid = await this.#verifyAPIKeyHash(apiKey, apiKeyDoc.hashedKey);
        if (!isValid) {
          throw new AppError(
            'Invalid API key',
            401,
            ERROR_CODES.INVALID_API_KEY,
            { correlationId }
          );
        }

        // Check key status
        if (!apiKeyDoc.isActive || (apiKeyDoc.expiresAt && apiKeyDoc.expiresAt < new Date())) {
          throw new AppError(
            'API key expired or inactive',
            401,
            ERROR_CODES.API_KEY_EXPIRED,
            { correlationId }
          );
        }

        // Get associated user
        const user = await this.#getAuthenticatedUser(apiKeyDoc.userId, apiKeyDoc.organizationId);
        if (!user) {
          throw new AppError(
            'User not found',
            401,
            ERROR_CODES.USER_NOT_FOUND,
            { correlationId }
          );
        }

        // Enhance request with auth data
        req.auth = {
          user: this.#sanitizeUser(user),
          apiKey: {
            id: apiKeyDoc._id,
            name: apiKeyDoc.name,
            scopes: apiKeyDoc.scopes,
            lastUsedAt: apiKeyDoc.lastUsedAt
          },
          strategy: AuthenticationMiddleware.#AUTH_STRATEGIES.API_KEY,
          correlationId
        };

        // Update API key usage
        this.#updateAPIKeyUsage(apiKeyDoc._id).catch(err =>
          logger.error('Failed to update API key usage', { error: err.message })
        );

        logger.debug('API key authentication successful', {
          correlationId,
          keyId: keyData.keyId,
          userId: user._id
        });

        next();

      } catch (error) {
        logger.error('API key authentication failed', {
          correlationId,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'Authentication failed',
          401,
          ERROR_CODES.AUTHENTICATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Combined authentication supporting multiple strategies
   * @param {Array<string>} strategies - Array of authentication strategies
   * @param {Object} [options] - Authentication options
   * @returns {Function} Express middleware function
   */
  authenticate(strategies = ['jwt', 'session'], options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const errors = [];

      for (const strategy of strategies) {
        try {
          switch (strategy.toLowerCase()) {
            case 'jwt':
              await new Promise((resolve, reject) => {
                this.authenticateJWT({ ...options, optional: true })(req, res, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              break;

            case 'session':
              await new Promise((resolve, reject) => {
                this.authenticateSession({ ...options, optional: true })(req, res, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              break;

            case 'apikey':
            case 'api-key':
              await new Promise((resolve, reject) => {
                this.authenticateAPIKey({ ...options, optional: true })(req, res, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
              break;

            default:
              if (passport._strategies[strategy]) {
                await new Promise((resolve, reject) => {
                  this.authenticatePassport(strategy, { ...options, optional: true })(req, res, (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              }
          }

          if (req.auth) {
            logger.debug('Authentication successful', {
              correlationId,
              strategy,
              userId: req.auth.user._id
            });
            return next();
          }

        } catch (error) {
          errors.push({ strategy, error: error.message });
        }
      }

      // No successful authentication
      if (options.optional) {
        req.auth = null;
        return next();
      }

      logger.error('All authentication strategies failed', {
        correlationId,
        strategies,
        errors
      });

      next(new AppError(
        'Authentication required',
        401,
        ERROR_CODES.AUTHENTICATION_REQUIRED,
        { correlationId, strategies, errors }
      ));
    };
  }

  /**
   * @private
   * Extracts JWT token from request
   */
  async #extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers[this.#config.tokenLocation.header.toLowerCase()];
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === this.#config.tokenLocation.headerScheme && token) {
        return token;
      }
    }

    // Check cookie
    if (req.cookies?.[this.#config.tokenLocation.cookie]) {
      return req.cookies[this.#config.tokenLocation.cookie];
    }

    // Check query parameter
    if (req.query?.[this.#config.tokenLocation.query]) {
      return req.query[this.#config.tokenLocation.query];
    }

    return null;
  }

  /**
   * @private
   * Gets authenticated user with caching
   */
  async #getAuthenticatedUser(userId, organizationId) {
    const cacheKey = `user:${userId}:${organizationId || 'default'}`;
    
    // Check cache
    const cachedUser = await this.#cacheService.get(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    // Get from database
    const query = { _id: userId, isActive: true };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    const user = await UserModel.findOne(query)
      .populate('roles')
      .populate('permissions')
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
  async #validateUserStatus(user) {
    if (!user.isActive) {
      throw new AppError(
        'Account is inactive',
        403,
        ERROR_CODES.ACCOUNT_INACTIVE
      );
    }

    if (user.isLocked) {
      throw new AppError(
        'Account is locked',
        403,
        ERROR_CODES.ACCOUNT_LOCKED
      );
    }

    if (user.emailVerificationRequired && !user.isEmailVerified) {
      throw new AppError(
        'Email verification required',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED
      );
    }

    if (user.passwordChangeRequired) {
      throw new AppError(
        'Password change required',
        403,
        ERROR_CODES.PASSWORD_CHANGE_REQUIRED
      );
    }
  }

  /**
   * @private
   * Validates security context
   */
  async #validateSecurityContext(req, tokenPayload) {
    if (this.#config.security.validateIPAddress && tokenPayload.ip) {
      const currentIP = req.ip || req.connection.remoteAddress;
      if (currentIP !== tokenPayload.ip) {
        logger.warn('IP address mismatch detected', {
          tokenIP: tokenPayload.ip,
          currentIP
        });
      }
    }

    if (this.#config.security.validateUserAgent && tokenPayload.ua) {
      const currentUA = req.headers['user-agent'];
      if (currentUA !== tokenPayload.ua) {
        logger.warn('User agent mismatch detected', {
          tokenUA: tokenPayload.ua,
          currentUA
        });
      }
    }
  }

  /**
   * @private
   * Validates session integrity
   */
  async #validateSessionIntegrity(req, session) {
    if (this.#config.security.validateIPAddress) {
      const currentIP = req.ip || req.connection.remoteAddress;
      if (session.ipAddress && session.ipAddress !== currentIP) {
        throw new AppError(
          'Session IP mismatch',
          401,
          ERROR_CODES.SESSION_INVALID
        );
      }
    }

    if (this.#config.security.validateUserAgent) {
      const currentUA = req.headers['user-agent'];
      if (session.userAgent && session.userAgent !== currentUA) {
        throw new AppError(
          'Session user agent mismatch',
          401,
          ERROR_CODES.SESSION_INVALID
        );
      }
    }
  }

  /**
   * @private
   * Generates authentication tokens
   */
  async #generateAuthTokens(user) {
    const accessToken = await this.#tokenService.generateAccessToken({
      userId: user._id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.roles?.map(r => r.name),
      permissions: user.permissions?.map(p => p.code)
    });

    const refreshToken = await this.#tokenService.generateRefreshToken({
      userId: user._id,
      organizationId: user.organizationId
    });

    return { accessToken, refreshToken };
  }

  /**
   * @private
   * Gets API key document
   */
  async #getAPIKeyDocument(keyId) {
    // This would typically query an APIKey model
    // Placeholder for actual implementation
    return {
      _id: keyId,
      hashedKey: 'hashed_key',
      userId: 'user_id',
      organizationId: 'org_id',
      name: 'API Key Name',
      scopes: ['read', 'write'],
      isActive: true,
      expiresAt: null,
      lastUsedAt: new Date()
    };
  }

  /**
   * @private
   * Verifies API key hash
   */
  async #verifyAPIKeyHash(apiKey, hashedKey) {
    // Placeholder - would use encryption service
    return true;
  }

  /**
   * @private
   * Updates user activity
   */
  async #updateUserActivity(userId) {
    await UserModel.findByIdAndUpdate(userId, {
      lastActivity: new Date()
    });
  }

  /**
   * @private
   * Updates API key usage
   */
  async #updateAPIKeyUsage(keyId) {
    // Placeholder - would update APIKey model
    logger.debug('API key usage updated', { keyId });
  }

  /**
   * @private
   * Audits authentication attempt
   */
  async #auditAuthentication(req, user, success, correlationId, error) {
    try {
      await this.#auditService.logEvent({
        event: success ? 'auth.success' : 'auth.failed',
        userId: user?._id,
        organizationId: user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          method: req.method,
          path: req.path,
          success,
          error
        }
      });
    } catch (err) {
      logger.error('Failed to audit authentication', { error: err.message });
    }
  }

  /**
   * @private
   * Sanitizes user object
   */
  #sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.twoFactorSecret;
    delete sanitized.passwordResetToken;
    delete sanitized.emailVerificationToken;
    return sanitized;
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates authentication middleware instance
 * @param {Object} [config] - Middleware configuration
 * @returns {AuthenticationMiddleware} Middleware instance
 */
const getAuthenticationMiddleware = (config) => {
  if (!instance) {
    instance = new AuthenticationMiddleware(config);
  }
  return instance;
};

module.exports = {
  AuthenticationMiddleware,
  getAuthenticationMiddleware,
  // Export convenience methods
  authenticateJWT: (options) => getAuthenticationMiddleware().authenticateJWT(options),
  authenticateSession: (options) => getAuthenticationMiddleware().authenticateSession(options),
  authenticatePassport: (strategy, options) => getAuthenticationMiddleware().authenticatePassport(strategy, options),
  authenticateAPIKey: (options) => getAuthenticationMiddleware().authenticateAPIKey(options),
  authenticate: (strategies, options) => getAuthenticationMiddleware().authenticate(strategies, options)
};