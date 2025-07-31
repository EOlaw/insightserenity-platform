'use strict';

/**
 * @fileoverview Session security manager for enterprise session management
 * @module shared/lib/security/session-manager
 * @requires module:shared/lib/auth/services/session-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/config
 */

const SessionService = require('../auth/services/session-service');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const CacheService = require('../services/cache-service');
const EncryptionService = require('./encryption/encryption-service');
const config = require('../../config');

/**
 * @class SessionManager
 * @description Manages session security, validation, and middleware for enterprise applications
 * Integrates with the platform's configuration system and security policies
 */
class SessionManager {
  /**
   * @private
   * @type {SessionService}
   */
  #sessionService;

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
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #sessionPolicies;

  /**
   * @private
   * @type {Map}
   */
  #securityMetrics;

  /**
   * @private
   * @type {Map}
   */
  #failedAttempts;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #SECURITY_LEVELS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #SESSION_EVENTS = {
    CREATED: 'session.created',
    VALIDATED: 'session.validated',
    REFRESHED: 'session.refreshed',
    TERMINATED: 'session.terminated',
    LOCKED: 'session.locked',
    SUSPICIOUS: 'session.suspicious',
    CSRF_FAILED: 'session.csrf_failed'
  };

  /**
   * Creates a new SessionManager instance
   * @param {Object} [customConfig] - Custom configuration to override defaults
   * @param {SessionService} [sessionService] - Session service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   */
  constructor(customConfig = {}, sessionService, cacheService, encryptionService) {
    // Build configuration from platform config
    this.#config = this.#buildConfiguration(customConfig);
    
    // Initialize services
    this.#sessionService = sessionService || new SessionService(this.#config.session);
    this.#cacheService = cacheService || new CacheService(this.#config.cache);
    this.#encryptionService = encryptionService || new EncryptionService(this.#config.encryption);
    
    // Initialize internal maps
    this.#sessionPolicies = new Map();
    this.#securityMetrics = new Map();
    this.#failedAttempts = new Map();

    // Initialize default security policies
    this.#initializeDefaultPolicies();

    // Start cleanup intervals
    this.#startCleanupIntervals();

    logger.info('SessionManager initialized', {
      environment: config.get('environment'),
      sessionTimeout: this.#config.session.sessionDuration,
      csrfEnabled: this.#config.csrf.enabled,
      rateLimitEnabled: this.#config.rateLimit.enabled
    });
  }

  /**
   * @private
   * Builds configuration from platform config and custom overrides
   */
  #buildConfiguration(customConfig) {
    const platformConfig = {
      session: {
        sessionDuration: parseInt(config.get('session.maxAge', '86400000')),
        absoluteTimeout: parseInt(config.get('session.absoluteTimeout', '604800000')),
        slidingExpiration: config.get('session.rolling', true),
        secure: config.get('session.secure', false),
        httpOnly: config.get('session.httpOnly', true),
        sameSite: config.get('session.sameSite', 'strict'),
        sessionSecret: config.get('session.secret'),
        sessionName: config.get('session.name', 'insightserenity.sid'),
        maxConcurrentSessions: parseInt(config.get('session.maxConcurrent', '5')),
        inactivityTimeout: parseInt(config.get('session.inactivityTimeout', '3600000'))
      },
      csrf: {
        enabled: config.get('security.csrf.enabled', true),
        tokenLength: parseInt(config.get('security.csrf.tokenLength', '32')),
        headerName: config.get('security.csrf.headerName', 'X-CSRF-Token'),
        cookieName: config.get('security.csrf.cookieName', '_csrf')
      },
      encryption: {
        algorithm: config.get('encryption.algorithm', 'aes-256-gcm'),
        key: config.get('encryption.key'),
        pbkdf2Iterations: parseInt(config.get('encryption.pbkdf2Iterations', '100000')),
        pbkdf2KeyLength: parseInt(config.get('encryption.pbkdf2KeyLength', '32')),
        pbkdf2Digest: config.get('encryption.pbkdf2Digest', 'sha512')
      },
      jwt: {
        secret: config.get('jwt.secret'),
        expiresIn: config.get('jwt.expiresIn', '24h'),
        refreshExpiresIn: config.get('jwt.refreshExpiresIn', '7d'),
        issuer: config.get('jwt.issuer', 'insightserenity-platform'),
        audience: config.get('jwt.audience', 'insightserenity-users'),
        algorithm: config.get('jwt.algorithm', 'HS256')
      },
      cache: {
        enabled: config.get('redis.enabled', true),
        prefix: config.get('redis.sessionPrefix', 'sess:'),
        ttl: parseInt(config.get('redis.sessionTTL', '86400'))
      },
      rateLimit: {
        enabled: config.get('admin.rateLimit.enabled', true),
        windowMs: parseInt(config.get('admin.rateLimit.window', '900000')),
        max: parseInt(config.get('admin.rateLimit.max', '1000')),
        loginWindow: parseInt(config.get('admin.loginRate.window', '900000')),
        loginMax: parseInt(config.get('admin.loginRate.max', '5'))
      },
      security: {
        requireSecureConnection: config.get('environment') === 'production',
        enableSessionFingerprinting: config.get('security.sessionFingerprinting', true),
        enableIpValidation: config.get('security.ipValidation', true),
        maxFailedAttempts: parseInt(config.get('security.maxFailedAttempts', '5')),
        lockoutDuration: parseInt(config.get('security.lockoutDuration', '900000')),
        trustedProxies: config.get('admin.trustedProxies', ['127.0.0.1']),
        behindProxy: config.get('admin.behindProxy', false)
      }
    };

    // Merge with custom config
    return this.#deepMerge(platformConfig, customConfig);
  }

  /**
   * Creates a new secure session with enhanced security features
   * @param {Object} sessionData - Session data
   * @param {Object} securityContext - Security context
   * @returns {Promise<Object>} Created session with security tokens
   * @throws {AppError} If session creation fails
   */
  async createSecureSession(sessionData, securityContext) {
    const correlationId = securityContext.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Creating secure session', { 
        correlationId, 
        userId: sessionData.userId,
        organizationId: sessionData.organizationId 
      });

      // Validate security context
      await this.#validateSecurityContext(securityContext);

      // Check for account lockout
      if (await this.#isAccountLocked(sessionData.userId)) {
        throw new AppError(
          'Account is locked due to multiple failed attempts',
          423,
          ERROR_CODES.ACCOUNT_LOCKED,
          { correlationId }
        );
      }

      // Apply security policies
      const enrichedData = await this.#applySecurityPolicies(sessionData, securityContext);

      // Generate security tokens
      const csrfToken = this.#config.csrf.enabled ? await this.#generateCSRFToken() : null;
      const sessionFingerprint = await this.#generateSessionFingerprint(securityContext);

      // Add security metadata
      enrichedData.securityMetadata = {
        fingerprint: sessionFingerprint,
        createdWithMFA: sessionData.mfaVerified || false,
        securityLevel: this.#determineSecurityLevel(securityContext)
      };

      // Create session through service
      const session = await this.#sessionService.createSession(enrichedData);

      // Store security associations
      await this.#storeSecurityAssociations(session._id, {
        csrfToken,
        fingerprint: sessionFingerprint,
        ipAddress: securityContext.ipAddress,
        userAgent: securityContext.userAgent
      });

      // Clear failed attempts on successful login
      await this.#clearFailedAttempts(sessionData.userId);

      // Track security metrics
      this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.CREATED, {
        userId: sessionData.userId,
        securityLevel: enrichedData.securityMetadata.securityLevel
      });

      // Build response
      const response = {
        sessionId: session._id,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        cookieOptions: this.#generateCookieOptions()
      };

      if (csrfToken) {
        response.csrfToken = csrfToken;
      }

      logger.info('Secure session created successfully', {
        correlationId,
        sessionId: session._id,
        userId: sessionData.userId
      });

      return response;

    } catch (error) {
      logger.error('Secure session creation failed', {
        correlationId,
        error: error.message,
        userId: sessionData.userId
      });

      // Track failed attempt
      await this.#recordFailedAttempt(sessionData.userId);

      this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.SUSPICIOUS, {
        reason: 'session_creation_failed',
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to create secure session',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId }
      );
    }
  }

  /**
   * Validates a session with comprehensive security checks
   * @param {string} sessionId - Session ID
   * @param {Object} context - Validation context
   * @returns {Promise<Object>} Validation result
   * @throws {AppError} If validation fails
   */
  async validateSecureSession(sessionId, context) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Validating secure session', { correlationId, sessionId });

      // Check session lockout status
      if (await this.#isSessionLocked(sessionId)) {
        this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.LOCKED, { sessionId });
        return { 
          valid: false, 
          reason: 'Session is locked',
          code: ERROR_CODES.SESSION_LOCKED 
        };
      }

      // Retrieve security associations
      const securityData = await this.#getSecurityAssociations(sessionId);

      // Validate CSRF token if enabled
      if (this.#config.csrf.enabled && !context.skipCSRF) {
        const csrfValid = await this.#validateCSRFToken(sessionId, context.csrfToken, securityData);
        if (!csrfValid) {
          this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.CSRF_FAILED, { sessionId });
          return { 
            valid: false, 
            reason: 'CSRF token validation failed',
            code: ERROR_CODES.CSRF_VALIDATION_FAILED 
          };
        }
      }

      // Validate session fingerprint
      if (this.#config.security.enableSessionFingerprinting && securityData.fingerprint) {
        const fingerprintValid = await this.#validateFingerprint(context, securityData.fingerprint);
        if (!fingerprintValid) {
          await this.#handleSuspiciousActivity(sessionId, 'Fingerprint mismatch');
          return { 
            valid: false, 
            reason: 'Session fingerprint mismatch',
            code: ERROR_CODES.SESSION_FINGERPRINT_MISMATCH 
          };
        }
      }

      // Validate IP address if enabled
      if (this.#config.security.enableIpValidation) {
        const ipValid = await this.#validateIPAddress(context.ipAddress, securityData.ipAddress);
        if (!ipValid) {
          const severity = await this.#assessIPChangeSeverity(sessionId, context.ipAddress, securityData.ipAddress);
          if (severity === 'high') {
            await this.#handleSuspiciousActivity(sessionId, 'Suspicious IP change detected');
            return { 
              valid: false, 
              reason: 'Suspicious IP change detected',
              code: ERROR_CODES.SUSPICIOUS_IP_CHANGE 
            };
          }
        }
      }

      // Perform session validation through service
      const result = await this.#sessionService.validateSession(sessionId, context);

      if (result.valid) {
        this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.VALIDATED, { sessionId });
      } else {
        await this.#handleFailedValidation(sessionId, result.reason);
      }

      return result;

    } catch (error) {
      logger.error('Secure session validation failed', {
        correlationId,
        sessionId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Session validation failed',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId }
      );
    }
  }

  /**
   * Express middleware for session authentication
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  authenticate(options = {}) {
    const middlewareConfig = { ...this.#config, ...options };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      req.correlationId = correlationId;

      try {
        // Extract session ID from request
        const sessionId = this.#extractSessionId(req, middlewareConfig);

        if (!sessionId) {
          throw new AppError(
            'No session found',
            401,
            ERROR_CODES.UNAUTHORIZED,
            { correlationId }
          );
        }

        // Build validation context
        const context = {
          correlationId,
          ipAddress: this.#getClientIp(req),
          userAgent: req.headers['user-agent'],
          csrfToken: this.#extractCSRFToken(req, middlewareConfig),
          fingerprint: req.headers['x-session-fingerprint'],
          skipCSRF: options.skipCSRF || req.method === 'GET'
        };

        // Validate session
        const result = await this.validateSecureSession(sessionId, context);

        if (!result.valid) {
          throw new AppError(
            result.reason || 'Invalid session',
            401,
            result.code || ERROR_CODES.UNAUTHORIZED,
            { correlationId }
          );
        }

        // Attach session data to request
        req.session = result.session;
        req.sessionId = sessionId;
        req.userId = result.session.userId;
        req.organizationId = result.session.organizationId;
        req.tenantId = result.session.tenantId;

        // Add security headers
        this.#addSecurityHeaders(res);

        next();

      } catch (error) {
        logger.error('Session authentication failed', {
          correlationId,
          error: error.message,
          path: req.path
        });

        // Clear any invalid session cookies
        if (error.code === ERROR_CODES.UNAUTHORIZED || error.code === ERROR_CODES.SESSION_EXPIRED) {
          res.clearCookie(this.#config.session.sessionName, this.#generateCookieOptions());
        }

        if (error instanceof AppError) {
          return res.status(error.statusCode).json({
            success: false,
            error: {
              code: error.code,
              message: error.message,
              correlationId
            }
          });
        }

        res.status(500).json({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Authentication failed',
            correlationId
          }
        });
      }
    };
  }

  /**
   * Refreshes session tokens
   * @param {string} refreshToken - Refresh token
   * @param {Object} context - Security context
   * @returns {Promise<Object>} New session tokens
   * @throws {AppError} If refresh fails
   */
  async refreshSession(refreshToken, context) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Refreshing session', { correlationId });

      // Get session by refresh token
      const session = await this.#sessionService.getSessionByRefreshToken(refreshToken);
      
      if (!session) {
        throw new AppError(
          'Invalid refresh token',
          401,
          ERROR_CODES.INVALID_REFRESH_TOKEN,
          { correlationId }
        );
      }

      // Validate session context
      const validationResult = await this.validateSecureSession(session._id, context);
      
      if (!validationResult.valid) {
        throw new AppError(
          validationResult.reason,
          401,
          validationResult.code,
          { correlationId }
        );
      }

      // Generate new tokens
      const newTokens = await this.#generateNewTokens(session.userId, session.organizationId);

      // Update session with new tokens
      await this.#sessionService.updateSessionTokens(session._id, newTokens);

      // Generate new CSRF token if enabled
      const csrfToken = this.#config.csrf.enabled ? await this.#generateCSRFToken() : null;
      
      if (csrfToken) {
        await this.#updateCSRFToken(session._id, csrfToken);
      }

      // Track refresh event
      this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.REFRESHED, { 
        sessionId: session._id,
        userId: session.userId 
      });

      const response = {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresIn: this.#config.jwt.expiresIn
      };

      if (csrfToken) {
        response.csrfToken = csrfToken;
      }

      return response;

    } catch (error) {
      logger.error('Session refresh failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to refresh session',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId }
      );
    }
  }

  /**
   * Terminates a session
   * @param {string} sessionId - Session ID
   * @param {string} [reason='User logout'] - Termination reason
   * @returns {Promise<void>}
   */
  async terminateSession(sessionId, reason = 'User logout') {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Terminating session', { correlationId, sessionId, reason });

      // Clear security associations
      await this.#clearSecurityAssociations(sessionId);

      // Terminate through service
      await this.#sessionService.terminateSession(sessionId, reason);

      // Track termination
      this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.TERMINATED, { 
        sessionId,
        reason 
      });

    } catch (error) {
      logger.error('Session termination failed', {
        correlationId,
        sessionId,
        error: error.message
      });

      throw new AppError(
        'Failed to terminate session',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId }
      );
    }
  }

  /**
   * Terminates all sessions for a user
   * @param {string} userId - User ID
   * @param {string} [reason='Security'] - Termination reason
   * @returns {Promise<number>} Number of terminated sessions
   */
  async terminateAllUserSessions(userId, reason = 'Security') {
    try {
      const count = await this.#sessionService.terminateAllUserSessions(userId, reason);
      
      // Clear all security associations for user
      await this.#clearUserSecurityAssociations(userId);
      
      logger.info('All user sessions terminated', { userId, count, reason });
      
      return count;
    } catch (error) {
      logger.error('Failed to terminate user sessions', { 
        userId, 
        error: error.message 
      });
      
      throw error;
    }
  }

  /**
   * @private
   * Validates security context
   */
  async #validateSecurityContext(context) {
    const errors = [];

    if (!context.ipAddress) {
      errors.push('IP address is required');
    }

    if (!context.userAgent) {
      errors.push('User agent is required');
    }

    if (this.#config.security.requireSecureConnection && !context.secure) {
      errors.push('Secure connection required');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid security context',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Applies security policies to session data
   */
  async #applySecurityPolicies(sessionData, securityContext) {
    const enrichedData = { ...sessionData };

    // Apply organization-specific policies
    if (sessionData.organizationId) {
      const orgPolicies = await this.#getOrganizationPolicies(sessionData.organizationId);
      enrichedData.policies = orgPolicies;
    }

    // Apply user role-based policies
    if (sessionData.userRole) {
      const rolePolicies = this.#getRolePolicies(sessionData.userRole);
      enrichedData.policies = { ...enrichedData.policies, ...rolePolicies };
    }

    // Apply security context
    enrichedData.securityContext = {
      ipAddress: securityContext.ipAddress,
      userAgent: securityContext.userAgent,
      deviceId: securityContext.deviceId,
      location: securityContext.location
    };

    return enrichedData;
  }

  /**
   * @private
   * Generates CSRF token
   */
  async #generateCSRFToken() {
    const tokenBytes = await this.#encryptionService.generateRandomBytes(this.#config.csrf.tokenLength);
    return tokenBytes.toString('base64url');
  }

  /**
   * @private
   * Validates CSRF token
   */
  async #validateCSRFToken(sessionId, providedToken, securityData) {
    if (!providedToken || !securityData.csrfToken) {
      return false;
    }

    return this.#encryptionService.compareHashSync(providedToken, securityData.csrfToken);
  }

  /**
   * @private
   * Generates session fingerprint
   */
  async #generateSessionFingerprint(context) {
    const components = [
      context.userAgent || '',
      context.acceptLanguage || '',
      context.acceptEncoding || '',
      context.colorDepth || '',
      context.screenResolution || '',
      context.timezone || ''
    ].filter(Boolean);

    return this.#encryptionService.hashDataSync(components.join('|'));
  }

  /**
   * @private
   * Validates fingerprint
   */
  async #validateFingerprint(context, storedFingerprint) {
    const currentFingerprint = await this.#generateSessionFingerprint(context);
    return currentFingerprint === storedFingerprint;
  }

  /**
   * @private
   * Validates IP address
   */
  async #validateIPAddress(currentIP, storedIP) {
    // Allow same IP or private/local IPs in development
    if (currentIP === storedIP) return true;
    
    if (config.get('environment') === 'development') {
      const privateIPs = ['127.0.0.1', '::1', 'localhost'];
      return privateIPs.includes(currentIP) || privateIPs.includes(storedIP);
    }
    
    return false;
  }

  /**
   * @private
   * Assesses IP change severity
   */
  async #assessIPChangeSeverity(sessionId, newIP, oldIP) {
    // In production, implement geo-location checking
    // For now, return medium severity for any IP change
    logger.warn('IP address changed for session', { sessionId, oldIP, newIP });
    return 'medium';
  }

  /**
   * @private
   * Handles suspicious activity
   */
  async #handleSuspiciousActivity(sessionId, activity) {
    logger.warn('Suspicious activity detected', { sessionId, activity });
    
    this.#trackSecurityEvent(SessionManager.#SESSION_EVENTS.SUSPICIOUS, {
      sessionId,
      activity
    });

    // Increment suspicious activity counter
    const suspiciousCount = await this.#incrementSuspiciousActivity(sessionId);
    
    // Lock session if threshold exceeded
    if (suspiciousCount >= this.#config.security.maxFailedAttempts) {
      await this.#lockSession(sessionId);
    }
  }

  /**
   * @private
   * Handles failed validation
   */
  async #handleFailedValidation(sessionId, reason) {
    logger.warn('Session validation failed', { sessionId, reason });
    
    // Track failed validation
    this.#trackSecurityEvent('validation_failed', { sessionId, reason });
  }

  /**
   * @private
   * Checks if account is locked
   */
  async #isAccountLocked(userId) {
    const lockKey = `account_lock:${userId}`;
    return await this.#cacheService.exists(lockKey);
  }

  /**
   * @private
   * Checks if session is locked
   */
  async #isSessionLocked(sessionId) {
    const lockKey = `session_lock:${sessionId}`;
    return await this.#cacheService.exists(lockKey);
  }

  /**
   * @private
   * Locks a session
   */
  async #lockSession(sessionId) {
    const lockKey = `session_lock:${sessionId}`;
    const lockDuration = Math.floor(this.#config.security.lockoutDuration / 1000);
    await this.#cacheService.set(lockKey, true, lockDuration);
  }

  /**
   * @private
   * Records failed attempt
   */
  async #recordFailedAttempt(userId) {
    const attemptKey = `failed_attempts:${userId}`;
    const attempts = await this.#cacheService.increment(attemptKey);
    
    if (attempts === 1) {
      // Set expiry on first attempt
      await this.#cacheService.expire(attemptKey, 3600); // 1 hour
    }
    
    if (attempts >= this.#config.security.maxFailedAttempts) {
      // Lock account
      const lockKey = `account_lock:${userId}`;
      const lockDuration = Math.floor(this.#config.security.lockoutDuration / 1000);
      await this.#cacheService.set(lockKey, true, lockDuration);
    }
    
    return attempts;
  }

  /**
   * @private
   * Clears failed attempts
   */
  async #clearFailedAttempts(userId) {
    const attemptKey = `failed_attempts:${userId}`;
    await this.#cacheService.delete(attemptKey);
  }

  /**
   * @private
   * Increments suspicious activity counter
   */
  async #incrementSuspiciousActivity(sessionId) {
    const key = `suspicious:${sessionId}`;
    return await this.#cacheService.increment(key);
  }

  /**
   * @private
   * Stores security associations
   */
  async #storeSecurityAssociations(sessionId, data) {
    const key = `session_security:${sessionId}`;
    const ttl = Math.floor(this.#config.session.sessionDuration / 1000);
    
    await this.#cacheService.set(key, data, ttl);
  }

  /**
   * @private
   * Gets security associations
   */
  async #getSecurityAssociations(sessionId) {
    const key = `session_security:${sessionId}`;
    return await this.#cacheService.get(key) || {};
  }

  /**
   * @private
   * Clears security associations
   */
  async #clearSecurityAssociations(sessionId) {
    const key = `session_security:${sessionId}`;
    await this.#cacheService.delete(key);
  }

  /**
   * @private
   * Clears user security associations
   */
  async #clearUserSecurityAssociations(userId) {
    // This would need to track all sessions per user
    // For now, rely on session service to handle this
    logger.debug('Clearing user security associations', { userId });
  }

  /**
   * @private
   * Updates CSRF token
   */
  async #updateCSRFToken(sessionId, csrfToken) {
    const securityData = await this.#getSecurityAssociations(sessionId);
    securityData.csrfToken = await this.#encryptionService.hashDataSync(csrfToken);
    await this.#storeSecurityAssociations(sessionId, securityData);
  }

  /**
   * @private
   * Generates new tokens
   */
  async #generateNewTokens(userId, organizationId) {
    // This would integrate with your JWT service
    // For now, return placeholder
    return {
      accessToken: `new_access_token_${Date.now()}`,
      refreshToken: `new_refresh_token_${Date.now()}`
    };
  }

  /**
   * @private
   * Determines security level based on context
   */
  #determineSecurityLevel(context) {
    if (context.mfaVerified) return SessionManager.#SECURITY_LEVELS.HIGH;
    if (context.trustedDevice) return SessionManager.#SECURITY_LEVELS.MEDIUM;
    return SessionManager.#SECURITY_LEVELS.LOW;
  }

  /**
   * @private
   * Gets organization policies
   */
  async #getOrganizationPolicies(organizationId) {
    // This would fetch from database or cache
    // For now, return default policies
    return {
      sessionTimeout: this.#config.session.sessionDuration,
      requireMFA: false,
      allowedIPs: [],
      allowedDomains: []
    };
  }

  /**
   * @private
   * Gets role-based policies
   */
  #getRolePolicies(role) {
    const policies = {
      admin: {
        sessionTimeout: 3600000, // 1 hour
        requireMFA: true,
        requireSecureConnection: true
      },
      user: {
        sessionTimeout: 86400000, // 24 hours
        requireMFA: false,
        requireSecureConnection: false
      }
    };

    return policies[role] || policies.user;
  }

  /**
   * @private
   * Initializes default security policies
   */
  #initializeDefaultPolicies() {
    // Default policies for different scenarios
    this.#sessionPolicies.set('high-security', {
      requireMFA: true,
      sessionTimeout: 1800000, // 30 minutes
      absoluteTimeout: 3600000, // 1 hour
      requireSecureConnection: true,
      maxConcurrentSessions: 1
    });

    this.#sessionPolicies.set('standard', {
      requireMFA: false,
      sessionTimeout: 86400000, // 24 hours
      absoluteTimeout: 604800000, // 7 days
      requireSecureConnection: true,
      maxConcurrentSessions: 5
    });

    this.#sessionPolicies.set('relaxed', {
      requireMFA: false,
      sessionTimeout: 604800000, // 7 days
      absoluteTimeout: 2592000000, // 30 days
      requireSecureConnection: false,
      maxConcurrentSessions: 10
    });
  }

  /**
   * @private
   * Extracts session ID from request
   */
  #extractSessionId(req, config) {
    // Check cookie first
    if (req.cookies && req.cookies[config.session.sessionName]) {
      return req.cookies[config.session.sessionName];
    }

    // Check authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check custom header
    if (req.headers['x-session-id']) {
      return req.headers['x-session-id'];
    }

    return null;
  }

  /**
   * @private
   * Extracts CSRF token from request
   */
  #extractCSRFToken(req, config) {
    // Check header first
    const headerName = config.csrf.headerName.toLowerCase();
    if (req.headers[headerName]) {
      return req.headers[headerName];
    }

    // Check body
    if (req.body && req.body._csrf) {
      return req.body._csrf;
    }

    // Check query
    if (req.query && req.query._csrf) {
      return req.query._csrf;
    }

    return null;
  }

  /**
   * @private
   * Gets client IP address
   */
  #getClientIp(req) {
    if (this.#config.security.behindProxy) {
      // Check various headers when behind proxy
      const forwardedFor = req.headers['x-forwarded-for'];
      if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
      }

      if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'];
      }

      if (req.headers['x-client-ip']) {
        return req.headers['x-client-ip'];
      }
    }

    return req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
  }

  /**
   * @private
   * Generates cookie options
   */
  #generateCookieOptions() {
    return {
      httpOnly: this.#config.session.httpOnly,
      secure: this.#config.session.secure,
      sameSite: this.#config.session.sameSite,
      maxAge: this.#config.session.sessionDuration,
      path: '/'
    };
  }

  /**
   * @private
   * Adds security headers to response
   */
  #addSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    if (this.#config.session.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  }

  /**
   * @private
   * Tracks security events
   */
  #trackSecurityEvent(event, data = {}) {
    const current = this.#securityMetrics.get(event) || 0;
    this.#securityMetrics.set(event, current + 1);

    logger.info('Security event', {
      event,
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * @private
   * Starts cleanup intervals
   */
  #startCleanupIntervals() {
    // Clean up expired locks every hour
    setInterval(() => {
      this.#cleanupExpiredLocks();
    }, 3600000);

    // Clean up metrics every day
    setInterval(() => {
      this.#resetMetrics();
    }, 86400000);
  }

  /**
   * @private
   * Cleans up expired locks
   */
  async #cleanupExpiredLocks() {
    try {
      logger.debug('Running security cleanup');
      // Implementation would depend on your cache service capabilities
    } catch (error) {
      logger.error('Security cleanup failed', { error: error.message });
    }
  }

  /**
   * @private
   * Resets metrics
   */
  #resetMetrics() {
    const summary = {};
    this.#securityMetrics.forEach((value, key) => {
      summary[key] = value;
    });

    logger.info('Daily security metrics', summary);
    this.#securityMetrics.clear();
  }

  /**
   * @private
   * Deep merge utility
   */
  #deepMerge(target, source) {
    const output = { ...target };
    
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.#deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;

    function isObject(obj) {
      return obj && typeof obj === 'object' && !Array.isArray(obj);
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets session manager metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    const metrics = {
      securityEvents: {},
      activePolicies: this.#sessionPolicies.size
    };

    this.#securityMetrics.forEach((value, key) => {
      metrics.securityEvents[key] = value;
    });

    return metrics;
  }

  /**
   * Gets health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const sessionHealth = await this.#sessionService.getHealthStatus();
      const cacheHealth = await this.#cacheService.ping();

      return {
        healthy: sessionHealth.healthy && cacheHealth,
        service: 'SessionManager',
        dependencies: {
          sessionService: sessionHealth.healthy,
          cacheService: cacheHealth
        },
        metrics: this.getMetrics()
      };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'SessionManager',
        error: error.message
      };
    }
  }
}

// Export singleton instance by default
let defaultInstance = null;

/**
 * Gets the default SessionManager instance
 * @param {Object} [config] - Configuration options
 * @returns {SessionManager} SessionManager instance
 */
function getSessionManager(config) {
  if (!defaultInstance) {
    defaultInstance = new SessionManager(config);
  }
  return defaultInstance;
}

// Export both the class and helper function
module.exports = SessionManager;
module.exports.getSessionManager = getSessionManager;