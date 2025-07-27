'use strict';

/**
 * @fileoverview Session management service for user authentication sessions
 * @module shared/lib/auth/services/session-service
 * @requires module:shared/lib/database/models/session-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const SessionModel = require('../../database/models/session-model');
const UserModel = require('../../database/models/user-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const dateHelper = require('../../utils/helpers/date-helper');

/**
 * @class SessionService
 * @description Manages user sessions including creation, validation, termination,
 * and concurrent session control with enterprise security features
 */
class SessionService {
  /**
   * @private
   * @type {Object}
   */
  #config;

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
   * @type {Map}
   */
  #activeSessions;

  /**
   * @private
   * @type {Map}
   */
  #sessionMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    sessionDuration: 86400000, // 24 hours
    absoluteTimeout: 604800000, // 7 days
    slidingExpiration: true,
    inactivityTimeout: 3600000, // 1 hour
    maxConcurrentSessions: 5,
    allowMultipleDevices: true,
    sessionFingerprinting: true,
    enableSessionBinding: true,
    sessionCleanupInterval: 3600000, // 1 hour
    cacheTTL: {
      session: 300, // 5 minutes
      userSessions: 60, // 1 minute
      sessionMetadata: 600 // 10 minutes
    },
    trackSessionHistory: true,
    sessionHistoryLimit: 100,
    enableGeoTracking: true,
    suspiciousActivityThreshold: 5
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #SESSION_STATES = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    TERMINATED: 'terminated',
    REVOKED: 'revoked',
    SUSPICIOUS: 'suspicious'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #SESSION_EVENTS = {
    CREATED: 'session.created',
    ACCESSED: 'session.accessed',
    REFRESHED: 'session.refreshed',
    EXPIRED: 'session.expired',
    TERMINATED: 'session.terminated',
    SUSPICIOUS_ACTIVITY: 'session.suspicious_activity'
  };

  /**
   * Creates a new SessionService instance
   * @param {Object} [config] - Service configuration
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   */
  constructor(config = {}, cacheService, encryptionService) {
    this.#config = { ...SessionService.#DEFAULT_CONFIG, ...config };
    this.#cacheService = cacheService || new CacheService();
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#activeSessions = new Map();
    this.#sessionMetrics = new Map();

    // Start session cleanup interval
    if (this.#config.sessionCleanupInterval) {
      this.#startSessionCleanup();
    }

    logger.info('SessionService initialized', {
      sessionDuration: this.#config.sessionDuration,
      maxConcurrentSessions: this.#config.maxConcurrentSessions,
      slidingExpiration: this.#config.slidingExpiration
    });
  }

  /**
   * Creates a new session
   * @param {Object} sessionData - Session data
   * @param {string} sessionData.userId - User ID
   * @param {string} [sessionData.organizationId] - Organization ID
   * @param {string} sessionData.accessToken - Access token
   * @param {string} sessionData.refreshToken - Refresh token
   * @param {string} sessionData.ipAddress - Client IP address
   * @param {string} sessionData.userAgent - Client user agent
   * @param {string} [sessionData.deviceId] - Device identifier
   * @param {Object} [sessionData.deviceInfo] - Device information
   * @param {Object} [sessionData.location] - Geolocation data
   * @returns {Promise<Object>} Created session
   * @throws {AppError} If session creation fails
   */
  async createSession(sessionData) {
    const correlationId = sessionData.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Creating new session', {
        correlationId,
        userId: sessionData.userId,
        ipAddress: sessionData.ipAddress
      });

      // Validate session data
      this.#validateSessionData(sessionData);

      // Check concurrent sessions
      await this.#validateConcurrentSessions(sessionData.userId);

      // Generate session fingerprint
      const fingerprint = this.#generateSessionFingerprint(sessionData);

      // Prepare session document
      const session = {
        userId: sessionData.userId,
        organizationId: sessionData.organizationId,
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        state: SessionService.#SESSION_STATES.ACTIVE,
        fingerprint,
        device: {
          id: sessionData.deviceId,
          userAgent: sessionData.userAgent,
          ipAddress: sessionData.ipAddress,
          ...sessionData.deviceInfo
        },
        location: sessionData.location || await this.#getLocationFromIP(sessionData.ipAddress),
        createdAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + this.#config.sessionDuration),
        absoluteExpiresAt: new Date(Date.now() + this.#config.absoluteTimeout),
        activityCount: 1
      };

      // Create session in database
      const createdSession = await SessionModel.create(session);

      // Cache session
      await this.#cacheSession(createdSession);

      // Track active session
      this.#activeSessions.set(createdSession._id.toString(), {
        userId: sessionData.userId,
        createdAt: session.createdAt
      });

      // Track metrics
      this.#trackSessionEvent(SessionService.#SESSION_EVENTS.CREATED);

      logger.info('Session created successfully', {
        correlationId,
        sessionId: createdSession._id,
        userId: sessionData.userId
      });

      return createdSession;

    } catch (error) {
      logger.error('Session creation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to create session',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Gets a session by ID
   * @param {string} sessionId - Session ID
   * @param {Object} [options] - Get options
   * @returns {Promise<Object|null>} Session if found
   * @throws {AppError} If session retrieval fails
   */
  async getSession(sessionId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `session:${sessionId}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('Session retrieved from cache', { correlationId, sessionId });
        return cached;
      }

      // Get from database
      const session = await SessionModel.findById(sessionId);
      
      if (!session) {
        return null;
      }

      // Validate session state
      if (session.state !== SessionService.#SESSION_STATES.ACTIVE) {
        logger.warn('Inactive session accessed', {
          correlationId,
          sessionId,
          state: session.state
        });
        return null;
      }

      // Check expiration
      if (this.#isSessionExpired(session)) {
        await this.#expireSession(session);
        return null;
      }

      // Update activity if enabled
      if (this.#config.slidingExpiration) {
        await this.#updateSessionActivity(session);
      }

      // Cache session
      await this.#cacheSession(session);

      return session;

    } catch (error) {
      logger.error('Session retrieval failed', {
        correlationId,
        sessionId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to retrieve session',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Gets session by refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object|null>} Session if found
   * @throws {AppError} If session retrieval fails
   */
  async getSessionByRefreshToken(refreshToken) {
    try {
      const session = await SessionModel.findOne({
        refreshToken,
        state: SessionService.#SESSION_STATES.ACTIVE
      });

      if (!session) {
        return null;
      }

      // Check expiration
      if (this.#isSessionExpired(session)) {
        await this.#expireSession(session);
        return null;
      }

      return session;

    } catch (error) {
      logger.error('Session retrieval by refresh token failed', {
        error: error.message
      });

      throw new AppError(
        'Failed to retrieve session',
        500,
        ERROR_CODES.SESSION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Updates session tokens
   * @param {string} sessionId - Session ID
   * @param {Object} tokens - New tokens
   * @param {string} tokens.accessToken - New access token
   * @param {string} tokens.refreshToken - New refresh token
   * @returns {Promise<Object>} Updated session
   * @throws {AppError} If update fails
   */
  async updateSessionTokens(sessionId, tokens) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.debug('Updating session tokens', { correlationId, sessionId });

      const session = await SessionModel.findByIdAndUpdate(
        sessionId,
        {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          lastActivityAt: new Date(),
          $inc: { tokenRotationCount: 1 }
        },
        { new: true }
      );

      if (!session) {
        throw new AppError(
          'Session not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { correlationId }
        );
      }

      // Clear cache
      await this.#clearSessionCache(sessionId);

      // Track event
      this.#trackSessionEvent(SessionService.#SESSION_EVENTS.REFRESHED);

      return session;

    } catch (error) {
      logger.error('Session token update failed', {
        correlationId,
        sessionId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to update session tokens',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Validates a session
   * @param {string} sessionId - Session ID
   * @param {Object} context - Validation context
   * @param {string} context.ipAddress - Current IP address
   * @param {string} context.userAgent - Current user agent
   * @param {string} [context.fingerprint] - Session fingerprint
   * @returns {Promise<Object>} Validation result
   * @throws {AppError} If validation fails
   */
  async validateSession(sessionId, context) {
    const correlationId = context.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Validating session', { correlationId, sessionId });

      const session = await this.getSession(sessionId);
      
      if (!session) {
        return { valid: false, reason: 'Session not found' };
      }

      // Check fingerprint if enabled
      if (this.#config.sessionFingerprinting && context.fingerprint) {
        if (session.fingerprint !== context.fingerprint) {
          await this.#handleSuspiciousActivity(session, 'Fingerprint mismatch');
          return { valid: false, reason: 'Session fingerprint mismatch' };
        }
      }

      // Check IP binding if enabled
      if (this.#config.enableSessionBinding) {
        if (session.device.ipAddress !== context.ipAddress) {
          const severity = await this.#assessIPChange(session, context.ipAddress);
          if (severity === 'high') {
            await this.#handleSuspiciousActivity(session, 'Suspicious IP change');
            return { valid: false, reason: 'Suspicious IP change detected' };
          }
        }
      }

      // Check user agent changes
      if (session.device.userAgent !== context.userAgent) {
        await this.#handleSuspiciousActivity(session, 'User agent change', 'low');
      }

      // Check inactivity timeout
      if (this.#config.inactivityTimeout) {
        const inactiveDuration = Date.now() - new Date(session.lastActivityAt).getTime();
        if (inactiveDuration > this.#config.inactivityTimeout) {
          await this.#expireSession(session, 'Inactivity timeout');
          return { valid: false, reason: 'Session expired due to inactivity' };
        }
      }

      return { valid: true, session };

    } catch (error) {
      logger.error('Session validation failed', {
        correlationId,
        sessionId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Session validation failed',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Terminates a session
   * @param {string} sessionId - Session ID
   * @param {string} [reason='User logout'] - Termination reason
   * @returns {Promise<void>}
   * @throws {AppError} If termination fails
   */
  async terminateSession(sessionId, reason = 'User logout') {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Terminating session', {
        correlationId,
        sessionId,
        reason
      });

      const session = await SessionModel.findByIdAndUpdate(
        sessionId,
        {
          state: SessionService.#SESSION_STATES.TERMINATED,
          terminatedAt: new Date(),
          terminationReason: reason
        },
        { new: true }
      );

      if (!session) {
        logger.warn('Session not found for termination', { correlationId, sessionId });
        return;
      }

      // Remove from active sessions
      this.#activeSessions.delete(sessionId);

      // Clear cache
      await this.#clearSessionCache(sessionId);

      // Track event
      this.#trackSessionEvent(SessionService.#SESSION_EVENTS.TERMINATED);

      logger.info('Session terminated', {
        correlationId,
        sessionId,
        userId: session.userId
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
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Terminates all sessions for a user
   * @param {string} userId - User ID
   * @param {string} [reason='Security'] - Termination reason
   * @returns {Promise<number>} Number of terminated sessions
   * @throws {AppError} If termination fails
   */
  async terminateAllUserSessions(userId, reason = 'Security') {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Terminating all user sessions', {
        correlationId,
        userId,
        reason
      });

      const result = await SessionModel.updateMany(
        {
          userId,
          state: SessionService.#SESSION_STATES.ACTIVE
        },
        {
          state: SessionService.#SESSION_STATES.TERMINATED,
          terminatedAt: new Date(),
          terminationReason: reason
        }
      );

      // Clear user sessions from cache
      await this.#clearUserSessionsCache(userId);

      // Remove from active sessions
      for (const [sessionId, data] of this.#activeSessions) {
        if (data.userId === userId) {
          this.#activeSessions.delete(sessionId);
        }
      }

      logger.info('User sessions terminated', {
        correlationId,
        userId,
        count: result.modifiedCount
      });

      return result.modifiedCount;

    } catch (error) {
      logger.error('User sessions termination failed', {
        correlationId,
        userId,
        error: error.message
      });

      throw new AppError(
        'Failed to terminate user sessions',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Gets active sessions for a user
   * @param {string} userId - User ID
   * @param {Object} [options] - Get options
   * @returns {Promise<Array>} Active sessions
   * @throws {AppError} If retrieval fails
   */
  async getActiveUserSessions(userId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `user_sessions:${userId}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('User sessions retrieved from cache', { correlationId, userId });
        return cached;
      }

      const sessions = await SessionModel.find({
        userId,
        state: SessionService.#SESSION_STATES.ACTIVE,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });

      // Filter expired sessions
      const activeSessions = [];
      for (const session of sessions) {
        if (!this.#isSessionExpired(session)) {
          activeSessions.push(session);
        } else {
          await this.#expireSession(session);
        }
      }

      // Cache results
      await this.#cacheService.set(cacheKey, activeSessions, this.#config.cacheTTL.userSessions);

      return activeSessions;

    } catch (error) {
      logger.error('User sessions retrieval failed', {
        correlationId,
        userId,
        error: error.message
      });

      throw new AppError(
        'Failed to retrieve user sessions',
        500,
        ERROR_CODES.SESSION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Gets session history for a user
   * @param {string} userId - User ID
   * @param {Object} [options] - History options
   * @param {number} [options.limit] - Result limit
   * @param {Date} [options.startDate] - Start date filter
   * @param {Date} [options.endDate] - End date filter
   * @returns {Promise<Array>} Session history
   */
  async getSessionHistory(userId, options = {}) {
    try {
      if (!this.#config.trackSessionHistory) {
        return [];
      }

      const query = { userId };
      
      if (options.startDate || options.endDate) {
        query.createdAt = {};
        if (options.startDate) query.createdAt.$gte = options.startDate;
        if (options.endDate) query.createdAt.$lte = options.endDate;
      }

      const sessions = await SessionModel.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || this.#config.sessionHistoryLimit)
        .select('-accessToken -refreshToken');

      return sessions;

    } catch (error) {
      logger.error('Session history retrieval failed', {
        userId,
        error: error.message
      });

      throw new AppError(
        'Failed to retrieve session history',
        500,
        ERROR_CODES.SESSION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Validates session data
   */
  #validateSessionData(sessionData) {
    const errors = [];

    if (!sessionData.userId) {
      errors.push('User ID is required');
    }

    if (!sessionData.accessToken) {
      errors.push('Access token is required');
    }

    if (!sessionData.refreshToken) {
      errors.push('Refresh token is required');
    }

    if (!sessionData.ipAddress) {
      errors.push('IP address is required');
    }

    if (!sessionData.userAgent) {
      errors.push('User agent is required');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid session data',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Validates concurrent sessions
   */
  async #validateConcurrentSessions(userId) {
    const activeSessions = await this.getActiveUserSessions(userId);
    
    if (activeSessions.length >= this.#config.maxConcurrentSessions) {
      // Check if we should allow based on device policy
      if (!this.#config.allowMultipleDevices) {
        throw new AppError(
          'Maximum concurrent sessions reached',
          403,
          ERROR_CODES.SESSION_LIMIT_EXCEEDED,
          { maxSessions: this.#config.maxConcurrentSessions }
        );
      }

      // Terminate oldest session
      const oldestSession = activeSessions[activeSessions.length - 1];
      await this.terminateSession(oldestSession._id, 'Concurrent session limit');
    }
  }

  /**
   * @private
   * Generates session fingerprint
   */
  #generateSessionFingerprint(sessionData) {
    if (!this.#config.sessionFingerprinting) {
      return null;
    }

    const components = [
      sessionData.userAgent,
      sessionData.ipAddress,
      sessionData.deviceId || ''
    ];

    return this.#encryptionService.hashDataSync(components.join('|'));
  }

  /**
   * @private
   * Checks if session is expired
   */
  #isSessionExpired(session) {
    const now = new Date();
    
    // Check absolute expiration
    if (session.absoluteExpiresAt && session.absoluteExpiresAt < now) {
      return true;
    }

    // Check regular expiration
    if (session.expiresAt && session.expiresAt < now) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Expires a session
   */
  async #expireSession(session, reason = 'Session expired') {
    session.state = SessionService.#SESSION_STATES.EXPIRED;
    session.expiredAt = new Date();
    session.expirationReason = reason;
    await session.save();

    this.#activeSessions.delete(session._id.toString());
    await this.#clearSessionCache(session._id);
    
    this.#trackSessionEvent(SessionService.#SESSION_EVENTS.EXPIRED);
  }

  /**
   * @private
   * Updates session activity
   */
  async #updateSessionActivity(session) {
    const now = new Date();
    session.lastActivityAt = now;
    session.activityCount = (session.activityCount || 0) + 1;

    // Extend expiration if sliding
    if (this.#config.slidingExpiration) {
      session.expiresAt = new Date(now.getTime() + this.#config.sessionDuration);
    }

    await session.save();
    this.#trackSessionEvent(SessionService.#SESSION_EVENTS.ACCESSED);
  }

  /**
   * @private
   * Handles suspicious activity
   */
  async #handleSuspiciousActivity(session, activity, severity = 'medium') {
    logger.warn('Suspicious session activity detected', {
      sessionId: session._id,
      userId: session.userId,
      activity,
      severity
    });

    session.suspiciousActivities = session.suspiciousActivities || [];
    session.suspiciousActivities.push({
      activity,
      severity,
      timestamp: new Date()
    });

    if (session.suspiciousActivities.length >= this.#config.suspiciousActivityThreshold) {
      session.state = SessionService.#SESSION_STATES.SUSPICIOUS;
      await this.terminateSession(session._id, 'Suspicious activity detected');
    } else {
      await session.save();
    }

    this.#trackSessionEvent(SessionService.#SESSION_EVENTS.SUSPICIOUS_ACTIVITY);
  }

  /**
   * @private
   * Assesses IP change severity
   */
  async #assessIPChange(session, newIP) {
    // Simple implementation - can be enhanced with geo-location checks
    if (!session.ipHistory) {
      session.ipHistory = [];
    }

    session.ipHistory.push({
      ip: newIP,
      timestamp: new Date()
    });

    // If IP changed multiple times in short period, it's suspicious
    const recentChanges = session.ipHistory.filter(entry => 
      new Date() - entry.timestamp < 3600000 // 1 hour
    );

    if (recentChanges.length > 3) {
      return 'high';
    }

    return 'low';
  }

  /**
   * @private
   * Gets location from IP address
   */
  async #getLocationFromIP(ipAddress) {
    if (!this.#config.enableGeoTracking) {
      return null;
    }

    // Placeholder - integrate with actual geo-location service
    return {
      country: 'Unknown',
      city: 'Unknown',
      coordinates: null
    };
  }

  /**
   * @private
   * Caches session
   */
  async #cacheSession(session) {
    const cacheKey = `session:${session._id}`;
    await this.#cacheService.set(cacheKey, session, this.#config.cacheTTL.session);
  }

  /**
   * @private
   * Clears session cache
   */
  async #clearSessionCache(sessionId) {
    await this.#cacheService.delete(`session:${sessionId}`);
  }

  /**
   * @private
   * Clears user sessions cache
   */
  async #clearUserSessionsCache(userId) {
    await this.#cacheService.delete(`user_sessions:${userId}`);
  }

  /**
   * @private
   * Tracks session event
   */
  #trackSessionEvent(event) {
    const current = this.#sessionMetrics.get(event) || 0;
    this.#sessionMetrics.set(event, current + 1);
  }

  /**
   * @private
   * Starts session cleanup interval
   */
  #startSessionCleanup() {
    setInterval(async () => {
      try {
        await this.#cleanupExpiredSessions();
      } catch (error) {
        logger.error('Session cleanup failed', { error: error.message });
      }
    }, this.#config.sessionCleanupInterval);
  }

  /**
   * @private
   * Cleans up expired sessions
   */
  async #cleanupExpiredSessions() {
    logger.debug('Running session cleanup');

    const result = await SessionModel.updateMany(
      {
        state: SessionService.#SESSION_STATES.ACTIVE,
        $or: [
          { expiresAt: { $lt: new Date() } },
          { absoluteExpiresAt: { $lt: new Date() } }
        ]
      },
      {
        state: SessionService.#SESSION_STATES.EXPIRED,
        expiredAt: new Date(),
        expirationReason: 'Cleanup process'
      }
    );

    if (result.modifiedCount > 0) {
      logger.info('Expired sessions cleaned up', {
        count: result.modifiedCount
      });
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
   * Gets session metrics
   * @returns {Object} Session metrics
   */
  getMetrics() {
    const metrics = {
      activeSessions: this.#activeSessions.size,
      events: {}
    };

    this.#sessionMetrics.forEach((value, key) => {
      metrics.events[key] = value;
    });

    return metrics;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Test database connectivity
      await SessionModel.findOne().limit(1);

      return {
        healthy: true,
        service: 'SessionService',
        metrics: this.getMetrics()
      };
    } catch (error) {
      logger.error('Session service health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'SessionService',
        error: error.message
      };
    }
  }
}

module.exports = SessionService;