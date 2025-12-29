/**
 * @fileoverview Report Generation Job
 * @module servers/admin-server/jobs/report-generation-job
 * @description Background job to generate periodic reports and analytics
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const AdminSession = require('../../../shared/lib/database/models/admin-server/admin-session');
const AdminAuditLog = require('../../../shared/lib/database/models/admin-server/admin-audit-log');
const AdminUser = require('../../../shared/lib/database/models/admin-server/admin-user');
const AdminAPIKey = require('../../../shared/lib/database/models/admin-server/admin-api-key');
const fs = require('fs').promises;
const path = require('path');

const logger = getLogger({ serviceName: 'report-generation-job' });

/**
 * Report Generation Job Class
 * @class ReportGenerationJob
 * @description Generates periodic reports and analytics
 */
class ReportGenerationJob {
  /**
   * Job name
   * @type {string}
   * @static
   */
  static jobName = 'report-generation';

  /**
   * Job schedule (cron expression)
   * Runs daily at 3 AM
   * @type {string}
   * @static
   */
  static schedule = '0 3 * * *'; // Daily at 3 AM

  /**
   * Report directory path
   * @type {string}
   * @static
   * @private
   */
  static #reportDir = process.env.REPORT_PATH || path.join(__dirname, '../../../logs/reports');

  /**
   * Execute the job
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async execute() {
    const startTime = Date.now();
    logger.info('Starting report generation job');

    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Generate daily report
      const report = {
        generatedAt: now.toISOString(),
        period: {
          start: yesterday.toISOString(),
          end: now.toISOString()
        },
        summary: {},
        users: {},
        sessions: {},
        security: {},
        apiUsage: {}
      };

      // User statistics
      const [totalUsers, activeUsers, newUsers, deactivatedUsers] = await Promise.all([
        AdminUser.countDocuments(),
        AdminUser.countDocuments({ isActive: true }),
        AdminUser.countDocuments({ createdAt: { $gte: yesterday } }),
        AdminUser.countDocuments({
          isActive: false,
          deactivatedAt: { $gte: yesterday }
        })
      ]);

      report.users = {
        totalUsers,
        activeUsers,
        newUsers,
        deactivatedUsers,
        usersByRole: await AdminUser.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ]),
        usersByDepartment: await AdminUser.aggregate([
          { $match: { department: { $exists: true, $ne: null } } },
          { $group: { _id: '$department', count: { $sum: 1 } } }
        ])
      };

      // Session statistics
      const [totalSessions, activeSessions, newSessions, revokedSessions] = await Promise.all([
        AdminSession.countDocuments(),
        AdminSession.countDocuments({ isActive: true }),
        AdminSession.countDocuments({ createdAt: { $gte: yesterday } }),
        AdminSession.countDocuments({
          isActive: false,
          revokedAt: { $gte: yesterday }
        })
      ]);

      report.sessions = {
        totalSessions,
        activeSessions,
        newSessions,
        revokedSessions,
        sessionsByDevice: await AdminSession.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$deviceInfo.deviceType', count: { $sum: 1 } } }
        ]),
        sessionsByCountry: await AdminSession.aggregate([
          { $match: { isActive: true, 'location.country': { $exists: true } } },
          { $group: { _id: '$location.country', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ])
      };

      // Security statistics
      const [failedLogins, suspiciousSessions, failedMFA] = await Promise.all([
        AdminAuditLog.countDocuments({
          action: 'auth.login',
          status: 'failure',
          createdAt: { $gte: yesterday }
        }),
        AdminSession.countDocuments({
          isSuspicious: true,
          createdAt: { $gte: yesterday }
        }),
        AdminAuditLog.countDocuments({
          action: 'auth.mfa.verify',
          status: 'failure',
          createdAt: { $gte: yesterday }
        })
      ]);

      report.security = {
        failedLogins,
        suspiciousSessions,
        failedMFA,
        securityEvents: await AdminAuditLog.aggregate([
          {
            $match: {
              action: { $regex: /^(security|auth|users\.delete|roles\.delete)/ },
              createdAt: { $gte: yesterday }
            }
          },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      };

      // API usage statistics
      const apiUsage = await AdminAuditLog.aggregate([
        {
          $match: {
            'metadata.apiKey': { $exists: true },
            createdAt: { $gte: yesterday }
          }
        },
        {
          $group: {
            _id: '$metadata.apiKey',
            requestCount: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
            },
            failureCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
            }
          }
        },
        { $sort: { requestCount: -1 } },
        { $limit: 10 }
      ]);

      report.apiUsage = {
        topAPIKeys: apiUsage,
        totalAPIRequests: apiUsage.reduce((sum, item) => sum + item.requestCount, 0)
      };

      // Activity summary
      const activityBreakdown = await AdminAuditLog.aggregate([
        {
          $match: { createdAt: { $gte: yesterday } }
        },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);

      report.summary = {
        totalActivities: await AdminAuditLog.countDocuments({
          createdAt: { $gte: yesterday }
        }),
        topActivities: activityBreakdown,
        successRate: await this.calculateSuccessRate(yesterday),
        peakHour: await this.calculatePeakHour(yesterday)
      };

      // Ensure report directory exists
      await fs.mkdir(this.#reportDir, { recursive: true });

      // Save report to file
      const reportDate = now.toISOString().split('T')[0];
      const reportFileName = `daily-report-${reportDate}.json`;
      const reportFilePath = path.join(this.#reportDir, reportFileName);

      await fs.writeFile(
        reportFilePath,
        JSON.stringify(report, null, 2),
        'utf8'
      );

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        reportFile: reportFilePath,
        reportDate,
        summary: {
          totalUsers: report.users.totalUsers,
          activeSessions: report.sessions.activeSessions,
          totalActivities: report.summary.totalActivities,
          securityAlerts: report.security.failedLogins + report.security.suspiciousSessions
        },
        duration: `${duration}ms`
      };

      logger.info('Report generation job completed', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Report generation job failed', {
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
   * Calculate success rate for the period
   * @param {Date} since - Start date
   * @returns {Promise<number>} Success rate percentage
   * @static
   * @private
   */
  static async calculateSuccessRate(since) {
    const [successCount, totalCount] = await Promise.all([
      AdminAuditLog.countDocuments({ status: 'success', createdAt: { $gte: since } }),
      AdminAuditLog.countDocuments({ createdAt: { $gte: since } })
    ]);

    return totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(2) : 0;
  }

  /**
   * Calculate peak activity hour
   * @param {Date} since - Start date
   * @returns {Promise<number>} Peak hour (0-23)
   * @static
   * @private
   */
  static async calculatePeakHour(since) {
    const hourlyActivity = await AdminAuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    return hourlyActivity.length > 0 ? hourlyActivity[0]._id : null;
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
      enabled: process.env.ENABLE_REPORTS !== 'false', // Enabled by default
      description: 'Generate periodic reports and analytics'
    };
  }
}

module.exports = ReportGenerationJob;
