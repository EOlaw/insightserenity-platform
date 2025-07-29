'use strict';

/**
 * @fileoverview Audit logger middleware for compliance and security event tracking
 * @module shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/config
 * @requires module:crypto
 */

const logger = require('../../utils/logger');
const AuditService = require('../../security/audit/audit-service');
const AuditLogModel = require('../../database/models/audit-log-model');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const config = require('../../config');
const crypto = require('crypto');

/**
 * @class AuditLogger
 * @description Enterprise-grade audit logger for security events, compliance tracking,
 * and forensic analysis with tamper-proof logging and regulatory compliance
 */
class AuditLogger {
  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #auditQueue;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #eventMetrics;

  /**
   * @private
   * @type {Set<string>}
   */
  #watchedEntities;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enabled: process.env.AUDIT_LOGGER_ENABLED !== 'false',
    level: process.env.AUDIT_LOGGER_LEVEL || 'info',
    batchSize: parseInt(process.env.AUDIT_LOGGER_BATCH_SIZE || '100', 10),
    flushInterval: parseInt(process.env.AUDIT_LOGGER_FLUSH_INTERVAL || '5000', 10), // 5 seconds
    retentionDays: parseInt(process.env.AUDIT_LOGGER_RETENTION_DAYS || '2555', 10), // 7 years
    encryptionEnabled: process.env.AUDIT_LOGGER_ENCRYPTION !== 'false',
    hashingEnabled: process.env.AUDIT_LOGGER_HASHING !== 'false',
    signatureEnabled: process.env.AUDIT_LOGGER_SIGNATURE === 'true',
    compressionEnabled: process.env.AUDIT_LOGGER_COMPRESSION === 'true',
    realTimeAlerts: process.env.AUDIT_LOGGER_REALTIME_ALERTS === 'true',
    auditableEvents: {
      authentication: [
        'auth.login',
        'auth.logout',
        'auth.failed',
        'auth.password_reset',
        'auth.2fa_enabled',
        'auth.2fa_disabled',
        'auth.session_expired'
      ],
      authorization: [
        'authz.access_granted',
        'authz.access_denied',
        'authz.permission_changed',
        'authz.role_assigned',
        'authz.role_removed'
      ],
      dataAccess: [
        'data.read',
        'data.write',
        'data.update',
        'data.delete',
        'data.export',
        'data.import'
      ],
      configuration: [
        'config.changed',
        'config.security_updated',
        'config.system_modified',
        'config.feature_toggled'
      ],
      compliance: [
        'compliance.data_request',
        'compliance.data_deletion',
        'compliance.consent_given',
        'compliance.consent_withdrawn',
        'compliance.audit_viewed'
      ],
      security: [
        'security.threat_detected',
        'security.attack_blocked',
        'security.vulnerability_found',
        'security.encryption_key_rotated',
        'security.certificate_updated'
      ],
      system: [
        'system.startup',
        'system.shutdown',
        'system.error',
        'system.maintenance',
        'system.backup',
        'system.restore'
      ]
    },
    sensitiveOperations: [
      'password_change',
      'email_change',
      'permission_grant',
      'data_export',
      'bulk_delete',
      'system_config_change'
    ],
    complianceStandards: {
      hipaa: process.env.AUDIT_COMPLIANCE_HIPAA === 'true',
      gdpr: process.env.AUDIT_COMPLIANCE_GDPR === 'true',
      sox: process.env.AUDIT_COMPLIANCE_SOX === 'true',
      pci: process.env.AUDIT_COMPLIANCE_PCI === 'true'
    },
    alertThresholds: {
      failedLogins: parseInt(process.env.AUDIT_ALERT_FAILED_LOGINS || '5', 10),
      accessDenied: parseInt(process.env.AUDIT_ALERT_ACCESS_DENIED || '10', 10),
      dataExports: parseInt(process.env.AUDIT_ALERT_DATA_EXPORTS || '3', 10)
    },
    watchlist: {
      users: process.env.AUDIT_WATCH_USERS?.split(',') || [],
      ips: process.env.AUDIT_WATCH_IPS?.split(',') || [],
      resources: process.env.AUDIT_WATCH_RESOURCES?.split(',') || []
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #EVENT_SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #AUDIT_FIELDS = {
    REQUIRED: ['event', 'timestamp', 'actor', 'resource', 'action'],
    OPTIONAL: ['result', 'metadata', 'correlationId', 'sessionId', 'ipAddress']
  };

  /**
   * Creates AuditLogger instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   */
  constructor(options = {}, auditService, cacheService, encryptionService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#auditQueue = new Map();
    this.#eventMetrics = new Map();
    this.#watchedEntities = new Set([
      ...this.#config.watchlist.users,
      ...this.#config.watchlist.ips,
      ...this.#config.watchlist.resources
    ]);

    // Initialize batch processing
    this.#initializeBatchProcessing();

    // Initialize compliance features
    this.#initializeCompliance();

    logger.info('AuditLogger initialized', {
      enabled: this.#config.enabled,
      encryptionEnabled: this.#config.encryptionEnabled,
      complianceStandards: Object.keys(this.#config.complianceStandards)
        .filter(std => this.#config.complianceStandards[std])
    });
  }

  /**
   * Logs an audit event
   * @param {Object} event - Audit event data
   * @param {Object} [req] - Express request object
   * @returns {Promise<string>} Audit log ID
   */
  logEvent = async (event, req = null) => {
    if (!this.#config.enabled) return null;

    try {
      // Validate event
      this.#validateAuditEvent(event);

      // Create audit record
      const auditRecord = await this.#createAuditRecord(event, req);

      // Check if high-priority event
      if (this.#isHighPriorityEvent(auditRecord)) {
        // Process immediately
        return await this.#processAuditRecord(auditRecord);
      }

      // Add to queue for batch processing
      this.#queueAuditRecord(auditRecord);

      // Check if should flush
      if (this.#shouldFlushQueue()) {
        await this.#flushQueue();
      }

      return auditRecord.id;

    } catch (error) {
      logger.error('Failed to log audit event', {
        event: event.event,
        error: error.message
      });
      throw error;
    }
  };

  /**
   * Express middleware for automatic audit logging
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware
   */
  middleware = (options = {}) => {
    return async (req, res, next) => {
      if (!this.#config.enabled) {
        return next();
      }

      const startTime = Date.now();
      const originalSend = res.send;
      const originalJson = res.json;
      const originalEnd = res.end;

      // Capture response
      const captureResponse = (body) => {
        res.locals.responseBody = body;
        res.locals.responseTime = Date.now() - startTime;
      };

      res.send = function(body) {
        captureResponse(body);
        return originalSend.call(this, body);
      };

      res.json = function(body) {
        captureResponse(body);
        return originalJson.call(this, body);
      };

      res.end = function(...args) {
        res.locals.responseTime = Date.now() - startTime;
        return originalEnd.call(this, ...args);
      };

      // Log request completion
      res.on('finish', async () => {
        try {
          await this.#auditHttpRequest(req, res, options);
        } catch (error) {
          logger.error('Failed to audit HTTP request', {
            error: error.message,
            path: req.path
          });
        }
      });

      next();
    };
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...AuditLogger.#DEFAULT_CONFIG };

    Object.keys(AuditLogger.#DEFAULT_CONFIG).forEach(key => {
      if (typeof AuditLogger.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(AuditLogger.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...AuditLogger.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Initializes batch processing
   */
  #initializeBatchProcessing() {
    // Flush queue periodically
    this.flushInterval = setInterval(() => {
      this.#flushQueue().catch(error => {
        logger.error('Failed to flush audit queue', {
          error: error.message
        });
      });
    }, this.#config.flushInterval);

    // Ensure cleanup on exit
    process.on('beforeExit', async () => {
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
      }
      await this.#flushQueue();
    });
  }

  /**
   * @private
   * Initializes compliance features
   */
  #initializeCompliance() {
    // Initialize HIPAA compliance
    if (this.#config.complianceStandards.hipaa) {
      logger.info('HIPAA compliance mode enabled for audit logging');
      // Additional HIPAA-specific configurations
    }

    // Initialize GDPR compliance
    if (this.#config.complianceStandards.gdpr) {
      logger.info('GDPR compliance mode enabled for audit logging');
      // Additional GDPR-specific configurations
    }

    // Initialize SOX compliance
    if (this.#config.complianceStandards.sox) {
      logger.info('SOX compliance mode enabled for audit logging');
      // Additional SOX-specific configurations
    }

    // Initialize PCI compliance
    if (this.#config.complianceStandards.pci) {
      logger.info('PCI compliance mode enabled for audit logging');
      // Additional PCI-specific configurations
    }
  }

  /**
   * @private
   * Validates audit event
   */
  #validateAuditEvent(event) {
    // Check required fields
    for (const field of AuditLogger.#AUDIT_FIELDS.REQUIRED) {
      if (!event[field]) {
        throw new Error(`Missing required audit field: ${field}`);
      }
    }

    // Validate event type
    const validEvents = Object.values(this.#config.auditableEvents).flat();
    if (!validEvents.includes(event.event)) {
      logger.warn('Unknown audit event type', { event: event.event });
    }
  }

  /**
   * @private
   * Creates audit record
   */
  async #createAuditRecord(event, req) {
    const record = {
      id: this.#generateAuditId(),
      timestamp: event.timestamp || new Date().toISOString(),
      event: event.event,
      severity: this.#determineEventSeverity(event),
      actor: await this.#extractActor(event, req),
      resource: this.#extractResource(event),
      action: event.action,
      result: event.result || 'success',
      metadata: await this.#extractMetadata(event, req),
      compliance: this.#extractComplianceData(event)
    };

    // Add request context
    if (req) {
      record.request = {
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        correlationId: req.correlationId
      };
    }

    // Add session info
    if (event.sessionId || req?.session?.id) {
      record.sessionId = event.sessionId || req.session.id;
    }

    // Generate integrity hash
    if (this.#config.hashingEnabled) {
      record.hash = await this.#generateRecordHash(record);
    }

    // Sign record if enabled
    if (this.#config.signatureEnabled) {
      record.signature = await this.#signRecord(record);
    }

    return record;
  }

  /**
   * @private
   * Determines event severity
   */
  #determineEventSeverity(event) {
    // Critical events
    const criticalEvents = [
      'security.threat_detected',
      'security.attack_blocked',
      'data.bulk_delete',
      'config.security_updated'
    ];

    if (criticalEvents.includes(event.event)) {
      return AuditLogger.#EVENT_SEVERITY.CRITICAL;
    }

    // Error events
    if (event.result === 'failure' || event.event.includes('failed')) {
      return AuditLogger.#EVENT_SEVERITY.ERROR;
    }

    // Warning events
    const warningEvents = [
      'authz.access_denied',
      'auth.failed',
      'data.export'
    ];

    if (warningEvents.includes(event.event)) {
      return AuditLogger.#EVENT_SEVERITY.WARNING;
    }

    return AuditLogger.#EVENT_SEVERITY.INFO;
  }

  /**
   * @private
   * Extracts actor information
   */
  async #extractActor(event, req) {
    const actor = {
      type: 'unknown',
      id: 'unknown'
    };

    if (event.actor) {
      return event.actor;
    }

    if (req?.user) {
      actor.type = 'user';
      actor.id = req.user._id || req.user.id;
      actor.email = req.user.email;
      actor.roles = req.user.roles;
      actor.organizationId = req.user.organizationId;
    } else if (req?.apiKey) {
      actor.type = 'api';
      actor.id = req.apiKey.id;
      actor.name = req.apiKey.name;
    } else if (event.system) {
      actor.type = 'system';
      actor.id = event.system;
    }

    return actor;
  }

  /**
   * @private
   * Extracts resource information
   */
  #extractResource(event) {
    if (typeof event.resource === 'string') {
      return {
        type: 'generic',
        id: event.resource
      };
    }

    return {
      type: event.resource.type || 'unknown',
      id: event.resource.id,
      name: event.resource.name,
      path: event.resource.path
    };
  }

  /**
   * @private
   * Extracts metadata
   */
  async #extractMetadata(event, req) {
    const metadata = {
      ...event.metadata
    };

    // Add change details for data modifications
    if (event.changes) {
      metadata.changes = await this.#sanitizeChanges(event.changes);
    }

    // Add performance metrics
    if (req?.locals?.responseTime) {
      metadata.responseTime = req.locals.responseTime;
    }

    // Add compliance metadata
    if (this.#config.complianceStandards.gdpr && event.personalData) {
      metadata.gdpr = {
        dataCategories: event.personalData.categories,
        purpose: event.personalData.purpose,
        legalBasis: event.personalData.legalBasis
      };
    }

    return metadata;
  }

  /**
   * @private
   * Sanitizes change data
   */
  async #sanitizeChanges(changes) {
    const sanitized = {};
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];

    for (const [field, change] of Object.entries(changes)) {
      if (sensitiveFields.some(sensitive => field.toLowerCase().includes(sensitive))) {
        sanitized[field] = {
          before: '[REDACTED]',
          after: '[REDACTED]'
        };
      } else {
        sanitized[field] = change;
      }
    }

    return sanitized;
  }

  /**
   * @private
   * Extracts compliance data
   */
  #extractComplianceData(event) {
    const compliance = {};

    // HIPAA compliance
    if (this.#config.complianceStandards.hipaa && event.phi) {
      compliance.hipaa = {
        accessType: event.phi.accessType,
        patientId: this.#hashValue(event.phi.patientId),
        purpose: event.phi.purpose
      };
    }

    // GDPR compliance
    if (this.#config.complianceStandards.gdpr && event.gdpr) {
      compliance.gdpr = {
        lawfulBasis: event.gdpr.lawfulBasis,
        dataSubject: this.#hashValue(event.gdpr.dataSubject),
        rightsExercised: event.gdpr.rightsExercised
      };
    }

    // SOX compliance
    if (this.#config.complianceStandards.sox && event.financial) {
      compliance.sox = {
        controlActivity: event.financial.controlActivity,
        financialSystem: event.financial.system
      };
    }

    return compliance;
  }

  /**
   * @private
   * Hashes sensitive value
   */
  #hashValue(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(value.toString()).digest('hex');
  }

  /**
   * @private
   * Generates record hash for integrity
   */
  async #generateRecordHash(record) {
    const data = JSON.stringify({
      id: record.id,
      timestamp: record.timestamp,
      event: record.event,
      actor: record.actor,
      resource: record.resource,
      action: record.action,
      result: record.result
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * @private
   * Signs audit record
   */
  async #signRecord(record) {
    if (!this.#encryptionService) {
      return null;
    }

    const data = record.hash || await this.#generateRecordHash(record);
    return await this.#encryptionService.sign(data);
  }

  /**
   * @private
   * Checks if high-priority event
   */
  #isHighPriorityEvent(record) {
    // Critical severity
    if (record.severity === AuditLogger.#EVENT_SEVERITY.CRITICAL) {
      return true;
    }

    // Sensitive operations
    if (this.#config.sensitiveOperations.some(op => record.event.includes(op))) {
      return true;
    }

    // Watched entities
    if (this.#isWatchedEntity(record)) {
      return true;
    }

    // Real-time alerts enabled
    if (this.#config.realTimeAlerts && record.severity !== AuditLogger.#EVENT_SEVERITY.INFO) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Checks if entity is being watched
   */
  #isWatchedEntity(record) {
    // Check user watchlist
    if (record.actor.id && this.#watchedEntities.has(record.actor.id)) {
      return true;
    }

    // Check IP watchlist
    if (record.request?.ip && this.#watchedEntities.has(record.request.ip)) {
      return true;
    }

    // Check resource watchlist
    if (record.resource.id && this.#watchedEntities.has(record.resource.id)) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Processes audit record immediately
   */
  async #processAuditRecord(record) {
    try {
      // Encrypt if enabled
      if (this.#config.encryptionEnabled) {
        record.data = await this.#encryptionService.encrypt(
          JSON.stringify(record.metadata)
        );
        record.metadata = { encrypted: true };
      }

      // Store audit record
      const stored = await this.#auditService.logEvent(record);

      // Track metrics
      this.#trackEventMetrics(record);

      // Check alert thresholds
      await this.#checkAlertThresholds(record);

      // Log high-priority event
      logger.warn('High-priority audit event', {
        auditId: record.id,
        event: record.event,
        severity: record.severity,
        actor: record.actor.id
      });

      return stored.id || record.id;

    } catch (error) {
      logger.error('Failed to process audit record', {
        auditId: record.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * @private
   * Queues audit record for batch processing
   */
  #queueAuditRecord(record) {
    const batchKey = this.#getCurrentBatchKey();
    
    if (!this.#auditQueue.has(batchKey)) {
      this.#auditQueue.set(batchKey, []);
    }

    this.#auditQueue.get(batchKey).push(record);
  }

  /**
   * @private
   * Checks if should flush queue
   */
  #shouldFlushQueue() {
    const currentBatch = this.#auditQueue.get(this.#getCurrentBatchKey());
    return currentBatch && currentBatch.length >= this.#config.batchSize;
  }

  /**
   * @private
   * Flushes audit queue
   */
  async #flushQueue() {
    if (this.#auditQueue.size === 0) return;

    const batches = Array.from(this.#auditQueue.entries());
    this.#auditQueue.clear();

    for (const [batchKey, records] of batches) {
      try {
        await this.#processBatch(records);
      } catch (error) {
        logger.error('Failed to process audit batch', {
          batchKey,
          recordCount: records.length,
          error: error.message
        });

        // Re-queue failed records
        records.forEach(record => this.#queueAuditRecord(record));
      }
    }
  }

  /**
   * @private
   * Processes a batch of audit records
   */
  async #processBatch(records) {
    if (records.length === 0) return;

    // Encrypt batch if enabled
    if (this.#config.encryptionEnabled) {
      const encrypted = await Promise.all(
        records.map(async record => ({
          ...record,
          data: await this.#encryptionService.encrypt(
            JSON.stringify(record.metadata)
          ),
          metadata: { encrypted: true }
        }))
      );
      records = encrypted;
    }

    // Compress batch if enabled
    if (this.#config.compressionEnabled) {
      // Compression implementation would go here
    }

    // Store batch
    await AuditLogModel.insertMany(records);

    // Track metrics
    records.forEach(record => this.#trackEventMetrics(record));

    logger.info('Audit batch processed', {
      recordCount: records.length,
      events: [...new Set(records.map(r => r.event))]
    });
  }

  /**
   * @private
   * Tracks event metrics
   */
  #trackEventMetrics(record) {
    const key = `${record.event}:${record.result}`;
    const count = (this.#eventMetrics.get(key) || 0) + 1;
    this.#eventMetrics.set(key, count);
  }

  /**
   * @private
   * Checks alert thresholds
   */
  async #checkAlertThresholds(record) {
    const metrics = this.#getRecentMetrics();

    // Check failed login threshold
    if (record.event === 'auth.failed') {
      const failedLogins = metrics['auth.failed:failure'] || 0;
      if (failedLogins >= this.#config.alertThresholds.failedLogins) {
        await this.#sendSecurityAlert('failed_logins', {
          count: failedLogins,
          threshold: this.#config.alertThresholds.failedLogins,
          actor: record.actor
        });
      }
    }

    // Check access denied threshold
    if (record.event === 'authz.access_denied') {
      const accessDenied = metrics['authz.access_denied:failure'] || 0;
      if (accessDenied >= this.#config.alertThresholds.accessDenied) {
        await this.#sendSecurityAlert('access_denied', {
          count: accessDenied,
          threshold: this.#config.alertThresholds.accessDenied,
          resource: record.resource
        });
      }
    }

    // Check data export threshold
    if (record.event === 'data.export') {
      const dataExports = metrics['data.export:success'] || 0;
      if (dataExports >= this.#config.alertThresholds.dataExports) {
        await this.#sendSecurityAlert('data_exports', {
          count: dataExports,
          threshold: this.#config.alertThresholds.dataExports,
          actor: record.actor
        });
      }
    }
  }

  /**
   * @private
   * Gets recent metrics
   */
  #getRecentMetrics() {
    // In production, this would query recent events from database
    // For now, return current in-memory metrics
    const metrics = {};
    for (const [key, value] of this.#eventMetrics.entries()) {
      metrics[key] = value;
    }
    return metrics;
  }

  /**
   * @private
   * Sends security alert
   */
  async #sendSecurityAlert(type, data) {
    logger.error(`SECURITY ALERT: ${type}`, data);
    
    // In production, this would send notifications via
    // email, Slack, PagerDuty, etc.
  }

  /**
   * @private
   * Audits HTTP request
   */
  async #auditHttpRequest(req, res, options) {
    // Skip non-auditable requests
    if (this.#shouldSkipHttpAudit(req, options)) {
      return;
    }

    const event = {
      event: this.#determineHttpEvent(req, res),
      timestamp: new Date().toISOString(),
      actor: req.user || { type: 'anonymous', id: req.ip },
      resource: {
        type: 'http_endpoint',
        id: req.route?.path || req.path,
        path: req.path
      },
      action: req.method,
      result: res.statusCode < 400 ? 'success' : 'failure',
      metadata: {
        statusCode: res.statusCode,
        responseTime: res.locals.responseTime,
        query: req.query,
        body: this.#sanitizeRequestBody(req.body)
      }
    };

    await this.logEvent(event, req);
  }

  /**
   * @private
   * Checks if should skip HTTP audit
   */
  #shouldSkipHttpAudit(req, options) {
    // Skip health checks
    if (req.path === '/health' || req.path === '/metrics') {
      return true;
    }

    // Skip static files
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico)$/)) {
      return true;
    }

    // Skip based on options
    if (options.skip && options.skip(req)) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Determines HTTP event type
   */
  #determineHttpEvent(req, res) {
    // Authentication endpoints
    if (req.path.includes('/auth/login')) {
      return res.statusCode === 200 ? 'auth.login' : 'auth.failed';
    }
    if (req.path.includes('/auth/logout')) {
      return 'auth.logout';
    }

    // Data operations
    switch (req.method) {
      case 'GET':
        return 'data.read';
      case 'POST':
        return 'data.write';
      case 'PUT':
      case 'PATCH':
        return 'data.update';
      case 'DELETE':
        return 'data.delete';
      default:
        return 'http.request';
    }
  }

  /**
   * @private
   * Sanitizes request body
   */
  #sanitizeRequestBody(body) {
    if (!body) return null;

    const sanitized = JSON.parse(JSON.stringify(body));
    const sensitiveFields = ['password', 'token', 'secret', 'creditCard', 'ssn'];

    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * @private
   * Gets current batch key
   */
  #getCurrentBatchKey() {
    return `batch_${Math.floor(Date.now() / this.#config.flushInterval)}`;
  }

  /**
   * @private
   * Generates audit ID
   */
  #generateAuditId() {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Searches audit logs
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array>} Audit logs
   */
  async searchAuditLogs(criteria) {
    const query = {};

    if (criteria.startDate || criteria.endDate) {
      query.timestamp = {};
      if (criteria.startDate) {
        query.timestamp.$gte = criteria.startDate;
      }
      if (criteria.endDate) {
        query.timestamp.$lte = criteria.endDate;
      }
    }

    if (criteria.event) {
      query.event = criteria.event;
    }

    if (criteria.actor) {
      query['actor.id'] = criteria.actor;
    }

    if (criteria.resource) {
      query['resource.id'] = criteria.resource;
    }

    if (criteria.result) {
      query.result = criteria.result;
    }

    const logs = await AuditLogModel.find(query)
      .sort({ timestamp: -1 })
      .limit(criteria.limit || 100);

    // Decrypt metadata if needed
    if (this.#config.encryptionEnabled) {
      return await Promise.all(
        logs.map(async log => {
          if (log.data) {
            try {
              const decrypted = await this.#encryptionService.decrypt(log.data);
              log.metadata = JSON.parse(decrypted);
              delete log.data;
            } catch (error) {
              logger.error('Failed to decrypt audit log', {
                auditId: log.id,
                error: error.message
              });
            }
          }
          return log;
        })
      );
    }

    return logs;
  }

  /**
   * Generates compliance report
   * @param {Object} options - Report options
   * @returns {Promise<Object>} Compliance report
   */
  async generateComplianceReport(options) {
    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: options.startDate,
        end: options.endDate
      },
      summary: {},
      details: {}
    };

    // Get audit logs for period
    const logs = await this.searchAuditLogs({
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 10000
    });

    // Analyze by compliance standard
    if (this.#config.complianceStandards.hipaa) {
      report.details.hipaa = await this.#analyzeHipaaCompliance(logs);
    }

    if (this.#config.complianceStandards.gdpr) {
      report.details.gdpr = await this.#analyzeGdprCompliance(logs);
    }

    if (this.#config.complianceStandards.sox) {
      report.details.sox = await this.#analyzeSoxCompliance(logs);
    }

    // Generate summary
    report.summary = {
      totalEvents: logs.length,
      criticalEvents: logs.filter(l => l.severity === 'critical').length,
      failedEvents: logs.filter(l => l.result === 'failure').length,
      complianceScore: this.#calculateComplianceScore(report.details)
    };

    return report;
  }

  /**
   * @private
   * Analyzes HIPAA compliance
   */
  async #analyzeHipaaCompliance(logs) {
    return {
      phiAccess: logs.filter(l => l.compliance?.hipaa).length,
      unauthorizedAttempts: logs.filter(l => 
        l.compliance?.hipaa && l.result === 'failure'
      ).length
    };
  }

  /**
   * @private
   * Analyzes GDPR compliance
   */
  async #analyzeGdprCompliance(logs) {
    return {
      dataRequests: logs.filter(l => l.event === 'compliance.data_request').length,
      dataDeletions: logs.filter(l => l.event === 'compliance.data_deletion').length,
      consentEvents: logs.filter(l => 
        l.event.includes('consent')
      ).length
    };
  }

  /**
   * @private
   * Analyzes SOX compliance
   */
  async #analyzeSoxCompliance(logs) {
    return {
      financialAccess: logs.filter(l => l.compliance?.sox).length,
      configChanges: logs.filter(l => 
        l.event.includes('config') && l.compliance?.sox
      ).length
    };
  }

  /**
   * @private
   * Calculates compliance score
   */
  #calculateComplianceScore(details) {
    // Simple scoring algorithm
    let score = 100;

    // Deduct for unauthorized access
    Object.values(details).forEach(detail => {
      if (detail.unauthorizedAttempts) {
        score -= detail.unauthorizedAttempts * 2;
      }
    });

    return Math.max(0, score);
  }

  /**
   * Gets audit statistics
   * @returns {Object} Audit statistics
   */
  getStatistics() {
    const stats = {
      queuedEvents: Array.from(this.#auditQueue.values())
        .reduce((sum, batch) => sum + batch.length, 0),
      eventCounts: {},
      watchedEntities: this.#watchedEntities.size
    };

    // Convert metrics to counts
    for (const [key, count] of this.#eventMetrics.entries()) {
      const [event] = key.split(':');
      stats.eventCounts[event] = (stats.eventCounts[event] || 0) + count;
    }

    return stats;
  }

  /**
   * Adds entity to watchlist
   * @param {string} entity - Entity ID
   * @param {string} [type] - Entity type
   */
  addToWatchlist(entity, type) {
    this.#watchedEntities.add(entity);
    logger.info('Entity added to audit watchlist', { entity, type });
  }

  /**
   * Removes entity from watchlist
   * @param {string} entity - Entity ID
   */
  removeFromWatchlist(entity) {
    this.#watchedEntities.delete(entity);
    logger.info('Entity removed from audit watchlist', { entity });
  }

  /**
   * Flushes pending audits immediately
   * @returns {Promise<void>}
   */
  async flush() {
    await this.#flushQueue();
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates AuditLogger instance
 * @param {Object} [options] - Configuration options
 * @returns {AuditLogger} AuditLogger instance
 */
const getAuditLogger = (options) => {
  if (!instance) {
    instance = new AuditLogger(options);
  }
  return instance;
};

module.exports = {
  AuditLogger,
  getAuditLogger,
  // Export convenience methods
  logEvent: (event, req) => getAuditLogger().logEvent(event, req),
  middleware: (options) => getAuditLogger().middleware(options),
  searchAuditLogs: (criteria) => getAuditLogger().searchAuditLogs(criteria),
  generateComplianceReport: (options) => getAuditLogger().generateComplianceReport(options)
};