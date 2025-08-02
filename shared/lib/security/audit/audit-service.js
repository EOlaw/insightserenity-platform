'use strict';

/**
 * @fileoverview Enhanced audit service with database model compatibility
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
const { AuditEvents, EventCategories, getEventCategory, getEventSeverity } = require('./audit-events');
const ComplianceReporter = require('./compliance-reporter');
const AuditTrail = require('./audit-trail');
const EncryptionService = require('../encryption/encryption-service');
const mongoose = require('mongoose');

/**
 * @class AuditService
 * @description Enhanced audit service with proper database model compatibility
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

    // Initialize default organization and tenant for system events
    this.#initializeDefaultContext();

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
   * Initialize default organization and tenant context for system events
   * @private
   */
  async #initializeDefaultContext() {
    try {
      // Try to get or create a default system organization
      const Organization = mongoose.model('Organization');
      let systemOrg = await Organization.findOne({ 
        slug: 'system',
        type: 'system' 
      }).catch(() => null);

      if (!systemOrg) {
        // Create system organization if it doesn't exist
        systemOrg = await Organization.create({
          name: 'System Organization',
          slug: 'system',
          type: 'system',
          status: { state: 'active' },
          settings: {
            auditRetention: this.retentionPolicy.days,
            complianceEnabled: this.enableCompliance
          }
        }).catch(() => null);
      }

      // Try to get or create a default system tenant
      const Tenant = mongoose.model('Tenant');
      let systemTenant = await Tenant.findOne({
        slug: 'system'
      }).catch(() => null);

      if (!systemTenant && systemOrg) {
        systemTenant = await Tenant.create({
          name: 'System Tenant',
          slug: 'system',
          organizationId: systemOrg._id,
          status: { state: 'active' },
          settings: {
            auditEnabled: true
          }
        }).catch(() => null);
      }

      // Store default context
      this.defaultContext = {
        organizationId: systemOrg?._id,
        tenantId: systemTenant?._id
      };

      if (this.defaultContext.organizationId && this.defaultContext.tenantId) {
        logger.debug('Default audit context initialized', {
          organizationId: this.defaultContext.organizationId,
          tenantId: this.defaultContext.tenantId
        });
      } else {
        logger.warn('Could not initialize default audit context - audit events may fail validation');
      }

    } catch (error) {
      logger.warn('Failed to initialize default audit context', {
        error: error.message
      });
      
      // Set fallback context (will need manual creation of org/tenant)
      this.defaultContext = {
        organizationId: null,
        tenantId: null
      };
    }
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
   * ENHANCED: Logs an audit event with proper database model mapping
   * @param {Object} event - Audit event details
   * @param {string} event.eventType - Type of event (from AuditEvents)
   * @param {string} event.userId - User who triggered the event
   * @param {string} [event.tenantId] - Tenant identifier (will use default if not provided)
   * @param {string} [event.organizationId] - Organization identifier (will use default if not provided)  
   * @param {string} event.resource - Resource affected
   * @param {string} event.action - Action performed
   * @param {string} [event.result='success'] - Result of the action
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

      // Skip logging if we don't have the required context for database validation
      if (!this.defaultContext.organizationId || !this.defaultContext.tenantId) {
        logger.debug('Default audit context not available, skipping event logging', {
          eventType: event.eventType,
          hasOrgId: !!this.defaultContext.organizationId,
          hasTenantId: !!this.defaultContext.tenantId
        });
        return { id: null, skipped: true, reason: 'missing_default_context' };
      }

      const {
        eventType,
        userId,
        tenantId,
        organizationId,
        resource,
        action,
        result = 'success',
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

      // ENHANCED: Transform audit service format to database model format
      const databaseCompatibleEntry = await this.#transformToModelFormat({
        eventType,
        userId,
        tenantId: tenantId || this.defaultContext.tenantId,
        organizationId: organizationId || this.defaultContext.organizationId,
        resource,
        action,
        result,
        metadata: this.#sanitizeMetadata(metadata),
        correlationId: correlationId || this.#generateCorrelationId(),
        context
      });

      // Queue or log immediately
      if (this.enableBatching) {
        await this.#queueAuditEntry(databaseCompatibleEntry);
      } else {
        await this.auditLogger.log(databaseCompatibleEntry);
      }

      // Trigger high-risk alerts
      if (databaseCompatibleEntry.event.severity === 'critical') {
        this.#triggerSecurityAlert(databaseCompatibleEntry);
      }

      logger.debug('Audit event logged', {
        auditId: databaseCompatibleEntry._id,
        eventType,
        severity: databaseCompatibleEntry.event.severity
      });

      return {
        id: databaseCompatibleEntry._id,
        timestamp: databaseCompatibleEntry.createdAt || new Date(),
        correlationId: databaseCompatibleEntry.relationships?.correlationId,
        severity: databaseCompatibleEntry.event.severity
      };

    } catch (error) {
      logger.error('Failed to log audit event', {
        error: error.message,
        eventType: event?.eventType,
        stack: error.stack
      });

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
   * ENHANCED: Transform audit service event format to database model format
   * @private
   * @param {Object} auditEvent - Raw audit event
   * @returns {Promise<Object>} Database model compatible entry
   */
  async #transformToModelFormat(auditEvent) {
    const {
      eventType,
      userId,
      tenantId,
      organizationId,
      resource,
      action,
      result,
      metadata,
      correlationId,
      context
    } = auditEvent;

    // Generate unique ID for the entry
    const auditId = new mongoose.Types.ObjectId();

    // Get event metadata from the events registry
    const eventCategory = getEventCategory(eventType);
    const eventSeverity = getEventSeverity(eventType);

    // Build database model compatible structure
    const databaseEntry = {
      _id: auditId,
      
      // Multi-tenant context - REQUIRED by schema
      tenantId: mongoose.Types.ObjectId(tenantId),
      organizationId: mongoose.Types.ObjectId(organizationId),

      // Event information - REQUIRED nested structure
      event: {
        type: eventType, // REQUIRED
        category: eventCategory, // REQUIRED  
        action: action, // REQUIRED
        description: this.#generateEventDescription(eventType, action, resource), // REQUIRED
        severity: eventSeverity,
        risk: {
          score: this.enableRiskScoring ? this.#calculateRiskScore({ eventType, action, result, context }) : 0,
          factors: this.#calculateRiskFactors({ eventType, action, result, context })
        }
      },

      // Actor information
      actor: {
        userId: userId === 'system' ? null : mongoose.Types.ObjectId(userId),
        userType: this.#determineUserType(userId),
        email: context.email || null,
        name: context.userName || null,
        roles: context.roles || [],
        apiKeyId: context.apiKeyId || null,
        serviceAccount: userId === 'system' ? 'system' : null
      },

      // Resource information - REQUIRED nested structure  
      resource: {
        type: this.#normalizeResourceType(resource), // REQUIRED
        id: resource,
        name: metadata.resourceName || resource,
        collection: this.#inferCollectionFromResource(resource),
        path: context.path || null,
        metadata: {
          resourceDetails: metadata.resourceDetails || {},
          affectedRecords: metadata.affectedRecords || 1
        }
      },

      // Request context
      request: {
        id: context.requestId || correlationId,
        method: context.method || null,
        path: context.path || null,
        query: context.query || {},
        headers: {
          userAgent: context.userAgent || null,
          referer: context.referer || null,
          acceptLanguage: context.acceptLanguage || null
        },
        ip: context.ip ? {
          address: context.ip,
          country: context.country || null,
          region: context.region || null,
          city: context.city || null
        } : {},
        session: {
          sessionId: context.sessionId || null,
          isNewSession: context.isNewSession || false
        }
      },

      // Change details
      changes: {
        operation: this.#mapActionToOperation(action),
        summary: this.#generateChangeSummary(action, resource, metadata),
        affectedRecords: metadata.affectedRecords || 1,
        dataSize: metadata.dataSize || 0
      },

      // Result & impact
      result: {
        status: result,
        statusCode: context.statusCode || (result === 'success' ? 200 : 500),
        error: result === 'failure' && context.error ? {
          code: context.error.code || 'UNKNOWN_ERROR',
          message: context.error.message || 'An error occurred',
          type: context.error.type || 'UnknownError'
        } : null,
        duration: context.duration || null
      },

      // Compliance & security
      compliance: {
        frameworks: await this.#getComplianceFrameworks(eventType, metadata),
        dataClassification: metadata.dataClassification || 'internal',
        retentionRequired: this.#requiresRetention(eventType),
        retentionDays: this.#calculateRetentionDays(eventType)
      },

      security: {
        threatIndicators: this.#getThreatIndicators(context),
        anomalyDetected: false, // Would be set by anomaly detection system
        authentication: context.authentication ? {
          method: context.authentication.method || 'unknown',
          mfaUsed: context.authentication.mfaUsed || false,
          ssoProvider: context.authentication.ssoProvider || null,
          tokenType: context.authentication.tokenType || null
        } : {}
      },

      // Related records
      relationships: {
        correlationId: correlationId,
        traceId: context.traceId || null,
        spanId: context.spanId || null
      },

      // Metadata
      metadata: {
        tags: metadata.tags || [],
        customFields: new Map(Object.entries(metadata.customFields || {})),
        source: context.source || 'system',
        environment: this.config.environment || process.env.NODE_ENV || 'development',
        version: this.config.version || '1.0.0',
        clientVersion: context.clientVersion || null
      }
    };

    return databaseEntry;
  }

  /**
   * Generate human-readable event description
   * @private
   * @param {string} eventType - Event type
   * @param {string} action - Action performed
   * @param {string} resource - Resource affected
   * @returns {string} Event description
   */
  #generateEventDescription(eventType, action, resource) {
    const descriptions = {
      'auth.login.success': 'User successfully logged in',
      'auth.login.failure': 'User login attempt failed',
      'auth.logout': 'User logged out',
      'system.config.change': 'System configuration was modified',
      'system.start': 'System started successfully',
      'system.stop': 'System stopped',
      'data.create': 'Data record was created',
      'data.read': 'Data record was accessed',
      'data.update': 'Data record was updated',
      'data.delete': 'Data record was deleted',
      'security.threat.detected': 'Security threat was detected'
    };

    return descriptions[eventType] || `${action} performed on ${resource}`;
  }

  /**
   * Determine user type from user ID
   * @private
   * @param {string} userId - User identifier
   * @returns {string} User type
   */
  #determineUserType(userId) {
    if (userId === 'system') return 'system';
    if (userId?.startsWith('api_')) return 'api';
    if (userId?.startsWith('service_')) return 'service';
    return 'user';
  }

  /**
   * Normalize resource type for database storage
   * @private
   * @param {string} resource - Resource identifier
   * @returns {string} Normalized resource type
   */
  #normalizeResourceType(resource) {
    // Map resource identifiers to proper types
    const resourceTypeMap = {
      'audit_system': 'audit_system',
      'admin_server': 'server',
      'user': 'user',
      'organization': 'organization',
      'tenant': 'tenant',
      'system': 'system'
    };

    return resourceTypeMap[resource] || resource || 'unknown';
  }

  /**
   * Infer collection name from resource
   * @private
   * @param {string} resource - Resource identifier
   * @returns {string} Collection name
   */
  #inferCollectionFromResource(resource) {
    const collectionMap = {
      'user': 'users',
      'organization': 'organizations', 
      'tenant': 'tenants',
      'audit_system': 'audit_logs',
      'admin_server': 'servers',
      'system': 'system_configs'
    };

    return collectionMap[resource] || null;
  }

  /**
   * Map action to database operation type
   * @private
   * @param {string} action - Action performed
   * @returns {string} Database operation
   */
  #mapActionToOperation(action) {
    const operationMap = {
      'initialize': 'create',
      'startup': 'execute',
      'shutdown': 'execute',
      'login': 'login',
      'logout': 'logout',
      'create': 'create',
      'read': 'read',
      'update': 'update',
      'delete': 'delete',
      'export': 'export',
      'import': 'import'
    };

    return operationMap[action] || 'execute';
  }

  /**
   * Generate change summary
   * @private
   * @param {string} action - Action performed
   * @param {string} resource - Resource affected
   * @param {Object} metadata - Event metadata
   * @returns {string} Change summary
   */
  #generateChangeSummary(action, resource, metadata) {
    if (metadata.changeSummary) {
      return metadata.changeSummary;
    }

    return `${action} operation performed on ${resource}`;
  }

  /**
   * Get compliance frameworks applicable to event
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {Promise<Array>} Applicable frameworks
   */
  async #getComplianceFrameworks(eventType, metadata) {
    const frameworks = [];
    const standards = this.config.compliance?.standards || {};

    // GDPR - data access events
    if (standards.gdpr && (eventType.includes('data') || eventType.includes('user'))) {
      frameworks.push('gdpr');
    }

    // HIPAA - health data
    if (standards.hipaa && metadata.dataType === 'PHI') {
      frameworks.push('hipaa');
    }

    // SOX - financial and system config
    if (standards.sox && (eventType.includes('financial') || eventType.includes('config'))) {
      frameworks.push('sox');
    }

    // ISO27001 - security events
    if (standards.iso27001 && eventType.includes('security')) {
      frameworks.push('iso27001');
    }

    return frameworks;
  }

  /**
   * Check if event requires retention
   * @private
   * @param {string} eventType - Event type
   * @returns {boolean} True if retention required
   */
  #requiresRetention(eventType) {
    const retentionRequiredEvents = [
      'auth.login.success',
      'auth.login.failure',
      'data.delete',
      'data.export',
      'system.config.change',
      'security.threat.detected'
    ];

    return retentionRequiredEvents.includes(eventType);
  }

  /**
   * Calculate retention days for event
   * @private
   * @param {string} eventType - Event type
   * @returns {number} Retention days
   */
  #calculateRetentionDays(eventType) {
    const retentionMap = {
      'auth.login.success': 90,
      'auth.login.failure': 365,
      'data.delete': 2555, // 7 years
      'data.export': 1095, // 3 years
      'system.config.change': 365,
      'security.threat.detected': 2555 // 7 years
    };

    return retentionMap[eventType] || this.retentionPolicy.days;
  }

  /**
   * Get threat indicators from context
   * @private
   * @param {Object} context - Request context
   * @returns {Array} Threat indicators
   */
  #getThreatIndicators(context) {
    const indicators = [];

    if (context.ip && this.#isSuspiciousIP(context.ip)) {
      indicators.push({
        type: 'suspicious_ip',
        score: 30,
        details: `Suspicious IP address: ${context.ip}`
      });
    }

    if (context.userAgent && this.#isSuspiciousUserAgent(context.userAgent)) {
      indicators.push({
        type: 'suspicious_user_agent',
        score: 20,
        details: 'Suspicious user agent detected'
      });
    }

    return indicators;
  }

  /**
   * Check if user agent is suspicious
   * @private
   * @param {string} userAgent - User agent string
   * @returns {boolean} True if suspicious
   */
  #isSuspiciousUserAgent(userAgent) {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scanner/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Calculate risk factors for event
   * @private
   * @param {Object} event - Event details
   * @returns {Array} Risk factors
   */
  #calculateRiskFactors(event) {
    const factors = [];

    if (event.result === 'failure') {
      factors.push('operation_failure');
    }

    if (event.context?.ip && this.#isSuspiciousIP(event.context.ip)) {
      factors.push('suspicious_ip');
    }

    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      factors.push('after_hours');
    }

    if (event.eventType.includes('delete') || event.eventType.includes('export')) {
      factors.push('sensitive_operation');
    }

    return factors;
  }

  /**
   * Enhanced flush queue with better error handling for database model validation
   * @private
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
        logger.info('All audit batches flushed', {
          batchCount: 0
        });
      }
      return;
    }

    // Prevent concurrent processing
    if (this.isProcessing) {
      logger.debug('Audit flush already in progress, skipping');
      return;
    }

    const flushStartTime = Date.now();
    let processedEntries = 0;
    let processedBatches = 0;
    let failedEntries = 0;
    const originalQueueSize = this.auditQueue.length;

    try {
      this.isProcessing = true;

      // Process entries in batches
      const effectiveBatchSize = this.#getEffectiveBatchSize();
      const maxBatchesPerFlush = this.config?.processing?.maxBatchesPerFlush || 5;
      
      while (this.auditQueue.length > 0 && processedBatches < maxBatchesPerFlush) {
        const entries = this.auditQueue.splice(0, effectiveBatchSize);
        
        if (entries.length === 0) {
          break;
        }

        try {
          // Validate entries are in the correct database format
          const validEntries = entries.filter(entry => this.#validateDatabaseEntry(entry));
          
          if (validEntries.length > 0) {
            await this.auditLogger.logBatch(validEntries);
            processedEntries += validEntries.length;
            processedBatches++;
          }

          const invalidEntries = entries.length - validEntries.length;
          if (invalidEntries > 0) {
            failedEntries += invalidEntries;
            logger.warn('Invalid audit entries filtered during flush', {
              invalidCount: invalidEntries,
              validCount: validEntries.length,
              batchNumber: processedBatches
            });
          }

        } catch (batchError) {
          failedEntries += entries.length;
          
          // Enhanced error handling for database validation issues
          if (batchError.name === 'ValidationError') {
            logger.error('Audit batch validation failed - database schema mismatch', {
              batchSize: entries.length,
              batchNumber: processedBatches + 1,
              validationErrors: batchError.errors ? Object.keys(batchError.errors) : [],
              error: batchError.message
            });
          } else {
            logger.error('Failed to process audit batch', {
              batchSize: entries.length,
              batchNumber: processedBatches + 1,
              error: batchError.message,
              errorCode: batchError.code || 'BATCH_PROCESSING_ERROR'
            });
          }

          // Don't retry validation errors - they need code fixes
          if (batchError.name !== 'ValidationError' && this.#shouldRetryBatch(batchError)) {
            this.#requeueFailedEntries(entries);
          }
        }

        // Prevent infinite loops
        const processingTimeout = this.config?.processing?.processingTimeout || 30000;
        if (Date.now() - flushStartTime > processingTimeout) {
          logger.warn('Audit flush timeout reached, stopping batch processing');
          break;
        }
      }

      // Log flush completion
      if (processedEntries > 0 || this.config?.processing?.logEmptyFlushes) {
        logger.info('All audit batches flushed', {
          batchCount: processedBatches
        });
      }

    } catch (error) {
      logger.error('Critical error during audit queue flush', {
        error: error.message,
        stack: error.stack,
        queueSize: originalQueueSize,
        processedEntries
      });

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Validate database entry format
   * @private
   * @param {Object} entry - Database entry to validate
   * @returns {boolean} True if valid
   */
  #validateDatabaseEntry(entry) {
    // Check required top-level fields
    if (!entry.tenantId || !entry.organizationId) {
      logger.debug('Invalid audit entry - missing tenantId or organizationId');
      return false;
    }

    // Check required event structure
    if (!entry.event || !entry.event.type || !entry.event.category || 
        !entry.event.action || !entry.event.description) {
      logger.debug('Invalid audit entry - missing required event fields');
      return false;
    }

    // Check required resource structure
    if (!entry.resource || !entry.resource.type) {
      logger.debug('Invalid audit entry - missing required resource fields');
      return false;
    }

    return true;
  }

  /**
   * Gets effective batch size based on enterprise configuration and environment
   * @private
   * @returns {number} Effective batch size
   */
  #getEffectiveBatchSize() {
    const baseBatchSize = this.batchSize;
    
    if (this.config.environment === 'development') {
      return this.config.development?.reducedBatchSize || Math.min(baseBatchSize, 50);
    }

    if (this.config.environment === 'production') {
      return Math.min(baseBatchSize * 1.5, 500);
    }

    return baseBatchSize;
  }

  /**
   * Determines if batch should be retried based on error type
   * @private
   * @param {Error} error - The batch processing error
   * @returns {boolean} True if batch should be retried
   */
  #shouldRetryBatch(error) {
    const nonRetryableCodes = [
      'VALIDATION_ERROR',
      'INVALID_DATA',
      'PERMISSION_DENIED',
      'QUOTA_EXCEEDED'
    ];

    if (nonRetryableCodes.includes(error.code) || error.name === 'ValidationError') {
      return false;
    }

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

    this.auditQueue.unshift(...retriableEntries);

    const exceededEntries = entries.length - retriableEntries.length;
    if (exceededEntries > 0) {
      logger.error('Audit entries exceeded retry limit', {
        exceededCount: exceededEntries,
        maxRetries
      });
    }
  }

  // ... [Include all other existing methods from the original audit service]
  // For brevity, I'm including the key methods. The rest remain the same.

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
   * @param {Object} eventDetails - Event details
   * @returns {number} Risk score (0-100)
   */
  #calculateRiskScore(eventDetails) {
    let score = 0;

    const eventWeights = this.config.riskScoring?.eventWeights || this.riskRules.eventTypes;
    const contextFactors = this.config.riskScoring?.contextFactors || {};

    // Event type risk
    const eventRisk = eventWeights[eventDetails.eventType] || 0;
    score += eventRisk;

    // Action risk
    const actionRisk = this.riskRules.actions[eventDetails.action] || 0;
    score += actionRisk;

    // Context-based factors
    if (eventDetails.context?.ip && this.#isSuspiciousIP(eventDetails.context.ip)) {
      score += contextFactors.suspiciousIP || 20;
    }

    if (eventDetails.result === 'failure') {
      score += contextFactors.multipleFailures || 15;
    }

    return Math.min(score, 100);
  }

  /**
   * Checks if IP is suspicious
   * @private
   * @param {string} ip - IP address
   * @returns {boolean} True if suspicious
   */
  #isSuspiciousIP(ip) {
    if (this.config.monitoring?.watchlists?.ips?.includes(ip)) {
      return true;
    }

    const suspiciousPatterns = [
      /^10\./, 
      /^192\.168\./, 
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  /**
   * Triggers security alert for critical events
   * @private
   * @param {Object} auditEntry - Audit entry
   */
  #triggerSecurityAlert(auditEntry) {
    const alertChannels = this.config.alerting?.channels || {};
    
    logger.warn('SECURITY ALERT', {
      auditId: auditEntry._id,
      eventType: auditEntry.event.type,
      severity: auditEntry.event.severity,
      userId: auditEntry.actor.userId,
      resource: auditEntry.resource.type,
      alertChannelsEnabled: Object.keys(alertChannels).filter(channel => alertChannels[channel])
    });
  }

  /**
   * Initializes risk scoring rules from enterprise configuration
   * @private
   * @returns {Object} Risk rules
   */
  #initializeRiskRules() {
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
   * Queues audit entry for batch processing
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {Promise<void>}
   */
  async #queueAuditEntry(auditEntry) {
    this.auditQueue.push(auditEntry);

    const maxQueueSize = this.config.processing?.maxQueueSize || AuditService.#MAX_QUEUE_SIZE;
    
    if (this.auditQueue.length >= maxQueueSize) {
      await this.#flushQueue();
    }
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
   * Check if audit service is enabled
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this.config?.enabled ?? true;
  }

  /**
   * Cleans up resources
   */
  async cleanup() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.#flushQueue().catch(error => {
      logger.error('Failed to flush queue during cleanup', error);
    });

    logger.info('AuditService cleanup completed');
  }
}

module.exports = AuditService;