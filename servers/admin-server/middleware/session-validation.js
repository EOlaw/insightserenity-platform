'use strict';

/**
 * @fileoverview Session validation middleware for admin authentication
 * @module servers/admin-server/middleware/session-validation
 * @requires module:shared/lib/auth/services/session-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:servers/admin-server/config
 */

const SessionService = require('../../../shared/lib/auth/services/session-service');
const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const CacheService = require('../../../shared/lib/services/cache-service');
const config = require('../../../shared/config');
const { ERROR_CODES } = require('../../../shared/lib/utils/constants/error-codes');
const crypto = require('crypto');

/**
 * @class SessionValidationMiddleware
 * @description Advanced session validation for admin security
 */
class SessionValidationMiddleware {
  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService = new CacheService();

  /**
   * @private
   * @static
   * @type {SessionService}
   */
  static #sessionService = new SessionService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    timeout: config.session?.timeout || 3600000, // 1 hour
    slidingExpiration: config.session?.slidingExpiration !== false,
    maxConcurrentSessions: config.session?.maxConcurrentSessions || 3,
    requireSecureConnection: config.session?.requireSecure !== false,
    cookieName: config.session?.cookieName || 'admin_session',
    fingerprintValidation: config.session?.fingerprintValidation !== false,
    deviceTracking: config.session?.deviceTracking !== false,
    inactivityTimeout: config.session?.inactivityTimeout || 900000, // 15 minutes
    absoluteTimeout: config.session?.absoluteTimeout || 86400000, // 24 hours
    regenerateOnPrivilegeChange: true,
    strictIPBinding: config.session?.strictIPBinding || false,
    cache: {
      prefix: 'admin_session:',
      ttl: 300 // 5 minutes
    }
  };

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #activeSessions = new Map();

  /**
   * Main session validation middleware
   * @static
   * @returns {Function} Express middleware
   */
  static validate() {
    return async (req, res, next) => {
      try {
        // Extract session identifier
        const sessionId = this.#extractSessionId(req);
        
        if (!sessionId) {
          throw new AppError(
            'No session found',
            401,
            ERROR_CODES.SESSION_NOT_FOUND
          );
        }

        // Validate session
        const sessionData = await this.#validateSession(sessionId, req);
        
        if (!sessionData.isValid) {
          throw new AppError(
            sessionData.reason || 'Invalid session',
            401,
            ERROR_CODES.SESSION_INVALID,
            { sessionId }
          );
        }

        // Enhance request with session data
        req.session = {
          ...sessionData.session,
          isValid: true,
          lastActivity: new Date()
        };

        // Update session activity
        await this.#updateSessionActivity(sessionId, req);

        // Set session headers
        this.#setSessionHeaders(res, sessionData);

        next();
      } catch (error) {
        // Clear invalid session
        if (error.code === ERROR_CODES.SESSION_INVALID || 
            error.code === ERROR_CODES.SESSION_EXPIRED) {
          this.#clearSession(req, res);
        }
        next(error);
      }
    };
  }

  /**
   * Create new admin session
   * @static
   * @param {Object} user - User data
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Session data
   */
  static async createSession(user, req) {
    try {
      // Check concurrent sessions
      await this.#checkConcurrentSessions(user._id);

      // Generate session data
      const sessionId = this.#generateSessionId();
      const fingerprint = this.#generateFingerprint(req);
      const deviceInfo = this.#extractDeviceInfo(req);

      const sessionData = {
        id: sessionId,
        userId: user._id,
        userRole: user.role,
        ip: this.#getClientIP(req),
        fingerprint,
        device: deviceInfo,
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + this.#config.timeout),
        absoluteExpiresAt: new Date(Date.now() + this.#config.absoluteTimeout),
        metadata: {
          userAgent: req.get('user-agent'),
          organizationId: user.organizationId,
          permissions: user.permissions || []
        }
      };

      // Store session
      await this.#sessionService.create(sessionData);
      this.#activeSessions.set(sessionId, sessionData);

      // Cache session
      await this.#cacheSession(sessionId, sessionData);

      logger.info('Admin session created', {
        sessionId,
        userId: user._id,
        ip: sessionData.ip
      });

      return sessionData;
    } catch (error) {
      logger.error('Failed to create session', {
        userId: user._id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Destroy session
   * @static
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  static async destroySession(sessionId) {
    try {
      // Remove from all stores
      await this.#sessionService.delete(sessionId);
      this.#activeSessions.delete(sessionId);
      await this.#clearSessionCache(sessionId);

      logger.info('Admin session destroyed', { sessionId });
    } catch (error) {
      logger.error('Failed to destroy session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Refresh session
   * @static
   * @param {string} sessionId - Session ID
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Refreshed session
   */
  static async refreshSession(sessionId, req) {
    try {
      const session = await this.#getSession(sessionId);
      
      if (!session) {
        throw new AppError(
          'Session not found',
          404,
          ERROR_CODES.SESSION_NOT_FOUND
        );
      }

      // Validate refresh eligibility
      const now = new Date();
      if (now >= session.absoluteExpiresAt) {
        throw new AppError(
          'Session absolute timeout reached',
          401,
          ERROR_CODES.SESSION_EXPIRED
        );
      }

      // Update session
      session.lastActivity = now;
      session.expiresAt = new Date(now.getTime() + this.#config.timeout);
      session.fingerprint = this.#generateFingerprint(req);

      // Save updates
      await this.#sessionService.update(sessionId, session);
      this.#activeSessions.set(sessionId, session);
      await this.#cacheSession(sessionId, session);

      logger.info('Admin session refreshed', { sessionId });

      return session;
    } catch (error) {
      logger.error('Failed to refresh session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all active sessions for user
   * @static
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Active sessions
   */
  static async getUserSessions(userId) {
    try {
      const sessions = await this.#sessionService.findByUser(userId);
      
      return sessions.filter(session => {
        const now = new Date();
        return session.expiresAt > now && session.absoluteExpiresAt > now;
      });
    } catch (error) {
      logger.error('Failed to get user sessions', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * @private
   * Validate session
   */
  static async #validateSession(sessionId, req) {
    try {
      // Get session data
      const session = await this.#getSession(sessionId);
      
      if (!session) {
        return { isValid: false, reason: 'Session not found' };
      }

      const now = new Date();

      // Check expiration
      if (now >= session.expiresAt) {
        return { isValid: false, reason: 'Session expired' };
      }

      // Check absolute expiration
      if (now >= session.absoluteExpiresAt) {
        return { isValid: false, reason: 'Session absolute timeout' };
      }

      // Check inactivity
      const inactivityTime = now - new Date(session.lastActivity);
      if (inactivityTime > this.#config.inactivityTimeout) {
        return { isValid: false, reason: 'Session inactive timeout' };
      }

      // Validate fingerprint
      if (this.#config.fingerprintValidation) {
        const currentFingerprint = this.#generateFingerprint(req);
        if (session.fingerprint !== currentFingerprint) {
          logger.warn('Session fingerprint mismatch', {
            sessionId,
            expected: session.fingerprint,
            actual: currentFingerprint
          });
          return { isValid: false, reason: 'Session fingerprint mismatch' };
        }
      }

      // Validate IP binding
      if (this.#config.strictIPBinding) {
        const currentIP = this.#getClientIP(req);
        if (session.ip !== currentIP) {
          logger.warn('Session IP mismatch', {
            sessionId,
            expected: session.ip,
            actual: currentIP
          });
          return { isValid: false, reason: 'Session IP mismatch' };
        }
      }

      // Check if session is revoked
      if (session.revoked) {
        return { isValid: false, reason: 'Session revoked' };
      }

      return {
        isValid: true,
        session
      };

    } catch (error) {
      logger.error('Session validation error', {
        sessionId,
        error: error.message
      });
      return { isValid: false, reason: 'Validation error' };
    }
  }

  /**
   * @private
   * Get session from cache or database
   */
  static async #getSession(sessionId) {
    // Check memory cache
    if (this.#activeSessions.has(sessionId)) {
      return this.#activeSessions.get(sessionId);
    }

    // Check Redis cache
    const cacheKey = `${this.#config.cache.prefix}${sessionId}`;
    const cached = await this.#cacheService.get(cacheKey);
    if (cached) {
      this.#activeSessions.set(sessionId, cached);
      return cached;
    }

    // Get from database
    const session = await this.#sessionService.findById(sessionId);
    if (session) {
      this.#activeSessions.set(sessionId, session);
      await this.#cacheSession(sessionId, session);
    }

    return session;
  }

  /**
   * @private
   * Update session activity
   */
  static async #updateSessionActivity(sessionId, req) {
    try {
      const session = this.#activeSessions.get(sessionId);
      if (!session) return;

      const now = new Date();
      session.lastActivity = now;

      // Sliding expiration
      if (this.#config.slidingExpiration) {
        session.expiresAt = new Date(now.getTime() + this.#config.timeout);
      }

      // Update device info if changed
      if (this.#config.deviceTracking) {
        const currentDevice = this.#extractDeviceInfo(req);
        if (JSON.stringify(currentDevice) !== JSON.stringify(session.device)) {
          session.device = currentDevice;
          logger.info('Session device changed', { sessionId });
        }
      }

      // Update stores
      await this.#sessionService.updateActivity(sessionId, session.lastActivity);
      await this.#cacheSession(sessionId, session);

    } catch (error) {
      logger.error('Failed to update session activity', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Check concurrent sessions limit
   */
  static async #checkConcurrentSessions(userId) {
    const activeSessions = await this.getUserSessions(userId);
    
    if (activeSessions.length >= this.#config.maxConcurrentSessions) {
      // Remove oldest session
      const oldest = activeSessions.sort((a, b) => 
        new Date(a.lastActivity) - new Date(b.lastActivity)
      )[0];
      
      await this.destroySession(oldest.id);
      
      logger.info('Removed oldest session due to concurrent limit', {
        userId,
        removedSession: oldest.id
      });
    }
  }

  /**
   * @private
   * Extract session ID from request
   */
  static #extractSessionId(req) {
    // Check cookie
    if (req.cookies?.[this.#config.cookieName]) {
      return req.cookies[this.#config.cookieName];
    }

    // Check header
    const authHeader = req.get('Authorization');
    if (authHeader?.startsWith('Session ')) {
      return authHeader.substring(8);
    }

    // Check custom header
    return req.get('X-Admin-Session-ID');
  }

  /**
   * @private
   * Generate session fingerprint
   */
  static #generateFingerprint(req) {
    const components = [
      req.get('user-agent') || 'unknown',
      req.get('accept-language') || 'unknown',
      req.get('accept-encoding') || 'unknown',
      this.#getClientIP(req)
    ];

    if (this.#config.fingerprintValidation) {
      // Add more components for stricter validation
      components.push(
        req.get('accept') || 'unknown',
        req.get('dnt') || 'unknown'
      );
    }

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * @private
   * Extract device information
   */
  static #extractDeviceInfo(req) {
    const userAgent = req.get('user-agent') || '';
    
    return {
      userAgent,
      browser: this.#detectBrowser(userAgent),
      os: this.#detectOS(userAgent),
      device: this.#detectDevice(userAgent)
    };
  }

  /**
   * @private
   * Detect browser from user agent
   */
  static #detectBrowser(userAgent) {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  /**
   * @private
   * Detect OS from user agent
   */
  static #detectOS(userAgent) {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac OS')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  /**
   * @private
   * Detect device type
   */
  static #detectDevice(userAgent) {
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }

  /**
   * @private
   * Get client IP
   */
  static #getClientIP(req) {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection?.remoteAddress ||
           'unknown';
  }

  /**
   * @private
   * Set session headers
   */
  static #setSessionHeaders(res, sessionData) {
    const session = sessionData.session;
    const expiresIn = Math.floor((session.expiresAt - new Date()) / 1000);
    
    res.set({
      'X-Session-ID': session.id,
      'X-Session-Expires-In': expiresIn,
      'X-Session-Valid': 'true'
    });
  }

  /**
   * @private
   * Clear session from response
   */
  static #clearSession(req, res) {
    res.clearCookie(this.#config.cookieName);
    res.set('X-Session-Valid', 'false');
  }

  /**
   * @private
   * Cache session data
   */
  static async #cacheSession(sessionId, session) {
    const cacheKey = `${this.#config.cache.prefix}${sessionId}`;
    await this.#cacheService.set(cacheKey, session, this.#config.cache.ttl);
  }

  /**
   * @private
   * Clear session from cache
   */
  static async #clearSessionCache(sessionId) {
    const cacheKey = `${this.#config.cache.prefix}${sessionId}`;
    await this.#cacheService.delete(cacheKey);
  }

  /**
   * @private
   * Generate unique session ID
   */
  static #generateSessionId() {
    return `admin_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Get session configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      activeSessions: this.#activeSessions.size
    };
  }
}

// Export middleware and session management functions
module.exports = {
  validate: SessionValidationMiddleware.validate.bind(SessionValidationMiddleware),
  createSession: SessionValidationMiddleware.createSession.bind(SessionValidationMiddleware),
  destroySession: SessionValidationMiddleware.destroySession.bind(SessionValidationMiddleware),
  refreshSession: SessionValidationMiddleware.refreshSession.bind(SessionValidationMiddleware),
  getUserSessions: SessionValidationMiddleware.getUserSessions.bind(SessionValidationMiddleware),
  getConfig: SessionValidationMiddleware.getConfig.bind(SessionValidationMiddleware)
};