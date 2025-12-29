/**
 * @fileoverview Notification Job
 * @module servers/admin-server/jobs/notification-job
 * @description Background job to process and send notifications
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const AdminSession = require('../../../shared/lib/database/models/admin-server/admin-session');
const AdminAuditLog = require('../../../shared/lib/database/models/admin-server/admin-audit-log');
const AdminUser = require('../../../shared/lib/database/models/admin-server/admin-user');

const logger = getLogger({ serviceName: 'notification-job' });

/**
 * Notification Job Class
 * @class NotificationJob
 * @description Processes and sends notifications to admin users
 */
class NotificationJob {
  /**
   * Job name
   * @type {string}
   * @static
   */
  static jobName = 'notification';

  /**
   * Job schedule (cron expression)
   * Runs every 15 minutes
   * @type {string}
   * @static
   */
  static schedule = '*/15 * * * *'; // Every 15 minutes

  /**
   * Execute the job
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async execute() {
    const startTime = Date.now();
    logger.info('Starting notification job');

    try {
      const now = new Date();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
      const notifications = [];

      // 1. Notify users of suspicious sessions
      const suspiciousSessions = await AdminSession.find({
        isSuspicious: true,
        createdAt: { $gte: fifteenMinutesAgo },
        suspiciousNotificationSent: { $ne: true }
      }).populate('adminUser', 'email firstName lastName');

      for (const session of suspiciousSessions) {
        if (session.adminUser) {
          // TODO: Send email notification
          // await emailService.sendSecurityAlert(session.adminUser.email, {
          //   type: 'suspicious_session',
          //   details: session
          // });

          notifications.push({
            type: 'SUSPICIOUS_SESSION',
            recipient: session.adminUser.email,
            sessionId: session._id
          });

          // Mark as notified
          session.suspiciousNotificationSent = true;
          await session.save();

          logger.warn('Suspicious session notification queued', {
            userId: session.adminUser._id,
            email: session.adminUser.email
          });
        }
      }

      // 2. Notify users of password expiration (passwords older than 90 days)
      const passwordExpiryThreshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const usersWithExpiredPasswords = await AdminUser.find({
        isActive: true,
        passwordChangedAt: { $lt: passwordExpiryThreshold },
        passwordExpiryNotificationSent: { $ne: true }
      });

      for (const user of usersWithExpiredPasswords) {
        // TODO: Send password expiry notification
        // await emailService.sendPasswordExpiryNotification(user.email, {
        //   firstName: user.firstName,
        //   daysSinceChange: Math.floor((now - user.passwordChangedAt) / (24 * 60 * 60 * 1000))
        // });

        notifications.push({
          type: 'PASSWORD_EXPIRED',
          recipient: user.email,
          userId: user._id
        });

        // Mark as notified
        user.passwordExpiryNotificationSent = true;
        await user.save();

        logger.info('Password expiry notification queued', { userId: user._id, email: user.email });
      }

      // 3. Notify super admins of critical security events
      const criticalEvents = await AdminAuditLog.find({
        action: { $in: [
          'security.threat_detected',
          'users.delete',
          'roles.delete',
          'permissions.delete'
        ] },
        createdAt: { $gte: fifteenMinutesAgo },
        notificationSent: { $ne: true }
      });

      if (criticalEvents.length > 0) {
        // Find super admins
        const superAdmins = await AdminUser.find({
          role: 'super_admin',
          isActive: true
        });

        for (const admin of superAdmins) {
          // TODO: Send critical event notification
          // await emailService.sendCriticalEventAlert(admin.email, {
          //   events: criticalEvents,
          //   count: criticalEvents.length
          // });

          notifications.push({
            type: 'CRITICAL_EVENT',
            recipient: admin.email,
            eventCount: criticalEvents.length
          });
        }

        // Mark events as notified
        await AdminAuditLog.updateMany(
          { _id: { $in: criticalEvents.map(e => e._id) } },
          { $set: { notificationSent: true } }
        );

        logger.warn('Critical event notifications queued', {
          eventCount: criticalEvents.length,
          recipientCount: superAdmins.length
        });
      }

      // 4. Notify users of inactive sessions (about to expire)
      const inactiveWarningThreshold = new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000); // 27 days (3 days before 30-day expiry)
      const inactiveSessions = await AdminSession.find({
        isActive: true,
        lastActivity: { $lt: inactiveWarningThreshold, $gte: fifteenMinutesAgo },
        inactivityNotificationSent: { $ne: true }
      }).populate('adminUser', 'email firstName lastName');

      for (const session of inactiveSessions) {
        if (session.adminUser) {
          // TODO: Send inactivity warning
          // await emailService.sendInactivityWarning(session.adminUser.email, {
          //   firstName: session.adminUser.firstName,
          //   daysUntilExpiry: 3
          // });

          notifications.push({
            type: 'SESSION_EXPIRING',
            recipient: session.adminUser.email,
            sessionId: session._id
          });

          // Mark as notified
          session.inactivityNotificationSent = true;
          await session.save();

          logger.info('Session expiry notification queued', {
            userId: session.adminUser._id,
            email: session.adminUser.email
          });
        }
      }

      // 5. Notify about MFA setup for users without MFA
      const usersWithoutMFA = await AdminUser.find({
        isActive: true,
        mfaEnabled: false,
        role: { $in: ['super_admin', 'admin'] }, // Only for privileged users
        mfaReminderSent: { $ne: true },
        createdAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } // Account older than 7 days
      });

      for (const user of usersWithoutMFA) {
        // TODO: Send MFA setup reminder
        // await emailService.sendMFASetupReminder(user.email, {
        //   firstName: user.firstName
        // });

        notifications.push({
          type: 'MFA_SETUP_REMINDER',
          recipient: user.email,
          userId: user._id
        });

        // Mark as notified
        user.mfaReminderSent = true;
        await user.save();

        logger.info('MFA setup reminder notification queued', { userId: user._id, email: user.email });
      }

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        notificationsQueued: notifications.length,
        breakdown: {
          suspiciousSessions: notifications.filter(n => n.type === 'SUSPICIOUS_SESSION').length,
          passwordExpired: notifications.filter(n => n.type === 'PASSWORD_EXPIRED').length,
          criticalEvents: notifications.filter(n => n.type === 'CRITICAL_EVENT').length,
          sessionExpiring: notifications.filter(n => n.type === 'SESSION_EXPIRING').length,
          mfaReminders: notifications.filter(n => n.type === 'MFA_SETUP_REMINDER').length
        },
        duration: `${duration}ms`
      };

      logger.info('Notification job completed', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Notification job failed', {
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });

      return {
        success: false,
        error: error.message,
        duration: `${duration}ms`
      };
    }
  }

  /**
   * Get job configuration
   * @returns {Object} Job configuration
   * @static
   * @public
   */
  static getConfig() {
    return {
      name: this.jobName,
      schedule: this.schedule,
      execute: this.execute.bind(this),
      enabled: true,
      description: 'Process and send notifications to admin users'
    };
  }
}

module.exports = NotificationJob;
