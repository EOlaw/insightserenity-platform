/**
 * @fileoverview Audit Log Stream Handler
 * @module servers/admin-server/websockets/audit-log-stream-handler
 * @description Handles real-time audit log streaming
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const WebSocketServer = require('./websocket-server');

const logger = getLogger({ serviceName': 'audit-log-stream-handler' });

/**
 * Audit Log Stream Handler Class
 * @class AuditLogStreamHandler
 * @description Manages real-time audit log streaming
 */
class AuditLogStreamHandler {
  /**
   * Stream audit log entry to admins
   * @param {Object} logEntry - Audit log entry
   * @static
   * @public
   */
  static streamLogEntry(logEntry) {
    // Only stream to users with audit:read permission (super_admin and admin)
    const streamData = {
      type: 'audit_log',
      entry: {
        id: logEntry._id,
        adminUser: logEntry.adminUser,
        action: logEntry.action,
        resourceType: logEntry.resourceType,
        resourceId: logEntry.resourceId,
        status: logEntry.status,
        ipAddress: logEntry.ipAddress,
        changesSummary: logEntry.changesSummary,
        timestamp: logEntry.createdAt || new Date().toISOString()
      }
    };

    // Stream to super_admin role
    WebSocketServer.sendToRole('super_admin', 'audit:log', streamData);

    // Stream to admin role
    WebSocketServer.sendToRole('admin', 'audit:log', streamData);

    logger.debug('Audit log entry streamed', { action: logEntry.action, status: logEntry.status });
  }

  /**
   * Stream critical audit event
   * @param {Object} logEntry - Critical audit log entry
   * @static
   * @public
   */
  static streamCriticalEvent(logEntry) {
    const streamData = {
      type: 'critical_audit_event',
      severity: 'critical',
      entry: {
        id: logEntry._id,
        adminUser: logEntry.adminUser,
        action: logEntry.action,
        resourceType: logEntry.resourceType,
        resourceId: logEntry.resourceId,
        status: logEntry.status,
        ipAddress: logEntry.ipAddress,
        changesSummary: logEntry.changesSummary,
        timestamp: logEntry.createdAt || new Date().toISOString()
      }
    };

    // Broadcast critical events to all super_admins
    WebSocketServer.sendToRole('super_admin', 'audit:critical', streamData);

    logger.warn('Critical audit event streamed', { action: logEntry.action });
  }

  /**
   * Stream security event
   * @param {Object} event - Security event data
   * @static
   * @public
   */
  static streamSecurityEvent(event) {
    const streamData = {
      type: 'security_event',
      severity: event.severity || 'high',
      event: {
        type: event.type,
        description: event.description,
        affectedUser: event.affectedUser,
        ipAddress: event.ipAddress,
        metadata: event.metadata,
        timestamp: event.timestamp || new Date().toISOString()
      }
    };

    // Stream to super_admin role
    WebSocketServer.sendToRole('super_admin', 'audit:security', streamData);

    logger.warn('Security event streamed', { type: event.type, severity: event.severity });
  }

  /**
   * Stream user activity
   * @param {string} userId - User ID
   * @param {Object} activity - Activity data
   * @static
   * @public
   */
  static streamUserActivity(userId, activity) {
    const streamData = {
      type: 'user_activity',
      userId,
      activity: {
        action: activity.action,
        resourceType: activity.resourceType,
        status: activity.status,
        timestamp: activity.timestamp || new Date().toISOString()
      }
    };

    // Stream to the user themselves
    WebSocketServer.sendToUser(userId, 'audit:activity', streamData);

    logger.debug('User activity streamed', { userId, action: activity.action });
  }

  /**
   * Stream audit statistics
   * @param {Object} stats - Audit statistics
   * @static
   * @public
   */
  static streamAuditStats(stats) {
    const streamData = {
      type: 'audit_stats',
      stats: {
        totalLogs: stats.totalLogs,
        successRate: stats.successRate,
        failureCount: stats.failureCount,
        topActions: stats.topActions,
        period: stats.period,
        timestamp: new Date().toISOString()
      }
    };

    // Stream to admins
    WebSocketServer.sendToRole('super_admin', 'audit:stats', streamData);
    WebSocketServer.sendToRole('admin', 'audit:stats', streamData);

    logger.debug('Audit stats streamed');
  }

  /**
   * Stream failed login attempts
   * @param {Object} data - Failed login data
   * @static
   * @public
   */
  static streamFailedLogin(data) {
    const streamData = {
      type: 'failed_login',
      severity: data.attemptCount >= 3 ? 'high' : 'medium',
      data: {
        email: data.email,
        ipAddress: data.ipAddress,
        attemptCount: data.attemptCount,
        lastAttempt: data.lastAttempt,
        timestamp: new Date().toISOString()
      }
    };

    // Stream to super_admins
    WebSocketServer.sendToRole('super_admin', 'audit:failed_login', streamData);

    logger.warn('Failed login attempt streamed', { email: data.email, attempts: data.attemptCount });
  }

  /**
   * Stream permission changes
   * @param {Object} data - Permission change data
   * @static
   * @public
   */
  static streamPermissionChange(data) {
    const streamData = {
      type: 'permission_change',
      severity: 'high',
      data: {
        targetUser: data.targetUser,
        changedBy: data.changedBy,
        action: data.action,
        oldPermissions: data.oldPermissions,
        newPermissions: data.newPermissions,
        timestamp: new Date().toISOString()
      }
    };

    // Stream to super_admins
    WebSocketServer.sendToRole('super_admin', 'audit:permission_change', streamData);

    logger.info('Permission change streamed', { targetUser: data.targetUser });
  }

  /**
   * Stream role changes
   * @param {Object} data - Role change data
   * @static
   * @public
   */
  static streamRoleChange(data) {
    const streamData = {
      type: 'role_change',
      severity: 'high',
      data: {
        targetUser: data.targetUser,
        changedBy: data.changedBy,
        oldRole: data.oldRole,
        newRole: data.newRole,
        timestamp: new Date().toISOString()
      }
    };

    // Stream to super_admins
    WebSocketServer.sendToRole('super_admin', 'audit:role_change', streamData);

    // Also notify the affected user
    if (data.targetUserId) {
      WebSocketServer.sendToUser(data.targetUserId, 'audit:role_changed', {
        type: 'your_role_changed',
        oldRole: data.oldRole,
        newRole: data.newRole,
        changedBy: data.changedBy,
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Role change streamed', { targetUser: data.targetUser });
  }

  /**
   * Stream data export event
   * @param {Object} data - Data export event
   * @static
   * @public
   */
  static streamDataExport(data) {
    const streamData = {
      type: 'data_export',
      severity: 'medium',
      data: {
        exportedBy: data.exportedBy,
        resourceType: data.resourceType,
        recordCount: data.recordCount,
        timestamp: new Date().toISOString()
      }
    };

    // Stream to super_admins
    WebSocketServer.sendToRole('super_admin', 'audit:data_export', streamData);

    logger.info('Data export event streamed', { exportedBy: data.exportedBy, resourceType: data.resourceType });
  }
}

module.exports = AuditLogStreamHandler;
