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
const { AppError } = require('../../utils/app-error');
const AuditLogger = require('./audit-logger');
const { AuditEvents } = require('./audit-events');
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
   * @param {Object} [options.config] - Enterprise audit configuration
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
    // Extract enterprise configuration if provided
    this.config = options.config || {};
    
    // Map enterprise configuration to service properties with fallbacks
    const {
      database,
      enableEncryption = this.config.security?.enableEncryption ?? true,
      enableBatching = this.config.processing?.enableBuffering ?? true,
      batchSize = this.config.processing?.batchSize ?? AuditService.#BATCH_SIZE,
      flushInterval = this.config.processing?.flushInterval ?? AuditService.#FLUSH_INTERVAL,
      enableCompliance = this.#isComplianceEnabled(),
      complianceConfig = this.config.compliance || {},
      enableRiskScoring = this.config.riskScoring?.enabled ?? true,
      retentionPolicy = { days: this.config.retention?.retentionDays ?? AuditService.#RETENTION_DAYS }
    } = options;

    this.database = database;
    this.enableEncryption = enableEncryption;
    this.enableBatching = enableBatching;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.enableCompliance = enableCompliance;
    this.enableRiskScoring = enableRiskScoring;
    this.retentionPolicy = retentionPolicy;

    // Apply environment-specific optimizations from enterprise config
    if (this.config.environment === 'development') {
      this.flushInterval = this.config.development?.reducedFlushInterval ?? this.flushInterval;
      this.batchSize = this.config.development?.reducedBatchSize ?? this.batchSize;
      
      logger.debug('Applied development optimizations to AuditService', {
        originalFlushInterval: options.flushInterval || AuditService.#FLUSH_INTERVAL,
        optimizedFlushInterval: this.flushInterval,
        originalBatchSize: options.batchSize || AuditService.#BATCH_SIZE,
        optimizedBatchSize: this.batchSize
      });
    }

    // Initialize sub-services
    this.auditLogger = new AuditLogger({
      database,
      enableEncryption,
      batchSize: this.batchSize,
      storageType: this.config.storage?.type || 'database'
    });

    this.auditTrail = new AuditTrail({
      database,
      enableEncryption
    });

    // FIXED: Pass 'this' (self-reference) to ComplianceReporter to break circular dependency
    if (enableCompliance) {
      this.complianceReporter = new ComplianceReporter({
        database,
        auditService: this, // Pass self-reference instead of creating new instance
        ...complianceConfig
      });
    }

    if (enableEncryption) {
      this.encryptionService = new EncryptionService({
        algorithm: this.config.security?.encryptionAlgorithm || 'aes-256-gcm'
      });
    }

    // Initialize batch queue
    this.auditQueue = [];
    this.isProcessing = false;

    // Start batch processing with enterprise configuration
    if (enableBatching) {
      this.flushTimer = setInterval(() => {
        this.#flushQueue();
      }, this.flushInterval);
    }

    // Initialize risk scoring rules
    this.riskRules = this.#initializeRiskRules();

    logger.info('AuditService initialized with enterprise configuration', {
      enabled: this.config.enabled ?? true,
      environment: this.config.environment,
      enableEncryption,
      enableBatching,
      enableCompliance,
      enableRiskScoring,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval,
      storageType: this.config.storage?.type
    });
  }

  /**
   * Check if compliance is enabled in enterprise configuration
   * @private
   * @returns {boolean} True if any compliance standard is enabled
   */
  #isComplianceEnabled() {
    if (!this.config.compliance?.standards) {
      return true; // Default fallback
    }
    
    return Object.values(this.config.compliance.standards).some(enabled => enabled === true);
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
      // Check if audit system is enabled from enterprise config
      if (this.config && this.config.enabled === false) {
        logger.debug('Audit system disabled, skipping event logging');
        return { id: null, skipped: true, reason: 'audit_disabled' };
      }

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

    // Use enterprise configuration for risk scoring if available
    const eventWeights = this.config.riskScoring?.eventWeights || this.riskRules.eventTypes;
    const contextFactors = this.config.riskScoring?.contextFactors || {};

    // Check event type risk
    const eventRisk = eventWeights[auditEntry.eventType] || 0;
    score += eventRisk;

    // Check action risk
    const actionRisk = this.riskRules.actions[auditEntry.action] || 0;
    score += actionRisk;

    // Check for suspicious patterns
    if (auditEntry.context.ip && this.#isSuspiciousIP(auditEntry.context.ip)) {
      score += contextFactors.suspiciousIP || 20;
    }

    // Check time-based anomalies
    const hour = new Date(auditEntry.timestamp).getHours();
    if (hour < 6 || hour > 22) {
      score += contextFactors.afterHours || 10;
    }

    // Check result
    if (auditEntry.result === 'failure') {
      score += contextFactors.multipleFailures || 15;
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
    // Use enterprise configuration thresholds if available
    const thresholds = this.config.alerting?.thresholds || {};
    
    if (score >= (thresholds.criticalRiskScore || 80)) return AuditService.#RISK_LEVELS.CRITICAL;
    if (score >= (thresholds.highRiskScore || 60)) return AuditService.#RISK_LEVELS.HIGH;
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
    const standards = this.config.compliance?.standards || {};

    // GDPR tags
    if (standards.gdpr && this.#isGDPRRelevant(auditEntry)) {
      tags.push('GDPR');
    }

    // HIPAA tags
    if (standards.hipaa && this.#isHIPAARelevant(auditEntry)) {
      tags.push('HIPAA');
    }

    // SOX tags
    if (standards.sox && this.#isSOXRelevant(auditEntry)) {
      tags.push('SOX');
    }

    // PCI DSS tags
    if (standards.pci && this.#isPCIDSSRelevant(auditEntry)) {
      tags.push('PCI-DSS');
    }

    // ISO27001 tags
    if (standards.iso27001 && this.#isISO27001Relevant(auditEntry)) {
      tags.push('ISO27001');
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

    // Use enterprise configuration for max queue size
    const maxQueueSize = this.config.processing?.maxQueueSize || AuditService.#MAX_QUEUE_SIZE;
    
    // Flush if queue is full
    if (this.auditQueue.length >= maxQueueSize) {
      await this.#flushQueue();
    }
  }

  /**
   * Flushes audit queue with enterprise-grade error handling and configuration support
   * @private
   * @returns {Promise<void>}
   */
  async #flushQueue() {
    // Check if audit system is enabled from enterprise config
    if (this.config && this.config.enabled === false) {
      logger.debug('Audit system disabled, skipping queue flush');
      return;
    }

    // Early exit for empty queue - respect enterprise config for empty flush logging
    if (this.auditQueue.length === 0) {
      if (this.config?.processing?.logEmptyFlushes) {
        logger.debug('Audit queue flush - no entries to process', {
          environment: this.config?.environment || process.env.NODE_ENV,
          queueSize: 0
        });
      }
      return;
    }

    // Prevent concurrent processing
    if (this.isProcessing) {
      logger.debug('Audit flush already in progress, skipping', {
        queueSize: this.auditQueue.length
      });
      return;
    }

    const flushStartTime = Date.now();
    let processedEntries = 0;
    let processedBatches = 0;
    let failedEntries = 0;
    const originalQueueSize = this.auditQueue.length;

    try {
      this.isProcessing = true;

      // Determine batch size from enterprise configuration
      const effectiveBatchSize = this.#getEffectiveBatchSize();
      
      // Process entries in batches to avoid memory issues
      const maxBatchesPerFlush = this.config?.processing?.maxBatchesPerFlush || 5;
      
      while (this.auditQueue.length > 0 && processedBatches < maxBatchesPerFlush) {
        const batchStartTime = Date.now();
        const entries = this.auditQueue.splice(0, effectiveBatchSize);
        
        if (entries.length === 0) {
          break;
        }

        try {
          // Validate entries before processing
          const validEntries = this.#validateAuditEntries(entries);
          
          if (validEntries.length > 0) {
            // Apply environment-specific processing
            const processedEntriesForBatch = await this.#processAuditBatch(validEntries);
            
            await this.auditLogger.logBatch(processedEntriesForBatch);
            
            processedEntries += processedEntriesForBatch.length;
            processedBatches++;

            // Track performance metrics
            this.#trackBatchMetrics(processedEntriesForBatch.length, Date.now() - batchStartTime);
          }

          // Handle invalid entries
          const invalidEntries = entries.length - validEntries.length;
          if (invalidEntries > 0) {
            failedEntries += invalidEntries;
            logger.warn('Invalid audit entries detected during flush', {
              invalidCount: invalidEntries,
              validCount: validEntries.length,
              batchNumber: processedBatches
            });
          }

        } catch (batchError) {
          failedEntries += entries.length;
          
          logger.error('Failed to process audit batch', {
            batchSize: entries.length,
            batchNumber: processedBatches + 1,
            error: batchError.message,
            errorCode: batchError.code || 'BATCH_PROCESSING_ERROR'
          });

          // Re-queue failed entries based on retry policy
          if (this.#shouldRetryBatch(batchError)) {
            this.#requeueFailedEntries(entries);
          } else {
            // Log failed entries to dead letter queue or error log
            await this.#handleUnrecoverableEntries(entries, batchError);
          }
        }

        // Prevent infinite loops and respect processing timeouts
        const processingTimeout = this.config?.processing?.processingTimeout || 30000;
        if (Date.now() - flushStartTime > processingTimeout) {
          logger.warn('Audit flush timeout reached, stopping batch processing', {
            timeoutMs: processingTimeout,
            processedBatches,
            remainingEntries: this.auditQueue.length
          });
          break;
        }
      }

      // Log flush completion with appropriate level based on enterprise configuration
      if (processedEntries > 0 || this.config?.processing?.logEmptyFlushes) {
        const flushDuration = Date.now() - flushStartTime;
        const logLevel = this.#getFlushLogLevel(processedEntries, failedEntries);
        
        logger[logLevel]('Audit queue flush completed', {
          originalQueueSize,
          processedBatches,
          processedEntries,
          failedEntries,
          remainingEntries: this.auditQueue.length,
          flushDurationMs: flushDuration,
          environment: this.config?.environment || process.env.NODE_ENV,
          averageBatchSize: processedBatches > 0 ? Math.round(processedEntries / processedBatches) : 0
        });
      }

      // Update flush metrics for monitoring
      this.#updateFlushMetrics({
        processedEntries,
        failedEntries,
        processingTime: Date.now() - flushStartTime,
        batchCount: processedBatches
      });

    } catch (error) {
      logger.error('Critical error during audit queue flush', {
        error: error.message,
        stack: error.stack,
        queueSize: originalQueueSize,
        processedEntries,
        environment: this.config?.environment || process.env.NODE_ENV,
        errorCode: error.code || 'FLUSH_CRITICAL_ERROR'
      });

      // Attempt to preserve audit integrity
      await this.#handleCriticalFlushError(error, originalQueueSize);

    } finally {
      this.isProcessing = false;

      // Cleanup and health checks
      try {
        await this.#performPostFlushCleanup();
        
        // Health check - ensure audit system is functioning properly
        if (this.config?.monitoring?.healthChecks) {
          await this.#performHealthCheck();
        }

      } catch (cleanupError) {
        logger.error('Error during post-flush cleanup', {
          error: cleanupError.message,
          originalProcessedEntries: processedEntries
        });
      }

      // Schedule next health check if needed
      this.#scheduleHealthCheckIfNeeded();
    }
  }

  /**
   * Gets effective batch size based on enterprise configuration and environment
   * @private
   * @returns {number} Effective batch size
   */
  #getEffectiveBatchSize() {
    const baseBatchSize = this.batchSize;
    
    // Use enterprise configuration for environment-specific optimizations
    if (this.config.environment === 'development') {
      return this.config.development?.reducedBatchSize || Math.min(baseBatchSize, 50);
    }

    // Increase batch size in production for efficiency
    if (this.config.environment === 'production') {
      return Math.min(baseBatchSize * 1.5, 500);
    }

    return baseBatchSize;
  }

  /**
   * Validates audit entries before processing
   * @private
   * @param {Array} entries - Audit entries to validate
   * @returns {Array} Valid audit entries
   */
  #validateAuditEntries(entries) {
    return entries.filter(entry => {
      try {
        // Basic validation - ensure required fields exist
        if (!entry.id || !entry.timestamp || !entry.eventType) {
          logger.debug('Invalid audit entry - missing required fields', {
            entryId: entry.id,
            hasTimestamp: !!entry.timestamp,
            hasEventType: !!entry.eventType
          });
          return false;
        }

        // Validate timestamp is not too old or in the future
        const entryTime = new Date(entry.timestamp).getTime();
        const now = Date.now();
        const maxAge = this.config?.validation?.maxEntryAge || (24 * 60 * 60 * 1000); // 24 hours
        
        if (entryTime < (now - maxAge) || entryTime > (now + 60000)) { // Allow 1 minute future tolerance
          logger.debug('Invalid audit entry - timestamp out of range', {
            entryId: entry.id,
            entryTimestamp: entry.timestamp,
            ageMs: now - entryTime
          });
          return false;
        }

        return true;

      } catch (validationError) {
        logger.debug('Error validating audit entry', {
          entryId: entry.id,
          error: validationError.message
        });
        return false;
      }
    });
  }

  /**
   * Processes audit batch with environment-specific handling
   * @private
   * @param {Array} entries - Valid audit entries
   * @returns {Promise<Array>} Processed entries
   */
  async #processAuditBatch(entries) {
    // Apply environment-specific transformations
    if (this.config.environment === 'development') {
      // In development, add debug information and reduce data volume
      return entries.map(entry => ({
        ...entry,
        metadata: {
          ...entry.metadata,
          developmentMode: true,
          processedAt: new Date().toISOString()
        }
      }));
    }

    // Production processing with full enterprise features
    return entries.map(entry => ({
      ...entry,
      processed: {
        at: new Date().toISOString(),
        version: this.config?.version || '1.0.0',
        node: process.env.NODE_NAME || 'unknown'
      }
    }));
  }

  /**
   * Determines if batch should be retried based on error type
   * @private
   * @param {Error} error - The batch processing error
   * @returns {boolean} True if batch should be retried
   */
  #shouldRetryBatch(error) {
    // Don't retry validation errors or permanent failures
    const nonRetryableCodes = [
      'VALIDATION_ERROR',
      'INVALID_DATA',
      'PERMISSION_DENIED',
      'QUOTA_EXCEEDED'
    ];

    if (nonRetryableCodes.includes(error.code)) {
      return false;
    }

    // Retry network errors, temporary failures, etc.
    const retryableCodes = [
      'NETWORK_ERROR',
      'TIMEOUT',
      'DATABASE_UNAVAILABLE',
      'RATE_LIMITED'
    ];

    return retryableCodes.includes(error.code) || !error.code;
  }

  /**
   * Re-queues failed entries with retry tracking
   * @private
   * @param {Array} entries - Failed entries to re-queue
   */
  #requeueFailedEntries(entries) {
    const maxRetries = this.config?.processing?.retryAttempts || 3;
    
    const retriableEntries = entries.filter(entry => {
      const retryCount = (entry._retryCount || 0) + 1;
      entry._retryCount = retryCount;
      entry._lastRetryAt = new Date().toISOString();
      
      return retryCount <= maxRetries;
    });

    // Add retriable entries back to the front of the queue
    this.auditQueue.unshift(...retriableEntries);

    // Log entries that exceeded retry limit
    const exceededEntries = entries.length - retriableEntries.length;
    if (exceededEntries > 0) {
      logger.error('Audit entries exceeded retry limit', {
        exceededCount: exceededEntries,
        maxRetries
      });
    }
  }

  /**
   * Handles unrecoverable audit entries
   * @private
   * @param {Array} entries - Unrecoverable entries
   * @param {Error} error - The error that caused the failure
   */
  async #handleUnrecoverableEntries(entries, error) {
    // In a production system, these would be written to a dead letter queue
    // For now, log them with sufficient detail for manual recovery
    logger.error('Unrecoverable audit entries - writing to error log', {
      entryCount: entries.length,
      error: error.message,
      entryIds: entries.map(e => e.id),
      timestamp: new Date().toISOString()
    });

    // Could also write to a separate error file or database table
    // for later manual processing or investigation
  }

  /**
   * Gets appropriate log level for flush completion
   * @private
   * @param {number} processedEntries - Number of processed entries
   * @param {number} failedEntries - Number of failed entries
   * @returns {string} Log level
   */
  #getFlushLogLevel(processedEntries, failedEntries) {
    if (failedEntries > 0) {
      return failedEntries > processedEntries ? 'error' : 'warn';
    }
    
    if (processedEntries === 0) {
      return 'debug';
    }

    // Use enterprise configuration for environment-specific log levels
    return this.config.environment === 'development' ? 'debug' : 'info';
  }

  /**
   * Tracks batch processing metrics
   * @private
   * @param {number} batchSize - Size of processed batch
   * @param {number} processingTime - Time to process batch in ms
   */
  #trackBatchMetrics(batchSize, processingTime) {
    if (!this.metrics) {
      this.metrics = {
        totalBatches: 0,
        totalEntries: 0,
        totalProcessingTime: 0,
        averageBatchSize: 0,
        averageProcessingTime: 0
      };
    }

    this.metrics.totalBatches++;
    this.metrics.totalEntries += batchSize;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageBatchSize = this.metrics.totalEntries / this.metrics.totalBatches;
    this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.totalBatches;
  }

  /**
   * Updates flush-level metrics for monitoring
   * @private
   * @param {Object} metrics - Flush metrics
   */
  #updateFlushMetrics(metrics) {
    // Update internal metrics for health monitoring
    this.lastFlushMetrics = {
      ...metrics,
      timestamp: new Date().toISOString()
    };

    // Emit metrics to monitoring system if configured
    if (this.config?.monitoring?.metricsEnabled) {
      this.emit('flush.completed', metrics);
    }
  }

  /**
   * Handles critical errors during flush operation
   * @private
   * @param {Error} error - Critical error
   * @param {number} originalQueueSize - Original queue size before flush
   */
  async #handleCriticalFlushError(error, originalQueueSize) {
    // Implement circuit breaker pattern if too many critical errors
    if (!this.criticalErrorCount) {
      this.criticalErrorCount = 0;
    }
    
    this.criticalErrorCount++;
    
    const maxCriticalErrors = this.config?.resilience?.maxCriticalErrors || 5;
    if (this.criticalErrorCount > maxCriticalErrors) {
      logger.critical('Audit system entering degraded mode due to repeated critical errors', {
        criticalErrorCount: this.criticalErrorCount,
        lastError: error.message
      });
      
      // Could implement degraded mode operations here
      this.degradedMode = true;
    }

    // Reset error count after successful operation
    if (this.criticalErrorCount > 0 && originalQueueSize > 0) {
      setTimeout(() => {
        this.criticalErrorCount = Math.max(0, this.criticalErrorCount - 1);
      }, 60000); // Decay error count over time
    }
  }

  /**
   * Performs post-flush cleanup operations
   * @private
   */
  async #performPostFlushCleanup() {
    // Clean up any temporary resources
    // Reset degraded mode if system is healthy
    if (this.degradedMode && this.criticalErrorCount === 0) {
      this.degradedMode = false;
      logger.info('Audit system recovered from degraded mode');
    }

    // Perform garbage collection hint for large flushes
    if (this.lastFlushMetrics?.processedEntries > 1000) {
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Performs health check on audit system
   * @private
   */
  async #performHealthCheck() {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      queueSize: this.auditQueue.length,
      isProcessing: this.isProcessing,
      degradedMode: this.degradedMode || false,
      criticalErrorCount: this.criticalErrorCount || 0,
      lastFlushMetrics: this.lastFlushMetrics
    };

    // Check if queue is growing too large
    const maxQueueSize = this.config?.processing?.maxQueueSize || AuditService.#MAX_QUEUE_SIZE;
    if (this.auditQueue.length > maxQueueSize) {
      logger.warn('Audit queue size exceeding threshold', healthCheck);
    }

    // Emit health check for monitoring
    if (this.config?.monitoring?.healthChecks) {
      this.emit('health.check', healthCheck);
    }
  }

  /**
   * Schedules next health check if needed
   * @private
   */
  #scheduleHealthCheckIfNeeded() {
    // Implementation would depend on specific monitoring requirements
    // Could schedule periodic deep health checks, log rotation, etc.
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
    // This would integrate with alerting system from enterprise config
    const alertChannels = this.config.alerting?.channels || {};
    
    logger.warn('SECURITY ALERT', {
      auditId: auditEntry.id,
      eventType: auditEntry.eventType,
      riskScore: auditEntry.riskScore,
      userId: auditEntry.userId,
      resource: auditEntry.resource,
      alertChannelsEnabled: Object.keys(alertChannels).filter(channel => alertChannels[channel])
    });
  }

  /**
   * Initializes risk scoring rules from enterprise configuration
   * @private
   * @returns {Object} Risk rules
   */
  #initializeRiskRules() {
    // Use enterprise configuration if available
    if (this.config.riskScoring?.eventWeights) {
      return {
        eventTypes: this.config.riskScoring.eventWeights,
        actions: {
          'delete': 20,
          'export': 15,
          'modify': 10,
          'create': 5,
          'read': 0
        }
      };
    }

    // Fallback to default rules
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
    // Check enterprise configuration watchlists
    if (this.config.monitoring?.watchlists?.ips?.includes(ip)) {
      return true;
    }

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
   * Checks ISO27001 relevance
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {boolean} True if ISO27001 relevant
   */
  #isISO27001Relevant(auditEntry) {
    return auditEntry.eventType?.includes('security') ||
           auditEntry.eventType?.includes('config');
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

    // Use enterprise configuration for anomaly detection
    const anomalyConfig = this.config.monitoring?.anomalyDetection || {};
    
    if (!anomalyConfig.enabled) {
      return anomalies;
    }

    // Detect rapid fire events
    const userEvents = {};
    
    for (const log of logs) {
      const key = `${log.userId}:${log.eventType}`;
      
      if (!userEvents[key]) {
        userEvents[key] = [];
      }
      
      userEvents[key].push(log.timestamp);
    }

    // Check for rapid fire using enterprise configuration
    const rapidFireThreshold = this.config.monitoring?.patterns?.rapidFire?.threshold || 10;
    const timeWindow = this.config.monitoring?.patterns?.rapidFire?.timeWindow || 60000;
    
    for (const [key, timestamps] of Object.entries(userEvents)) {
      const sorted = timestamps.sort();
      
      for (let i = rapidFireThreshold; i < sorted.length; i++) {
        const timeDiff = new Date(sorted[i]) - new Date(sorted[i - rapidFireThreshold]);
        
        if (timeDiff < timeWindow) {
          anomalies.push({
            type: 'rapid_fire',
            description: `Rapid fire events detected for ${key}`,
            severity: 'high',
            threshold: rapidFireThreshold,
            timeWindow: timeWindow
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
   * Get audit service configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update audit service configuration
   * @param {Object} newConfig - New configuration to merge
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Audit service configuration updated', {
      updatedKeys: Object.keys(newConfig)
    });
  }

  /**
   * Check if audit service is enabled
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this.config?.enabled ?? true;
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

  /**
   * Static method to verify audit system is operational
   * @returns {Promise<boolean>} True if operational
   */
  static async verify() {
    try {
      // Basic verification - could be enhanced with actual health checks
      return true;
    } catch (error) {
      throw new Error(`Audit system verification failed: ${error.message}`);
    }
  }

  /**
   * Static method to flush all pending audits (for shutdown)
   * @returns {Promise<void>}
   */
  static async flush() {
    // Implementation would depend on how instances are managed
    logger.info('Static audit flush called');
  }
}

module.exports = AuditService;