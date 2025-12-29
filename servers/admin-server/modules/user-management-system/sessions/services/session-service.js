/**
 * @fileoverview Session Service - Session Management
 * @module servers/admin-server/services/session/session-service
 * @description Class-based service for managing admin user sessions with comprehensive
 *              tracking, device fingerprinting, and security monitoring.
 * @version 1.0.0
 * @requires uuid
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const database = require('../../../../../../shared/lib/database');
const TokenService = require('../../authentication/services/token-service');

const logger = getLogger({ serviceName: 'session-service' });

/**
 * Get database service instance
 * @private
 */
function _getDatabaseService() {
  return database.getInstance();
}

/**
 * Get AdminSession model from connected database
 * @private
 */
function _getAdminSessionModel() {
  const dbService = _getDatabaseService();
  return dbService.getModel('admin-session', 'admin');
}

/**
 * Session Service Class
 * @class SessionService
 * @description Handles all session operations including creation, validation, rotation, and termination
 */
class SessionService {
  /**
   * Create a new admin session
   * @param {Object} params - Session parameters
   * @param {mongoose.Types.ObjectId} params.adminUser - Admin user ID
   * @param {string} params.email - Admin email
   * @param {string} params.role - Admin role
   * @param {Array<string>} params.permissions - Admin permissions
   * @param {string} params.department - Admin department
   * @param {string} params.ipAddress - Client IP address
   * @param {string} params.userAgent - Client user agent
   * @param {boolean} params.isMfaVerified - Whether MFA was verified
   * @param {Object} params.deviceInfo - Parsed device information
   * @param {Object} params.location - Geographic location data
   * @returns {Promise<Object>} Created session with tokens
   * @throws {AppError} If session creation fails
   * @static
   * @public
   */
  static async createSession(params) {
    try {
      const AdminSession = _getAdminSessionModel();

      const {
        adminUser,
        email,
        role,
        permissions = [],
        department,
        ipAddress,
        userAgent,
        isMfaVerified = false,
        deviceInfo = {},
        location = {}
      } = params;

      // Validate required parameters
      if (!adminUser || !email || !role || !ipAddress || !userAgent) {
        throw new AppError('Missing required session parameters', 400, 'INVALID_SESSION_PARAMS');
      }

      // Generate unique session ID
      const sessionId = uuidv4();

      logger.info('Creating new session', {
        adminUser: adminUser.toString(),
        email,
        role,
        sessionId,
        ipAddress,
        isMfaVerified
      });

      // Generate token pair
      const tokenPayload = {
        adminUserId: adminUser.toString(),
        email,
        role,
        permissions,
        department,
        sessionId
      };

      const { accessToken, refreshToken, expiresIn } = TokenService.generateTokenPair(tokenPayload);

      // Hash tokens for storage
      const accessTokenHash = TokenService.hashToken(accessToken);
      const refreshTokenHash = TokenService.hashToken(refreshToken);

      // Calculate expiry times
      const now = Date.now();
      const accessTokenExpiresAt = new Date(now + (expiresIn * 1000));
      const refreshTokenExpiresAt = new Date(now + (TokenService.getRefreshTokenExpirySeconds() * 1000));
      const sessionExpiresAt = refreshTokenExpiresAt; // Session expires with refresh token

      // Parse device info if not provided
      const parsedDeviceInfo = {
        deviceType: deviceInfo.deviceType || this.#parseDeviceType(userAgent),
        os: deviceInfo.os || this.#parseOS(userAgent),
        browser: deviceInfo.browser || this.#parseBrowser(userAgent),
        deviceFingerprint: deviceInfo.deviceFingerprint || this.#generateDeviceFingerprint(userAgent, ipAddress)
      };

      // Create session in database
      const session = await AdminSession.create({
        sessionId,
        adminUser,
        accessTokenHash,
        refreshTokenHash,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        expiresAt: sessionExpiresAt,
        status: 'active',
        isActive: true,
        isMfaVerified,
        ipAddress,
        userAgent,
        deviceInfo: parsedDeviceInfo,
        location,
        lastActivity: new Date()
      });

      logger.info('Session created successfully', {
        sessionId,
        adminUser: adminUser.toString(),
        expiresAt: sessionExpiresAt
      });

      // Return session with tokens (tokens not stored in DB)
      return {
        session: {
          id: session._id,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
          isMfaVerified: session.isMfaVerified
        },
        tokens: {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn
        }
      };
    } catch (error) {
      logger.error('Session creation failed', {
        error: error.message,
        adminUser: params.adminUser?.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Session creation failed', 500, 'SESSION_CREATION_FAILED');
    }
  }

  /**
   * Validate and retrieve session
   * @param {string} sessionId - Session ID
   * @param {string} accessToken - Access token (for validation)
   * @returns {Promise<Object>} Session document
   * @throws {AppError} If session is invalid
   * @static
   * @public
   */
  static async validateSession(sessionId, accessToken) {
    try {
      const AdminSession = _getAdminSessionModel();
      // Find session
      const session = await AdminSession.findOne({ sessionId })
        .populate('adminUser', 'email firstName lastName role permissions isActive')
        .select('+accessTokenHash');

      if (!session) {
        throw new AppError('Session not found', 401, 'SESSION_NOT_FOUND');
      }

      // Check if session is active
      if (!session.isActive || session.status !== 'active') {
        throw new AppError('Session is not active', 401, 'SESSION_INACTIVE');
      }

      // Check if session is expired
      if (session.expiresAt < Date.now()) {
        await session.expire();
        throw new AppError('Session has expired', 401, 'SESSION_EXPIRED');
      }

      // Check for inactivity timeout
      if (session.isInactive) {
        await session.expire();
        throw new AppError('Session expired due to inactivity', 401, 'SESSION_TIMEOUT');
      }

      // Verify token hash matches
      const tokenHash = TokenService.hashToken(accessToken);
      if (session.accessTokenHash !== tokenHash) {
        logger.warn('Token hash mismatch', { sessionId });
        throw new AppError('Invalid token for this session', 401, 'TOKEN_MISMATCH');
      }

      // Check if admin user is still active
      if (!session.adminUser.isActive) {
        await session.revoke('user_deactivated');
        throw new AppError('User account is not active', 401, 'USER_INACTIVE');
      }

      // Update last activity
      await session.updateActivity();

      logger.debug('Session validated successfully', {
        sessionId,
        adminUser: session.adminUser._id.toString()
      });

      return session;
    } catch (error) {
      logger.warn('Session validation failed', {
        error: error.message,
        sessionId
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Session validation failed', 401, 'SESSION_VALIDATION_FAILED');
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New token pair
   * @throws {AppError} If refresh fails
   * @static
   * @public
   */
  static async refreshAccessToken(refreshToken) {
    try {
      const AdminSession = _getAdminSessionModel();
      // Verify refresh token
      const decoded = TokenService.verifyRefreshToken(refreshToken);

      // Find session
      const session = await AdminSession.findOne({ sessionId: decoded.sessionId })
        .populate('adminUser', 'email firstName lastName role permissions department')
        .select('+refreshTokenHash');

      if (!session) {
        throw new AppError('Session not found', 401, 'SESSION_NOT_FOUND');
      }

      // Validate session status
      if (!session.isActive || session.status !== 'active') {
        throw new AppError('Session is not active', 401, 'SESSION_INACTIVE');
      }

      // Verify refresh token hash
      const tokenHash = TokenService.hashToken(refreshToken);
      if (session.refreshTokenHash !== tokenHash) {
        logger.warn('Refresh token hash mismatch', {
          sessionId: session.sessionId
        });
        throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      // Check if refresh token is expired
      if (session.refreshTokenExpiresAt < Date.now()) {
        await session.expire();
        throw new AppError('Refresh token has expired', 401, 'REFRESH_TOKEN_EXPIRED');
      }

      // Generate new access token
      const tokenPayload = {
        adminUserId: session.adminUser._id.toString(),
        email: session.adminUser.email,
        role: session.adminUser.role,
        permissions: session.adminUser.permissions,
        department: session.adminUser.department,
        sessionId: session.sessionId
      };

      const newAccessToken = TokenService.generateAccessToken(tokenPayload);
      const accessTokenHash = TokenService.hashToken(newAccessToken);

      // Calculate new expiry
      const expiresIn = TokenService.getAccessTokenExpirySeconds();
      const accessTokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));

      // Rotate access token in session
      await session.rotateAccessToken(accessTokenHash, accessTokenExpiresAt);

      logger.info('Access token refreshed', {
        sessionId: session.sessionId,
        adminUser: session.adminUser._id.toString()
      });

      return {
        accessToken: newAccessToken,
        tokenType: 'Bearer',
        expiresIn
      };
    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Token refresh failed', 401, 'TOKEN_REFRESH_FAILED');
    }
  }

  /**
   * Revoke session (logout)
   * @param {string} sessionId - Session ID
   * @param {string} reason - Revocation reason
   * @param {mongoose.Types.ObjectId} terminatedBy - Admin who terminated (optional)
   * @returns {Promise<void>}
   * @throws {AppError} If revocation fails
   * @static
   * @public
   */
  static async revokeSession(sessionId, reason = 'logout', terminatedBy = null) {
    try {
      const AdminSession = _getAdminSessionModel();
      const session = await AdminSession.findOne({ sessionId });

      if (!session) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      await session.revoke(reason, terminatedBy);

      logger.info('Session revoked', {
        sessionId,
        reason,
        terminatedBy: terminatedBy?.toString()
      });
    } catch (error) {
      logger.error('Session revocation failed', {
        error: error.message,
        sessionId
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Session revocation failed', 500, 'SESSION_REVOCATION_FAILED');
    }
  }

  /**
   * Revoke all sessions for a user
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} reason - Revocation reason
   * @param {string} exceptSessionId - Session ID to exclude (optional)
   * @returns {Promise<number>} Number of sessions revoked
   * @throws {AppError} If revocation fails
   * @static
   * @public
   */
  static async revokeAllUserSessions(adminUserId, reason = 'logout_all', exceptSessionId = null) {
    try {
      const AdminSession = _getAdminSessionModel();

      const query = {
        adminUser: adminUserId,
        isActive: true
      };

      if (exceptSessionId) {
        query.sessionId = { $ne: exceptSessionId };
      }

      const result = await AdminSession.updateMany(
        query,
        {
          $set: {
            status: 'revoked',
            isActive: false,
            terminatedAt: new Date(),
            terminationReason: reason
          }
        }
      );

      logger.info('All user sessions revoked', {
        adminUser: adminUserId.toString(),
        count: result.modifiedCount,
        exceptSessionId
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error('User sessions revocation failed', {
        error: error.message,
        adminUser: adminUserId.toString()
      });

      throw new AppError('Failed to revoke user sessions', 500, 'SESSION_REVOCATION_FAILED');
    }
  }

  /**
   * Get active sessions for a user
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @returns {Promise<Array>} Array of active sessions
   * @static
   * @public
   */
  static async getUserActiveSessions(adminUserId) {
    try {
      const AdminSession = _getAdminSessionModel();
      const sessions = await AdminSession.find({
        adminUser: adminUserId,
        isActive: true,
        expiresAt: { $gt: Date.now() }
      })
      .sort({ lastActivity: -1 })
      .lean();

      return sessions;
    } catch (error) {
      logger.error('Failed to retrieve user sessions', {
        error: error.message,
        adminUser: adminUserId.toString()
      });

      throw new AppError('Failed to retrieve sessions', 500, 'SESSION_RETRIEVAL_FAILED');
    }
  }

  /**
   * Mark session as suspicious
   * @param {string} sessionId - Session ID
   * @param {Array<string>} reasons - Suspicious reasons
   * @param {number} riskScore - Risk score (0-100)
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async markSessionSuspicious(sessionId, reasons, riskScore = 75) {
    try {
      const AdminSession = _getAdminSessionModel();
      const session = await AdminSession.findOne({ sessionId });

      if (!session) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      await session.markSuspicious(reasons, riskScore);

      logger.warn('Session marked as suspicious', {
        sessionId,
        reasons,
        riskScore
      });
    } catch (error) {
      logger.error('Failed to mark session as suspicious', {
        error: error.message,
        sessionId
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Failed to mark session as suspicious', 500, 'SESSION_UPDATE_FAILED');
    }
  }

  /**
   * Cleanup expired sessions
   * @returns {Promise<Object>} Cleanup result
   * @static
   * @public
   */
  static async cleanupExpiredSessions() {
    try {
      const AdminSession = _getAdminSessionModel();
      const inactiveResult = await AdminSession.cleanupInactive();
      const expiredResult = await AdminSession.cleanupExpired();

      logger.info('Session cleanup completed', {
        inactiveCount: inactiveResult.modifiedCount,
        expiredCount: expiredResult.deletedCount
      });

      return {
        inactiveCount: inactiveResult.modifiedCount,
        expiredCount: expiredResult.deletedCount
      };
    } catch (error) {
      logger.error('Session cleanup failed', {
        error: error.message
      });

      throw new AppError('Session cleanup failed', 500, 'SESSION_CLEANUP_FAILED');
    }
  }

  /**
   * Get session statistics
   * @param {mongoose.Types.ObjectId} adminUserId - Optional user ID filter
   * @returns {Promise<Object>} Session statistics
   * @static
   * @public
   */
  static async getSessionStatistics(adminUserId = null) {
    try {
      const AdminSession = _getAdminSessionModel();
      const stats = await AdminSession.getStatistics(adminUserId);
      return stats;
    } catch (error) {
      logger.error('Failed to get session statistics', {
        error: error.message
      });

      throw new AppError('Failed to retrieve session statistics', 500, 'SESSION_STATS_FAILED');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Parse device type from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Device type
   * @private
   * @static
   */
  static #parseDeviceType(userAgent) {
    const ua = userAgent.toLowerCase();

    if (/mobile|android|iphone|ipad|tablet/i.test(ua)) {
      if (/tablet|ipad/i.test(ua)) return 'tablet';
      return 'mobile';
    }

    return 'desktop';
  }

  /**
   * Parse OS from user agent
   * @param {string} userAgent - User agent string
   * @returns {Object} OS information
   * @private
   * @static
   */
  static #parseOS(userAgent) {
    const ua = userAgent;

    // Windows
    if (/Windows NT 10.0/i.test(ua)) return { name: 'Windows', version: '10' };
    if (/Windows NT 6.3/i.test(ua)) return { name: 'Windows', version: '8.1' };
    if (/Windows NT 6.2/i.test(ua)) return { name: 'Windows', version: '8' };
    if (/Windows NT 6.1/i.test(ua)) return { name: 'Windows', version: '7' };

    // macOS
    if (/Mac OS X (\d+[._]\d+)/i.test(ua)) {
      const version = ua.match(/Mac OS X (\d+[._]\d+)/i)[1].replace('_', '.');
      return { name: 'macOS', version };
    }

    // Linux
    if (/Linux/i.test(ua)) return { name: 'Linux', version: null };

    // iOS
    if (/iPhone OS (\d+[._]\d+)/i.test(ua)) {
      const version = ua.match(/iPhone OS (\d+[._]\d+)/i)[1].replace('_', '.');
      return { name: 'iOS', version };
    }

    // Android
    if (/Android (\d+\.?\d*)/i.test(ua)) {
      const version = ua.match(/Android (\d+\.?\d*)/i)[1];
      return { name: 'Android', version };
    }

    return { name: 'Unknown', version: null };
  }

  /**
   * Parse browser from user agent
   * @param {string} userAgent - User agent string
   * @returns {Object} Browser information
   * @private
   * @static
   */
  static #parseBrowser(userAgent) {
    const ua = userAgent;

    // Chrome
    if (/Chrome\/(\d+)/i.test(ua) && !/Edg/i.test(ua)) {
      const version = ua.match(/Chrome\/(\d+)/i)[1];
      return { name: 'Chrome', version };
    }

    // Edge
    if (/Edg\/(\d+)/i.test(ua)) {
      const version = ua.match(/Edg\/(\d+)/i)[1];
      return { name: 'Edge', version };
    }

    // Firefox
    if (/Firefox\/(\d+)/i.test(ua)) {
      const version = ua.match(/Firefox\/(\d+)/i)[1];
      return { name: 'Firefox', version };
    }

    // Safari
    if (/Safari\/(\d+)/i.test(ua) && !/Chrome/i.test(ua)) {
      const version = ua.match(/Version\/(\d+)/i)?.[1] || 'Unknown';
      return { name: 'Safari', version };
    }

    return { name: 'Unknown', version: null };
  }

  /**
   * Generate device fingerprint
   * @param {string} userAgent - User agent string
   * @param {string} ipAddress - IP address
   * @returns {string} Device fingerprint
   * @private
   * @static
   */
  static #generateDeviceFingerprint(userAgent, ipAddress) {
    const crypto = require('crypto');
    const data = `${userAgent}|${ipAddress}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }
}

module.exports = SessionService;
