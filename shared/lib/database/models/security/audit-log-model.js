'use strict';

/**
 * @fileoverview Core audit log model for tracking all system operations and changes
 * @module shared/lib/database/models/security/audit-log-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/audit-events
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
console.log('BaseModel loading...', typeof BaseModel);
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const { AuditEvents, EventCategories } = require('../../../security/audit/audit-events');
const encryptionService = require('../../../security/encryption/encryption-service');

/**
 * Audit log schema definition for comprehensive activity tracking
 */
const auditLogSchemaDefinition = {
  // ==================== Multi-Tenant Context ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // ==================== Event Information ====================
  event: {
    type: {
      type: String,
      required: true,
      enum: Object.values(AuditEvents.AUTH).concat(Object.values(AuditEvents.USER), Object.values(AuditEvents.ORGANIZATION), Object.values(AuditEvents.DATA), Object.values(AuditEvents.SECURITY), Object.values(AuditEvents.SYSTEM), Object.values(AuditEvents.API), Object.values(AuditEvents.CONFIG), Object.values(AuditEvents.COMPLIANCE), Object.values(AuditEvents.BUSINESS), Object.values(AuditEvents.COMMUNICATION)),
      index: true
    },
    category: {
      type: String,
      required: true,
      enum: Object.values(EventCategories),
      index: true
    },
    subCategory: String,
    action: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info'],
      default: 'info',
      index: true
    },
    risk: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      factors: [String]
    }
  },

  // ==================== Actor Information ====================
  actor: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    userType: {
      type: String,
      enum: ['user', 'admin', 'system', 'api', 'service', 'anonymous'],
      default: 'user'
    },
    email: String,
    name: String,
    roles: [String],
    apiKeyId: String,
    serviceAccount: String,
    impersonatedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String
    }
  },

  // ==================== Resource Information ====================
  resource: {
    type: {
      type: String,
      required: true,
      index: true
    },
    id: {
      type: String,
      index: true
    },
    name: String,
    collection: String,
    path: String,
    parentType: String,
    parentId: String,
    metadata: mongoose.Schema.Types.Mixed
  },

  // ==================== Request Context ====================
  request: {
    id: {
      type: String,
      index: true
    },
    method: String,
    path: String,
    query: mongoose.Schema.Types.Mixed,
    headers: {
      userAgent: String,
      referer: String,
      acceptLanguage: String
    },
    ip: {
      address: {
        type: String,
        index: true
      },
      encryptedAddress: String,
      country: String,
      region: String,
      city: String,
      isp: String,
      isVpn: Boolean,
      isTor: Boolean,
      threatLevel: String
    },
    device: {
      type: String,
      browser: String,
      browserVersion: String,
      os: String,
      osVersion: String,
      isMobile: Boolean
    },
    session: {
      sessionId: String,
      isNewSession: Boolean,
      duration: Number
    }
  },

  // ==================== Change Details ====================
  changes: {
    operation: {
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'execute', 'login', 'logout', 'export', 'import'],
      index: true
    },
    fields: [{
      name: String,
      path: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      encrypted: Boolean,
      sensitive: Boolean
    }],
    summary: String,
    affectedRecords: Number,
    dataSize: Number
  },

  // ==================== Result & Impact ====================
  result: {
    status: {
      type: String,
      enum: ['success', 'failure', 'partial', 'pending'],
      default: 'success',
      index: true
    },
    statusCode: Number,
    error: {
      code: String,
      message: String,
      stack: String,
      type: String
    },
    duration: Number,
    performanceMetrics: {
      dbQueries: Number,
      cacheHits: Number,
      cacheMisses: Number,
      externalApiCalls: Number
    }
  },

  // ==================== Compliance & Security ====================
  compliance: {
    frameworks: [{
      type: String,
      enum: ['gdpr', 'hipaa', 'sox', 'pci-dss', 'iso27001', 'ccpa']
    }],
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted']
    },
    retentionRequired: Boolean,
    retentionDays: Number,
    legalHold: Boolean,
    regulatoryFlags: [String]
  },

  security: {
    threatIndicators: [{
      type: String,
      score: Number,
      details: String
    }],
    anomalyDetected: Boolean,
    anomalyScore: Number,
    securityAlerts: [{
      alertId: mongoose.Schema.Types.ObjectId,
      type: String,
      severity: String
    }],
    authentication: {
      method: String,
      mfaUsed: Boolean,
      ssoProvider: String,
      tokenType: String
    }
  },

  // ==================== Data Integrity ====================
  integrity: {
    hash: String,
    signature: String,
    verified: {
      type: Boolean,
      default: false
    },
    tamperDetected: Boolean,
    verificationErrors: [String]
  },

  // ==================== Related Records ====================
  relationships: {
    parentAuditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog'
    },
    correlationId: {
      type: String,
      index: true
    },
    traceId: String,
    spanId: String,
    relatedIncidents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityIncident'
    }],
    triggeredAlerts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditAlert'
    }]
  },

  // ==================== Export & Archive Status ====================
  lifecycle: {
    exported: {
      type: Boolean,
      default: false
    },
    exportedAt: Date,
    exportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditExport'
    },
    archived: {
      type: Boolean,
      default: false
    },
    archivedAt: Date,
    archiveLocation: String,
    willExpireAt: Date,
    expirationProcessed: Boolean
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    source: {
      type: String,
      enum: ['web', 'api', 'mobile', 'cli', 'system', 'integration', 'import'],
      default: 'web'
    },
    environment: {
      type: String,
      enum: ['production', 'staging', 'development', 'test'],
      default: 'production'
    },
    version: String,
    clientVersion: String
  }
};

// Create schema using BaseModel
const auditLogSchema = BaseModel.createSchema(auditLogSchemaDefinition, {
  collection: 'audit_logs',
  timestamps: true,
  strict: true,
  minimize: false
});

// ==================== Indexes ====================
// Compound indexes for common queries
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, 'event.type': 1, createdAt: -1 });
auditLogSchema.index({ 'actor.userId': 1, createdAt: -1 });
auditLogSchema.index({ 'resource.type': 1, 'resource.id': 1, createdAt: -1 });
auditLogSchema.index({ 'event.severity': 1, 'security.anomalyDetected': 1 });
auditLogSchema.index({ 'compliance.frameworks': 1, 'compliance.retentionRequired': 1 });
auditLogSchema.index({ 'lifecycle.willExpireAt': 1, 'lifecycle.expirationProcessed': 1 });

// Text search index
auditLogSchema.index({
  'event.description': 'text',
  'changes.summary': 'text',
  'resource.name': 'text'
});

// ==================== Virtual Fields ====================
auditLogSchema.virtual('isHighRisk').get(function() {
  return this.event.severity === 'critical' || 
         this.event.severity === 'high' ||
         this.security.anomalyDetected ||
         this.event.risk.score > 70;
});

auditLogSchema.virtual('requiresReview').get(function() {
  return this.result.status === 'failure' &&
         ['critical', 'high'].includes(this.event.severity);
});

auditLogSchema.virtual('isCompliant').get(function() {
  return !this.security.threatIndicators?.length &&
         !this.integrity.tamperDetected &&
         this.integrity.verified;
});

// ==================== Pre-save Middleware ====================
auditLogSchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive IP address
    if (this.request?.ip?.address && !this.request.ip.encryptedAddress) {
      try {
        this.request.ip.encryptedAddress = await encryptionService.encryptField(
          this.request.ip.address,
          'audit-ip'
        );
      } catch (encryptionError) {
        logger.warn('Failed to encrypt IP address', {
          error: encryptionError.message,
          auditLogId: this._id
        });
      }
    }

    // Calculate risk score if not set
    if (!this.event.risk.score) {
      this.event.risk.score = this.calculateRiskScore();
    }

    // Set retention based on compliance requirements
    if (!this.compliance.retentionDays) {
      this.compliance.retentionDays = this.calculateRetentionDays();
    }

    // Calculate expiration date
    if (this.compliance.retentionDays && !this.lifecycle.willExpireAt) {
      this.lifecycle.willExpireAt = new Date(
        Date.now() + this.compliance.retentionDays * 24 * 60 * 60 * 1000
      );
    }

    // Generate integrity hash
    if (!this.integrity.hash) {
      this.integrity.hash = await this.generateIntegrityHash();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
auditLogSchema.post('save', async function(doc) {
  try {
    // Check if we need to trigger alerts
    if (doc.isHighRisk || doc.security.anomalyDetected) {
      try {
        const AuditAlert = mongoose.model('AuditAlert');
        await AuditAlert.createFromAuditLog(doc);
      } catch (alertError) {
        logger.error('Failed to create audit alert', {
          auditLogId: doc._id,
          error: alertError.message
        });
      }
    }

    // Update organization analytics
    try {
      const Organization = mongoose.model('Organization');
      await Organization.updateAnalytics(doc.organizationId, {
        auditEvent: doc.event.type,
        timestamp: doc.createdAt
      });
    } catch (analyticsError) {
      logger.error('Failed to update organization analytics', {
        organizationId: doc.organizationId,
        error: analyticsError.message
      });
    }

  } catch (error) {
    logger.error('Error in audit log post-save hook', {
      auditLogId: doc._id,
      error: error.message
    });
  }
});

// ==================== Instance Methods ====================
auditLogSchema.methods.calculateRiskScore = function() {
  let score = 0;
  
  // Severity-based scoring
  const severityScores = {
    critical: 40,
    high: 30,
    medium: 20,
    low: 10,
    info: 0
  };
  score += severityScores[this.event.severity] || 0;

  // Failed operations
  if (this.result.status === 'failure') score += 20;

  // Anomaly detection
  if (this.security.anomalyDetected) score += 30;
  if (this.security.anomalyScore) score += Math.min(this.security.anomalyScore, 20);

  // Threat indicators
  if (this.security.threatIndicators?.length) {
    const threatScore = this.security.threatIndicators.reduce(
      (sum, indicator) => sum + (indicator.score || 10), 0
    );
    score += Math.min(threatScore, 30);
  }

  // Suspicious request patterns
  if (this.request?.ip?.isTor || this.request?.ip?.threatLevel === 'high') score += 15;

  // Data classification sensitivity
  const classificationScores = {
    restricted: 20,
    confidential: 15,
    internal: 5,
    public: 0
  };
  score += classificationScores[this.compliance.dataClassification] || 0;

  return Math.min(score, 100);
};

auditLogSchema.methods.calculateRetentionDays = function() {
  // Default retention periods by compliance framework
  const frameworkRetention = {
    hipaa: 2190, // 6 years
    sox: 2555,   // 7 years
    gdpr: 1095,  // 3 years
    'pci-dss': 365,
    iso27001: 1095,
    ccpa: 730    // 2 years
  };

  // Get maximum retention requirement
  let maxRetention = 90; // Default 90 days

  if (this.compliance.frameworks?.length) {
    for (const framework of this.compliance.frameworks) {
      const days = frameworkRetention[framework];
      if (days > maxRetention) maxRetention = days;
    }
  }

  // Adjust based on severity
  if (this.event.severity === 'critical') {
    maxRetention = Math.max(maxRetention, 365);
  }

  // Legal hold overrides
  if (this.compliance.legalHold) {
    maxRetention = 36500; // 100 years effectively indefinite
  }

  return maxRetention;
};

auditLogSchema.methods.generateIntegrityHash = async function() {
  const crypto = require('crypto');
  
  const dataToHash = {
    event: this.event,
    actor: this.actor,
    resource: this.resource,
    changes: this.changes,
    result: this.result,
    timestamp: this.createdAt || new Date()
  };

  const jsonString = JSON.stringify(dataToHash, Object.keys(dataToHash).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
};

auditLogSchema.methods.verifyIntegrity = async function() {
  const currentHash = await this.generateIntegrityHash();
  this.integrity.verified = currentHash === this.integrity.hash;
  this.integrity.tamperDetected = !this.integrity.verified;
  
  if (this.integrity.tamperDetected) {
    this.integrity.verificationErrors = ['Hash mismatch detected'];
    
    // Log security incident
    logger.security('Audit log tampering detected', {
      auditLogId: this._id,
      expectedHash: this.integrity.hash,
      actualHash: currentHash
    });
  }
  
  return this.integrity.verified;
};

auditLogSchema.methods.markAsExported = async function(exportId) {
  this.lifecycle.exported = true;
  this.lifecycle.exportedAt = new Date();
  this.lifecycle.exportId = exportId;
  await this.save();
};

auditLogSchema.methods.archive = async function(location) {
  this.lifecycle.archived = true;
  this.lifecycle.archivedAt = new Date();
  this.lifecycle.archiveLocation = location;
  await this.save();
};

auditLogSchema.methods.redactSensitiveData = function() {
  // Redact sensitive fields while maintaining structure
  const redacted = this.toObject();
  
  // Redact IP address (keep encrypted version)
  if (redacted.request?.ip?.address) {
    redacted.request.ip.address = 'REDACTED';
  }
  
  // Redact sensitive change values
  if (redacted.changes?.fields) {
    redacted.changes.fields = redacted.changes.fields.map(field => {
      if (field.sensitive) {
        return {
          ...field,
          oldValue: field.oldValue ? 'REDACTED' : null,
          newValue: field.newValue ? 'REDACTED' : null
        };
      }
      return field;
    });
  }
  
  // Redact error stack traces in production
  if (redacted.result?.error?.stack && process.env.NODE_ENV === 'production') {
    redacted.result.error.stack = 'REDACTED';
  }
  
  return redacted;
};

// ==================== Static Methods ====================
auditLogSchema.statics.logEvent = async function(eventData) {
  try {
    const auditLog = new this(eventData);
    await auditLog.save();
    
    logger.debug('Audit event logged', {
      id: auditLog._id,
      event: auditLog.event.type,
      severity: auditLog.event.severity
    });
    
    return auditLog;
  } catch (error) {
    logger.error('Failed to log audit event', {
      error: error.message,
      eventType: eventData?.event?.type
    });
    throw error;
  }
};

auditLogSchema.statics.findByActor = async function(userId, options = {}) {
  const {
    startDate,
    endDate,
    eventTypes,
    limit = 100,
    skip = 0
  } = options;

  const query = { 'actor.userId': userId };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  if (eventTypes?.length) {
    query['event.type'] = { $in: eventTypes };
  }

  return await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

auditLogSchema.statics.findByResource = async function(resourceType, resourceId, options = {}) {
  const query = {
    'resource.type': resourceType,
    'resource.id': resourceId
  };

  if (options.includeRelated) {
    query.$or = [
      { 'resource.type': resourceType, 'resource.id': resourceId },
      { 'resource.parentType': resourceType, 'resource.parentId': resourceId }
    ];
  }

  return await this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .lean();
};

auditLogSchema.statics.getSecurityMetrics = async function(organizationId, timeRange = '24h') {
  const timeRanges = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const startDate = new Date(Date.now() - (timeRanges[timeRange] || timeRanges['24h']));

  const metrics = await this.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(organizationId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              failures: {
                $sum: { $cond: [{ $eq: ['$result.status', 'failure'] }, 1, 0] }
              },
              anomalies: {
                $sum: { $cond: ['$security.anomalyDetected', 1, 0] }
              },
              highRisk: {
                $sum: { 
                  $cond: [{ $gte: ['$event.risk.score', 70] }, 1, 0] 
                }
              }
            }
          }
        ],
        bySeverity: [
          {
            $group: {
              _id: '$event.severity',
              count: { $sum: 1 }
            }
          }
        ],
        byEventType: [
          {
            $group: {
              _id: '$event.type',
              count: { $sum: 1 },
              failures: {
                $sum: { $cond: [{ $eq: ['$result.status', 'failure'] }, 1, 0] }
              }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        topActors: [
          {
            $group: {
              _id: '$actor.userId',
              email: { $first: '$actor.email' },
              eventCount: { $sum: 1 },
              failureCount: {
                $sum: { $cond: [{ $eq: ['$result.status', 'failure'] }, 1, 0] }
              }
            }
          },
          { $sort: { eventCount: -1 } },
          { $limit: 10 }
        ],
        timeline: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d %H:00',
                  date: '$createdAt'
                }
              },
              count: { $sum: 1 },
              failures: {
                $sum: { $cond: [{ $eq: ['$result.status', 'failure'] }, 1, 0] }
              }
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    }
  ]);

  return metrics[0];
};

auditLogSchema.statics.searchLogs = async function(searchParams) {
  const {
    query,
    organizationId,
    tenantId,
    startDate,
    endDate,
    severity,
    eventTypes,
    actors,
    resources,
    statuses,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = searchParams;

  const searchQuery = {};

  // Required filters
  if (organizationId) searchQuery.organizationId = organizationId;
  if (tenantId) searchQuery.tenantId = tenantId;

  // Date range
  if (startDate || endDate) {
    searchQuery.createdAt = {};
    if (startDate) searchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) searchQuery.createdAt.$lte = new Date(endDate);
  }

  // Text search
  if (query) {
    searchQuery.$text = { $search: query };
  }

  // Filters
  if (severity?.length) {
    searchQuery['event.severity'] = { $in: severity };
  }
  if (eventTypes?.length) {
    searchQuery['event.type'] = { $in: eventTypes };
  }
  if (actors?.length) {
    searchQuery['actor.userId'] = { $in: actors };
  }
  if (resources?.length) {
    searchQuery.$or = resources.map(r => ({
      'resource.type': r.type,
      'resource.id': r.id
    }));
  }
  if (statuses?.length) {
    searchQuery['result.status'] = { $in: statuses };
  }

  const [logs, total] = await Promise.all([
    this.find(searchQuery)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .populate('actor.userId', 'name email')
      .lean(),
    this.countDocuments(searchQuery)
  ]);

  return {
    logs,
    total,
    hasMore: total > skip + logs.length
  };
};

auditLogSchema.statics.cleanupExpiredLogs = async function(batchSize = 1000) {
  const expiredLogs = await this.find({
    'lifecycle.willExpireAt': { $lte: new Date() },
    'lifecycle.expirationProcessed': { $ne: true },
    'compliance.legalHold': { $ne: true }
  })
  .limit(batchSize)
  .select('_id organizationId');

  let processed = 0;
  let errors = 0;

  for (const log of expiredLogs) {
    try {
      // Archive before deletion if required
      if (log.compliance?.retentionRequired) {
        await log.archive(`archive/${log.organizationId}/${log._id}`);
      }

      // Mark as processed
      await this.updateOne(
        { _id: log._id },
        { 
          $set: { 
            'lifecycle.expirationProcessed': true,
            'lifecycle.processedAt': new Date()
          }
        }
      );

      processed++;
    } catch (error) {
      errors++;
      logger.error('Failed to process expired audit log', {
        logId: log._id,
        error: error.message
      });
    }
  }

  logger.info('Audit log cleanup completed', {
    processed,
    errors,
    total: expiredLogs.length
  });

  return { processed, errors, total: expiredLogs.length };
};

// Create and export model
const AuditLogModel = BaseModel.createModel('AuditLog', auditLogSchema);

module.exports = {
  schema: auditLogSchema,
  model: AuditLogModel
};