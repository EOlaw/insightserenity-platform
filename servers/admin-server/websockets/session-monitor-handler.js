/**
 * @fileoverview Session Monitor Handler
 * @module servers/admin-server/websockets/session-monitor-handler
 * @description Handles real-time session monitoring and updates
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const WebSocketServer = require('./websocket-server');

const logger = getLogger({ serviceName: 'session-monitor-handler' });

/**
 * Session Monitor Handler Class
 * @class SessionMonitorHandler
 * @description Manages real-time session monitoring
 */
class SessionMonitorHandler {
  /**
   * Send session created event
   * @param {string} userId - User ID
   * @param {Object} session - Session data
   * @static
   * @public
   */
  static sendSessionCreated(userId, session) {
    WebSocketServer.sendToUser(userId, 'session:created', {
      type: 'session_created',
      session: {
        id: session._id,
        sessionId: session.sessionId,
        ipAddress: session.ipAddress,
        deviceInfo: session.deviceInfo,
        location: session.location,
        createdAt: session.createdAt
      },
      timestamp: new Date().toISOString()
    });

    logger.info('Session created event sent', { userId, sessionId: session.sessionId });
  }

  /**
   * Send session revoked event
   * @param {string} userId - User ID
   * @param {Object} data - Revocation data
   * @static
   * @public
   */
  static sendSessionRevoked(userId, data) {
    WebSocketServer.sendToUser(userId, 'session:revoked', {
      type: 'session_revoked',
      sessionId: data.sessionId,
      reason: data.reason,
      revokedBy: data.revokedBy,
      timestamp: new Date().toISOString()
    });

    logger.info('Session revoked event sent', { userId, sessionId: data.sessionId });
  }

  /**
   * Send session updated event
   * @param {string} userId - User ID
   * @param {Object} session - Updated session data
   * @static
   * @public
   */
  static sendSessionUpdated(userId, session) {
    WebSocketServer.sendToUser(userId, 'session:updated', {
      type: 'session_updated',
      session: {
        id: session._id,
        sessionId: session.sessionId,
        lastActivity: session.lastActivity,
        isActive: session.isActive,
        isSuspicious: session.isSuspicious
      },
      timestamp: new Date().toISOString()
    });

    logger.debug('Session updated event sent', { userId, sessionId: session.sessionId });
  }

  /**
   * Send active sessions count update
   * @param {string} userId - User ID
   * @param {number} count - Active sessions count
   * @static
   * @public
   */
  static sendActiveSessionsCount(userId, count) {
    WebSocketServer.sendToUser(userId, 'session:count', {
      type: 'active_sessions_count',
      count,
      timestamp: new Date().toISOString()
    });

    logger.debug('Active sessions count sent', { userId, count });
  }

  /**
   * Send session expiring warning
   * @param {string} userId - User ID
   * @param {Object} data - Expiry data
   * @static
   * @public
   */
  static sendSessionExpiringWarning(userId, data) {
    WebSocketServer.sendToUser(userId, 'session:expiring', {
      type: 'session_expiring',
      sessionId: data.sessionId,
      expiresAt: data.expiresAt,
      minutesRemaining: data.minutesRemaining,
      timestamp: new Date().toISOString()
    });

    logger.info('Session expiring warning sent', { userId, minutesRemaining: data.minutesRemaining });
  }

  /**
   * Send session activity update
   * @param {string} userId - User ID
   * @param {Object} activity - Activity data
   * @static
   * @public
   */
  static sendSessionActivity(userId, activity) {
    WebSocketServer.sendToUser(userId, 'session:activity', {
      type: 'session_activity',
      action: activity.action,
      timestamp: activity.timestamp,
      metadata: activity.metadata
    });

    logger.debug('Session activity sent', { userId, action: activity.action });
  }

  /**
   * Broadcast session statistics (to admins with session:read permission)
   * @param {Object} stats - Session statistics
   * @static
   * @public
   */
  static broadcastSessionStats(stats) {
    // Send to super_admin and admin roles
    WebSocketServer.sendToRole('super_admin', 'session:stats', {
      type: 'session_stats',
      stats,
      timestamp: new Date().toISOString()
    });

    WebSocketServer.sendToRole('admin', 'session:stats', {
      type: 'session_stats',
      stats,
      timestamp: new Date().toISOString()
    });

    logger.debug('Session stats broadcast', { stats });
  }

  /**
   * Send concurrent login alert
   * @param {string} userId - User ID
   * @param {Object} data - Concurrent login data
   * @static
   * @public
   */
  static sendConcurrentLoginAlert(userId, data) {
    WebSocketServer.sendToUser(userId, 'session:concurrent_login', {
      type: 'concurrent_login',
      severity: 'warning',
      newSession: data.newSession,
      existingSessionsCount: data.existingSessionsCount,
      timestamp: new Date().toISOString()
    });

    logger.warn('Concurrent login alert sent', { userId, existingSessionsCount: data.existingSessionsCount });
  }

  /**
   * Send device change alert
   * @param {string} userId - User ID
   * @param {Object} data - Device change data
   * @static
   * @public
   */
  static sendDeviceChangeAlert(userId, data) {
    WebSocketServer.sendToUser(userId, 'session:device_change', {
      type: 'device_change',
      severity: 'info',
      oldDevice: data.oldDevice,
      newDevice: data.newDevice,
      timestamp: new Date().toISOString()
    });

    logger.info('Device change alert sent', { userId });
  }

  /**
   * Send location change alert
   * @param {string} userId - User ID
   * @param {Object} data - Location change data
   * @static
   * @public
   */
  static sendLocationChangeAlert(userId, data) {
    WebSocketServer.sendToUser(userId, 'session:location_change', {
      type: 'location_change',
      severity: 'warning',
      oldLocation: data.oldLocation,
      newLocation: data.newLocation,
      timestamp: new Date().toISOString()
    });

    logger.warn('Location change alert sent', { userId });
  }
}

module.exports = SessionMonitorHandler;
