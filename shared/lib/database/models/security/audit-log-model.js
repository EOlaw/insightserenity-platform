'use strict';

/**
 * @fileoverview Audit log model for compliance and activity tracking
 * @module shared/lib/database/models/audit-log-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * Audit log schema definition
 */
const auditLogSchemaDefinition = {
  // Event Information
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  action: {
    type: String,
    required: true,
    index: true,
    uppercase: true
  },

  category: {
    type: String,
    required: true,
    enum: [
      'AUTH', 'USER', 'ORGANIZATION', 'TENANT', 'DATA', 'SYSTEM',
      'SECURITY', 'BILLING', 'API', 'INTEGRATION', 'COMPLIANCE',
      'ADMIN', 'CONFIGURATION', 'TRANSACTION', 'DATABASE'
    ],
    index: true
  },

  subcategory: {
    type: String,
    index: true
  },

  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  },

  // Actor Information
  actor: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    username: String,
    email: String,
    type: {
      type: String,
      enum: ['user', 'system', 'api', 'service', 'admin'],
      default: 'user'
    },
    ip: String,
    userAgent: String,
    sessionId: String
  },

  // Target Information
  target: {
    type: {
      type: String,
      enum: [
        'user', 'organization', 'tenant', 'document', 'file',
        'setting', 'permission', 'role', 'api_key', 'session',
        'integration', 'webhook', 'notification', 'other'
      ]
    },
    id: String,
    name: String,
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    },
    currentState: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    }
  },

  // Event Details
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  changes: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    type: {
      type: String,
      enum: ['create', 'update', 'delete']
    }
  }],

  // Result
  result: {
    status: {
      type: String,
      enum: ['success', 'failure', 'partial', 'pending'],
      default: 'success',
      index: true
    },
    message: String,
    error: {
      code: String,
      message: String,
      stack: {
        type: String,
        select: false
      }
    },
    duration: Number // in milliseconds
  },

  // Context
  context: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true
    },
    tenantId: {
      type: String,
      index: true
    },
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'production'
    },
    service: String,
    version: String,
    requestId: String,
    correlationId: String,
    parentEventId: String
  },

  // Compliance
  compliance: {
    required: {
      type: Boolean,
      default: false
    },
    frameworks: [{
      type: String,
      enum: ['GDPR', 'HIPAA', 'SOC2', 'PCI-DSS', 'ISO27001', 'SOX']
    }],
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    },
    retentionDays: {
      type: Number,
      default: 2555 // 7 years default
    },
    regulations: [String],
    tags: [String]
  },

  // Security
  security: {
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    threatLevel: {
      type: String,
      enum: ['none', 'low', 'medium', 'high', 'critical'],
      default: 'none'
    },
    anomalous: {
      type: Boolean,
      default: false
    },
    indicators: [String],
    mitigationApplied: Boolean,
    blocked: Boolean
  },

  // Location
  location: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },

  // Timestamps
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // Archival
  archived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: Date,

  // Signatures
  signature: {
    hash: String,
    algorithm: String,
    timestamp: Date
  },

  // Export tracking
  exported: {
    type: Boolean,
    default: false
  },

  exportedAt: Date,
  exportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

// Create schema without default timestamps (we manage manually)
const auditLogSchema = BaseModel.createSchema(auditLogSchemaDefinition, {
  collection: 'audit_logs',
  timestamps: false,
  strict: true
});

// Compound indexes for common queries
auditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditLogSchema.index({ 'context.organizationId': 1, timestamp: -1 });
auditLogSchema.index({ 'context.tenantId': 1, timestamp: -1 });
auditLogSchema.index({ category: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ 'result.status': 1, timestamp: -1 });
auditLogSchema.index({ 'security.anomalous': 1, 'security.threatLevel': 1 });
auditLogSchema.index({ 'compliance.frameworks': 1 });
auditLogSchema.index({ timestamp: -1, archived: 1 });

// Virtual fields
auditLogSchema.virtual('isCompliant').get(function() {
  return this.compliance.required && this.result.status === 'success';
});

auditLogSchema.virtual('isHighRisk').get(function() {
  return this.security.riskScore > 70 || 
         this.security.threatLevel === 'high' || 
         this.security.threatLevel === 'critical';
});

auditLogSchema.virtual('age').get(function() {
  return Date.now() - this.timestamp;
});

auditLogSchema.virtual('retentionExpiry').get(function() {
  const retentionMs = this.compliance.retentionDays * 24 * 60 * 60 * 1000;
  return new Date(this.timestamp.getTime() + retentionMs);
});

// Pre-save middleware
auditLogSchema.pre('save', async function(next) {
  try {
    // Generate event ID if not provided
    if (!this.eventId && this.isNew) {
      this.eventId = this.constructor.generateEventId();
    }

    // Set severity based on action and result
    if (!this.severity) {
      this.severity = this.constructor.determineSeverity(this);
    }

    // Calculate risk score if not set
    if (!this.security.riskScore) {
      this.security.riskScore = this.constructor.calculateRiskScore(this);
    }

    // Generate signature for tamper detection
    if (!this.signature.hash) {
      this.signature = await this.constructor.generateSignature(this);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
auditLogSchema.methods.archive = async function() {
  this.archived = true;
  this.archivedAt = new Date();
  await this.save();
  return this;
};

auditLogSchema.methods.markExported = async function(exportedBy) {
  this.exported = true;
  this.exportedAt = new Date();
  this.exportedBy = exportedBy;
  await this.save();
  return this;
};

auditLogSchema.methods.addComplianceTag = async function(tag) {
  if (!this.compliance.tags) {
    this.compliance.tags = [];
  }
  
  if (!this.compliance.tags.includes(tag)) {
    this.compliance.tags.push(tag);
    await this.save();
  }
  
  return this;
};

auditLogSchema.methods.flagAsAnomalous = async function(indicators = []) {
  this.security.anomalous = true;
  this.security.indicators = [
    ...new Set([...this.security.indicators || [], ...indicators])
  ];
  
  // Increase risk score
  this.security.riskScore = Math.min(100, this.security.riskScore + 30);
  
  // Update threat level
  if (this.security.riskScore > 80) {
    this.security.threatLevel = 'critical';
  } else if (this.security.riskScore > 60) {
    this.security.threatLevel = 'high';
  } else if (this.security.riskScore > 40) {
    this.security.threatLevel = 'medium';
  } else {
    this.security.threatLevel = 'low';
  }
  
  await this.save();
  return this;
};

auditLogSchema.methods.verify = async function() {
  const currentSignature = await this.constructor.generateSignature(this);
  return currentSignature.hash === this.signature.hash;
};

auditLogSchema.methods.redact = async function(fields = []) {
  const redactValue = (value) => {
    if (typeof value === 'string') {
      return value.replace(/./g, '*');
    }
    return '[REDACTED]';
  };

  for (const field of fields) {
    if (this.details && this.details[field]) {
      this.details[field] = redactValue(this.details[field]);
    }
    
    // Redact in changes
    for (const change of this.changes || []) {
      if (change.field === field) {
        change.oldValue = redactValue(change.oldValue);
        change.newValue = redactValue(change.newValue);
      }
    }
  }
  
  this.markModified('details');
  this.markModified('changes');
  await this.save();
  
  return this;
};

// Static methods
auditLogSchema.statics.generateEventId = function() {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

auditLogSchema.statics.determineSeverity = function(log) {
  // Critical severity
  if (log.category === 'SECURITY' && log.result.status === 'failure') {
    return 'critical';
  }
  
  if (['DELETE', 'DESTROY', 'PURGE'].some(action => log.action.includes(action))) {
    return 'high';
  }
  
  // High severity
  if (['AUTH', 'SECURITY', 'COMPLIANCE'].includes(log.category)) {
    return 'high';
  }
  
  // Medium severity
  if (['UPDATE', 'MODIFY', 'CHANGE'].some(action => log.action.includes(action))) {
    return 'medium';
  }
  
  // Low severity
  return 'low';
};

auditLogSchema.statics.calculateRiskScore = function(log) {
  let score = 0;
  
  // Category-based scoring
  const categoryScores = {
    SECURITY: 30,
    AUTH: 20,
    BILLING: 25,
    COMPLIANCE: 20,
    ADMIN: 15,
    USER: 10,
    SYSTEM: 15
  };
  
  score += categoryScores[log.category] || 5;
  
  // Result-based scoring
  if (log.result.status === 'failure') {
    score += 20;
  }
  
  // Action-based scoring
  if (log.action.includes('DELETE') || log.action.includes('DESTROY')) {
    score += 15;
  }
  
  if (log.action.includes('ADMIN') || log.action.includes('PRIVILEGE')) {
    score += 10;
  }
  
  // Actor-based scoring
  if (log.actor.type === 'api' || log.actor.type === 'service') {
    score += 5;
  }
  
  // Anomaly indicators
  if (log.actor.ip && log.actor.ip.includes('tor')) {
    score += 20;
  }
  
  return Math.min(100, score);
};

auditLogSchema.statics.generateSignature = async function(log) {
  const crypto = require('crypto');
  
  const data = {
    eventId: log.eventId,
    action: log.action,
    category: log.category,
    actor: log.actor,
    target: log.target,
    timestamp: log.timestamp
  };
  
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
  
  return {
    hash,
    algorithm: 'sha256',
    timestamp: new Date()
  };
};

auditLogSchema.statics.log = async function(eventData) {
  const log = new this(eventData);
  
  try {
    await log.save();
    
    // Check for anomalies
    const anomalies = await this.detectAnomalies(log);
    if (anomalies.length > 0) {
      await log.flagAsAnomalous(anomalies);
    }
    
    return log;
    
  } catch (error) {
    logger.error('Failed to create audit log', error);
    
    // Audit logging should not break the application
    // Return a minimal log object
    return {
      eventId: log.eventId,
      timestamp: log.timestamp,
      error: error.message
    };
  }
};

auditLogSchema.statics.detectAnomalies = async function(log) {
  const anomalies = [];
  
  // Check for rapid repeated failures
  const recentFailures = await this.countDocuments({
    'actor.userId': log.actor.userId,
    'result.status': 'failure',
    timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes
  });
  
  if (recentFailures > 5) {
    anomalies.push('rapid_failures');
  }
  
  // Check for unusual time
  const hour = new Date(log.timestamp).getHours();
  if (hour >= 2 && hour <= 5) {
    anomalies.push('unusual_time');
  }
  
  // Check for privilege escalation attempts
  if (log.category === 'AUTH' && 
      log.action.includes('PRIVILEGE') && 
      log.result.status === 'failure') {
    anomalies.push('privilege_escalation_attempt');
  }
  
  // Check for data exfiltration patterns
  if (log.action.includes('EXPORT') || log.action.includes('DOWNLOAD')) {
    const recentExports = await this.countDocuments({
      'actor.userId': log.actor.userId,
      action: { $in: ['EXPORT', 'DOWNLOAD'] },
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // 1 hour
    });
    
    if (recentExports > 10) {
      anomalies.push('excessive_data_export');
    }
  }
  
  return anomalies;
};

auditLogSchema.statics.search = async function(criteria = {}) {
  const {
    startDate,
    endDate,
    actors,
    categories,
    actions,
    severity,
    result,
    organizationId,
    tenantId,
    anomalous,
    limit = 100,
    skip = 0,
    sort = { timestamp: -1 }
  } = criteria;

  const query = { archived: false };
  
  // Date range
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = startDate;
    if (endDate) query.timestamp.$lte = endDate;
  }
  
  // Actors
  if (actors && actors.length > 0) {
    query['actor.userId'] = { $in: actors };
  }
  
  // Categories
  if (categories && categories.length > 0) {
    query.category = { $in: categories };
  }
  
  // Actions
  if (actions && actions.length > 0) {
    query.action = { $in: actions };
  }
  
  // Severity
  if (severity) {
    query.severity = severity;
  }
  
  // Result
  if (result) {
    query['result.status'] = result;
  }
  
  // Organization
  if (organizationId) {
    query['context.organizationId'] = organizationId;
  }
  
  // Tenant
  if (tenantId) {
    query['context.tenantId'] = tenantId;
  }
  
  // Anomalous
  if (anomalous !== undefined) {
    query['security.anomalous'] = anomalous;
  }
  
  return await this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip)
    .populate('actor.userId', 'username email')
    .populate('context.organizationId', 'name');
};

auditLogSchema.statics.generateReport = async function(options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
    endDate = new Date(),
    organizationId,
    groupBy = 'category'
  } = options;

  const match = {
    timestamp: { $gte: startDate, $lte: endDate },
    archived: false
  };
  
  if (organizationId) {
    match['context.organizationId'] = organizationId;
  }

  const report = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: `$${groupBy}`,
        total: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ['$result.status', 'success'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$result.status', 'failure'] }, 1, 0] }
        },
        anomalous: {
          $sum: { $cond: ['$security.anomalous', 1, 0] }
        },
        avgRiskScore: { $avg: '$security.riskScore' },
        uniqueActors: { $addToSet: '$actor.userId' },
        actions: { $addToSet: '$action' }
      }
    },
    {
      $project: {
        _id: 0,
        [groupBy]: '$_id',
        total: 1,
        successful: 1,
        failed: 1,
        anomalous: 1,
        avgRiskScore: { $round: ['$avgRiskScore', 2] },
        uniqueActorCount: { $size: '$uniqueActors' },
        actionCount: { $size: '$actions' },
        successRate: {
          $multiply: [
            { $divide: ['$successful', '$total'] },
            100
          ]
        }
      }
    },
    { $sort: { total: -1 } }
  ]);

  // Calculate totals
  const totals = report.reduce((acc, item) => ({
    total: acc.total + item.total,
    successful: acc.successful + item.successful,
    failed: acc.failed + item.failed,
    anomalous: acc.anomalous + item.anomalous
  }), { total: 0, successful: 0, failed: 0, anomalous: 0 });

  return {
    period: { startDate, endDate },
    groupBy,
    totals,
    breakdown: report
  };
};

auditLogSchema.statics.exportLogs = async function(criteria, format = 'json') {
  const logs = await this.search({ ...criteria, limit: 10000 });
  
  // Mark as exported
  const logIds = logs.map(log => log._id);
  await this.updateMany(
    { _id: { $in: logIds } },
    { 
      exported: true,
      exportedAt: new Date()
    }
  );
  
  if (format === 'csv') {
    return this.convertToCSV(logs);
  }
  
  return logs;
};

auditLogSchema.statics.convertToCSV = function(logs) {
  const headers = [
    'Event ID', 'Timestamp', 'Category', 'Action', 'Actor', 
    'Target', 'Result', 'Severity', 'Risk Score', 'IP Address'
  ];
  
  const rows = logs.map(log => [
    log.eventId,
    log.timestamp.toISOString(),
    log.category,
    log.action,
    log.actor.email || log.actor.username || 'System',
    log.target.name || log.target.id || 'N/A',
    log.result.status,
    log.severity,
    log.security.riskScore,
    log.actor.ip || 'N/A'
  ]);
  
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  return csv;
};

auditLogSchema.statics.cleanup = async function(options = {}) {
  const {
    archiveAfterDays = 90,
    deleteAfterDays = 2555 // 7 years
  } = options;

  const now = new Date();
  const archiveDate = new Date(now - archiveAfterDays * 24 * 60 * 60 * 1000);
  const deleteDate = new Date(now - deleteAfterDays * 24 * 60 * 60 * 1000);

  // Archive old logs
  const archiveResult = await this.updateMany(
    {
      timestamp: { $lt: archiveDate },
      archived: false
    },
    {
      archived: true,
      archivedAt: now
    }
  );

  // Delete very old logs (respecting retention policy)
  const deleteResult = await this.deleteMany({
    timestamp: { $lt: deleteDate },
    'compliance.retentionDays': { $lte: deleteAfterDays }
  });

  logger.info('Audit log cleanup completed', {
    archived: archiveResult.modifiedCount,
    deleted: deleteResult.deletedCount
  });

  return {
    archived: archiveResult.modifiedCount,
    deleted: deleteResult.deletedCount
  };
};

// Create and export model
const AuditLogModel = BaseModel.createModel('AuditLog', auditLogSchema);

module.exports = {
  schema: auditLogSchema,
  model: AuditLogModel
};