/**
 * @fileoverview Token Cleanup Job
 * @module servers/admin-server/jobs/token-cleanup-job
 * @description Background job to clean up expired tokens and revoked credentials
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const AdminAPIKey = require('../../../shared/lib/database/models/admin-server/admin-api-key');
const AdminInvitation = require('../../../shared/lib/database/models/admin-server/admin-invitation');

const logger = getLogger({ serviceName: 'token-cleanup-job' });

/**
 * Token Cleanup Job Class
 * @class TokenCleanupJob
 * @description Cleans up expired tokens, API keys, and invitations
 */
class TokenCleanupJob {
  /**
   * Job name
   * @type {string}
   * @static
   */
  static jobName = 'token-cleanup';

  /**
   * Job schedule (cron expression)
   * Runs every 6 hours
   * @type {string}
   * @static
   */
  static schedule = '0 */6 * * *'; // Every 6 hours

  /**
   * Execute the job
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async execute() {
    const startTime = Date.now();
    logger.info('Starting token cleanup job');

    try {
      const now = new Date();

      // Clean up expired invitations
      const expiredInvitations = await AdminInvitation.find({
        status: 'pending',
        expiresAt: { $lt: now }
      });

      let invitationsExpired = 0;
      for (const invitation of expiredInvitations) {
        invitation.status = 'expired';
        await invitation.save();
        invitationsExpired++;
      }

      // Delete old invitations (accepted/expired/revoked older than 30 days)
      const deleteInvitationThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const deletedInvitations = await AdminInvitation.deleteMany({
        status: { $in: ['accepted', 'expired', 'revoked'] },
        createdAt: { $lt: deleteInvitationThreshold }
      });

      // Clean up revoked API keys (older than 30 days)
      const deleteAPIKeyThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const deletedAPIKeys = await AdminAPIKey.deleteMany({
        isActive: false,
        revokedAt: { $lt: deleteAPIKeyThreshold }
      });

      // Find and deactivate expired API keys
      const expiredAPIKeys = await AdminAPIKey.find({
        isActive: true,
        expiresAt: { $exists: true, $lt: now }
      });

      let apiKeysExpired = 0;
      for (const apiKey of expiredAPIKeys) {
        apiKey.isActive = false;
        apiKey.revokedAt = now;
        apiKey.revokeReason = 'expired';
        await apiKey.save();
        apiKeysExpired++;
      }

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        invitationsExpired,
        invitationsDeleted: deletedInvitations.deletedCount,
        apiKeysExpired,
        apiKeysDeleted: deletedAPIKeys.deletedCount,
        totalCleaned: invitationsExpired + deletedInvitations.deletedCount + apiKeysExpired + deletedAPIKeys.deletedCount,
        duration: `${duration}ms`
      };

      logger.info('Token cleanup job completed', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Token cleanup job failed', {
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
      description: 'Clean up expired tokens, API keys, and invitations'
    };
  }
}

module.exports = TokenCleanupJob;
