/**
 * @fileoverview Audit Log Archival Job
 * @module servers/admin-server/jobs/audit-log-archival-job
 * @description Background job to archive old audit logs for compliance
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const AdminAuditLog = require('../../../shared/lib/database/models/admin-server/admin-audit-log');
const fs = require('fs').promises;
const path = require('path');

const logger = getLogger({ serviceName: 'audit-log-archival-job' });

/**
 * Audit Log Archival Job Class
 * @class AuditLogArchivalJob
 * @description Archives old audit logs to maintain database performance
 */
class AuditLogArchivalJob {
  /**
   * Job name
   * @type {string}
   * @static
   */
  static jobName = 'audit-log-archival';

  /**
   * Job schedule (cron expression)
   * Runs daily at 2 AM
   * @type {string}
   * @static
   */
  static schedule = '0 2 * * *'; // Daily at 2 AM

  /**
   * Archive directory path
   * @type {string}
   * @static
   * @private
   */
  static #archiveDir = process.env.AUDIT_ARCHIVE_PATH || path.join(__dirname, '../../../logs/audit-archives');

  /**
   * Execute the job
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async execute() {
    const startTime = Date.now();
    logger.info('Starting audit log archival job');

    try {
      // Archive logs older than 90 days
      const archiveThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      // Find logs to archive
      const logsToArchive = await AdminAuditLog.find({
        createdAt: { $lt: archiveThreshold }
      }).lean();

      if (logsToArchive.length === 0) {
        logger.info('No audit logs to archive');
        return {
          success: true,
          logsArchived: 0,
          message: 'No logs to archive'
        };
      }

      // Ensure archive directory exists
      await fs.mkdir(this.#archiveDir, { recursive: true });

      // Create archive file with timestamp
      const archiveDate = new Date().toISOString().split('T')[0];
      const archiveFileName = `audit-logs-${archiveDate}.json`;
      const archiveFilePath = path.join(this.#archiveDir, archiveFileName);

      // Write logs to archive file
      await fs.writeFile(
        archiveFilePath,
        JSON.stringify(logsToArchive, null, 2),
        'utf8'
      );

      // Delete archived logs from database
      const logIds = logsToArchive.map(log => log._id);
      const deleteResult = await AdminAuditLog.deleteMany({
        _id: { $in: logIds }
      });

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        logsArchived: deleteResult.deletedCount,
        archiveFile: archiveFilePath,
        archiveThreshold: archiveThreshold.toISOString(),
        duration: `${duration}ms`
      };

      logger.info('Audit log archival job completed', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Audit log archival job failed', {
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
      enabled: process.env.ENABLE_AUDIT_ARCHIVAL !== 'false', // Enabled by default
      description: 'Archive old audit logs for compliance'
    };
  }
}

module.exports = AuditLogArchivalJob;
