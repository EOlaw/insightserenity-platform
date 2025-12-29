/**
 * @fileoverview Security Monitoring Job
 * @module servers/admin-server/jobs/security-monitoring-job
 * @description Background job to monitor suspicious activities and security threats
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const AdminSession = require('../../../shared/lib/database/models/admin-server/admin-session');
const AdminAuditLog = require('../../../shared/lib/database/models/admin-server/admin-audit-log');
const AdminUser = require('../../../shared/lib/database/models/admin-server/admin-user');

const logger = getLogger({ serviceName: 'security-monitoring-job' });

/**
 * Security Monitoring Job Class
 * @class SecurityMonitoringJob
 * @description Monitors for suspicious activities and security threats
 */
class SecurityMonitoringJob {
  /**
   * Job name
   * @type {string}
   * @static
   */
  static jobName = 'security-monitoring';

  /**
   * Job schedule (cron expression)
   * Runs every 30 minutes
   * @type {string}
   * @static
   */
  static schedule = '*/30 * * * *'; // Every 30 minutes

  /**
   * Execute the job
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async execute() {
    const startTime = Date.now();
    logger.info('Starting security monitoring job');

    try {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const threats = [];

      // 1. Check for multiple failed login attempts
      const failedLogins = await AdminAuditLog.aggregate([
        {
          $match: {
            action: 'auth.login',
            status: 'failure',
            createdAt: { $gte: thirtyMinutesAgo }
          }
        },
        {
          $group: {
            _id: '$ipAddress',
            count: { $sum: 1 },
            emails: { $addToSet: '$metadata.email' }
          }
        },
        {
          $match: { count: { $gte: 5 } } // 5+ failed attempts
        }
      ]);

      if (failedLogins.length > 0) {
        threats.push({
          type: 'MULTIPLE_FAILED_LOGINS',
          severity: 'HIGH',
          count: failedLogins.length,
          details: failedLogins
        });
        logger.warn('Multiple failed login attempts detected', { count: failedLogins.length });
      }

      // 2. Check for suspicious session activity (multiple IPs for same user)
      const suspiciousSessions = await AdminSession.aggregate([
        {
          $match: {
            isActive: true,
            lastActivity: { $gte: thirtyMinutesAgo }
          }
        },
        {
          $group: {
            _id: '$adminUser',
            ipAddresses: { $addToSet: '$ipAddress' },
            count: { $sum: 1 }
          }
        },
        {
          $match: {
            $expr: { $gte: [{ $size: '$ipAddresses' }, 3] } // 3+ different IPs
          }
        }
      ]);

      if (suspiciousSessions.length > 0) {
        threats.push({
          type: 'MULTIPLE_IP_ADDRESSES',
          severity: 'MEDIUM',
          count: suspiciousSessions.length,
          details: suspiciousSessions
        });
        logger.warn('Suspicious session activity detected', { count: suspiciousSessions.length });
      }

      // 3. Check for unusual login locations
      const unusualLocations = await AdminSession.find({
        isActive: true,
        createdAt: { $gte: thirtyMinutesAgo },
        'location.country': { $exists: true, $ne: null }
      }).populate('adminUser', 'email lastKnownCountry');

      const locationThreats = unusualLocations.filter(session => {
        const user = session.adminUser;
        return user && user.lastKnownCountry && user.lastKnownCountry !== session.location.country;
      });

      if (locationThreats.length > 0) {
        threats.push({
          type: 'UNUSUAL_LOGIN_LOCATION',
          severity: 'MEDIUM',
          count: locationThreats.length,
          details: locationThreats.map(s => ({
            userId: s.adminUser._id,
            email: s.adminUser.email,
            newLocation: s.location.country,
            previousLocation: s.adminUser.lastKnownCountry
          }))
        });
        logger.warn('Unusual login locations detected', { count: locationThreats.length });
      }

      // 4. Check for privilege escalation attempts
      const privilegeEscalation = await AdminAuditLog.find({
        action: { $in: ['users.update', 'roles.update', 'permissions.add'] },
        createdAt: { $gte: thirtyMinutesAgo },
        'metadata.role': { $in: ['super_admin', 'admin'] }
      });

      if (privilegeEscalation.length > 5) {
        threats.push({
          type: 'PRIVILEGE_ESCALATION_ATTEMPTS',
          severity: 'HIGH',
          count: privilegeEscalation.length,
          details: privilegeEscalation.slice(0, 10) // First 10
        });
        logger.warn('Potential privilege escalation attempts detected', { count: privilegeEscalation.length });
      }

      // 5. Check for accounts with too many failed MFA attempts
      const failedMFA = await AdminAuditLog.aggregate([
        {
          $match: {
            action: 'auth.mfa.verify',
            status: 'failure',
            createdAt: { $gte: thirtyMinutesAgo }
          }
        },
        {
          $group: {
            _id: '$adminUser',
            count: { $sum: 1 }
          }
        },
        {
          $match: { count: { $gte: 5 } }
        }
      ]);

      if (failedMFA.length > 0) {
        threats.push({
          type: 'MULTIPLE_FAILED_MFA',
          severity: 'HIGH',
          count: failedMFA.length,
          details: failedMFA
        });
        logger.warn('Multiple failed MFA attempts detected', { count: failedMFA.length });

        // Auto-lock accounts with excessive failed MFA attempts
        for (const record of failedMFA) {
          if (record.count >= 10) {
            await AdminUser.findByIdAndUpdate(record._id, {
              $set: { isActive: false, lockedReason: 'excessive_failed_mfa' }
            });
            logger.error('Account auto-locked due to excessive failed MFA attempts', { userId: record._id });
          }
        }
      }

      // 6. Check for API key abuse (high usage in short time)
      const apiKeyAbuse = await AdminAuditLog.aggregate([
        {
          $match: {
            'metadata.apiKey': { $exists: true },
            createdAt: { $gte: thirtyMinutesAgo }
          }
        },
        {
          $group: {
            _id: '$metadata.apiKey',
            count: { $sum: 1 }
          }
        },
        {
          $match: { count: { $gte: 1000 } } // 1000+ requests in 30 min
        }
      ]);

      if (apiKeyAbuse.length > 0) {
        threats.push({
          type: 'API_KEY_ABUSE',
          severity: 'HIGH',
          count: apiKeyAbuse.length,
          details: apiKeyAbuse
        });
        logger.warn('Potential API key abuse detected', { count: apiKeyAbuse.length });
      }

      // Create security alert log if threats detected
      if (threats.length > 0) {
        await AdminAuditLog.create({
          action: 'security.threat_detected',
          resourceType: 'security',
          status: 'warning',
          metadata: {
            threatCount: threats.length,
            threats: threats,
            scannedPeriod: '30 minutes'
          }
        });
      }

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        threatsDetected: threats.length,
        threats: threats,
        duration: `${duration}ms`
      };

      if (threats.length > 0) {
        logger.warn('Security monitoring job completed with threats', result);
      } else {
        logger.info('Security monitoring job completed - no threats detected', { duration: `${duration}ms` });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Security monitoring job failed', {
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
      description: 'Monitor for suspicious activities and security threats'
    };
  }
}

module.exports = SecurityMonitoringJob;
