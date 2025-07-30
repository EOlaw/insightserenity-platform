'use strict';

/**
 * @fileoverview Enhanced logger for admin operations with audit trail integration
 * @module servers/admin-server/utils/admin-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:servers/admin-server/config
 */

const Logger = require('../../../shared/lib/utils/logger');
const AuditLogModel = require('../../../shared/lib/database/models/audit-log-model');
const config = require('../config');
const crypto = require('crypto');

/**
 * @class AdminLogger
 * @description Enhanced logger for administrative operations with security and compliance features
 */
class AdminLogger {
  /**
   * @private
   * @static
   * @type {Logger}
   */
  static #baseLogger = Logger.child({
    service: 'admin-server',
    component: 'admin-operations'
  });

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    enableAuditLog: config.logging?.enableAuditLog !== false,
    enableSecurityAlerts: config.logging?.enableSecurityAlerts !== false,
    enableComplianceLog: config.logging?.enableComplianceLog !== false,
    redactSensitiveData: config.logging?.redactSensitiveData !== false,
    retentionDays: config.logging?.retentionDays || 365,
    criticalActionsWebhook: config.logging?.criticalActionsWebhook,
    sensitiveFields: [
      'password', 'token', 'apiKey', 'secret', 'privateKey',
      'ssn', 'creditCard', 'bankAccount', 'taxId'
    ]
  };

  /**
   * @private
   * @static
   * @type {Map<string, number>}
   */
  static #actionMetrics = new Map();

  /**
   * Log admin action with enhanced tracking
   * @static
   * @param {string} action - Action performed
   * @param {Object} context - Action context
   * @param {Object} [options={}] - Logging options
   * @returns {Promise<void>}
   */
  static async logAction(action, context, options = {}) {
    const {
      userId,
      organizationId,
      resource,
      resourceId,
      method,
      ip,
      userAgent,
      changes,
      metadata = {}
    } = context;

    const actionId = crypto.randomUUID();
    const timestamp = new Date();

    // Log to standard logger
    this.#baseLogger.info(`Admin action: ${action}`, {
      actionId,
      action,
      userId,
      organizationId,
      resource,
      resourceId,
      method,
      ip,
      metadata,
      timestamp
    });

    // Track metrics
    this.#trackActionMetrics(action);

    // Create audit log entry
    if (this.#config.enableAuditLog) {
      try {
        await AuditLogModel.create({
          actionId,
          action,
          userId,
          organizationId,
          resource,
          resourceId,
          method,
          ip,
          userAgent,
          changes: this.#sanitizeChanges(changes),
          metadata: this.#sanitizeMetadata(metadata),
          severity: options.severity || 'info',
          timestamp
        });
      } catch (error) {
        this.#baseLogger.error('Failed to create audit log', error, {
          actionId,
          action
        });
      }
    }

    // Send security alert for critical actions
    if (options.critical && this.#config.enableSecurityAlerts) {
      await this.#sendSecurityAlert(action, context, actionId);
    }

    // Compliance logging for regulated data
    if (options.compliance && this.#config.enableComplianceLog) {
      await this.#logCompliance(action, context, actionId);
    }
  }

  /**
   * Log security event
   * @static
   * @param {string} event - Security event type
   * @param {Object} details - Event details
   * @param {string} [severity='warning'] - Event severity
   * @returns {Promise<void>}
   */
  static async logSecurityEvent(event, details, severity = 'warning') {
    const eventId = crypto.randomUUID();
    
    this.#baseLogger[severity](`Security event: ${event}`, {
      eventId,
      event,
      severity,
      ...this.#sanitizeMetadata(details)
    });

    if (this.#config.enableAuditLog) {
      try {
        await AuditLogModel.create({
          actionId: eventId,
          action: `security.${event}`,
          userId: details.userId,
          ip: details.ip,
          userAgent: details.userAgent,
          metadata: {
            ...this.#sanitizeMetadata(details),
            securityEvent: true
          },
          severity,
          timestamp: new Date()
        });
      } catch (error) {
        this.#baseLogger.error('Failed to log security event', error, {
          eventId,
          event
        });
      }
    }

    // Alert on critical security events
    if (severity === 'error' || severity === 'critical') {
      await this.#sendSecurityAlert(event, details, eventId);
    }
  }

  /**
   * Log performance metrics for admin operations
   * @static
   * @param {string} operation - Operation name
   * @param {number} duration - Operation duration in ms
   * @param {Object} [metadata={}] - Additional metadata
   */
  static logPerformance(operation, duration, metadata = {}) {
    this.#baseLogger.info(`Admin performance metric`, {
      operation,
      duration,
      durationMs: duration,
      ...metadata,
      timestamp: new Date()
    });

    // Update operation metrics
    const metrics = this.#actionMetrics.get(operation) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
      maxDuration: 0,
      minDuration: Infinity
    };

    metrics.count++;
    metrics.totalDuration += duration;
    metrics.avgDuration = metrics.totalDuration / metrics.count;
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.minDuration = Math.min(metrics.minDuration, duration);

    this.#actionMetrics.set(operation, metrics);
  }

  /**
   * Log data access for compliance
   * @static
   * @param {Object} access - Access details
   * @returns {Promise<void>}
   */
  static async logDataAccess(access) {
    const {
      userId,
      dataType,
      recordIds,
      purpose,
      fields,
      exportFormat
    } = access;

    await this.logAction('data.access', {
      userId,
      resource: dataType,
      metadata: {
        recordCount: recordIds?.length,
        fields: fields?.length,
        purpose,
        exportFormat,
        timestamp: new Date()
      }
    }, {
      compliance: true
    });
  }

  /**
   * Get action metrics
   * @static
   * @param {string} [action] - Specific action or all if not provided
   * @returns {Object} Action metrics
   */
  static getMetrics(action) {
    if (action) {
      return this.#actionMetrics.get(action) || null;
    }
    
    return Object.fromEntries(this.#actionMetrics);
  }

  /**
   * Clear old logs based on retention policy
   * @static
   * @returns {Promise<number>} Number of logs cleared
   */
  static async clearOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.#config.retentionDays);

    try {
      const result = await AuditLogModel.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      
      this.#baseLogger.info('Cleared old audit logs', {
        count: result.deletedCount,
        cutoffDate
      });
      
      return result.deletedCount;
    } catch (error) {
      this.#baseLogger.error('Failed to clear old logs', error);
      throw error;
    }
  }

  /**
   * Track action metrics
   * @private
   * @static
   * @param {string} action - Action name
   */
  static #trackActionMetrics(action) {
    const metrics = this.#actionMetrics.get(action) || {
      count: 0,
      lastExecuted: null,
      firstExecuted: null
    };

    metrics.count++;
    metrics.lastExecuted = new Date();
    if (!metrics.firstExecuted) {
      metrics.firstExecuted = new Date();
    }

    this.#actionMetrics.set(action, metrics);
  }

  /**
   * Sanitize sensitive data from changes
   * @private
   * @static
   * @param {Object} changes - Data changes
   * @returns {Object} Sanitized changes
   */
  static #sanitizeChanges(changes) {
    if (!changes || !this.#config.redactSensitiveData) {
      return changes;
    }

    const sanitized = { ...changes };
    
    // Redact old and new values
    ['old', 'new'].forEach(key => {
      if (sanitized[key] && typeof sanitized[key] === 'object') {
        sanitized[key] = this.#redactObject(sanitized[key]);
      }
    });

    return sanitized;
  }

  /**
   * Sanitize metadata
   * @private
   * @static
   * @param {Object} metadata - Metadata object
   * @returns {Object} Sanitized metadata
   */
  static #sanitizeMetadata(metadata) {
    if (!metadata || !this.#config.redactSensitiveData) {
      return metadata;
    }

    return this.#redactObject(metadata);
  }

  /**
   * Redact sensitive fields from object
   * @private
   * @static
   * @param {Object} obj - Object to redact
   * @returns {Object} Redacted object
   */
  static #redactObject(obj) {
    const redacted = { ...obj };
    
    Object.keys(redacted).forEach(key => {
      const lowerKey = key.toLowerCase();
      
      // Check if field is sensitive
      if (this.#config.sensitiveFields.some(field => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        // Recursively redact nested objects
        redacted[key] = this.#redactObject(redacted[key]);
      }
    });

    return redacted;
  }

  /**
   * Send security alert
   * @private
   * @static
   * @async
   * @param {string} action - Action that triggered alert
   * @param {Object} context - Action context
   * @param {string} actionId - Action ID
   */
  static async #sendSecurityAlert(action, context, actionId) {
    try {
      if (this.#config.criticalActionsWebhook) {
        // Send webhook notification
        // Implementation would depend on notification service
        this.#baseLogger.info('Security alert sent', {
          actionId,
          action,
          webhook: this.#config.criticalActionsWebhook
        });
      }
    } catch (error) {
      this.#baseLogger.error('Failed to send security alert', error, {
        actionId,
        action
      });
    }
  }

  /**
   * Log compliance information
   * @private
   * @static
   * @async
   * @param {string} action - Compliance action
   * @param {Object} context - Action context
   * @param {string} actionId - Action ID
   */
  static async #logCompliance(action, context, actionId) {
    try {
      await AuditLogModel.create({
        actionId,
        action: `compliance.${action}`,
        userId: context.userId,
        organizationId: context.organizationId,
        resource: context.resource,
        metadata: {
          ...context.metadata,
          complianceLog: true,
          regulations: context.regulations || ['GDPR', 'HIPAA', 'SOX']
        },
        severity: 'info',
        timestamp: new Date()
      });
    } catch (error) {
      this.#baseLogger.error('Failed to log compliance', error, {
        actionId,
        action
      });
    }
  }

  // Delegate standard logging methods to base logger
  static error(message, error, meta = {}) {
    this.#baseLogger.error(message, error, { component: 'admin', ...meta });
  }

  static warn(message, meta = {}) {
    this.#baseLogger.warn(message, { component: 'admin', ...meta });
  }

  static info(message, meta = {}) {
    this.#baseLogger.info(message, { component: 'admin', ...meta });
  }

  static debug(message, meta = {}) {
    this.#baseLogger.debug(message, { component: 'admin', ...meta });
  }

  static http(message, meta = {}) {
    this.#baseLogger.http(message, { component: 'admin', ...meta });
  }
}

module.exports = AdminLogger;