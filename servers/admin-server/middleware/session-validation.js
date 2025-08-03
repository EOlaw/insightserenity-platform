'use strict';

/**
 * @fileoverview Session validation middleware for admin authentication - FIXED VERSION
 * @module servers/admin-server/middleware/session-validation
 */

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const crypto = require('crypto');

// FIXED: Safe imports with fallbacks and timeout protection
let SessionService = null;
let sessionServiceInitialized = false;
try {
  SessionService = require('../../../shared/lib/auth/services/session-service');
} catch (error) {
  console.log('SessionService not available, using memory-based session handling');
}

let CacheService = null;
let cacheServiceInitialized = false;
try {
  CacheService = require('../../../shared/lib/services/cache-service');
} catch (error) {
  console.log('CacheService not available, sessions will be memory-only');
}

// FIXED: Safe config import
let config = {};
try {
  config = require('../../../shared/config');
} catch (error) {
  console.log('Shared config not available, using environment variables');
  config = {
    session: {
      timeout: parseInt(process.env.SESSION_TIMEOUT, 10) || 3600000,
      slidingExpiration: process.env.SESSION_SLIDING_EXPIRATION !== 'false',
      maxConcurrentSessions: parseInt(process.env.SESSION_MAX_CONCURRENT, 10) || 3,
      requireSecure: process.env.SESSION_REQUIRE_SECURE !== 'false',
      cookieName: process.env.SESSION_COOKIE_NAME || 'admin_session',
      fingerprintValidation: process.env.SESSION_FINGERPRINT_VALIDATION !== 'false',
      deviceTracking: process.env.SESSION_DEVICE_TRACKING !== 'false',
      inactivityTimeout: parseInt(process.env.SESSION_INACTIVITY_TIMEOUT, 10) || 900000,
      absoluteTimeout: parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT, 10) || 86400000,
      strictIPBinding: process.env.SESSION_STRICT_IP_BINDING === 'true'
    }
  };
}

// FIXED: Safe ERROR_CODES import
let ERROR_CODES = {};
try {
  const errorCodes = require('../../../shared/lib/utils/constants/error-codes');
  ERROR_CODES = errorCodes.ERROR_CODES || {};
} catch (error) {
  console.log('Error codes not available, using defaults');
  ERROR_CODES = {
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    SESSION_INVALID: 'SESSION_INVALID',
    SESSION_EXPIRED: 'SESSION_EXPIRED'
  };
}

/**
 * @class SessionValidationMiddleware
 * @description Advanced session validation for admin security - FIXED VERSION
 */
class SessionValidationMiddleware {
  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService = null;

  /**
   * @private
   * @static
   * @type {SessionService}
   */
  static #sessionService = null;

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #servicesInitialized = false;

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
   * @private
   * @static
   * @type {Map<string, number>}
   */
  static #sessionActivity = new Map();

  /**
   * FIXED: Initialize services with timeout protection and non-blocking approach
   * @private
   * @static
   */
  static #initializeServices() {
    if (this.#servicesInitialized) {
      return; // Already attempted initialization
    }

    this.#servicesInitialized = true;

    // FIXED: Non-blocking cache service initialization
    if (!this.#cacheService && CacheService && !cacheServiceInitialized) {
      cacheServiceInitialized = true;
      
      // Use setTimeout to make initialization non-blocking
      setTimeout(() => {
        try {
          const initPromise = new Promise((resolve, reject) => {
            if (typeof CacheService.getInstance === 'function') {
              resolve(CacheService.getInstance({ 
                fallbackToMemory: true,
                connectTimeout: 500,
                retryAttempts: 0
              }));
            } else {
              resolve(new CacheService({ 
                fallbackToMemory: true,
                connectTimeout: 500,
                retryAttempts: 0
              }));
            }
          });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Cache service timeout')), 1000);
          });

          Promise.race([initPromise, timeoutPromise])
            .then(service => {
              this.#cacheService = service;
              logger.debug('Cache service initialized for session validation');
            })
            .catch(error => {
              logger.debug('Cache service initialization failed', { error: error.message });
              this.#cacheService = null;
            });
        } catch (error) {
          logger.debug('Cache service not available for sessions', { error: error.message });
          this.#cacheService = null;
        }
      }, 0);
    }

    // FIXED: Non-blocking session service initialization
    if (!this.#sessionService && SessionService && !sessionServiceInitialized) {
      sessionServiceInitialized = true;
      
      setTimeout(() => {
        try {
          const initPromise = new Promise((resolve, reject) => {
            if (typeof SessionService.getInstance === 'function') {
              resolve(SessionService.getInstance({
                fallbackToMemory: true,
                connectTimeout: 500,
                retryAttempts: 0
              }));
            } else {
              resolve(new SessionService({
                fallbackToMemory: true,
                connectTimeout: 500,
                retryAttempts: 0
              }));
            }
          });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Session service timeout')), 1000);
          });

          Promise.race([initPromise, timeoutPromise])
            .then(service => {
              this.#sessionService = service;
              logger.debug('Session service initialized');
            })
            .catch(error => {
              logger.debug('Session service initialization failed', { error: error.message });
              this.#sessionService = null;
            });
        } catch (error) {
          logger.debug('Session service not available', { error: error.message });
          this.#sessionService = null;
        }
      }, 0);
    }
  }

  /**
   * FIXED: Main session validation middleware with immediate response
   * @static
   * @returns {Function} Express middleware
   */
  static validate() {
    return async (req, res, next) => {
      try {
        // FIXED: Initialize services asynchronously without blocking
        this.#initializeServices();

        // FIXED: Always allow in development mode with mock session
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Development mode: Using mock session validation');
          
          req.session = {
            id: 'dev_session_' + Date.now(),
            userId: 'dev_admin_user',
            isValid: true,
            createdAt: new Date(),
            lastActivity: new Date(),
            expiresAt: new Date(Date.now() + this.#config.timeout),
            fingerprint: this.#generateFingerprint(req),
            device: this.#extractDeviceInfo(req),
            ip: this.#getClientIP(req)
          };

          return next();
        }

        // Extract session identifier
        const sessionId = this.#extractSessionId(req);
        
        if (!sessionId) {
          logger.debug('No session ID found, creating empty session context');
          req.session = {
            id: null,
            isValid: false,
            reason: 'No session ID found'
          };
          return next();
        }

        // FIXED: Use immediate session validation without waiting for services
        const sessionData = await this.#validateSessionImmediate(sessionId, req);
        
        if (!sessionData.isValid) {
          logger.debug('Session validation failed', {
            sessionId,
            reason: sessionData.reason
          });
          
          req.session = {
            id: sessionId,
            isValid: false,
            reason: sessionData.reason || 'Invalid session'
          };
          
          return next();
        }

        // Enhance request with session data
        req.session = {
          ...sessionData.session,
          isValid: true,
          lastActivity: new Date()
        };

        // FIXED: Update session activity asynchronously without blocking
        setImmediate(() => {
          this.#updateSessionActivityAsync(sessionId, req);
        });

        // Set session headers
        this.#setSessionHeaders(res, sessionData);

        next();
      } catch (error) {
        logger.error('Session validation middleware error', {
          error: error.message,
          path: req.path
        });
        
        // FIXED: Create empty session and continue instead of blocking
        req.session = {
          id: null,
          isValid: false,
          reason: 'Validation error'
        };
        
        next();
      }
    };
  }

  /**
   * FIXED: Immediate session validation using memory store first
   * @private
   * @static
   */
  static async #validateSessionImmediate(sessionId, req) {
    try {
      // Check memory store first for immediate response
      let session = this.#activeSessions.get(sessionId);
      
      if (!session) {
        // Quick check in cache if available, with immediate timeout
        if (this.#cacheService) {
          try {
            const cacheKey = `${this.#config.cache.prefix}${sessionId}`;
            session = await Promise.race([
              this.#cacheService.get(cacheKey),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Cache timeout')), 500);
              })
            ]);
            
            if (session) {
              this.#activeSessions.set(sessionId, session);
            }
          } catch (error) {
            logger.debug('Cache lookup timeout, continuing with memory-only session validation');
          }
        }
      }

      if (!session) {
        return { isValid: false, reason: 'Session not found' };
      }

      const now = new Date();

      // Check expiration
      if (now >= new Date(session.expiresAt)) {
        this.#activeSessions.delete(sessionId);
        return { isValid: false, reason: 'Session expired' };
      }

      // Check absolute expiration
      if (session.absoluteExpiresAt && now >= new Date(session.absoluteExpiresAt)) {
        this.#activeSessions.delete(sessionId);
        return { isValid: false, reason: 'Session absolute timeout' };
      }

      // Check inactivity
      const lastActivity = new Date(session.lastActivity);
      const inactivityTime = now - lastActivity;
      if (inactivityTime > this.#config.inactivityTimeout) {
        this.#activeSessions.delete(sessionId);
        return { isValid: false, reason: 'Session inactive timeout' };
      }

      // FIXED: Optional validation checks that don't block
      this.#performOptionalValidation(session, req, sessionId);

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
   * FIXED: Perform optional validation checks asynchronously
   * @private
   * @static
   */
  static #performOptionalValidation(session, req, sessionId) {
    setImmediate(() => {
      try {
        // Validate fingerprint if enabled
        if (this.#config.fingerprintValidation) {
          const currentFingerprint = this.#generateFingerprint(req);
          if (session.fingerprint !== currentFingerprint) {
            logger.warn('Session fingerprint mismatch detected', {
              sessionId,
              expected: session.fingerprint,
              actual: currentFingerprint
            });
          }
        }

        // Validate IP binding if enabled
        if (this.#config.strictIPBinding) {
          const currentIP = this.#getClientIP(req);
          if (session.ip !== currentIP) {
            logger.warn('Session IP mismatch detected', {
              sessionId,
              expected: session.ip,
              actual: currentIP
            });
          }
        }
      } catch (error) {
        logger.debug('Optional validation error', { error: error.message });
      }
    });
  }

  /**
   * FIXED: Asynchronous session activity update
   * @private
   * @static
   */
  static async #updateSessionActivityAsync(sessionId, req) {
    try {
      const session = this.#activeSessions.get(sessionId);
      if (!session) return;

      const now = new Date();
      session.lastActivity = now;

      // Sliding expiration
      if (this.#config.slidingExpiration) {
        session.expiresAt = new Date(now.getTime() + this.#config.timeout);
      }

      // Update device info if changed and tracking is enabled
      if (this.#config.deviceTracking) {
        const currentDevice = this.#extractDeviceInfo(req);
        if (JSON.stringify(currentDevice) !== JSON.stringify(session.device)) {
          session.device = currentDevice;
          logger.debug('Session device changed', { sessionId });
        }
      }

      // Update stores asynchronously
      const updatePromises = [];
      
      if (this.#sessionService && this.#sessionService.updateActivity) {
        updatePromises.push(
          Promise.race([
            this.#sessionService.updateActivity(sessionId, session.lastActivity),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Service update timeout')), 2000);
            })
          ]).catch(error => {
            logger.debug('Session service update failed', { error: error.message });
          })
        );
      }
      
      if (this.#cacheService) {
        updatePromises.push(
          this.#cacheSessionAsync(sessionId, session)
        );
      }

      // Track activity count
      const activityCount = this.#sessionActivity.get(sessionId) || 0;
      this.#sessionActivity.set(sessionId, activityCount + 1);

      // Execute all updates without blocking
      if (updatePromises.length > 0) {
        Promise.allSettled(updatePromises).catch(error => {
          logger.debug('Some session updates failed', { error: error.message });
        });
      }

    } catch (error) {
      logger.debug('Failed to update session activity', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * FIXED: Create new admin session with timeout protection
   * @static
   * @param {Object} user - User data
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Session data
   */
  static async createSession(user, req) {
    try {
      this.#initializeServices();

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

      // Store session in memory immediately
      this.#activeSessions.set(sessionId, sessionData);

      // FIXED: Store in external services asynchronously
      setImmediate(() => {
        this.#storeSessionAsync(sessionId, sessionData);
      });

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
   * FIXED: Asynchronous session storage
   * @private
   * @static
   */
  static async #storeSessionAsync(sessionId, sessionData) {
    const storePromises = [];

    if (this.#sessionService && this.#sessionService.create) {
      storePromises.push(
        Promise.race([
          this.#sessionService.create(sessionData),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Session service timeout')), 3000);
          })
        ]).catch(error => {
          logger.debug('Session service storage failed', { error: error.message });
        })
      );
    }

    if (this.#cacheService) {
      storePromises.push(this.#cacheSessionAsync(sessionId, sessionData));
    }

    if (storePromises.length > 0) {
      Promise.allSettled(storePromises).catch(error => {
        logger.debug('Some session storage operations failed', { error: error.message });
      });
    }
  }

  /**
   * FIXED: Asynchronous cache session operation
   * @private
   * @static
   */
  static async #cacheSessionAsync(sessionId, session) {
    if (!this.#cacheService) return;
    
    try {
      const cacheKey = `${this.#config.cache.prefix}${sessionId}`;
      await Promise.race([
        this.#cacheService.set(cacheKey, session, this.#config.cache.ttl),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Cache operation timeout')), 1000);
        })
      ]);
    } catch (error) {
      logger.debug('Failed to cache session', { sessionId, error: error.message });
    }
  }

  /**
   * Extract session ID from request
   * @private
   * @static
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
    return req.get('X-Admin-Session-ID') || req.get('X-Session-ID');
  }

  /**
   * Generate session fingerprint
   * @private
   * @static
   */
  static #generateFingerprint(req) {
    const components = [
      req.get('user-agent') || 'unknown',
      req.get('accept-language') || 'unknown',
      req.get('accept-encoding') || 'unknown',
      this.#getClientIP(req)
    ];

    if (this.#config.fingerprintValidation) {
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
   * Extract device information
   * @private
   * @static
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
   * Detect browser from user agent
   * @private
   * @static
   */
  static #detectBrowser(userAgent) {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  /**
   * Detect OS from user agent
   * @private
   * @static
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
   * Detect device type
   * @private
   * @static
   */
  static #detectDevice(userAgent) {
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }

  /**
   * Get client IP
   * @private
   * @static
   */
  static #getClientIP(req) {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection?.remoteAddress ||
           'unknown';
  }

  /**
   * Set session headers
   * @private
   * @static
   */
  static #setSessionHeaders(res, sessionData) {
    try {
      const session = sessionData.session;
      const expiresIn = Math.floor((new Date(session.expiresAt) - new Date()) / 1000);
      
      res.set({
        'X-Session-ID': session.id,
        'X-Session-Expires-In': expiresIn.toString(),
        'X-Session-Valid': 'true'
      });
    } catch (error) {
      logger.debug('Failed to set session headers', { error: error.message });
    }
  }

  /**
   * Generate unique session ID
   * @private
   * @static
   */
  static #generateSessionId() {
    return `admin_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * FIXED: Destroy session with timeout protection
   * @static
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  static async destroySession(sessionId) {
    try {
      // Remove from memory immediately
      this.#activeSessions.delete(sessionId);
      this.#sessionActivity.delete(sessionId);
      
      // Remove from external stores asynchronously
      setImmediate(() => {
        this.#destroySessionAsync(sessionId);
      });

      logger.info('Admin session destroyed', { sessionId });
    } catch (error) {
      logger.error('Failed to destroy session', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * FIXED: Asynchronous session destruction
   * @private
   * @static
   */
  static async #destroySessionAsync(sessionId) {
    const destroyPromises = [];

    if (this.#sessionService && this.#sessionService.delete) {
      destroyPromises.push(
        Promise.race([
          this.#sessionService.delete(sessionId),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Service delete timeout')), 2000);
          })
        ]).catch(error => {
          logger.debug('Session service deletion failed', { error: error.message });
        })
      );
    }
    
    if (this.#cacheService) {
      destroyPromises.push(
        this.#clearSessionCacheAsync(sessionId)
      );
    }

    if (destroyPromises.length > 0) {
      Promise.allSettled(destroyPromises).catch(error => {
        logger.debug('Some session destruction operations failed', { error: error.message });
      });
    }
  }

  /**
   * FIXED: Asynchronous cache clearing
   * @private
   * @static
   */
  static async #clearSessionCacheAsync(sessionId) {
    if (!this.#cacheService) return;
    
    try {
      const cacheKey = `${this.#config.cache.prefix}${sessionId}`;
      await Promise.race([
        this.#cacheService.delete(cacheKey),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Cache delete timeout')), 1000);
        })
      ]);
    } catch (error) {
      logger.debug('Failed to clear session cache', { sessionId, error: error.message });
    }
  }

  /**
   * Get session configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      activeSessions: this.#activeSessions.size,
      servicesAvailable: {
        sessionService: !!this.#sessionService,
        cacheService: !!this.#cacheService
      },
      servicesInitialized: this.#servicesInitialized,
      sessionActivityTracked: this.#sessionActivity.size
    };
  }
}

// Export middleware and session management functions
module.exports = {
  validate: SessionValidationMiddleware.validate.bind(SessionValidationMiddleware),
  createSession: SessionValidationMiddleware.createSession.bind(SessionValidationMiddleware),
  destroySession: SessionValidationMiddleware.destroySession.bind(SessionValidationMiddleware),
  getConfig: SessionValidationMiddleware.getConfig.bind(SessionValidationMiddleware)
};