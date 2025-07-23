'use strict';

/**
 * @fileoverview Main audit service for centralized audit logging and management
 * @module shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/audit/audit-logger
 * @requires module:shared/lib/security/audit/audit-events
 * @requires module:shared/lib/security/audit/compliance-reporter
 * @requires module:shared/lib/security/audit/audit-trail
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const AuditLogger = require('./audit-logger');
const AuditEvents = require('./audit-events');
const ComplianceReporter = require('./compliance-reporter');
const AuditTrail = require('./audit-trail');
const EncryptionService = require('../encryption/encryption-service');

/**
 * @class AuditService
 * @description Central audit service managing all audit operations, compliance reporting, and security event tracking
 */
class AuditService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #RISK_LEVELS = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  };

  static #BATCH_SIZE = 100;
  static #FLUSH_INTERVAL = 30000; // 30 seconds
  static #MAX_QUEUE_SIZE = 1000;
  static #RETENTION_DAYS = 365;

  /**
   * Creates an instance of AuditService
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {boolean} [options.enableEncryption=true] - Enable audit log encryption
   * @param {boolean} [options.enableBatching=true] - Enable batch processing
   * @param {number} [options.batchSize=100] - Batch size for bulk operations
   * @param {number} [options.flushInterval=30000] - Flush interval in milliseconds
   * @param {boolean} [options.enableCompliance=true] - Enable compliance reporting
   * @param {Object} [options.complianceConfig] - Compliance configuration
   * @param {boolean} [options.enableRiskScoring=true] - Enable automatic risk scoring
   * @param {Object} [options.retentionPolicy] - Data retention policy
   */
  constructor(options = {}) {
    const {
      database,
      enableEncryption = true,
      enableBatching = true,
      batchSize = AuditService.#BATCH_SIZE,
      flushInterval = AuditService.#FLUSH_INTERVAL,
      enableCompliance = true,
      complianceConfig = {},
      enableRiskScoring = true,
      retentionPolicy = { days: AuditService.#RETENTION_DAYS }
    } = options;

    this.database = database;
    this.enableEncryption = enableEncryption;
    this.enableBatching = enableBatching;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.enableCompliance = enableCompliance;
    this.enableRiskScoring = enableRiskScoring;
    this.retentionPolicy = retentionPolicy;

    // Initialize sub-services
    this.auditLogger = new AuditLogger({
      database,
      enableEncryption,
      batchSize
    });

    this.auditTrail = new AuditTrail({
      database,
      enableEncryption
    });

    if (enableCompliance) {
      this.complianceReporter = new ComplianceReporter({
        database,
        ...complianceConfig
      });
    }

    if (enableEncryption) {
      this.encryptionService = new EncryptionService({
        algorithm: 'aes-256-gcm'
      });
    }

    // Initialize batch queue
    this.auditQueue = [];
    this.isProcessing = false;

    // Start batch processing
    if (enableBatching) {
      this.flushTimer = setInterval(() => {
        this.#flushQueue();
      }, this.flushInterval);
    }

    // Initialize risk scoring rules
    this.riskRules = this.#initializeRiskRules();

    logger.info('AuditService initialized', {
      enableEncryption,
      enableBatching,
      enableCompliance,
      enableRiskScoring
    });
  }

  /**
   * Logs an audit event
   * @param {Object} event - Audit event details
   * @param {string} event.eventType - Type of event (from AuditEvents)
   * @param {string} event.userId - User who triggered the event
   * @param {string} event.tenantId - Tenant identifier
   * @param {string} event.resource - Resource affected
   * @param {string} event.action - Action performed
   * @param {Object} [event.metadata] - Additional event metadata
   * @param {string} [event.correlationId] - Correlation ID for tracking
   * @param {Object} [event.context] - Request context
   * @returns {Promise<Object>} Logged event with ID
   */
  async logEvent(event) {
    try {
      const {
        eventType,
        userId,
        tenantId,
        resource,
        action,
        metadata = {},
        correlationId,
        context = {}
      } = event;

      // Validate required fields
      if (!eventType || !userId || !resource || !action) {
        throw new AppError('Missing required audit event fields', 400, 'INVALID_AUDIT_EVENT');
      }

      // Validate event type
      if (!this.#isValidEventType(eventType)) {
        throw new AppError('Invalid event type', 400, 'INVALID_EVENT_TYPE');
      }

      // Build audit entry
      const auditEntry = {
        id: this.#generateAuditId(),
        timestamp: new Date().toISOString(),
        eventType,
        userId,
        tenantId,
        resource,
        action,
        result: event.result || 'success',
        metadata: this.#sanitizeMetadata(metadata),
        correlationId: correlationId || this.#generateCorrelationId(),
        context: {
          ip: context.ip,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          requestId: context.requestId,
          ...context
        },
        version: '1.0'
      };

      // Calculate risk score if enabled
      if (this.enableRiskScoring) {
        auditEntry.riskScore = this.#calculateRiskScore(auditEntry);
        auditEntry.riskLevel = this.#getRiskLevel(auditEntry.riskScore);
      }

      // Add compliance tags if enabled
      if (this.enableCompliance) {
        auditEntry.complianceTags = await this.#getComplianceTags(auditEntry);
      }

      // Queue or log immediately
      if (this.enableBatching) {
        await this.#queueAuditEntry(auditEntry);
      } else {
        await this.auditLogger.log(auditEntry);
      }

      // Trigger high-risk alerts
      if (auditEntry.riskLevel === AuditService.#RISK_LEVELS.CRITICAL) {
        this.#triggerSecurityAlert(auditEntry);
      }

      logger.debug('Audit event logged', {
        auditId: auditEntry.id,
        eventType,
        riskLevel: auditEntry.riskLevel
      });

      return {
        id: auditEntry.id,
        timestamp: auditEntry.timestamp,
        correlationId: auditEntry.correlationId,
        riskLevel: auditEntry.riskLevel
      };

    } catch (error) {
      logger.error('Failed to log audit event', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to log audit event',
        500,
        'AUDIT_LOG_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Logs a security event with enhanced tracking
   * @param {Object} securityEvent - Security event details
   * @returns {Promise<Object>} Security audit result
   */
  async logSecurityEvent(securityEvent) {
    try {
      const {
        type,
        severity,
        threat,
        userId,
        source,
        target,
        description,
        indicators
      } = securityEvent;

      const auditEvent = {
        eventType: AuditEvents.SECURITY.THREAT_DETECTED,
        userId: userId || 'system',
        tenantId: securityEvent.tenantId,
        resource: target || 'system',
        action: type,
        metadata: {
          severity,
          threat,
          source,
          description,
          indicators,
          detectedAt: new Date().toISOString()
        },
        context: securityEvent.context
      };

      // Log with elevated priority
      const result = await this.logEvent(auditEvent);

      // Report to compliance if critical
      if (severity === 'critical' && this.enableCompliance) {
        await this.complianceReporter.reportSecurityIncident({
          auditId: result.id,
          ...securityEvent
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to log security event', error);
      throw error;
    }
  }

  /**
   * Logs a batch of audit events
   * @param {Array<Object>} events - Array of audit events
   * @returns {Promise<Object>} Batch operation result
   */
  async logBatch(events) {
    try {
      if (!Array.isArray(events) || events.length === 0) {
        throw new AppError('Invalid event batch', 400, 'INVALID_BATCH');
      }

      const results = {
        total: events.length,
        succeeded: 0,
        failed: 0,
        errors: []
      };

      // Process events in chunks
      const chunks = this.#chunkArray(events, this.batchSize);

      for (const chunk of chunks) {
        const processedEvents = [];

        for (const event of chunk) {
          try {
            const auditEntry = await this.#prepareAuditEntry(event);
            processedEvents.push(auditEntry);
            results.succeeded++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              event,
              error: error.message
            });
          }
        }

        if (processedEvents.length > 0) {
          await this.auditLogger.logBatch(processedEvents);
        }
      }

      logger.info('Batch audit log completed', results);

      return results;

    } catch (error) {
      logger.error('Batch audit log failed', error);

      throw new AppError(
        'Failed to log audit batch',
        500,
        'BATCH_AUDIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Retrieves audit logs based on filters
   * @param {Object} filters - Query filters
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Audit logs and metadata
   */
  async getAuditLogs(filters, options = {}) {
    try {
      return await this.auditTrail.query(filters, options);
    } catch (error) {
      logger.error('Failed to retrieve audit logs', error);
      throw error;
    }
  }

  /**
   * Generates compliance report
   * @param {Object} criteria - Report criteria
   * @returns {Promise<Object>} Compliance report
   */
  async generateComplianceReport(criteria) {
    try {
      if (!this.enableCompliance) {
        throw new AppError('Compliance reporting is not enabled', 400, 'COMPLIANCE_DISABLED');
      }

      return await this.complianceReporter.generateReport(criteria);

    } catch (error) {
      logger.error('Failed to generate compliance report', error);
      throw error;
    }
  }

  /**
   * Archives old audit logs
   * @param {Object} [criteria={}] - Archive criteria
   * @returns {Promise<Object>} Archive operation result
   */
  async archiveAuditLogs(criteria = {}) {
    try {
      const cutoffDate = criteria.cutoffDate || 
        new Date(Date.now() - this.retentionPolicy.days * 24 * 60 * 60 * 1000);

      const result = await this.auditLogger.archive({
        before: cutoffDate,
        ...criteria
      });

      logger.info('Audit logs archived', result);

      return result;

    } catch (error) {
      logger.error('Failed to archive audit logs', error);

      throw new AppError(
        'Failed to archive audit logs',
        500,
        'ARCHIVE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Exports audit logs
   * @param {Object} criteria - Export criteria
   * @param {string} format - Export format (json, csv, etc.)
   * @returns {Promise<Object>} Export result
   */
  async exportAuditLogs(criteria, format = 'json') {
    try {
      const logs = await this.auditTrail.query(criteria, { limit: 10000 });

      const exportData = {
        exportDate: new Date().toISOString(),
        criteria,
        recordCount: logs.total,
        logs: logs.data
      };

      if (format === 'csv') {
        return this.#convertToCSV(exportData);
      }

      return exportData;

    } catch (error) {
      logger.error('Failed to export audit logs', error);

      throw new AppError(
        'Failed to export audit logs',
        500,
        'EXPORT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Analyzes audit patterns
   * @param {Object} criteria - Analysis criteria
   * @returns {Promise<Object>} Analysis results
   */
  async analyzePatterns(criteria) {
    try {
      const { timeRange, userId, tenantId, eventTypes } = criteria;

      const logs = await this.auditTrail.query({
        startDate: timeRange.start,
        endDate: timeRange.end,
        userId,
        tenantId,
        eventTypes
      }, { limit: 5000 });

      const analysis = {
        timeRange,
        totalEvents: logs.total,
        eventDistribution: this.#analyzeEventDistribution(logs.data),
        userActivity: this.#analyzeUserActivity(logs.data),
        riskTrends: this.#analyzeRiskTrends(logs.data),
        anomalies: await this.#detectAnomalies(logs.data),
        recommendations: []
      };

      // Generate recommendations based on analysis
      analysis.recommendations = this.#generateRecommendations(analysis);

      return analysis;

    } catch (error) {
      logger.error('Failed to analyze audit patterns', error);

      throw new AppError(
        'Failed to analyze patterns',
        500,
        'ANALYSIS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates event type
   * @private
   * @param {string} eventType - Event type to validate
   * @returns {boolean} True if valid
   */
  #isValidEventType(eventType) {
    const validTypes = Object.values(AuditEvents).reduce((acc, category) => {
      return acc.concat(Object.values(category));
    }, []);

    return validTypes.includes(eventType);
  }

  /**
   * Sanitizes metadata to prevent injection
   * @private
   * @param {Object} metadata - Metadata to sanitize
   * @returns {Object} Sanitized metadata
   */
  #sanitizeMetadata(metadata) {
    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        sanitized[key] = value.replace(/[<>]/g, '');
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.#sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Calculates risk score for audit event
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {number} Risk score (0-100)
   */
  #calculateRiskScore(auditEntry) {
    let score = 0;

    // Check event type risk
    const eventRisk = this.riskRules.eventTypes[auditEntry.eventType] || 0;
    score += eventRisk;

    // Check action risk
    const actionRisk = this.riskRules.actions[auditEntry.action] || 0;
    score += actionRisk;

    // Check for suspicious patterns
    if (auditEntry.context.ip && this.#isSuspiciousIP(auditEntry.context.ip)) {
      score += 20;
    }

    // Check time-based anomalies
    const hour = new Date(auditEntry.timestamp).getHours();
    if (hour < 6 || hour > 22) {
      score += 10; // After hours activity
    }

    // Check result
    if (auditEntry.result === 'failure') {
      score += 15;
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Gets risk level from score
   * @private
   * @param {number} score - Risk score
   * @returns {string} Risk level
   */
  #getRiskLevel(score) {
    if (score >= 80) return AuditService.#RISK_LEVELS.CRITICAL;
    if (score >= 60) return AuditService.#RISK_LEVELS.HIGH;
    if (score >= 40) return AuditService.#RISK_LEVELS.MEDIUM;
    if (score >= 20) return AuditService.#RISK_LEVELS.LOW;
    return AuditService.#RISK_LEVELS.INFO;
  }

  /**
   * Gets compliance tags for event
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {Promise<Array>} Compliance tags
   */
  async #getComplianceTags(auditEntry) {
    const tags = [];

    // GDPR tags
    if (this.#isGDPRRelevant(auditEntry)) {
      tags.push('GDPR');
    }

    // HIPAA tags
    if (this.#isHIPAARelevant(auditEntry)) {
      tags.push('HIPAA');
    }

    // SOX tags
    if (this.#isSOXRelevant(auditEntry)) {
      tags.push('SOX');
    }

    // PCI DSS tags
    if (this.#isPCIDSSRelevant(auditEntry)) {
      tags.push('PCI-DSS');
    }

    return tags;
  }

  /**
   * Queues audit entry for batch processing
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {Promise<void>}
   */
  async #queueAuditEntry(auditEntry) {
    this.auditQueue.push(auditEntry);

    // Flush if queue is full
    if (this.auditQueue.length >= this.#MAX_QUEUE_SIZE) {
      await this.#flushQueue();
    }
  }

  /**
   * Flushes audit queue
   * @private
   * @returns {Promise<void>}
   */
  async #flushQueue() {
    if (this.isProcessing || this.auditQueue.length === 0) {
      return;
    }

    try {
      this.isProcessing = true;

      const entries = this.auditQueue.splice(0, this.batchSize);
      
      if (entries.length > 0) {
        await this.auditLogger.logBatch(entries);
        
        logger.debug('Audit queue flushed', { count: entries.length });
      }

    } catch (error) {
      logger.error('Failed to flush audit queue', error);
      // Re-queue failed entries
      this.auditQueue.unshift(...entries);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Prepares audit entry with all required fields
   * @private
   * @param {Object} event - Raw event
   * @returns {Promise<Object>} Prepared audit entry
   */
  async #prepareAuditEntry(event) {
    const auditEntry = {
      id: this.#generateAuditId(),
      timestamp: new Date().toISOString(),
      ...event
    };

    if (this.enableRiskScoring && !auditEntry.riskScore) {
      auditEntry.riskScore = this.#calculateRiskScore(auditEntry);
      auditEntry.riskLevel = this.#getRiskLevel(auditEntry.riskScore);
    }

    if (this.enableCompliance && !auditEntry.complianceTags) {
      auditEntry.complianceTags = await this.#getComplianceTags(auditEntry);
    }

    return auditEntry;
  }

  /**
   * Triggers security alert for critical events
   * @private
   * @param {Object} auditEntry - Audit entry
   */
  #triggerSecurityAlert(auditEntry) {
    // This would integrate with alerting system
    logger.warn('SECURITY ALERT', {
      auditId: auditEntry.id,
      eventType: auditEntry.eventType,
      riskScore: auditEntry.riskScore,
      userId: auditEntry.userId,
      resource: auditEntry.resource
    });
  }

  /**
   * Initializes risk scoring rules
   * @private
   * @returns {Object} Risk rules
   */
  #initializeRiskRules() {
    return {
      eventTypes: {
        [AuditEvents.AUTH.LOGIN_FAILURE]: 30,
        [AuditEvents.AUTH.MFA_BYPASS]: 80,
        [AuditEvents.AUTH.PRIVILEGE_ESCALATION]: 90,
        [AuditEvents.SECURITY.THREAT_DETECTED]: 85,
        [AuditEvents.SECURITY.UNAUTHORIZED_ACCESS]: 75,
        [AuditEvents.DATA.EXPORT]: 40,
        [AuditEvents.DATA.MASS_DELETE]: 70,
        [AuditEvents.CONFIG.SECURITY_CHANGE]: 60,
        [AuditEvents.USER.ROLE_CHANGE]: 50
      },
      actions: {
        'delete': 20,
        'export': 15,
        'modify': 10,
        'create': 5,
        'read': 0
      }
    };
  }

  /**
   * Checks if IP is suspicious
   * @private
   * @param {string} ip - IP address
   * @returns {boolean} True if suspicious
   */
  #isSuspiciousIP(ip) {
    // Simplified check - in production would use threat intelligence
    const suspiciousPatterns = [
      /^10\./, // Private network accessing public resources
      /^192\.168\./, // Private network
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./ // Private network
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  /**
   * Checks GDPR relevance
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {boolean} True if GDPR relevant
   */
  #isGDPRRelevant(auditEntry) {
    const gdprEvents = [
      AuditEvents.DATA.ACCESS,
      AuditEvents.DATA.EXPORT,
      AuditEvents.DATA.DELETE,
      AuditEvents.USER.PROFILE_UPDATE,
      AuditEvents.USER.CONSENT_CHANGE
    ];

    return gdprEvents.includes(auditEntry.eventType);
  }

  /**
   * Checks HIPAA relevance
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {boolean} True if HIPAA relevant
   */
  #isHIPAARelevant(auditEntry) {
    return auditEntry.metadata?.dataType === 'PHI' ||
           auditEntry.resource?.includes('medical') ||
           auditEntry.resource?.includes('health');
  }

  /**
   * Checks SOX relevance
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {boolean} True if SOX relevant
   */
  #isSOXRelevant(auditEntry) {
    return auditEntry.resource?.includes('financial') ||
           auditEntry.eventType === AuditEvents.SYSTEM.CONFIG_CHANGE;
  }

  /**
   * Checks PCI DSS relevance
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {boolean} True if PCI DSS relevant
   */
  #isPCIDSSRelevant(auditEntry) {
    return auditEntry.resource?.includes('payment') ||
           auditEntry.metadata?.dataType === 'PCI';
  }

  /**
   * Analyzes event distribution
   * @private
   * @param {Array} logs - Audit logs
   * @returns {Object} Event distribution
   */
  #analyzeEventDistribution(logs) {
    const distribution = {};

    for (const log of logs) {
      distribution[log.eventType] = (distribution[log.eventType] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Analyzes user activity
   * @private
   * @param {Array} logs - Audit logs
   * @returns {Object} User activity analysis
   */
  #analyzeUserActivity(logs) {
    const activity = {};

    for (const log of logs) {
      if (!activity[log.userId]) {
        activity[log.userId] = {
          eventCount: 0,
          riskEvents: 0,
          lastActivity: log.timestamp
        };
      }

      activity[log.userId].eventCount++;
      
      if (log.riskLevel === AuditService.#RISK_LEVELS.HIGH || 
          log.riskLevel === AuditService.#RISK_LEVELS.CRITICAL) {
        activity[log.userId].riskEvents++;
      }

      if (log.timestamp > activity[log.userId].lastActivity) {
        activity[log.userId].lastActivity = log.timestamp;
      }
    }

    return activity;
  }

  /**
   * Analyzes risk trends
   * @private
   * @param {Array} logs - Audit logs
   * @returns {Object} Risk trends
   */
  #analyzeRiskTrends(logs) {
    const trends = {
      byHour: {},
      byDay: {},
      byLevel: {}
    };

    for (const log of logs) {
      const date = new Date(log.timestamp);
      const hour = date.getHours();
      const day = date.toISOString().split('T')[0];

      trends.byHour[hour] = (trends.byHour[hour] || 0) + (log.riskScore || 0);
      trends.byDay[day] = (trends.byDay[day] || 0) + (log.riskScore || 0);
      trends.byLevel[log.riskLevel] = (trends.byLevel[log.riskLevel] || 0) + 1;
    }

    return trends;
  }

  /**
   * Detects anomalies in audit logs
   * @private
   * @param {Array} logs - Audit logs
   * @returns {Promise<Array>} Detected anomalies
   */
  async #detectAnomalies(logs) {
    const anomalies = [];

    // Detect rapid fire events
    const userEvents = {};
    
    for (const log of logs) {
      const key = `${log.userId}:${log.eventType}`;
      
      if (!userEvents[key]) {
        userEvents[key] = [];
      }
      
      userEvents[key].push(log.timestamp);
    }

    // Check for rapid fire (>10 events in 1 minute)
    for (const [key, timestamps] of Object.entries(userEvents)) {
      const sorted = timestamps.sort();
      
      for (let i = 10; i < sorted.length; i++) {
        const timeDiff = new Date(sorted[i]) - new Date(sorted[i - 10]);
        
        if (timeDiff < 60000) { // 1 minute
          anomalies.push({
            type: 'rapid_fire',
            description: `Rapid fire events detected for ${key}`,
            severity: 'high'
          });
          break;
        }
      }
    }

    return anomalies;
  }

  /**
   * Generates recommendations based on analysis
   * @private
   * @param {Object} analysis - Analysis results
   * @returns {Array} Recommendations
   */
  #generateRecommendations(analysis) {
    const recommendations = [];

    // Check for high risk events
    if (analysis.riskTrends.byLevel.critical > 5) {
      recommendations.push({
        priority: 'high',
        category: 'security',
        recommendation: 'Multiple critical risk events detected. Review security policies and user access.'
      });
    }

    // Check for anomalies
    if (analysis.anomalies.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'monitoring',
        recommendation: 'Anomalous patterns detected. Consider implementing additional monitoring.'
      });
    }

    // Check for after-hours activity
    const afterHoursActivity = Object.entries(analysis.riskTrends.byHour)
      .filter(([hour]) => hour < 6 || hour > 22)
      .reduce((sum, [, score]) => sum + score, 0);

    if (afterHoursActivity > 100) {
      recommendations.push({
        priority: 'low',
        category: 'policy',
        recommendation: 'Significant after-hours activity detected. Review access policies.'
      });
    }

    return recommendations;
  }

  /**
   * Converts data to CSV format
   * @private
   * @param {Object} data - Data to convert
   * @returns {string} CSV formatted data
   */
  #convertToCSV(data) {
    const headers = [
      'ID', 'Timestamp', 'Event Type', 'User ID', 'Resource',
      'Action', 'Result', 'Risk Level', 'IP Address'
    ];

    const rows = data.logs.map(log => [
      log.id,
      log.timestamp,
      log.eventType,
      log.userId,
      log.resource,
      log.action,
      log.result,
      log.riskLevel || '',
      log.context?.ip || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Chunks array into smaller arrays
   * @private
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array} Array of chunks
   */
  #chunkArray(array, size) {
    const chunks = [];
    
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    
    return chunks;
  }

  /**
   * Generates audit ID
   * @private
   * @returns {string} Audit ID
   */
  #generateAuditId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates correlation ID
   * @private
   * @returns {string} Correlation ID
   */
  #generateCorrelationId() {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining entries
    this.#flushQueue().catch(error => {
      logger.error('Failed to flush queue during cleanup', error);
    });

    logger.info('AuditService cleanup completed');
  }
}

module.exports = AuditService;