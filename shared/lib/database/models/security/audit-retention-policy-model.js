'use strict';

/**
 * @fileoverview Audit retention policy model for managing data lifecycle and compliance
 * @module shared/lib/database/models/security/audit-retention-policy-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/compliance-frameworks
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('..\..\..\utils\logger');
const AppError = require('..\..\..\utils\app-error');
const { COMPLIANCE_FRAMEWORKS, RETENTION_PERIODS } = require('../../utils/constants/compliance-frameworks');

/**
 * Audit retention policy schema for data lifecycle management
 */
const auditRetentionPolicySchemaDefinition = {
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

  // ==================== Policy Information ====================
  policy: {
    name: {
      type: String,
      required: true,
      maxlength: 200,
      index: true
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      match: /^[A-Z0-9_-]+$/
    },
    description: String,
    version: {
      type: String,
      default: '1.0'
    },
    type: {
      type: String,
      enum: ['global', 'event_type', 'severity', 'compliance', 'custom'],
      required: true
    },
    priority: {
      type: Number,
      default: 0,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive', 'archived'],
      default: 'draft',
      index: true
    },
    effectiveDate: {
      type: Date,
      required: true
    },
    expiryDate: Date,
    reviewDate: Date
  },

  // ==================== Retention Rules ====================
  retention: {
    defaultPeriod: {
      value: {
        type: Number,
        required: true,
        min: 1
      },
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months', 'years'],
        required: true
      }
    },
    rules: [{
      name: String,
      condition: {
        field: String,
        operator: {
          type: String,
          enum: ['equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in', 'greater_than', 'less_than']
        },
        value: mongoose.Schema.Types.Mixed,
        logicalOperator: {
          type: String,
          enum: ['and', 'or']
        }
      },
      period: {
        value: Number,
        unit: {
          type: String,
          enum: ['days', 'weeks', 'months', 'years']
        }
      },
      action: {
        type: String,
        enum: ['retain', 'archive', 'delete', 'anonymize'],
        default: 'retain'
      },
      priority: Number
    }],
    minimumRetention: {
      value: Number,
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months', 'years']
      },
      enforced: {
        type: Boolean,
        default: true
      }
    },
    maximumRetention: {
      value: Number,
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months', 'years']
      },
      enforced: {
        type: Boolean,
        default: false
      }
    },
    extensions: {
      allowed: {
        type: Boolean,
        default: true
      },
      maxExtensions: Number,
      requiresApproval: Boolean,
      approvers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }
  },

  // ==================== Scope & Application ====================
  scope: {
    eventTypes: [{
      type: String,
      index: true
    }],
    eventCategories: [String],
    severities: [{
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info']
    }],
    resources: [{
      type: String,
      patterns: [String]
    }],
    actors: {
      includeTypes: [{
        type: String,
        enum: ['user', 'admin', 'system', 'api', 'service']
      }],
      excludeTypes: [String],
      specificUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      roles: [String]
    },
    departments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    }],
    dataClassifications: [{
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted']
    }],
    excludePatterns: [String]
  },

  // ==================== Compliance & Legal ====================
  compliance: {
    frameworks: [{
      type: String,
      enum: Object.values(COMPLIANCE_FRAMEWORKS)
    }],
    requirements: [{
      framework: String,
      requirement: String,
      reference: String,
      description: String,
      retentionPeriod: {
        value: Number,
        unit: String
      },
      mandatory: Boolean
    }],
    legalBasis: {
      type: String,
      enum: ['legal_obligation', 'legitimate_interest', 'consent', 'contract', 'vital_interests', 'public_task']
    },
    jurisdiction: {
      country: String,
      state: String,
      regulations: [String]
    },
    dataSubjectRights: {
      erasureAllowed: {
        type: Boolean,
        default: false
      },
      portabilityRequired: Boolean,
      accessRequired: Boolean,
      conditions: [String]
    },
    certifications: [{
      name: String,
      issuedBy: String,
      issuedDate: Date,
      expiryDate: Date,
      reference: String
    }]
  },

  // ==================== Actions & Lifecycle ====================
  actions: {
    onRetentionExpiry: {
      primary: {
        type: String,
        enum: ['delete', 'archive', 'anonymize', 'review', 'extend'],
        required: true
      },
      secondary: [String],
      notifications: {
        enabled: Boolean,
        daysBeforeExpiry: [Number],
        recipients: [String]
      }
    },
    archival: {
      enabled: Boolean,
      destination: {
        type: String,
        enum: ['cold_storage', 'glacier', 'tape', 'offline', 'cloud_archive']
      },
      compression: {
        enabled: Boolean,
        algorithm: String
      },
      encryption: {
        enabled: Boolean,
        algorithm: String,
        keyRotation: Boolean
      },
      verification: {
        enabled: Boolean,
        frequency: String
      }
    },
    deletion: {
      method: {
        type: String,
        enum: ['soft_delete', 'hard_delete', 'secure_wipe', 'crypto_shred'],
        default: 'soft_delete'
      },
      verification: {
        required: Boolean,
        method: String
      },
      cascade: {
        enabled: Boolean,
        includeBackups: Boolean,
        includeArchives: Boolean
      },
      certificate: {
        generate: Boolean,
        template: String
      }
    },
    anonymization: {
      enabled: Boolean,
      method: {
        type: String,
        enum: ['pseudonymization', 'generalization', 'suppression', 'noise_addition']
      },
      fields: [{
        path: String,
        method: String,
        parameters: mongoose.Schema.Types.Mixed
      }],
      reversible: Boolean,
      keyStorage: String
    }
  },

  // ==================== Exceptions & Overrides ====================
  exceptions: {
    legalHold: {
      enabled: Boolean,
      overridesPolicy: {
        type: Boolean,
        default: true
      },
      conditions: [String]
    },
    eventTypes: [{
      eventType: String,
      reason: String,
      retentionPeriod: {
        value: Number,
        unit: String
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      expiryDate: Date
    }],
    users: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String,
      action: String,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      expiryDate: Date
    }],
    temporaryExtensions: [{
      reason: String,
      extendedBy: {
        value: Number,
        unit: String
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      startDate: Date,
      endDate: Date
    }]
  },

  // ==================== Processing & Performance ====================
  processing: {
    schedule: {
      enabled: Boolean,
      frequency: {
        type: String,
        enum: ['hourly', 'daily', 'weekly', 'monthly'],
        default: 'daily'
      },
      cronExpression: String,
      timezone: String,
      preferredTime: String,
      lastRun: Date,
      nextRun: Date
    },
    batch: {
      size: {
        type: Number,
        default: 1000
      },
      parallel: {
        type: Boolean,
        default: false
      },
      maxWorkers: {
        type: Number,
        default: 1
      },
      timeout: Number,
      retryOnFailure: Boolean,
      maxRetries: Number
    },
    performance: {
      averageProcessingTime: Number,
      recordsProcessedPerHour: Number,
      lastMeasured: Date
    },
    resourceLimits: {
      maxCpu: Number,
      maxMemory: Number,
      maxDiskIO: Number,
      priorityLevel: {
        type: String,
        enum: ['low', 'normal', 'high'],
        default: 'normal'
      }
    }
  },

  // ==================== Monitoring & Reporting ====================
  monitoring: {
    metrics: {
      totalRecordsProcessed: {
        type: Number,
        default: 0
      },
      recordsDeleted: {
        type: Number,
        default: 0
      },
      recordsArchived: {
        type: Number,
        default: 0
      },
      recordsAnonymized: {
        type: Number,
        default: 0
      },
      storageReclaimed: {
        type: Number,
        default: 0
      },
      lastUpdated: Date
    },
    alerts: [{
      type: {
        type: String,
        enum: ['threshold_exceeded', 'processing_failed', 'compliance_violation', 'performance_degradation']
      },
      condition: String,
      threshold: mongoose.Schema.Types.Mixed,
      severity: String,
      recipients: [String],
      enabled: Boolean
    }],
    reporting: {
      enabled: Boolean,
      frequency: String,
      recipients: [String],
      includeMetrics: Boolean,
      includeCompliance: Boolean,
      format: {
        type: String,
        enum: ['pdf', 'excel', 'json', 'html']
      }
    }
  },

  // ==================== Audit & History ====================
  history: {
    changes: [{
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changedAt: Date,
      changeType: String,
      previousValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      reason: String,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    reviews: [{
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reviewedAt: Date,
      outcome: {
        type: String,
        enum: ['approved', 'needs_changes', 'rejected']
      },
      comments: String,
      nextReviewDate: Date
    }],
    approvals: [{
      action: String,
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      comments: String
    }]
  },

  // ==================== Integration & Dependencies ====================
  integration: {
    linkedPolicies: [{
      policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AuditRetentionPolicy'
      },
      relationship: {
        type: String,
        enum: ['parent', 'child', 'related', 'supersedes', 'superseded_by']
      }
    }],
    externalSystems: [{
      system: String,
      policyId: String,
      syncEnabled: Boolean,
      lastSync: Date,
      mapping: mongoose.Schema.Types.Mixed
    }],
    dependencies: [{
      type: {
        type: String,
        enum: ['storage_system', 'archive_system', 'compliance_tool', 'siem']
      },
      name: String,
      configuration: mongoose.Schema.Types.Mixed,
      status: String
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    documentation: {
      url: String,
      lastUpdated: Date,
      version: String
    },
    owner: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      department: String,
      email: String
    },
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date,
      type: {
        type: String,
        enum: ['general', 'compliance', 'technical', 'review']
      }
    }]
  }
};

// Create schema
const auditRetentionPolicySchema = BaseModel.createSchema(auditRetentionPolicySchemaDefinition, {
  collection: 'audit_retention_policies',
  timestamps: true,
  strict: true
});

// ==================== Indexes ====================
auditRetentionPolicySchema.index({ organizationId: 1, 'policy.status': 1 });
auditRetentionPolicySchema.index({ 'policy.code': 1 });
auditRetentionPolicySchema.index({ 'policy.type': 1, 'policy.priority': -1 });
auditRetentionPolicySchema.index({ 'compliance.frameworks': 1 });
auditRetentionPolicySchema.index({ 'policy.effectiveDate': 1, 'policy.expiryDate': 1 });
auditRetentionPolicySchema.index({ 'processing.schedule.nextRun': 1 });

// Text search
auditRetentionPolicySchema.index({
  'policy.name': 'text',
  'policy.description': 'text'
});

// ==================== Virtual Fields ====================
auditRetentionPolicySchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.policy.status === 'active' &&
         this.policy.effectiveDate <= now &&
         (!this.policy.expiryDate || this.policy.expiryDate > now);
});

auditRetentionPolicySchema.virtual('requiresReview').get(function() {
  return this.policy.reviewDate && this.policy.reviewDate <= new Date();
});

auditRetentionPolicySchema.virtual('retentionDays').get(function() {
  const multipliers = {
    days: 1,
    weeks: 7,
    months: 30,
    years: 365
  };
  
  return this.retention.defaultPeriod.value * 
         (multipliers[this.retention.defaultPeriod.unit] || 1);
});

auditRetentionPolicySchema.virtual('complianceStatus').get(function() {
  if (!this.compliance.frameworks?.length) return 'not_applicable';
  
  const hasAllCertifications = this.compliance.certifications?.every(
    cert => cert.expiryDate > new Date()
  );
  
  return hasAllCertifications ? 'compliant' : 'review_required';
});

// ==================== Pre-save Middleware ====================
auditRetentionPolicySchema.pre('save', async function(next) {
  try {
    // Generate policy code if not set
    if (!this.policy.code) {
      this.policy.code = await this.generatePolicyCode();
    }

    // Validate retention periods against compliance requirements
    if (this.isModified('retention') || this.isModified('compliance')) {
      this.validateRetentionCompliance();
    }

    // Calculate next run time for scheduled processing
    if (this.processing.schedule.enabled && !this.processing.schedule.nextRun) {
      this.processing.schedule.nextRun = this.calculateNextRun();
    }

    // Set review date if not specified
    if (!this.policy.reviewDate && this.policy.status === 'active') {
      this.policy.reviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
auditRetentionPolicySchema.post('save', async function(doc) {
  try {
    // Log policy changes
    if (doc.wasModified) {
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.logEvent({
        tenantId: doc.tenantId,
        organizationId: doc.organizationId,
        event: {
          type: 'retention_policy_updated',
          category: 'configuration',
          action: 'update',
          description: `Retention policy ${doc.policy.name} updated`,
          severity: 'info'
        },
        actor: {
          userId: doc.metadata.owner?.userId,
          userType: 'admin'
        },
        resource: {
          type: 'retention_policy',
          id: doc._id.toString(),
          name: doc.policy.name
        }
      });
    }

  } catch (error) {
    logger.error('Error in retention policy post-save hook', {
      policyId: doc._id,
      error: error.message
    });
  }
});

// ==================== Instance Methods ====================
auditRetentionPolicySchema.methods.generatePolicyCode = async function() {
  const prefix = this.policy.type.toUpperCase().substring(0, 3);
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `${prefix}-${timestamp}-${random}`;
};

auditRetentionPolicySchema.methods.validateRetentionCompliance = function() {
  if (!this.compliance.frameworks?.length) return;

  const minRetentionDays = this.retentionDays;
  
  for (const requirement of this.compliance.requirements) {
    if (!requirement.mandatory) continue;
    
    const requiredDays = this.convertToDays(
      requirement.retentionPeriod.value,
      requirement.retentionPeriod.unit
    );
    
    if (minRetentionDays < requiredDays) {
      throw new AppError(
        `Retention period violates ${requirement.framework} requirement: minimum ${requiredDays} days required`,
        400,
        'COMPLIANCE_VIOLATION'
      );
    }
  }
};

auditRetentionPolicySchema.methods.convertToDays = function(value, unit) {
  const multipliers = {
    days: 1,
    weeks: 7,
    months: 30,
    years: 365
  };
  
  return value * (multipliers[unit] || 1);
};

auditRetentionPolicySchema.methods.calculateNextRun = function() {
  const now = new Date();
  const schedule = this.processing.schedule;
  
  if (schedule.cronExpression) {
    // Would use a cron parser here
    // For now, simple calculation based on frequency
  }
  
  const intervals = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000
  };
  
  const interval = intervals[schedule.frequency] || intervals.daily;
  return new Date(now.getTime() + interval);
};

auditRetentionPolicySchema.methods.activate = async function(activatedBy) {
  if (this.policy.status === 'active') {
    throw new AppError('Policy is already active', 400, 'ALREADY_ACTIVE');
  }

  this.policy.status = 'active';
  this.policy.effectiveDate = new Date();
  
  this.history.changes.push({
    changedBy: activatedBy,
    changedAt: new Date(),
    changeType: 'activation',
    previousValue: 'inactive',
    newValue: 'active',
    reason: 'Policy activated'
  });

  await this.save();
  
  logger.info('Retention policy activated', {
    policyId: this._id,
    name: this.policy.name
  });

  return this;
};

auditRetentionPolicySchema.methods.deactivate = async function(reason, deactivatedBy) {
  if (this.policy.status !== 'active') {
    throw new AppError('Policy is not active', 400, 'NOT_ACTIVE');
  }

  this.policy.status = 'inactive';
  
  this.history.changes.push({
    changedBy: deactivatedBy,
    changedAt: new Date(),
    changeType: 'deactivation',
    previousValue: 'active',
    newValue: 'inactive',
    reason
  });

  await this.save();
  
  logger.info('Retention policy deactivated', {
    policyId: this._id,
    name: this.policy.name,
    reason
  });

  return this;
};

auditRetentionPolicySchema.methods.addException = async function(exception, addedBy) {
  const exceptionData = {
    ...exception,
    approvedBy: addedBy,
    approvedAt: new Date()
  };

  if (exception.userId) {
    this.exceptions.users.push(exceptionData);
  } else if (exception.eventType) {
    this.exceptions.eventTypes.push(exceptionData);
  } else {
    throw new AppError('Invalid exception type', 400, 'INVALID_EXCEPTION');
  }

  this.history.changes.push({
    changedBy: addedBy,
    changedAt: new Date(),
    changeType: 'exception_added',
    newValue: exceptionData,
    reason: exception.reason
  });

  await this.save();
  return this;
};

auditRetentionPolicySchema.methods.review = async function(outcome, comments, reviewedBy) {
  const review = {
    reviewedBy,
    reviewedAt: new Date(),
    outcome,
    comments,
    nextReviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  };

  this.history.reviews.push(review);
  this.policy.reviewDate = review.nextReviewDate;

  if (outcome === 'needs_changes') {
    this.policy.status = 'draft';
  }

  await this.save();
  
  logger.info('Retention policy reviewed', {
    policyId: this._id,
    outcome,
    nextReview: review.nextReviewDate
  });

  return this;
};

auditRetentionPolicySchema.methods.applyToAuditLogs = async function(options = {}) {
  const AuditLog = mongoose.model('AuditLog');
  
  const query = this.buildAuditLogQuery();
  const action = this.actions.onRetentionExpiry.primary;
  
  let processed = 0;
  let failed = 0;
  
  const cursor = AuditLog.find(query).cursor();
  
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      switch (action) {
        case 'delete':
          await this.deleteAuditLog(doc);
          break;
        case 'archive':
          await this.archiveAuditLog(doc);
          break;
        case 'anonymize':
          await this.anonymizeAuditLog(doc);
          break;
        default:
          logger.warn('Unknown retention action', { action });
      }
      processed++;
    } catch (error) {
      failed++;
      logger.error('Failed to process audit log for retention', {
        auditLogId: doc._id,
        error: error.message
      });
    }
    
    // Update progress
    if (processed % 100 === 0) {
      await this.updateProcessingMetrics(processed, failed);
    }
  }
  
  await this.updateProcessingMetrics(processed, failed);
  
  return { processed, failed };
};

auditRetentionPolicySchema.methods.buildAuditLogQuery = function() {
  const retentionDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
  
  const query = {
    organizationId: this.organizationId,
    createdAt: { $lte: retentionDate },
    'lifecycle.archived': { $ne: true }
  };
  
  // Apply scope filters
  if (this.scope.eventTypes?.length) {
    query['event.type'] = { $in: this.scope.eventTypes };
  }
  
  if (this.scope.severities?.length) {
    query['event.severity'] = { $in: this.scope.severities };
  }
  
  if (this.scope.dataClassifications?.length) {
    query['compliance.dataClassification'] = { $in: this.scope.dataClassifications };
  }
  
  // Apply exclusions
  if (this.scope.excludePatterns?.length) {
    query['event.type'] = { $nin: this.scope.excludePatterns };
  }
  
  return query;
};

auditRetentionPolicySchema.methods.deleteAuditLog = async function(auditLog) {
  if (this.actions.deletion.method === 'soft_delete') {
    auditLog.lifecycle.archived = true;
    auditLog.lifecycle.archivedAt = new Date();
    await auditLog.save();
  } else {
    await auditLog.remove();
  }
  
  this.monitoring.metrics.recordsDeleted++;
};

auditRetentionPolicySchema.methods.archiveAuditLog = async function(auditLog) {
  const AuditExport = mongoose.model('AuditExport');
  
  // Create export for archival
  const exportDoc = await AuditExport.createExport({
    tenantId: this.tenantId,
    organizationId: this.organizationId,
    export: {
      name: `Archive - ${this.policy.name} - ${new Date().toISOString()}`,
      type: 'compliance',
      format: 'encrypted_archive'
    },
    scope: {
      dateRange: {
        start: auditLog.createdAt,
        end: auditLog.createdAt
      }
    },
    compliance: {
      purpose: 'regulatory_compliance',
      frameworks: this.compliance.frameworks
    },
    relationships: {
      auditLogs: [auditLog._id],
      retentionPolicyId: this._id
    }
  });
  
  auditLog.lifecycle.archived = true;
  auditLog.lifecycle.archivedAt = new Date();
  auditLog.lifecycle.archiveLocation = exportDoc._id.toString();
  await auditLog.save();
  
  this.monitoring.metrics.recordsArchived++;
};

auditRetentionPolicySchema.methods.anonymizeAuditLog = async function(auditLog) {
  // Apply anonymization based on configuration
  for (const field of this.actions.anonymization.fields) {
    const value = auditLog.get(field.path);
    if (value) {
      const anonymized = this.anonymizeValue(value, field.method);
      auditLog.set(field.path, anonymized);
    }
  }
  
  auditLog.lifecycle.anonymized = true;
  auditLog.lifecycle.anonymizedAt = new Date();
  await auditLog.save();
  
  this.monitoring.metrics.recordsAnonymized++;
};

auditRetentionPolicySchema.methods.anonymizeValue = function(value, method) {
  switch (method) {
    case 'pseudonymization':
      return `ANON-${require('crypto').createHash('sha256').update(value.toString()).digest('hex').substring(0, 8)}`;
    case 'generalization':
      return value.toString().substring(0, 3) + '***';
    case 'suppression':
      return '[REDACTED]';
    case 'noise_addition':
      if (typeof value === 'number') {
        return value + (Math.random() - 0.5) * value * 0.1;
      }
      return value;
    default:
      return '[ANONYMIZED]';
  }
};

auditRetentionPolicySchema.methods.updateProcessingMetrics = async function(processed, failed) {
  this.monitoring.metrics.totalRecordsProcessed += processed;
  this.monitoring.metrics.lastUpdated = new Date();
  this.processing.schedule.lastRun = new Date();
  this.processing.schedule.nextRun = this.calculateNextRun();
  
  await this.save();
};

auditRetentionPolicySchema.methods.generateComplianceReport = async function() {
  const report = {
    policy: {
      name: this.policy.name,
      code: this.policy.code,
      status: this.policy.status,
      effectiveDate: this.policy.effectiveDate
    },
    compliance: {
      frameworks: this.compliance.frameworks,
      status: this.complianceStatus,
      certifications: this.compliance.certifications
    },
    metrics: this.monitoring.metrics,
    exceptions: {
      eventTypes: this.exceptions.eventTypes.length,
      users: this.exceptions.users.length,
      temporaryExtensions: this.exceptions.temporaryExtensions.length
    },
    lastReview: this.history.reviews[this.history.reviews.length - 1],
    generatedAt: new Date()
  };
  
  return report;
};

// ==================== Static Methods ====================
auditRetentionPolicySchema.statics.createPolicy = async function(policyData) {
  const policy = new this(policyData);
  await policy.save();
  
  logger.info('Retention policy created', {
    policyId: policy._id,
    name: policy.policy.name,
    type: policy.policy.type
  });
  
  return policy;
};

auditRetentionPolicySchema.statics.findActivePolicies = async function(organizationId) {
  const now = new Date();
  
  return await this.find({
    organizationId,
    'policy.status': 'active',
    'policy.effectiveDate': { $lte: now },
    $or: [
      { 'policy.expiryDate': { $exists: false } },
      { 'policy.expiryDate': { $gt: now } }
    ]
  }).sort({ 'policy.priority': -1 });
};

auditRetentionPolicySchema.statics.findApplicablePolicy = async function(auditLog) {
  const policies = await this.findActivePolicies(auditLog.organizationId);
  
  for (const policy of policies) {
    if (this.isPolicyApplicable(policy, auditLog)) {
      return policy;
    }
  }
  
  // Return default policy if no specific policy matches
  return policies.find(p => p.policy.type === 'global');
};

auditRetentionPolicySchema.statics.isPolicyApplicable = function(policy, auditLog) {
  const scope = policy.scope;
  
  // Check event type
  if (scope.eventTypes?.length && !scope.eventTypes.includes(auditLog.event.type)) {
    return false;
  }
  
  // Check severity
  if (scope.severities?.length && !scope.severities.includes(auditLog.event.severity)) {
    return false;
  }
  
  // Check data classification
  if (scope.dataClassifications?.length && 
      !scope.dataClassifications.includes(auditLog.compliance.dataClassification)) {
    return false;
  }
  
  // Check exclusions
  if (scope.excludePatterns?.some(pattern => 
      new RegExp(pattern).test(auditLog.event.type))) {
    return false;
  }
  
  return true;
};

auditRetentionPolicySchema.statics.processPolicies = async function() {
  const duePolicies = await this.find({
    'policy.status': 'active',
    'processing.schedule.enabled': true,
    'processing.schedule.nextRun': { $lte: new Date() }
  }).limit(10);
  
  const results = [];
  
  for (const policy of duePolicies) {
    try {
      const result = await policy.applyToAuditLogs();
      results.push({
        policyId: policy._id,
        name: policy.policy.name,
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        policyId: policy._id,
        name: policy.policy.name,
        success: false,
        error: error.message
      });
      
      logger.error('Failed to process retention policy', {
        policyId: policy._id,
        error: error.message
      });
    }
  }
  
  return results;
};

auditRetentionPolicySchema.statics.getPolicyStatistics = async function(organizationId) {
  const stats = await this.aggregate([
    {
      $match: { organizationId: mongoose.Types.ObjectId(organizationId) }
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$policy.status', 'active'] }, 1, 0] }
              },
              draft: {
                $sum: { $cond: [{ $eq: ['$policy.status', 'draft'] }, 1, 0] }
              },
              totalProcessed: { $sum: '$monitoring.metrics.totalRecordsProcessed' },
              totalDeleted: { $sum: '$monitoring.metrics.recordsDeleted' },
              totalArchived: { $sum: '$monitoring.metrics.recordsArchived' }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$policy.type',
              count: { $sum: 1 },
              recordsProcessed: { $sum: '$monitoring.metrics.totalRecordsProcessed' }
            }
          }
        ],
        byCompliance: [
          {
            $unwind: '$compliance.frameworks'
          },
          {
            $group: {
              _id: '$compliance.frameworks',
              count: { $sum: 1 }
            }
          }
        ],
        retentionPeriods: [
          {
            $group: {
              _id: {
                value: '$retention.defaultPeriod.value',
                unit: '$retention.defaultPeriod.unit'
              },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);
  
  return stats[0];
};

// Create and export model
const AuditRetentionPolicyModel = BaseModel.createModel('AuditRetentionPolicy', auditRetentionPolicySchema);

module.exports = {
  schema: auditRetentionPolicySchema,
  model: AuditRetentionPolicyModel
};