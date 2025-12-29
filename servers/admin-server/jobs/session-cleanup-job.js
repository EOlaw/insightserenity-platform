/**
 * @fileoverview Session Cleanup Job
 * @module servers/admin-server/jobs/session-cleanup-job
 * @description Background job to clean up expired and inactive sessions
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const AdminSession = require('../../../shared/lib/database/models/admin-server/admin-session');

const logger = getLogger({ serviceName: 'session-cleanup-job' });

/**
 * Session Cleanup Job Class
 * @class SessionCleanupJob
 * @description Cleans up expired and inactive sessions
 */
class SessionCleanupJob {
  /**
   * Job name
   * @type {string}
   * @static
   */
  static jobName = 'session-cleanup';

  /**
   * Job schedule (cron expression)
   * Runs every hour
   * @type {string}
   * @static
   */
  static schedule = '0 * * * *'; // Every hour

  /**
   * Execute the job
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async execute() {
    const startTime = Date.now();
    logger.info('Starting session cleanup job');

    try {
      const now = new Date();

      // Find and deactivate expired sessions
      const expiredSessions = await AdminSession.find({
        isActive: true,
        expiresAt: { $lt: now }
      });

      let expiredCount = 0;
      for (const session of expiredSessions) {
        session.isActive = false;
        session.revokedAt = now;
        session.revokeReason = 'expired';
        await session.save();
        expiredCount++;
      }

      // Find and deactivate inactive sessions (no activity for 30 days)
      const inactiveThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const inactiveSessions = await AdminSession.find({
        isActive: true,
        lastActivity: { $lt: inactiveThreshold }
      });

      let inactiveCount = 0;
      for (const session of inactiveSessions) {
        session.isActive = false;
        session.revokedAt = now;
        session.revokeReason = 'inactive';
        await session.save();
        inactiveCount++;
      }

      // Delete very old sessions (older than 90 days)
      const deleteThreshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const deleteResult = await AdminSession.deleteMany({
        createdAt: { $lt: deleteThreshold }
      });

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        expiredSessionsCleaned: expiredCount,
        inactiveSessionsCleaned: inactiveCount,
        oldSessionsDeleted: deleteResult.deletedCount,
        totalCleaned: expiredCount + inactiveCount + deleteResult.deletedCount,
        duration: `${duration}ms`
      };

      logger.info('Session cleanup job completed', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Session cleanup job failed', {
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
      description: 'Clean up expired and inactive sessions'
    };
  }
}

module.exports = SessionCleanupJob;
