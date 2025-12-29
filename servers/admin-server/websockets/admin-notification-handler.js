/**
 * @fileoverview Admin Notification Handler
 * @module servers/admin-server/websockets/admin-notification-handler
 * @description Handles real-time notifications for admin users
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const WebSocketServer = require('./websocket-server');

const logger = getLogger({ serviceName: 'admin-notification-handler' });

/**
 * Admin Notification Handler Class
 * @class AdminNotificationHandler
 * @description Manages real-time notifications for admin users
 */
class AdminNotificationHandler {
  /**
   * Send security alert to user
   * @param {string} userId - User ID
   * @param {Object} alert - Alert data
   * @static
   * @public
   */
  static sendSecurityAlert(userId, alert) {
    WebSocketServer.sendToUser(userId, 'security:alert', {
      type: 'security_alert',
      severity: alert.severity || 'high',
      title: alert.title,
      message: alert.message,
      timestamp: new Date().toISOString(),
      data: alert.data || {}
    });

    logger.info('Security alert sent', { userId, alertType: alert.title });
  }

  /**
   * Send password expiry warning
   * @param {string} userId - User ID
   * @param {Object} data - Expiry data
   * @static
   * @public
   */
  static sendPasswordExpiryWarning(userId, data) {
    WebSocketServer.sendToUser(userId, 'notification:password_expiry', {
      type: 'password_expiry',
      severity: 'warning',
      title: 'Password Expiring Soon',
      message: `Your password will expire in ${data.daysRemaining} days. Please change it soon.`,
      timestamp: new Date().toISOString(),
      data
    });

    logger.info('Password expiry warning sent', { userId });
  }

  /**
   * Send MFA setup reminder
   * @param {string} userId - User ID
   * @static
   * @public
   */
  static sendMFAReminder(userId) {
    WebSocketServer.sendToUser(userId, 'notification:mfa_reminder', {
      type: 'mfa_reminder',
      severity: 'info',
      title: 'Enable MFA',
      message: 'We recommend enabling multi-factor authentication for enhanced security.',
      timestamp: new Date().toISOString(),
      action: {
        label: 'Setup MFA',
        url: '/admin/settings/security'
      }
    });

    logger.info('MFA reminder sent', { userId });
  }

  /**
   * Send session suspicious activity alert
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session information
   * @static
   * @public
   */
  static sendSuspiciousSessionAlert(userId, sessionData) {
    WebSocketServer.sendToUser(userId, 'security:suspicious_session', {
      type: 'suspicious_session',
      severity: 'high',
      title: 'Suspicious Activity Detected',
      message: 'Unusual activity detected on your account. Please review your active sessions.',
      timestamp: new Date().toISOString(),
      data: sessionData,
      action: {
        label: 'Review Sessions',
        url: '/admin/sessions'
      }
    });

    logger.warn('Suspicious session alert sent', { userId });
  }

  /**
   * Send user created notification
   * @param {Object} data - User creation data
   * @static
   * @public
   */
  static sendUserCreatedNotification(data) {
    // Notify super admins
    WebSocketServer.sendToRole('super_admin', 'notification:user_created', {
      type: 'user_created',
      severity: 'info',
      title: 'New User Created',
      message: `Admin user ${data.email} was created by ${data.createdBy}`,
      timestamp: new Date().toISOString(),
      data
    });

    logger.info('User created notification sent', { email: data.email });
  }

  /**
   * Send user deleted notification
   * @param {Object} data - User deletion data
   * @static
   * @public
   */
  static sendUserDeletedNotification(data) {
    // Notify super admins
    WebSocketServer.sendToRole('super_admin', 'notification:user_deleted', {
      type: 'user_deleted',
      severity: 'warning',
      title: 'User Deleted',
      message: `Admin user ${data.email} was deleted by ${data.deletedBy}`,
      timestamp: new Date().toISOString(),
      data
    });

    logger.info('User deleted notification sent', { email: data.email });
  }

  /**
   * Send role updated notification
   * @param {Object} data - Role update data
   * @static
   * @public
   */
  static sendRoleUpdatedNotification(data) {
    // Notify super admins
    WebSocketServer.sendToRole('super_admin', 'notification:role_updated', {
      type: 'role_updated',
      severity: 'info',
      title: 'Role Updated',
      message: `Role "${data.roleName}" was updated by ${data.updatedBy}`,
      timestamp: new Date().toISOString(),
      data
    });

    logger.info('Role updated notification sent', { roleName: data.roleName });
  }

  /**
   * Send permission changed notification
   * @param {Object} data - Permission change data
   * @static
   * @public
   */
  static sendPermissionChangedNotification(data) {
    // Notify super admins
    WebSocketServer.sendToRole('super_admin', 'notification:permission_changed', {
      type: 'permission_changed',
      severity: 'warning',
      title: 'Permissions Changed',
      message: `Permissions were modified by ${data.changedBy}`,
      timestamp: new Date().toISOString(),
      data
    });

    logger.info('Permission changed notification sent');
  }

  /**
   * Send system announcement to all users
   * @param {Object} announcement - Announcement data
   * @static
   * @public
   */
  static sendSystemAnnouncement(announcement) {
    WebSocketServer.broadcast('notification:system_announcement', {
      type: 'system_announcement',
      severity: announcement.severity || 'info',
      title: announcement.title,
      message: announcement.message,
      timestamp: new Date().toISOString(),
      data: announcement.data || {}
    });

    logger.info('System announcement sent', { title: announcement.title });
  }

  /**
   * Send invitation sent notification
   * @param {Object} data - Invitation data
   * @static
   * @public
   */
  static sendInvitationSentNotification(data) {
    // Notify the admin who sent the invitation
    WebSocketServer.sendToUser(data.invitedBy, 'notification:invitation_sent', {
      type: 'invitation_sent',
      severity: 'success',
      title: 'Invitation Sent',
      message: `Invitation sent to ${data.email}`,
      timestamp: new Date().toISOString(),
      data
    });

    logger.info('Invitation sent notification', { email: data.email });
  }
}

module.exports = AdminNotificationHandler;
