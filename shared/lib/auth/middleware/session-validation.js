'use strict';

/**
 * @fileoverview Session validation middleware for integrity and security checks
 * @module shared/lib/auth/middleware/session-validation
 * @requires module:shared/lib/auth/services/session-service
 * @requires module:shared/lib/auth/services/token-service
 * @requires module:shared/lib/auth/services/blacklist-service
 * @requires module:shared/lib/database/models/session-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:crypto
 */

const crypto = require('crypto');
const SessionService = require('../services/session-service');
const TokenService = require('../services/token-service');
const BlacklistService = require('../services/blacklist-service');
const SessionModel = require('../../database/models/session-model');
const UserModel = require('../../database/models/users/user-model');
const AuditLogModel = require('../../database/models/security/audit-log-model');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const AuditService = require('../../security/audit/audit-service');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class SessionValidationMiddleware
 * @description Comprehensive session validation with security checks and monitoring
 */
class SessionValidationMiddleware {
  /**
   * @private
   * @type {SessionService}
   */
  #sessionService;

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
   * @type {EncryptionService}
   */
  #encryptionService;

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
  #sessionMetrics;

  /**
   * @private
   * @type {Map}
   */
  #suspiciousPatterns;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    session: {
      timeout: 1800000, // 30 minutes
      absoluteTimeout: 86400000, // 24 hours
      slidingExpiration: true,
      requireSecureCookie: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      httpOnly: true,
      domain: null,
      path: '/'
    },
    validation: {
      checkIP: true,
      checkUserAgent: true,
      checkFingerprint: true,
      checkGeolocation: false,
      checkDeviceId: true,
      strictMode: false,
      allowIPChange: false,
      allowUserAgentChange: false
    },
    security: {
      detectSessionHijacking: true,
      detectSessionFixation: true,
      detectReplayAttacks: true,
      enforceCSRF: true,
      rotateSessionId: true,
      rotationInterval: 3600000, // 1 hour
      maxConcurrentSessions: 5,
      blockSuspiciousSessions: true
    },
    monitoring: {
      trackSessionMetrics: true,
      trackAnomalies: true,
      alertOnSuspiciousActivity: true,
      anomalyThreshold: 3,
      metricsInterval: 60000 // 1 minute
    },
    cache: {
      sessionCacheTTL: 300, // 5 minutes
      validationCacheTTL: 60 // 1 minute
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #VALIDATION_TYPES = {
    EXISTENCE: 'existence',
    EXPIRY: 'expiry',
    INTEGRITY: 'integrity',
    SECURITY: 'security',
    CONCURRENCY: 'concurrency',
    ANOMALY: 'anomaly'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #ANOMALY_TYPES = {
    IP_CHANGE: 'ip_change',
    USER_AGENT_CHANGE: 'user_agent_change',
    GEOLOCATION_JUMP: 'geolocation_jump',
    RAPID_REQUESTS: 'rapid_requests',
    SUSPICIOUS_PATTERN: 'suspicious_pattern',
    CONCURRENT_LOGIN: 'concurrent_login'
  };

  /**
   * Creates session validation middleware instance
   * @param {Object} [config] - Middleware configuration
   * @param {SessionService} [sessionService] - Session service instance
   * @param {TokenService} [tokenService] - Token service instance
   * @param {BlacklistService} [blacklistService] - Blacklist service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    sessionService,
    tokenService,
    blacklistService,
    cacheService,
    encryptionService,
    auditService
  ) {
    this.#config = this.#mergeConfig(config);
    this.#sessionService = sessionService || new SessionService();
    this.#tokenService = tokenService || new TokenService();
    this.#blacklistService = blacklistService || new BlacklistService();
    this.#cacheService = cacheService || new CacheService();
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#auditService = auditService || new AuditService();
    this.#sessionMetrics = new Map();
    this.#suspiciousPatterns = new Map();

    // Start monitoring if enabled
    if (this.#config.monitoring.trackSessionMetrics) {
      this.#startMetricsCollection();
    }

    logger.info('SessionValidationMiddleware initialized', {
      slidingExpiration: this.#config.session.slidingExpiration,
      strictMode: this.#config.validation.strictMode,
      securityChecks: Object.entries(this.#config.security)
        .filter(([_, enabled]) => enabled === true)
        .map(([check]) => check)
    });
  }

  /**
   * Validates session with comprehensive checks
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateSession(options = {}) {
    const config = { ...this.#config, ...options };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Extract session identifier
        const sessionId = this.#extractSessionId(req, config);
        if (!sessionId) {
          throw new AppError(
            'No session found',
            401,
            ERROR_CODES.MISSING_SESSION,
            { correlationId }
          );
        }

        // Get session from cache or database
        const session = await this.#getSession(sessionId, config);
        if (!session) {
          throw new AppError(
            'Invalid session',
            401,
            ERROR_CODES.INVALID_SESSION,
            { correlationId }
          );
        }

        // Perform validation checks
        const validationResults = await this.#performValidationChecks(
          req,
          session,
          config,
          correlationId
        );

        if (!validationResults.valid) {
          await this.#handleInvalidSession(
            req,
            session,
            validationResults,
            correlationId
          );

          throw new AppError(
            validationResults.message || 'Session validation failed',
            401,
            ERROR_CODES.SESSION_INVALID,
            {
              correlationId,
              reason: validationResults.reason,
              checks: validationResults.checks
            }
          );
        }

        // Detect anomalies
        if (config.monitoring.trackAnomalies) {
          const anomalies = await this.#detectAnomalies(req, session, config);
          if (anomalies.length > 0) {
            await this.#handleAnomalies(req, session, anomalies, correlationId);
          }
        }

        // Update session if sliding expiration
        if (config.session.slidingExpiration) {
          await this.#updateSessionExpiry(session, config);
        }

        // Rotate session ID if needed
        if (config.security.rotateSessionId) {
          await this.#checkAndRotateSessionId(req, res, session, config);
        }

        // Enhance request with session data
        req.session = {
          id: session._id,
          userId: session.userId,
          data: session.data,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt
        };

        // Get associated user
        const user = await this.#getSessionUser(session.userId, session.organizationId);
        if (user) {
          req.auth = {
            user: this.#sanitizeUser(user),
            session,
            strategy: 'session',
            correlationId
          };
        }

        // Track metrics
        this.#trackSessionMetric('validated', Date.now() - startTime);

        logger.debug('Session validation successful', {
          correlationId,
          sessionId: session._id,
          userId: session.userId,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;
        
        this.#trackSessionMetric('failed', duration);

        logger.error('Session validation failed', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Session validation error',
          500,
          ERROR_CODES.SESSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Validates CSRF token
   * @param {Object} [options] - CSRF options
   * @returns {Function} Express middleware function
   */
  validateCSRF(options = {}) {
    const config = {
      tokenLocation: {
        header: 'x-csrf-token',
        body: '_csrf',
        query: '_csrf'
      },
      skipMethods: ['GET', 'HEAD', 'OPTIONS'],
      ...options
    };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Skip for safe methods
        if (config.skipMethods.includes(req.method)) {
          return next();
        }

        // Get session
        if (!req.session?.id) {
          throw new AppError(
            'Session required for CSRF validation',
            401,
            ERROR_CODES.MISSING_SESSION,
            { correlationId }
          );
        }

        // Extract CSRF token
        const token = this.#extractCSRFToken(req, config);
        if (!token) {
          throw new AppError(
            'Missing CSRF token',
            403,
            ERROR_CODES.CSRF_TOKEN_MISSING,
            { correlationId }
          );
        }

        // Validate token
        const isValid = await this.#validateCSRFToken(
          req.session.id,
          token,
          correlationId
        );

        if (!isValid) {
          throw new AppError(
            'Invalid CSRF token',
            403,
            ERROR_CODES.CSRF_TOKEN_INVALID,
            { correlationId }
          );
        }

        logger.debug('CSRF validation successful', {
          correlationId,
          sessionId: req.session.id
        });

        next();

      } catch (error) {
        logger.error('CSRF validation failed', {
          correlationId,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'CSRF validation error',
          500,
          ERROR_CODES.CSRF_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Enforces session concurrency limits
   * @param {Object} [options] - Concurrency options
   * @returns {Function} Express middleware function
   */
  enforceConcurrency(options = {}) {
    const config = {
      maxSessions: this.#config.security.maxConcurrentSessions,
      strategy: 'terminate-oldest', // 'terminate-oldest', 'terminate-all', 'block-new'
      ...options
    };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          return next();
        }

        const userId = req.auth.user._id;
        const currentSessionId = req.session?.id;

        // Get active sessions
        const activeSessions = await this.#sessionService.getActiveUserSessions(userId);
        
        if (activeSessions.length > config.maxSessions) {
          await this.#handleConcurrencyViolation(
            userId,
            currentSessionId,
            activeSessions,
            config,
            correlationId
          );

          if (config.strategy === 'block-new' && !currentSessionId) {
            throw new AppError(
              `Maximum concurrent sessions (${config.maxSessions}) reached`,
              403,
              ERROR_CODES.MAX_SESSIONS_REACHED,
              {
                correlationId,
                maxSessions: config.maxSessions,
                activeSessions: activeSessions.length
              }
            );
          }
        }

        logger.debug('Session concurrency check passed', {
          correlationId,
          userId,
          activeSessions: activeSessions.length,
          maxSessions: config.maxSessions
        });

        next();

      } catch (error) {
        logger.error('Session concurrency check failed', {
          correlationId,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'Session concurrency error',
          500,
          ERROR_CODES.SESSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Validates session fingerprint
   * @param {Object} [options] - Fingerprint options
   * @returns {Function} Express middleware function
   */
  validateFingerprint(options = {}) {
    const config = {
      components: ['userAgent', 'acceptLanguage', 'acceptEncoding', 'plugins'],
      hashAlgorithm: 'sha256',
      strict: false,
      ...options
    };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Ensure session exists
        if (!req.session?.id) {
          return next();
        }

        // Get session
        const session = await this.#getSession(req.session.id, config);
        if (!session) {
          return next();
        }

        // Generate current fingerprint
        const currentFingerprint = this.#generateFingerprint(req, config);

        // Compare fingerprints
        if (session.fingerprint && session.fingerprint !== currentFingerprint) {
          const anomaly = {
            type: SessionValidationMiddleware.#ANOMALY_TYPES.SUSPICIOUS_PATTERN,
            severity: config.strict ? 'high' : 'medium',
            details: {
              expected: session.fingerprint,
              actual: currentFingerprint
            }
          };

          await this.#handleAnomalies(req, session, [anomaly], correlationId);

          if (config.strict) {
            throw new AppError(
              'Session fingerprint mismatch',
              401,
              ERROR_CODES.SESSION_INVALID,
              { correlationId }
            );
          }
        }

        // Update fingerprint if new session
        if (!session.fingerprint) {
          await this.#updateSessionFingerprint(session._id, currentFingerprint);
        }

        logger.debug('Session fingerprint validation successful', {
          correlationId,
          sessionId: session._id
        });

        next();

      } catch (error) {
        logger.error('Session fingerprint validation failed', {
          correlationId,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'Fingerprint validation error',
          500,
          ERROR_CODES.SESSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Session activity tracker
   * @param {Object} [options] - Tracking options
   * @returns {Function} Express middleware function
   */
  trackActivity(options = {}) {
    const config = {
      trackPageViews: true,
      trackAPIRequests: true,
      trackDuration: true,
      updateInterval: 60000, // 1 minute
      ...options
    };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure session exists
        if (!req.session?.id) {
          return next();
        }

        // Track request start
        const activityData = {
          timestamp: new Date(),
          method: req.method,
          path: req.path,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        };

        // Update session activity
        await this.#updateSessionActivity(req.session.id, activityData, config);

        // Track response time
        if (config.trackDuration) {
          res.on('finish', () => {
            const duration = Date.now() - startTime;
            this.#trackRequestDuration(req.session.id, duration);
          });
        }

        next();

      } catch (error) {
        logger.error('Session activity tracking failed', {
          correlationId,
          error: error.message
        });

        // Don't block request on tracking failure
        next();
      }
    };
  }

  /**
   * @private
   * Merges configuration
   */
  #mergeConfig(config) {
    const merged = JSON.parse(JSON.stringify(SessionValidationMiddleware.#DEFAULT_CONFIG));

    // Deep merge configuration
    Object.keys(config).forEach(key => {
      if (typeof config[key] === 'object' && !Array.isArray(config[key])) {
        merged[key] = { ...merged[key], ...config[key] };
      } else {
        merged[key] = config[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Extracts session ID from request
   */
  #extractSessionId(req, config) {
    // Check cookie
    const cookieName = config.session.cookieName || 'sessionId';
    if (req.cookies?.[cookieName]) {
      return req.cookies[cookieName];
    }

    // Check signed cookie
    if (req.signedCookies?.[cookieName]) {
      return req.signedCookies[cookieName];
    }

    // Check header
    if (req.headers['x-session-id']) {
      return req.headers['x-session-id'];
    }

    // Check authorization header (for token-based sessions)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Session ')) {
      return authHeader.substring(8);
    }

    return null;
  }

  /**
   * @private
   * Gets session with caching
   */
  async #getSession(sessionId, config) {
    const cacheKey = `session:${sessionId}`;

    // Check cache
    if (config.cache?.sessionCacheTTL) {
      const cached = await this.#cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get from service
    const session = await this.#sessionService.getSession(sessionId);
    
    if (session && config.cache?.sessionCacheTTL) {
      await this.#cacheService.set(cacheKey, session, config.cache.sessionCacheTTL);
    }

    return session;
  }

  /**
   * @private
   * Performs validation checks
   */
  async #performValidationChecks(req, session, config, correlationId) {
    const checks = {
      existence: { passed: true },
      expiry: { passed: true },
      integrity: { passed: true },
      security: { passed: true }
    };

    let valid = true;
    let reason = null;

    // Check existence
    if (!session || !session.isActive) {
      checks.existence.passed = false;
      valid = false;
      reason = 'Session does not exist or is inactive';
    }

    // Check expiry
    if (valid && new Date(session.expiresAt) < new Date()) {
      checks.expiry.passed = false;
      valid = false;
      reason = 'Session has expired';
    }

    // Check absolute timeout
    if (valid && config.session.absoluteTimeout) {
      const age = Date.now() - new Date(session.createdAt).getTime();
      if (age > config.session.absoluteTimeout) {
        checks.expiry.passed = false;
        valid = false;
        reason = 'Session absolute timeout exceeded';
      }
    }

    // Check integrity
    if (valid && config.validation.checkIP) {
      const currentIP = req.ip || req.connection.remoteAddress;
      if (session.ipAddress && session.ipAddress !== currentIP) {
        if (!config.validation.allowIPChange) {
          checks.integrity.passed = false;
          valid = false;
          reason = 'IP address mismatch';
        }
      }
    }

    if (valid && config.validation.checkUserAgent) {
      const currentUA = req.headers['user-agent'];
      if (session.userAgent && session.userAgent !== currentUA) {
        if (!config.validation.allowUserAgentChange) {
          checks.integrity.passed = false;
          valid = false;
          reason = 'User agent mismatch';
        }
      }
    }

    // Check security
    if (valid && config.security.detectReplayAttacks) {
      const isReplay = await this.#detectReplayAttack(session, req);
      if (isReplay) {
        checks.security.passed = false;
        valid = false;
        reason = 'Replay attack detected';
      }
    }

    return {
      valid,
      reason,
      checks,
      message: reason
    };
  }

  /**
   * @private
   * Detects anomalies in session
   */
  async #detectAnomalies(req, session, config) {
    const anomalies = [];

    // IP change detection
    if (config.validation.checkIP && session.ipAddress) {
      const currentIP = req.ip || req.connection.remoteAddress;
      if (currentIP !== session.ipAddress) {
        anomalies.push({
          type: SessionValidationMiddleware.#ANOMALY_TYPES.IP_CHANGE,
          severity: 'medium',
          details: {
            previous: session.ipAddress,
            current: currentIP
          }
        });
      }
    }

    // User agent change detection
    if (config.validation.checkUserAgent && session.userAgent) {
      const currentUA = req.headers['user-agent'];
      if (currentUA !== session.userAgent) {
        anomalies.push({
          type: SessionValidationMiddleware.#ANOMALY_TYPES.USER_AGENT_CHANGE,
          severity: 'low',
          details: {
            previous: session.userAgent,
            current: currentUA
          }
        });
      }
    }

    // Rapid request detection
    if (session.lastActivity) {
      const timeSinceLastActivity = Date.now() - new Date(session.lastActivity).getTime();
      if (timeSinceLastActivity < 100) { // Less than 100ms
        anomalies.push({
          type: SessionValidationMiddleware.#ANOMALY_TYPES.RAPID_REQUESTS,
          severity: 'high',
          details: {
            interval: timeSinceLastActivity
          }
        });
      }
    }

    // Check suspicious patterns
    const patterns = await this.#checkSuspiciousPatterns(req, session);
    if (patterns.length > 0) {
      anomalies.push(...patterns);
    }

    return anomalies;
  }

  /**
   * @private
   * Checks for suspicious patterns
   */
  async #checkSuspiciousPatterns(req, session) {
    const patterns = [];
    const sessionKey = `patterns:${session._id}`;

    // Get pattern history
    const history = this.#suspiciousPatterns.get(sessionKey) || {
      requests: [],
      anomalies: 0
    };

    // Add current request
    history.requests.push({
      timestamp: Date.now(),
      path: req.path,
      method: req.method
    });

    // Keep only recent requests (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 300000;
    history.requests = history.requests.filter(r => r.timestamp > fiveMinutesAgo);

    // Detect patterns
    if (history.requests.length > 100) {
      patterns.push({
        type: SessionValidationMiddleware.#ANOMALY_TYPES.SUSPICIOUS_PATTERN,
        severity: 'high',
        details: {
          pattern: 'excessive_requests',
          count: history.requests.length,
          timeWindow: '5_minutes'
        }
      });
    }

    // Check for automated behavior
    const requestIntervals = [];
    for (let i = 1; i < history.requests.length; i++) {
      requestIntervals.push(history.requests[i].timestamp - history.requests[i-1].timestamp);
    }

    if (requestIntervals.length > 10) {
      const avgInterval = requestIntervals.reduce((a, b) => a + b, 0) / requestIntervals.length;
      const variance = requestIntervals.reduce((sum, interval) => 
        sum + Math.pow(interval - avgInterval, 2), 0) / requestIntervals.length;
      
      // Low variance suggests automated behavior
      if (variance < 100) {
        patterns.push({
          type: SessionValidationMiddleware.#ANOMALY_TYPES.SUSPICIOUS_PATTERN,
          severity: 'medium',
          details: {
            pattern: 'automated_behavior',
            avgInterval,
            variance
          }
        });
      }
    }

    // Update pattern history
    this.#suspiciousPatterns.set(sessionKey, history);

    return patterns;
  }

  /**
   * @private
   * Detects replay attacks
   */
  async #detectReplayAttack(session, req) {
    // Check for duplicate request identifiers
    const requestId = req.headers['x-request-id'];
    if (requestId) {
      const replayKey = `replay:${session._id}:${requestId}`;
      const exists = await this.#cacheService.get(replayKey);
      
      if (exists) {
        return true; // Replay detected
      }
      
      // Store request ID
      await this.#cacheService.set(replayKey, true, 300); // 5 minutes
    }

    return false;
  }

  /**
   * @private
   * Handles invalid session
   */
  async #handleInvalidSession(req, session, validationResults, correlationId) {
    // Terminate session
    if (session?._id) {
      await this.#sessionService.terminateSession(session._id);
    }

    // Audit invalid session
    await this.#auditInvalidSession(req, session, validationResults, correlationId);

    // Clear session cookie
    if (req.res && !req.res.headersSent) {
      req.res.clearCookie('sessionId');
    }
  }

  /**
   * @private
   * Handles anomalies
   */
  async #handleAnomalies(req, session, anomalies, correlationId) {
    const highSeverityCount = anomalies.filter(a => a.severity === 'high').length;

    // Log anomalies
    logger.warn('Session anomalies detected', {
      correlationId,
      sessionId: session._id,
      userId: session.userId,
      anomalies
    });

    // Audit anomalies
    await this.#auditSessionAnomalies(req, session, anomalies, correlationId);

    // Block if too many high severity anomalies
    if (highSeverityCount >= this.#config.monitoring.anomalyThreshold) {
      if (this.#config.security.blockSuspiciousSessions) {
        await this.#sessionService.terminateSession(session._id);
        throw new AppError(
          'Suspicious session activity detected',
          401,
          ERROR_CODES.SUSPICIOUS_ACTIVITY,
          { correlationId }
        );
      }
    }

    // Send alerts
    if (this.#config.monitoring.alertOnSuspiciousActivity) {
      await this.#sendSecurityAlert(session, anomalies, correlationId);
    }
  }

  /**
   * @private
   * Handles concurrency violation
   */
  async #handleConcurrencyViolation(userId, currentSessionId, activeSessions, config, correlationId) {
    switch (config.strategy) {
      case 'terminate-oldest':
        const oldestSession = activeSessions
          .filter(s => s._id !== currentSessionId)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
        
        if (oldestSession) {
          await this.#sessionService.terminateSession(oldestSession._id);
          logger.info('Terminated oldest session due to concurrency limit', {
            correlationId,
            userId,
            terminatedSessionId: oldestSession._id
          });
        }
        break;

      case 'terminate-all':
        for (const session of activeSessions) {
          if (session._id !== currentSessionId) {
            await this.#sessionService.terminateSession(session._id);
          }
        }
        logger.info('Terminated all other sessions due to concurrency limit', {
          correlationId,
          userId,
          terminatedCount: activeSessions.length - 1
        });
        break;

      case 'block-new':
        // Handled in the main function
        break;
    }
  }

  /**
   * @private
   * Updates session expiry
   */
  async #updateSessionExpiry(session, config) {
    const newExpiry = new Date(Date.now() + config.session.timeout);
    await this.#sessionService.updateSession(session._id, {
      expiresAt: newExpiry,
      lastActivity: new Date()
    });
  }

  /**
   * @private
   * Checks and rotates session ID
   */
  async #checkAndRotateSessionId(req, res, session, config) {
    const lastRotation = session.lastRotation || session.createdAt;
    const timeSinceRotation = Date.now() - new Date(lastRotation).getTime();

    if (timeSinceRotation >= config.security.rotationInterval) {
      const newSessionId = await this.#sessionService.rotateSessionId(session._id);
      
      // Update cookie
      res.cookie('sessionId', newSessionId, {
        httpOnly: config.session.httpOnly,
        secure: config.session.requireSecureCookie,
        sameSite: config.session.sameSite,
        maxAge: config.session.timeout,
        path: config.session.path,
        domain: config.session.domain
      });

      logger.info('Session ID rotated', {
        oldSessionId: session._id,
        newSessionId
      });
    }
  }

  /**
   * @private
   * Updates session fingerprint
   */
  async #updateSessionFingerprint(sessionId, fingerprint) {
    await this.#sessionService.updateSession(sessionId, { fingerprint });
  }

  /**
   * @private
   * Updates session activity
   */
  async #updateSessionActivity(sessionId, activityData, config) {
    const activityKey = `session_activity:${sessionId}`;
    
    // Get existing activity
    let activity = await this.#cacheService.get(activityKey) || {
      requests: [],
      lastUpdate: Date.now()
    };

    // Add new activity
    activity.requests.push(activityData);

    // Limit history size
    if (activity.requests.length > 100) {
      activity.requests = activity.requests.slice(-100);
    }

    // Update if interval passed
    if (Date.now() - activity.lastUpdate >= config.updateInterval) {
      await this.#sessionService.updateSession(sessionId, {
        lastActivity: new Date(),
        activityHistory: activity.requests
      });
      activity.lastUpdate = Date.now();
    }

    // Cache activity
    await this.#cacheService.set(activityKey, activity, 3600);
  }

  /**
   * @private
   * Generates fingerprint
   */
  #generateFingerprint(req, config) {
    const components = [];

    config.components.forEach(component => {
      switch (component) {
        case 'userAgent':
          components.push(req.headers['user-agent'] || '');
          break;
        case 'acceptLanguage':
          components.push(req.headers['accept-language'] || '');
          break;
        case 'acceptEncoding':
          components.push(req.headers['accept-encoding'] || '');
          break;
        case 'plugins':
          components.push(req.headers['x-client-plugins'] || '');
          break;
      }
    });

    const fingerprintString = components.join('|');
    return crypto
      .createHash(config.hashAlgorithm)
      .update(fingerprintString)
      .digest('hex');
  }

  /**
   * @private
   * Extracts CSRF token
   */
  #extractCSRFToken(req, config) {
    // Check header
    if (req.headers[config.tokenLocation.header]) {
      return req.headers[config.tokenLocation.header];
    }

    // Check body
    if (req.body?.[config.tokenLocation.body]) {
      return req.body[config.tokenLocation.body];
    }

    // Check query
    if (req.query?.[config.tokenLocation.query]) {
      return req.query[config.tokenLocation.query];
    }

    return null;
  }

  /**
   * @private
   * Validates CSRF token
   */
  async #validateCSRFToken(sessionId, token, correlationId) {
    const session = await this.#getSession(sessionId, {});
    if (!session) {
      return false;
    }

    // Compare with session CSRF token
    if (session.csrfToken && session.csrfToken === token) {
      return true;
    }

    // Check token service for signed tokens
    try {
      const payload = await this.#tokenService.verifyAccessToken(token);
      return payload.sessionId === sessionId && payload.type === 'csrf';
    } catch {
      return false;
    }
  }

  /**
   * @private
   * Gets session user
   */
  async #getSessionUser(userId, organizationId) {
    if (!userId) return null;

    const query = { _id: userId };
    if (organizationId) {
      query.organizationId = organizationId;
    }

    return UserModel.findOne(query)
      .populate('roles')
      .populate('permissions')
      .lean();
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
   * Audits invalid session
   */
  async #auditInvalidSession(req, session, validationResults, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'session.invalid',
        userId: session?.userId,
        organizationId: session?.organizationId,
        sessionId: session?._id,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          reason: validationResults.reason,
          checks: validationResults.checks
        }
      });
    } catch (error) {
      logger.error('Failed to audit invalid session', { error: error.message });
    }
  }

  /**
   * @private
   * Audits session anomalies
   */
  async #auditSessionAnomalies(req, session, anomalies, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'session.anomalies',
        userId: session.userId,
        organizationId: session.organizationId,
        sessionId: session._id,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          anomalies,
          severity: Math.max(...anomalies.map(a => 
            a.severity === 'high' ? 3 : a.severity === 'medium' ? 2 : 1
          ))
        }
      });
    } catch (error) {
      logger.error('Failed to audit session anomalies', { error: error.message });
    }
  }

  /**
   * @private
   * Sends security alert
   */
  async #sendSecurityAlert(session, anomalies, correlationId) {
    // This would integrate with notification service
    logger.info('Security alert triggered', {
      correlationId,
      sessionId: session._id,
      userId: session.userId,
      anomalies
    });
  }

  /**
   * @private
   * Tracks session metric
   */
  #trackSessionMetric(type, duration) {
    const key = `session:${type}`;
    const current = this.#sessionMetrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.#sessionMetrics.set(key, {
      count: current.count + 1,
      totalDuration: current.totalDuration + duration,
      avgDuration: (current.totalDuration + duration) / (current.count + 1)
    });
  }

  /**
   * @private
   * Tracks request duration
   */
  #trackRequestDuration(sessionId, duration) {
    const key = `session:${sessionId}:duration`;
    const current = this.#sessionMetrics.get(key) || { count: 0, total: 0 };
    
    this.#sessionMetrics.set(key, {
      count: current.count + 1,
      total: current.total + duration,
      avg: (current.total + duration) / (current.count + 1)
    });
  }

  /**
   * @private
   * Starts metrics collection
   */
  #startMetricsCollection() {
    setInterval(() => {
      this.#reportMetrics();
    }, this.#config.monitoring.metricsInterval);
  }

  /**
   * @private
   * Reports metrics
   */
  #reportMetrics() {
    const metrics = this.getMetrics();
    logger.info('Session validation metrics', { metrics });
    
    // Clean up old pattern data
    const fiveMinutesAgo = Date.now() - 300000;
    for (const [key, data] of this.#suspiciousPatterns.entries()) {
      data.requests = data.requests.filter(r => r.timestamp > fiveMinutesAgo);
      if (data.requests.length === 0) {
        this.#suspiciousPatterns.delete(key);
      }
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates CSRF token for session
   * @param {string} sessionId - Session ID
   * @returns {Promise<string>} CSRF token
   */
  async generateCSRFToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store in session
    await this.#sessionService.updateSession(sessionId, { csrfToken: token });
    
    return token;
  }

  /**
   * Gets session metrics
   * @returns {Object} Session metrics
   */
  getMetrics() {
    const metrics = {};
    this.#sessionMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates session validation middleware instance
 * @param {Object} [config] - Middleware configuration
 * @returns {SessionValidationMiddleware} Middleware instance
 */
const getSessionValidationMiddleware = (config) => {
  if (!instance) {
    instance = new SessionValidationMiddleware(config);
  }
  return instance;
};

module.exports = {
  SessionValidationMiddleware,
  getSessionValidationMiddleware,
  // Export convenience methods
  validateSession: (options) => getSessionValidationMiddleware().validateSession(options),
  validateCSRF: (options) => getSessionValidationMiddleware().validateCSRF(options),
  enforceConcurrency: (options) => getSessionValidationMiddleware().enforceConcurrency(options),
  validateFingerprint: (options) => getSessionValidationMiddleware().validateFingerprint(options),
  trackActivity: (options) => getSessionValidationMiddleware().trackActivity(options)
};